import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { MemoryStick, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Zap, Shield, Rocket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { playRamClear } from "@/lib/premium-audio";
import { useStore } from "@/lib/store";

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

export function MemoryCleanerModal({ open, onOpenChange }: MemoryCleanerModalProps) {
  const [selectedMode, setSelectedMode] = useState<CleanMode>("smart");
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<CleanResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const lockRef = useRef(false);
  const { toast } = useToast();
  const { clearRam, setStats } = useStore();

  const handleClean = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
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
        const { stats } = useStore.getState();
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
      lockRef.current = false;
    }
  };

  const handleClose = (v: boolean) => {
    if (cleaning) return;
    onOpenChange(v);
    if (!v) {
      setTimeout(() => {
        setResult(null);
        setShowDetails(false);
      }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn("bg-[#0c0c14] border-border/50 max-w-sm backdrop-blur-xl", cleaning && "[&>button]:hidden")}
        data-testid="modal-memory-cleaner"
        onClick={(e) => e.stopPropagation()}
        onEscapeKeyDown={(e) => { if (cleaning) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (cleaning) e.preventDefault(); }}
        onInteractOutside={(e) => { if (cleaning) e.preventDefault(); }}
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
          {!cleaning && !result && (
            <>
              <div className="space-y-2">
                {MODES.map((mode) => {
                  const ModeIcon = mode.icon;
                  return (
                    <button
                      key={mode.id}
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
                    </button>
                  );
                })}
              </div>

              {!isElectron && (
                <div className="flex items-center gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="size-3 text-amber-400 shrink-0" />
                  <span className="text-[10px] text-amber-400">Simulated in browser. Real optimization requires the desktop app.</span>
                </div>
              )}

              <Button
                onClick={handleClean}
                className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
                data-testid="button-start-clean"
              >
                <Zap className="size-4 mr-2" />
                Optimize Memory
              </Button>
            </>
          )}

          {cleaning && (
            <div className="py-8 flex flex-col items-center justify-center space-y-4">
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
            </div>
          )}

          {result && !cleaning && (
            <div className="space-y-3 animate-in fade-in duration-500">
              <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-center space-y-1">
                <CheckCircle2 className="size-6 text-emerald-400 mx-auto" />
                <p className="text-lg font-bold text-emerald-400 tabular-nums" data-testid="text-mb-freed">
                  {result.estimated_mb_freed} MB
                </p>
                <p className="text-[10px] text-emerald-400/70">Estimated memory released</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-white/[0.03] border border-border/30 text-center">
                  <div className="text-sm font-bold text-white tabular-nums" data-testid="text-processes-trimmed">{result.processes_trimmed}</div>
                  <div className="text-[9px] text-muted-foreground">Processes optimized</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white/[0.03] border border-border/30 text-center">
                  <div className="text-sm font-bold text-white tabular-nums" data-testid="text-processes-scanned">{result.processes_scanned}</div>
                  <div className="text-[9px] text-muted-foreground">Processes scanned</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                <span>Mode: {result.mode}</span>
                <span>{result.execution_ms}ms</span>
              </div>

              {result.top_trimmed.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-white/70 transition-colors w-full"
                    data-testid="button-toggle-details"
                  >
                    {showDetails ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    {showDetails ? "Hide details" : "Show details"}
                  </button>
                  {showDetails && (
                    <div className="mt-2 space-y-1 animate-in fade-in duration-300">
                      {result.top_trimmed.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-1.5 rounded bg-white/[0.02] text-[10px]">
                          <span className="text-white/70 truncate max-w-[180px]">{p.name}</span>
                          <span className="text-emerald-400 tabular-nums font-medium shrink-0">{p.mb_freed} MB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
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
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
