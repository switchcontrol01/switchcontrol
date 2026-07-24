/**
 * ExtremeLabs.tsx
 *
 * Advanced latency and delay tuning for power users.
 * Entry modal → restore point → unlocked dashboard.
 *
 * Entitlement tiers:
 *  - free / trial_expired  → can view analysis + browse tweaks; Apply is locked
 *  - trial_active          → full access (same as premium)
 *  - premium / premium_grace → full access
 *  - unverified            → premium wall
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { logHistory } from "@/lib/logHistory";
import { useStore } from "@/lib/store";
import { useTweakOwnershipStore } from "@/stores/tweakOwnershipStore";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useEntitlementUiState } from "@/hooks/useEntitlementUiState";
import type { EntitlementUiStatus } from "@/lib/entitlementResolver";
import { PremiumPageOverlay } from "@/components/ui/premium-page-overlay";
import { useUpgradeModal } from "@/contexts/UpgradeModalContext";
import { useToast } from "@/hooks/use-toast";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { motion, AnimatePresence } from "@/lib/motion";
import { cn } from "@/lib/utils";

import {
  EXTREME_TWEAKS,
  EXTREME_CATEGORIES,
  getRiskColor,
  getImpactColor,
  type ExtremeTweak,
  type RiskBadge,
} from "@/lib/extreme-labs-data";

import {
  Zap,
  Shield,
  AlertTriangle,
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  RotateCcw,
  Timer,
  Cpu,
  Wifi,
  Network,
  Loader2,
  ChevronRight,
  ChevronDown,
  Filter,
  Flame,
  Gauge,
  TrendingDown,
  Lock,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type WizardStep = "warning" | "restore" | "analyzing" | "dashboard";

interface ApplyBatchResult {
  applied: number;
  failed: number;
  skipped: number;
  adminBlocked: number;
  notSupported: number;
  details: Array<{ id: string; ok: boolean; reason?: string }>;
}

// ── Entitlement helpers (single source of truth for Extreme Labs) ─────────────

function canRunExtremeAnalysis(status: EntitlementUiStatus): boolean {
  return status !== "unverified";
}

function canApplyExtremeTweaks(status: EntitlementUiStatus): boolean {
  return (
    status === "premium" ||
    status === "premium_grace" ||
    status === "trial_active"
  );
}

function elLog(tag: "ExtremeLabs" | "ExtremeLabsApply" | "ExtremeLabsEntitlement", data: Record<string, unknown>) {
  console.log(`[${tag}]`, JSON.stringify(data));
}

// ── Design tokens ────────────────────────────────────────────────────────────

const RISK_NEON: Record<RiskBadge, { glow: string; text: string; bg: string; border: string; bar: string }> = {
  Safe:     { glow: "#00FF88", text: "text-emerald-400",   bg: "bg-emerald-500/10",  border: "border-emerald-500/30",  bar: "#00FF88" },
  Moderate: { glow: "#FF9500", text: "text-amber-400",     bg: "bg-amber-500/10",    border: "border-amber-500/30",    bar: "#FF9500" },
  Risky:    { glow: "#FF4444", text: "text-red-400",       bg: "bg-red-500/10",      border: "border-red-500/30",      bar: "#FF4444" },
  High:     { glow: "#FF1A1A", text: "text-red-500",       bg: "bg-red-600/10",      border: "border-red-600/30",      bar: "#FF1A1A" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRiskBg(risk: RiskBadge): string {
  const r = RISK_NEON[risk];
  return `${r.bg} ${r.border} ${r.text}`;
}

function getImpactLabel(impact: string): string {
  switch (impact) {
    case "None": return "No measured effect";
    case "Low": return "May help some systems";
    case "Medium": return "Often measurable";
    case "High": return "Strong effect — high risk";
    default: return "Unknown";
  }
}

function computeLatencyScore(telemetry: ReturnType<typeof useLiveTelemetry>["telemetry"]): number {
  if (!telemetry) return 50;
  const cpuLoad = (telemetry as any).cpu?.usagePct ?? (telemetry as any).cpu?.load ?? 0;
  const ramPct = (telemetry as any).ram?.usagePct ?? (telemetry as any).ram?.usedPercent ?? 0;
  const score = Math.round((cpuLoad * 0.6 + ramPct * 0.4));
  return Math.min(100, Math.max(10, score));
}

// ── Animated counter hook ────────────────────────────────────────────────────

function useCountUp(target: number, duration = 800): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    // Issue #15: skip animation loop entirely when target is 0 (e.g. string-value StatCards)
    if (target === 0) { setVal(0); return; }
    let start: number | null = null;
    let rafId: number;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * target));
      if (progress < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return val;
}

// ── SVG Gauge Component ──────────────────────────────────────────────────────

function LatencyGauge({ value, label }: { value: number; label: string }) {
  // Issue #16: outer wrapper gets overflow-hidden so tick marks / needle at extremes don't clip outside
  const clamped = Math.min(100, Math.max(0, value));
  const angle = (clamped / 100) * 240 - 120;
  const color = clamped < 40 ? "#00FF88" : clamped < 70 ? "#FF9500" : "#FF4444";
  const displayVal = useCountUp(value);

  // Arc params: radius=76, center=100,110, span=240deg
  const R = 76;
  const cx = 100, cy = 110;
  const toXY = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad) };
  };
  const start = toXY(-120);
  const end   = toXY(120);
  const arcEnd = toXY(angle);

  // Full track arc
  const trackD = `M ${start.x} ${start.y} A ${R} ${R} 0 1 1 ${end.x} ${end.y}`;

  // Value arc (partial)
  const spanDeg = clamped / 100 * 240;
  const largeArc = spanDeg > 180 ? 1 : 0;
  const valueD = `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} 1 ${arcEnd.x} ${arcEnd.y}`;

  // Tick marks
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const deg = -120 + (i / 10) * 240;
    const inner = i % 5 === 0 ? 62 : 68;
    const outer = 76;
    const rad = ((deg - 90) * Math.PI) / 180;
    return {
      x1: cx + inner * Math.cos(rad),
      y1: cy + inner * Math.sin(rad),
      x2: cx + outer * Math.cos(rad),
      y2: cy + outer * Math.sin(rad),
      major: i % 5 === 0,
    };
  });

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Issue #16: overflow-hidden prevents tick/needle clipping at viewport edges */}
      <div className="relative w-52 h-36 overflow-hidden">
        <svg viewBox="0 0 200 140" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="gaugeTrack" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00FF88" stopOpacity="0.15" />
              <stop offset="50%" stopColor="#FF9500" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#FF4444" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="gaugeValue" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00FF88" />
              <stop offset="50%" stopColor="#FF9500" />
              <stop offset="100%" stopColor="#FF4444" />
            </linearGradient>
            <filter id="gaugeGlow">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Outer decorative ring */}
          <circle cx={cx} cy={cy} r="90" fill="none" stroke="#1A2030" strokeWidth="1" />

          {/* Track arc */}
          <path d={trackD} fill="none" stroke="#1E2733" strokeWidth="10" strokeLinecap="round" />

          {/* Colored zone fill under track */}
          <path d={trackD} fill="none" stroke="url(#gaugeTrack)" strokeWidth="10" strokeLinecap="round" />

          {/* Value arc with glow */}
          {clamped > 0 && (
            <>
              <path
                d={valueD}
                fill="none"
                stroke={color}
                strokeWidth="10"
                strokeLinecap="round"
                opacity="0.25"
                style={{ transition: "all 1.2s cubic-bezier(0.34,1.56,0.64,1)" }}
              />
              <path
                d={valueD}
                fill="none"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
                filter="url(#gaugeGlow)"
                style={{ transition: "all 1.2s cubic-bezier(0.34,1.56,0.64,1)" }}
              />
            </>
          )}

          {/* Tick marks */}
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
              stroke={t.major ? "#3A4558" : "#252C38"}
              strokeWidth={t.major ? 1.5 : 1}
            />
          ))}

          {/* Needle */}
          <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: "transform 1.2s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <line x1={cx} y1={cy} x2={cx} y2={cy - 58} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <line x1={cx} y1={cy} x2={cx} y2={cy + 14} stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
          </g>

          {/* Center hub */}
          <circle cx={cx} cy={cy} r="7" fill="#0D1117" stroke={color} strokeWidth="2" />
          <circle cx={cx} cy={cy} r="3" fill={color} />

          {/* Value display */}
          <text x={cx} y={cy - 20} textAnchor="middle" fill={color} fontSize="26" fontWeight="700" fontFamily="monospace" style={{ transition: "fill 0.5s" }}>
            {displayVal}
          </text>
        </svg>
      </div>
      <div className="text-center space-y-0.5">
        <div className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-medium">{label}</div>
      </div>
    </div>
  );
}

