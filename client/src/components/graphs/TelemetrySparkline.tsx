/**
 * TelemetrySparkline — reusable animated SVG area/line graph.
 *
 * Features:
 *   - Catmull-Rom smooth path through data points
 *   - Stroke-dashoffset draw-in animation on mount
 *   - Gradient area fill with inner glow
 *   - Moving endpoint glow dot
 *   - Low-opacity grid system
 *   - Animated highlight sweep (CSS keyframe)
 *   - Subtle idle pulse after reveal
 */

import { useMemo, useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SparklinePoint {
  value: number;
  label?: string;
}

export interface TelemetrySparklineProps {
  points: SparklinePoint[];
  min?: number;
  max?: number;
  color?: string;
  colorStop?: string;
  height?: number;
  showGrid?: boolean;
  showArea?: boolean;
  showEndDot?: boolean;
  showSweep?: boolean;
  className?: string;
  strokeWidth?: number;
  delay?: number;
}

function catmullRomPath(pts: [number, number][], tension = 0.3): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function TelemetrySparkline({
  points,
  min,
  max,
  color = "#06b6d4",
  colorStop = "#00D4FF",
  height = 64,
  showGrid = true,
  showArea = true,
  showEndDot = true,
  showSweep = true,
  className,
  strokeWidth = 1.5,
  delay = 0,
}: TelemetrySparklineProps) {
  const id = useId().replace(/:/g, "");
  const W = 200;
  const H = height;
  const PAD = 2;

  const { linePath, areaPath, totalLen, endX, endY } = useMemo(() => {
    if (points.length < 2) {
      return { linePath: "", areaPath: "", totalLen: 0, endX: 0, endY: H / 2 };
    }
    const vals = points.map((p) => p.value);
    const lo = min ?? Math.min(...vals);
    const hi = max ?? Math.max(...vals);
    const range = hi - lo || 1;

    const mapped: [number, number][] = vals.map((v, i) => [
      PAD + (i / (vals.length - 1)) * (W - PAD * 2),
      PAD + (1 - (v - lo) / range) * (H - PAD * 2),
    ]);

    const lp = catmullRomPath(mapped);
    const last = mapped[mapped.length - 1];
    const ap =
      lp +
      ` L ${last[0]} ${H - PAD} L ${mapped[0][0]} ${H - PAD} Z`;

    // Approximate path length for dashoffset animation
    const len = (W - PAD * 2) * 1.15;
    return { linePath: lp, areaPath: ap, totalLen: len, endX: last[0], endY: last[1] };
  }, [points, min, max, H]);

  if (points.length < 2) return null;

  return (
    <div className={cn("relative select-none", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        style={{ height }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id={`line-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={colorStop} stopOpacity="0.8" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
          <filter id={`glow-${id}`} x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`dot-glow-${id}`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {showSweep && (
            <linearGradient id={`sweep-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0" />
              <stop offset="50%" stopColor="white" stopOpacity="0.06" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
          )}
        </defs>

        {/* Grid lines */}
        {showGrid && [0.25, 0.5, 0.75].map((t, i) => (
          <motion.line
            key={i}
            x1={PAD} y1={PAD + t * (H - PAD * 2)}
            x2={W - PAD} y2={PAD + t * (H - PAD * 2)}
            stroke="white" strokeOpacity="0.06" strokeWidth="0.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.1 + i * 0.06, duration: 0.4 }}
          />
        ))}

        {/* Area fill */}
        {showArea && areaPath && (
          <motion.path
            d={areaPath}
            fill={`url(#area-${id})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.35, duration: 0.6 }}
          />
        )}

        {/* Line */}
        {linePath && (
          <motion.path
            d={linePath}
            fill="none"
            stroke={`url(#line-${id})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#glow-${id})`}
            initial={{ strokeDasharray: totalLen, strokeDashoffset: totalLen, opacity: 0.7 }}
            animate={{ strokeDashoffset: 0, opacity: 1 }}
            transition={{ delay: delay + 0.1, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        {/* Moving sweep highlight */}
        {showSweep && (
          <rect
            x={0} y={0} width={W * 0.28} height={H}
            fill={`url(#sweep-${id})`}
            style={{
              animation: `telemetrySweep 4s ease-in-out infinite`,
              transformOrigin: "left center",
            }}
          />
        )}

        {/* End dot glow */}
        {showEndDot && (
          <>
            <motion.circle
              cx={endX} cy={endY} r={4}
              fill={color} fillOpacity="0.15"
              filter={`url(#dot-glow-${id})`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0.9, 0.6] }}
              transition={{ delay: delay + 0.9, duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.circle
              cx={endX} cy={endY} r={2}
              fill={color}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: delay + 0.9, duration: 0.3 }}
            />
          </>
        )}
      </svg>

      <style>{`
        @keyframes telemetrySweep {
          0%   { transform: translateX(-30%); }
          100% { transform: translateX(${W + W * 0.28}px); }
        }
      `}</style>
    </div>
  );
}
