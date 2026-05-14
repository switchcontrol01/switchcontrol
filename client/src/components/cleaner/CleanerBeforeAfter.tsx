import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { fmtBytes } from "@/hooks/useCountUp";
import { ArrowRight, HardDrive, Sparkles } from "lucide-react";

interface Props {
  beforeBytes: number;
  afterBytes: number;
  removedBytes: number;
  visible: boolean;
}

export function CleanerBeforeAfter({ beforeBytes, afterBytes, removedBytes, visible }: Props) {
  const hasData = beforeBytes > 0 && visible;
  const pct = beforeBytes > 0 ? Math.round((removedBytes / beforeBytes) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          Cleanup Impact
        </h3>
        {hasData && (
          <span className="text-[10px] text-emerald-400 font-medium">
            {pct}% of junk will be removed
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {/* Before bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground/60 flex items-center gap-1">
              <HardDrive className="size-3" /> Before
            </span>
            <span className="text-white/70 tabular-nums">{hasData ? fmtBytes(beforeBytes) : "—"}</span>
          </div>
          <div className="h-3 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-red-500/40"
              initial={{ width: 0 }}
              animate={hasData ? { width: "100%" } : { width: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* Arrow */}
        {hasData && (
          <motion.div
            className="flex justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <ArrowRight className="size-3 text-muted-foreground/30 rotate-90" />
          </motion.div>
        )}

        {/* After bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground/60 flex items-center gap-1">
              <Sparkles className="size-3 text-emerald-400" /> After
            </span>
            <span className="text-emerald-400 font-medium tabular-nums">
              {hasData ? fmtBytes(afterBytes) : "—"}
            </span>
          </div>
          <div className="h-3 rounded-full bg-white/5 overflow-hidden relative">
            <motion.div
              className="h-full rounded-full bg-emerald-500/50"
              initial={{ width: 0 }}
              animate={hasData ? { width: `${Math.max(5, 100 - pct)}%` } : { width: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
            {/* Glow overlay when significant removal */}
            {hasData && pct > 30 && (
              <motion.div
                className="absolute inset-0 rounded-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.3, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                style={{ boxShadow: "inset 0 0 12px rgba(52,211,153,0.3)" }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
