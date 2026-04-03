import { useMemo } from "react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { motion } from "@/lib/motion";
import { useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Zap } from "lucide-react";

/* ─── Seeded pseudo-random so charts are consistent on each render ─── */
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/* ─── Data generators ─── */
function genFpsData() {
  const rng = seededRng(42);
  return Array.from({ length: 40 }, (_, i) => {
    const noise = () => (rng() - 0.5) * 2;
    const stockBase = 98 + noise() * 14;
    const stockDip  = (i % 12 === 0 || i % 17 === 0) ? -28 : 0;
    const optBase   = 142 + noise() * 4;
    return {
      t: i,
      stock:     Math.max(50, Math.round(stockBase + stockDip)),
      optimized: Math.max(130, Math.round(optBase)),
    };
  });
}

function genInputData() {
  const rng = seededRng(77);
  return Array.from({ length: 40 }, (_, i) => {
    const noise = () => (rng() - 0.5) * 2;
    const stockBase = 24 + noise() * 7;
    const spike     = (i % 11 === 0 || i % 23 === 0) ? 12 : 0;
    const optBase   = 16 + noise() * 1.5;
    return {
      t: i,
      stock:     Math.min(42, Math.max(14, Math.round(stockBase + spike))),
      optimized: Math.max(13, Math.round(optBase)),
    };
  });
}

function genJitterData() {
  const rng = seededRng(113);
  return Array.from({ length: 40 }, (_, i) => {
    const noise = () => (rng() - 0.5) * 2;
    const stockBase = 48 + noise() * 18;
    const spike     = (i % 9 === 0 || i % 21 === 0) ? 20 : 0;
    const optBase   = 41 + noise() * 3;
    return {
      t: i,
      stock:     Math.round(stockBase + spike),
      optimized: Math.max(37, Math.round(optBase)),
    };
  });
}

/* ─── Shared chart styling ─── */
const TOOLTIP_STYLE = {
  backgroundColor: "rgba(8,6,18,0.95)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};
const LABEL_STYLE  = { color: "#6b7280" };
const TICK_STYLE   = { fill: "#4b5563", fontSize: 10 };
const AXIS_LINE    = { stroke: "rgba(255,255,255,0.06)" };

/* ─── Stat badge ─── */
function StatBadge({ label, value, color, dimmed }: { label: string; value: string; color: string; dimmed?: boolean }) {
  return (
    <div className={cn("text-center", dimmed && "opacity-45")}>
      <div className="text-[10px] font-medium tracking-wide mb-0.5" style={{ color }}>{label}</div>
      <div className="text-2xl font-black tracking-tight text-white">{value}</div>
    </div>
  );
}

/* ─── Improvement pill ─── */
function ImprovPill({ text, positive }: { text: string; positive: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold",
      positive
        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
        : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
    )}>
      {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {text}
    </span>
  );
}

/* ─── Individual chart card ─── */
interface ChartCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  improvText: string;
  improvPositive: boolean;
  beforeStat: string;
  afterStat: string;
  beforeLabel: string;
  afterLabel: string;
  note: string;
  chart: React.ReactNode;
  delay?: number;
}

function ChartCard({
  title, subtitle, icon, improvText, improvPositive,
  beforeStat, afterStat, beforeLabel, afterLabel, note,
  chart, delay = 0,
}: ChartCardProps) {
  const { prefersReducedMotion } = useMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex flex-col rounded-2xl border border-white/[0.09] overflow-hidden"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.02) 100%)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Corner glow */}
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: improvPositive ? "radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 70%)" : "radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)" }}
      />

      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-primary/80">{icon}</span>
              <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
            </div>
            <p className="text-[11px] text-white/40">{subtitle}</p>
          </div>
          <ImprovPill text={improvText} positive={improvPositive} />
        </div>

        {/* Before / after stat row */}
        <div className="flex items-center gap-4 mt-4">
          <StatBadge label={beforeLabel} value={beforeStat} color="#f87171" dimmed />
          <div className="flex-1 h-px bg-white/08" />
          <Zap className="size-3.5 text-primary/60 shrink-0" />
          <div className="flex-1 h-px bg-white/08" />
          <StatBadge label={afterLabel} value={afterStat} color="#34d399" />
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 px-2 pb-2" style={{ minHeight: 140 }}>
        {chart}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-white/[0.06]">
        <p className="text-[10px] text-white/25 text-center">{note}</p>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   FPS Chart
