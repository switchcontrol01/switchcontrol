import { useState, useEffect, useRef, useMemo, type FC, type ReactNode } from "react";
import {
  Brain, ChevronUp, ChevronDown, RefreshCw, AlertCircle,
  TrendingUp, TrendingDown, Minus, Cpu, HardDrive, Activity,
  Wifi, Target, Sparkles, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { motion, AnimatePresence, useMotion } from "@/lib/motion";
import { TWEAKS_DATA } from "@/lib/mock-data";
import { useTweakIntelligence, type PressureLevel, type SystemSignal, type TweakRanking, type PostureDimension } from "@/hooks/useTweakIntelligence";

// ── Tweak title lookup ────────────────────────────────────────────────────────

const TWEAK_TITLE_MAP = Object.fromEntries(TWEAKS_DATA.map((t) => [t.id, t.title]));
const TWEAK_CATEGORY_MAP = Object.fromEntries(TWEAKS_DATA.map((t) => [t.id, t.category]));

// ── SVG sparkline helpers ─────────────────────────────────────────────────────

interface Pt { x: number; y: number }

function buildSplinePath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  const seg = (p0: Pt, p1: Pt, p2: Pt, p3: Pt) => {
    const cx1 = p1.x + (p2.x - p0.x) / 6;
    const cy1 = p1.y + (p2.y - p0.y) / 6;
    const cx2 = p2.x - (p3.x - p1.x) / 6;
    const cy2 = p2.y - (p3.y - p1.y) / 6;
    return `C ${cx1.toFixed(2)} ${cy1.toFixed(2)} ${cx2.toFixed(2)} ${cy2.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  };
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` ${seg(p0, p1, p2, p3)}`;
  }
  return d;
}

function Sparkline({ values, color = "#00D4FF", id }: { values: number[]; color?: string; id: string }) {
  if (values.length < 2) {
    return (
      <div className="w-full h-10 flex items-center justify-center">
        <span className="text-[10px] text-[#6B7380]/50">Building history…</span>
      </div>
    );
  }

  const W = 300; const H = 40;
  const min = 0; const max = 100;
  const pts: Pt[] = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * H * 0.82 - H * 0.06,
  }));
  const linePath = buildSplinePath(pts);
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 40 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={areaPath}
        fill={`url(#sg-${id})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      />
      <motion.path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.circle
        cx={last.x} cy={last.y} r={2.5} fill={color} opacity={0.9}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.9 }}
        transition={{ duration: 0.4, delay: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
        style={{ transformOrigin: `${last.x}px ${last.y}px` }}
      />
    </svg>
  );
}

// ── Posture radar (pentagon SVG) ───────────────────────────────────────────────

function PostureRadar({ dimensions }: { dimensions: PostureDimension[] }) {
  const N = dimensions.length;

  const CX = 80, CY = 80, R = 58;
  const angleFor  = (i: number) => (2 * Math.PI / N) * i - Math.PI / 2;
  const vertexAt  = (i: number, pct: number): Pt => ({
    x: CX + R * (pct / 100) * Math.cos(angleFor(i)),
    y: CY + R * (pct / 100) * Math.sin(angleFor(i)),
  });
  const ringStr   = (pct: number) =>
    dimensions.map((_, i) => { const v = vertexAt(i, pct); return `${v.x.toFixed(2)},${v.y.toFixed(2)}`; }).join(" ");

  // ── animated progress (0→1) drives polygon expansion ───────────────────────
  const [progress, setProgress] = useState(0);

  // Re-animate whenever dimension values actually change
  const dimKey = dimensions.map((d) => d.score).join(",");
  useEffect(() => {
    if (N === 0) return;
    setProgress(0);
    const DELAY    = 320;  // ms before growth starts
    const DURATION = 1100; // ms for full expansion
    const t0 = performance.now() + DELAY;
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - t0;
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return; }
      const t    = Math.min(elapsed / DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 3); // cubic-ease-out
      setProgress(ease);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimKey, N]);

  if (N === 0) return null;

  // Derive all positions from animated progress
  const dataStr = dimensions.map((d, i) => {
    const v = vertexAt(i, Math.max(4, d.score) * progress);
    return `${v.x.toFixed(2)},${v.y.toFixed(2)}`;
  }).join(" ");

  const labelAt = (i: number): Pt => ({
    x: CX + (R + 20) * Math.cos(angleFor(i)),
    y: CY + (R + 20) * Math.sin(angleFor(i)),
  });

  return (
    <motion.svg
      viewBox="0 0 160 160"
      className="w-full max-w-[220px] mx-auto"
      overflow="visible"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Axis lines */}
      {dimensions.map((_, i) => {
        const end = vertexAt(i, 100);
        return <line key={i} x1={CX} y1={CY} x2={end.x} y2={end.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />;
      })}

      {/* Track rings */}
      {[33, 66, 100].map((pct) => (
        <polygon key={pct} points={ringStr(pct)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={pct === 100 ? 1.5 : 1} />
      ))}

      {/* Filled data polygon — grows outward from centre */}
      <polygon
        points={dataStr}
        fill="rgba(0,212,255,0.15)"
        stroke="#00D4FF"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Vertex dots — follow the same progress */}
      {dimensions.map((d, i) => {
        const v = vertexAt(i, Math.max(4, d.score) * progress);
        return (
          <circle key={i} cx={v.x} cy={v.y} r={2.5}
            fill={d.color || "#00D4FF"}
            style={{ filter: `drop-shadow(0 0 3px ${d.color || "#00D4FF"})` }}
          />
        );
      })}

      {/* Axis labels */}
      {dimensions.map((d, i) => {
        const lp = labelAt(i);
        return (
          <text key={i} x={lp.x} y={lp.y}
            textAnchor="middle" dominantBaseline="middle"
            fill={d.color || "rgba(255,255,255,0.60)"} fontSize={10} fontWeight={600}
            style={{ userSelect: "none" }}
          >
            {d.label}
          </text>
        );
      })}
    </motion.svg>
  );
}

