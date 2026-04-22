import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { X, CheckCircle2, AlertTriangle, SkipForward, Crown, Zap, RefreshCw, TrendingDown, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { openPricing } from "@/lib/pricing";
import type { PremiumRevertReport, RevertItemResult, PowerPlanRevertResult } from "@/lib/premiumRevertEngine";

interface PremiumRevertModalProps {
  open: boolean;
  onClose: () => void;
  report: PremiumRevertReport | null;
  onRetry?: () => void;
}

const spring = { type: "spring" as const, stiffness: 280, damping: 26, mass: 0.9 };

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1.2 }: { value: number; duration?: number }) {
  const motionVal = useMotionValue(0);
  const rounded = useTransform(motionVal, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const unsub = rounded.on("change", (v) => setDisplay(v));
    const ctrl = animate(motionVal, value, { duration, ease: "easeOut" });
    return () => { ctrl.stop(); unsub(); };
  }, [value, duration, motionVal, rounded]);

  return <span>{display}</span>;
}

// ── Circular ring graph ───────────────────────────────────────────────────────
function RingGraph({
  value,
  max,
  size = 96,
  strokeWidth = 8,
  color = "#a855f7",
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const [dash, setDash] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => setDash(circumference * pct), 120);
    return () => clearTimeout(timeout);
  }, [circumference, pct]);

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(168,85,247,0.12)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - dash}
        style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1)" }}
      />
    </svg>
  );
}

