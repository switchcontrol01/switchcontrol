/**
 * tour-line-graph.tsx
 *
 * Reusable animated SVG line graph primitive extracted from OnboardingTour.
 *
 * Features:
 *   - Catmull-Rom smooth curves
 *   - SVG feGaussianBlur glow filter
 *   - Gradient fill under the line
 *   - Draw-in stroke animation (strokeDashoffset)
 *   - Animated end-dot
 *   - Optional label + live value display
 *
 * Usage:
 *   <TourLineGraph points={[28,35,42,30,55]} color="rgba(168,85,247," label="CPU" labelValue="42%" />
 *
 * The `color` prop must be the rgba prefix WITHOUT the closing opacity+paren,
 * e.g. "rgba(168,85,247," — the component appends "0.85)" etc. internally.
 */

import { useRef, useEffect, useState } from 'react';
import { motion } from '@/lib/motionTokens';

export interface TourLineGraphProps {
  /** 0–100 values, at least 2 points */
  points: number[];
  /** rgba prefix, e.g. "rgba(168,85,247," */
  color: string;
  width?: number;
  height?: number;
  /** Delay in seconds before draw-in starts */
  delay?: number;
  label?: string;
  labelValue?: string;
}

/** Catmull-Rom smooth path from an array of [x, y] coords */
function catmullRomPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function TourLineGraph({
  points,
  color,
  width = 360,
  height = 52,
  delay = 0,
  label,
  labelValue,
}: TourLineGraphProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLen, setPathLen] = useState(0);

  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const toX = (i: number) => pad + (i / (points.length - 1)) * w;
  const toY = (v: number) => pad + h - (v / 100) * h;

  const coords: [number, number][] = points.map((v, i) => [toX(i), toY(v)]);
  const linePath = catmullRomPath(coords);
  const lastPt = coords[coords.length - 1];
  const fillPath = linePath + ` L ${lastPt[0]} ${height} L ${pad} ${height} Z`;

  const uid = `tlg-${color.slice(5, 12).replace(/[^a-z0-9]/gi, '')}-${Math.round(delay * 10)}`;

  useEffect(() => {
    if (pathRef.current) setPathLen(pathRef.current.getTotalLength());
  }, [points]);

  return (
    <div className="relative">
      {(label || labelValue) && (
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          {label && (
            <span
              className="text-[9px] font-bold uppercase tracking-[0.15em]"
              style={{ color: `${color}0.55)` }}
            >
              {label}
            </span>
          )}
          {labelValue && (
            <motion.span
              className="text-[11px] font-mono font-bold tabular-nums"
              style={{ color: `${color}0.9)` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 0.6 }}
            >
              {labelValue}
            </motion.span>
          )}
        </div>
      )}

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={`${color}0.28)`} />
            <stop offset="100%" stopColor={`${color}0)`} />
          </linearGradient>
          <filter id={`${uid}-glow`}>
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Gradient fill under the curve */}
        <motion.path
          d={fillPath}
          fill={`url(#${uid}-fill)`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: delay + 0.3 }}
        />

        {/* Line — draw-in via dasharray/offset */}
        <motion.path
          ref={pathRef}
          d={linePath}
          fill="none"
          stroke={`${color}0.85)`}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${uid}-glow)`}
          style={{ strokeDasharray: pathLen || 1000, strokeDashoffset: pathLen || 1000 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* Glowing end-dot */}
        {coords.length > 0 && (
          <motion.circle
            cx={lastPt[0]}
            cy={lastPt[1]}
            r="3.5"
            fill={`${color}0.9)`}
            filter={`url(#${uid}-glow)`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0.7, 1], scale: 1 }}
            transition={{ duration: 0.4, delay: delay + 1.0 }}
          />
        )}
      </svg>
    </div>
  );
}
