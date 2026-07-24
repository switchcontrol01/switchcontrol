import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { X, CheckCircle2, AlertTriangle, SkipForward, Crown, Zap, RefreshCw, TrendingDown, Shield, AlertCircle, Loader2, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { openPricing } from "@/lib/pricing";
import type { PremiumRevertReport, RevertItemResult, PowerPlanRevertResult, RevertPhase } from "@/lib/premiumRevertEngine";
import type { RevertReason } from "@/stores/trialExpiryStore";

interface PremiumRevertModalProps {
  open: boolean;
  onClose: () => void;
  report: PremiumRevertReport | null;
  onRetry?: () => void;
  reason?: RevertReason;
  /** Current engine phase — non-null while the engine is running, 'complete' when done. */
  phase?: RevertPhase | null;
}

const spring = { type: "spring" as const, stiffness: 280, damping: 26, mass: 0.9 };

/* ── Copy by reason ─────────────────────────────────────────────────────────── */

const REVERT_COPY: Record<NonNullable<RevertReason>, { title: string; subtitle: string; dismiss: string }> = {
  trial_expired: {
    title:    "Your trial has ended",
    subtitle: "Premium optimizations have been safely reverted. Your original configuration has been restored.",
    dismiss:  "Continue with free plan",
  },
  admin_downgrade: {
    title:    "Premium access removed",
    subtitle: "Premium optimizations have been safely reverted. Your original configuration has been restored.",
    dismiss:  "Continue with free plan",
  },
  subscription_cancelled: {
    title:    "Premium access ended",
    subtitle: "Premium optimizations have been safely reverted. Your original configuration has been restored.",
    dismiss:  "Continue with free plan",
  },
  payment_failed: {
    title:    "Premium payment issue",
    subtitle: "Premium optimizations have been safely reverted. Your original configuration has been restored.",
    dismiss:  "Continue with free plan",
  },
  device_denied: {
    title:    "Premium is active, but this device is not authorized",
    subtitle: "Premium optimizations have been safely reverted. Your original configuration has been restored.",
    dismiss:  "Continue with free plan",
  },
  premium_removed: {
    title:    "Premium access removed",
    subtitle: "Premium optimizations have been safely reverted. Your original configuration has been restored.",
    dismiss:  "Continue with free plan",
  },
};

// ── Phase ordering + labels ───────────────────────────────────────────────────

const REVERT_STEPS: Array<{ phase: RevertPhase; label: string; detail: string }> = [
  { phase: 'locking',               label: 'Locking premium access',     detail: 'Suppressing premium gates' },
  { phase: 'reverting_tweaks',      label: 'Reverting tweaks',           detail: 'Restoring registry & services' },
  { phase: 'reverting_sliders',     label: 'Restoring slider settings',  detail: 'Registry values & system timers' },
  { phase: 'reverting_presets',     label: 'Restoring preset profiles',  detail: 'IRQ, I/O & GPU driver profiles' },
  { phase: 'reverting_network',     label: 'Restoring network settings', detail: 'TCP/IP, DNS, NIC properties' },
  { phase: 'reverting_extreme_labs',label: 'Restoring Extreme Labs',     detail: 'Scheduler, latency & NIC tuning' },
  { phase: 'verifying',             label: 'Verifying & cleanup',        detail: 'Power plan + final checks' },
];

const PHASE_INDEX: Record<RevertPhase, number> = {
  locking:                0,
  reverting_tweaks:       1,
  reverting_sliders:      2,
  reverting_presets:      3,
  reverting_network:      4,
  reverting_extreme_labs: 5,
  verifying:              6,
  complete:               7,
};

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1.2 }: { value: number; duration?: number }) {
  const motionVal = useMotionValue(0);
  const rounded   = useTransform(motionVal, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const unsub = rounded.on("change", (v) => setDisplay(v));
    const ctrl  = animate(motionVal, value, { duration, ease: "easeOut" });
    return () => { ctrl.stop(); unsub(); };
  }, [value, duration, motionVal, rounded]);

  return <span>{display}</span>;
}

