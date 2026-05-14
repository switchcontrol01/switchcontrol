/**
 * TweakImpactResult — renders the real measured delta after a tweak executes.
 *
 * Rules:
 *   • Only renders if there are real, threshold-crossing deltas from useTweakImpact.
 *   • Negative CPU/RAM deltas are improvements → shown in green/cyan.
 *   • Positive deltas → shown in amber (higher usage after the tweak).
 *   • Process count: negative = fewer background processes → green.
 *   • A "measuring…" state shows while the settle window is in progress.
 *   • If no meaningful delta was detected, this renders nothing.
 */
import { motion, AnimatePresence } from "framer-motion";
import { TrendingDown, TrendingUp, Minus, Activity, X } from "lucide-react";
import type { TweakImpactResult } from "@/hooks/useTweakImpact";
import { cn } from "@/lib/utils";

// ── Animated count-up number ─────────────────────────────────────────────────

function DeltaChip({
  value,
  unit,
  inverse = false,
}: {
  value: number;
  unit: string;
  inverse?: boolean; // true = positive delta is BAD (e.g. more RAM used)
}) {
  const isGood    = inverse ? value < 0 : value > 0;
  const isBad     = inverse ? value > 0 : value < 0;
  const isNeutral = value === 0;

  const colorClass = isNeutral
    ? "text-[#6B7380]"
    : isGood
    ? "text-emerald-400"
    : "text-amber-400";

  const bgClass = isNeutral
    ? "bg-[#21262D] border-[#2A313A]"
    : isGood
    ? "bg-emerald-500/10 border-emerald-500/20"
    : "bg-amber-500/10 border-amber-500/20";

  const Icon = isNeutral ? Minus : isGood ? TrendingDown : TrendingUp;
  const absVal = Math.abs(value);
  const sign   = value > 0 ? "+" : "−";

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border", colorClass, bgClass)}>
      <Icon className="size-2.5 shrink-0" />
      {sign}{absVal}{unit}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  tweakId: string;
  result:  TweakImpactResult | null;
  measuring: boolean;
  onDismiss: () => void;
}

export function TweakImpactResult({ result, measuring, onDismiss }: Props) {
  return (
    <AnimatePresence>
      {(measuring || result) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="mx-4 mb-3 px-3 py-2 rounded-lg border border-cyan-500/15 bg-cyan-500/5 flex items-center gap-2.5">
            <Activity className="size-3.5 text-cyan-400 shrink-0" />

            {measuring && (
              <span className="text-[11px] text-[#6B7380] flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-cyan-400/60 animate-pulse inline-block" />
                Measuring impact…
              </span>
            )}

            {!measuring && result && result.summary.length > 0 && (
              <>
                <span className="text-[10px] text-[#6B7380] shrink-0">Measured</span>
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {result.deltas.cpuPct !== undefined && (
                    <DeltaChip value={result.deltas.cpuPct} unit="% CPU" inverse />
                  )}
                  {result.deltas.ramUsedMb !== undefined && (
                    <DeltaChip value={result.deltas.ramUsedMb} unit=" MB RAM" inverse />
                  )}
                  {result.deltas.processCount !== undefined && (
                    <DeltaChip value={result.deltas.processCount} unit=" proc" inverse />
                  )}
                </div>
                <button
                  onClick={onDismiss}
                  className="text-[#6B7380]/50 hover:text-[#A0A8B3] transition-colors shrink-0"
                  title="Dismiss"
                >
                  <X className="size-3" />
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