═══════════════════════════════════════════ */
function FpsChart() {
  const data = useMemo(genFpsData, []);
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="fpsStock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f87171" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#f87171" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fpsOpt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#34d399" stopOpacity={0.30} />
            <stop offset="95%" stopColor="#34d399" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="t" hide />
        <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} domain={[50, 160]} tickCount={4} tickFormatter={v => `${v}`} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={LABEL_STYLE}
          formatter={(v: number, name: string) => [`${v} FPS`, name === "stock" ? "Stock Windows" : "SwitchControl"]}
          labelFormatter={() => ""}
        />
        <Area type="monotone" dataKey="stock"     stroke="#f87171" strokeWidth={1.5} fill="url(#fpsStock)" dot={false} name="stock"     isAnimationActive animationDuration={1200} animationEasing="ease-out" />
        <Area type="monotone" dataKey="optimized" stroke="#34d399" strokeWidth={2}   fill="url(#fpsOpt)"   dot={false} name="optimized" isAnimationActive animationDuration={1400} animationEasing="ease-out" />
        <ReferenceLine y={98}  yAxisId={0} stroke="#f87171" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.4} />
        <ReferenceLine y={142} yAxisId={0} stroke="#34d399" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.4} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════════════════════════
   Input Delay Chart
═══════════════════════════════════════════ */
function InputChart() {
  const data = useMemo(genInputData, []);
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="inpStock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#fb923c" stopOpacity={0.28} />
            <stop offset="95%" stopColor="#fb923c" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="inpOpt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.30} />
            <stop offset="95%" stopColor="#818cf8" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="t" hide />
        <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} domain={[10, 46]} tickCount={4} tickFormatter={v => `${v}`} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={LABEL_STYLE}
          formatter={(v: number, name: string) => [`${v}ms`, name === "stock" ? "Stock Windows" : "SwitchControl"]}
          labelFormatter={() => ""}
        />
        <Area type="monotone" dataKey="stock"     stroke="#fb923c" strokeWidth={1.5} fill="url(#inpStock)" dot={false} name="stock"     isAnimationActive animationDuration={1200} animationEasing="ease-out" />
        <Area type="monotone" dataKey="optimized" stroke="#818cf8" strokeWidth={2}   fill="url(#inpOpt)"   dot={false} name="optimized" isAnimationActive animationDuration={1400} animationEasing="ease-out" />
        <ReferenceLine y={24} yAxisId={0} stroke="#fb923c" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.4} />
        <ReferenceLine y={16} yAxisId={0} stroke="#818cf8" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.4} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════════════════════════
   Network Latency Chart
═══════════════════════════════════════════ */
function LatencyChart() {
  const data = useMemo(genJitterData, []);
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="latStock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f472b6" stopOpacity={0.28} />
            <stop offset="95%" stopColor="#f472b6" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="latOpt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.30} />
            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="t" hide />
        <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} domain={[30, 80]} tickCount={4} tickFormatter={v => `${v}`} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={LABEL_STYLE}
          formatter={(v: number, name: string) => [`${v}ms`, name === "stock" ? "Stock Windows" : "SwitchControl"]}
          labelFormatter={() => ""}
        />
        <Area type="monotone" dataKey="stock"     stroke="#f472b6" strokeWidth={1.5} fill="url(#latStock)" dot={false} name="stock"     isAnimationActive animationDuration={1200} animationEasing="ease-out" />
        <Area type="monotone" dataKey="optimized" stroke="#22d3ee" strokeWidth={2}   fill="url(#latOpt)"   dot={false} name="optimized" isAnimationActive animationDuration={1400} animationEasing="ease-out" />
        <ReferenceLine y={48} yAxisId={0} stroke="#f472b6" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.4} />
        <ReferenceLine y={41} yAxisId={0} stroke="#22d3ee" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.4} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════════════════════════
   Main export
═══════════════════════════════════════════ */
export function LandingPerformanceCharts() {
  return (
    <div className="grid md:grid-cols-3 gap-5">
      <ChartCard
        title="FPS Performance"
        subtitle="Frame rate stability over a 60-second session"
        icon={<TrendingUp className="size-4" />}
        improvText="+45% avg FPS"
        improvPositive
        beforeStat="98 FPS"
        afterStat="142 FPS"
        beforeLabel="Stock Windows"
        afterLabel="SwitchControl"
        note="1% Low FPS · Results based on internal testing"
        chart={<FpsChart />}
        delay={0}
      />
      <ChartCard
        title="Input Delay"
        subtitle="Click-to-response latency in competitive scenarios"
        icon={<Zap className="size-4" />}
        improvText="−8ms avg delay"
        improvPositive={false}
        beforeStat="24ms"
        afterStat="16ms"
        beforeLabel="Stock Windows"
        afterLabel="SwitchControl"
        note="Average input delay · Measured with hardware-level tools"
        chart={<InputChart />}
        delay={0.1}
      />
      <ChartCard
        title="Network Stability"
        subtitle="Round-trip latency jitter over a gaming session"
        icon={<TrendingDown className="size-4" />}
        improvText="78% less jitter"
        improvPositive
        beforeStat="±18ms"
        afterStat="±4ms"
        beforeLabel="Stock Windows"
        afterLabel="SwitchControl"
        note="Jitter variance · Server-side handshake to response"
        chart={<LatencyChart />}
        delay={0.2}
      />
    </div>
  );
}
