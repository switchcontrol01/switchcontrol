/**
 * PerformanceLab — dashboard intelligence hub
 *
 * Panels:
 *   1. Stability Score       — real-time SVG arc gauge + source analysis
 *   2. Active Problems       — backend-derived issue list with severity
 *   3. Input Latency         — conservatively estimated, honestly labeled
 *   4. System DNA            — behavioral fingerprint from live telemetry
 *   5. What Just Caused That — on-demand event correlation
 *   6. Smart RAM Analysis    — reclaimable standby + risk + impact
 *
 * All data: backend-derived from getCachedSnapshot(), no fake numbers.
 */

import { useState, useEffect, useRef, type ReactNode } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import {
  useDashboardIntelligence,
  type InstabilityData,
  type ActiveProblemsData,
  type LatencyData,
  type SystemDNAData,
  type CausationData,
  type RAMAnalysisData,
  type ActiveProblem,
} from "@/hooks/useDashboardIntelligence";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Brain,
  CheckCircle,
  ChevronRight,
  Cpu,
  Gauge,
  HardDrive,
  Minus,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

// ── Utility helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 85) return { text: "text-emerald-400", hex: "#34d399", glow: "rgba(52,211,153,0.18)", border: "border-emerald-500/20", bg: "bg-emerald-500/[0.06]" };
  if (score >= 65) return { text: "text-amber-400",   hex: "#fbbf24", glow: "rgba(251,191,36,0.18)", border: "border-amber-500/20",   bg: "bg-amber-500/[0.06]"   };
  return                 { text: "text-red-400",      hex: "#f87171", glow: "rgba(248,113,113,0.18)", border: "border-red-500/20",     bg: "bg-red-500/[0.06]"     };
}

function severityColor(s: "high" | "warning" | "info") {
  if (s === "high")    return { dot: "bg-red-500",    text: "text-red-400",    border: "border-red-500/25",    bg: "bg-red-500/[0.06]"    };
  if (s === "warning") return { dot: "bg-amber-400",  text: "text-amber-400",  border: "border-amber-500/25",  bg: "bg-amber-500/[0.06]"  };
  return                      { dot: "bg-blue-400",   text: "text-blue-400",   border: "border-blue-500/25",   bg: "bg-blue-500/[0.06]"   };
}

function qualityColor(q: string) {
  if (q === "Excellent") return "text-emerald-400";
  if (q === "Good")      return "text-teal-400";
  if (q === "Fair")      return "text-amber-400";
  return "text-red-400";
}

function confidenceColor(c: string) {
  if (c === "high")   return "text-emerald-400 border-emerald-500/25 bg-emerald-500/6";
  if (c === "medium") return "text-amber-400   border-amber-500/25   bg-amber-500/6";
  return "text-white/40 border-white/10 bg-white/[0.03]";
}

// ── Animated counter ─────────────────────────────────────────────────────────

