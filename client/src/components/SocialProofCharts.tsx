import { useMemo, useRef, useState, useEffect } from "react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceDot, ResponsiveContainer,
} from "recharts";

/* ─── Seeded RNG ─── */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/* ─── Version milestones ─── */
const VERSIONS = [
  { v: "v0.8", label: "Oct '25" },
  { v: "v0.9", label: "Nov '25" },
  { v: "v1.0", label: "Dec '25" },
  { v: "v1.2", label: "Jan '26" },
  { v: "v1.5", label: "Feb '26" },
  { v: "v2.0", label: "Mar '26" },
];
const VERSION_INDICES = [0, 3, 5, 8, 12, 17];

/* ─── Full timeline data (18 pts, growing trend) ─── */
function buildTimelineData() {
  const r = rng(42);
  return Array.from({ length: 18 }, (_, i) => {
    const t = i / 17;
    return {
      i,
      fps:     Math.round((8  + t * 14 + r() * 2.5) * 10) / 10,
      latency: Math.round((3  + t * 9  + r() * 1.5) * 10) / 10,
      input:   Math.round((2  + t * 6  + r() * 1.2) * 10) / 10,
    };
  });
}
const FULL_TIMELINE = buildTimelineData();

/* ─── Sparkline stream generators ─── */
function buildSparkData(seed: number, base: number, growth: number, noise: number) {
  const r = rng(seed);
  return Array.from({ length: 22 }, (_, i) => ({
    i,
    v: Math.round((base + (i / 21) * growth + (r() - 0.5) * noise) * 10) / 10,
  }));
}

function nextSparkPoint(prev: { i: number; v: number }[], base: number, growth: number, noise: number, r: () => number) {
  const last = prev[prev.length - 1];
  return { i: last.i + 1, v: Math.round((base + growth + (r() - 0.5) * noise) * 10) / 10 };
}

/* ─── IntersectionObserver hook ─── */
function useInView(threshold = 0.12) {
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

/* ─── Progressive timeline draw-in hook ─── */
function useProgressiveDraw(full: typeof FULL_TIMELINE, active: boolean) {
  const [visibleCount, setVisibleCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (visibleCount >= full.length) return;
    const id = setTimeout(() => setVisibleCount(c => c + 1), visibleCount === 0 ? 200 : 65);
    return () => clearTimeout(id);
  }, [active, visibleCount, full.length]);
  return full.slice(0, visibleCount);
}

/* ─── Live streaming sparkline hook ─── */
function useStreamSpark(
  initial: { i: number; v: number }[],
  base: number, growth: number, noise: number,
  rngSeed: number,
  active: boolean,
) {
  const [data, setData] = useState(initial);
  const [streaming, setStreaming] = useState(false);
  const rRef = useRef(rng(rngSeed + 500));
  const dRef = useRef(initial);
  useEffect(() => {
    if (!active) return;
    const td = setTimeout(() => setStreaming(true), 1800);
    return () => clearTimeout(td);
  }, [active]);
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => {
      const next = nextSparkPoint(dRef.current, base, growth, noise, rRef.current);
      const updated = [...dRef.current.slice(dRef.current.length >= 22 ? 1 : 0), next];
      dRef.current = updated;
      setData([...updated]);
    }, 500);
    const killTimer = setTimeout(() => setStreaming(false), 4000);
    return () => { clearInterval(id); clearTimeout(killTimer); };
  }, [streaming, base, growth, noise]);
  return data;
}

