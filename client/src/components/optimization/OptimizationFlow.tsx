/**
 * OptimizationFlow.tsx — Full-screen, cinematic, AI-driven optimization experience.
 *
 * Phases (driven by the isolated optimizationStore):
 *   idle → snapshotting → intent → deciding → plan → applying → done
 *
 * Phase experiences:
 *   snapshotting → Neural PC-DNA scan (canvas particle field + layer probes) and
 *                  an archetype reveal derived from the REAL hardware snapshot.
 *   intent       → Conversational goal input (natural language → intent). No cards.
 *   deciding     → AI reasoning engine (live thought process) while the REAL
 *                  scoring/conflict engine runs.
 *   plan         → Impact simulation (animated SVG), confidence rings, conflict
 *                  nodes — all derived from the real engine plan. No checkboxes.
 *   applying     → Cinematic staged apply sequence over the real apply call.
 *   done         → Digital-twin before/after with adaptive memory + undo.
 *
 * This component never imports from or causes re-renders of TweaksList.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, TrendingUp, Activity, Waves, Gamepad2, Radio, Target, Wifi,
  Sparkles, X, CheckCircle2, AlertTriangle, RotateCcw, ArrowRight,
  Cpu, Send, Brain, ShieldCheck, Layers, Gauge, CircuitBoard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptimizationStore } from "@/stores/optimizationStore";
import { collectOptimizationSnapshot, type OptimizationSnapshot } from "@/lib/optimizationSnapshot";
import { runOptimizationEngine, type OptimizationPlan } from "@shared/optimizationEngine";
import { runNetworkOptimizationEngine } from "@shared/networkOptimizationEngine";
import { collectNetworkOptimizationSnapshot } from "@/lib/networkOptimizationSnapshot";
import type { OptimizationIntent } from "@shared/tweakOptimizationMeta";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { isTweakPremium } from "@/lib/premium-config";
import { useStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { bulkApplyTweaks, bulkRevertTweaks, isElectronWithTweaks, isSliderTweak } from "@/hooks/use-tweak-executor";
import { applyRecommended } from "@/lib/api";
import { premiumColor, successColor } from "@/lib/themeTokens";
import { NeuralScanField } from "@/components/optimization/NeuralScanField";
import {
  derivePcDna, resolveGoal, intentLabel as intentLabelOf, GOAL_SUGGESTIONS,
  computeImpactProjection, extractConflicts, buildApplyStages,
  loadOptMemory, recordOptSession, personalizedGreeting,
  type PcDna, type ImpactMetric, type ConflictNode, type ApplyStage, type GoalResolution,
} from "@/lib/pcDna";

// ── Timing constants ──────────────────────────────────────────────────────────

const REASONING_MS = 2600;
const APPLY_CINEMATIC_MS = 5400;

const INTENT_ICON: Record<OptimizationIntent, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  "lowest-latency": Zap,
  "highest-fps": TrendingUp,
  "lowest-stutter": Activity,
  "smooth-frametimes": Waves,
  "balanced-gaming": Gamepad2,
  "streaming-gaming": Radio,
  "competitive-fps": Target,
  "network-responsiveness": Wifi,
  "auto": Sparkles,
};

// ── Small primitives ──────────────────────────────────────────────────────────

/** Eased count-up for animated numbers. */
function CountUp({ value, decimals = 0, duration = 900 }: { value: number; decimals?: number; duration?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{v.toFixed(decimals)}</>;
}

/** Radial confidence ring (SVG). */
function RadialConfidence({ score, size = 46 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color = score >= 75 ? successColor.main : score >= 55 ? premiumColor.main : "#fbbf24";
  return (
    <svg width={size} height={size} className="shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="3" fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth="3" fill="none" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: off }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </g>
      <text x={size / 2} y={size / 2} dominantBaseline="central" textAnchor="middle"
        fill="#fff" fontSize="12" fontWeight={700}>{Math.round(score)}</text>
    </svg>
  );
}

// ── Phase: Snapshotting (Neural scan + PC DNA reveal) ─────────────────────────

const SCAN_LAYERS = [
  { label: "Hardware Topology", icon: Cpu },
  { label: "Operating System", icon: CircuitBoard },
  { label: "Performance State", icon: Gauge },
  { label: "Network Stack", icon: Wifi },
  { label: "Gaming Profile", icon: Gamepad2 },
  { label: "Applied Tweaks", icon: Layers },
  { label: "Telemetry Signals", icon: Activity },
];

function SnapshottingPhase({
  dna, dataReady, onProceed,
}: { dna: PcDna; dataReady: boolean; onProceed: () => void }) {
  const [scanStep, setScanStep] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setScanStep(s => (s < SCAN_LAYERS.length ? s + 1 : s));
    }, 300);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (scanStep >= SCAN_LAYERS.length && dataReady) {
      const t = setTimeout(() => setRevealed(true), 350);
      return () => clearTimeout(t);
    }
  }, [scanStep, dataReady]);

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-8">
      <AnimatePresence mode="wait">
        {!revealed ? (
          <motion.div
            key="scan"
            className="flex flex-col items-center gap-8 w-full max-w-md"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}
          >
            {/* Central scan orb */}
            <div className="relative w-32 h-32">
              <motion.div
                className="absolute inset-0 rounded-full border"
                style={{ borderColor: "rgba(0,212,255,0.25)" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                className="absolute inset-3 rounded-full border-2 border-r-transparent border-b-transparent border-l-transparent"
                style={{ borderTopColor: premiumColor.main }}
                animate={{ rotate: -360 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                className="absolute inset-8 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(0,212,255,0.35), transparent 70%)" }}
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
              <Brain className="absolute inset-0 m-auto size-8" style={{ color: premiumColor.light }} />
            </div>

            <div className="text-center">
              <h2 className="text-xl font-semibold text-white tracking-tight">Generating PC DNA</h2>
              <p className="text-sm text-[#7c8597] mt-1">Mapping your system at the silicon level…</p>
            </div>

            <div className="w-72 mx-auto grid grid-cols-1 gap-1.5">
              {SCAN_LAYERS.map((layer, i) => {
                const Icon = layer.icon;
                const done = scanStep > i;
                const active = scanStep === i;
                return (
                  <motion.div
                    key={layer.label}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: done || active ? 1 : 0.3, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: active ? "rgba(0,212,255,0.06)" : "transparent" }}
                  >
                    <Icon className="size-4 shrink-0" style={{ color: done ? successColor.main : active ? premiumColor.light : "#45506a" }} />
                    <span className={cn("text-sm flex-1", done || active ? "text-[#c5cdda]" : "text-[#45506a]")}>
                      {layer.label}
                    </span>
                    {done ? (
                      <CheckCircle2 className="size-4" style={{ color: successColor.main }} />
                    ) : active ? (
                      <motion.div
                        className="size-3.5 rounded-full border"
                        style={{ borderColor: premiumColor.main }}
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    ) : (
                      <div className="size-3.5 rounded-full border border-white/10" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <DnaReveal key="dna" dna={dna} onProceed={onProceed} />
        )}
      </AnimatePresence>
    </div>
  );
}

function DnaReveal({ dna, onProceed }: { dna: PcDna; onProceed: () => void }) {
  return (
    <motion.div
      className="flex flex-col items-center gap-6 w-full max-w-lg"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="text-center">
        <motion.div
          className="text-[11px] uppercase tracking-[0.3em] mb-2"
          style={{ color: premiumColor.light }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        >
          PC DNA Identified
        </motion.div>
        <motion.h2
          className="text-3xl font-bold text-white tracking-tight"
          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.18, type: "spring", stiffness: 320, damping: 22 }}
        >
          {dna.archetype}
        </motion.h2>
        <p className="text-sm text-[#7c8597] mt-1.5 max-w-sm mx-auto">{dna.tagline}</p>
      </div>

      {/* Spec chips — 3-line: category / primary value / detail */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 w-full">
        {[
          { k: "CPU",     v: dna.cpuLabel,     d: dna.cpuDetail },
          { k: "GPU",     v: dna.gpuLabel,     d: dna.gpuDetail },
          { k: "Memory",  v: dna.ramLabel,     d: dna.ramDetail },
          { k: "Storage", v: dna.storageLabel, d: dna.storageDetail },
          { k: "System",  v: dna.osLabel,      d: dna.osDetail },
        ].map((c, i) => (
          <motion.div
            key={c.k}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 + i * 0.06 }}
            className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-2 py-3 min-w-0 flex flex-col items-center text-center gap-0.5"
          >
            <div className="text-[9px] uppercase tracking-widest text-[#4a5568]">{c.k}</div>
            <div className="text-[11px] font-semibold text-white leading-snug break-words w-full" title={c.v}>{c.v}</div>
            {c.d && (
              <div className="text-[9.5px] text-[#5b6a80] leading-tight break-words w-full">{c.d}</div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Trait pills + headroom */}
      <motion.div
        className="flex flex-wrap items-center justify-center gap-2"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
      >
        {dna.traits.map(t => (
          <span key={t.label} className="text-[11px] px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[#aeb7c7]">
            <span className="text-[#5b6478]">{t.label}:</span> {t.value}
          </span>
        ))}
      </motion.div>

      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
      >
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-[#7c8597]">Optimization headroom</span>
          <span className="font-semibold" style={{ color: premiumColor.light }}>{dna.headroom}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${premiumColor.main}, ${premiumColor.light})` }}
            initial={{ width: 0 }} animate={{ width: `${dna.headroom}%` }}
            transition={{ duration: 1, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.95 }}
        onClick={onProceed}
        data-testid="button-dna-continue"
        className="group flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-[#02131a] transition-transform active:scale-[0.97]"
        style={{ background: `linear-gradient(90deg, ${premiumColor.main}, ${premiumColor.end})`, boxShadow: "0 0 30px rgba(0,212,255,0.35)" }}
      >
        Set Your Goal
        <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
      </motion.button>
    </motion.div>
  );
}

// ── Phase: Intent (conversational goal input) ─────────────────────────────────

function IntentPhase({
  dna, greeting, onSubmit,
}: { dna: PcDna; greeting: string | null; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = (value: string) => {
    const v = value.trim();
    onSubmit(v); // empty → auto intent
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-10 w-full">
      <div className="w-full max-w-xl flex flex-col items-center gap-7">
        <motion.div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03]"
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        >
          <Sparkles className="size-3.5" style={{ color: premiumColor.light }} />
          <span className="text-[12px] text-[#aeb7c7]">{dna.archetype}</span>
        </motion.div>

        <div className="text-center">
          <motion.h2
            className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          >
            What do you want to improve?
          </motion.h2>
          <motion.p
            className="text-sm text-[#7c8597] mt-2"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.16 }}
          >
            {greeting ?? "Tell me in your own words — I'll build the strategy."}
          </motion.p>
        </div>

        {/* Conversational input */}
        <motion.form
          className="w-full"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
          onSubmit={e => { e.preventDefault(); submit(text); }}
        >
          <div
            className="flex items-center gap-2 rounded-2xl border bg-white/[0.03] px-4 py-3 transition-colors"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          >
            <Brain className="size-5 shrink-0" style={{ color: premiumColor.light }} />
            <input
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder='e.g. "lowest latency for Valorant" or "fix my stutter"'
              data-testid="input-optimization-goal"
              className="flex-1 bg-transparent text-[15px] text-white placeholder:text-[#4d566b] outline-none focus:outline-none focus-visible:outline-none"
            />
            <button
              type="submit"
              data-testid="button-submit-goal"
              className="shrink-0 size-9 rounded-xl flex items-center justify-center text-[#02131a] transition-transform active:scale-90"
              style={{ background: `linear-gradient(135deg, ${premiumColor.main}, ${premiumColor.end})` }}
              aria-label="Build strategy"
            >
              <Send className="size-4" />
            </button>
          </div>
        </motion.form>

        {/* Suggestion pills (no card grid) */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-2"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        >
          {GOAL_SUGGESTIONS.map((s, i) => (
            <motion.button
              key={s}
              initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.32 + i * 0.04 }}
              onClick={() => submit(s)}
              data-testid={`pill-goal-${i}`}
              className="text-[12px] px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] text-[#aeb7c7] hover:text-white hover:border-[rgba(0,212,255,0.35)] hover:bg-[rgba(0,212,255,0.06)] transition-colors"
            >
              {s}
            </motion.button>
          ))}
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          onClick={() => submit("")}
          data-testid="button-goal-auto"
          className="text-[12px] text-[#5b6478] hover:text-[#aeb7c7] transition-colors"
        >
          Not sure? Let the AI decide →
        </motion.button>
      </div>
    </div>
  );
}

// ── Phase: Deciding (AI reasoning engine) ─────────────────────────────────────

const REASONING_STEPS = [
  { label: "Analyzing hardware profile", icon: Cpu },
  { label: "Reviewing current tweak state", icon: Layers },
  { label: "Detecting performance bottlenecks", icon: Gauge },
  { label: "Comparing against similar systems", icon: Brain },
  { label: "Calculating risk & reversibility", icon: ShieldCheck },
  { label: "Building optimization strategy", icon: Sparkles },
];

function DecidingPhase({ goal }: { goal: GoalResolution | null }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const per = REASONING_MS / REASONING_STEPS.length;
    const timers = REASONING_STEPS.map((_, i) => setTimeout(() => setStep(i + 1), per * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-10 w-full">
      <div className="w-full max-w-md flex flex-col gap-7">
        <div className="text-center">
          <motion.div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-4"
            style={{ borderColor: "rgba(0,212,255,0.25)", background: "rgba(0,212,255,0.05)" }}
            animate={{ boxShadow: ["0 0 0px rgba(0,212,255,0)", "0 0 24px rgba(0,212,255,0.4)", "0 0 0px rgba(0,212,255,0)"] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Brain className="size-4" style={{ color: premiumColor.light }} />
            <span className="text-[12px] font-medium" style={{ color: premiumColor.light }}>AI Reasoning Engine</span>
          </motion.div>
          <h2 className="text-xl font-semibold text-white">{goal?.acknowledgement ?? "Building your strategy…"}</h2>
        </div>

        <div className="flex flex-col gap-2">
          {REASONING_STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = step > i;
            const active = step === i;
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: done || active ? 1 : 0.35, x: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border"
                style={{
                  borderColor: active ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.05)",
                  background: active ? "rgba(0,212,255,0.05)" : "transparent",
                }}
              >
                <Icon className="size-4 shrink-0" style={{ color: done ? successColor.main : active ? premiumColor.light : "#45506a" }} />
                <span className={cn("text-sm flex-1", done || active ? "text-[#c5cdda]" : "text-[#45506a]")}>{s.label}</span>
                {done ? (
                  <CheckCircle2 className="size-4" style={{ color: successColor.main }} />
                ) : active ? (
                  <motion.div className="flex gap-0.5">
                    {[0, 1, 2].map(d => (
                      <motion.span
                        key={d}
                        className="size-1.5 rounded-full"
                        style={{ background: premiumColor.main }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
                      />
                    ))}
                  </motion.div>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Phase: Plan (impact simulation + strategy + conflicts) ────────────────────

function ImpactMetricCard({ m, index }: { m: ImpactMetric; index: number }) {
  const decimals = m.unit === "ms" ? 1 : 0;
  const accent = m.direction === "up" ? successColor.main : premiumColor.main;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 flex flex-col gap-2"
    >
      <div className="text-[11px] text-[#7c8597] leading-tight">{m.label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-bold tabular-nums" style={{ color: accent }}>{m.deltaLabel}</span>
      </div>
      <div className="text-[10px] text-[#5b6478] tabular-nums">
        {m.unit === "ms"
          ? <>{m.before}ms → <CountUp value={m.after} decimals={decimals} />ms</>
          : <>baseline → <CountUp value={m.after} decimals={decimals} />{m.unit}</>}
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-0.5">
        <motion.div
          className="h-full rounded-full"
          style={{ background: accent }}
          initial={{ width: 0 }} animate={{ width: `${Math.round(m.strength * 100)}%` }}
          transition={{ duration: 0.9, delay: 0.2 + index * 0.07, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </motion.div>
  );
}

const CONFLICT_LABEL: Record<ConflictNode["type"], string> = {
  conflict: "Conflict",
  duplicate: "Already set",
  legacy: "Legacy",
  unsafe: "Unsafe",
  bottleneck: "Incompatible",
};

function ConflictNodeChip({
  node, index, isForced, onToggle,
}: {
  node: ConflictNode;
  index: number;
  isForced?: boolean;
  onToggle?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 + index * 0.06 }}
      className={cn(
        "relative flex flex-col gap-2 p-2.5 rounded-xl border transition-colors",
        isForced
          ? "border-amber-500/40 bg-amber-500/[0.07]"
          : "border-amber-500/20 bg-amber-500/[0.04]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <motion.div
          className="mt-0.5 shrink-0"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: index * 0.2 }}
        >
          <AlertTriangle className="size-3.5 text-amber-400" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-[#d6c08a] truncate">{node.title}</span>
            <span className="text-[9px] uppercase tracking-wider text-amber-500/70 border border-amber-500/20 rounded px-1 py-px shrink-0">{CONFLICT_LABEL[node.type]}</span>
          </div>
          <p className="text-[10px] text-[#8a8268] mt-0.5 leading-snug">{node.reason}</p>
        </div>
      </div>
      {onToggle && (
        <button
          onClick={onToggle}
          className={cn(
            "w-full text-[10px] px-2 py-1 rounded-lg border transition-colors text-left",
            isForced
              ? "border-amber-500/40 text-amber-400 bg-amber-500/10 hover:bg-amber-500/15"
              : "border-white/[0.08] text-[#7c8597] hover:text-amber-400 hover:border-amber-500/30 bg-white/[0.02]",
          )}
          data-testid={`button-toggle-conflict-${node.tweakId}`}
        >
          {isForced ? "Remove from plan" : "Include anyway →"}
        </button>
      )}
    </motion.div>
  );
}

function PlanPhase({
  plan, dna, onApply, onCancel, userForcedTweakIds, onToggleForced,
}: {
  plan: OptimizationPlan;
  dna: PcDna;
  onApply: () => void;
  onCancel: () => void;
  userForcedTweakIds?: string[];
  onToggleForced?: (id: string) => void;
}) {
  const metrics = useMemo(() => computeImpactProjection(plan), [plan]);
  const conflicts = useMemo(() => extractConflicts(plan), [plan]);
  const newTweaks = plan.recommended.filter(r => !r.alreadyApplied);
  const forcedCount = userForcedTweakIds?.length ?? 0;
  const Icon = INTENT_ICON[plan.intent] ?? Sparkles;

  return (
    <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto pt-10 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Icon className="size-4" style={{ color: premiumColor.light }} />
            <span className="text-[12px] font-medium" style={{ color: premiumColor.light }}>{intentLabelOf(plan.intent)}</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Your Optimization Strategy</h2>
          <p className="text-[12px] text-[#7c8597] mt-1">{dna.archetype} · {plan.hardwareSummary}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-bold text-white tabular-nums">{newTweaks.length}</div>
          <div className="text-[10px] text-[#7c8597]">optimizations</div>
        </div>
      </div>

      {/* Grouped body card */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 flex flex-col gap-4">
        {newTweaks.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-3 text-center">
            <CheckCircle2 className="size-12" style={{ color: successColor.main }} />
            <div className="text-sm text-[#8a93a6] max-w-xs">Your system is already optimized for this goal. Nothing left to apply.</div>
          </div>
        ) : (
          <>
            {/* Impact simulation */}
            {metrics.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[#5b6478] mb-2">Projected Impact</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {metrics.map((m, i) => <ImpactMetricCard key={m.key} m={m} index={i} />)}
                </div>
              </div>
            )}

            <div className="h-px bg-white/[0.05]" />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Strategy list */}
              <div className={cn(conflicts.length > 0 ? "lg:col-span-3" : "lg:col-span-5")}>
                <div className="text-[11px] uppercase tracking-wider text-[#5b6478] mb-2">AI-Selected Optimizations</div>
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                  {newTweaks.map((entry, i) => (
                    <motion.div
                      key={entry.tweakId}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.28, delay: i * 0.04 }}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 hover:border-[rgba(0,212,255,0.2)] transition-colors"
                    >
                      <RadialConfidence score={entry.score} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white">{entry.tweakTitle}</span>
                          {entry.expectedImpact === "high" && (
                            <span className="text-[9px] uppercase tracking-wider rounded px-1 py-px" style={{ color: premiumColor.light, border: `1px solid ${premiumColor.main}40` }}>High impact</span>
                          )}
                          {entry.requiresReboot && (
                            <span className="text-[9px] uppercase tracking-wider text-amber-400/80 border border-amber-500/20 rounded px-1 py-px">Reboot</span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#7c8597] mt-0.5 leading-snug line-clamp-2">{entry.reason}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Conflict nodes */}
              {conflicts.length > 0 && (
                <div className="lg:col-span-2">
                  <div className="text-[11px] uppercase tracking-wider text-[#5b6478] mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="size-3 text-amber-500/70" />
                    Conflicts Detected
                  </div>
                  <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                    {conflicts.map((c, i) => (
                    <ConflictNodeChip
                      key={c.tweakId}
                      node={c}
                      index={i}
                      isForced={userForcedTweakIds?.includes(c.tweakId)}
                      onToggle={onToggleForced ? () => onToggleForced(c.tweakId) : undefined}
                    />
                  ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex-1" />
        <button
          onClick={onCancel}
          data-testid="button-cancel-plan"
          className="px-4 py-2.5 text-sm text-[#7c8597] hover:text-white transition-colors"
        >
          Cancel
        </button>
        {(newTweaks.length > 0 || forcedCount > 0) && (
          <button
            onClick={onApply}
            data-testid="button-apply-strategy"
            className="group flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-[#02131a] transition-transform active:scale-[0.97]"
            style={{ background: `linear-gradient(90deg, ${premiumColor.main}, ${premiumColor.end})`, boxShadow: "0 0 30px rgba(0,212,255,0.35)" }}
          >
            Apply Optimization Strategy
            {forcedCount > 0 && (
              <span className="text-[10px] font-normal opacity-70">
                (+{forcedCount} you added)
              </span>
            )}
            <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Phase: Applying (cinematic staged sequence) ───────────────────────────────

function ApplyingPhase({ stages }: { stages: ApplyStage[] }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const per = APPLY_CINEMATIC_MS / stages.length;
    const timers = stages.map((_, i) => setTimeout(() => setActive(i), per * i));
    return () => timers.forEach(clearTimeout);
  }, [stages]);

  const progress = Math.min(100, Math.round(((active + 0.5) / stages.length) * 100));

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-10 w-full">
      <div className="w-full max-w-md flex flex-col gap-7">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-24 h-24">
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-r-transparent border-b-transparent border-l-transparent"
              style={{ borderTopColor: premiumColor.main }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-3 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(0,212,255,0.35), transparent 70%)" }}
              animate={{ scale: [1, 1.18, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
            <span className="absolute inset-0 m-auto flex items-center justify-center text-lg font-bold text-white tabular-nums">{progress}%</span>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white">Applying Optimizations</h2>
            <p className="text-sm text-[#7c8597] mt-1">Engineering your system in real time…</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          {stages.map((stage, i) => {
            const done = i < active;
            const current = i === active;
            return (
              <motion.div
                key={stage.key}
                animate={{ opacity: done || current ? 1 : 0.35 }}
                className="flex items-center gap-3 px-3.5 py-2 rounded-lg"
                style={{ background: current ? "rgba(0,212,255,0.05)" : "transparent" }}
              >
                {done ? (
                  <CheckCircle2 className="size-4 shrink-0" style={{ color: successColor.main }} />
                ) : current ? (
                  <motion.div
                    className="size-4 rounded-full border-2 border-r-transparent shrink-0"
                    style={{ borderTopColor: premiumColor.main, borderLeftColor: premiumColor.main, borderBottomColor: premiumColor.main }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                  />
                ) : (
                  <div className="size-4 rounded-full border border-white/10 shrink-0" />
                )}
                <span className={cn("text-sm flex-1", done || current ? "text-[#c5cdda]" : "text-[#45506a]")}>{stage.label}</span>
                {stage.ids.length > 0 && (
                  <span className="text-[10px] text-[#5b6478] tabular-nums">{stage.ids.length}</span>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Phase: Done (digital twin + undo) ─────────────────────────────────────────

function DonePhase({
  plan, appliedCount, failedCount, onRevert, onClose, reverting, revertOutcome,
}: {
  plan: OptimizationPlan | null;
  appliedCount: number;
  failedCount: number;
  onRevert: () => void;
  onClose: () => void;
  reverting: boolean;
  revertOutcome: { reverted: number; stuck: number } | null;
}) {
  const metrics = useMemo(() => (plan ? computeImpactProjection(plan) : []), [plan]);
  const hasPartialFailure = failedCount > 0 && appliedCount > 0;
  const allFailed = failedCount > 0 && appliedCount === 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-10 w-full">
      <div className="w-full max-w-2xl flex flex-col items-center gap-6">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 20 }}
          className="relative"
        >
          <div className={cn("w-20 h-20 rounded-full flex items-center justify-center", allFailed ? "bg-red-500/10" : "bg-emerald-500/10")}>
            {allFailed ? <AlertTriangle className="size-10 text-red-400" /> : <CheckCircle2 className="size-10" style={{ color: successColor.main }} />}
          </div>
          {!allFailed && (
            <motion.div
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: "rgba(52,211,153,0.4)" }}
              initial={{ scale: 1, opacity: 1 }} animate={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: 1.1, delay: 0.3 }}
            />
          )}
        </motion.div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {allFailed ? "Could Not Apply" : appliedCount > 0 ? "System Optimized" : "Already Optimized"}
          </h2>
          <p className="text-sm text-[#7c8597] mt-1.5 max-w-md">
            {allFailed
              ? "All optimizations failed to apply. This may require admin privileges or a different Windows version."
              : hasPartialFailure
                ? `${appliedCount} applied · ${failedCount} failed. Failed items may need admin privileges.`
                : appliedCount > 0
                  ? `${appliedCount} optimization${appliedCount !== 1 ? "s" : ""} applied. Your digital twin reflects the new state.`
                  : "Everything was already in place for this goal."}
          </p>
        </div>

        {/* Digital twin: before → after */}
        {appliedCount > 0 && metrics.length > 0 && (
          <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          >
            <div className="text-[11px] uppercase tracking-wider text-[#5b6478] mb-2 text-center">Digital Twin · Realized Impact</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {metrics.map((m, i) => <ImpactMetricCard key={m.key} m={m} index={i} />)}
            </div>
          </motion.div>
        )}

        {revertOutcome && (
          <div className="w-full max-w-sm px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-400">
              {revertOutcome.stuck === (revertOutcome.reverted + revertOutcome.stuck)
                ? "Revert failed — tweaks may still be applied. Try again or check admin permissions."
                : `${revertOutcome.reverted} reverted, ${revertOutcome.stuck} could not be reverted.`}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-sm">
          <button
            onClick={onClose}
            data-testid="button-done"
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-[#02131a] transition-transform active:scale-[0.97]"
            style={{ background: `linear-gradient(90deg, ${premiumColor.main}, ${premiumColor.end})` }}
          >
            Done
          </button>
          {appliedCount > 0 && (
            <button
              onClick={onRevert}
              disabled={reverting}
              data-testid="button-undo-session"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.08] text-[#7c8597] hover:text-white hover:border-white/15 text-sm transition-colors disabled:opacity-40"
            >
              <RotateCcw className="size-3.5" />
              {reverting ? "Reverting…" : revertOutcome ? "Retry Undo" : "Undo Session"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Matrix rain edge strips (snapshotting phase only) ─────────────────────────
// Pure CSS @keyframes — no requestAnimationFrame, no setInterval, no canvas.
// Characters pre-computed at module scope so they never change on re-render.

const _MC = "アイウエオカキクケコサシスセソタチツ01234567ABCDEF";
function _mkRainCol(seed: number, len = 22) {
  let s = seed;
  const r = () => { s = ((s * 1664525 + 1013904223) >>> 0); return s / 4294967295; };
  return {
    chars: Array.from({ length: len }, () => _MC[Math.floor(r() * _MC.length)]),
    dur: `${(1.4 + r() * 1.3).toFixed(2)}s`,
    delay: `${-(r() * 3.2).toFixed(2)}s`,
  };
}
const _L_COLS = [13, 27, 41, 55, 69, 83].map(s => _mkRainCol(s));
const _R_COLS = [97, 111, 125, 139, 153, 167].map(s => _mkRainCol(s));

function MatrixRainStrip({
  cols, side,
}: { cols: ReturnType<typeof _mkRainCol>[]; side: "left" | "right" }) {
  const COL_W = 14;
  const COL_H = 22 * 15; // chars × px — matches from: -COL_H below
  const mask = side === "left"
    ? "linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 65%, transparent 100%)"
    : "linear-gradient(to left,  rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 65%, transparent 100%)";
  return (
    <>
      <style>{`@keyframes _mrf{from{top:-${COL_H}px}to{top:100%}}`}</style>
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, bottom: 0, [side]: 0,
          width: cols.length * COL_W,
          overflow: "hidden",
          pointerEvents: "none",
          maskImage: mask,
          WebkitMaskImage: mask,
          zIndex: 7,
        }}
      >
        {cols.map((col, ci) => (
          <div
            key={ci}
            style={{ position: "absolute", top: 0, bottom: 0, left: ci * COL_W, width: COL_W, overflow: "hidden" }}
          >
            <div style={{ position: "absolute", animation: `_mrf ${col.dur} linear ${col.delay} infinite` }}>
              {col.chars.map((ch, i) => (
                <div
                  key={i}
                  style={{
                    height: 15, lineHeight: "15px", fontSize: 11,
                    textAlign: "center", fontFamily: "monospace",
                    color: i === 0
                      ? "#c8fff2"
                      : `rgba(0,212,255,${Math.max(0, 0.68 - i * 0.029).toFixed(2)})`,
                    textShadow: i < 2 ? "0 0 6px rgba(0,212,255,0.65)" : "none",
                  }}
                >
                  {ch}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Full-screen immersive shell ───────────────────────────────────────────────

function ImmersiveShell({
  children, onClose, intensity, canClose, showMatrixEdges = false,
}: { children: React.ReactNode; onClose: () => void; intensity: number; canClose: boolean; showMatrixEdges?: boolean }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && canClose) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed top-0 bottom-0 left-64 right-0 z-[9000] overflow-hidden"
      style={{ background: "radial-gradient(circle at 50% 30%, #0a1018 0%, #05060a 70%)" }}
    >
      {/* Neural field background */}
      <div className="absolute inset-0 opacity-90">
        <NeuralScanField intensity={intensity} />
      </div>
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 40%, transparent 40%, rgba(5,6,10,0.85) 100%)" }} />

      {/* Matrix rain — left and right edges, DNA scan phase only */}
      {showMatrixEdges && (
        <>
          <MatrixRainStrip cols={_L_COLS} side="left" />
          <MatrixRainStrip cols={_R_COLS} side="right" />
        </>
      )}

      {/* Close */}
      {canClose && (
        <button
          onClick={onClose}
          data-testid="button-close-optimization"
          className="absolute top-5 right-5 z-20 size-9 flex items-center justify-center rounded-xl text-[#5b6478] hover:text-white hover:bg-white/[0.06] transition-colors"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      )}

      {/* Content */}
      <div className="relative z-10 h-full w-full overflow-y-auto">
        <div className="min-h-full flex items-center justify-center px-5 sm:px-8">
          {children}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

export function OptimizationFlow() {
  const {
    phase, intent, plan,
    sessionAppliedIds, sessionFailedIds,
    getCachedSnapshot, setCachedSnapshot, getCachedPlan, setCachedPlan,
    setSnapshotReady, setIntent, decidePlan, startApplying, finishApplying, setError, reset,
  } = useOptimizationStore();

  const { tweaks, setTweak } = useStore();
  const user = useAuthStore(s => s.user);
  const isPremiumUser = !!(user as any)?.plan && (user as any)?.plan !== "free";

  const snapshotRef = useRef<OptimizationSnapshot | null>(null);
  const [snapshot, setSnapshot] = useState<OptimizationSnapshot | null>(null);
  const [scanState, setScanState] = useState<"scanning" | "ready" | "error">("scanning");
  const scanErrorRef = useRef<string | undefined>(undefined);

  const goalRef = useRef<GoalResolution | null>(null);
  const [goal, setGoal] = useState<GoalResolution | null>(null);

  const [reverting, setReverting] = useState(false);
  const [revertOutcome, setRevertOutcome] = useState<{ reverted: number; stuck: number } | null>(null);
  const [userForcedTweakIds, setUserForcedTweakIds] = useState<string[]>([]);

  const handleToggleForced = useCallback((id: string) => {
    setUserForcedTweakIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const isOpen = phase !== "idle";

  const dna = useMemo<PcDna>(() => derivePcDna(snapshot), [snapshot]);
  const greeting = useMemo(() => personalizedGreeting(loadOptMemory()), [phase]);

  // ── snapshotting: collect (with 10-min cache); gate transition on DNA reveal ──
  useEffect(() => {
    if (phase !== "snapshotting") return;
    let cancelled = false;
    setScanState("scanning");
    scanErrorRef.current = undefined;

    const cached = getCachedSnapshot();
    if (cached) {
      snapshotRef.current = cached;
      setSnapshot(cached);
      setScanState("ready");
      return;
    }

    collectOptimizationSnapshot().then(s => {
      if (cancelled) return;
      snapshotRef.current = s;
      setSnapshot(s);
      setCachedSnapshot(s);
      setScanState("ready");
    }).catch(() => {
      if (cancelled) return;
      snapshotRef.current = null;
      setSnapshot(null);
      scanErrorRef.current = "Could not read hardware profile — using defaults.";
      setScanState("error");
    });
    return () => { cancelled = true; };
  }, [phase, getCachedSnapshot, setCachedSnapshot]);

  // ── deciding → plan (reasoning flash, plan cache, then real engine) ──────────
  useEffect(() => {
    if (phase !== "deciding" || !intent) return;
    let cancelled = false;

    const excludedIds = goalRef.current?.excludedTweakIds ?? [];
    // Skip cache when the user has explicit exclusions so the engine respects them
    const cachedPlan = excludedIds.length === 0 ? getCachedPlan(intent) : null;
    if (cachedPlan) {
      const timer = setTimeout(() => { if (!cancelled) decidePlan(cachedPlan); }, REASONING_MS);
      return () => { cancelled = true; clearTimeout(timer); };
    }

    const snap = snapshotRef.current;
    const timer = setTimeout(async () => {
      if (cancelled) return;

      try {
        const eligibleTweaks = TWEAKS_DATA
          .filter(t => !(isTweakPremium(t.id) && !isPremiumUser))
          // Slider tweaks require a specific value to apply — they cannot be
          // auto-applied by the optimizer (which only calls bulkApplyTweaks).
          // Exclude them so they never appear in the plan and never fail silently.
          .filter(t => !isSliderTweak(t.id))
          .map(t => ({
            id: t.id,
            title: t.title,
            risk: t.risk,
            level: t.level,
            requiresReboot: t.requiresReboot,
            alreadyApplied: !!tweaks[t.id],
          }));

        let enginePlan;
        if (intent === "network-responsiveness") {
          const netSignals = await collectNetworkOptimizationSnapshot().catch(() => ({
            isWired: null,
            hasWifiAdapter: null,
            rxKBps: null,
            txKBps: null,
            windowsBuild: snap?.windowsBuild ?? null,
            appliedTweakIds: Object.entries(tweaks).filter(([, v]) => v).map(([k]) => k),
          }));
          enginePlan = runNetworkOptimizationEngine(netSignals, eligibleTweaks);
        } else {
          enginePlan = runOptimizationEngine({
            intent,
            tweaks: eligibleTweaks,
            hardware: snap?.hardware ?? {},
            windowsBuild: snap?.windowsBuild ?? null,
            cpuLoadPct: snap?.cpuLoadPct ?? null,
            ramUsedPct: snap?.ramUsedPct ?? null,
            excludedTweakIds: goalRef.current?.excludedTweakIds ?? [],
          });
        }

        if (!cancelled) {
          setCachedPlan(intent, enginePlan);
          decidePlan(enginePlan);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not build an optimization plan.");
        }
      }
    }, REASONING_MS);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [phase, intent, tweaks, isPremiumUser, decidePlan, getCachedPlan, setCachedPlan, setError]);

  // ── goal submission (natural language → intent) ─────────────────────────────
  const handleGoalSubmit = useCallback((text: string) => {
    const resolved = resolveGoal(text);
    goalRef.current = resolved;
    setGoal(resolved);
    setUserForcedTweakIds([]);
    setIntent(resolved.intent);
  }, [setIntent]);

  // ── apply (outcome-driven; min cinematic duration; adaptive memory) ─────────
  const handleApply = useCallback(async () => {
    if (!plan) return;
    startApplying();
    const startedAt = Date.now();

    const toApply = [
      ...plan.recommended.filter(r => !r.alreadyApplied).map(r => r.tweakId),
      ...userForcedTweakIds.filter(id => !plan.recommended.some(r => r.tweakId === id)),
    ];
    const appliedIds: string[] = [];
    const failedIds: string[] = [];

    if (isElectronWithTweaks()) {
      try {
        const results = await bulkApplyTweaks(toApply);
        for (const id of toApply) {
          if (results[id]?.success === true) { appliedIds.push(id); setTweak(id, true); }
          else failedIds.push(id);
        }
      } catch {
        failedIds.push(...toApply);
      }
    } else {
      try {
        await applyRecommended(toApply);
        for (const id of toApply) { appliedIds.push(id); setTweak(id, true); }
      } catch {
        failedIds.push(...toApply);
      }
    }

    // Adaptive memory: learn from this session.
    const g = goalRef.current;
    recordOptSession(g?.intent ?? plan.intent, g?.game ?? null, appliedIds.length);

    // Let the cinematic sequence play out fully.
    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, APPLY_CINEMATIC_MS - elapsed);
    await new Promise(r => setTimeout(r, wait));

    finishApplying(appliedIds, failedIds);
  }, [plan, userForcedTweakIds, startApplying, finishApplying, setTweak]);

  // ── revert (outcome-driven) ─────────────────────────────────────────────────
  const handleRevert = useCallback(async () => {
    if (!sessionAppliedIds.length) return;
    setReverting(true);
    setRevertOutcome(null);
    try {
      if (isElectronWithTweaks()) {
        const results = await bulkRevertTweaks(sessionAppliedIds);
        let revertedCount = 0;
        let stuckCount = 0;
        for (const id of sessionAppliedIds) {
          if (results[id]?.success === true) { setTweak(id, false); revertedCount++; }
          else stuckCount++;
        }
        if (stuckCount > 0) {
          setRevertOutcome({ reverted: revertedCount, stuck: stuckCount });
          return;
        }
      } else {
        for (const id of sessionAppliedIds) setTweak(id, false);
      }
      reset();
    } catch {
      setRevertOutcome({ reverted: 0, stuck: sessionAppliedIds.length });
    } finally {
      setReverting(false);
    }
  }, [sessionAppliedIds, setTweak, reset]);

  const handleClose = useCallback(() => {
    if (phase === "applying") return;
    reset();
  }, [phase, reset]);

  // Background intensity per phase.
  const intensity =
    phase === "snapshotting" ? (scanState === "scanning" ? 0.55 : 0.85)
      : phase === "deciding" ? 0.95
        : phase === "applying" ? 1
          : phase === "done" ? 0.4
            : 0.6;

  const applyStages = useMemo(() => (plan ? buildApplyStages(plan) : []), [plan]);
  const canClose = phase !== "applying";

  return (
    <AnimatePresence>
      {isOpen && (
        <ImmersiveShell onClose={handleClose} intensity={intensity} canClose={canClose} showMatrixEdges={phase === "snapshotting"}>
          <AnimatePresence mode="wait">
            {phase === "snapshotting" && (
              <motion.div key="snapshotting" className="w-full self-stretch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <SnapshottingPhase
                  dna={dna}
                  dataReady={scanState !== "scanning"}
                  onProceed={() => setSnapshotReady(scanErrorRef.current)}
                />
              </motion.div>
            )}

            {phase === "intent" && (
              <motion.div key="intent" className="w-full self-stretch" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                <IntentPhase dna={dna} greeting={greeting} onSubmit={handleGoalSubmit} />
              </motion.div>
            )}

            {phase === "deciding" && (
              <motion.div key="deciding" className="w-full self-stretch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <DecidingPhase goal={goal} />
              </motion.div>
            )}

            {phase === "plan" && plan && (
              <motion.div key="plan" className="w-full self-stretch" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <PlanPhase
                  plan={plan}
                  dna={dna}
                  onApply={handleApply}
                  onCancel={handleClose}
                  userForcedTweakIds={userForcedTweakIds}
                  onToggleForced={handleToggleForced}
                />
              </motion.div>
            )}

            {phase === "applying" && (
              <motion.div key="applying" className="w-full self-stretch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <ApplyingPhase stages={applyStages} />
              </motion.div>
            )}

            {phase === "done" && (
              <motion.div key="done" className="w-full self-stretch" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <DonePhase
                  plan={plan}
                  appliedCount={sessionAppliedIds.length}
                  failedCount={sessionFailedIds.length}
                  onRevert={handleRevert}
                  onClose={handleClose}
                  reverting={reverting}
                  revertOutcome={revertOutcome}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </ImmersiveShell>
      )}
    </AnimatePresence>
  );
}