function useAnimatedValue(target: number, delay = 120) {
  const [val, setVal] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (typeof target !== "number" || !isFinite(target)) return;
    const t = setTimeout(() => {
      let step = 0;
      const steps = 32;
      const tick = () => {
        step++;
        // easeOutCubic
        const p = 1 - Math.pow(1 - step / steps, 3);
        setVal(target * p);
        if (step < steps) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(t);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, delay]);

  return val;
}

// ── Stability Arc SVG ────────────────────────────────────────────────────────

function StabilityArc({ score, prefersReducedMotion }: { score: number; prefersReducedMotion: boolean }) {
  const [fill, setFill] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const target = (Math.max(0, Math.min(100, score)) / 100) * 0.75;
    if (prefersReducedMotion) { setFill(target); return; }
    let current = 0;
    const steps = 42;
    let step = 0;
    const tick = () => {
      step++;
      const p = 1 - Math.pow(1 - step / steps, 3); // easeOutCubic
      current = target * p;
      setFill(current);
      if (step < steps) rafRef.current = requestAnimationFrame(tick);
    };
    const t = setTimeout(() => { rafRef.current = requestAnimationFrame(tick); }, 180);
    return () => {
      clearTimeout(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [score, prefersReducedMotion]);

  const col = scoreColor(score);

  return (
    <svg
      viewBox="0 0 120 120"
      className="w-full h-full"
      aria-hidden="true"
      style={{ display: "block", background: "transparent", overflow: "visible" }}
    >
      {/* Track arc — dark purple-tinted, no white to avoid compositor outline artifact */}
      <circle
        cx={60} cy={60} r={48}
        fill="none"
        stroke="rgba(80,60,120,0.22)"
        strokeWidth={9}
        strokeLinecap="round"
        pathLength={1}
        transform="rotate(135 60 60)"
        strokeDasharray="0.75 0.25"
      />
      {/* Filled arc */}
      <circle
        cx={60} cy={60} r={48}
        fill="none"
        stroke={col.hex}
        strokeWidth={9}
        strokeLinecap="round"
        pathLength={1}
        transform="rotate(135 60 60)"
        strokeDasharray={`${fill} ${1 - fill}`}
        style={{ filter: `drop-shadow(0 0 6px ${col.hex}bb)` }}
      />
      {/* Tick marks */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const angle = (135 + t * 270) * (Math.PI / 180);
        const x1 = 60 + 51 * Math.cos(angle);
        const y1 = 60 + 51 * Math.sin(angle);
        const x2 = 60 + 54 * Math.cos(angle);
        const y2 = 60 + 54 * Math.sin(angle);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />;
      })}
    </svg>
  );
}

// ── 1. Stability Score Card ───────────────────────────────────────────────────

