import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Seeded RNG ─── */
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/* ─── Data generators — initial 40 pts ─── */
function genFpsData(rngSeed = 42) {
  const rng = seededRng(rngSeed);
  return Array.from({ length: 40 }, (_, i) => {
    const noise = () => (rng() - 0.5) * 2;
    const stockDip = (i % 12 === 0 || i % 17 === 0) ? -28 : 0;
    return {
      t: i,
      stock:     Math.max(50,  Math.round(98  + noise() * 14 + stockDip)),
      optimized: Math.max(130, Math.round(142 + noise() * 4)),
    };
  });
}

function genInputData(rngSeed = 77) {
  const rng = seededRng(rngSeed);
  return Array.from({ length: 40 }, (_, i) => {
    const noise = () => (rng() - 0.5) * 2;
    const spike = (i % 11 === 0 || i % 23 === 0) ? 12 : 0;
    return {
      t: i,
      stock:     Math.min(42, Math.max(14, Math.round(24 + noise() * 7  + spike))),
      optimized: Math.max(13, Math.round(16 + noise() * 1.5)),
    };
  });
}

function genJitterData(rngSeed = 113) {
  const rng = seededRng(rngSeed);
  return Array.from({ length: 40 }, (_, i) => {
    const noise = () => (rng() - 0.5) * 2;
    const spike = (i % 9 === 0 || i % 21 === 0) ? 20 : 0;
    return {
      t: i,
      stock:     Math.round(48  + noise() * 18 + spike),
      optimized: Math.max(37, Math.round(41 + noise() * 3)),
    };
  });
}

/* ─── Next-point generators for streaming ─── */
function nextFpsPoint(prevT: number, rng: () => number) {
  const noise = () => (rng() - 0.5) * 2;
  return {
    t: prevT + 1,
    stock:     Math.max(50,  Math.round(98  + noise() * 14 + (rng() < 0.08 ? -28 : 0))),
    optimized: Math.max(130, Math.round(142 + noise() * 4)),
  };
}
function nextInputPoint(prevT: number, rng: () => number) {
  const noise = () => (rng() - 0.5) * 2;
  return {
    t: prevT + 1,
    stock:     Math.min(42, Math.max(14, Math.round(24 + noise() * 7 + (rng() < 0.08 ? 12 : 0)))),
    optimized: Math.max(13, Math.round(16 + noise() * 1.5)),
  };
}
function nextJitterPoint(prevT: number, rng: () => number) {
  const noise = () => (rng() - 0.5) * 2;
  return {
    t: prevT + 1,
    stock:     Math.round(48 + noise() * 18 + (rng() < 0.09 ? 20 : 0)),
    optimized: Math.max(37, Math.round(41 + noise() * 3)),
  };
}

/* ─── IntersectionObserver hook ─── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ─── Live streaming chart hook ─── */
function useStreamingData(
  initialData: { t: number; stock: number; optimized: number }[],
  nextFn: (prevT: number, rng: () => number) => { t: number; stock: number; optimized: number },
  rngSeed: number,
  active: boolean,
  intervalMs = 420,
  maxLen = 40,
) {
  const [data, setData] = useState(initialData);
  const rngRef = useRef(seededRng(rngSeed + 999));
  const dataRef = useRef(initialData);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const cur = dataRef.current;
      const next = nextFn(cur[cur.length - 1].t, rngRef.current);
      const updated = [...cur.slice(cur.length >= maxLen ? 1 : 0), next];
      dataRef.current = updated;
      setData([...updated]);
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, maxLen, nextFn]);

  return data;
}

/* ─── Shared styles ─── */
const TT_STYLE = {
  backgroundColor: "rgba(6,4,16,0.97)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
  padding: "8px 12px",
};
const TICK = { fill: "rgba(255,255,255,0.2)", fontSize: 9 };

/* ─── Improvement pill ─── */
function ImprovPill({ text, positive }: { text: string; positive: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide border",
      positive
        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        : "bg-rose-500/10 text-rose-400 border-rose-500/20",
    )}>
      {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {text}
    </span>
  );
}

/* ─── Stat badge ─── */
function StatBadge({ label, value, color, dim }: { label: string; value: string; color: string; dim?: boolean }) {
  return (
    <div className={cn("text-center", dim && "opacity-40")}>
      <div className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color }}>{label}</div>
      <div className="text-xl font-black text-white tracking-tight">{value}</div>
    </div>
  );
}