// ── Bar stat ──────────────────────────────────────────────────────────────────
function StatBar({
  label,
  value,
  max,
  color,
  delay = 0,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  delay?: number;
}) {
  const [width, setWidth] = useState(0);
  const pct = max > 0 ? (value / max) * 100 : 0;

  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 200 + delay);
    return () => clearTimeout(t);
  }, [pct, delay]);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-white/50">{label}</span>
        <span className="font-medium text-white/70">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${width}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}88` }}
        />
      </div>
    </div>
  );
}

// ── Status row ────────────────────────────────────────────────────────────────
function StatusRow({ result, index }: { result: RevertItemResult; index: number }) {
  const config = {
    reverted:           { icon: CheckCircle2, color: "text-emerald-400", glow: "rgba(52,211,153,0.15)", label: "Restored" },
    skipped_conflict:   { icon: SkipForward,  color: "text-amber-400",   glow: "rgba(251,191,36,0.15)",  label: "Skipped" },
    skipped_user_owned: { icon: SkipForward,  color: "text-zinc-400",    glow: "rgba(161,161,170,0.1)",  label: "User-owned" },
    failed:             { icon: AlertTriangle,color: "text-red-400",     glow: "rgba(248,113,113,0.15)", label: "Failed" },
  }[result.status];

  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 + index * 0.06, duration: 0.3 }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03]"
      style={{ boxShadow: `inset 0 0 0 1px ${config.glow}` }}
    >
      <Icon className={cn("size-3.5 shrink-0", config.color)} />
      <span className="flex-1 text-white/70 text-[11px] truncate">{result.label}</span>
      <span className={cn("text-[10px] font-medium shrink-0", config.color)}>{config.label}</span>
    </motion.div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function PremiumRevertModal({ open, onClose, report, onRetry }: PremiumRevertModalProps) {
  const allResults: RevertItemResult[] = [
    ...(report?.tweakResults   ?? []),
    ...(report?.networkResults ?? []),
  ];

  const revertedItems = allResults.filter(r => r.status === 'reverted');
  const conflictItems = allResults.filter(r => r.status === 'skipped_conflict');
  const failedItems   = allResults.filter(r => r.status === 'failed');
  const totalItems    = allResults.length;

  const showItems = allResults.slice(0, 6);

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
            onClick={onClose}
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

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute right-3 top-3 z-10 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                data-testid="button-close-revert-modal"
              >
                <X className="size-4 text-white/40 hover:text-white/70 transition-colors" />
              </button>

              <div className="relative z-10 p-5 space-y-4">

                {/* Icon + Title */}
                <div className="flex items-start gap-4 pr-8">
                  {/* Animated crown */}
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
                        <Crown className="size-6 text-violet-400" />
                      </motion.div>
                    </div>
                    {/* Glow under icon */}
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
                      Your trial has ended
                    </motion.h2>
                    <motion.p
                      className="text-[11px] text-white/45 leading-relaxed"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.22, duration: 0.3 }}
                    >
                      Premium optimizations have been safely reverted. Your original configuration has been restored.
                    </motion.p>
                  </div>
                </div>

                {/* Ring + Stats row */}
                {totalItems > 0 && (
                  <motion.div
                    className="flex items-center gap-4 p-3.5 rounded-xl"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                    style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.14)" }}
                  >
                    {/* Ring */}
                    <div className="relative shrink-0 flex items-center justify-center" style={{ width: 72, height: 72 }}>
                      <RingGraph value={revertedItems.length} max={totalItems} size={72} strokeWidth={7} color="#a855f7" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-lg font-bold text-white leading-none">
                          <AnimatedNumber value={revertedItems.length} />
                        </span>
                        <span className="text-[9px] text-white/40 uppercase tracking-wider mt-0.5">reverted</span>
                      </div>
                    </div>

                    {/* Bars */}
                    <div className="flex-1 space-y-2">
                      <StatBar label="Restored" value={revertedItems.length} max={totalItems} color="#a855f7" delay={0} />
                      {conflictItems.length > 0 && (
                        <StatBar label="Conflicts" value={conflictItems.length} max={totalItems} color="#f59e0b" delay={80} />
                      )}
                      {failedItems.length > 0 && (
                        <StatBar label="Failed" value={failedItems.length} max={totalItems} color="#ef4444" delay={160} />
                      )}
                      {report?.powerPlan && report.powerPlan.status === 'reverted' && (
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/70">
                          <Shield className="size-2.5" />
                          <span>Power plan restored</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Nothing to revert */}
                {totalItems === 0 && (
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

                {/* Item list (up to 6 items) */}
                {showItems.length > 0 && (
                  <div className="space-y-1 max-h-[140px] overflow-y-auto pr-0.5" style={{ scrollbarWidth: "thin" }}>
                    {showItems.map((r, i) => <StatusRow key={r.tweakId} result={r} index={i} />)}
                    {allResults.length > 6 && (
                      <p className="text-[10px] text-white/30 text-center pt-1">+ {allResults.length - 6} more</p>
                    )}
                  </div>
                )}

                {/* Conflict notice */}
                {conflictItems.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="flex items-start gap-2 p-2.5 rounded-lg text-[10px] text-amber-400/70"
                    style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)" }}
                  >
                    <SkipForward className="size-3 shrink-0 mt-0.5" />
                    <span>{conflictItems.length} setting{conflictItems.length > 1 ? 's were' : ' was'} skipped because they were changed manually.</span>
                  </motion.div>
                )}

                {/* Retry failed */}
                {failedItems.length > 0 && onRetry && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.55 }}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg"
                    style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)" }}
                  >
                    <p className="text-[10px] text-red-400/80 flex-1">
                      {failedItems.length} revert{failedItems.length > 1 ? 's' : ''} failed. Original settings may still be applied.
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
                  {/* Separator */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-white/[0.07]" />
                    <TrendingDown className="size-3 text-white/20" />
                    <div className="flex-1 h-px bg-white/[0.07]" />
                  </div>

                  <p className="text-[10px] text-white/30 text-center">Re-activate your optimizations instantly</p>

                  {/* Primary CTA */}
                  <motion.button
                    onClick={() => { openPricing(); onClose(); }}
                    data-testid="button-revert-upgrade"
                    className="relative w-full overflow-hidden rounded-xl px-4 py-3 text-sm font-semibold text-white"
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                    style={{
                      background: "linear-gradient(135deg, #7c3aed, #6d28d9, #4f46e5)",
                      boxShadow: "0 0 0 1px rgba(139,92,246,0.4), 0 8px 24px rgba(109,40,217,0.45)",
                    }}
                  >
                    {/* Shimmer effect */}
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

                  {/* Dismiss */}
                  <button
                    onClick={onClose}
                    data-testid="button-revert-dismiss"
                    className="w-full py-2 text-[11px] text-white/30 hover:text-white/50 transition-colors"
                  >
                    Continue with free plan
                  </button>
                </motion.div>

              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
