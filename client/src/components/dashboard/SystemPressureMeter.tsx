import { useMemo, useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  processCount: number;
  maxProcesses?: number;
  className?: string;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function pressureColor(p: number): string {
  if (p < 40) return "#4ade80"; // green
  if (p < 70) return "#facc15"; // yellow
  return "#ef4444"; // red
}

export function SystemPressureMeter({
  cpuPercent,
  ramPercent,
  diskPercent,
  processCount,
  maxProcesses = 300,
  className,
}: Props) {
  const processLoad = clamp((processCount / maxProcesses) * 100, 0, 100);

  const rawPressure =
    cpuPercent * 0.35 +
    ramPercent * 0.30 +
    diskPercent * 0.20 +
    processLoad * 0.15;

  const pressure = clamp(Math.round(rawPressure), 0, 100);

  // Animated number — only updates when value changes
  const [displayValue, setDisplayValue] = useState(pressure);
  const targetRef = useRef(pressure);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    targetRef.current = pressure;
    const start = displayValue;
    const diff = pressure - start;
    if (diff === 0) return;

    const startTime = performance.now();
    const duration = 500;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const next = Math.round(start + diff * eased);
      setDisplayValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [pressure]);

  const color = pressureColor(displayValue);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dash = (displayValue / 100) * circumference;
  const gap = circumference - dash;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl",
        "border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5",
        className
      )}
    >
      <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-3">
        System Pressure
      </span>

      <div className="relative w-32 h-32">
        <svg width="128" height="128" viewBox="0 0 128 128" className="absolute inset-0">
          {/* Track */}
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="8"
            strokeLinecap="round"
            transform="rotate(-90 64 64)"
          />

          {/* Pressure arc */}
          <motion.circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            transform="rotate(-90 64 64)"
            initial={false}
            animate={{ strokeDasharray: `${dash} ${gap}` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-2xl font-bold tabular-nums"
            style={{ color }}
            key={displayValue}
            initial={{ scale: 0.9, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {displayValue}
          </motion.span>
          <span className="text-[9px] text-white/30 mt-0.5">/ 100</span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-[10px]">
        <MetricRow label="CPU" value={cpuPercent} color="#4ade80" />
        <MetricRow label="RAM" value={ramPercent} color="#a78bfa" />
        <MetricRow label="Disk" value={diskPercent} color="#22d3ee" />
        <MetricRow label="Procs" value={Math.round(processLoad)} color="#f97316" />
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-white/40">{label}</span>
      <span className="text-white/70 tabular-nums ml-auto">{Math.round(value)}%</span>
    </div>
  );
}
