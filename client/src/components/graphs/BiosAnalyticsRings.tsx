/**
 * BiosAnalyticsRings — premium animated radial ring cluster + radar graph
 * for the BIOS Advisor top section.
 *
 * Shows 4 glowing rings:  Memory · Security · Firmware · Performance
 * Plus a radar polygon: CPU · RAM · Security · Power · Stability
 */

import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ── Radial ring ────────────────────────────────────────────────────────────────

interface RingProps {
  label: string;
  value: number;
  max?: number;
  color: string;
  glowColor: string;
  size?: number;
  strokeW?: number;
  delay?: number;
  sublabel?: string;
}

function AnimatedRing({
  label, value, max = 100, color, glowColor, size = 80,
  strokeW = 6, delay = 0, sublabel,
}: RingProps) {
  const id = useId().replace(/:/g, "");
  const r = (size - strokeW * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const dash = circ * pct;

  return (
    <motion.div
      className="flex flex-col items-center gap-1.5"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
          <defs>
            <filter id={`rg-${id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="white" strokeOpacity="0.06" strokeWidth={strokeW} />

          {/* Rotating ambient highlight arc */}
          <motion.circle
            cx={cx} cy={cy} r={r}
            fill="none" stroke={color} strokeOpacity="0.12" strokeWidth={strokeW}
            strokeDasharray={`${circ * 0.08} ${circ * 0.92}`}
            strokeLinecap="round"
            animate={{ strokeDashoffset: [0, -circ] }}
            transition={{ delay: delay + 1, duration: 6, repeat: Infinity, ease: "linear" }}
          />

          {/* Value arc */}
          <motion.circle
            cx={cx} cy={cy} r={r}
            fill="none" stroke={color} strokeWidth={strokeW}
            strokeDasharray={circ} strokeLinecap="round"
            filter={`url(#rg-${id})`}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - dash }}
            transition={{ delay: delay + 0.1, duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-base font-mono font-bold tabular-nums leading-none"
            style={{ color, textShadow: `0 0 12px ${glowColor}` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.6, duration: 0.4 }}
          >
            {Math.round(value)}
          </motion.span>
        </div>

        {/* Subtle center glow */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${glowColor} 0%, transparent 65%)`,
            opacity: 0.12,
          }}
        />
      </div>

      <div className="text-center">
        <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest leading-none">{label}</p>
        {sublabel && <p className="text-[9px] text-white/25 mt-0.5 leading-none">{sublabel}</p>}
      </div>
    </motion.div>
  );
}

// ── Radar / polygon graph ──────────────────────────────────────────────────────

interface RadarAxis {
  label: string;
  value: number;
  color?: string;
}

function RadarGraph({ axes, size = 140, delay = 0 }: { axes: RadarAxis[]; size?: number; delay?: number }) {
  const id = useId().replace(/:/g, "");
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 16;
  const n = axes.length;

  function polar(i: number, r: number): [number, number] {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  const gridRings = [0.3, 0.6, 1.0];

  const dataPoints = axes.map((ax, i) => polar(i, maxR * Math.max(0, Math.min(1, ax.value / 100))));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";

  // Approximate perimeter for dashoffset animation
  const perim = useMemo(() => {
    let len = 0;
    for (let i = 0; i < dataPoints.length; i++) {
      const a = dataPoints[i];
      const b = dataPoints[(i + 1) % dataPoints.length];
      len += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return len;
  }, [dataPoints]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id={`radg-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.04" />
        </radialGradient>
        <filter id={`radf-${id}`}>
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Grid rings */}
      {gridRings.map((t, ri) => {
        const pts = Array.from({ length: n }, (_, i) => polar(i, maxR * t));
        const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
        return (
          <motion.path key={ri} d={d} fill="none" stroke="white" strokeOpacity={t === 1 ? 0.10 : 0.05} strokeWidth="0.5"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + ri * 0.08, duration: 0.4 }}
          />
        );
      })}

      {/* Axis spokes */}
      {axes.map((_, i) => {
        const [ex, ey] = polar(i, maxR);
        return (
          <motion.line key={i} x1={cx} y1={cy} x2={ex} y2={ey}
            stroke="white" strokeOpacity="0.06" strokeWidth="0.5"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.1, duration: 0.3 }}
          />
        );
      })}

      {/* Data fill */}
      <motion.path d={dataPath} fill={`url(#radg-${id})`}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.45, duration: 0.6 }}
      />

      {/* Data border */}
      <motion.path d={dataPath} fill="none" stroke="#7c3aed" strokeWidth="1.4"
        filter={`url(#radf-${id})`}
        initial={{ strokeDasharray: perim, strokeDashoffset: perim, opacity: 0.8 }}
        animate={{ strokeDashoffset: 0, opacity: 1 }}
        transition={{ delay: delay + 0.2, duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <motion.circle key={i} cx={p[0]} cy={p[1]} r={2.5}
          fill={axes[i].color ?? "#06b6d4"}
          filter={`url(#radf-${id})`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: delay + 0.6 + i * 0.06, duration: 0.3 }}
        />
      ))}

      {/* Axis labels */}
      {axes.map((ax, i) => {
        const [lx, ly] = polar(i, maxR + 10);
        const anchor = lx < cx - 4 ? "end" : lx > cx + 4 ? "start" : "middle";
        return (
          <motion.text key={i} x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle"
            fill="white" fillOpacity="0.4" fontSize="7.5" fontFamily="monospace" fontWeight="600"
            style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.7 + i * 0.06, duration: 0.4 }}
          >
            {ax.label}
          </motion.text>
        );
      })}

      {/* Breathing center glow */}
      <motion.circle cx={cx} cy={cy} r={maxR * 0.15}
        fill="#7c3aed" fillOpacity="0"
        animate={{ r: [maxR * 0.12, maxR * 0.18, maxR * 0.12], fillOpacity: [0.08, 0.14, 0.08] }}
        transition={{ delay: delay + 1.2, duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

// ── Main export: BiosAnalyticsRings ───────────────────────────────────────────

export interface BiosAnalyticsData {
  memoryScore: number;
  securityScore: number;
  firmwareScore: number;
  performanceScore: number;
  latencyScore?: number;
  frametimeScore?: number;
  stabilityScore?: number;
  hasScanned: boolean;
}

export function BiosAnalyticsRings({
  data,
  delay = 0,
}: {
  data: BiosAnalyticsData;
  delay?: number;
}) {
  const rings = [
    {
      label: "Memory",
      sublabel: "Tuning",
      value: data.hasScanned ? data.memoryScore : 0,
      color: "#06b6d4",
      glowColor: "rgba(6,182,212,0.5)",
    },
    {
      label: "Security",
      sublabel: "Posture",
      value: data.hasScanned ? data.securityScore : 0,
      color: "#8b5cf6",
      glowColor: "rgba(139,92,246,0.5)",
    },
    {
      label: "Firmware",
      sublabel: "Readiness",
      value: data.hasScanned ? data.firmwareScore : 0,
      color: "#d946ef",
      glowColor: "rgba(217,70,239,0.5)",
    },
    {
      label: "Perf",
      sublabel: "Readiness",
      value: data.hasScanned ? data.performanceScore : 0,
      color: "#f59e0b",
      glowColor: "rgba(245,158,11,0.5)",
    },
  ];

  const radarAxes = [
    { label: "Latency", value: data.hasScanned ? (data.latencyScore ?? data.firmwareScore) : 0, color: "#06b6d4" },
    { label: "Memory", value: data.hasScanned ? data.memoryScore : 0, color: "#8b5cf6" },
    { label: "Security", value: data.hasScanned ? data.securityScore : 0, color: "#d946ef" },
    { label: "Power", value: data.hasScanned ? data.performanceScore : 0, color: "#f59e0b" },
    { label: "Stability", value: data.hasScanned ? (data.stabilityScore ?? data.firmwareScore) : 0, color: "#34d399" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Ring cluster */}
      <div>
        <motion.p
          className="text-[9px] uppercase tracking-widest text-white/25 font-semibold mb-3"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay, duration: 0.4 }}
        >
          Firmware Dimensions
        </motion.p>
        <div className="flex items-center justify-between gap-2">
          {rings.map((ring, i) => (
            <AnimatedRing
              key={ring.label}
              label={ring.label}
              sublabel={ring.sublabel}
              value={ring.value}
              color={ring.color}
              glowColor={ring.glowColor}
              size={76}
              strokeW={5}
              delay={delay + i * 0.1}
            />
          ))}
        </div>
      </div>

      {/* Radar */}
      <div>
        <motion.p
          className="text-[9px] uppercase tracking-widest text-white/25 font-semibold mb-2"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.4, duration: 0.4 }}
        >
          Performance Radar
        </motion.p>
        <div className="flex justify-center">
          <RadarGraph axes={radarAxes} size={150} delay={delay + 0.3} />
        </div>
      </div>

      {!data.hasScanned && (
        <motion.p
          className="text-[10px] text-white/25 text-center italic"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.5 }}
        >
          Run analysis to see firmware scores
        </motion.p>
      )}
    </div>
  );
}