// ── Before/After Bar Component ─────────────────────────────────────────────

function ImpactBar({ label, before, after, unit, better }: {
  label: string; before: number; after: number; unit: string; better: "lower" | "higher";
}) {
  const max = Math.max(before, after, 1);
  const beforePct = (before / max) * 100;
  const afterPct = (after / max) * 100;
  const improved = better === "lower" ? after < before : after > before;
  const pctChange = before > 0 ? Math.round(Math.abs((after - before) / before) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-[#C8CDD6]">{label}</span>
        {improved && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded"
          >
            -{pctChange}%
          </motion.span>
        )}
      </div>
      <div className="grid grid-cols-[40px_1fr_auto] items-center gap-2">
        <span className="text-[10px] text-muted-foreground/50 text-right">before</span>
        <div className="h-3 bg-[#0E1318] rounded-full overflow-hidden border border-[#1E2733]">
          <motion.div
            className="h-full bg-[#2A3344] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${beforePct}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </div>
        <span className="text-xs text-muted-foreground/60 font-mono w-14 text-right">{before}{unit}</span>
      </div>
      <div className="grid grid-cols-[40px_1fr_auto] items-center gap-2">
        <span className="text-[10px] text-muted-foreground/50 text-right">after</span>
        <div className="h-3 bg-[#0E1318] rounded-full overflow-hidden border border-[#1E2733]">
          <motion.div
            className="h-full rounded-full"
            style={{ background: improved ? "linear-gradient(90deg,#00FF88,#00D4FF)" : "#00D4FF" }}
            initial={{ width: 0 }}
            animate={{ width: `${afterPct}%` }}
            transition={{ duration: 0.9, delay: 0.25, ease: "easeOut" }}
          />
        </div>
        <span className={cn("text-xs font-mono font-bold w-14 text-right", improved ? "text-emerald-400" : "text-[#00D4FF]")}>
          {after}{unit}
        </span>
      </div>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, value, label, color, animate = true }: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  color: string;
  animate?: boolean;
}) {
  const numVal = typeof value === "number" ? value : null;
  const countVal = useCountUp(numVal ?? 0, 700);
  const display = numVal !== null ? countVal : value;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -2 }}
      className="relative overflow-hidden rounded-xl border border-[#1E2733] bg-[#0C1118] p-4 group cursor-default"
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />

      {/* Corner glow */}
      <div className="absolute top-0 right-0 w-16 h-16 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`, transform: "translate(30%,-30%)" }} />

      <div className="flex flex-col gap-2">
        <Icon className="size-4" style={{ color }} />
        <div className="text-3xl font-black font-mono tabular-nums leading-none" style={{ color }}>
          {display}
        </div>
        <div className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-medium">{label}</div>
      </div>
    </motion.div>
  );
}

// ── Tweak Card Component ───────────────────────────────────────────────────

