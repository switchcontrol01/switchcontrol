import { useMemo } from "react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { motion } from "@/lib/motion";
import { useMotion } from "@/lib/motion";

/* ─── Version milestone data ─── */
const VERSIONS = [
  { v: "v0.8", label: "Oct '25" },
  { v: "v0.9", label: "Nov '25" },
  { v: "v1.0", label: "Dec '25" },
  { v: "v1.2", label: "Jan '26" },
  { v: "v1.5", label: "Feb '26" },
  { v: "v2.0", label: "Mar '26" },
];

/* Seeded RNG */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function buildTimelineData() {
  const r = rng(42);
  /* 18 data points across ~6 months */
  return Array.from({ length: 18 }, (_, i) => {
    const t = i / 17;
    return {
      i,
      /* FPS improvement score: grows from ~8% → ~22%, with noise */
      fps: Math.round((8 + t * 14 + r() * 2.5) * 10) / 10,
      /* Latency reduction: grows from ~3ms → ~12ms */
      latency: Math.round((3 + t * 9 + r() * 1.5) * 10) / 10,
      /* Input delay: grows from ~2ms → ~8ms */
      input: Math.round((2 + t * 6 + r() * 1.2) * 10) / 10,
    };
  });
}

/* Map version to data index (6 versions across 18 pts) */
const VERSION_INDICES = [0, 3, 5, 8, 12, 17];

/* Tooltip styles */
const TT_STYLE = {
  backgroundColor: "rgba(5,3,14,0.97)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  fontSize: "11px",
  padding: "8px 12px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
};

/* Custom tooltip */
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TT_STYLE}>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "10px" }}>
            {p.dataKey === "fps" ? "FPS Improvement" : p.dataKey === "latency" ? "Latency Reduction" : "Input Delay Reduction"}
          </span>
          <span className="ml-auto font-semibold" style={{ color: p.color }}>
            {p.dataKey === "fps" ? `+${p.value}%` : `-${p.value}ms`}
          </span>
        </div>
      ))}
    </div>
  );
}

/* Pill badge */
function Pill({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[11px] text-white/35">{label}</span>
      <span className="text-[11px] font-bold ml-1" style={{ color }}>{value}</span>
    </div>
  );
}

/* ─── Compact metric sparkline ─── */
interface MetricMiniProps {
  label: string;
  value: string;
  trend: "up" | "down";
  accentColor: string;
  data: { i: number; v: number }[];
  index: number;
}

function MetricMini({ label, value, trend, accentColor, data, index }: MetricMiniProps) {
  const { prefersReducedMotion } = useMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: 0.3 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-white/[0.07] px-4 pt-3 pb-2 flex flex-col gap-1"
      style={{
        background: "rgba(255,255,255,0.025)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="text-[10px] text-white/30 uppercase tracking-widest">{label}</div>
      <div className="text-2xl font-black tracking-tight" style={{ color: accentColor }}>{value}</div>
      <div style={{ height: 36 }}>
        <ResponsiveContainer width="100%" height={36}>
          <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <Line
              type="monotone" dataKey="v"
              stroke={accentColor} strokeWidth={2}
              dot={false}
              isAnimationActive animationDuration={900} animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div
        className="text-[9px] tracking-wide"
        style={{ color: accentColor, opacity: 0.7 }}
      >
        {trend === "up" ? "▲" : "▼"} improving each version
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   Main export
═══════════════════════════════════════════ */
export function SocialProofCharts() {
  const { prefersReducedMotion } = useMotion();
  const timelineData = useMemo(buildTimelineData, []);

  /* Build per-metric sparkline data */
  const fpsSpark    = timelineData.map((d, i) => ({ i, v: d.fps }));
  const latSpark    = timelineData.map((d, i) => ({ i, v: d.latency }));
  const inputSpark  = timelineData.map((d, i) => ({ i, v: d.input }));

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="mt-12"
    >
      {/* ── Three metric mini cards ── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <MetricMini
          label="FPS Improvement"
          value="+22%"
          trend="up"
          accentColor="#34d399"
          data={fpsSpark}
          index={0}
        />
        <MetricMini
          label="Latency Reduction"
          value="−12ms"
          trend="up"
          accentColor="#22d3ee"
          data={latSpark}
          index={1}
        />
        <MetricMini
          label="Input Delay"
          value="−8ms"
          trend="up"
          accentColor="#818cf8"
          data={inputSpark}
          index={2}
        />
      </div>

      {/* ── Main timeline chart ── */}
      <div
        className="rounded-2xl border border-white/[0.07] p-4 pb-2"
        style={{
          background: "linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
          backdropFilter: "blur(16px)",
        }}
      >
        {/* Header row */}
        <div className="flex items-start justify-between mb-3 px-1">
          <div>
            <p className="text-[10px] text-white/25 uppercase tracking-widest">Performance trajectory</p>
            <p className="text-xs text-white/50 mt-0.5">Each release pushes the ceiling higher</p>
          </div>
          <div className="flex flex-col gap-1.5 items-end">
            <Pill color="#34d399" label="FPS gain"        value="+22%" />
            <Pill color="#22d3ee" label="Latency"         value="−12ms" />
            <Pill color="#818cf8" label="Input delay"     value="−8ms" />
          </div>
        </div>

        {/* Chart */}
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timelineData} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="gFps" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#34d399" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gLat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gInput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 4" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="i"
                tick={false}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickCount={4}
              />

              <Tooltip content={<CustomTooltip />} />

              {/* Version milestone lines */}
              {VERSION_INDICES.map((idx, vi) => (
                <ReferenceLine
                  key={vi}
                  x={idx}
                  stroke="rgba(255,255,255,0.07)"
                  strokeDasharray="3 3"
                  label={{
                    value: VERSIONS[vi].v,
                    position: "top",
                    fill: "rgba(255,255,255,0.25)",
                    fontSize: 9,
                    fontWeight: 600,
                  }}
                />
              ))}

              <Area type="monotone" dataKey="fps"     stroke="#34d399" strokeWidth={2}   fill="url(#gFps)"   dot={false} isAnimationActive animationDuration={1000} animationEasing="ease-out" />
              <Area type="monotone" dataKey="latency" stroke="#22d3ee" strokeWidth={1.8} fill="url(#gLat)"   dot={false} isAnimationActive animationDuration={1100} animationEasing="ease-out" />
              <Area type="monotone" dataKey="input"   stroke="#818cf8" strokeWidth={1.6} fill="url(#gInput)" dot={false} isAnimationActive animationDuration={1200} animationEasing="ease-out" />

              {/* Highlight dots at latest version (v2.0) */}
              <ReferenceDot x={17} y={timelineData[17].fps}     r={4} fill="#34d399" stroke="rgba(0,0,0,0.6)" strokeWidth={1.5} />
              <ReferenceDot x={17} y={timelineData[17].latency} r={4} fill="#22d3ee" stroke="rgba(0,0,0,0.6)" strokeWidth={1.5} />
              <ReferenceDot x={17} y={timelineData[17].input}   r={4} fill="#818cf8" stroke="rgba(0,0,0,0.6)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* X-axis version labels */}
        <div className="flex justify-between mt-1 px-1">
          {VERSIONS.map((v) => (
            <span key={v.v} className="text-[9px] text-white/20">{v.label}</span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