/* ─── Live dot at the leading edge ─── */
function LiveDot({ cx, cy, color }: { cx?: number; cy?: number; color: string }) {
  if (!cx || !cy) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill={color} opacity={0.25} className="chart-pulse-outer" />
      <circle cx={cx} cy={cy} r={3} fill={color} opacity={0.9} />
    </g>
  );
}

/* ─── Chart card shell ─── */
interface CardProps {
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
  accentBefore: string;
  accentAfter: string;
  children: React.ReactNode;
  animDelay: string;
  inView: boolean;
}

function ChartCard({
  title, subtitle, icon, improvText, improvPositive,
  beforeStat, afterStat, beforeLabel, afterLabel,
  note, accentBefore, accentAfter, children, animDelay, inView,
}: CardProps) {
  return (
    <div
      className="relative flex flex-col rounded-2xl border border-white/[0.08] overflow-hidden landing-chart-card"
      style={{
        background: "linear-gradient(150deg, rgba(255,255,255,0.048) 0%, rgba(255,255,255,0.018) 100%)",
        backdropFilter: "blur(22px)",
        animationDelay: animDelay,
        animationPlayState: inView ? "running" : "paused",
      }}
    >
      {/* Corner accent glow */}
      <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accentAfter}1a 0%, transparent 70%)` }} />

      {/* Live indicator */}
      <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 chart-live-blink" />
        <span className="text-[9px] text-white/25 uppercase tracking-widest">Live</span>
      </div>

      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-start justify-between mb-2 pr-14">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span style={{ color: accentAfter, opacity: 0.8 }}>{icon}</span>
              <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
            </div>
            <p className="text-[10px] text-white/35 max-w-[180px] leading-relaxed">{subtitle}</p>
          </div>
        </div>
        <ImprovPill text={improvText} positive={improvPositive} />

        {/* Stat row */}
        <div className="flex items-center gap-3 mt-4">
          <StatBadge label={beforeLabel} value={beforeStat} color={accentBefore} dim />
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${accentBefore}30, transparent, ${accentAfter}30)` }} />
          <Zap className="size-3 shrink-0" style={{ color: accentAfter, opacity: 0.5 }} />
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${accentAfter}30, transparent)` }} />
          <StatBadge label={afterLabel} value={afterStat} color={accentAfter} />
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 px-1 pb-1" style={{ minHeight: 148 }}>
        {children}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-white/[0.05]">
        <p className="text-[9px] text-white/20 text-center tracking-wide">{note}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Three concrete charts
═══════════════════════════════════════════ */
function FpsChart({ active }: { active: boolean }) {
  const initial = useMemo(() => genFpsData(), []);
  const data = useStreamingData(initial, nextFpsPoint, 42, active);
  return (
    <ResponsiveContainer width="100%" height={148}>
      <AreaChart data={data} margin={{ top: 6, right: 4, left: -26, bottom: 0 }}>
        <defs>
          <linearGradient id="gFpsStock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f87171" stopOpacity={0.28} />
            <stop offset="95%" stopColor="#f87171" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gFpsOpt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#34d399" stopOpacity={0.32} />
            <stop offset="95%" stopColor="#34d399" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 5" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="t" hide />
        <YAxis tick={TICK} axisLine={false} tickLine={false} domain={[50, 165]} tickCount={4} />
        <Tooltip contentStyle={TT_STYLE} labelFormatter={() => ""}
          formatter={(v: number, n: string) => [`${v} FPS`, n === "stock" ? "Stock Windows" : "SwitchControl"]} />
        <ReferenceLine y={98}  stroke="#f87171" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.35} />
        <ReferenceLine y={142} stroke="#34d399" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.35} />
        <Area type="basis" dataKey="stock"     stroke="#f87171" strokeWidth={1.5} fill="url(#gFpsStock)" dot={false} isAnimationActive={false} />
        <Area type="basis" dataKey="optimized" stroke="#34d399" strokeWidth={2}   fill="url(#gFpsOpt)"   dot={false} isAnimationActive={false}
          activeDot={<LiveDot color="#34d399" />} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function InputChart({ active }: { active: boolean }) {
  const initial = useMemo(() => genInputData(), []);
  const data = useStreamingData(initial, nextInputPoint, 77, active);
  return (
    <ResponsiveContainer width="100%" height={148}>
      <AreaChart data={data} margin={{ top: 6, right: 4, left: -26, bottom: 0 }}>
        <defs>
          <linearGradient id="gInpStock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#fb923c" stopOpacity={0.28} />
            <stop offset="95%" stopColor="#fb923c" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gInpOpt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.32} />
            <stop offset="95%" stopColor="#818cf8" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 5" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="t" hide />
        <YAxis tick={TICK} axisLine={false} tickLine={false} domain={[10, 48]} tickCount={4} />
        <Tooltip contentStyle={TT_STYLE} labelFormatter={() => ""}
          formatter={(v: number, n: string) => [`${v}ms`, n === "stock" ? "Stock Windows" : "SwitchControl"]} />
        <ReferenceLine y={24} stroke="#fb923c" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.35} />
        <ReferenceLine y={16} stroke="#818cf8" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.35} />
        <Area type="basis" dataKey="stock"     stroke="#fb923c" strokeWidth={1.5} fill="url(#gInpStock)" dot={false} isAnimationActive={false} />
        <Area type="basis" dataKey="optimized" stroke="#818cf8" strokeWidth={2}   fill="url(#gInpOpt)"   dot={false} isAnimationActive={false}
          activeDot={<LiveDot color="#818cf8" />} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function JitterChart({ active }: { active: boolean }) {
  const initial = useMemo(() => genJitterData(), []);
  const data = useStreamingData(initial, nextJitterPoint, 113, active);
  return (
    <ResponsiveContainer width="100%" height={148}>
      <AreaChart data={data} margin={{ top: 6, right: 4, left: -26, bottom: 0 }}>
        <defs>
          <linearGradient id="gLatStock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f472b6" stopOpacity={0.28} />
            <stop offset="95%" stopColor="#f472b6" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gLatOpt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.32} />
            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 5" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="t" hide />
        <YAxis tick={TICK} axisLine={false} tickLine={false} domain={[25, 85]} tickCount={4} />
        <Tooltip contentStyle={TT_STYLE} labelFormatter={() => ""}
          formatter={(v: number, n: string) => [`${v}ms`, n === "stock" ? "Stock Windows" : "SwitchControl"]} />
        <ReferenceLine y={48} stroke="#f472b6" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.35} />
        <ReferenceLine y={41} stroke="#22d3ee" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.35} />
        <Area type="basis" dataKey="stock"     stroke="#f472b6" strokeWidth={1.5} fill="url(#gLatStock)" dot={false} isAnimationActive={false} />
        <Area type="basis" dataKey="optimized" stroke="#22d3ee" strokeWidth={2}   fill="url(#gLatOpt)"   dot={false} isAnimationActive={false}
          activeDot={<LiveDot color="#22d3ee" />} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════════════════════════
   Main export
═══════════════════════════════════════════ */
export function LandingPerformanceCharts() {
  const { ref, inView } = useInView(0.12);

  return (
    <div ref={ref} className="grid md:grid-cols-3 gap-5">
      <ChartCard
        title="FPS Performance"
        subtitle="Frame rate stability over a 60-second session"
        icon={<TrendingUp className="size-4" />}
        improvText="+45% avg FPS"
        improvPositive
        beforeStat="98 FPS" afterStat="142 FPS"
        beforeLabel="Stock Windows" afterLabel="SwitchControl"
        note="1% Low FPS · Results based on internal testing"
        accentBefore="#f87171" accentAfter="#34d399"
        animDelay="0ms" inView={inView}
      >
        <FpsChart active={inView} />
      </ChartCard>

      <ChartCard
        title="Input Delay"
        subtitle="Click-to-response latency in competitive scenarios"
        icon={<Zap className="size-4" />}
        improvText="−8ms avg delay"
        improvPositive={false}
        beforeStat="24ms" afterStat="16ms"
        beforeLabel="Stock Windows" afterLabel="SwitchControl"
        note="Average input delay · Measured with hardware-level tools"
        accentBefore="#fb923c" accentAfter="#818cf8"
        animDelay="80ms" inView={inView}
      >
        <InputChart active={inView} />
      </ChartCard>

      <ChartCard
        title="Network Stability"
        subtitle="Round-trip latency jitter over a gaming session"
        icon={<TrendingDown className="size-4" />}
        improvText="78% less jitter"
        improvPositive
        beforeStat="±18ms" afterStat="±4ms"
        beforeLabel="Stock Windows" afterLabel="SwitchControl"
        note="Jitter variance · Server-side handshake to response"
        accentBefore="#f472b6" accentAfter="#22d3ee"
        animDelay="160ms" inView={inView}
      >
        <JitterChart active={inView} />
      </ChartCard>
    </div>
  );
}