// ── Circular ring graph ───────────────────────────────────────────────────────
function RingGraph({
  value, max, size = 96, strokeWidth = 8, color = "#00D4FF",
}: { value: number; max: number; size?: number; strokeWidth?: number; color?: string }) {
  const radius       = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct          = max > 0 ? Math.min(value / max, 1) : 0;
  const [dash, setDash] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => setDash(circumference * pct), 120);
    return () => clearTimeout(timeout);
  }, [circumference, pct]);

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(168,85,247,0.12)" strokeWidth={strokeWidth} />
      <circle
        cx={size/2} cy={size/2} r={radius} fill="none" stroke={color}
        strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference - dash}
        style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1)" }}
      />
    </svg>
  );
}

// ── Bar stat ──────────────────────────────────────────────────────────────────
function StatBar({ label, value, max, color, delay = 0 }: { label: string; value: number; max: number; color: string; delay?: number }) {
  const [width, setWidth] = useState(0);
  const pct = max > 0 ? (value / max) * 100 : 0;
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 200 + delay);
    return () => clearTimeout(t);
  }, [pct, delay]);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-[#A0A8B3]">{label}</span>
        <span className="font-medium text-[#E6EAF0]">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[#21262D] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${width}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}88` }}
        />
      </div>
    </div>
  );
}

// ── Status row ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  reverted:           { icon: CheckCircle2, color: "text-emerald-400", glow: "rgba(52,211,153,0.15)",  label: "Restored"        },
  skipped_conflict:   { icon: SkipForward,  color: "text-amber-400",   glow: "rgba(251,191,36,0.15)", label: "Skipped (changed)" },
  skipped_user_owned: { icon: SkipForward,  color: "text-zinc-400",    glow: "rgba(161,161,170,0.1)", label: "User-owned"       },
  skipped_not_active: { icon: SkipForward,  color: "text-zinc-500",    glow: "rgba(113,113,122,0.08)",label: "Not active"       },
  failed:             { icon: AlertTriangle,color: "text-red-400",     glow: "rgba(248,113,113,0.15)",label: "Failed"           },
} as const;

function StatusRow({ result, index }: { result: RevertItemResult; index: number }) {
  const config = STATUS_CONFIG[result.status];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 + index * 0.06, duration: 0.3 }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#2A313A] bg-[#1A1F26]"
      style={{ boxShadow: `inset 0 0 0 1px ${config.glow}` }}
    >
      <Icon className={cn("size-3.5 shrink-0", config.color)} />
      <span className="flex-1 text-[#E6EAF0] text-[11px] truncate">{result.label}</span>
      <span className={cn("text-[10px] font-medium shrink-0", config.color)}>{config.label}</span>
    </motion.div>
  );
}

// ── Power plan result row ─────────────────────────────────────────────────────

