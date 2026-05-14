import { useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "@/lib/motion";
import { useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/* ─── Seeded RNG for stable data across renders ─── */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/* ─── Data generators ─── */
function genLatencyData() {
  const r = rng(11);
  return Array.from({ length: 28 }, (_, i) => ({
    i,
    before: Math.round(50 + (r() - 0.5) * 22 + (i % 7 === 0 ? 14 : 0)),
    after:  Math.round(38 + (r() - 0.5) * 4),
  }));
}

function genInputData() {
  const r = rng(29);
  return Array.from({ length: 28 }, (_, i) => ({
    i,
    before: Math.round(24 + (r() - 0.5) * 10 + (i % 9 === 0 ? 10 : 0)),
    after:  Math.round(16 + (r() - 0.5) * 2),
  }));
}

function genFpsStabilityData() {
  const r = rng(57);
  return Array.from({ length: 28 }, (_, i) => ({
    i,
    // Represent as variance from target: lower variance = better
    before: Math.round(82 + (r() - 0.5) * 24 + (i % 11 === 0 ? -18 : 0)),
    after:  Math.round(96 + (r() - 0.5) * 5),
  }));
}

function genLowFpsData() {
  const r = rng(83);
  return Array.from({ length: 28 }, (_, i) => ({
    i,
    before: Math.round(70 + (r() - 0.5) * 18 + (i % 8 === 0 ? -20 : 0)),
    after:  Math.round(86 + (r() - 0.5) * 4),
  }));
}

/* ─── Tooltip style — frosted glass ─── */
const TT_STYLE = {
  backgroundColor: "rgba(255,255,255,0.07)",
  backdropFilter: "blur(24px) saturate(1.8)",
  WebkitBackdropFilter: "blur(24px) saturate(1.8)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: "10px",
  fontSize: "10px",
  padding: "6px 10px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
};

/* ─── Sparkline component ─── */
interface SparklineProps {
  data: { i: number; before: number; after: number }[];
  beforeColor: string;
  afterColor: string;
  beforeLabel: string;
  afterLabel: string;
  unit: string;
}

function Sparkline({ data, beforeColor, afterColor, beforeLabel, afterLabel, unit }: SparklineProps) {
  return (
    <ResponsiveContainer width="100%" height={68}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sb-${beforeColor.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={beforeColor} stopOpacity={0.30} />
            <stop offset="95%" stopColor={beforeColor} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={`sa-${afterColor.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={afterColor} stopOpacity={0.35} />
            <stop offset="95%" stopColor={afterColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Tooltip
          contentStyle={TT_STYLE}
          labelFormatter={() => ""}
          formatter={(v: number, name: string) => [
            `${v}${unit}`,
            name === "before" ? beforeLabel : afterLabel,
          ]}
        />
        <Area
          type="monotone" dataKey="before"
          stroke={beforeColor} strokeWidth={1.2}
          fill={`url(#sb-${beforeColor.replace(/[^a-z0-9]/gi, "")})`}
          dot={false} isAnimationActive animationDuration={1000} animationEasing="ease-out"
        />
        <Area
          type="monotone" dataKey="after"
          stroke={afterColor} strokeWidth={1.8}
          fill={`url(#sa-${afterColor.replace(/[^a-z0-9]/gi, "")})`}
          dot={false} isAnimationActive animationDuration={1200} animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Single stat+chart card ─── */
interface StatChartCardProps {
  value: string;
  label: string;
  accent: "emerald" | "cyan" | "violet" | "amber";
  spark: React.ReactNode;
  legendBefore: string;
  legendAfter: string;
  beforeColor: string;
  afterColor: string;
  index: number;
}

function StatChartCard({
  value, label, accent, spark,
  legendBefore, legendAfter, beforeColor, afterColor, index,
}: StatChartCardProps) {
  const { prefersReducedMotion } = useMotion();

  const accentMap: Record<string, string> = {
    emerald: "text-emerald-400",
    cyan:    "text-[hsl(190,85%,50%)]",
    violet:  "text-[#00D4FF]",
    amber:   "text-amber-400",
  };

  const glowMap: Record<string, string> = {
    emerald: "from-emerald-500/[0.08]",
    cyan:    "from-sky-500/[0.08]",
    violet:  "from-#00D4FF/[0.08]",
    amber:   "from-amber-500/[0.08]",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex flex-col rounded-2xl border border-[#2A313A] overflow-hidden group"
      style={{
        background: "linear-gradient(160deg, rgba(255,255,255,0.042) 0%, rgba(255,255,255,0.016) 100%)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Top hover glow */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-b to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none",
        glowMap[accent],
      )} />

      {/* Stat */}
      <div className="px-5 pt-5 pb-2">
        <div className={cn("text-4xl md:text-5xl font-black tracking-tight leading-none mb-1", accentMap[accent])}>
          {value}
        </div>
        <div className="text-[11px] text-[#6B7380] uppercase tracking-widest font-medium">{label}</div>
      </div>

      {/* Sparkline */}
      <div className="px-1 pb-1 flex-1">
        {spark}
      </div>

      {/* Legend */}
      <div className="px-4 pb-3 flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-[9px] text-[#6B7380]">
          <span className="w-4 h-px rounded-full" style={{ backgroundColor: beforeColor, opacity: 0.7 }} />
          {legendBefore}
        </span>
        <span className="flex items-center gap-1.5 text-[9px] text-[#A0A8B3]">
          <span className="w-4 h-px rounded-full" style={{ backgroundColor: afterColor }} />
          {legendAfter}
        </span>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   Main export
═══════════════════════════════════════════ */
export function LandingStatsCharts() {
  const latencyData    = useMemo(genLatencyData, []);
  const inputData      = useMemo(genInputData, []);
  const fpsStabData    = useMemo(genFpsStabilityData, []);
  const lowFpsData     = useMemo(genLowFpsData, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatChartCard
        value="~12ms"
        label="Estimated Latency"
        accent="emerald"
        beforeColor="#f87171"
        afterColor="#34d399"
        legendBefore="Stock"
        legendAfter="Optimized"
        index={0}
        spark={
          <Sparkline
            data={latencyData}
            beforeColor="#f87171"
            afterColor="#34d399"
            beforeLabel="Stock ping"
            afterLabel="Optimized ping"
            unit="ms"
          />
        }
      />
      <StatChartCard
        value="~8ms"
        label="Estimated Input"
        accent="cyan"
        beforeColor="#fb923c"
        afterColor="#22d3ee"
        legendBefore="Stock"
        legendAfter="Optimized"
        index={1}
        spark={
          <Sparkline
            data={inputData}
            beforeColor="#fb923c"
            afterColor="#22d3ee"
            beforeLabel="Stock delay"
            afterLabel="Optimized delay"
            unit="ms"
          />
        }
      />
      <StatChartCard
        value="More Stable"
        label="Frame Consistency"
        accent="violet"
        beforeColor="#f472b6"
        afterColor="#818cf8"
        legendBefore="Stock"
        legendAfter="Optimized"
        index={2}
        spark={
          <Sparkline
            data={fpsStabData}
            beforeColor="#f472b6"
            afterColor="#818cf8"
            beforeLabel="Stock FPS"
            afterLabel="Optimized FPS"
            unit=" FPS"
          />
        }
      />
      <StatChartCard
        value="Less Stutter"
        label="Worst-Case Frames"
        accent="amber"
        beforeColor="#94a3b8"
        afterColor="#fbbf24"
        legendBefore="Stock lows"
        legendAfter="Optimized lows"
        index={3}
        spark={
          <Sparkline
            data={lowFpsData}
            beforeColor="#94a3b8"
            afterColor="#fbbf24"
            beforeLabel="Stock 1% low"
            afterLabel="Optimized 1% low"
            unit=" FPS"
          />
        }
      />
    </div>
  );
}
