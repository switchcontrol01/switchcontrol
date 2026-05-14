import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GlassModalLayout, HwBadge } from "@/components/ui/GlassModalLayout";
import { cn } from "@/lib/utils";
import { MemoryStick, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Zap, Shield, Rocket, Sparkles, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";

type CleanMode = "safe" | "smart" | "advanced";

interface CleanResult {
  mode: string;
  processes_scanned: number;
  processes_trimmed: number;
  estimated_mb_freed: number;
  top_trimmed: Array<{ name: string; pid: number; mb_freed: number }>;
  execution_ms: number;
  errors_count: number;
  error?: boolean;
  message?: string;
}

interface MemoryCleanerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MODES: { id: CleanMode; label: string; desc: string; detail: string; icon: typeof Shield; recommended?: boolean }[] = [
  { id: "safe", label: "Safe", desc: "Gentle cleanup", detail: "Only trims processes using 200+ MB. Zero risk of affecting active applications.", icon: Shield },
  { id: "smart", label: "Smart", desc: "Balanced optimization", detail: "Targets processes using 100+ MB. Best balance of performance gain and stability.", icon: Zap, recommended: true },
  { id: "advanced", label: "Deep Clean", desc: "Maximum reclaim", detail: "Aggressively trims all eligible processes. May briefly slow some apps as they reload.", icon: Rocket },
];

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

function AnimatedCounter({ value, duration = 800 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafId = useRef<number>(0);

  const animateRef = useRef<(timestamp: number) => void>();
  animateRef.current = (timestamp: number) => {
    if (!startTime.current) startTime.current = timestamp;
    const progress = Math.min((timestamp - startTime.current) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    setDisplay(parseFloat((eased * value).toFixed(1)));
    if (progress < 1) {
      rafId.current = requestAnimationFrame(animateRef.current!);
    }
  };

  if (display === 0 && value > 0) {
    startTime.current = null;
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(animateRef.current);
  }

  return <>{display}</>;
}

function AnimatedProgress({ cleaning }: { cleaning: boolean }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"scanning" | "trimming" | "finalizing">("scanning");

  useEffect(() => {
    if (!cleaning) {
      setProgress(0);
      setPhase("scanning");
      return;
    }

    const stages = [
      { target: 35, duration: 400, phase: "scanning" as const },
      { target: 70, duration: 500, phase: "trimming" as const },
      { target: 92, duration: 600, phase: "finalizing" as const },
    ];

    let timeout: NodeJS.Timeout;
    let elapsed = 0;

    stages.forEach((stage) => {
      timeout = setTimeout(() => {
        setPhase(stage.phase);
        setProgress(stage.target);
      }, elapsed);
      elapsed += stage.duration;
    });

    return () => clearTimeout(timeout);
  }, [cleaning]);

  const phaseLabel = {
    scanning: "Scanning processes...",
    trimming: "Trimming working sets...",
    finalizing: "Reclaiming memory...",
  };

  return (
    <div className="space-y-2 w-full">
      <div className="h-1.5 rounded-full bg-[#21262D] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground text-center">{phaseLabel[phase]}</p>
    </div>
  );
}

export function MemoryCleanerModal({ open, onOpenChange }: MemoryCleanerModalProps) {
  const [selectedMode, setSelectedMode] = useState<CleanMode>("smart");
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<CleanResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();
  const { clearRam, setStats } = useStore();

  const handleClean = async () => {
    if (cleaning) return;
    setCleaning(true);
    setResult(null);
    setShowDetails(false);

    const minDelay = new Promise((r) => setTimeout(r, 1200));

    try {
      const api = (window as any).electronAPI;
      console.log(`[MemoryCleaner] mode selected: ${selectedMode}`);

      if (api?.memory?.clean) {
        const [rawRes] = await Promise.all([api.memory.clean(selectedMode), minDelay]);
        console.log('[MemoryCleaner] raw result from electronAPI.memory.clean:', JSON.stringify(rawRes));

        if (!rawRes || typeof rawRes !== 'object') {
          console.warn('[MemoryCleaner] validation fail: result is not an object', rawRes);
          toast({ title: "Memory clean failed", description: "Native helper returned invalid data.", variant: "destructive" });
          return;
        }

        if (rawRes.error) {
          console.warn('[MemoryCleaner] helper returned error:', rawRes.message);
          if (rawRes.helperMissing) {
            toast({
              title: "Memory cleaner unavailable",
              description: rawRes.message || "Please reinstall SwitchControl to restore this feature.",
              variant: "destructive",
            });
          } else {
            toast({ title: "Memory clean failed", description: rawRes.message || "An error occurred.", variant: "destructive" });
          }
          return;
        }

        const res: CleanResult = {
          mode: typeof rawRes.mode === 'string' ? rawRes.mode : selectedMode,
          processes_scanned: Number.isFinite(rawRes.processes_scanned) ? rawRes.processes_scanned : 0,
          processes_trimmed: Number.isFinite(rawRes.processes_trimmed) ? rawRes.processes_trimmed : 0,
          estimated_mb_freed: Number.isFinite(rawRes.estimated_mb_freed) ? rawRes.estimated_mb_freed : 0,
          top_trimmed: Array.isArray(rawRes.top_trimmed) ? rawRes.top_trimmed : [],
          execution_ms: Number.isFinite(rawRes.execution_ms) ? rawRes.execution_ms : 0,
          errors_count: Number.isFinite(rawRes.errors_count) ? rawRes.errors_count : 0,
        };

        setResult(res);

        if (res.estimated_mb_freed > 0) {
          const freedGb = res.estimated_mb_freed / 1024;
          const { stats } = useStore.getState();
          const currentUsed = typeof stats.usedRamGb === "number" && Number.isFinite(stats.usedRamGb) ? stats.usedRamGb : 0;
          const newUsed = Math.max(1.0, currentUsed - freedGb);
          setStats({ usedRamGb: parseFloat(newUsed.toFixed(1)) });
        }
      } else {
        await minDelay;
        clearRam();
        const faked: CleanResult = {
          mode: selectedMode,
          processes_scanned: Math.floor(Math.random() * 80) + 120,
          processes_trimmed: Math.floor(Math.random() * 15) + 5,
          estimated_mb_freed: parseFloat((Math.random() * 400 + 100).toFixed(1)),
          top_trimmed: [],
          execution_ms: Math.floor(Math.random() * 200) + 100,
          errors_count: 0,
        };
        setResult(faked);
      }
    } catch (err: any) {
      toast({ title: "Memory clean failed", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (cleaning) return;
    onOpenChange(next);
    if (!next) {
      setTimeout(() => {
        setResult(null);
        setShowDetails(false);
      }, 300);
    }
  };

  const stagger = {
    hidden: { opacity: 0, y: 12 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.1, type: "spring", stiffness: 300, damping: 24 },
    }),
  };

  return (
    <GlassModalLayout
      open={open}
      onOpenChange={handleOpenChange}
      blocked={cleaning}
      title={
        <>
          <HwBadge color="fuchsia"><MemoryStick className="size-3.5 text-[#F59E0B]" /></HwBadge>
          RAM Optimizer
        </>
      }
      description="Reclaim memory by trimming idle process working sets."
      testId="modal-memory-cleaner"
    >
      <div className="space-y-4">
        <AnimatePresence mode="wait">
          {!cleaning && !result && (
            <motion.div
              key="selector"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="space-y-2">
                {MODES.map((mode, i) => {
                  const ModeIcon = mode.icon;
                  const active = selectedMode === mode.id;
                  return (
                    <motion.button
                      key={mode.id}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06, type: "spring", stiffness: 400, damping: 28 }}
                      onClick={() => setSelectedMode(mode.id)}
                      disabled={cleaning}
                      className={cn(
                        "w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all relative overflow-hidden",
                        active
                          ? "border-primary/40 bg-primary/[0.06]"
                          : "border-[#2A313A] bg-[#1A1F26] hover:border-[#2A313A] hover:bg-[#21262D]"
                      )}
                      data-testid={`button-mode-${mode.id}`}
                    >
                      <div className={cn(
                        "p-1.5 rounded-lg shrink-0 mt-0.5",
                        active ? "bg-primary/15" : "bg-[#21262D]"
                      )}>
                        <ModeIcon className={cn("size-3.5", active ? "text-primary" : "text-[#6B7380]")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-sm font-medium", active ? "text-[#E6EAF0]" : "text-[#E6EAF0]")}>
                            {mode.label}
                          </span>
                          {mode.recommended && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{mode.detail}</p>
                      </div>
                      {active && (
                        <motion.div
                          layoutId="mode-indicator"
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary"
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {!isElectron && (
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/15 mt-4">
                  <AlertTriangle className="size-3 text-amber-400/70 shrink-0" />
                  <span className="text-[10px] text-amber-400/70">Simulated in browser. Real optimization requires the desktop app.</span>
                </div>
              )}

              <Button
                onClick={handleClean}
                disabled={cleaning}
                className="w-full mt-4 h-10 bg-gradient-to-r from-primary/20 to-primary/10 hover:from-primary/30 hover:to-primary/20 text-primary border border-primary/20 rounded-xl transition-all"
                data-testid="button-start-clean"
              >
                <Sparkles className="size-4 mr-2" />
                Optimize Memory
              </Button>
            </motion.div>
          )}

          {cleaning && (
            <motion.div
              key="cleaning"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="py-10 flex flex-col items-center justify-center space-y-5"
            >
              <div className="relative">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={{
                    boxShadow: [
                      "0 0 0 0 rgba(0,212,255,0)",
                      "0 0 30px 10px rgba(0,212,255,0.15)",
                      "0 0 0 0 rgba(0,212,255,0)",
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  style={{ width: 56, height: 56, top: -4, left: -4 }}
                />
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <Loader2 className="size-12 text-primary/30 animate-spin" style={{ animationDuration: "2s" }} />
                  <MemoryStick className="size-5 text-primary absolute" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-[#E6EAF0]">Optimizing memory</p>
                <p className="text-[10px] text-muted-foreground">
                  {selectedMode === "safe" ? "Safe mode — large consumers only" : selectedMode === "smart" ? "Smart mode — balanced optimization" : "Deep clean — maximum reclaim"}
                </p>
              </div>
              <div className="w-2/3">
                <AnimatedProgress cleaning={cleaning} />
              </div>
            </motion.div>
          )}

          {result && !cleaning && (
            <motion.div
              key="results"
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <motion.div
                custom={0}
                variants={stagger}
                className="relative p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] text-center space-y-1.5 overflow-hidden"
              >
                <motion.div
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(16,185,129,0.08) 0%, transparent 70%)" }}
                />
                <CheckCircle2 className="size-7 text-emerald-400 mx-auto relative z-10" />
                <p className="text-2xl font-bold text-emerald-400 tabular-nums relative z-10" data-testid="text-mb-freed">
                  <AnimatedCounter value={result.estimated_mb_freed} /> MB
                </p>
                <p className="text-[10px] text-emerald-400/60 relative z-10">Memory reclaimed</p>
              </motion.div>

              <motion.div custom={1} variants={stagger} className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-[#1A1F26] border border-[#2A313A] text-center">
                  <div className="text-sm font-bold text-[#E6EAF0] tabular-nums" data-testid="text-processes-trimmed">
                    <AnimatedCounter value={result.processes_trimmed} duration={600} />
                  </div>
                  <div className="text-[9px] text-muted-foreground">Optimized</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#1A1F26] border border-[#2A313A] text-center">
                  <div className="text-sm font-bold text-[#E6EAF0] tabular-nums" data-testid="text-processes-scanned">
                    <AnimatedCounter value={result.processes_scanned} duration={600} />
                  </div>
                  <div className="text-[9px] text-muted-foreground">Scanned</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#1A1F26] border border-[#2A313A] text-center">
                  <div className="text-sm font-bold text-[#E6EAF0] tabular-nums">
                    {result.execution_ms}ms
                  </div>
                  <div className="text-[9px] text-muted-foreground">Duration</div>
                </div>
              </motion.div>

              {result.top_trimmed.length > 0 && (
                <motion.div custom={2} variants={stagger}>
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-[#E6EAF0] transition-colors w-full"
                    data-testid="button-toggle-details"
                  >
                    {showDetails ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    {showDetails ? "Hide details" : "Show details"}
                  </button>
                  <AnimatePresence>
                    {showDetails && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 28 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 space-y-1">
                          {result.top_trimmed.map((p, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 28 }}
                              className="flex items-center justify-between p-2 rounded-lg bg-[#1A1F26] border border-[#2A313A] text-[10px]"
                            >
                              <span className="text-[#A0A8B3] truncate max-w-[180px]">{p.name}</span>
                              <span className="text-emerald-400 tabular-nums font-medium shrink-0">{p.mb_freed} MB</span>
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              <motion.div custom={3} variants={stagger} className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs border-[#2A313A] hover:bg-[#21262D] rounded-xl"
                  onClick={() => { setResult(null); setShowDetails(false); }}
                  data-testid="button-clean-again"
                >
                  <RotateCcw className="size-3 mr-1.5" />
                  Again
                </Button>
                <Button
                  size="sm"
                  className="flex-1 text-xs bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20 rounded-xl"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-close-cleaner"
                >
                  Done
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassModalLayout>
  );
}
