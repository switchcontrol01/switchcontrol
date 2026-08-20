/**
 * DashboardInsights
 *
 * Scroll-depth section below the main dashboard. All data is real or
 * honestly labeled — nothing is invented. Sections:
 *   1. Live Interference Meter
 *   2. Since Last Session
 *   3. Recent Events feed
 *   4. Active Analysis strip
 *   5. Why Your FPS Feels Off + Current Bottleneck
 *   6. Last Action Result
 */

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { motion, AnimatePresence, useMotion } from "@/lib/motionTokens";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { useAdvisorStore } from "@/stores/advisorStore";
import { useBiosAdvisorStore } from "@/stores/biosAdvisorStore";
import { useDashboardActivityStore } from "@/stores/dashboardActivityStore";
import { useStore } from "@/lib/store";
import {
  computeInterference,
  computeBottleneck,
  computeFpsExplanation,
  computeGraphStability,
} from "@/lib/systemStateEngine";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Clock,
  Gauge,
  Minus,
  Radio,
  RotateCcw,
  Shield,
  Trash2,
  TrendingUp,
  Wifi,
  Zap,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function sessionAge(ms: number): string {
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   "text-emerald-400 border-emerald-500/25 bg-emerald-500/6",
  medium: "text-amber-400   border-amber-500/25   bg-amber-500/6",
  low:    "text-[#6B7380]    border-[#2A313A]        bg-[#1A1F26]",
};

const EVENT_ICONS: Record<string, ReactNode> = {
  tweak_applied:      <Zap className="size-3 text-primary" />,
  tweak_reverted:     <Minus className="size-3 text-[#6B7380]" />,
  cleaner_ran:        <CheckCircle className="size-3 text-emerald-400" />,
  memory_cleaned:     <CheckCircle className="size-3 text-teal-400" />,
  ai_scan_completed:  <Activity className="size-3 text-primary" />,
  bios_scan_completed:<TrendingUp className="size-3 text-[#00D4FF]" />,
  spike_detected:     <AlertTriangle className="size-3 text-amber-400" />,
  stability_restored: <CheckCircle className="size-3 text-emerald-400" />,
};

/** Map History page names → icon so every user action gets a meaningful glyph. */
const PAGE_ICONS: Record<string, ReactNode> = {
  "Tweaks":        <Zap className="size-3 text-[#00D4FF]" />,
  "Power Plan":    <Zap className="size-3 text-amber-400" />,
  "Network":       <Wifi className="size-3 text-sky-400" />,
  "NIC Tuning":    <Radio className="size-3 text-sky-400" />,
  "Cleaner":       <CheckCircle className="size-3 text-emerald-400" />,
  "Debloat":       <Trash2 className="size-3 text-orange-400" />,
  "Startup":       <Clock className="size-3 text-slate-400" />,
  "Process Manager":<Gauge className="size-3 text-slate-400" />,
  "BIOS Advisor":  <TrendingUp className="size-3 text-[#00D4FF]" />,
  "AI Advisor":    <Activity className="size-3 text-primary" />,
  "Security":      <Shield className="size-3 text-emerald-400" />,
  "History":       <RotateCcw className="size-3 text-[#6B7380]" />,
  "Dashboard":     <Gauge className="size-3 text-primary" />,
};

// ── 1. Interference Meter ─────────────────────────────────────────────────────

function InterferenceMeter() {
  const { telemetry } = useLiveTelemetry();
  const { prefersReducedMotion } = useMotion();
  const interference = computeInterference(telemetry);

  const barColor =
    interference.level === "high"
      ? "bg-red-500"
      : interference.level === "medium"
      ? "bg-amber-400"
      : "bg-emerald-500";

  const glowColor =
    interference.level === "high"
      ? "rgba(239,68,68,0.4)"
      : interference.level === "medium"
      ? "rgba(251,191,36,0.35)"
      : "rgba(52,211,153,0.3)";

  return (
    <div className="space-y-2" data-testid="section-interference-meter">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#E6EAF0] flex items-center gap-1.5">
          <Gauge className="size-3 text-muted-foreground" />
          System Interference
        </span>
        <AnimatePresence mode="wait">
          <motion.span
            key={interference.label}
            className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full border",
              interference.level === "high"
                ? "text-red-400 border-red-500/25 bg-red-500/8"
                : interference.level === "medium"
                ? "text-amber-400 border-amber-500/25 bg-amber-500/8"
                : "text-emerald-400 border-emerald-500/25 bg-emerald-500/8"
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            data-testid="text-interference-label"
          >
            {interference.label}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Bar */}
      <div className="h-1.5 rounded-full bg-[#21262D] relative overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", barColor)}
          style={{ boxShadow: `0 0 8px ${glowColor}` }}
          animate={{ width: `${interference.score}%` }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
          }
          data-testid="meter-interference-bar"
        />
      </div>

      <p className="text-[10px] text-muted-foreground/70" data-testid="text-interference-sublabel">
        {interference.sublabel}
      </p>
    </div>
  );
}

