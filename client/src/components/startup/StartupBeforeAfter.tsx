import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { fmtBootTime } from "./startupUtils";
import { ArrowRight, Zap } from "lucide-react";

interface Props {
  beforeMs: number;
  afterMs: number;
  visible: boolean;
}

export function StartupBeforeAfter({ beforeMs, afterMs, visible }: Props) {
  const savedMs = Math.max(0, beforeMs - afterMs);
  const savedPct = beforeMs > 0 ? Math.round((savedMs / beforeMs) * 100) : 0;
  const hasData = visible && beforeMs > 0;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Zap className="size-3.5 text-primary" />
          Boot Time Impact
        </span>
        {hasData && (
          <span className="text-[10px] text-emerald-400 font-medium">{savedPct}% faster</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Before */}
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground/50">Before</span>
            <span className="text-white/70 tabular-nums">{hasData ? fmtBootTime(beforeMs) : "—"}</span>
          </div>
          <div className="h-3 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-orange-500/40"
              initial={{ width: 0 }}
              animate={hasData ? { width: "100%" } : { width: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* Arrow */}
        {hasData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <ArrowRight className="size-3 text-muted-foreground/30" />
          </motion.div>
        )}

        {/* After */}
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground/50">After</span>
            <span className="text-emerald-400 font-medium tabular-nums">
              {hasData ? fmtBootTime(afterMs) : "—"}
            </span>
          </div>
          <div className="h-3 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-emerald-500/50"
              initial={{ width: 0 }}
              animate={hasData ? { width: `${Math.max(5, 100 - savedPct)}%` } : { width: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