function PowerPlanRow({ result, delay = 0 }: { result: PowerPlanRevertResult; delay?: number }) {
  if (result.status === 'not_applicable') return null;
  const activeName   = result.verifiedActiveName;
  const plansDeleted = result.plansDeleted ?? 0;
  const verifiedClean = result.verifiedClean ?? false;

  const configs = {
    reverted: {
      icon: CheckCircle2, color: "text-emerald-400", glow: "rgba(52,211,153,0.15)",
      label: "Power plan restored",
      detail: activeName ? `Active: "${activeName}"` : result.previousPlanName ? `Restored to "${result.previousPlanName}"` : "Restored to previous plan",
    },
    forced_balanced: {
      icon: AlertCircle, color: "text-amber-400", glow: "rgba(251,191,36,0.15)",
      label: "Reverted to Windows Balanced",
      detail: activeName ? `Active: "${activeName}"` : result.appliedPlanName ? `Removed "${result.appliedPlanName}"` : "Premium plan removed",
    },
    skipped_not_sc: {
      icon: Shield, color: "text-emerald-400/70", glow: "rgba(52,211,153,0.10)",
      label: "Power plan already clean",
      detail: "No SwitchControl plan was active",
    },
    failed: {
      icon: AlertTriangle, color: "text-red-400", glow: "rgba(248,113,113,0.15)",
      label: "Power plan revert failed",
      detail: result.reason ?? "Could not remove premium power plan",
    },
  };

  const cfg = configs[result.status];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-[#2A313A] bg-[#1A1F26]"
      style={{ boxShadow: `inset 0 0 0 1px ${cfg.glow}` }}
    >
      <Icon className={cn("size-3.5 shrink-0 mt-0.5", cfg.color)} />
      <div className="flex-1 min-w-0">
        <div className={cn("text-[11px] font-medium truncate", cfg.color)}>{cfg.label}</div>
        <div className="text-[10px] text-[#6B7380] truncate mt-0.5">{cfg.detail}</div>
        {(plansDeleted > 0 || verifiedClean) && (
          <div className="flex items-center gap-2 mt-1">
            {plansDeleted > 0 && (
              <span className="text-[9px] text-[#6B7380]">
                {plansDeleted} plan{plansDeleted !== 1 ? 's' : ''} removed from Power Options
              </span>
            )}
            {verifiedClean && (
              <span className="text-[9px] text-emerald-400/60 flex items-center gap-0.5">
                <CheckCircle2 className="size-2.5" /> verified clean
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, count, color = "text-[#6B7380]" }: { label: string; count: number; color?: string }) {
  if (count === 0) return null;
  return (
    <div className={cn("text-[10px] uppercase tracking-widest font-medium px-1 pt-1", color)}>
      {label} <span className="opacity-60">({count})</span>
    </div>
  );
}

// ── Live progress view ────────────────────────────────────────────────────────

function RevertProgressView({ phase, reason }: { phase: RevertPhase; reason?: RevertReason }) {
  const currentIdx = PHASE_INDEX[phase] ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4 pr-8">
        <motion.div
          className="shrink-0 relative"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.1, ...spring }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))", border: "1px solid rgba(139,92,246,0.35)" }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className="size-6 text-[#00D4FF]" />
            </motion.div>
          </div>
          <div
            className="absolute -inset-1 rounded-xl -z-10 blur-md opacity-40"
            style={{ background: "radial-gradient(circle, rgba(139,92,246,0.6), transparent)" }}
          />
        </motion.div>
        <div className="space-y-0.5">
          <motion.h2
            className="text-base font-semibold leading-snug"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.35 }}
            style={{ background: "linear-gradient(135deg, #e2d9f3, #c4b5fd, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            Reverting premium settings…
          </motion.h2>
          <motion.p
            className="text-[11px] text-[#A0A8B3] leading-relaxed"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.3 }}
          >
            Restoring your system to its original state. Please wait — do not close the app.
          </motion.p>
        </div>
      </div>

      {/* Step list */}
      <motion.div
        className="space-y-1.5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.35 }}
      >
        {REVERT_STEPS.map((step, i) => {
          const isDone    = currentIdx > i;
          const isActive  = currentIdx === i;
          const isPending = currentIdx < i;

          return (
            <motion.div
              key={step.phase}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.05, duration: 0.25 }}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-500",
                isDone    && "border-emerald-500/20 bg-emerald-500/[0.04]",
                isActive  && "border-[#00D4FF]/25 bg-[#00D4FF]/[0.05]",
                isPending && "border-[#21262D] bg-transparent opacity-40",
              )}
            >
              {/* Status icon */}
              <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                {isDone ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <CheckCircle2 className="size-4 text-emerald-400" />
                  </motion.div>
                ) : isActive ? (
                  <motion.div
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <div className="size-2.5 rounded-full bg-[#00D4FF]" />
                  </motion.div>
                ) : (
                  <div className="size-2 rounded-full bg-[#2A313A]" />
                )}
              </div>

              {/* Labels */}
              <div className="flex-1 min-w-0">
                <div className={cn(
                  "text-[11px] font-medium",
                  isDone    && "text-emerald-300/80",
                  isActive  && "text-[#E6EAF0]",
                  isPending && "text-[#6B7380]",
                )}>
                  {step.label}
                </div>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="text-[9px] text-[#00D4FF]/60 mt-0.5"
                  >
                    {step.detail}
                  </motion.div>
                )}
              </div>

              {/* Active shimmer */}
              {isActive && (
                <div className="relative overflow-hidden rounded-md h-1 w-16 bg-[#1E2530] shrink-0">
                  <motion.div
                    className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-[#00D4FF]/60 to-transparent"
                    animate={{ x: ["-100%", "300%"] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Notice */}
      <motion.p
        className="text-[10px] text-[#4B5563] text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        Each step is verified and retried up to 3× before marking as failed.
      </motion.p>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function PremiumRevertModal({ open, onClose, report, onRetry, reason, phase }: PremiumRevertModalProps) {
  // Use loose != null to also exclude undefined — phase is an optional prop so
  // it defaults to undefined, not null. `phase !== null` would let undefined
  // through and show the results view before any report exists.
  const isRunning = open && report === null && phase != null && phase !== 'complete';
  // Block close during the brief window between phase='complete' and report being
  // populated — isRunning is false at that point but the modal isn't ready yet.
  const canClose = !isRunning && !(phase === 'complete' && report === null);

  // Trap ESC while the engine is running so a keyboard shortcut can't close the
  // modal mid-revert (which would leave the system in a partially-reverted state).
  // Must be declared after isRunning so the dependency array evaluates correctly.
  useEffect(() => {
    if (!isRunning) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') e.stopPropagation(); };
    window.addEventListener('keydown', handler, /* capture */ true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isRunning]);

  const tweakResults       = report?.tweakResults       ?? [];
  const sliderResults      = report?.sliderResults      ?? [];
  const presetResults      = report?.presetResults      ?? [];
  const networkResults     = report?.networkResults     ?? [];
  const extremeLabsResults = report?.extremeLabsResults ?? [];

  const revertedTweaks  = tweakResults.filter(r => r.status === 'reverted');
  const failedTweaks    = tweakResults.filter(r => r.status === 'failed');
  const conflictTweaks  = tweakResults.filter(r => r.status === 'skipped_conflict');

  const revertedSliders = sliderResults.filter(r => r.status === 'reverted');
  const failedSliders   = sliderResults.filter(r => r.status === 'failed');

  const revertedPresets = presetResults.filter(r => r.status === 'reverted');
  const failedPresets   = presetResults.filter(r => r.status === 'failed');

  const revertedNet = networkResults.filter(r => r.status === 'reverted');
  const failedNet   = networkResults.filter(r => r.status === 'failed');
  const conflictNet = networkResults.filter(r => r.status === 'skipped_conflict');

  const revertedEL = extremeLabsResults.filter(r => r.status === 'reverted');
  const failedEL   = extremeLabsResults.filter(r => r.status === 'failed');

  const powerPlan         = report?.powerPlan;
  const powerPlanHandled  = powerPlan && powerPlan.status !== 'not_applicable';
  const powerPlanReverted = powerPlan?.status === 'reverted' || powerPlan?.status === 'forced_balanced';

  const totalItemCount =
    tweakResults.length +
    sliderResults.length +
    presetResults.length +
    networkResults.length +
    extremeLabsResults.length +
    (powerPlanHandled ? 1 : 0);

  const revertedItemCount =
    revertedTweaks.length +
    revertedSliders.length +
    revertedPresets.length +
    revertedNet.length +
    revertedEL.length +
    (powerPlanReverted ? 1 : 0);

  const conflictCount = conflictTweaks.length + conflictNet.length;
  const failedCount   = failedTweaks.length + failedSliders.length + failedPresets.length + failedNet.length + failedEL.length + (powerPlan?.status === 'failed' ? 1 : 0);

  const hasTweakItems      = tweakResults.length > 0;
  const hasSliderItems     = sliderResults.length > 0;
  const hasPresetItems     = presetResults.length > 0;
  const hasNetworkItems    = networkResults.length > 0;
  const hasExtremeLabItems = extremeLabsResults.length > 0;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[100]"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={canClose ? onClose : undefined}
          />

          {/* Card */}
          <motion.div
            className="fixed z-[101] left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-[420px]"
            initial={{ opacity: 0, scale: 0.88, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.88, x: "-50%", y: "-50%" }}
            transition={spring}
            data-testid="modal-premium-revert"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Outer glow */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                boxShadow: "0 0 0 1px rgba(139,92,246,0.25), 0 0 60px rgba(109,40,217,0.35), 0 32px 64px rgba(0,0,0,0.6)",
              }}
            />

            {/* Card surface */}
            <div
              className="relative rounded-2xl overflow-hidden"
              style={{
                background: "linear-gradient(160deg, rgba(15,10,26,0.98) 0%, rgba(10,8,20,0.99) 100%)",
                border: "1px solid rgba(139,92,246,0.2)",
              }}
            >
              {/* Ambient orbs */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                <motion.div
                  className="absolute -top-12 -left-12 w-48 h-48 rounded-full"
                  style={{ background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)" }}
                  animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute -bottom-8 -right-8 w-40 h-40 rounded-full"
                  style={{ background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)" }}
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                />
              </div>

              {/* Header gradient bar */}
              <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.8), rgba(99,102,241,0.8), transparent)" }}
              />

              {/* Close button — hidden while engine is running or report not yet ready */}
              {canClose && (
                <button
                  onClick={onClose}
                  className="absolute right-3 top-3 z-20 p-1.5 rounded-lg hover:bg-[#2A313A] transition-colors"
                  data-testid="button-close-revert-modal"
                >
                  <X className="size-4 text-[#6B7380] hover:text-[#E6EAF0] transition-colors" />
                </button>
              )}

              <div className="relative z-10 p-5 space-y-4">

                {/* ── Running state — animated progress phases ── */}
                {isRunning && phase ? (
                  <RevertProgressView phase={phase} reason={reason} />
                ) : (

                /* ── Results state ── */
                <>
                  {/* Icon + Title */}
                  <div className="flex items-start gap-4 pr-8">
                    <motion.div
                      className="shrink-0 relative"
                      initial={{ scale: 0, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: 0.1, ...spring }}
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))", border: "1px solid rgba(139,92,246,0.35)" }}
                      >
                        <motion.div
                          animate={{ opacity: [0.7, 1, 0.7] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <Crown className="size-6 text-[#00D4FF]" />
                        </motion.div>
                      </div>
                      <div
                        className="absolute -inset-1 rounded-xl -z-10 blur-md opacity-40"
                        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.6), transparent)" }}
                      />
                    </motion.div>

                    <div className="space-y-0.5">
                      <motion.h2
                        className="text-base font-semibold leading-snug"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.35 }}
                        style={{ background: "linear-gradient(135deg, #e2d9f3, #c4b5fd, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                      >
                        {REVERT_COPY[reason ?? "premium_removed"].title}
                      </motion.h2>
                      <motion.p
                        className="text-[11px] text-[#A0A8B3] leading-relaxed"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.22, duration: 0.3 }}
                      >
                        {REVERT_COPY[reason ?? "premium_removed"].subtitle}
                      </motion.p>
                    </div>
                  </div>

                  {/* Ring + Stats row */}
                  {totalItemCount > 0 && (
                    <motion.div
                      className="flex items-center gap-4 p-3.5 rounded-xl"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.4 }}
                      style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.14)" }}
                    >
                      <div className="relative shrink-0 flex items-center justify-center" style={{ width: 72, height: 72 }}>
                        <RingGraph value={revertedItemCount} max={totalItemCount} size={72} strokeWidth={7} color="#00D4FF" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-lg font-bold text-[#E6EAF0] leading-none">
                            <AnimatedNumber value={revertedItemCount} />
                          </span>
                          <span className="text-[9px] text-[#6B7380] uppercase tracking-wider mt-0.5">reverted</span>
                        </div>
                      </div>

                      <div className="flex-1 space-y-2">
                        <StatBar label="Restored" value={revertedItemCount} max={totalItemCount} color="#00D4FF" delay={0} />
                        {conflictCount > 0 && (
                          <StatBar label="Conflicts" value={conflictCount} max={totalItemCount} color="#f59e0b" delay={80} />
                        )}
                        {failedCount > 0 && (
                          <StatBar label="Failed" value={failedCount} max={totalItemCount} color="#ef4444" delay={160} />
                        )}
                        {powerPlan?.status === 'forced_balanced' && (
                          <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80">
                            <AlertCircle className="size-2.5" />
                            <span>Power plan force-reverted to Balanced</span>
                          </div>
                        )}
                        {powerPlan?.status === 'reverted' && (
                          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/70">
                            <Shield className="size-2.5" />
                            <span>Power plan restored</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Nothing to revert */}
                  {totalItemCount === 0 && (
                    <motion.div
                      className="flex items-center gap-2.5 p-3 rounded-xl"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.25 }}
                      style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)" }}
                    >
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                      <p className="text-[11px] text-emerald-300/80">No premium optimizations were active — nothing needed reverting.</p>
                    </motion.div>
                  )}

                  {/* Item list — grouped by category */}
                  {(tweakResults.length > 0 || sliderResults.length > 0 || presetResults.length > 0 || networkResults.length > 0 || extremeLabsResults.length > 0 || powerPlanHandled) && (
                    <div className="space-y-1 max-h-[220px] overflow-y-auto pr-0.5" style={{ scrollbarWidth: "thin" }}>

                      {hasTweakItems && (
                        <>
                          <SectionHeader label="Tweaks" count={tweakResults.length} />
                          {tweakResults.slice(0, 4).map((r, i) => <StatusRow key={r.tweakId} result={r} index={i} />)}
                        </>
                      )}

                      {hasSliderItems && (
                        <>
                          <SectionHeader label="Slider Settings" count={sliderResults.length} />
                          {sliderResults.slice(0, 4).map((r, i) => <StatusRow key={r.tweakId} result={r} index={i} />)}
                        </>
                      )}

                      {hasPresetItems && (
                        <>
                          <SectionHeader label="Preset Profiles" count={presetResults.length} />
                          {presetResults.slice(0, 4).map((r, i) => <StatusRow key={r.tweakId} result={r} index={i} />)}
                        </>
                      )}

                      {hasNetworkItems && (
                        <>
                          <SectionHeader label="Network Tweaks" count={networkResults.length} />
                          {networkResults.slice(0, 4).map((r, i) => <StatusRow key={r.tweakId} result={r} index={i} />)}
                        </>
                      )}

                      {hasExtremeLabItems && (
                        <>
                          <SectionHeader label="Extreme Labs" count={extremeLabsResults.length} color="text-violet-400/60" />
                          {extremeLabsResults.slice(0, 4).map((r, i) => (
                            <motion.div
                              key={r.tweakId}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.4 + i * 0.06, duration: 0.3 }}
                              className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#2A313A] bg-[#1A1F26]"
                              style={{ boxShadow: r.status === 'reverted' ? "inset 0 0 0 1px rgba(139,92,246,0.12)" : "inset 0 0 0 1px rgba(248,113,113,0.12)" }}
                            >
                              {r.status === 'reverted' ? (
                                <FlaskConical className="size-3.5 shrink-0 text-violet-400" />
                              ) : (
                                <AlertTriangle className="size-3.5 shrink-0 text-red-400" />
                              )}
                              <span className="flex-1 text-[#E6EAF0] text-[11px] truncate">{r.label}</span>
                              <span className={cn("text-[10px] font-medium shrink-0", r.status === 'reverted' ? "text-violet-400" : "text-red-400")}>
                                {r.status === 'reverted' ? 'Restored' : 'Failed'}
                              </span>
                            </motion.div>
                          ))}
                        </>
                      )}

                      {powerPlanHandled && (
                        <>
                          <SectionHeader label="Power Plan" count={1} />
                          <PowerPlanRow
                            result={powerPlan!}
                            delay={Math.min(
                              0.4 + (tweakResults.length + sliderResults.length + presetResults.length + networkResults.length + extremeLabsResults.length) * 0.06,
                              1.2, // cap so the row never animates in more than 1.2s after modal opens
                            )}
                          />
                        </>
                      )}

                      {/* 5 sections × 4 items each = 20 max visible; threshold was 12 which
                          fired even when all items were actually shown across the sections. */}
                      {(tweakResults.length + sliderResults.length + presetResults.length + networkResults.length + extremeLabsResults.length) > 20 && (
                        <p className="text-[10px] text-[#6B7380] text-center pt-1">
                          + {tweakResults.length + sliderResults.length + presetResults.length + networkResults.length + extremeLabsResults.length - 20} more
                        </p>
                      )}
                    </div>
                  )}

                  {/* Forced Balanced notice */}
                  {powerPlan?.status === 'forced_balanced' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="flex items-start gap-2 p-2.5 rounded-lg text-[10px] text-amber-400/80"
                      style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)" }}
                    >
                      <AlertCircle className="size-3 shrink-0 mt-0.5" />
                      <span>
                        {powerPlan.appliedPlanName ? `"${powerPlan.appliedPlanName}" was removed. ` : "Premium power plan was removed. "}
                        {powerPlan.reason ?? "Reverted to Windows Balanced — your original plan could not be confirmed."}
                      </span>
                    </motion.div>
                  )}

                  {/* Conflict notice */}
                  {conflictCount > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="flex items-start gap-2 p-2.5 rounded-lg text-[10px] text-amber-400/70"
                      style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)" }}
                    >
                      <SkipForward className="size-3 shrink-0 mt-0.5" />
                      <span>{conflictCount} setting{conflictCount > 1 ? 's were' : ' was'} skipped because they were changed manually after the app applied them.</span>
                    </motion.div>
                  )}

                  {/* Retry failed */}
                  {(failedCount > 0 || powerPlan?.status === 'failed') && onRetry && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.55 }}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg"
                      style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)" }}
                    >
                      <p className="text-[10px] text-red-400/80 flex-1">
                        {failedCount + (powerPlan?.status === 'failed' ? 1 : 0)} revert{failedCount + (powerPlan?.status === 'failed' ? 1 : 0) > 1 ? 's' : ''} failed — original settings may still be active.
                      </p>
                      <button
                        onClick={onRetry}
                        data-testid="button-revert-retry"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium text-red-300 border border-red-500/20 hover:bg-red-500/15 transition-colors shrink-0"
                      >
                        <RefreshCw className="size-2.5" /> Retry
                      </button>
                    </motion.div>
                  )}

                  {/* Upgrade CTA */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="space-y-2 pt-1"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-[#21262D]" />
                      <TrendingDown className="size-3 text-[#6B7380]/50" />
                      <div className="flex-1 h-px bg-[#21262D]" />
                    </div>

                    <p className="text-[10px] text-[#6B7380] text-center">Re-activate your optimizations instantly</p>

                    <motion.button
                      onClick={() => { openPricing(); onClose(); }}
                      data-testid="button-revert-upgrade"
                      className="relative w-full overflow-hidden rounded-xl px-4 py-3 text-sm font-semibold text-[#E6EAF0]"
                      whileHover={{ scale: 1.015 }}
                      whileTap={{ scale: 0.985 }}
                      style={{
                        background: "linear-gradient(135deg, #00D4FF, #33E0FF, #2A313A)",
                        boxShadow: "0 0 0 1px rgba(0,212,255,0.4), 0 8px 24px rgba(0,212,255,0.25)",
                      }}
                    >
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)" }}
                        animate={{ x: ["-100%", "200%"] }}
                        transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }}
                      />
                      <span className="relative flex items-center justify-center gap-2">
                        <Zap className="size-4 text-yellow-300" />
                        Upgrade to Premium
                      </span>
                    </motion.button>

                    <button
                      onClick={onClose}
                      data-testid="button-revert-dismiss"
                      className="w-full py-2 text-[11px] text-[#6B7380] hover:text-[#A0A8B3] transition-colors"
                    >
                      {REVERT_COPY[reason ?? "premium_removed"].dismiss}
                    </button>
                  </motion.div>
                </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
