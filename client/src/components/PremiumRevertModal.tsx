import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, AlertTriangle, SkipForward, RefreshCw, Cpu, Zap } from "lucide-react";
import { GlassModalSurface } from "@/components/ui/GlassModalLayout";
import { cn } from "@/lib/utils";
import type { PremiumRevertReport, RevertItemResult, PowerPlanRevertResult } from "@/lib/premiumRevertEngine";

interface PremiumRevertModalProps {
  open: boolean;
  onClose: () => void;
  report: PremiumRevertReport | null;
  onRetry?: () => void;
}

const spring = { type: "spring" as const, stiffness: 320, damping: 28, mass: 0.85 };

// ── Status row ────────────────────────────────────────────────────────────────

function StatusRow({ result }: { result: RevertItemResult }) {
  const config = {
    reverted:           { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Reverted" },
    skipped_conflict:   { icon: SkipForward,  color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",   label: "Skipped — manually changed" },
    skipped_user_owned: { icon: SkipForward,  color: "text-zinc-400",    bg: "bg-zinc-500/10 border-zinc-500/20",    label: "Skipped — user-owned" },
    failed:             { icon: AlertTriangle,color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20",     label: "Failed — retry recommended" },
  }[result.status];

  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs", config.bg)}>
      <Icon className={cn("size-3.5 shrink-0", config.color)} />
      <span className="flex-1 text-white/80 truncate">{result.label}</span>
      <span className={cn("font-medium shrink-0", config.color)}>{config.label}</span>
    </div>
  );
}

function PowerPlanRow({ result }: { result: PowerPlanRevertResult }) {
  if (result.status === 'not_applicable') return null;

  const config = {
    reverted:         { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Restored" },
    skipped_conflict: { icon: SkipForward,  color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",   label: "Skipped — manually changed" },
    failed:           { icon: AlertTriangle,color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20",     label: "Failed" },
    not_applicable:   { icon: CheckCircle2, color: "text-zinc-400",    bg: "bg-zinc-500/10 border-zinc-500/20",    label: "No changes" },
  }[result.status];

  const Icon = config.icon;
  const label = result.previousPlanName
    ? `Power plan → ${result.previousPlanName}`
    : 'Power plan';

  return (
    <div className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs", config.bg)}>
      <Cpu className={cn("size-3.5 shrink-0", config.color)} />
      <span className="flex-1 text-white/80 truncate">{label}</span>
      <span className={cn("font-medium shrink-0", config.color)}>{config.label}</span>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function PremiumRevertModal({ open, onClose, report, onRetry }: PremiumRevertModalProps) {
  const allResults: RevertItemResult[] = [
    ...(report?.tweakResults   ?? []),
    ...(report?.networkResults ?? []),
  ];

  const revertedItems  = allResults.filter(r => r.status === 'reverted');
  const conflictItems  = allResults.filter(r => r.status === 'skipped_conflict');
  const failedItems    = allResults.filter(r => r.status === 'failed');
  const hasAnything    = allResults.length > 0 || (report?.powerPlan && report.powerPlan.status !== 'not_applicable');

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed z-[101] left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md"
            initial={{ opacity: 0, scale: 0.92, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1,    x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.92,    x: "-50%", y: "-50%" }}
            transition={spring}
            data-testid="modal-premium-revert"
          >
            <GlassModalSurface>
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 z-10 p-1.5 -mr-1.5 -mt-0.5 rounded-md hover:bg-white/10 transition-colors"
                data-testid="button-close-revert-modal"
              >
                <X className="size-4 text-muted-foreground" />
              </button>

              <div className="p-5 space-y-4 relative z-10">
                {/* Header */}
                <div className="space-y-1.5 pr-8">
                  <h2 className="text-sm font-semibold text-white">
                    Your free trial has ended
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Premium optimizations applied during your trial have been reverted and your
                    original system configuration has been restored.
                  </p>
                </div>

                {/* Upgrade CTA */}
                <a
                  href="/pricing"
                  onClick={onClose}
                  className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600/80 to-indigo-600/80 hover:from-violet-500/90 hover:to-indigo-500/90 border border-violet-500/30 text-white text-xs font-medium transition-all duration-200 shadow-lg shadow-violet-900/30"
                  data-testid="button-revert-upgrade"
                >
                  <Zap className="size-3.5 shrink-0 text-yellow-300" />
                  <span className="flex-1">Upgrade to Premium — keep your optimizations active</span>
                </a>

                {/* Result breakdown */}
                {hasAnything && report && (
                  <div className="space-y-1.5">
                    {/* Reverted */}
                    {revertedItems.map(r => <StatusRow key={r.tweakId} result={r} />)}

                    {/* Power plan */}
                    {report.powerPlan && <PowerPlanRow result={report.powerPlan} />}

                    {/* Conflicts */}
                    {conflictItems.map(r => <StatusRow key={r.tweakId} result={r} />)}

                    {/* Failures */}
                    {failedItems.map(r => <StatusRow key={r.tweakId} result={r} />)}
                  </div>
                )}

                {/* Summary note when nothing needed reverting */}
                {!hasAnything && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    No premium optimizations were applied — nothing to revert.
                  </div>
                )}

                {/* Conflict notice */}
                {conflictItems.length > 0 && (
                  <p className="text-[11px] text-amber-400/80 leading-relaxed">
                    {conflictItems.length === 1
                      ? '1 setting was skipped because it was changed manually after being applied.'
                      : `${conflictItems.length} settings were skipped because they were changed manually after being applied.`}
                  </p>
                )}

                {/* Failure notice + retry */}
                {failedItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-red-400/80 leading-relaxed">
                      {failedItems.length === 1
                        ? '1 revert failed. The original setting may still be applied.'
                        : `${failedItems.length} reverts failed. Those settings may still be applied.`}
                      {' '}Retry to attempt again.
                    </p>
                    {onRetry && (
                      <button
                        onClick={onRetry}
                        data-testid="button-revert-retry"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-300 border border-red-500/25 hover:bg-red-500/20 transition-colors"
                      >
                        <RefreshCw className="size-3" /> Retry failed reverts
                      </button>
                    )}
                  </div>
                )}

                {/* Dismiss */}
                <div className="flex justify-end pt-1">
                  <button
                    onClick={onClose}
                    data-testid="button-revert-dismiss"
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.06] border border-white/[0.10] text-white/70 hover:bg-white/[0.10] hover:text-white transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </GlassModalSurface>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
