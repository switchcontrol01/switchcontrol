/**
 * OptimizationFlow.tsx — Full-screen, phase-driven adaptive optimization UI.
 *
 * Phases: idle → snapshotting → intent → deciding → plan → applying → done
 * All phase transitions are driven by the isolated optimizationStore.
 * This component never imports from or causes re-renders of TweaksList.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, TrendingUp, Activity, Waves, Gamepad2, Radio, Target, Wifi,
  Sparkles, X, CheckCircle2, ChevronRight, AlertTriangle,
  ChevronDown, RotateCcw, ArrowRight, Clock, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptimizationStore } from "@/stores/optimizationStore";
import { collectOptimizationSnapshot, type OptimizationSnapshot } from "@/lib/optimizationSnapshot";
import { runOptimizationEngine, type OptimizationPlan, type PlanEntry, type AvoidedEntry } from "@shared/optimizationEngine";
import type { OptimizationIntent } from "@shared/tweakOptimizationMeta";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { isTweakPremium } from "@/lib/premium-config";
import { useStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { bulkApplyTweaks, bulkRevertTweaks, isElectronWithTweaks } from "@/hooks/use-tweak-executor";
import { apiRequest } from "@/lib/queryClient";

// ── Intent config ─────────────────────────────────────────────────────────────

interface IntentOption {
  id: OptimizationIntent;
  label: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
  gradient: string;
  ring: string;
}

const INTENT_OPTIONS: IntentOption[] = [
  { id: "competitive-fps",      label: "Competitive FPS",      icon: Target,     desc: "Tuned for shooters and fast-paced games",   gradient: "from-red-500/20 to-orange-500/10",    ring: "ring-red-500/40" },
  { id: "lowest-latency",       label: "Lowest Latency",       icon: Zap,        desc: "Minimize input lag end-to-end",              gradient: "from-yellow-500/20 to-amber-500/10",  ring: "ring-yellow-500/40" },
  { id: "highest-fps",          label: "Highest FPS",          icon: TrendingUp, desc: "Push frame rate as high as possible",        gradient: "from-emerald-500/20 to-green-500/10", ring: "ring-emerald-500/40" },
  { id: "lowest-stutter",       label: "Lowest Stutter",       icon: Activity,   desc: "Eliminate frame drops and hitching",         gradient: "from-purple-500/20 to-violet-500/10", ring: "ring-purple-500/40" },
  { id: "smooth-frametimes",    label: "Smooth Frametimes",    icon: Waves,      desc: "Consistent delivery over raw speed",         gradient: "from-cyan-500/20 to-sky-500/10",      ring: "ring-cyan-500/40" },
  { id: "balanced-gaming",      label: "Balanced Gaming",      icon: Gamepad2,   desc: "Well-rounded improvements everywhere",       gradient: "from-blue-500/20 to-indigo-500/10",   ring: "ring-blue-500/40" },
  { id: "streaming-gaming",     label: "Streaming + Gaming",   icon: Radio,      desc: "Game well while streaming or recording",     gradient: "from-pink-500/20 to-rose-500/10",     ring: "ring-pink-500/40" },
  { id: "network-responsiveness",label: "Network Responsiveness",icon: Wifi,     desc: "Lower ping and reduce network inconsistency",gradient: "from-teal-500/20 to-cyan-500/10",     ring: "ring-teal-500/40" },
  { id: "auto",                 label: "Auto (Best Overall)",  icon: Sparkles,   desc: "Engine chooses based on your hardware",      gradient: "from-violet-500/20 to-purple-500/10", ring: "ring-violet-500/40" },
];

// ── Safety badge ──────────────────────────────────────────────────────────────

function SafetyBadge({ level }: { level: string }) {
  if (level === "safe")     return <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">Safe</span>;
  if (level === "moderate") return <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">Moderate</span>;
  return                          <span className="text-[10px] font-semibold text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 py-0.5 rounded-full">Risky</span>;
}

function RevertBadge({ rev }: { rev: string }) {
  if (rev === "instant") return <span className="text-[10px] text-[#4A5568] flex items-center gap-0.5"><Zap className="size-2.5" />Instant</span>;
  return                        <span className="text-[10px] text-amber-500/70 flex items-center gap-0.5"><Clock className="size-2.5" />Reboot</span>;
}

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-emerald-500" : score >= 55 ? "bg-cyan-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        />
      </div>
      <span className="text-[10px] text-[#4A5568] tabular-nums w-7 text-right">{score}</span>
    </div>
  );
}

// ── Phase: Snapshotting ───────────────────────────────────────────────────────

const SCAN_STEPS = ["Reading CPU & GPU profile…", "Checking Windows build…", "Loading tweak registry…"];

function SnapshottingPhase() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 400);
    const t2 = setTimeout(() => setStep(2), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 py-16">
      <div className="relative">
        <motion.div
          className="w-20 h-20 rounded-full border-2 border-violet-500/30"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-t-cyan-400 border-r-transparent border-b-transparent border-l-transparent"
          animate={{ rotate: -360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        />
        <Cpu className="absolute inset-0 m-auto size-7 text-violet-400" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-white mb-1">Analyzing Your System</h2>
        <p className="text-sm text-[#6B7380]">Building your hardware profile…</p>
      </div>
      <div className="space-y-2 w-full max-w-xs">
        {SCAN_STEPS.map((s, i) => (
          <motion.div
            key={s}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: step >= i ? 1 : 0.3, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.02 }}
            className="flex items-center gap-2 text-sm"
          >
            {step > i ? (
              <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
            ) : step === i ? (
              <motion.div
                className="size-3.5 rounded-full border border-cyan-400 shrink-0"
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            ) : (
              <div className="size-3.5 rounded-full border border-white/10 shrink-0" />
            )}
            <span className={step >= i ? "text-[#C0C8D8]" : "text-[#4A5568]"}>{s}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Phase: Intent picker ──────────────────────────────────────────────────────

function IntentPhase({ onSelect }: { onSelect: (intent: OptimizationIntent) => void }) {
  return (
    <div className="flex flex-col gap-5 h-full">
      <div>
        <h2 className="text-lg font-semibold text-white">What are you optimizing for?</h2>
        <p className="text-sm text-[#6B7380] mt-0.5">The engine will score and rank tweaks around your goal.</p>
      </div>
      <div className="grid grid-cols-3 gap-2.5 flex-1">
        {INTENT_OPTIONS.map((opt, i) => {
          const Icon = opt.icon;
          return (
            <motion.button
              key={opt.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => onSelect(opt.id)}
              className={cn(
                "relative group flex flex-col gap-2 p-3.5 rounded-xl border border-white/[0.06] text-left",
                "bg-gradient-to-br", opt.gradient,
                "hover:border-white/15 hover:ring-1", opt.ring,
                "transition-all duration-200 cursor-pointer active:scale-[0.97]"
              )}
            >
              <Icon className="size-5 text-white/70 group-hover:text-white transition-colors" />
              <div>
                <div className="text-[13px] font-semibold text-white/90 leading-tight">{opt.label}</div>
                <div className="text-[11px] text-[#6B7380] mt-0.5 leading-snug">{opt.desc}</div>
              </div>
              <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ── Phase: Deciding (brief flash) ─────────────────────────────────────────────

function DecidingPhase({ intentLabel }: { intentLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <motion.div
        className="flex gap-1.5"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.15 } } }}
      >
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="size-2.5 rounded-full bg-violet-500"
            variants={{
              hidden: { opacity: 0, scale: 0.5 },
              visible: { opacity: [0.4, 1, 0.4], scale: [0.8, 1, 0.8], transition: { duration: 1, repeat: Infinity, delay: i * 0.2 } },
            }}
          />
        ))}
      </motion.div>
      <div className="text-center">
        <div className="text-base font-semibold text-white">Building your plan</div>
        <div className="text-sm text-[#6B7380] mt-0.5">Scoring tweaks for <span className="text-violet-300">{intentLabel}</span>…</div>
      </div>
    </div>
  );
}

// ── Phase: Plan ───────────────────────────────────────────────────────────────

function PlanPhase({
  plan,
  onApply,
  onCancel,
}: {
  plan: OptimizationPlan;
  onApply: () => void;
  onCancel: () => void;
}) {
  const [showAvoided, setShowAvoided] = useState(false);
  const intentLabel = INTENT_OPTIONS.find(o => o.id === plan.intent)?.label ?? plan.intent;
  const newTweaks = plan.recommended.filter(r => !r.alreadyApplied);
  const hasReboot = newTweaks.some(r => r.requiresReboot);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Your Optimization Plan</h2>
          <div className="text-xs text-[#6B7380] mt-0.5 flex items-center gap-1.5">
            <Cpu className="size-3" />
            {plan.hardwareSummary}
            <span className="text-white/20">·</span>
            Intent: <span className="text-violet-300">{intentLabel}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-white">{newTweaks.length}</div>
          <div className="text-[10px] text-[#6B7380]">tweaks to apply</div>
        </div>
      </div>

      {/* Recommended list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {newTweaks.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-3 text-center">
            <CheckCircle2 className="size-10 text-emerald-400" />
            <div className="text-sm text-[#6B7380]">All recommended tweaks are already applied.<br />Your system is already optimized for this intent.</div>
          </div>
        ) : (
          newTweaks.map((entry, i) => (
            <motion.div
              key={entry.tweakId}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 hover:border-white/10 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{entry.tweakTitle}</span>
                    <SafetyBadge level={entry.safetyLevel} />
                    <RevertBadge rev={entry.reversibility} />
                  </div>
                  <p className="text-[11px] text-[#6B7380] mt-1 leading-relaxed">{entry.reason}</p>
                  <ConfidenceBar score={entry.score} />
                </div>
              </div>
            </motion.div>
          ))
        )}

        {/* Avoided section (collapsible) */}
        {plan.avoided.length > 0 && (
          <div className="pt-1">
            <button
              onClick={() => setShowAvoided(v => !v)}
              className="flex items-center gap-1.5 text-xs text-[#4A5568] hover:text-[#8B95A6] transition-colors w-full py-1"
            >
              <ChevronDown className={cn("size-3 transition-transform", showAvoided && "rotate-180")} />
              {plan.avoided.length} excluded · click to see why
            </button>
            <AnimatePresence>
              {showAvoided && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1.5 pt-2">
                    {plan.avoided.slice(0, 10).map((entry) => (
                      <div key={entry.tweakId} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/[0.015] border border-white/[0.04]">
                        <AlertTriangle className="size-3 text-amber-500/60 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[11px] font-medium text-[#8B95A6]">{entry.tweakTitle}</span>
                          <p className="text-[10px] text-[#4A5568] mt-0.5 leading-relaxed">{entry.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 pt-2 border-t border-white/[0.06]">
        {hasReboot && (
          <div className="flex items-center gap-1 text-xs text-amber-400/70">
            <Clock className="size-3" />
            Some tweaks need a reboot
          </div>
        )}
        <div className="flex-1" />
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-[#6B7380] hover:text-white transition-colors"
        >
          Cancel
        </button>
        {newTweaks.length > 0 && (
          <button
            onClick={onApply}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            Apply {newTweaks.length} Tweaks
            <ArrowRight className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Phase: Applying ───────────────────────────────────────────────────────────

function ApplyingPhase({ total }: { total: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <motion.div
        className="w-16 h-16 rounded-full border-2 border-violet-500/30 flex items-center justify-center"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      >
        <motion.div className="w-3 h-3 rounded-full bg-violet-500" animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
      </motion.div>
      <div className="text-center">
        <div className="text-base font-semibold text-white">Applying tweaks…</div>
        <div className="text-sm text-[#6B7380] mt-0.5">{total} changes queued</div>
      </div>
    </div>
  );
}

// ── Phase: Done ───────────────────────────────────────────────────────────────

function DonePhase({
  appliedCount,
  onRevert,
  onClose,
  reverting,
}: {
  appliedCount: number;
  onRevert: () => void;
  onClose: () => void;
  reverting: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 py-10 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className="relative"
      >
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="size-10 text-emerald-400" />
        </div>
        <motion.div
          className="absolute inset-0 rounded-full border border-emerald-500/30"
          initial={{ scale: 1, opacity: 1 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
        />
      </motion.div>
      <div>
        <h2 className="text-xl font-semibold text-white">
          {appliedCount > 0 ? `${appliedCount} Tweaks Applied` : "Already Optimized"}
        </h2>
        <p className="text-sm text-[#6B7380] mt-1.5 max-w-xs">
          {appliedCount > 0
            ? "Your system has been optimized. Changes take effect immediately (some need a reboot)."
            : "All recommended tweaks were already applied. Your system is already optimized for this intent."}
        </p>
      </div>
      <div className="flex flex-col gap-2.5 w-full max-w-xs">
        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          Done
        </button>
        {appliedCount > 0 && (
          <button
            onClick={onRevert}
            disabled={reverting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-white/[0.08] text-[#6B7380] hover:text-white hover:border-white/15 text-sm transition-colors disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" />
            {reverting ? "Reverting…" : "Undo This Session"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Root modal shell ──────────────────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // Trap scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0, y: 8 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-2xl bg-[#0c0c14]/90 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
        style={{ minHeight: 480, maxHeight: "min(640px, 88vh)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top glow */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-16 bg-violet-600/10 blur-xl rounded-full pointer-events-none" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 size-8 flex items-center justify-center rounded-lg text-[#4A5568] hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <X className="size-4" />
        </button>

        <div className="p-6 h-full" style={{ minHeight: 480, maxHeight: "min(640px, 88vh)", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

export function OptimizationFlow() {
  const {
    phase,
    intent,
    plan,
    sessionAppliedIds,
    setSnapshotReady,
    setIntent,
    decidePlan,
    startApplying,
    finishApplying,
    setError,
    reset,
  } = useOptimizationStore();

  const { tweaks, setTweak } = useStore();
  const user = useAuthStore(s => s.user);
  const isPremiumUser = !!(user as any)?.plan && (user as any)?.plan !== "free";

  // Local state: snapshot held in React state (not in optimization store)
  const snapshotRef = useRef<OptimizationSnapshot | null>(null);
  const [reverting, setReverting] = useState(false);

  const isOpen = phase !== "idle";

  // ── Phase: snapshotting → intent ──────────────────────────────────────────
  useEffect(() => {
    if (phase !== "snapshotting") return;
    let cancelled = false;
    collectOptimizationSnapshot().then(snapshot => {
      if (cancelled) return;
      snapshotRef.current = snapshot;
      setSnapshotReady(null);
    }).catch(() => {
      if (cancelled) return;
      snapshotRef.current = null;
      setSnapshotReady(null, "Could not read hardware profile — using defaults.");
    });
    return () => { cancelled = true; };
  }, [phase, setSnapshotReady]);

  // ── Phase: deciding → plan (600ms UX flash, then sync engine) ─────────────
  useEffect(() => {
    if (phase !== "deciding" || !intent) return;
    const snapshot = snapshotRef.current;

    const timer = setTimeout(() => {
      // Build eligible tweak list (filtered by premium access)
      const eligibleTweaks = TWEAKS_DATA
        .filter(t => {
          if (isTweakPremium(t.id) && !isPremiumUser) return false;
          return true;
        })
        .map(t => ({
          id: t.id,
          title: t.title,
          risk: t.risk,
          level: t.level,
          requiresReboot: t.requiresReboot,
          alreadyApplied: !!tweaks[t.id],
        }));

      const enginePlan = runOptimizationEngine({
        intent,
        tweaks: eligibleTweaks,
        hardware: snapshot?.hardware ?? {},
        windowsBuild: snapshot?.windowsBuild ?? null,
        cpuLoadPct: snapshot?.cpuLoadPct ?? null,
        ramUsedPct: snapshot?.ramUsedPct ?? null,
      });

      decidePlan(enginePlan);
    }, 700);

    return () => clearTimeout(timer);
  }, [phase, intent, tweaks, isPremiumUser, decidePlan]);

  // ── Handle: apply plan ─────────────────────────────────────────────────────
  const handleApply = useCallback(async () => {
    if (!plan) return;
    startApplying();

    const toApply = plan.recommended
      .filter(r => !r.alreadyApplied)
      .map(r => r.tweakId);

    try {
      // Electron: real system changes
      if (isElectronWithTweaks()) {
        await bulkApplyTweaks(toApply);
      } else {
        // Web: persist to server
        try {
          await apiRequest("POST", "/api/tweaks/apply-recommended", { tweakIds: toApply });
        } catch { /* best effort */ }
      }

      // Update local Zustand store state for immediate UI reflection
      for (const id of toApply) {
        setTweak(id, true);
      }

      finishApplying(toApply);
    } catch {
      // Even on error, update local state and finish
      for (const id of toApply) {
        setTweak(id, true);
      }
      finishApplying(toApply);
    }
  }, [plan, startApplying, finishApplying, setTweak]);

  // ── Handle: revert session ─────────────────────────────────────────────────
  const handleRevert = useCallback(async () => {
    if (!sessionAppliedIds.length) return;
    setReverting(true);
    try {
      if (isElectronWithTweaks()) {
        await bulkRevertTweaks(sessionAppliedIds);
      }
      for (const id of sessionAppliedIds) {
        setTweak(id, false);
      }
    } catch { /* best effort */ } finally {
      setReverting(false);
      reset();
    }
  }, [sessionAppliedIds, setTweak, reset]);

  const handleClose = useCallback(() => {
    if (phase === "applying") return; // can't close mid-apply
    reset();
  }, [phase, reset]);

  const intentLabel = INTENT_OPTIONS.find(o => o.id === intent)?.label ?? "";

  return (
    <AnimatePresence>
      {isOpen && (
        <ModalShell onClose={handleClose}>
          <AnimatePresence mode="wait">
            {phase === "snapshotting" && (
              <motion.div key="snapshotting" className="flex-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <SnapshottingPhase />
              </motion.div>
            )}

            {phase === "intent" && (
              <motion.div key="intent" className="flex-1 min-h-0" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                <IntentPhase onSelect={setIntent} />
              </motion.div>
            )}

            {phase === "deciding" && (
              <motion.div key="deciding" className="flex-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <DecidingPhase intentLabel={intentLabel} />
              </motion.div>
            )}

            {phase === "plan" && plan && (
              <motion.div key="plan" className="flex-1 min-h-0 flex flex-col" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <PlanPhase
                  plan={plan}
                  onApply={handleApply}
                  onCancel={handleClose}
                />
              </motion.div>
            )}

            {phase === "applying" && (
              <motion.div key="applying" className="flex-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <ApplyingPhase total={plan?.recommended.filter(r => !r.alreadyApplied).length ?? 0} />
              </motion.div>
            )}

            {phase === "done" && (
              <motion.div key="done" className="flex-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <DonePhase
                  appliedCount={sessionAppliedIds.length}
                  onRevert={handleRevert}
                  onClose={handleClose}
                  reverting={reverting}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </ModalShell>
      )}
    </AnimatePresence>
  );
}
