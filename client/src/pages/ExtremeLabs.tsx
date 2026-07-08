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
import { GlassCard, UtilityCard } from "@/components/ui/glass-card";
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
  // All logged-in users can run analysis — it's the funnel
  return status !== "unverified";
}

function canApplyExtremeTweaks(status: EntitlementUiStatus): boolean {
  // trial_active users get full apply access
  return (
    status === "premium" ||
    status === "premium_grace" ||
    status === "trial_active"
  );
}

function elLog(tag: "ExtremeLabs" | "ExtremeLabsApply" | "ExtremeLabsEntitlement", data: Record<string, unknown>) {
  console.log(`[${tag}]`, JSON.stringify(data));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRiskBg(risk: RiskBadge): string {
  switch (risk) {
    case "Safe": return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
    case "Moderate": return "bg-amber-500/10 border-amber-500/30 text-amber-400";
    case "Risky": return "bg-red-500/10 border-red-500/30 text-red-400";
    case "High": return "bg-red-600/10 border-red-600/30 text-red-500";
    default: return "bg-slate-500/10 border-slate-500/30 text-slate-400";
  }
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

// Simulated latency score based on telemetry (0-100, lower is better)
function computeLatencyScore(telemetry: ReturnType<typeof useLiveTelemetry>["telemetry"]): number {
  if (!telemetry) return 50;
  const cpuLoad = (telemetry as any).cpu?.usagePct ?? (telemetry as any).cpu?.load ?? 0;
  const ramPct = (telemetry as any).ram?.usagePct ?? (telemetry as any).ram?.usedPercent ?? 0;
  const score = Math.round((cpuLoad * 0.6 + ramPct * 0.4));
  return Math.min(100, Math.max(10, score));
}

// ── SVG Gauge Component ──────────────────────────────────────────────────────

function LatencyGauge({ value, label }: { value: number; label: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  const angle = (clamped / 100) * 270 - 135;
  const color = clamped < 40 ? "#22c55e" : clamped < 70 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-48 h-28">
        <svg viewBox="0 0 200 120" className="w-full h-full">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#2A313A" strokeWidth="12" strokeLinecap="round" />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(clamped / 100) * 251} 251`}
            style={{ transition: "stroke-dasharray 1s ease-out" }}
          />
          <line
            x1="100" y1="100" x2="100" y2="35"
            stroke={color} strokeWidth="3" strokeLinecap="round"
            transform={`rotate(${angle} 100 100)`}
            style={{ transition: "transform 1s ease-out" }}
          />
          <circle cx="100" cy="100" r="5" fill={color} />
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold" style={{ color }}>{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
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

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        {improved && (
          <span className="text-emerald-400 text-xs font-medium">
            {better === "lower" ? "Reduced" : "Improved"}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12 shrink-0">Before</span>
          <div className="flex-1 h-2 bg-[#1A1F26] rounded-full overflow-hidden">
            <motion.div className="h-full bg-[#3A414D] rounded-full" initial={{ width: 0 }} animate={{ width: `${beforePct}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
          </div>
          <span className="text-xs text-muted-foreground w-16 text-right">{before}{unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12 shrink-0">After</span>
          <div className="flex-1 h-2 bg-[#1A1F26] rounded-full overflow-hidden">
            <motion.div className={cn("h-full rounded-full", improved ? "bg-emerald-500" : "bg-[#00D4FF]")} initial={{ width: 0 }} animate={{ width: `${afterPct}%` }} transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }} />
          </div>
          <span className={cn("text-xs w-16 text-right font-medium", improved ? "text-emerald-400" : "text-[#00D4FF]")}>{after}{unit}</span>
        </div>
      </div>
    </div>
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

  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[#E6EAF0] text-sm">{tweak.name}</span>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", getRiskBg(tweak.risk))}>
              {tweak.risk}
            </span>
            {tweak.nicPropertyKey && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-purple-500/10 border-purple-500/30 text-purple-400 font-medium">
                NIC
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tweak.description}</p>
        </div>
        <div className="shrink-0">
          {isApplied ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Check className="size-3" /> Applied
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground hover:text-red-400 h-7 px-2"
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
              className="text-xs text-muted-foreground hover:text-purple-400 h-7 px-2 border border-[#2A313A]/60"
              onClick={onUpgrade}
            >
              <Lock className="size-3 mr-1" /> Premium
            </Button>
          ) : (
            <Button
              size="sm"
              className="text-xs bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-[#0A0E14] h-7"
              onClick={onApply}
              disabled={isPending || disabled}
            >
              {isPending ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3 mr-1" />}
              Apply
            </Button>
          )}
        </div>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[#00D4FF] mt-3 transition-colors"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
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
            <div className="pt-3 mt-3  space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">What it changes:</span>
                  <p className="text-[#E6EAF0] mt-0.5">{tweak.whatItChanges}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">What may break:</span>
                  <p className="text-red-400/80 mt-0.5">{tweak.whatMayBreak}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">Impact:</span>
                <span style={{ color: getImpactColor(tweak.impact) }} className="font-medium">
                  {getImpactLabel(tweak.impact)}
                </span>
                {tweak.requiresRestart && (
                  <span className="text-amber-400/80 flex items-center gap-1">
                    <RotateCcw className="size-3" /> Restart required
                  </span>
                )}
              </div>
              {tweak.riskAreas.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Risk areas:</span>
                  {tweak.riskAreas.map((area) => (
                    <span key={area} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                      {area}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
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
      <div className="fixed top-0 bottom-0 left-64 right-0 z-[60] flex items-center justify-center bg-[#0A0E14]/90 backdrop-blur-xl">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-6">
          <div className="relative">
            <motion.div className="w-16 h-16 rounded-full border-2 border-[#00D4FF]/30" animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} style={{ borderTopColor: "#00D4FF" }} />
            <Zap className="size-6 text-[#00D4FF] absolute inset-0 m-auto" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-[#E6EAF0]">Analyzing system latency profile...</h3>
            <p className="text-sm text-muted-foreground mt-1">This takes 10-15 seconds</p>
          </div>
          <div className="w-64 h-1.5 bg-[#1A1F26] rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/50 rounded-full" initial={{ width: "0%" }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 bottom-0 left-64 right-0 z-[60] flex items-center justify-center bg-[#0A0E14]/90 backdrop-blur-xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }} className="w-full max-w-lg mx-4">
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 h-1 rounded-full bg-[#1A1F26] overflow-hidden">
              <motion.div
                className="h-full bg-[#00D4FF] rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: step === "warning" ? (n === 1 ? "50%" : "0%") : n <= 2 ? "100%" : "0%" }}
                transition={{ duration: 0.5 }}
              />
            </div>
          ))}
          <span className="text-xs text-muted-foreground w-12 text-right">
            {step === "warning" ? "1/3" : step === "restore" ? "2/3" : "3/3"}
          </span>
        </div>

        <GlassCard className="p-6">
          {step === "warning" && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="size-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="size-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[#E6EAF0]">Before you continue</h2>
                  <p className="text-xs text-muted-foreground">Extreme Labs makes deep system changes</p>
                </div>
              </div>
              <div className="space-y-3 mb-6">
                {warnings.map((w, i) => (
                  <motion.div key={w.title} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1, duration: 0.3 }} className="flex gap-3 p-3 rounded-lg bg-[#1A1F26] border border-[#2A313A]/60">
                    <w.icon className="size-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-[#E6EAF0]">{w.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{w.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button onClick={onNext} className="bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-[#0A0E14]">
                  I understand <ArrowRight className="size-4 ml-1" />
                </Button>
              </div>
            </>
          )}

          {step === "restore" && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Shield className="size-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[#E6EAF0]">Create restore point</h2>
                  <p className="text-xs text-muted-foreground">Required before any changes can be made</p>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-[#1A1F26] border border-[#2A313A]/60 mb-6">
                <p className="text-sm text-[#E6EAF0] mb-2">A system restore point lets you undo all changes instantly if anything goes wrong.</p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2"><Check className="size-3 text-emerald-400" /> Captures current registry state</li>
                  <li className="flex items-center gap-2"><Check className="size-3 text-emerald-400" /> One-click revert from this page</li>
                  <li className="flex items-center gap-2"><Check className="size-3 text-emerald-400" /> Does not delete personal files</li>
                </ul>
              </div>
              {restoreError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4 text-sm text-red-400">
                  {restoreError}
                </div>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
                  <ArrowLeft className="size-4 mr-1" /> Back
                </Button>
                <Button onClick={onComplete} disabled={isRestoring} className="bg-emerald-500 hover:bg-emerald-500/90 text-white">
                  {isRestoring ? <><Loader2 className="size-4 animate-spin mr-1" /> Creating...</> : <><Shield className="size-4 mr-1" /> Create Restore Point</>}
                </Button>
              </div>
            </>
          )}
        </GlassCard>
      </motion.div>
    </div>
  );
}

// ── Cross-page slider sync helpers ───────────────────────────────────────────
// Maps EL sliderTweakId → the paired main-store slider id + values used for
// apply (recommended gaming value) and revert (Windows default).
const EL_SLIDER_APPLY: Record<string, { mainId: string; applyValue: number }> = {
  NetworkThrottlingIndex: { mainId: "net-throttle-index",   applyValue: 4294967295 },
  win32PrioritySeparation: { mainId: "win32-priority-sep",  applyValue: 26 },
  SystemResponsiveness:    { mainId: "sys-responsiveness",  applyValue: 15 },
};
const EL_SLIDER_REVERT: Record<string, { mainId: string; defaultValue: number }> = {
  NetworkThrottlingIndex: { mainId: "net-throttle-index",   defaultValue: 10 },
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

// ── Cross-page preset sync helpers ─────────────────────────────────────────────────────────────────
// Maps EL presetTweakId → the paired main-store preset id + default option id
// used for apply (recommended value) and revert (Windows default).
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
    <div className="space-y-6">
      {/* Free-user notice banner */}
      {!canApply && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-3">
            <Lock className="size-4 text-purple-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-[#E6EAF0]">
                Analysis available on free plans. Applying optimization packs requires Premium.
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Browse tweaks, view impact estimates, and explore recommendations below.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-purple-500 hover:bg-purple-500/90 text-white shrink-0 text-xs"
            onClick={onUpgrade}
          >
            Upgrade
          </Button>
        </div>
      )}

      {/* Top stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <UtilityCard className="p-4 flex flex-col items-center justify-center">
          <Gauge className="size-5 text-[#00D4FF] mb-2" />
          <div className="text-2xl font-bold text-[#E6EAF0]">{appliedCount}</div>
          <div className="text-xs text-muted-foreground">Tweaks applied</div>
        </UtilityCard>
        <UtilityCard className="p-4 flex flex-col items-center justify-center">
          <Activity className="size-5 text-amber-400 mb-2" />
          <div className="text-2xl font-bold text-[#E6EAF0]">{totalCount}</div>
          <div className="text-xs text-muted-foreground">Total tweaks</div>
        </UtilityCard>
        <UtilityCard className="p-4 flex flex-col items-center justify-center">
          <Network className="size-5 text-purple-400 mb-2" />
          <div className="text-2xl font-bold text-[#E6EAF0]">{nicCount}</div>
          <div className="text-xs text-muted-foreground">NIC properties</div>
        </UtilityCard>
        <UtilityCard className="p-4 flex flex-col items-center justify-center">
          <Timer className="size-5 text-emerald-400 mb-2" />
          <div className="text-2xl font-bold text-[#E6EAF0]">{appliedCount > 0 ? "Active" : "Ready"}</div>
          <div className="text-xs text-muted-foreground">Session status</div>
        </UtilityCard>
      </div>

      {/* Graphs row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="p-5 flex flex-col items-center">
          <h3 className="text-sm font-medium text-[#E6EAF0] mb-4 flex items-center gap-2">
            <Gauge className="size-4 text-[#00D4FF]" /> Latency Pressure
          </h3>
          <LatencyGauge value={latencyScore} label="System Load Score (lower is better)" />
          <p className="text-[10px] text-muted-foreground mt-3 text-center max-w-[200px]">
            Based on live CPU load and RAM pressure. Not a true latency measurement.
          </p>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-sm font-medium text-[#E6EAF0] mb-4 flex items-center gap-2">
            <TrendingDown className="size-4 text-emerald-400" /> Estimated Impact
          </h3>
          <div className="space-y-4">
            <ImpactBar label="Scheduling delay" before={8} after={appliedCount > 2 ? 5 : 8} unit="ms" better="lower" />
            <ImpactBar label="Timer resolution" before={15} after={appliedCount > 0 ? 1 : 15} unit="ms" better="lower" />
            <ImpactBar label="Network throttling" before={60} after={appliedCount > 3 ? 30 : 60} unit="%" better="lower" />
          </div>
          <p className="text-[10px] text-muted-foreground mt-4">
            Estimates based on applied tweaks. Actual results are hardware-dependent.
          </p>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-sm font-medium text-[#E6EAF0] mb-4 flex items-center gap-2">
            <Flame className="size-4 text-red-400" /> Risk Distribution
          </h3>
          <div className="space-y-3">
            {(["Safe", "Moderate", "Risky", "High"] as RiskBadge[]).map((risk) => {
              const count = EXTREME_TWEAKS.filter((t) => t.risk === risk).length;
              const pct = (count / EXTREME_TWEAKS.length) * 100;
              return (
                <div key={risk} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: getRiskColor(risk) }} className="font-medium">{risk}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-1.5 bg-[#1A1F26] rounded-full overflow-hidden">
                    <motion.div className="h-full rounded-full" style={{ backgroundColor: getRiskColor(risk) }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      {/* Filters + Revert */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="size-4 text-muted-foreground" />
          {(["all", "Safe", "Moderate", "Risky", "High", "nic"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onSetFilter(f)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-md border transition-colors",
                activeFilter === f
                  ? "bg-[#00D4FF]/10 border-[#00D4FF]/30 text-[#00D4FF]"
                  : "bg-transparent border-[#2A313A]/60 text-muted-foreground hover:text-[#E6EAF0]"
              )}
            >
              {f === "nic" ? "NIC" : f === "all" ? "All" : f}
            </button>
          ))}
        </div>
        {appliedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRevertAll}
            className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <RotateCcw className="size-3 mr-1" /> Revert All
          </Button>
        )}
      </div>

      {/* Category sections */}
      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([category, tweaks]) => (
          <div key={category}>
            <h3 className="text-sm font-semibold text-[#E6EAF0] mb-3 flex items-center gap-2">
              {category === "Latency Core" && <Timer className="size-4 text-[#00D4FF]" />}
              {category === "Scheduler / CPU" && <Cpu className="size-4 text-amber-400" />}
              {category === "Gaming / Capture" && <Zap className="size-4 text-purple-400" />}
              {category === "Network Latency" && <Network className="size-4 text-emerald-400" />}
              {category === "Service Weight" && <Activity className="size-4 text-blue-400" />}
              {category === "Startup / Vendor Weight" && <Shield className="size-4 text-slate-400" />}
              {category}
              <span className="text-xs text-muted-foreground font-normal">({tweaks.length})</span>
            </h3>
            <div className="space-y-3">
              {tweaks.map((tweak) => (
                <TweakCard
                  key={tweak.id}
                  tweak={tweak}
                  isApplied={appliedTweaks.has(tweak.id) || (!!tweak.registryTweakId && !!mainTweaks[tweak.registryTweakId]) || isELSliderApplied(tweak.sliderTweakId, mainSliderValues) || isELPresetApplied(tweak.presetTweakId, mainPresetOptions)}
                  isPending={isApplyingId === tweak.id}
                  onApply={() => onApplyTweak(tweak.id)}
                  onUndo={() => onUndoTweak(tweak.id)}
                  disabled={isApplyingId !== null && isApplyingId !== tweak.id}
                  premiumLocked={!canApply}
                  onUpgrade={onUpgrade}
                />
              ))}
            </div>
          </div>
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
  // Subscribe to the main Tweaks store so we can reflect state cross-page
  const mainTweaks = useStore(s => s.tweaks);
  const mainSliderValues = useStore(s => s.sliderValues);
  const mainPresetOptions = useStore(s => s.presetOptions);

  // Ref so the restore-point progress interval is always cleanable on unmount
  const restoreIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [wizardStep, setWizardStep] = useState<WizardStep>("warning");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [analyzingProgress, setAnalyzingProgress] = useState(0);
  const [isApplying, setIsApplying] = useState<string | null>(null);
  const [appliedTweaks, setAppliedTweaks] = useState<Set<string>>(() => {
    // Hydrate from localStorage so applied state survives app restarts.
    // The actual Windows registry / NIC changes are persistent; the UI just
    // needs to remember which tweaks it applied.
    try {
      const stored = localStorage.getItem("extreme-labs-applied");
      if (stored) return new Set<string>(JSON.parse(stored));
    } catch (_) {}
    return new Set<string>();
  });
  const [activeFilter, setActiveFilter] = useState<"all" | RiskBadge | "nic">("all");

  // Keep localStorage in sync whenever appliedTweaks changes.
  useEffect(() => {
    try {
      if (appliedTweaks.size > 0) {
        localStorage.setItem("extreme-labs-applied", JSON.stringify([...appliedTweaks]));
      } else {
        localStorage.removeItem("extreme-labs-applied");
      }
    } catch (_) {}
  }, [appliedTweaks]);

  // Cleanup: clear the restore-point progress interval on unmount so it can
  // never fire state-setter calls on an unmounted component.
  useEffect(() => {
    return () => {
      if (restoreIntervalRef.current) {
        clearInterval(restoreIntervalRef.current);
        restoreIntervalRef.current = null;
      }
    };
  }, []);

  // When the premium revert engine reverts Extreme Labs tweaks (trial expiry /
  // downgrade), it dispatches "sc:el-reverted" and clears localStorage.
  // Sync our in-memory appliedTweaks state so the UI immediately reflects the
  // revert without requiring a page refresh.
  useEffect(() => {
    const handler = () => setAppliedTweaks(new Set());
    window.addEventListener('sc:el-reverted', handler);
    return () => window.removeEventListener('sc:el-reverted', handler);
  }, []);

  // Live registry/system check on mount (Electron only).
  // Reads each tweak's ACTUAL state from the registry so that deleting
  // %appdata%\SwitchControl doesn't cause applied tweaks to show as "off".
  // This overwrites the localStorage-hydrated state with the ground truth.
  const liveCheckDoneRef = useRef(false);
  useEffect(() => {
    if (!isElectron || !electronApi?.extremeLabs?.checkAllStatus) return;
    if (liveCheckDoneRef.current) return;
    liveCheckDoneRef.current = true;

    (async () => {
      try {
        const result = await electronApi.extremeLabs.checkAllStatus();
        if (!result?.ok || !result.status) return;
        const live = new Set<string>();
        for (const [id, isApplied] of Object.entries(result.status as Record<string, boolean>)) {
          if (isApplied) live.add(id);
        }
        // Always replace with live registry truth — even if localStorage had data
        setAppliedTweaks(live);
      } catch {
        // non-fatal: localStorage state already shown as fallback
      }
    })();
  }, [isElectron, electronApi]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlocked = localStorage.getItem("extreme-labs-unlocked") === "true";
    if (unlocked) {
      setIsUnlocked(true);
    } else if (canApply) {
      // Auto-restore after AppData/localStorage deletion: premium users have
      // already accepted the warning modal on a previous session. The server
      // confirms their entitlement, so skip the modal and restore access.
      setIsUnlocked(true);
      localStorage.setItem("extreme-labs-unlocked", "true");
    }

    elLog("ExtremeLabs", {
      userTier: entitlementStatus,
      trial: entitlementStatus === "trial_active",
      premium: entitlementStatus === "premium" || entitlementStatus === "premium_grace",
      desktopMode: isElectron,
      canApply,
      canAnalyze,
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
          setTimeout(() => {
            setIsUnlocked(true);
            localStorage.setItem("extreme-labs-unlocked", "true");
            setWizardStep("dashboard");
            toast({ title: "Restore point created", description: "Extreme Labs is now unlocked." });
        logHistory("Extreme Labs: Restore Point Created", "Extreme Labs", "Created", "System restore point saved before tuning");
          }, 400);
        }
        setAnalyzingProgress(Math.min(100, p));
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
            toast({
              title: "Administrator access required",
              description: "This optimization requires the app to be run as Administrator. Right-click the app and choose 'Run as administrator'.",
              variant: "destructive",
            });
            elLog("ExtremeLabsApply", { requested: [id], applied: 0, failed: 0, blocked: 1, adminRequired: 1 });
            return;
          }
          if (item.notSupported) {
            toast({
              title: "Not supported on this build",
              description: item.reason || "This tweak requires a helper agent that is not bundled in this version.",
              variant: "destructive",
            });
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
      // Bridge to main Tweaks store so the Tweaks page reflects this change too
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
      useTweakOwnershipStore.getState().recordExtremeLabsApply(id, EXTREME_TWEAKS.find(t => t.id === id)?.label ?? id);
      toast({ title: "Tweak applied", description: "Change is active. Monitor for issues." });
      logHistory(`Extreme Labs: ${EXTREME_TWEAKS.find(t => t.id === id)?.label ?? id}`, "Extreme Labs", "Applied", `Tweak ID: ${id}`);
      elLog("ExtremeLabsApply", { requested: [id], applied: 1, failed: 0, blocked: 0, adminRequired: 0 });
    } catch (e: any) {
      toast({ title: "Apply failed", description: e?.message, variant: "destructive" });
      elLog("ExtremeLabsApply", { requested: [id], applied: 0, failed: 1, blocked: 0, adminRequired: 0, error: e?.message });
    } finally {
      setIsApplying(null);
    }
  }, [canApply, isElectron, electronApi, toast, openUpgradeModal, entitlementStatus]);

  const handleUndoTweak = useCallback(async (id: string) => {
    if (!isElectron) {
      toast({ title: "Desktop app required", description: "Reverting tweaks requires the SwitchControl desktop app.", variant: "destructive" });
      return;
    }

    setIsApplying(id);
    try {
      if (electronApi) {
        const tweak = EXTREME_TWEAKS.find((t) => t.id === id);
        if (!tweak) throw new Error("Tweak not found");
        const mappedRegistry = tweak.registryTweakId;
        const mappedSlider = tweak.sliderTweakId;
        const mappedPreset = tweak.presetTweakId;
        if (mappedRegistry && (window as any).electronAPI?.tweaks?.execute) {
          await (window as any).electronAPI.tweaks.execute(mappedRegistry, "revert");
        } else if (mappedSlider && (window as any).electronAPI?.tweaks?.resetValue) {
          await (window as any).electronAPI.tweaks.resetValue(mappedSlider);
        } else if (mappedPreset && (window as any).electronAPI?.presetTweaks?.revert) {
          await (window as any).electronAPI.presetTweaks.revert(mappedPreset);
        } else if (tweak.nicPropertyKey && (window as any).electronAPI?.nic?.resetProperty) {
          const adapters = await (window as any).electronAPI.nic.getAdapters();
          const physical = adapters.find((a: any) => a.status === 'Up');
          if (physical) {
            await (window as any).electronAPI.nic.resetProperty(physical.name, tweak.nicPropertyKey);
          }
        }
      }
      setAppliedTweaks((prev) => { const next = new Set(prev); next.delete(id); return next; });
      // Bridge to main Tweaks store
      const undoTweak = EXTREME_TWEAKS.find(x => x.id === id);
      if (undoTweak?.registryTweakId) useStore.getState().setTweak(undoTweak.registryTweakId, false);
      if (undoTweak?.sliderTweakId) {
        const sv = EL_SLIDER_REVERT[undoTweak.sliderTweakId];
        if (sv) useStore.getState().setSliderValue(sv.mainId, sv.defaultValue);
      }
      if (undoTweak?.presetTweakId) {
        const pv = EL_PRESET_REVERT[undoTweak.presetTweakId];
        if (pv) useStore.getState().setPresetOption(pv.mainId, pv.defaultOptionId);
      }
      useTweakOwnershipStore.getState().recordExtremeLabsRevertSuccess(id);
      toast({ title: "Tweak reverted", description: "Change has been undone." });
      logHistory(`Extreme Labs: ${EXTREME_TWEAKS.find(t => t.id === id)?.label ?? id} Reverted`, "Extreme Labs", "Reverted", `Tweak ID: ${id}`);
    } catch (e: any) {
      toast({ title: "Revert failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsApplying(null);
    }
  }, [isElectron, electronApi, toast]);

  const handleRevertAll = useCallback(async () => {
    if (!isElectron) {
      toast({ title: "Desktop app required", description: "Reverting tweaks requires the SwitchControl desktop app.", variant: "destructive" });
      return;
    }
    try {
      if (electronApi) {
        const result = await electronApi.extremeLabs.restoreBaseline();
        if (!result.ok) throw new Error(result.error || "Revert failed");

        const batchResult: ApplyBatchResult = {
          applied: 0,
          failed: result.results?.filter((r: any) => !r.reverted).length ?? 0,
          skipped: 0,
          adminBlocked: 0,
          notSupported: 0,
          details: result.results ?? [],
        };
        elLog("ExtremeLabsApply", { action: "revertAll", ...batchResult });
      }
      const store = useTweakOwnershipStore.getState();
      for (const id of appliedTweaks) store.recordExtremeLabsRevertSuccess(id);
      // Bridge: clear all EL-applied registry tweaks from the main Tweaks store
      const mainStore = useStore.getState();
      for (const id of appliedTweaks) {
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
      }
      setAppliedTweaks(new Set());
      toast({ title: "All tweaks reverted", description: "System restored to baseline." });
      logHistory("Extreme Labs: Revert All", "Extreme Labs", "Reverted All", "All lab tweaks restored to baseline");
    } catch (e: any) {
      toast({ title: "Revert failed", description: e?.message, variant: "destructive" });
    }
  }, [isElectron, electronApi, toast]);

  // Unverified = show full premium wall (not logged in)
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

  // Free / trial_expired — show the page but Apply is locked
  // Premium / trial_active — show with full access (gated behind wizard if not yet unlocked)
  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <PageHeader
          icon={Zap}
          iconClassName="text-[#00D4FF]"
          title={
            <span className="flex items-center gap-2">
              Extreme Labs
              <span className="text-[10px] px-2 py-0.5 rounded border bg-red-500/10 border-red-500/20 text-red-400 font-medium tracking-wide">
                ADVANCED
              </span>
            </span>
          }
          subtitle="Hardware-dependent latency tuning with honest impact estimates. Always measure before and after."
          actions={
            appliedTweaks.size > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevertAll}
                className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <RotateCcw className="size-3 mr-1" /> Revert All
              </Button>
            ) : null
          }
        />

        <div className="mt-6">
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
                  // Free users: acknowledge disclaimer and browse in read-only mode.
                  // The premium gate fires per-tweak when they click Apply — not here.
                  elLog("ExtremeLabsEntitlement", { action: "entryWizard", allowed: true, reason: "browse_mode" });
                  setIsUnlocked(true);
                  return;
                }
                setWizardStep("restore");
              }}
              onBack={() => setWizardStep("warning")}
              onComplete={handleCreateRestorePoint}
              progress={analyzingProgress}
              isRestoring={isRestoring}
              restoreError={restoreError}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