/* ─── Tooltip ─── */
const TT_STYLE = {
  backgroundColor: "rgba(255,255,255,0.07)",
  backdropFilter: "blur(24px) saturate(1.8)",
  WebkitBackdropFilter: "blur(24px) saturate(1.8)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: "10px",
  fontSize: "11px",
  padding: "8px 12px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TT_STYLE}>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>
            {p.dataKey === "fps" ? "FPS Improvement" : p.dataKey === "latency" ? "Latency Reduction" : "Input Delay"}
          </span>
          <span className="ml-2 font-bold" style={{ color: p.color }}>
            {p.dataKey === "fps" ? `+${p.value}%` : `-${p.value}ms`}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Metric mini card ─── */
interface MiniProps {
  label: string;
  value: string;
  accentColor: string;
  sparkData: { i: number; v: number }[];
  animDelay: string;
  inView: boolean;
}

function MetricMini({ label, value, accentColor, sparkData, animDelay, inView }: MiniProps) {
  return (
    <div
      className="sp-mini-card rounded-xl border border-[#2A313A] px-4 pt-3 pb-3 flex flex-col gap-1 relative overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.028)",
        backdropFilter: "blur(14px)",
        animationDelay: animDelay,
        animationPlayState: inView ? "running" : "paused",
      }}
    >
      {/* Accent glow */}
      <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
        style={{ background: `radial-gradient(circle at top right, ${accentColor}18, transparent 65%)` }} />

      <div className="text-[10px] text-[#6B7380] uppercase tracking-widest font-medium">{label}</div>
      <div className="text-2xl font-black tracking-tight" style={{ color: accentColor }}>{value}</div>

      <div style={{ height: 38 }}>
        <ResponsiveContainer width="100%" height={38}>
          <LineChart data={sparkData} margin={{ top: 3, right: 2, left: 2, bottom: 3 }}>
            <Line
              type="basis" dataKey="v"
              stroke={accentColor} strokeWidth={2}
              dot={false} isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-1.5 text-[9px]" style={{ color: accentColor, opacity: 0.65 }}>
        <span className="w-1 h-1 rounded-full chart-live-blink" style={{ backgroundColor: accentColor }} />
        improving each version
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Main export
═══════════════════════════════════════════ */
export function SocialProofCharts() {
  const { ref, inView } = useInView(0.1);

  /* Progressive timeline draw-in */
  const timelineData = useProgressiveDraw(FULL_TIMELINE, inView);

  /* Streaming sparklines */
  const fpsSpark   = useStreamSpark(useMemo(() => buildSparkData(10, 8,  14, 2.5), []), 8,  14, 2.5, 10,  inView);
  const latSpark   = useStreamSpark(useMemo(() => buildSparkData(20, 3,  9,  1.5), []), 3,  9,  1.5, 20,  inView);
  const inputSpark = useStreamSpark(useMemo(() => buildSparkData(30, 2,  6,  1.2), []), 2,  6,  1.2, 30,  inView);

  /* Latest endpoint dots */
  const last = timelineData[timelineData.length - 1];

  return (
    <div ref={ref} className="mt-12">
      {/* ── Three mini sparkline cards ── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <MetricMini label="FPS Improvement"  value="+22%" accentColor="#34d399" sparkData={fpsSpark}   animDelay="0ms"   inView={inView} />
        <MetricMini label="Latency Reduction" value="−12ms" accentColor="#22d3ee" sparkData={latSpark}   animDelay="80ms"  inView={inView} />
        <MetricMini label="Input Delay"       value="−8ms"  accentColor="#818cf8" sparkData={inputSpark} animDelay="160ms" inView={inView} />
      </div>

      {/* ── Main timeline chart ── */}
      <div
        className="sp-timeline-card rounded-2xl border border-[#2A313A] p-4 pb-2"
        style={{
          background: "linear-gradient(160deg, rgba(255,255,255,0.042) 0%, rgba(255,255,255,0.016) 100%)",
          backdropFilter: "blur(18px)",
          animationDelay: "240ms",
          animationPlayState: inView ? "running" : "paused",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3 px-1">
          <div>
            <p className="text-[10px] text-[#6B7380] uppercase tracking-widest">Performance trajectory</p>
            <p className="text-xs text-[#A0A8B3] mt-0.5">Each release pushes the ceiling higher</p>
          </div>
          <div className="flex flex-col gap-1.5 items-end">
            {[
              { color: "#34d399", label: "FPS gain",   value: "+22%" },
              { color: "#22d3ee", label: "Latency",    value: "−12ms" },
              { color: "#818cf8", label: "Input delay", value: "−8ms" },
            ].map(({ color, label, value }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-[#6B7380]">{label}</span>
                <span className="text-[10px] font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart — progressive draw-in */}
        <div style={{ height: 168 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timelineData} margin={{ top: 8, right: 6, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="spGFps" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#34d399" stopOpacity={0.30} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="spGLat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="spGInput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 4" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="i" tick={false} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.18)", fontSize: 9 }} axisLine={false} tickLine={false} tickCount={4} />
              <Tooltip content={<CustomTooltip />} />

              {/* Version milestone markers */}
              {VERSION_INDICES.filter(idx => idx < timelineData.length).map((idx, vi) => (
                <ReferenceLine key={vi} x={idx}
                  stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3"
                  label={{ value: VERSIONS[vi].v, position: "top", fill: "rgba(255,255,255,0.22)", fontSize: 9, fontWeight: 600 }}
                />
              ))}

              <Area type="basis" dataKey="fps"     stroke="#34d399" strokeWidth={2}   fill="url(#spGFps)"   dot={false} isAnimationActive={false} />
              <Area type="basis" dataKey="latency" stroke="#22d3ee" strokeWidth={1.8} fill="url(#spGLat)"   dot={false} isAnimationActive={false} />
              <Area type="basis" dataKey="input"   stroke="#818cf8" strokeWidth={1.6} fill="url(#spGInput)" dot={false} isAnimationActive={false} />

              {/* Leading-edge dots — only shown once draw-in completes */}
              {last && timelineData.length === FULL_TIMELINE.length && (
                <>
                  <ReferenceDot x={last.i} y={last.fps}     r={4} fill="#34d399" stroke="rgba(0,0,0,0.7)" strokeWidth={1.5} />
                  <ReferenceDot x={last.i} y={last.latency} r={4} fill="#22d3ee" stroke="rgba(0,0,0,0.7)" strokeWidth={1.5} />
                  <ReferenceDot x={last.i} y={last.input}   r={4} fill="#818cf8" stroke="rgba(0,0,0,0.7)" strokeWidth={1.5} />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* X-axis labels */}
        <div className="flex justify-between mt-1 px-1">
          {VERSIONS.map((v) => (
            <span key={v.v} className="text-[9px] text-[#E6EAF0]/18">{v.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
