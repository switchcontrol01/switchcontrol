import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useMotion } from "@/lib/motionTokens";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { useAdvisorStore } from "@/stores/advisorStore";
import { computeSystemState, computeInterference } from "@/lib/systemStateEngine";

// ── Glow color for dot ────────────────────────────────────────────────────────

const DOT_GLOW: Record<string, string> = {
  "bg-emerald-500": "0 0 6px rgba(52,211,153,0.8), 0 0 12px rgba(52,211,153,0.3)",
  "bg-amber-500":   "0 0 6px rgba(251,191,36,0.8), 0 0 12px rgba(251,191,36,0.3)",
  "bg-amber-400":   "0 0 6px rgba(251,191,36,0.7)",
  "bg-red-500":     "0 0 6px rgba(239,68,68,0.8),  0 0 12px rgba(239,68,68,0.3)",
  "bg-white/30":    "none",
};

const INTERFERENCE_CHIP: Record<string, string> = {
  low:    "text-emerald-400 border-emerald-500/25 bg-emerald-500/8",
  medium: "text-amber-400  border-amber-500/25  bg-amber-500/8",
  high:   "text-red-400    border-red-500/25    bg-red-500/8",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SystemStateBar() {
  const { telemetry, spikes } = useLiveTelemetry();
  const { report } = useAdvisorStore();
  const { prefersReducedMotion } = useMotion();

  const state = computeSystemState(telemetry, spikes, report?.score ?? null);
  const interference = computeInterference(telemetry);

  return (
    <motion.div
      data-testid="bar-system-state"
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025]"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Pulsing status dot */}
      <motion.span
        className={cn("w-2 h-2 rounded-full shrink-0", state.dotColor)}
        style={{ boxShadow: DOT_GLOW[state.dotColor] ?? "none" }}
        animate={prefersReducedMotion ? {} : { opacity: [1, 0.35, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* State label */}
      <AnimatePresence mode="wait">
        <motion.span
          key={state.label}
          className={cn("text-xs font-semibold shrink-0", state.colorClass)}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
          data-testid="text-system-state-label"
        >
          {state.label}
        </motion.span>
      </AnimatePresence>

      <span className="text-white/20 text-xs shrink-0 select-none">·</span>

      {/* Sublabel — truncated */}
      <AnimatePresence mode="wait">
        <motion.span
          key={state.sublabel}
          className="text-[11px] text-muted-foreground min-w-0 truncate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
          data-testid="text-system-state-sublabel"
        >
          {state.sublabel}
        </motion.span>
      </AnimatePresence>

      {/* Interference chip — right side */}
      <div className="ml-auto shrink-0 flex items-center gap-1.5">
        <AnimatePresence mode="wait">
          <motion.span
            key={interference.level}
            className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full border",
              INTERFERENCE_CHIP[interference.level]
            )}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            data-testid="text-interference-level"
          >
            {interference.label}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
