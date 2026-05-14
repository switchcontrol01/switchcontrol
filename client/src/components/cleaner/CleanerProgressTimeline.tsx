import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, FileSearch, Trash2, HardDrive, ShieldCheck } from "lucide-react";

interface Step {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: Step[] = [
  { id: "prep",    label: "Preparing",          icon: FileSearch },
  { id: "safe",    label: "Closing handles",    icon: ShieldCheck },
  { id: "remove",  label: "Removing files",     icon: Trash2 },
  { id: "verify",  label: "Verifying space",     icon: HardDrive },
  { id: "done",    label: "Done",               icon: CheckCircle2 },
];

interface Props {
  phase: "idle" | "scanning" | "cleaning" | "done";
  currentStep?: string;
  cleanProgress?: number;
}

export function CleanerProgressTimeline({ phase, currentStep, cleanProgress = 0 }: Props) {
  if (phase === "idle") return null;

  const isScan = phase === "scanning";
  const isClean = phase === "cleaning" || phase === "done";
  const done = phase === "done";

  // Map progress to active step index
  const activeIndex = isScan
    ? Math.min(Math.floor(cleanProgress * STEPS.length), STEPS.length - 1)
    : isClean
      ? STEPS.findIndex(s => s.id === currentStep)
      : -1;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-white">
          {isScan ? "Scanning system…" : done ? "Cleanup complete" : "Cleaning system…"}
        </p>
        {isClean && !done && (
          <span className="text-[10px] text-amber-400 tabular-nums">{Math.round(cleanProgress * 100)}%</span>
        )}
      </div>

      {/* Step dots */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const completed = i < activeIndex || done;
          const active = i === activeIndex && !done;

          return (
            <div key={step.id} className="flex-1 flex items-center gap-1">
              <motion.div
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-all",
                  completed
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : active
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                      : "bg-white/[0.02] border-white/[0.05] text-white/30"
                )}
                animate={active ? { scale: [1, 1.02, 1] } : {}}
                transition={{ duration: 1.2, repeat: 2 }}
              >
                {active ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Icon className="size-3" />
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </motion.div>

              {i < STEPS.length - 1 && (
                <div className={cn("flex-1 h-px rounded-full transition-all", completed ? "bg-emerald-500/30" : "bg-white/5")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", done ? "bg-emerald-500" : "bg-gradient-to-r from-amber-500 to-primary")}
          initial={{ width: 0 }}
          animate={{ width: `${done ? 100 : cleanProgress * 100}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
