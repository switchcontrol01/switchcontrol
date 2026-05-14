import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  compareData?: number[];
  color?: string;
  compareColor?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  showFill?: boolean;
  label?: string;
  compareLabel?: string;
  animated?: boolean;
  className?: string;
}

function buildPath(data: number[], w: number, h: number, padding = 4): string {
  if (data.length < 2) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xStep = (w - padding * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = padding + i * xStep;
    const y = h - padding - ((v - min) / range) * (h - padding * 2);
    return [x, y] as [number, number];
  });

  // Catmull-Rom smoothing
  let d = `M ${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

function buildFillPath(data: number[], w: number, h: number, padding = 4): string {
  const linePath = buildPath(data, w, h, padding);
  if (!linePath) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xStep = (w - padding * 2) / (data.length - 1);
  const firstX = padding;
  const lastX = padding + (data.length - 1) * xStep;
  return `${linePath} L ${lastX.toFixed(2)},${(h - padding + 2).toFixed(2)} L ${firstX.toFixed(2)},${(h - padding + 2).toFixed(2)} Z`;
}

export function SparklineChart({
  data,
  compareData,
  color = "#06b6d4",
  compareColor = "#ef4444",
  width = 160,
  height = 44,
  strokeWidth = 1.5,
  showFill = true,
  label,
  compareLabel,
  animated = true,
  className,
}: SparklineProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const comparePathRef = useRef<SVGPathElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (!animated) { setDrawn(true); return; }

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) { setDrawn(true); return; }

    const el = pathRef.current;
    if (!el) { setDrawn(true); return; }

    const len = el.getTotalLength?.() ?? 300;
    el.style.strokeDasharray = `${len}`;
    el.style.strokeDashoffset = `${len}`;

    // Small delay so the element has painted
    const t = setTimeout(() => {
      el.style.transition = "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.strokeDashoffset = "0";

      if (comparePathRef.current) {
        const cEl = comparePathRef.current;
        const cLen = cEl.getTotalLength?.() ?? 300;
        cEl.style.strokeDasharray = `${cLen}`;
        cEl.style.strokeDashoffset = `${cLen}`;
        cEl.style.transition = "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1) 0.1s";
        cEl.style.strokeDashoffset = "0";
      }

      setDrawn(true);
    }, 120);

    return () => clearTimeout(t);
  }, [animated, data.join(",")]);

  const mainPath = buildPath(data, width, height);
  const mainFill = buildFillPath(data, width, height);
  const comparePath = compareData ? buildPath(compareData, width, height) : null;
  const compareFill = compareData ? buildFillPath(compareData, width, height) : null;

  const mainId = `fill-${color.replace("#", "")}-${width}`;
  const compareId = `fill-${compareColor.replace("#", "")}-${width}`;

  return (
    <div className={cn("space-y-1", className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id={mainId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.00" />
          </linearGradient>
          {compareData && (
            <linearGradient id={compareId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={compareColor} stopOpacity="0.18" />
              <stop offset="100%" stopColor={compareColor} stopOpacity="0.00" />
            </linearGradient>
          )}
        </defs>

        {/* Compare fill */}
        {compareFill && drawn && (
          <path d={compareFill} fill={`url(#${compareId})`} />
        )}

        {/* Main fill */}
        {showFill && mainFill && drawn && (
          <path d={mainFill} fill={`url(#${mainId})`} />
        )}

        {/* Compare line */}
        {comparePath && (
          <path
            ref={comparePathRef}
            d={comparePath}
            fill="none"
            stroke={compareColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
        )}

        {/* Main line */}
        {mainPath && (
          <path
            ref={pathRef}
            d={mainPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      {/* Legend */}
      {(label || compareLabel) && (
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
          {compareLabel && (
            <div className="flex items-center gap-1">
              <div className="w-4 h-px" style={{ backgroundColor: compareColor }} />
              <span>{compareLabel}</span>
            </div>
          )}
          {label && (
            <div className="flex items-center gap-1">
              <div className="w-4 h-px" style={{ backgroundColor: color }} />
              <span>{label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Metric card with sparkline (like the reference screenshot) ─────────────────

interface MetricSparkCardProps {
  value: string;
  label: string;
  color: string;
  data: number[];
  compareData?: number[];
  dataLabel?: string;
  compareDataLabel?: string;
  className?: string;
  delay?: number;
}

export function MetricSparkCard({
  value,
  label,
  color,
  data,
  compareData,
  dataLabel,
  compareDataLabel,
  className,
  delay = 0,
}: MetricSparkCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[#1A1F26] border-[#2A313A] p-3 space-y-2 hover:bg-[#21262D] hover:border-[#2A313A]2 transition-all duration-200",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="text-2xl font-bold font-mono tracking-tight"
        style={{ color }}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <SparklineChart
        data={data}
        compareData={compareData}
        color={color}
        compareColor="rgba(255,255,255,0.25)"
        width={120}
        height={36}
        strokeWidth={1.5}
        showFill
        label={dataLabel}
        compareLabel={compareDataLabel}
        animated
      />
    </div>
  );
}
