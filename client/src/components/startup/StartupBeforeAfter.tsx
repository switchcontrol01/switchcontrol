import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { fmtBootTime } from "./startupUtils";
import { ArrowRight, Zap, Timer } from "lucide-react";

interface Props {
  beforeMs: number;
  afterMs: number;
  visible: boolean;
}

export function StartupBeforeAfter({ beforeMs, afterMs, visible }: Props) {
  const savedMs = Math.max(0, beforeMs - afterMs);
  const savedPct = beforeMs > 0 ? Math.round((savedMs / beforeMs) * 100) : 0;
  const hasData = visible && beforeMs > 0;

  if (!hasData) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-primary/20 bg-primary/[0.03] backdrop-blur-xl p-5 space-y-4 overflow-hidden relative"
    >
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <Timer className="size-24 text-primary" />
      </div>

      <div className="relative z-10 flex items-center justify-between">
        <span className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="size-3.5" /> Projection
        </span>
        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold tabular-nums">
          -{savedPct}% TIME
        </span>
      </div>

      <div className="relative z-10 flex items-center gap-4">
        {/* Before */}
        <div className="flex-1 space-y-1.5">
          <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium">Current</div>
          <div className="text-lg text-[#E6EAF0] tabular-nums font-light">{fmtBootTime(beforeMs)}</div>
          <div className="h-1.5 rounded-full bg-black/40 overflow-hidden border border-white/[0.02]">
            <motion.div
              className="h-full rounded-full bg-orange-500/60"
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>

        <div className="mt-4">
          <ArrowRight className="size-4 text-primary/50" />
        </div>

        {/* After */}
        <div className="flex-1 space-y-1.5">
          <div className="text-[10px] text-primary/70 uppercase tracking-wide font-medium">Optimized</div>
          <div className="text-lg text-primary tabular-nums font-bold drop-shadow-md">
            {fmtBootTime(afterMs)}
          </div>
          <div className="h-1.5 rounded-full bg-black/40 overflow-hidden border border-white/[0.02]">
            <motion.div
              className="h-full rounded-full bg-primary"
              style={{ boxShadow: "0 0 8px rgba(0, 212, 255, 0.6)" }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(5, 100 - savedPct)}%` }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