function StabilityScoreCard({ data }: { data: InstabilityData | null }) {
  const { prefersReducedMotion } = useMotion();
  const animScore = useAnimatedValue(data?.score ?? 0, 200);
  const col = scoreColor(data?.score ?? 0);

  return (
    <GlassCard className={cn("relative h-full transition-shadow duration-500", col.bg, col.border)} data-testid="card-stability-score">
      <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ boxShadow: data ? `inset 0 0 40px ${col.glow}` : "none", transition: "box-shadow 0.6s ease" }} />
      <div className="p-5 space-y-3 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Shield className="size-4 text-muted-foreground" />
            System Stability
          </h3>
          {data && (
            <motion.span
              key={data.stateLabel}
              className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", col.text, col.border)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              data-testid="text-stability-state"
            >
              {data.stateLabel}
            </motion.span>
          )}
        </div>

        {/* Arc gauge + score */}
        <div className="flex items-center gap-4 flex-1">
          <div className="relative w-24 h-24 shrink-0">
            {data ? (
              <StabilityArc score={data.score} prefersReducedMotion={prefersReducedMotion} />
            ) : (
              <div className="w-full h-full rounded-full border-2 border-white/5 flex items-center justify-center">
                <div className="size-8 rounded-full border border-white/10 bg-white/[0.03] animate-pulse" />
              </div>
            )}
            {/* Center score */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("text-2xl font-bold tabular-nums leading-none", col.text)} data-testid="text-stability-score">
                {data ? Math.round(animScore) : "--"}
              </span>
              <span className="text-[9px] text-muted-foreground/50 mt-0.5">/ 100</span>
            </div>
          </div>

          {data && (
            <div className="flex-1 space-y-2 min-w-0">
              {/* Mini metrics */}
              {[
                { label: "CPU", value: `${data.metrics.cpuLoad.toFixed(0)}%` },
                { label: "RAM", value: `${data.metrics.ramPct.toFixed(0)}%` },
                { label: "Procs", value: `${data.metrics.processCount}` },
              ].map((m) => (
                <div key={m.label} className="flex items-center justify-between" data-testid={`metric-stability-${m.label.toLowerCase()}`}>
                  <span className="text-[10px] text-muted-foreground">{m.label}</span>
                  <span className="text-[10px] font-mono text-white/70">{m.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Source chip */}
        {data && data.source !== "none" && (
          <motion.div
            className="text-[10px] text-white/55 bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.07] leading-snug"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
            data-testid="text-stability-source"
          >
            <span className={cn("font-semibold mr-1", col.text)}>Source:</span>
            {data.sourceDetail}
          </motion.div>
        )}
        {data && data.source === "none" && (
          <div className="text-[10px] text-emerald-400/70 bg-emerald-500/[0.04] rounded-lg px-3 py-2 border border-emerald-500/15">
            No instability source detected
          </div>
        )}
        {!data && (
          <div className="h-8 rounded-lg bg-white/[0.04] animate-pulse" />
        )}
      </div>
    </GlassCard>
  );
}

// ── 2. Active Problems Card ───────────────────────────────────────────────────

function ProblemRow({ problem, index }: { problem: ActiveProblem; index: number }) {
  const { prefersReducedMotion } = useMotion();
  const col = severityColor(problem.severity);

  return (
    <motion.div
      className={cn("flex items-start gap-3 p-3 rounded-lg border transition-colors", col.bg, col.border)}
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.06 }}
      data-testid={`problem-row-${problem.id}`}
    >
      {/* Severity dot — pulses on high */}
      <div className="mt-1 shrink-0 relative">
        <div className={cn("size-2 rounded-full", col.dot)} />
        {problem.severity === "high" && (
          <div className={cn("absolute inset-0 size-2 rounded-full animate-ping opacity-50", col.dot)} />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-[11px] font-semibold", col.text)}>{problem.title}</span>
          <span className="text-[10px] font-mono text-white/40 shrink-0">{problem.metric}</span>
        </div>
        <p className="text-[10px] text-muted-foreground/70 leading-snug">{problem.message}</p>
      </div>

      {problem.destination && (
        <Link href={problem.destination} className="shrink-0 mt-0.5">
          <ChevronRight className={cn("size-3.5 transition-colors", col.text)} />
        </Link>
      )}
    </motion.div>
  );
}

function ActiveProblemsCard({ data }: { data: ActiveProblemsData | null }) {
  return (
    <GlassCard className="h-full" data-testid="card-active-problems">
      <div className="p-5 space-y-3 h-full flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="size-4 text-muted-foreground" />
            Active Problems
          </h3>
          {data && (
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full border tabular-nums",
                data.allClear
                  ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/8"
                  : "text-amber-400 border-amber-500/25 bg-amber-500/8"
              )}
              data-testid="text-problem-count"
            >
              {data.allClear ? "All Clear" : `${data.problemCount} issue${data.problemCount !== 1 ? "s" : ""}`}
            </span>
          )}
        </div>

        <div className="flex-1 space-y-2 overflow-hidden">
          <AnimatePresence mode="popLayout">
            {!data && (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="h-14 rounded-lg bg-white/[0.04] animate-pulse" />)}
              </div>
            )}

            {data?.allClear && (
              <motion.div
                key="all-clear"
                className="flex flex-col items-center justify-center gap-2 py-6 text-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                data-testid="state-all-clear"
              >
                <CheckCircle className="size-8 text-emerald-400" />
                <p className="text-xs text-emerald-400 font-medium">All systems nominal</p>
                <p className="text-[10px] text-muted-foreground/50">No significant issues detected</p>
              </motion.div>
            )}

            {data && !data.allClear && data.problems.map((p, i) => (
              <ProblemRow key={p.id} problem={p} index={i} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </GlassCard>
  );
}

// ── 3. Input Latency Card ─────────────────────────────────────────────────────

function LatencyBar({ ms, max, color }: { ms: number; max: number; color: string }) {
  const pct = Math.min(100, (ms / max) * 100);
  return (
    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}66` }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      />
    </div>
  );
}

function InputLatencyCard({ data }: { data: LatencyData | null }) {
  const animMs = useAnimatedValue(data?.estimatedMs ?? 0, 300);
  const maxMs = 12;

  const trendIcon = data?.trend === "rising"  ? <TrendingUp  className="size-3 text-red-400" />
                  : data?.trend === "falling" ? <TrendingDown className="size-3 text-emerald-400" />
                  : <Minus className="size-3 text-white/40" />;

  const barColors = ["rgba(255,255,255,0.2)", "hsl(338,70%,60%)", "hsl(200,75%,55%)", "hsl(45,80%,55%)"];

  return (
    <GlassCard className="h-full" data-testid="card-latency-estimate">
      <div className="p-5 space-y-3 h-full flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Gauge className="size-4 text-muted-foreground" />
            Input Latency
          </h3>
          {data && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border border-white/10 text-white/30">
              Estimated
            </span>
          )}
        </div>

        {/* Big number */}
        <div className="flex items-end gap-2">
          {data ? (
            <>
              <span className="text-4xl font-bold tabular-nums leading-none" data-testid="text-latency-ms">
                ~{animMs.toFixed(1)}
              </span>
              <span className="text-base text-muted-foreground mb-0.5">ms</span>
              <div className="ml-auto flex items-center gap-1.5 mb-1">
                {trendIcon}
                <span className={cn("text-xs font-semibold", qualityColor(data.quality))} data-testid="text-latency-quality">
                  {data.quality}
                </span>
              </div>
            </>
          ) : (
            <div className="h-10 w-28 rounded-lg bg-white/[0.04] animate-pulse" />
          )}
        </div>

        {/* Breakdown */}
        {data && (
          <div className="space-y-2 flex-1">
            {data.breakdown.map((b, i) => (
              <div key={b.label} className="space-y-1" data-testid={`latency-breakdown-${i}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground/70">{b.label}</span>
                  <span className="text-[10px] font-mono text-white/50">{b.ms.toFixed(1)}ms</span>
                </div>
                <LatencyBar ms={b.ms} max={maxMs * 0.45} color={barColors[i] ?? barColors[0]} />
              </div>
            ))}
          </div>
        )}

        {!data && (
          <div className="flex-1 space-y-2">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-6 rounded bg-white/[0.04] animate-pulse" />)}
          </div>
        )}

        {data && (
          <p className="text-[9px] text-muted-foreground/40">
            Derived estimate — not directly measured. Based on CPU, RAM, and process load.
          </p>
        )}
      </div>
    </GlassCard>
  );
}