function TweakCard({
  tweak,
  isApplied,
  isPending,
  onApply,
  onUndo,
  disabled,
  premiumLocked,
  onUpgrade,
}: {
  tweak: ExtremeTweak;
  isApplied: boolean;
  isPending: boolean;
  onApply: () => void;
  onUndo: () => void;
  disabled: boolean;
  premiumLocked: boolean;
  onUpgrade: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const riskStyle = RISK_NEON[tweak.risk];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative rounded-xl border bg-[#0C1118] overflow-hidden group transition-all duration-300",
        isApplied
          ? "border-emerald-500/30 bg-[#0A1510]"
          : "border-[#1E2733] hover:border-[#2A3A4A]"
      )}
    >
      {/* Left risk accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-opacity duration-300"
        style={{
          background: `linear-gradient(180deg, ${riskStyle.glow}CC, ${riskStyle.glow}44)`,
          opacity: isApplied ? 1 : 0.4,
        }}
      />

      {/* Applied glow overlay */}
      {isApplied && (
        <div className="absolute inset-0 pointer-events-none rounded-xl"
          style={{ background: "radial-gradient(ellipse at top left, rgba(0,255,136,0.04) 0%, transparent 60%)" }} />
      )}

      <div className="p-4 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[#E6EAF0] text-sm tracking-tight">{tweak.name}</span>
              {/* Risk badge */}
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider",
                `${riskStyle.bg} ${riskStyle.border} ${riskStyle.text}`
              )}>
                {tweak.risk}
              </span>
              {tweak.nicPropertyKey && (
                <span className="text-[9px] px-1.5 py-0.5 rounded border bg-purple-500/10 border-purple-500/30 text-purple-400 font-bold uppercase tracking-wider">
                  NIC
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70 mt-1.5 leading-relaxed">{tweak.description}</p>
          </div>

          {/* Action */}
          <div className="shrink-0 mt-0.5">
            {isApplied ? (
              <div className="flex items-center gap-2">
                <motion.div
                  className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                >
                  {/* Pulsing dot */}
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                  </span>
                  Applied
                </motion.div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground/40 hover:text-red-400 h-7 w-7 p-0 transition-colors"
                  onClick={onUndo}
                  disabled={isPending || disabled}
                >
                  <RotateCcw className="size-3" />
                </Button>
              </div>
            ) : premiumLocked ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground/50 hover:text-purple-400 h-7 px-2.5 border border-[#1E2733] hover:border-purple-500/30 transition-all"
                onClick={onUpgrade}
              >
                <Lock className="size-3 mr-1" /> Premium
              </Button>
            ) : (
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="sm"
                  className="text-xs bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30 hover:border-[#00D4FF]/60 h-7 px-3 font-semibold transition-all shadow-none hover:shadow-[0_0_12px_rgba(0,212,255,0.25)]"
                  onClick={onApply}
                  disabled={isPending || disabled}
                >
                  {isPending ? (
                    <Loader2 className="size-3 animate-spin mr-1" />
                  ) : (
                    <Zap className="size-3 mr-1" />
                  )}
                  Apply
                </Button>
              </motion.div>
            )}
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 hover:text-[#00D4FF]/70 mt-3 transition-colors uppercase tracking-wider font-medium"
        >
          <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronRight className="size-3" />
          </motion.span>
          {expanded ? "Hide details" : "Show details"}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="pt-3 mt-3 border-t border-[#1A2030] space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#0A0F14] border border-[#1A2030]">
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground/40 font-medium block mb-1">Changes</span>
                    <p className="text-[#C8CDD6] leading-relaxed">{tweak.whatItChanges}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0A0F14] border border-red-500/10">
                    <span className="text-[9px] uppercase tracking-widest text-red-500/50 font-medium block mb-1">May break</span>
                    <p className="text-red-400/80 leading-relaxed">{tweak.whatMayBreak}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground/40 font-medium block mb-0.5">Impact</span>
                    <span style={{ color: getImpactColor(tweak.impact) }} className="font-semibold">
                      {getImpactLabel(tweak.impact)}
                    </span>
                  </div>
                  {tweak.requiresRestart && (
                    <div className="flex items-center gap-1 text-amber-400/70 text-[10px]">
                      <RotateCcw className="size-3" /> Requires restart
                    </div>
                  )}
                </div>
                {tweak.riskAreas.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground/40 font-medium">Risk areas:</span>
                    {tweak.riskAreas.map((area) => (
                      <span key={area} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/8 text-red-400/70 border border-red-500/15 font-medium">
                        {area}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Entry Modal ──────────────────────────────────────────────────────────────

function EntryModal({
  step,
  onNext,
  onBack,
  onComplete,
  progress,
  isRestoring,
  restoreError,
}: {
  step: WizardStep;
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
  progress: number;
  isRestoring: boolean;
  restoreError: string | null;
}) {
  const warnings = [
    { icon: AlertTriangle, title: "System-level registry changes", text: "These tweaks modify Windows scheduling, network, and service settings. Some require a restart to take effect." },
    { icon: Flame, title: "Anti-cheat compatibility risk", text: "Some tweaks (e.g., timer resolution changes) may trigger anti-cheat flags in competitive games." },
    { icon: Wifi, title: "Network stability trade-offs", text: "TCP NoDelay and interrupt moderation changes can increase packet overhead. May worsen latency on some connections." },
    { icon: Activity, title: "Hardware-dependent results", text: "The same tweak can improve latency on one system and worsen it on another. Always measure with built-in diagnostics." },
    { icon: Shield, title: "Automatic restore point", text: "A restore point is required before any changes. You can revert everything at any time from this page." },
  ];

  if (step === "analyzing") {
    return (
      <div className="fixed top-0 bottom-0 left-64 right-0 z-[60] flex items-center justify-center bg-[#07090D]/95 backdrop-blur-xl">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-8">
          <div className="relative">
            {/* Outer ring */}
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              style={{ border: "1px solid rgba(0,212,255,0.15)", borderTopColor: "#00D4FF", width: 96, height: 96, margin: -16 }}
            />
            {/* Inner ring */}
            <motion.div
              className="w-16 h-16 rounded-full border-2 border-[#00D4FF]/20"
              animate={{ rotate: -360 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
              style={{ borderTopColor: "#00D4FF", borderRightColor: "#00D4FF40" }}
            />
            <Zap className="size-7 text-[#00D4FF] absolute inset-0 m-auto" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-black text-[#E6EAF0] tracking-tight">Analyzing system latency profile</h3>
            <p className="text-sm text-muted-foreground/60">Scanning hardware configuration — {Math.round(progress)}% complete</p>
          </div>
          <div className="w-72 space-y-2">
            <div className="h-1.5 bg-[#0E1318] rounded-full overflow-hidden border border-[#1E2733]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #00D4FF, #00FF88)" }}
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 bottom-0 left-64 right-0 z-[60] flex items-center justify-center bg-[#07090D]/95 backdrop-blur-xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }} className="w-full max-w-lg mx-4">
        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 h-0.5 rounded-full bg-[#1A2030] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #00D4FF, #00FF88)" }}
                initial={{ width: "0%" }}
                animate={{ width: step === "warning" ? (n === 1 ? "50%" : "0%") : n <= 2 ? "100%" : "0%" }}
                transition={{ duration: 0.5 }}
              />
            </div>
          ))}
          <span className="text-[10px] text-muted-foreground/40 w-10 text-right uppercase tracking-wider font-medium">
            {step === "warning" ? "1/3" : step === "restore" ? "2/3" : "3/3"}
          </span>
        </div>

        <div className="relative rounded-2xl border border-[#1E2733] bg-[#0C1118] overflow-hidden p-6">
          {/* Top glow */}
          <div className="absolute top-0 left-0 right-0 h-[1px]"
            style={{ background: "linear-gradient(90deg, transparent, #00D4FF60, transparent)" }} />

          {step === "warning" && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="size-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="size-6 text-red-400" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-[#E6EAF0] tracking-tight">Before you continue</h2>
                  <p className="text-xs text-muted-foreground/50 mt-0.5">Extreme Labs makes deep system changes</p>
                </div>
              </div>
              <div className="space-y-2 mb-6">
                {warnings.map((w, i) => (
                  <motion.div
                    key={w.title}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.3 }}
                    className="flex gap-3 p-3 rounded-xl bg-[#0A0F14] border border-[#1A2030] hover:border-[#2A3040] transition-colors"
                  >
                    <w.icon className="size-4 text-amber-400/80 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-[#E6EAF0]">{w.title}</p>
                      <p className="text-[11px] text-muted-foreground/50 mt-0.5 leading-relaxed">{w.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="flex justify-end">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button onClick={onNext} className="bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-[#0A0E14] font-bold px-6 shadow-[0_0_20px_rgba(0,212,255,0.3)]">
                    I understand <ArrowRight className="size-4 ml-1.5" />
                  </Button>
                </motion.div>
              </div>
            </>
          )}

          {step === "restore" && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="size-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Shield className="size-6 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-[#E6EAF0] tracking-tight">Create restore point</h2>
                  <p className="text-xs text-muted-foreground/50 mt-0.5">Required before any changes can be made</p>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#0A0F14] border border-emerald-500/10 mb-5 space-y-3">
                <p className="text-sm text-[#C8CDD6]">A system restore point lets you undo all changes instantly if anything goes wrong.</p>
                <ul className="space-y-2">
                  {["Captures current registry state", "One-click revert from this page", "Does not delete personal files"].map(item => (
                    <li key={item} className="flex items-center gap-2.5 text-xs text-muted-foreground/60">
                      <Check className="size-3 text-emerald-400 shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
              {restoreError && (
                <div className="p-3 rounded-xl bg-red-500/8 border border-red-500/20 mb-4 text-sm text-red-400">
                  {restoreError}
                </div>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={onBack} className="text-muted-foreground/50 hover:text-[#E6EAF0]">
                  <ArrowLeft className="size-4 mr-1" /> Back
                </Button>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    onClick={onComplete}
                    disabled={isRestoring}
                    className="bg-emerald-500 hover:bg-emerald-500/90 text-white font-bold px-5 shadow-[0_0_20px_rgba(0,255,136,0.2)]"
                  >
                    {isRestoring ? (
                      <><Loader2 className="size-4 animate-spin mr-1.5" /> Creating...</>
                    ) : (
                      <><Shield className="size-4 mr-1.5" /> Create Restore Point</>
                    )}
                  </Button>
                </motion.div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Cross-page slider sync helpers ───────────────────────────────────────────
const EL_SLIDER_APPLY: Record<string, { mainId: string; applyValue: number }> = {
  NetworkThrottlingIndex: { mainId: "net-throttle-index",   applyValue: 4294967295 },
  win32PrioritySeparation: { mainId: "win32-priority-sep",  applyValue: 26 },
  SystemResponsiveness:    { mainId: "sys-responsiveness",  applyValue: 15 },
};
const EL_SLIDER_REVERT: Record<string, { mainId: string; defaultValue: number }> = {
  NetworkThrottlingIndex: { mainId: "net-throttle-index",   defaultValue: 10 },
  // Issue #9: Windows Home default is 2, Pro/Server default is 24.
  // The backend registry revert (electronAPI.tweaks.resetValue) uses the pre-apply snapshot,
  // so this value only affects UI state sync — it may display incorrectly on Pro/Server.
  win32PrioritySeparation: { mainId: "win32-priority-sep",  defaultValue: 2 },
  SystemResponsiveness:    { mainId: "sys-responsiveness",  defaultValue: 20 },
};
function isELSliderApplied(sliderTweakId: string | undefined, mainSliderValues: Record<string, number>): boolean {
  if (!sliderTweakId) return false;
  const check = EL_SLIDER_REVERT[sliderTweakId];
  if (!check) return false;
  const val = mainSliderValues[check.mainId];
  return val !== undefined && val !== check.defaultValue;
}

const EL_PRESET_APPLY: Record<string, { mainId: string; applyOptionId: string }> = {
  'fortnite-high-priority': { mainId: "fortnite-high-priority", applyOptionId: "high" },
};
const EL_PRESET_REVERT: Record<string, { mainId: string; defaultOptionId: string }> = {
  'fortnite-high-priority': { mainId: "fortnite-high-priority", defaultOptionId: "normal" },
};
function isELPresetApplied(presetTweakId: string | undefined, mainPresetOptions: Record<string, string>): boolean {
  if (!presetTweakId) return false;
  const check = EL_PRESET_REVERT[presetTweakId];
  if (!check) return false;
  const val = mainPresetOptions[check.mainId];
  return val !== undefined && val !== check.defaultOptionId;
}

// ── Category section header ──────────────────────────────────────────────────

const CAT_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  "Latency Core":          { icon: Timer,    color: "#00D4FF" },
  "Scheduler / CPU":       { icon: Cpu,      color: "#FF9500" },
  "Gaming / Capture":      { icon: Zap,      color: "#BF5FFF" },
  "Network Latency":       { icon: Network,  color: "#00FF88" },
  "Service Weight":        { icon: Activity, color: "#5B9EFF" },
  "Startup / Vendor Weight": { icon: Shield, color: "#8899AA" },
};

function CategoryHeader({ category, count }: { category: string; count: number }) {
  const cfg = CAT_ICON[category] ?? { icon: Activity, color: "#888" };
  const Icon = cfg.icon;

  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="size-8 rounded-lg flex items-center justify-center border shrink-0"
        style={{
          background: `${cfg.color}15`,
          borderColor: `${cfg.color}30`,
          boxShadow: `0 0 12px ${cfg.color}20`,
        }}
      >
        <Icon className="size-4" style={{ color: cfg.color }} />
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm font-black text-[#E6EAF0] tracking-tight">{category}</span>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wider"
          style={{ color: cfg.color, background: `${cfg.color}10`, borderColor: `${cfg.color}30` }}
        >
          {count}
        </span>
      </div>
      {/* Separator line */}
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${cfg.color}40, transparent)` }} />
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function ExtremeDashboard({
  appliedTweaks,
  mainTweaks,
  mainSliderValues,
  mainPresetOptions,
  onApplyTweak,
  onUndoTweak,
  onRevertAll,
  activeFilter,
  onSetFilter,
  isApplyingId,
  canApply,
  onUpgrade,
}: {
  appliedTweaks: Set<string>;
  mainTweaks: Record<string, boolean>;
  mainSliderValues: Record<string, number>;
  mainPresetOptions: Record<string, string>;
  onApplyTweak: (id: string) => void;
  onUndoTweak: (id: string) => void;
  onRevertAll: () => void;
  activeFilter: "all" | RiskBadge | "nic";
  onSetFilter: (f: "all" | RiskBadge | "nic") => void;
  isApplyingId: string | null;
  canApply: boolean;
  onUpgrade: () => void;
}) {
  const { telemetry } = useLiveTelemetry();
  const latencyScore = computeLatencyScore(telemetry);

  const filteredTweaks = useMemo(() => {
    if (activeFilter === "all") return EXTREME_TWEAKS;
    if (activeFilter === "nic") return EXTREME_TWEAKS.filter((t) => t.nicPropertyKey);
    return EXTREME_TWEAKS.filter((t) => t.risk === activeFilter);
  }, [activeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<ExtremeTweak["category"], ExtremeTweak[]>();
    for (const cat of EXTREME_CATEGORIES) {
      const items = filteredTweaks.filter((t) => t.category === cat);
      if (items.length > 0) map.set(cat, items);
    }
    return map;
  }, [filteredTweaks]);

  const totalCount = EXTREME_TWEAKS.length;
  const appliedCount = appliedTweaks.size;
  const nicCount = EXTREME_TWEAKS.filter((t) => t.nicPropertyKey).length;

  return (
    <div className="space-y-7">
      {/* Free-user notice */}
      {!canApply && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative flex items-center justify-between gap-4 p-4 rounded-xl overflow-hidden border border-purple-500/20"
          style={{ background: "linear-gradient(135deg, rgba(120,50,200,0.08), rgba(90,30,160,0.04))" }}
        >
          <div className="absolute top-0 left-0 right-0 h-[1px]"
            style={{ background: "linear-gradient(90deg,transparent,#9333ea60,transparent)" }} />
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Lock className="size-4 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#E6EAF0]">Analysis available on free plans. Applying requires Premium.</p>
              <p className="text-xs text-muted-foreground/50 mt-0.5">Browse tweaks, view impact estimates, and explore recommendations below.</p>
            </div>
          </div>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Button size="sm" className="bg-purple-500 hover:bg-purple-500/90 text-white shrink-0 text-xs font-bold px-4 shadow-[0_0_16px_rgba(168,85,247,0.3)]" onClick={onUpgrade}>
              Upgrade
            </Button>
          </motion.div>
        </motion.div>
      )}

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Gauge}   value={appliedCount}                              label="Tweaks applied"    color="#00D4FF" />
        <StatCard icon={Activity} value={totalCount}                               label="Total tweaks"      color="#FF9500" />
        <StatCard icon={Network} value={nicCount}                                  label="NIC properties"    color="#BF5FFF" />
        <StatCard icon={Timer}   value={appliedCount > 0 ? ("Active" as any) : ("Ready" as any)} label="Session status" color="#00FF88" animate={false} />
      </div>

      {/* ── Analytics row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Latency Pressure */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative rounded-xl border border-[#1E2733] bg-[#0C1118] p-5 overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-[1px]"
            style={{ background: "linear-gradient(90deg,transparent,#00D4FF40,transparent)" }} />
          <div className="absolute bottom-0 right-0 w-32 h-32 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle,#00D4FF,transparent)", transform: "translate(30%,30%)" }} />

          {/* Issue #7: renamed from "Latency Pressure" — CPU+RAM load ≠ network latency */}
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="size-4 text-[#00D4FF]" />
            <h3 className="text-xs font-black text-[#E6EAF0] uppercase tracking-widest">System Load</h3>
          </div>
          <div className="flex justify-center">
            <LatencyGauge value={latencyScore} label="CPU + RAM pressure (lower is better)" />
          </div>
          <p className="text-[10px] text-muted-foreground/40 mt-2 text-center leading-relaxed">
            Live CPU + RAM load only. High load does not imply high network latency.
          </p>
        </motion.div>

        {/* Estimated Impact */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="relative rounded-xl border border-[#1E2733] bg-[#0C1118] p-5 overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-[1px]"
            style={{ background: "linear-gradient(90deg,transparent,#00FF8840,transparent)" }} />
          {/* Issue #8: renamed to "Illustrative Estimates" + more prominent disclaimer */}
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="size-4 text-emerald-400" />
            <h3 className="text-xs font-black text-[#E6EAF0] uppercase tracking-widest">Illustrative Estimates</h3>
          </div>
          <p className="text-[10px] text-amber-400/60 mb-4 leading-relaxed border border-amber-500/15 bg-amber-500/5 rounded-lg px-2.5 py-1.5">
            ⚠ These are simplified reference values, not measured results. Actual impact is hardware-specific.
          </p>
          <div className="space-y-5">
            <ImpactBar label="Scheduling delay"   before={8}  after={appliedCount > 2 ? 5 : 8}   unit="ms" better="lower" />
            <ImpactBar label="Timer resolution"   before={15} after={appliedCount > 0 ? 1 : 15}  unit="ms" better="lower" />
            <ImpactBar label="Network throttling" before={60} after={appliedCount > 3 ? 30 : 60} unit="%" better="lower" />
          </div>
          <p className="text-[9px] text-muted-foreground/30 mt-4 leading-relaxed uppercase tracking-wide">
            Reference values only — not tweak-specific. Always measure before and after.
          </p>
        </motion.div>

        {/* Risk Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative rounded-xl border border-[#1E2733] bg-[#0C1118] p-5 overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-[1px]"
            style={{ background: "linear-gradient(90deg,transparent,#FF444440,transparent)" }} />
          <div className="flex items-center gap-2 mb-5">
            <Flame className="size-4 text-red-400" />
            <h3 className="text-xs font-black text-[#E6EAF0] uppercase tracking-widest">Risk Distribution</h3>
          </div>
          <div className="space-y-4">
            {(["Safe", "Moderate", "Risky", "High"] as RiskBadge[]).map((risk, i) => {
              const count = EXTREME_TWEAKS.filter((t) => t.risk === risk).length;
              const pct = (count / EXTREME_TWEAKS.length) * 100;
              const neon = RISK_NEON[risk];
              return (
                <motion.div
                  key={risk}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.08 }}
                  className="space-y-1.5"
                >
                  <div className="flex justify-between items-center">
                    <span className={cn("text-xs font-bold", neon.text)}>{risk}</span>
                    <span className="text-sm font-black font-mono tabular-nums" style={{ color: neon.glow }}>{count}</span>
                  </div>
                  <div className="h-2 bg-[#0E1318] rounded-full overflow-hidden border border-[#1A2030]">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${neon.glow}, ${neon.glow}80)`,
                        boxShadow: `0 0 8px ${neon.glow}60`,
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + i * 0.1, ease: "easeOut" }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="size-3.5 text-muted-foreground/30" />
          {(["all", "Safe", "Moderate", "Risky", "High", "nic"] as const).map((f) => {
            const isActive = activeFilter === f;
            const color = f === "all" ? "#00D4FF" : f === "nic" ? "#BF5FFF" : RISK_NEON[f as RiskBadge]?.glow ?? "#00D4FF";
            return (
              <motion.button
                key={f}
                onClick={() => onSetFilter(f)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  "text-[10px] px-3 py-1.5 rounded-full border font-bold uppercase tracking-wider transition-all duration-200",
                  isActive ? "text-[#0A0E14]" : "bg-transparent text-muted-foreground/50 border-[#1E2733] hover:border-[#2A3A4A] hover:text-[#E6EAF0]"
                )}
                style={isActive ? {
                  background: color,
                  borderColor: color,
                  boxShadow: `0 0 12px ${color}50`,
                } : {}}
              >
                {f === "nic" ? "NIC" : f === "all" ? "All" : f}
              </motion.button>
            );
          })}
        </div>
        {appliedCount > 0 && (
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={onRevertAll}
              className="text-xs border-red-500/30 text-red-400/80 hover:bg-red-500/8 hover:text-red-300 hover:border-red-500/50 font-semibold"
            >
              <RotateCcw className="size-3 mr-1.5" /> Revert All
            </Button>
          </motion.div>
        )}
      </div>

      {/* ── Category sections ── */}
      <div className="space-y-8">
        {Array.from(grouped.entries()).map(([category, tweaks], catIdx) => (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: catIdx * 0.05 }}
          >
            <CategoryHeader category={category} count={tweaks.length} />
            <div className="space-y-2.5">
              {tweaks.map((tweak, tweakIdx) => (
                <motion.div
                  key={tweak.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: catIdx * 0.05 + tweakIdx * 0.04 }}
                >
                  <TweakCard
                    tweak={tweak}
                    isApplied={appliedTweaks.has(tweak.id) || (!!tweak.registryTweakId && !!mainTweaks[tweak.registryTweakId]) || isELSliderApplied(tweak.sliderTweakId, mainSliderValues) || isELPresetApplied(tweak.presetTweakId, mainPresetOptions)}
                    isPending={isApplyingId === tweak.id}
                    onApply={() => onApplyTweak(tweak.id)}
                    onUndo={() => onUndoTweak(tweak.id)}
                    disabled={isApplyingId !== null && isApplyingId !== tweak.id}
                    premiumLocked={!canApply}
                    onUpgrade={onUpgrade}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────────────────────────

function getElectronApi() {
  if (typeof window === "undefined") return null;
  const api = (window as any).electronAPI;
  return api?.extremeLabs ? api : null;
}

function getIsElectron(): boolean {
  return typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;
}

export default function ExtremeLabs() {
  const isElectron = getIsElectron();
  const electronApi = getElectronApi();
  const entitlement = useEntitlementUiState();
  const { status: entitlementStatus } = entitlement;
  const canApply = canApplyExtremeTweaks(entitlementStatus);
  const canAnalyze = canRunExtremeAnalysis(entitlementStatus);
  const { openUpgradeModal } = useUpgradeModal();
  const { toast } = useToast();
  const mainTweaks = useStore(s => s.tweaks);
  const mainSliderValues = useStore(s => s.sliderValues);
  const mainPresetOptions = useStore(s => s.presetOptions);

  const restoreIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Issue #2: track mount state so the restore-point timer never fires setState on an unmounted component
  const mountedRef = useRef(true);

  const [wizardStep, setWizardStep] = useState<WizardStep>("warning");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [analyzingProgress, setAnalyzingProgress] = useState(0);
  const [isApplying, setIsApplying] = useState<string | null>(null);
  const [appliedTweaks, setAppliedTweaks] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("extreme-labs-applied");
      if (stored) return new Set<string>(JSON.parse(stored));
    } catch (_) {}
    return new Set<string>();
  });
  const [activeFilter, setActiveFilter] = useState<"all" | RiskBadge | "nic">("all");

  useEffect(() => {
    try {
      if (appliedTweaks.size > 0) {
        localStorage.setItem("extreme-labs-applied", JSON.stringify(Array.from(appliedTweaks)));
      } else {
        localStorage.removeItem("extreme-labs-applied");
      }
    } catch (_) {}
  }, [appliedTweaks]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Issue #2: clear restore-point progress timer on unmount
      if (restoreIntervalRef.current) {
        clearInterval(restoreIntervalRef.current);
        restoreIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      setAppliedTweaks(new Set());
      const mainStore = useStore.getState();
      for (const t of EXTREME_TWEAKS) {
        if (t.registryTweakId) mainStore.setTweak(t.registryTweakId, false);
        if (t.sliderTweakId) {
          const sv = EL_SLIDER_REVERT[t.sliderTweakId];
          if (sv) mainStore.setSliderValue(sv.mainId, sv.defaultValue);
        }
        if (t.presetTweakId) {
          const pv = EL_PRESET_REVERT[t.presetTweakId];
          if (pv) mainStore.setPresetOption(pv.mainId, pv.defaultOptionId);
        }
      }
    };
    window.addEventListener('sc:el-reverted', handler);
    return () => window.removeEventListener('sc:el-reverted', handler);
  }, []);

  // Issue #12: liveCheckDoneRef resets on unmount so re-mounting the page re-runs the live check
  const liveCheckDoneRef = useRef(false);
  useEffect(() => {
    return () => { liveCheckDoneRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    if (liveCheckDoneRef.current) return;

    if (!electronApi?.extremeLabs?.checkAllStatus) {
      // Issue #1: Electron present but live-check API unavailable — warn that displayed state may be stale
      const hasStoredApplied = localStorage.getItem("extreme-labs-applied");
      if (hasStoredApplied) {
        toast({
          title: "Applied state may be stale",
          description: "Could not verify tweak status with the system. Shown state is from last session.",
          variant: "destructive",
        });
      }
      return;
    }

    liveCheckDoneRef.current = true;
    (async () => {
      try {
        const result = await electronApi.extremeLabs.checkAllStatus();
        if (!result?.ok || !result.status) return;
        const live = new Set<string>();
        for (const [id, isApplied] of Object.entries(result.status as Record<string, boolean>)) {
          if (isApplied) live.add(id);
        }
        setAppliedTweaks(live);
      } catch {
        // non-fatal: localStorage state already shown as fallback
      }
    })();
  }, [isElectron, electronApi, toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const unlocked = localStorage.getItem("extreme-labs-unlocked") === "true";
    // Issue #5 / #13: track which tier completed the wizard.
    // If a user completed the wizard in free/browse mode and has since upgraded to premium,
    // clear the unlock so they go through the full wizard (warning + restore point) as a premium user.
    const unlockTier = localStorage.getItem("extreme-labs-unlock-tier"); // "premium" | "free" | null

    if (unlocked) {
      if (canApply && unlockTier === "free") {
        // They previously bypassed the wizard as a free user — require full wizard now that they're premium
        localStorage.removeItem("extreme-labs-unlocked");
        localStorage.removeItem("extreme-labs-unlock-tier");
        // fall through: isUnlocked stays false, wizard shows
      } else {
        setIsUnlocked(true);
      }
    } else if (canApply) {
      // Premium user hitting page for first time — let wizard run (don't auto-unlock here)
      // We only auto-unlock for users who completed the restore-point wizard
    }
    // Issue #5: non-premium users who had unlock set from a previous premium session
    // can still view the dashboard in browse mode (canApply=false blocks actual applies)
    // but we intentionally do NOT auto-unlock for them to enforce the wizard warning step.

    elLog("ExtremeLabs", {
      userTier: entitlementStatus,
      trial: entitlementStatus === "trial_active",
      premium: entitlementStatus === "premium" || entitlementStatus === "premium_grace",
      desktopMode: isElectron,
      canApply,
      canAnalyze,
      unlockTier,
    });
  }, [entitlementStatus, isElectron, canApply, canAnalyze]);

  const handleCreateRestorePoint = useCallback(async () => {
    if (!canApply) {
      elLog("ExtremeLabsEntitlement", { action: "createRestorePoint", allowed: false, reason: "not_premium" });
      openUpgradeModal();
      return;
    }
    if (!isElectron) {
      toast({ title: "Desktop app required", description: "Extreme Labs requires the SwitchControl desktop app.", variant: "destructive" });
      return;
    }

    elLog("ExtremeLabsEntitlement", { action: "createRestorePoint", allowed: true, reason: entitlementStatus });
    setIsRestoring(true);
    setRestoreError(null);

    try {
      if (electronApi) {
        const result = await electronApi.extremeLabs.createRestorePoint();
        if (!result.ok) throw new Error(result.error || "Restore point failed");
      }

      setWizardStep("analyzing");
      setAnalyzingProgress(0);

      let p = 0;
      restoreIntervalRef.current = setInterval(() => {
        p += 18;
        if (p >= 100) {
          p = 100;
          clearInterval(restoreIntervalRef.current!);
          restoreIntervalRef.current = null;
          // Issue #2: guard against state update on unmounted component
          setTimeout(() => {
            if (!mountedRef.current) return;
            setIsUnlocked(true);
            localStorage.setItem("extreme-labs-unlocked", "true");
            localStorage.setItem("extreme-labs-unlock-tier", "premium");
            setWizardStep("dashboard");
            toast({ title: "Restore point created", description: "Extreme Labs is now unlocked." });
            logHistory("Extreme Labs: Restore Point Created", "Extreme Labs", "Created", "System restore point saved before tuning");
          }, 400);
        }
        if (mountedRef.current) setAnalyzingProgress(Math.min(100, p));
      }, 700);
    } catch (e: any) {
      setRestoreError(e?.message || "Failed to create restore point. Please try again.");
    } finally {
      setIsRestoring(false);
    }
  }, [canApply, isElectron, electronApi, toast, openUpgradeModal, entitlementStatus]);

  const handleApplyTweak = useCallback(async (id: string) => {
    if (!canApply) {
      elLog("ExtremeLabsEntitlement", { action: "applyTweak", allowed: false, reason: "not_premium", tweakId: id });
      openUpgradeModal();
      return;
    }
    if (!isElectron) {
      toast({ title: "Desktop app required", description: "Applying tweaks requires the SwitchControl desktop app.", variant: "destructive" });
      return;
    }

    elLog("ExtremeLabsEntitlement", { action: "applyTweak", allowed: true, reason: entitlementStatus, tweakId: id });
    setIsApplying(id);

    try {
      if (electronApi) {
        const result = await electronApi.extremeLabs.applySelected([id]);
        if (!result.ok) throw new Error(result.error || "Apply failed");

        const item = result.results?.find((r: any) => r.id === id);
        if (item) {
          if (item.adminRequired) {
            toast({ title: "Administrator access required", description: "This optimization requires the app to be run as Administrator. Right-click the app and choose 'Run as administrator'.", variant: "destructive" });
            elLog("ExtremeLabsApply", { requested: [id], applied: 0, failed: 0, blocked: 1, adminRequired: 1 });
            return;
          }
          if (item.notSupported) {
            toast({ title: "Not supported on this build", description: item.reason || "This tweak requires a helper agent that is not bundled in this version.", variant: "destructive" });
            elLog("ExtremeLabsApply", { requested: [id], applied: 0, failed: 0, blocked: 0, adminRequired: 0, notSupported: 1, reason: item.reason });
            return;
          }
          if (!item.applied) {
            toast({ title: "Could not apply", description: item.reason || item.error || "Unknown error", variant: "destructive" });
            elLog("ExtremeLabsApply", { requested: [id], applied: 0, failed: 1, blocked: 0, adminRequired: 0, reason: item.reason || item.error });
            return;
          }
        }
      }

      setAppliedTweaks((prev) => { const next = new Set(prev); next.add(id); return next; });
      const tweak = EXTREME_TWEAKS.find(t => t.id === id);
      if (tweak?.registryTweakId) useStore.getState().setTweak(tweak.registryTweakId, true);
      if (tweak?.sliderTweakId) {
        const sv = EL_SLIDER_APPLY[tweak.sliderTweakId];
        if (sv) useStore.getState().setSliderValue(sv.mainId, sv.applyValue);
      }
      if (tweak?.presetTweakId) {
        const pv = EL_PRESET_APPLY[tweak.presetTweakId];
        if (pv) useStore.getState().setPresetOption(pv.mainId, pv.applyOptionId);
      }
      useTweakOwnershipStore.getState().recordExtremeLabsApply(id, EXTREME_TWEAKS.find(t => t.id === id)?.name ?? id);
      toast({ title: "Tweak applied", description: "Change is active. Monitor for issues." });
      logHistory(`Extreme Labs: ${EXTREME_TWEAKS.find(t => t.id === id)?.name ?? id}`, "Extreme Labs", "Applied", `Tweak ID: ${id}`);
      elLog("ExtremeLabsApply", { requested: [id], applied: 1, failed: 0, blocked: 0, adminRequired: 0 });
    } catch (e: any) {
      toast({ title: "Apply failed", description: e?.message, variant: "destructive" });
      elLog("ExtremeLabsApply", { requested: [id], applied: 0, failed: 1, blocked: 0, adminRequired: 0, error: e?.message });
    } finally {
      setIsApplying(null);
    }
  }, [canApply, isElectron, electronApi, toast, openUpgradeModal, entitlementStatus]);

  const handleUndoTweak = useCallback(async (id: string) => {
    // Issue #3: entitlement check — free users must not be able to silently revert tweaks
    if (!canApply) {
      elLog("ExtremeLabsEntitlement", { action: "undoTweak", allowed: false, reason: "not_premium", tweakId: id });
      openUpgradeModal();
      return;
    }
    if (!isElectron) {
      toast({ title: "Desktop app required", description: "Reverting tweaks requires the SwitchControl desktop app.", variant: "destructive" });
      return;
    }

    const tweak = EXTREME_TWEAKS.find((t) => t.id === id);
    if (!tweak) {
      toast({ title: "Revert failed", description: "Unknown tweak ID.", variant: "destructive" });
      return;
    }

    setIsApplying(id);
    try {
      if (electronApi) {
        const mappedRegistry = tweak.registryTweakId;
        const mappedSlider = tweak.sliderTweakId;
        const mappedPreset = tweak.presetTweakId;

        // Issue #11: use the typed electronApi variable throughout, not (window as any).electronAPI
        // Issue #4: detect no-op — throw if no revert path exists instead of silently succeeding
        if (mappedRegistry) {
          if (!electronApi.tweaks?.execute) throw new Error("Registry revert API unavailable for this tweak.");
          await electronApi.tweaks.execute(mappedRegistry, "revert");
        } else if (mappedSlider) {
          if (!electronApi.tweaks?.resetValue) throw new Error("Slider revert API unavailable for this tweak.");
          await electronApi.tweaks.resetValue(mappedSlider);
        } else if (mappedPreset) {
          if (!electronApi.presetTweaks?.revert) throw new Error("Preset revert API unavailable for this tweak.");
          await electronApi.presetTweaks.revert(mappedPreset);
        } else if (tweak.nicPropertyKey) {
          if (!electronApi.nic?.resetProperty) throw new Error("NIC revert API unavailable for this tweak.");
          const adapters = await electronApi.nic.getAdapters();
          const physical = adapters.find((a: any) => a.status === 'Up');
          if (physical) {
            await electronApi.nic.resetProperty(physical.name, tweak.nicPropertyKey);
          }
        } else {
          // Issue #4: no mapping at all — refuse to silently succeed
          throw new Error("No revert path is defined for this tweak. Cannot confirm system was restored.");
        }
      }

      setAppliedTweaks((prev) => { const next = new Set(prev); next.delete(id); return next; });
      if (tweak.registryTweakId) useStore.getState().setTweak(tweak.registryTweakId, false);
      if (tweak.sliderTweakId) {
        const sv = EL_SLIDER_REVERT[tweak.sliderTweakId];
        if (sv) useStore.getState().setSliderValue(sv.mainId, sv.defaultValue);
      }
      if (tweak.presetTweakId) {
        const pv = EL_PRESET_REVERT[tweak.presetTweakId];
        if (pv) useStore.getState().setPresetOption(pv.mainId, pv.defaultOptionId);
      }
      useTweakOwnershipStore.getState().recordExtremeLabsRevertSuccess(id);
      toast({ title: "Tweak reverted", description: "Change has been undone." });
      logHistory(`Extreme Labs: ${tweak.name ?? id} Reverted`, "Extreme Labs", "Reverted", `Tweak ID: ${id}`);
    } catch (e: any) {
      toast({ title: "Revert failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsApplying(null);
    }
  }, [canApply, isElectron, electronApi, toast, openUpgradeModal]);

  const handleRevertAll = useCallback(async () => {
    if (!isElectron) {
      toast({ title: "Desktop app required", description: "Reverting tweaks requires the SwitchControl desktop app.", variant: "destructive" });
      return;
    }
    try {
      // Issue #6: track per-item revert success before updating ownership store
      let successfulIds: Set<string> = new Set(appliedTweaks); // default: assume all succeed (no-Electron path)

      if (electronApi) {
        const result = await electronApi.extremeLabs.restoreBaseline();
        if (!result.ok) throw new Error(result.error || "Revert failed");

        // Build set of IDs that actually reverted successfully per the API response
        successfulIds = new Set<string>();
        const rawResults: Array<{ id: string; reverted?: boolean; ok?: boolean; reason?: string }> = result.results ?? [];
        for (const item of rawResults) {
          if (item.reverted) successfulIds.add(item.id);
        }
        // Any ids in appliedTweaks not mentioned by results are treated as failed
        const failedCount = Array.from(appliedTweaks).filter(id => !successfulIds.has(id)).length;
        // Normalise to ApplyBatchResult.details shape
        const resultItems: Array<{ id: string; ok: boolean; reason?: string }> = rawResults.map(r => ({
          id: r.id,
          ok: !!r.reverted,
          reason: r.reason,
        }));

        const batchResult: ApplyBatchResult = {
          applied: 0,
          failed: failedCount,
          skipped: 0,
          adminBlocked: 0,
          notSupported: 0,
          details: resultItems,
        };
        elLog("ExtremeLabsApply", { action: "revertAll", ...batchResult });

        if (failedCount > 0) {
          toast({
            title: `Partial revert — ${failedCount} tweak${failedCount > 1 ? "s" : ""} could not be restored`,
            description: "Some changes may still be active. Check individual tweaks.",
            variant: "destructive",
          });
        }
      }

      // Issue #6: only record successful reverts in the ownership store
      const store = useTweakOwnershipStore.getState();
      Array.from(successfulIds).forEach(id => store.recordExtremeLabsRevertSuccess(id));

      const mainStore = useStore.getState();
      Array.from(appliedTweaks).forEach(id => {
        const t = EXTREME_TWEAKS.find(x => x.id === id);
        if (t?.registryTweakId) mainStore.setTweak(t.registryTweakId, false);
        if (t?.sliderTweakId) {
          const sv = EL_SLIDER_REVERT[t.sliderTweakId];
          if (sv) mainStore.setSliderValue(sv.mainId, sv.defaultValue);
        }
        if (t?.presetTweakId) {
          const pv = EL_PRESET_REVERT[t.presetTweakId];
          if (pv) mainStore.setPresetOption(pv.mainId, pv.defaultOptionId);
        }
      });
      setAppliedTweaks(new Set());
      if (!electronApi || successfulIds.size === appliedTweaks.size) {
        toast({ title: "All tweaks reverted", description: "System restored to baseline." });
      }
      logHistory("Extreme Labs: Revert All", "Extreme Labs", "Reverted All", "All lab tweaks restored to baseline");
    } catch (e: any) {
      toast({ title: "Revert failed", description: e?.message, variant: "destructive" });
    }
  }, [isElectron, electronApi, toast, appliedTweaks]);

  // Unverified = show full premium wall
  if (entitlementStatus === "unverified") {
    return (
      <AppLayout>
        <div className="p-6">
          <PageHeader
            icon={Zap}
            iconClassName="text-[#00D4FF]"
            title="Extreme Labs"
            subtitle="Advanced latency and delay tuning for power users"
          />
          <div className="mt-8">
            <PremiumPageOverlay
              featureName="Extreme Labs is a Premium Feature"
              buttonText="Sign In / Upgrade"
              description="Advanced latency tuning, system-level registry tweaks, and real-time impact monitoring are available with SwitchControl Premium."
            />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {/* Animated icon */}
              <motion.div
                className="size-10 rounded-xl flex items-center justify-center border border-[#00D4FF]/20"
                style={{ background: "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))" }}
                animate={{ boxShadow: ["0 0 12px rgba(0,212,255,0.2)", "0 0 24px rgba(0,212,255,0.35)", "0 0 12px rgba(0,212,255,0.2)"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Zap className="size-5 text-[#00D4FF]" />
                </motion.div>
              </motion.div>

              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black text-[#E6EAF0] tracking-tight">Extreme Labs</h1>
                <motion.span
                  className="text-[9px] px-2 py-1 rounded border font-black uppercase tracking-widest"
                  style={{ background: "rgba(255,68,68,0.12)", borderColor: "rgba(255,68,68,0.30)", color: "#FF4444" }}
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  ADVANCED
                </motion.span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground/50 max-w-lg">
              Hardware-dependent latency tuning with honest impact estimates. Always measure before and after.
            </p>
          </div>

          {appliedTweaks.size > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevertAll}
                className="text-xs border-red-500/30 text-red-400/80 hover:bg-red-500/8 hover:text-red-300 hover:border-red-500/50 font-semibold"
              >
                <RotateCcw className="size-3 mr-1.5" /> Revert All
              </Button>
            </motion.div>
          )}
        </div>

        {/* ── Content ── */}
        {isUnlocked ? (
          <ExtremeDashboard
            appliedTweaks={appliedTweaks}
            mainTweaks={mainTweaks}
            mainSliderValues={mainSliderValues}
            mainPresetOptions={mainPresetOptions}
            onApplyTweak={handleApplyTweak}
            onUndoTweak={handleUndoTweak}
            onRevertAll={handleRevertAll}
            activeFilter={activeFilter}
            onSetFilter={setActiveFilter}
            isApplyingId={isApplying}
            canApply={canApply}
            onUpgrade={openUpgradeModal}
          />
        ) : (
          <EntryModal
            step={wizardStep}
            onNext={() => {
              if (!canApply) {
                elLog("ExtremeLabsEntitlement", { action: "entryWizard", allowed: true, reason: "browse_mode" });
                setIsUnlocked(true);
                // Issue #13: record that this unlock was done in free/browse mode so we can
                // require the full wizard (warning + restore point) if they later upgrade
                localStorage.setItem("extreme-labs-unlocked", "true");
                localStorage.setItem("extreme-labs-unlock-tier", "free");
                return;
              }
              setWizardStep("restore");
            }}
            onBack={() => {
              // Issue #14: clear restoreError when navigating back so it doesn't persist on re-entry
              setRestoreError(null);
              setWizardStep("warning");
            }}
            onComplete={handleCreateRestorePoint}
            progress={analyzingProgress}
            isRestoring={isRestoring}
            restoreError={restoreError}
          />
        )}
      </div>
    </AppLayout>
  );
}
