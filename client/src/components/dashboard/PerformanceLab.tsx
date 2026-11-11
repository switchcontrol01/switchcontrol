/**
 * PerformanceLab — dashboard intelligence hub
 *
 * Panels:
 *   1. Stability Score       — real-time SVG arc gauge + source analysis
 *   2. Active Problems       — backend-derived issue list with severity
 *   3. System load — measured local CPU, memory, and process readings
 *
 * Responsiveness readings come only from timestamped local Windows telemetry.
 */

import { useState, useEffect, useRef, type ReactNode } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  useDashboardIntelligence,
  type InstabilityData,
  type ActiveProblemsData,
  type SystemLoadMeasurement,
  type ActiveProblem,
} from "@/hooks/useDashboardIntelligence";
import { useUserPreferencesStore } from "@/stores/userPreferencesStore";
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Cpu,
  Gauge,
  RefreshCw,
  Shield,
} from "lucide-react";
import { SystemLoadPanel } from "@/components/SystemLoadPanel";

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
      {/* Track arc — dark matte, no white to avoid compositor outline artifact */}
      <circle
        cx={60} cy={60} r={48}
        fill="none"
        stroke="rgba(42,49,58,0.8)"
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
              <div className="w-full h-full rounded-full border-2 border-[#2A313A] flex items-center justify-center">
                <div className="size-8 rounded-full border border-[#2A313A] bg-[#1A1F26] animate-pulse" />
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
                  <span className="text-[10px] font-mono text-[#E6EAF0]">{m.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Source chip */}
        {data && data.source !== "none" && (
          <motion.div
            className="text-[10px] text-[#A0A8B3] bg-[#1A1F26] rounded-lg px-3 py-2 border border-[#2A313A] leading-snug"
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
          <div className="h-8 rounded-lg bg-[#21262D] animate-pulse" />
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
          <span className="text-[10px] font-mono text-[#6B7380] shrink-0">{problem.metric}</span>
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

function ActiveProblemsCard({ data, alertsEnabled = true }: { data: ActiveProblemsData | null; alertsEnabled?: boolean }) {
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
            {!alertsEnabled && (
              <motion.div key="alerts-disabled" className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                <AlertTriangle className="size-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Health alerts are disabled</p>
                <p className="text-[10px] text-muted-foreground/50">Enable them in Settings to see system pressure warnings</p>
              </motion.div>
            )}
            {!data && alertsEnabled && (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="h-14 rounded-lg bg-[#21262D] animate-pulse" />)}
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

// ── 3. System Responsiveness Card ─────────────────────────────────────────────

function SystemResponsivenessCard({ data }: { data: SystemLoadMeasurement }) {
  return (
    <SystemLoadPanel data={data} title="System Responsiveness" />
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

export function PerformanceLab() {
  const { user } = useAuth();
  const { instability, problems, systemLoad } = useDashboardIntelligence(!!user?.loggedIn);
  const showHealthAlerts = useUserPreferencesStore((s) => s.showHealthAlerts);
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
        <h2 className="text-lg font-semibold tracking-tight text-[#E6EAF0] flex items-center gap-2">
          <Cpu className="size-5 text-primary" />
          Performance Lab
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px rgba(52,211,153,0.7)" }} />
          <span className="text-[11px] text-muted-foreground/60">Live intelligence</span>
        </div>
      </motion.div>

      {/* Primary row: the three core performance signals */}
      <div className="grid gap-4 md:grid-cols-3">
        <RevealCard delay={0.05}><StabilityScoreCard data={instability} /></RevealCard>
        <RevealCard delay={0.10}><ActiveProblemsCard data={showHealthAlerts ? problems : null} alertsEnabled={showHealthAlerts} /></RevealCard>
        <RevealCard delay={0.15}><SystemResponsivenessCard data={systemLoad} /></RevealCard>
      </div>

    </div>
  );
}