// ── Level utilities ────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<PressureLevel, string> = {
  low:      "text-emerald-400",
  moderate: "text-yellow-400",
  elevated: "text-orange-400",
  high:     "text-red-400",
};

const LEVEL_BAR_COLORS: Record<PressureLevel, string> = {
  low:      "bg-emerald-500",
  moderate: "bg-yellow-500",
  elevated: "bg-orange-500",
  high:     "bg-red-500",
};

const LEVEL_FILL: Record<PressureLevel, number> = {
  low: 14, moderate: 38, elevated: 68, high: 94,
};

const LEVEL_LABELS: Record<PressureLevel, string> = {
  low: "Low", moderate: "Moderate", elevated: "Elevated", high: "High",
};

const SIGNAL_ICONS: Record<string, FC<{ className?: string }>> = {
  cpu:      Cpu,
  memory:   HardDrive,
  process:  Activity,
  network:  Wifi,
  trend:    TrendingUp,
};

// ── Signal row ────────────────────────────────────────────────────────────────

function SignalRow({ signal }: { signal: SystemSignal }) {
  const Icon = SIGNAL_ICONS[signal.subsystem] ?? Activity;
  const barPct = LEVEL_FILL[signal.level];

  if (signal.subsystem === "trend") {
    const TIcon = signal.value === "Rising"    ? TrendingUp
                : signal.value === "Declining" ? TrendingDown
                : Minus;
    const tColor = signal.value === "Rising"    ? "text-orange-400"
                 : signal.value === "Declining" ? "text-emerald-400"
                 : "text-[#6B7380]";
    return (
      <div className="flex items-center gap-2.5 py-1.5 group" title={signal.detail}>
        <Icon className="size-3.5 text-[#6B7380] shrink-0" />
        <span className="text-xs text-[#A0A8B3] flex-1 truncate leading-none">{signal.label}</span>
        <div className={cn("flex items-center gap-1 text-xs font-medium", tColor)}>
          <TIcon className="size-3" />
          <span>{signal.value}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1 group" title={signal.detail}>
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-[#6B7380] shrink-0" />
        <span className="text-xs text-[#A0A8B3] flex-1 leading-none">{signal.label}</span>
        <span className={cn("text-[10px] font-medium tabular-nums", LEVEL_COLORS[signal.level])}>
          {signal.value}
        </span>
        <span className={cn("text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full",
          signal.level === "low"      ? "bg-emerald-500/10 text-emerald-400"  :
          signal.level === "moderate" ? "bg-yellow-500/10 text-yellow-400"    :
          signal.level === "elevated" ? "bg-orange-500/10 text-orange-400"    :
                                        "bg-red-500/10 text-red-400"
        )}>
          {LEVEL_LABELS[signal.level]}
        </span>
      </div>
      <div className="relative h-1 rounded-full bg-[#21262D] ml-6 overflow-hidden">
        <motion.div
          className={cn("absolute inset-y-0 left-0 rounded-full", LEVEL_BAR_COLORS[signal.level])}
          initial={{ width: 0 }}
          animate={{ width: `${barPct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ opacity: 0.75 }}
        />
      </div>
    </div>
  );
}

// ── Category pressure bars ────────────────────────────────────────────────────

interface CategoryScore { label: string; score: number; count: number; color: string }

function CategoryBars({ rankings }: { rankings: TweakRanking[] }) {
  const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
    "System and Power":      { label: "System & Power",   color: "hsl(338,75%,58%)" },
    "Memory and Storage":    { label: "Memory & Storage", color: "hsl(45,90%,55%)"  },
    "Gaming and Latency":    { label: "Gaming & Latency", color: "#00D4FF" },
    "Debloat and Apps":      { label: "Debloat & Apps",   color: "hsl(200,80%,55%)" },
    "Privacy and Telemetry": { label: "Privacy",          color: "hsl(152,70%,50%)" },
  };

  const catScores: CategoryScore[] = useMemo(() => {
    const groups: Record<string, number[]> = {};
    for (const r of rankings) {
      if (r.alreadyApplied) continue;
      const cat = TWEAK_CATEGORY_MAP[r.tweakId];
      if (!cat || !CATEGORY_MAP[cat]) continue;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(r.score);
    }
    return Object.entries(CATEGORY_MAP).map(([cat, meta]) => {
      const scores = groups[cat] ?? [];
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      return { label: meta.label, score: avg, count: scores.length, color: meta.color };
    }).sort((a, b) => b.score - a.score);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankings]);

  return (
    <div className="space-y-2.5">
      {catScores.map((cat, i) => (
        <motion.div
          key={cat.label}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[#A0A8B3] leading-none">{cat.label}</span>
            <span className="text-[10px] font-medium tabular-nums" style={{ color: cat.score > 10 ? cat.color : "rgba(255,255,255,0.2)" }}>
              {cat.count > 0 ? `${cat.count} opp.` : "—"}
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-[#21262D] overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: cat.color, opacity: cat.score > 5 ? 0.8 : 0.2 }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(cat.score > 5 ? 8 : 0, Math.min(100, cat.score))}%` }}
              transition={{ duration: 0.8, delay: i * 0.07 + 0.2, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── Priority tweak item ───────────────────────────────────────────────────────

function PriorityTweakItem({ rank, ranking }: { rank: number; ranking: TweakRanking }) {
  const title = TWEAK_TITLE_MAP[ranking.tweakId] ?? ranking.tweakId;
  const barPct = Math.min(100, ranking.score);

  const badgeStyle = ranking.relevance === "high"
    ? "bg-red-500/15 text-red-400 border-red-500/25"
    : ranking.relevance === "medium"
    ? "bg-orange-500/15 text-orange-400 border-orange-500/25"
    : "bg-[#21262D] text-[#6B7380] border-[#2A313A]";

  return (
    <motion.div
      className="flex items-start gap-3 p-3 rounded-xl border border-[#2A313A] bg-white/[0.025] hover:bg-[#21262D] transition-colors"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: rank * 0.07, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-center size-6 rounded-full bg-[#21262D] border border-[#2A313A] shrink-0 mt-0.5">
        <span className="text-[10px] font-bold text-[#6B7380]">#{rank}</span>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-[#E6EAF0] leading-none">{title}</span>
          <span className={cn("text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border", badgeStyle)}>
            {ranking.relevance}
          </span>
        </div>
        <p className="text-[10px] text-[#6B7380] leading-snug line-clamp-2">{ranking.reason}</p>
        <div className="relative h-0.5 rounded-full bg-[#21262D] mt-2">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: ranking.relevance === "high"   ? "hsl(338,80%,60%)"
                        : ranking.relevance === "medium" ? "hsl(38,85%,55%)"
                        : "rgba(255,255,255,0.2)",
            }}
            initial={{ width: 0 }}
            animate={{ width: `${barPct}%` }}
            transition={{ duration: 0.9, delay: rank * 0.08 + 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>
      <ArrowRight className="size-3 text-[#E6EAF0]/15 shrink-0 mt-1.5" />
    </motion.div>
  );
}

// ── Skeleton placeholder ───────────────────────────────────────────────────────

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={cn("rounded animate-pulse bg-[#21262D]", className)} />;
}

// ── Reveal wrapper — staggered blur+slide entrance ────────────────────────────

function RevealPanel({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const { prefersReducedMotion } = useMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20, filter: prefersReducedMotion ? "none" : "blur(10px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: prefersReducedMotion ? 0.1 : 0.52, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TweakIntelligenceLayer() {
  const intel = useTweakIntelligence();
  const [collapsed, setCollapsed] = useState(false);

  // Accumulate CPU load history for sparkline (max 40 points)
  const cpuHistoryRef = useRef<number[]>([]);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);

  useEffect(() => {
    if (!intel.loading && intel.cpuLoad > 0) {
      cpuHistoryRef.current = [...cpuHistoryRef.current, intel.cpuLoad].slice(-40);
      setCpuHistory([...cpuHistoryRef.current]);
    }
  }, [intel.cpuLoad, intel.loading]);

  // Top 3 priority tweaks (not yet applied)
  const topPriority = useMemo(() =>
    intel.rankings.filter((r) => !r.alreadyApplied && r.score >= 12).slice(0, 3),
    [intel.rankings]
  );

  const isWellOptimized = !intel.loading && intel.rankings.length > 0
    && intel.rankings.filter((r) => !r.alreadyApplied && r.relevance !== "none").length === 0;

  const trendSignal = intel.signals.find((s) => s.subsystem === "trend");
  const visibleSignals = intel.signals.filter((s) => s.subsystem !== "trend");

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
        whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        viewport={{ once: true }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center gap-2.5">
          <Brain className="size-4 text-primary" />
          <span className="text-sm font-semibold text-[#E6EAF0]">Performance Intelligence</span>
          <motion.span
            className="text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            Live
          </motion.span>
          {intel.loadTrend === "rising" && (
            <span className="text-[9px] font-medium flex items-center gap-0.5 text-orange-400">
              <TrendingUp className="size-2.5" /> Rising
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {intel.overallCoverage > 0 && (
            <span className="text-xs text-[#6B7380] tabular-nums">
              Coverage: <span className="text-[#A0A8B3] font-medium">{intel.overallCoverage}%</span>
            </span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-[#6B7380] hover:text-[#A0A8B3] hover:bg-[#21262D] transition-all"
            data-testid="button-toggle-intelligence"
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            key="intel-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-0.5">
              {/* Loading / error state */}
              <AnimatePresence mode="wait">
                {intel.loading && !intel.error && (
                  <motion.div
                    key="intel-loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.4 } }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center gap-2.5 text-xs text-[#6B7380] bg-white/[0.025] border border-[#2A313A] rounded-xl px-3 py-2"
                  >
                    <motion.span
                      className="size-3.5 shrink-0 rounded-full border-2 border-primary/40 border-t-primary"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    Loading system intelligence…
                  </motion.div>
                )}
                {intel.error && !intel.loading && (
                  <motion.div
                    key="intel-error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center justify-between gap-3 text-xs text-red-400/80 bg-red-500/10 border border-red-500/15 rounded-xl px-3 py-2"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <AlertCircle className="size-3.5 shrink-0" />
                      <span>{intel.error}</span>
                    </span>
                    <button
                      type="button"
                      onClick={intel.refresh}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-400/10 px-2 py-1 text-[10px] font-medium text-red-300 transition-colors hover:bg-red-400/20 hover:text-red-200"
                      data-testid="button-refresh-intelligence"
                    >
                      <RefreshCw className="size-3" />
                      Refresh
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Row 1: 3-panel grid ────────────────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Panel 1: System Posture radar */}
                <RevealPanel delay={0.08} className="h-full">
                <GlassCard blur="sm" className="p-4 space-y-3 h-full" hoverEffect={false}>
                  <div className="flex items-center gap-1.5">
                    <Target className="size-3.5 text-primary/60" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7380]">
                      Optimization Posture
                    </span>
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                  {intel.loading ? (
                    <motion.div
                      key="skel-posture"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex flex-col items-center gap-3"
                    >
                      <SkeletonPulse className="w-[120px] h-[120px] rounded-full" />
                      <SkeletonPulse className="h-3 w-20" />
                      <div className="space-y-1 pt-1 w-full">
                        {[0,1,2,3,4].map(i => (
                          <div key={i} className="flex items-center justify-between">
                            <SkeletonPulse className="h-2.5 w-24" />
                            <SkeletonPulse className="h-2.5 w-8" />
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="data-posture"
                      initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <PostureRadar dimensions={intel.posture} />
                      <div className="text-center">
                        <motion.span
                          className="text-2xl font-bold text-[#E6EAF0] tabular-nums"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.5, delay: 0.15 }}
                        >
                          {intel.overallCoverage}
                          <span className="text-sm font-normal text-[#6B7380]">%</span>
                        </motion.span>
                        <p className="text-[10px] text-[#6B7380] mt-0.5">overall coverage</p>
                      </div>

                      {/* Dimension legend */}
                      <div className="space-y-1 pt-1 ">
                        {intel.posture.map((d) => (
                          <div key={d.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="size-1.5 rounded-full shrink-0" style={{ background: d.color }} />
                              <span className="text-[10px] text-[#6B7380]">{d.label}</span>
                            </div>
                            <span className="text-[10px] font-medium tabular-nums" style={{ color: d.score > 0 ? d.color : "rgba(255,255,255,0.2)" }}>
                              {d.applied}/{d.total}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </GlassCard>
                </RevealPanel>

                {/* Panel 2: Live System Signals */}
                <RevealPanel delay={0.16} className="h-full">
                <GlassCard blur="sm" className="p-4 space-y-3 h-full" hoverEffect={false}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Activity className="size-3.5 text-primary/60" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7380]">
                        Live System Signals
                      </span>
                    </div>
                    {trendSignal && (
                      <div className={cn("flex items-center gap-1 text-[9px] font-medium",
                        intel.loadTrend === "rising"  ? "text-orange-400" :
                        intel.loadTrend === "falling" ? "text-emerald-400" : "text-[#6B7380]"
                      )}>
                        {intel.loadTrend === "rising"  ? <TrendingUp className="size-3" />  :
                         intel.loadTrend === "falling" ? <TrendingDown className="size-3" /> :
                         <Minus className="size-3" />}
                        <span>{trendSignal.value}</span>
                      </div>
                    )}
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                  {intel.loading ? (
                    <motion.div
                      key="skel-signals"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="space-y-1.5">
                          <div className="flex justify-between">
                            <SkeletonPulse className="h-3 w-32" />
                            <SkeletonPulse className="h-3 w-12" />
                          </div>
                          <SkeletonPulse className="h-1 ml-6" />
                        </div>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="data-signals"
                      initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-0.5 divide-y divide-white/[0.03]"
                    >
                      {visibleSignals.map((sig) => (
                        <SignalRow key={sig.id} signal={sig} />
                      ))}
                    </motion.div>
                  )}
                  </AnimatePresence>

                  {/* CPU Sparkline */}
                  <div className="pt-2  space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[#6B7380] uppercase tracking-wider">CPU Load (last {cpuHistory.length}s)</span>
                      {cpuHistory.length > 0 && (
                        <span className="text-[10px] font-medium tabular-nums text-[#6B7380]">
                          {cpuHistory[cpuHistory.length - 1].toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <Sparkline
                      values={cpuHistory}
                      color={intel.cpuLoad >= 75 ? "hsl(0,75%,55%)" :
                             intel.cpuLoad >= 50 ? "#F59E0B" :
                             "#00D4FF"}
                      id="cpu-spark"
                    />
                  </div>
                </GlassCard>
                </RevealPanel>

                {/* Panel 3: Category pressure */}
                <RevealPanel delay={0.24} className="h-full">
                <GlassCard blur="sm" className="p-4 space-y-3 h-full" hoverEffect={false}>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary/60" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7380]">
                      Category Opportunities
                    </span>
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                  {intel.loading ? (
                    <motion.div
                      key="skel-cats"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="space-y-1.5">
                          <div className="flex justify-between">
                            <SkeletonPulse className="h-2.5 w-24" />
                            <SkeletonPulse className="h-2.5 w-8" />
                          </div>
                          <SkeletonPulse className="h-1.5 rounded-full" />
                        </div>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="data-cats"
                      initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <CategoryBars rankings={intel.rankings} />
                    </motion.div>
                  )}
                  </AnimatePresence>

                  {/* Applied count */}
                  {!intel.loading && intel.overallCoverage > 0 && (
                    <div className="pt-3  flex items-center gap-1.5">
                      <RefreshCw className="size-3 text-[#6B7380]/50" />
                      <span className="text-[9px] text-[#6B7380]">
                        {intel.rankings.filter((r) => r.alreadyApplied).length} tweaks already applied
                      </span>
                    </div>
                  )}
                </GlassCard>
                </RevealPanel>
              </div>

              {/* ── Row 2: Top Priority Tweaks ─────────────────────────────── */}
              <RevealPanel delay={0.32}>
              <GlassCard blur="sm" className="p-4 space-y-3" hoverEffect={false}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Target className="size-3.5 text-primary/60" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7380]">
                      Top Opportunities Right Now
                    </span>
                  </div>
                  {!intel.loading && (
                    <span className="text-[9px] text-[#6B7380]">Based on current system state</span>
                  )}
                </div>

                <AnimatePresence mode="wait" initial={false}>
                {intel.loading ? (
                  <motion.div
                    key="skel-opps"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-2"
                  >
                    {[0, 1, 2].map((i) => (
                      <SkeletonPulse key={i} className="h-16 rounded-xl" />
                    ))}
                  </motion.div>
                ) : isWellOptimized ? (
                  <motion.div
                    key="data-optimized"
                    className="flex items-center gap-3 px-4 py-5 rounded-xl border border-emerald-500/15 bg-emerald-500/5 text-sm text-emerald-400/80"
                    initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Sparkles className="size-4 shrink-0 text-emerald-400" />
                    <div>
                      <span className="font-medium text-emerald-400">System is well-optimized</span>
                      <p className="text-[10px] text-emerald-400/50 mt-0.5">
                        No high-priority opportunities detected under current system state.
                      </p>
                    </div>
                  </motion.div>
                ) : topPriority.length > 0 ? (
                  <motion.div
                    key="data-opps"
                    initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-2"
                  >
                    {topPriority.map((r, i) => (
                      <PriorityTweakItem key={r.tweakId} rank={i + 1} ranking={r} />
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="data-empty"
                    initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="py-4 text-center text-xs text-[#6B7380]"
                  >
                    Apply some tweaks first to see personalized opportunity rankings.
                  </motion.div>
                )}
                </AnimatePresence>
              </GlassCard>
              </RevealPanel>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
