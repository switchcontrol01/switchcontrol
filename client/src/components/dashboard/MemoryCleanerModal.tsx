import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { MemoryStick, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Zap, Shield, Rocket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { playRamClear } from "@/lib/premium-audio";
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

const MODES: { id: CleanMode; label: string; desc: string; icon: typeof Shield }[] = [
  { id: "safe", label: "Safe", desc: "Gentle cleanup. Only processes using 200+ MB.", icon: Shield },
  { id: "smart", label: "Smart", desc: "Processes using 100+ MB. Good balance.", icon: Zap },
  { id: "advanced", label: "Advanced", desc: "Trims all eligible processes. Maximum reclaim.", icon: Rocket },
];

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

function AnimatedCounter({ value, duration = 800 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafId = useRef<number>(0);

  useEffect(() => {
    startTime.current = null;
    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const progress = Math.min((timestamp - startTime.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(parseFloat((eased * value).toFixed(1)));
      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate);
      }
    };
    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
  }, [value, duration]);

  return <>{display}</>;
}

export function MemoryCleanerModal({ open, onOpenChange }: MemoryCleanerModalProps) {
  const [selectedMode, setSelectedMode] = useState<CleanMode>("smart");
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<CleanResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const lockRef = useRef(false);
  const cleaningRef = useRef(false);
  const { toast } = useToast();
  const { clearRam, setStats } = useStore();

  const handleClean = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    cleaningRef.current = true;
    setCleaning(true);
    setResult(null);
    setShowDetails(false);
    playRamClear();

    const minDelay = new Promise((r) => setTimeout(r, 900));

    try {
      const api = (window as any).electronAPI;

      if (api?.memory?.clean) {
        const [res] = await Promise.all([api.memory.clean(selectedMode), minDelay]);

        if (res?.error) {
          toast({ title: "Memory clean failed", description: res.message || "An error occurred.", variant: "destructive" });
          setCleaning(false);
          cleaningRef.current = false;
          lockRef.current = false;
          return;
        }

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
      console.log("[DEBUG] CLEANING FINISHED — resetting refs");
      console.log("[DEBUG] cleaningRef was:", cleaningRef.current, "lockRef was:", lockRef.current);
      setCleaning(false);
      cleaningRef.current = false;
      lockRef.current = false;
      console.log("[DEBUG] cleaningRef now:", cleaningRef.current, "lockRef now:", lockRef.current);
    }
  };

  const handleClose = useCallback((v: boolean) => {
    if (cleaningRef.current) return;
    onOpenChange(v);
    if (!v) {
      setTimeout(() => {
        setResult(null);
        setShowDetails(false);
      }, 300);
    }
  }, [onOpenChange]);

  const stagger = {
    hidden: { opacity: 0, y: 12 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.1, type: "spring", stiffness: 300, damping: 24 },
    }),
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "bg-[#0c0c14] border-border/50 max-w-sm backdrop-blur-xl overflow-hidden",
          cleaning && "[&>button]:pointer-events-none [&>button]:opacity-0"
        )}
        data-testid="modal-memory-cleaner"
        onClick={(e) => e.stopPropagation()}
        onEscapeKeyDown={(e) => { if (cleaningRef.current) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (cleaningRef.current) e.preventDefault(); }}
        onInteractOutside={(e) => { if (cleaningRef.current) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <MemoryStick className="size-5 text-primary" />
            RAM Optimizer
          </DialogTitle>
          <DialogDescription>
            Free up memory by trimming process working sets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-1">
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
                    return (
                      <motion.button
                        key={mode.id}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06, type: "spring", stiffness: 400, damping: 28 }}
                        onClick={() => setSelectedMode(mode.id)}
                        className={cn(
                          "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                          selectedMode === mode.id
                            ? "border-primary/50 bg-primary/5"
                            : "border-border/30 bg-white/[0.02] hover:border-border/50 hover:bg-white/[0.04]"
                        )}
                        data-testid={`button-mode-${mode.id}`}
                      >
                        <ModeIcon className={cn("size-4 mt-0.5 shrink-0", selectedMode === mode.id ? "text-primary" : "text-muted-foreground")} />
                        <div>
                          <div className={cn("text-sm font-medium", selectedMode === mode.id ? "text-white" : "text-white/70")}>
                            {mode.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{mode.desc}</div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {!isElectron && (
                  <div className="flex items-center gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 mt-4">
                    <AlertTriangle className="size-3 text-amber-400 shrink-0" />
                    <span className="text-[10px] text-amber-400">Simulated in browser. Real optimization requires the desktop app.</span>
                  </div>
                )}

                <Button
                  onClick={handleClean}
                  className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 mt-4"
                  data-testid="button-start-clean"
                >
                  <Zap className="size-4 mr-2" />
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
                className="py-8 flex flex-col items-center justify-center space-y-4"
              >
                <div className="relative">
                  <Loader2 className="size-10 text-primary animate-spin" />
                  <MemoryStick className="size-4 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-white">Optimizing memory...</p>
                  <p className="text-[10px] text-muted-foreground">
                    {selectedMode === "safe" ? "Trimming large memory consumers" : selectedMode === "smart" ? "Targeting medium+ memory usage" : "Deep scan — trimming all eligible processes"}
                  </p>
                </div>
                <Progress value={65} className="h-1 w-2/3" />
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
                  className="relative p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-center space-y-1 overflow-hidden"
                >
                  <div className="absolute inset-0 rounded-lg animate-pulse opacity-30" style={{ boxShadow: "inset 0 0 40px rgba(16,185,129,0.15)" }} />
                  <CheckCircle2 className="size-6 text-emerald-400 mx-auto relative z-10" />
                  <p className="text-lg font-bold text-emerald-400 tabular-nums relative z-10" data-testid="text-mb-freed">
                    <AnimatedCounter value={result.estimated_mb_freed} /> MB
                  </p>
                  <p className="text-[10px] text-emerald-400/70 relative z-10">Estimated memory released</p>
                </motion.div>

                <motion.div custom={1} variants={stagger} className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-white/[0.03] border border-border/30 text-center">
                    <div className="text-sm font-bold text-white tabular-nums" data-testid="text-processes-trimmed">
                      <AnimatedCounter value={result.processes_trimmed} duration={600} />
                    </div>
                    <div className="text-[9px] text-muted-foreground">Processes optimized</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/[0.03] border border-border/30 text-center">
                    <div className="text-sm font-bold text-white tabular-nums" data-testid="text-processes-scanned">
                      <AnimatedCounter value={result.processes_scanned} duration={600} />
                    </div>
                    <div className="text-[9px] text-muted-foreground">Processes scanned</div>
                  </div>
                </motion.div>

                <motion.div custom={2} variants={stagger} className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                  <span>Mode: {result.mode}</span>
                  <span>{result.execution_ms}ms</span>
                </motion.div>

                {result.top_trimmed.length > 0 && (
                  <motion.div custom={3} variants={stagger}>
                    <button
                      onClick={() => setShowDetails(!showDetails)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-white/70 transition-colors w-full"
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
                                className="flex items-center justify-between p-1.5 rounded bg-white/[0.02] text-[10px]"
                              >
                                <span className="text-white/70 truncate max-w-[180px]">{p.name}</span>
                                <span className="text-emerald-400 tabular-nums font-medium shrink-0">{p.mb_freed} MB</span>
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                <motion.div custom={4} variants={stagger} className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs border-border/40 hover:bg-white/5"
                    onClick={() => { setResult(null); setShowDetails(false); }}
                    data-testid="button-clean-again"
                  >
                    Clean Again
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs border-border/40 hover:bg-white/5"
                    onClick={() => handleClose(false)}
                    data-testid="button-close-cleaner"
                  >
                    Done
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