// ── 4. System DNA Card ────────────────────────────────────────────────────────

function DNABar({ dimension, index, prefersReducedMotion }: { dimension: any; index: number; prefersReducedMotion: boolean }) {
  return (
    <div className="space-y-1" data-testid={`dna-dimension-${dimension.id}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/60">{dimension.label}</span>
        <span className="text-[10px] font-mono tabular-nums" style={{ color: dimension.color }}>
          {Math.round(dimension.score)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full"
          style={{
            backgroundColor: dimension.color,
            boxShadow: `0 0 8px ${dimension.color}55`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(2, dimension.score)}%` }}
          transition={{
            duration: prefersReducedMotion ? 0.1 : 0.65,
            delay: prefersReducedMotion ? 0 : index * 0.06 + 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      </div>
    </div>
  );
}

function SystemDNACard({ data }: { data: SystemDNAData | null }) {
  const { prefersReducedMotion } = useMotion();

  const profileColor =
    data?.profile === "Responsive" ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/8" :
    data?.profile === "Pressured"  ? "text-red-400 border-red-500/25 bg-red-500/8" :
    "text-amber-400 border-amber-500/25 bg-amber-500/8";

  return (
    <GlassCard className="h-full" data-testid="card-system-dna">
      <div className="p-5 space-y-4 h-full flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            System DNA
          </h3>
          {data && (
            <motion.span
              key={data.profile}
              className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", profileColor)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              data-testid="text-dna-profile"
            >
              {data.profile}
            </motion.span>
          )}
        </div>

        {data?.profileNote && (
          <p className="text-[10px] text-muted-foreground/60 leading-snug" data-testid="text-dna-note">
            {data.profileNote}
          </p>
        )}

        <div className="flex-1 space-y-2.5">
          {!data && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-5 rounded bg-white/[0.04] animate-pulse" />)}
            </div>
          )}
          {data?.dimensions.map((dim, i) => (
            <DNABar key={dim.id} dimension={dim} index={i} prefersReducedMotion={prefersReducedMotion} />
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

// ── 5. What Just Caused That Card ─────────────────────────────────────────────

function WhatCausedThatCard({
  causation,
  causeLoading,
  analyzeCause,
}: {
  causation: CausationData | null;
  causeLoading: boolean;
  analyzeCause: () => Promise<void>;
}) {

  const confidenceText = (c: string) =>
    c === "high" ? "High confidence" : c === "medium" ? "Medium confidence" : "Low confidence";

  return (
    <GlassCard className="h-full" data-testid="card-what-caused-that">
      <div className="p-5 space-y-4 h-full flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Brain className="size-4 text-primary" />
            What Just Caused That?
          </h3>
          {causation && (
            <span className="text-[10px] text-muted-foreground/50">
              {new Date(causation.ts).toLocaleTimeString()}
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          {!causation && !causeLoading && (
            <motion.div
              key="idle"
              className="flex-1 flex flex-col items-center justify-center gap-4 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="space-y-1.5">
                <p className="text-xs text-white/60 font-medium">Spike or stutter occurred?</p>
                <p className="text-[10px] text-muted-foreground/50 max-w-[200px] leading-snug">
                  Analyzes current system state to identify the most likely cause.
                </p>
              </div>
              <Button
                size="sm"
                onClick={analyzeCause}
                className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
                data-testid="button-analyze-cause"
              >
                <Activity className="size-3.5 mr-1.5" />
                Analyze Now
              </Button>
            </motion.div>
          )}

          {causeLoading && (
            <motion.div
              key="loading"
              className="flex-1 flex items-center justify-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <RefreshCw className="size-4 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground">Analyzing system state…</span>
            </motion.div>
          )}

          {causation && !causeLoading && (
            <motion.div
              key="result"
              className="flex-1 space-y-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Primary cause */}
              <div className={cn(
                "p-3 rounded-lg border space-y-2",
                causation.noIssue
                  ? "border-emerald-500/20 bg-emerald-500/[0.05]"
                  : "border-amber-500/20 bg-amber-500/[0.05]"
              )} data-testid="section-cause-result">
                <div className="flex items-center gap-2">
                  {causation.noIssue
                    ? <CheckCircle className="size-3.5 text-emerald-400 shrink-0" />
                    : <AlertTriangle className="size-3.5 text-amber-400 shrink-0" />
                  }
                  <span className={cn("text-xs font-semibold", causation.noIssue ? "text-emerald-300" : "text-amber-200")} data-testid="text-cause-label">
                    {causation.primaryCause.label}
                  </span>
                </div>

                {/* Evidence */}
                <div className="flex flex-wrap gap-1.5">
                  {causation.primaryCause.evidence.map((e, i) => (
                    <span
                      key={i}
                      className="text-[10px] text-white/60 px-2 py-0.5 rounded border border-white/[0.08] bg-white/[0.03]"
                      data-testid={`evidence-chip-${i}`}
                    >
                      {e}
                    </span>
                  ))}
                </div>

                {/* Confidence + subsystem */}
                <div className="flex items-center gap-2 pt-0.5">
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium", confidenceColor(causation.primaryCause.confidence))}>
                    {confidenceText(causation.primaryCause.confidence)}
                  </span>
                  {causation.primaryCause.subsystem !== "None" && (
                    <span className="text-[10px] text-muted-foreground/50">
                      Subsystem: <span className="text-white/60">{causation.primaryCause.subsystem}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Suggestion */}
              {causation.primaryCause.destination && (
                <Link href={causation.primaryCause.destination}>
                  <div className="flex items-center gap-2 text-[11px] text-primary/80 hover:text-primary transition-colors cursor-pointer">
                    <ArrowRight className="size-3" />
                    {causation.primaryCause.suggestion}
                  </div>
                </Link>
              )}

              {/* Other causes */}
              {causation.allCauses.length > 1 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Also contributing</p>
                  {causation.allCauses.slice(1, 3).map(c => (
                    <div key={c.id} className="flex items-center gap-2">
                      <div className="size-1.5 rounded-full bg-white/20 shrink-0" />
                      <span className="text-[10px] text-white/50">{c.label}</span>
                      <span className={cn("text-[9px] ml-auto", confidenceColor(c.confidence))}>{c.confidence}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Re-analyze */}
              <Button
                size="sm"
                variant="outline"
                onClick={analyzeCause}
                className="w-full text-[11px] h-7 border-white/10 text-white/40 hover:text-white/70"
                data-testid="button-re-analyze"
              >
                <RefreshCw className="size-3 mr-1.5" />
                Analyze Again
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}

// ── 6. Smart RAM Card ─────────────────────────────────────────────────────────

function SmartRAMCard({
  data,
  onClearRAM,
}: {
  data: RAMAnalysisData | null;
  onClearRAM: () => void;
}) {
  const pressureColors = {
    critical: { text: "text-red-400",    bar: "bg-red-500",    glow: "rgba(239,68,68,0.35)" },
    high:     { text: "text-amber-400",  bar: "bg-amber-400",  glow: "rgba(251,191,36,0.30)" },
    moderate: { text: "text-blue-400",   bar: "bg-blue-400",   glow: "rgba(96,165,250,0.25)" },
    low:      { text: "text-emerald-400",bar: "bg-emerald-500",glow: "rgba(52,211,153,0.25)" },
  };

  const col = pressureColors[data?.pressure ?? "moderate"];
  const usedPct = data?.usedPct ?? 0;
  const reclaimPct = data ? (data.reclaimableGB / data.totalGB) * 100 : 0;

  return (
    <GlassCard className="relative" data-testid="card-smart-ram">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="size-4 text-muted-foreground" />
              Smart RAM Analysis
            </h3>
            {data && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5" data-testid="text-ram-pressure">
                {data.pressureLabel}
              </p>
            )}
          </div>

          {data && (
            <div className="shrink-0 text-right space-y-0.5">
              <div className="text-2xl font-bold tabular-nums" data-testid="text-ram-used-pct">
                <span className={col.text}>{data.usedPct}%</span>
              </div>
              <div className="text-[10px] text-muted-foreground/50">
                {data.usedGB} / {data.totalGB} GB
              </div>
            </div>
          )}
        </div>

        {/* RAM bar: used + reclaimable overlay */}
        {data ? (
          <div className="space-y-2 mb-4">
            <div className="h-2.5 rounded-full bg-white/[0.05] relative">
              {/* Used portion */}
              <motion.div
                className={cn("h-full rounded-full absolute left-0 top-0", col.bar)}
                style={{ boxShadow: `0 0 10px ${col.glow}` }}
                initial={{ width: 0 }}
                animate={{ width: `${usedPct}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
              {/* Reclaimable overlay */}
              <motion.div
                className="h-full rounded-full absolute top-0 bg-teal-400/30 border border-teal-400/40"
                style={{ left: `${Math.max(0, usedPct - reclaimPct)}%` }}
                initial={{ width: 0 }}
                animate={{ width: `${reclaimPct}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
              />
            </div>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground/50">
              <span className="flex items-center gap-1">
                <span className={cn("inline-block size-2 rounded-full", col.bar)} /> Used
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full bg-teal-400/50 border border-teal-400/40" /> Estimated reclaimable
              </span>
            </div>
          </div>
        ) : (
          <div className="h-2.5 rounded-full bg-white/[0.04] animate-pulse mb-4" />
        )}

        {/* Stats row */}
        {data ? (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-2.5 rounded-lg bg-white/[0.04] text-center border border-white/[0.06]">
              <div className="text-sm font-bold tabular-nums text-teal-400" data-testid="text-ram-reclaimable">
                ~{data.reclaimableGB} GB
              </div>
              <div className="text-[9px] text-muted-foreground/50 mt-0.5">Reclaimable*</div>
            </div>
            <div className="p-2.5 rounded-lg bg-white/[0.04] text-center border border-white/[0.06]">
              <div className="text-sm font-bold tabular-nums text-white/70">
                {data.freeGB} GB
              </div>
              <div className="text-[9px] text-muted-foreground/50 mt-0.5">Free now</div>
            </div>
            <div className="p-2.5 rounded-lg bg-white/[0.04] text-center border border-white/[0.06]">
              <div className={cn("text-sm font-bold", data.risk === "low" ? "text-emerald-400" : "text-amber-400")} data-testid="text-ram-risk">
                {data.riskLabel}
              </div>
              <div className="text-[9px] text-muted-foreground/50 mt-0.5">Clean risk</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-white/[0.04] animate-pulse" />)}
          </div>
        )}

        {/* Impact + action */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {data && (
              <p className="text-[10px] text-muted-foreground/60 leading-snug" data-testid="text-ram-impact">
                <span className="text-teal-400 font-medium">Expected: </span>
                {data.impactLabel}
                {" "}<span className="text-[9px] text-muted-foreground/35">*estimated standby pages</span>
              </p>
            )}
          </div>
          <Button
            size="sm"
            onClick={onClearRAM}
            className="shrink-0 bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 border border-teal-500/25"
            data-testid="button-smart-clear-ram"
          >
            <Zap className="size-3.5 mr-1.5" />
            Clear RAM
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}

// ── Reveal wrapper ────────────────────────────────────────────────────────────

function RevealCard({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const { prefersReducedMotion } = useMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18, filter: prefersReducedMotion ? "none" : "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: prefersReducedMotion ? 0.1 : 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}

// ── PerformanceLab main export ────────────────────────────────────────────────

export function PerformanceLab({ onClearRAM }: { onClearRAM: () => void }) {
  const { instability, dna, problems, latency, ram, causation, causeLoading, analyzeCause } = useDashboardIntelligence();
  const { prefersReducedMotion } = useMotion();

  return (
    <div className="space-y-5" data-testid="section-performance-lab">
      {/* Section heading */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="text-lg font-semibold tracking-tight text-white/90 flex items-center gap-2">
          <Cpu className="size-5 text-primary" />
          Performance Lab
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: "0 0 6px rgba(52,211,153,0.7)" }} />
          <span className="text-[11px] text-muted-foreground/60">Live intelligence</span>
        </div>
      </motion.div>

      {/* Row 1: Stability | Active Problems | Latency */}
      <div className="grid gap-4 md:grid-cols-3">
        <RevealCard delay={0.05}><StabilityScoreCard data={instability} /></RevealCard>
        <RevealCard delay={0.10}><ActiveProblemsCard data={problems} /></RevealCard>
        <RevealCard delay={0.15}><InputLatencyCard data={latency} /></RevealCard>
      </div>

      {/* Row 2: System DNA | What Caused That */}
      <div className="grid gap-4 md:grid-cols-2">
        <RevealCard delay={0.18}><SystemDNACard data={dna} /></RevealCard>
        <RevealCard delay={0.22}>
          <WhatCausedThatCard causation={causation} causeLoading={causeLoading} analyzeCause={analyzeCause} />
        </RevealCard>
      </div>

      {/* Row 3: Smart RAM */}
      <RevealCard delay={0.26}>
        <SmartRAMCard data={ram} onClearRAM={onClearRAM} />
      </RevealCard>
    </div>
  );
}