// ── 2. Since Last Session ─────────────────────────────────────────────────────

function SinceLastSession() {
  const { account } = useStore();
  const { report } = useAdvisorStore();
  const { scores } = useBiosAdvisorStore();
  const { telemetry } = useLiveTelemetry();
  const { computeDelta, saveSessionSnapshot } = useDashboardActivityStore();

  const currentSnap = useMemo(
    () => ({
      avgCpuLoad: telemetry?.cpu.load,
      avgRamPct: telemetry?.ram.usedPercent,
      aiScore: report?.score ?? undefined,
      biosScore: scores?.competitiveReadiness ?? undefined,
      tweaksApplied: account.stats.tweaksApplied,
    }),
    [telemetry?.cpu.load, telemetry?.ram.usedPercent, report?.score, scores?.competitiveReadiness, account.stats.tweaksApplied]
  );

  // Ref keeps the snapshot current so the 5s timer always saves the live value,
  // not the stale one captured at mount when telemetry may still be undefined.
  const currentSnapRef = useRef(currentSnap);
  useEffect(() => { currentSnapRef.current = currentSnap; }, [currentSnap]);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveSessionSnapshot(currentSnapRef.current);
    }, 5000);
    return () => clearTimeout(timer);
  }, [saveSessionSnapshot]);

  const delta = computeDelta();

  if (!delta) {
    return (
      <div className="text-[11px] text-muted-foreground/60 text-center py-2" data-testid="text-last-session-empty">
        First session — baseline will be recorded
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="section-since-last-session-items">
      <p className="text-[10px] text-muted-foreground/50 mb-2">
        vs session {sessionAge(delta.sessionAge)}
      </p>
      {delta.items.map((item, i) => (
        <div
          key={i}
          className="flex items-center justify-between"
          data-testid={`delta-item-${i}`}
        >
          <span className="text-[11px] text-[#E6EAF0]">{item.label}</span>
          <span
            className={cn(
              "text-[11px] font-medium flex items-center gap-1",
              item.direction === "up"
                ? "text-emerald-400"
                : item.direction === "down"
                ? "text-red-400"
                : "text-muted-foreground"
            )}
          >
            {item.direction === "up" && <ArrowUp className="size-2.5" />}
            {item.direction === "down" && <ArrowDown className="size-2.5" />}
            {item.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── 3. Recent Events ──────────────────────────────────────────────────────────

function RecentEvents() {
  // Pull the full persistent history (all pages: tweaks, power plan, cleaner, etc.)
  const historyItems = useStore((s) => s.history);
  // Ephemeral session events (spikes, memory cleaned) that aren't in history
  const { events: sessionEvents } = useDashboardActivityStore();
  const { prefersReducedMotion } = useMotion();

  // Merge: convert history items → display rows, then layer in session-only events
  const merged = useMemo(() => {
    // History items (persistent, covers every page action)
    const fromHistory = historyItems.map((h) => {
      const rawTs = typeof h.timestamp === "number"
        ? h.timestamp
        : new Date(h.timestamp).getTime();
      const ts = Number.isNaN(rawTs) ? Date.now() : rawTs;
      return {
        id: h.id,
        label: h.action,
        detail: h.result !== "Applied" && h.result !== "Success" ? h.result : undefined,
        ts,
        icon: PAGE_ICONS[h.page] ?? <Activity className="size-3 text-muted-foreground" />,
      };
    });

    // Session-only events not covered by history (spikes, stability restored,
    // memory cleaned). Exclude bios/ai scan — those are too noisy and already
    // show as history actions when the user explicitly ran them.
    const ephemeralAllowed = new Set(["spike_detected", "stability_restored", "memory_cleaned"]);
    const fromSession = sessionEvents
      .filter((e) => ephemeralAllowed.has(e.type))
      .map((e) => ({
        id: e.id,
        label: e.label,
        detail: e.detail,
        ts: e.ts,
        icon: EVENT_ICONS[e.type] ?? <Activity className="size-3 text-muted-foreground" />,
      }));

    // Merge, sort newest-first, deduplicate by id, cap at 10
    return [...fromHistory, ...fromSession]
      .sort((a, b) => b.ts - a.ts)
      .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i)
      .slice(0, 10);
  }, [historyItems, sessionEvents]);

  if (merged.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground/50 text-center py-3" data-testid="text-events-empty">
        Events appear as you use the app
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="section-recent-events-list">
      <AnimatePresence initial={false}>
        {merged.map((evt) => (
          <motion.div
            key={evt.id}
            className="flex items-start gap-2.5"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
            data-testid={`event-item-${evt.id}`}
          >
            <span className="mt-0.5 shrink-0">{evt.icon}</span>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] text-[#E6EAF0] leading-tight">{evt.label}</span>
              {evt.detail && (
                <span className="text-[10px] text-muted-foreground/60 ml-1.5">{evt.detail}</span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground/50 shrink-0 mt-0.5 tabular-nums">
              {relativeTime(evt.ts)}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── 4. Active Analysis strip ──────────────────────────────────────────────────

function ActiveAnalysisStrip() {
  const { telemetry, spikes, history } = useLiveTelemetry();
  const { runState } = useAdvisorStore();
  const { prefersReducedMotion } = useMotion();

  const items = useMemo(() => {
    const out: string[] = [];

    if (runState === "collecting" || runState === "evaluating") {
      out.push("AI analysis in progress");
    }

    if (spikes.cpu) out.push("Tracking CPU spike activity");
    else if (telemetry && telemetry.cpu.load > 65) out.push("Monitoring elevated CPU load");

    if (spikes.ram) out.push("Monitoring RAM spike");
    else if (telemetry && telemetry.ram.usedPercent > 80) out.push("Watching memory pressure");

    if (telemetry?.load_trend === "rising") out.push("Load trend: rising");

    const stability = computeGraphStability(history.cpu);
    if (stability.zone !== "stable") out.push(`Graph: ${stability.label.toLowerCase()}`);

    if (out.length === 0) out.push("Monitoring baseline stability");

    return out.slice(0, 3);
  }, [telemetry, spikes, history.cpu, runState]);

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="section-active-analysis">
      {items.map((item, i) => (
        <motion.span
          key={item}
          className="flex items-center gap-1 text-[10px] text-[#A0A8B3] px-2.5 py-1 rounded-full border border-[#2A313A] bg-white/[0.025]"
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2, delay: i * 0.05 }}
          data-testid={`analysis-pill-${i}`}
        >
          <Radio className="size-2.5 text-primary/60" />
          {item}
        </motion.span>
      ))}
    </div>
  );
}

// ── 5. Why FPS Feels Off + Bottleneck ─────────────────────────────────────────

function FpsAndBottleneck() {
  const { telemetry, spikes } = useLiveTelemetry();
  const { report } = useAdvisorStore();

  const fps = computeFpsExplanation(
    telemetry,
    spikes,
    report?.topFailed ?? null
  );
  const bottleneck = computeBottleneck(telemetry);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Why FPS feels off */}
      <div
        className={cn(
          "p-3.5 rounded-lg border space-y-2",
          fps.hasIssue
            ? "border-amber-500/20 bg-amber-500/[0.04]"
            : "border-emerald-500/20 bg-emerald-500/[0.04]"
        )}
        data-testid="card-fps-explanation"
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
          Why your FPS feels off
        </p>
        <AnimatePresence mode="wait">
          <motion.p
            key={fps.hasIssue ? "fps-issue" : "fps-healthy"}
            className={cn(
              "text-xs leading-relaxed font-medium",
              fps.hasIssue ? "text-amber-200/90" : "text-emerald-300/90"
            )}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            data-testid="text-fps-reason"
          >
            {fps.reason}
          </motion.p>
        </AnimatePresence>
        <span
          className={cn(
            "inline-block text-[9px] font-medium px-1.5 py-0.5 rounded border",
            CONFIDENCE_COLORS[fps.confidence]
          )}
          data-testid="text-fps-confidence"
        >
          Confidence: {fps.confidence}
        </span>
      </div>

      {/* Current Bottleneck */}
      <div
        className={cn(
          "p-3.5 rounded-lg border space-y-2",
          bottleneck.hasBottleneck
            ? "border-red-500/20 bg-red-500/[0.04]"
            : "border-[#2A313A] bg-white/[0.025]"
        )}
        data-testid="card-bottleneck"
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
          Current bottleneck
        </p>
        <AnimatePresence mode="wait">
          <motion.div
            key={bottleneck.hasBottleneck ? "bn-active" : "bn-none"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <p
              className={cn(
                "text-xs font-medium",
                bottleneck.hasBottleneck ? "text-red-300/90" : "text-[#A0A8B3]"
              )}
              data-testid="text-bottleneck-label"
            >
              {bottleneck.label}
            </p>
            {bottleneck.hasBottleneck && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {bottleneck.resource}: {bottleneck.value}{bottleneck.unit} ·{" "}
                <span
                  className={cn(
                    "inline-block text-[9px] font-medium px-1.5 py-0.5 rounded border",
                    CONFIDENCE_COLORS[bottleneck.confidence]
                  )}
                  data-testid="text-bottleneck-confidence"
                >
                  {bottleneck.confidence}
                </span>
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── 6. Last Action Result ─────────────────────────────────────────────────────

function LastActionResult() {
  const { lastAction } = useDashboardActivityStore();

  if (!lastAction) return null;

  const age = relativeTime(lastAction.ts);
  const isPos = lastAction.positive !== false;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border",
        isPos
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : "border-[#2A313A] bg-[#1A1F26]"
      )}
      data-testid="card-last-action"
    >
      <CheckCircle
        className={cn("size-4 mt-0.5 shrink-0", isPos ? "text-emerald-400" : "text-muted-foreground")}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-[#E6EAF0]">{lastAction.action}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">{lastAction.result}</p>
      </div>
      <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums mt-0.5">{age}</span>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export function DashboardInsights() {
  const { prefersReducedMotion } = useMotion();
  const { lastAction } = useDashboardActivityStore();

  const reveal = (delay: number) => ({
    initial: { opacity: 0, y: prefersReducedMotion ? 0 : 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-40px" },
    transition: { duration: prefersReducedMotion ? 0 : 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <div className="space-y-4" data-testid="section-dashboard-insights">
      {/* Section heading */}
      <motion.h2
        className="text-lg font-semibold tracking-tight text-[#E6EAF0] flex items-center gap-2"
        {...reveal(0)}
      >
        <TrendingUp className="size-5 text-primary" />
        System Intelligence
      </motion.h2>

      {/* Row 1 — Interference meter + Since Last Session */}
      <div className="grid gap-4 md:grid-cols-2">
        <motion.div {...reveal(0.05)}>
          <GlassCard className="p-4 space-y-4" hoverEffect={false}>
            <InterferenceMeter />
          </GlassCard>
        </motion.div>

        <motion.div {...reveal(0.08)}>
          <GlassCard className="p-4" hoverEffect={false} data-testid="card-since-last-session">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold flex items-center gap-1.5 mb-3">
              <Clock className="size-3" />
              Since last session
            </h3>
            <SinceLastSession />
          </GlassCard>
        </motion.div>
      </div>

      {/* Row 2 — FPS explanation + Bottleneck */}
      <motion.div {...reveal(0.1)}>
        <FpsAndBottleneck />
      </motion.div>

      {/* Row 3 — Recent Events */}
      <motion.div {...reveal(0.13)}>
        <GlassCard className="p-4" hoverEffect={false} data-testid="card-recent-events">
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold flex items-center gap-1.5 mb-3">
            <Activity className="size-3" />
            Recent events
          </h3>
          <RecentEvents />
        </GlassCard>
      </motion.div>

      {/* Row 4 — Active Analysis */}
      <motion.div {...reveal(0.15)}>
        <GlassCard className="p-4" hoverEffect={false} data-testid="card-active-analysis">
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold flex items-center gap-1.5 mb-3">
            <Radio className="size-3" />
            Active analysis
          </h3>
          <ActiveAnalysisStrip />
        </GlassCard>
      </motion.div>

      {/* Row 5 — Last Action Result (conditional) */}
      {lastAction && (
        <motion.div {...reveal(0.17)}>
          <GlassCard className="p-4" hoverEffect={false} data-testid="card-last-action-wrapper">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold flex items-center gap-1.5 mb-3">
              <CheckCircle className="size-3" />
              Last action
            </h3>
            <LastActionResult />
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}
