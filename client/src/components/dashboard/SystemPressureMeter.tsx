import { useMemo, useRef, useEffect, useState, memo, useCallback } from "react";
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

/* ── Color system ──
   0-35   = clean     (cyan)
   36-70  = moderate  (amber)
   71-100 = overloaded (red)
*/
function pressureState(p: number): { color: string; label: string; glow: string } {
  if (p <= 35) return { color: "#00D4FF", label: "Clean", glow: "rgba(0,212,255,0.15)" };
  if (p <= 70) return { color: "#F59E0B", label: "Moderate", glow: "rgba(245,158,11,0.15)" };
  return { color: "#EF4444", label: "Overloaded", glow: "rgba(239,68,68,0.15)" };
}

export const SystemPressureMeter = memo(function SystemPressureMeter({
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
  const state = pressureState(pressure);

  /* Animated number — RAF-driven, stops when complete, pauses when hidden */
  const [displayValue, setDisplayValue] = useState(pressure);
  const rafRef = useRef<number>(0);
  const startRef = useRef(pressure);
  const targetRef = useRef(pressure);
  const startTimeRef = useRef<number>(0);
  const duration = 600;

  const animateTo = useCallback((target: number) => {
    const start = displayValue;
    const diff = target - start;
    if (diff === 0) return;

    startRef.current = start;
    targetRef.current = target;
    startTimeRef.current = performance.now();

    const tick = (now: number) => {
      if (document.hidden) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsed = now - startTimeRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const next = Math.round(startRef.current + diff * eased);
      setDisplayValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [displayValue]);

  useEffect(() => {
    animateTo(pressure);
    return () => cancelAnimationFrame(rafRef.current);
  }, [pressure, animateTo]);

  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const dash = (displayValue / 100) * circumference;
  const gap = circumference - dash;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-2xl",
        "border border-[#2A313A] bg-[#21262D] shadow-[0_2px_12px_rgba(0,0,0,0.20)] p-5",
        className
      )}
    >
      <span className="text-[11px] font-medium text-[#A0A8B3] uppercase tracking-wider mb-3">
        System Pressure
      </span>

      <div className="relative w-36 h-36">
        <svg width="144" height="144" viewBox="0 0 144 144" className="absolute inset-0">
          {/* Track */}
          <circle
            cx="72"
            cy="72"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="10"
            strokeLinecap="round"
            transform="rotate(-90 72 72)"
          />

          {/* Warning zone arcs (subtle background indicators) */}
          <circle
            cx="72"
            cy="72"
            r={radius}
            fill="none"
            stroke="rgba(245,158,11,0.06)"
            strokeWidth="10"
            strokeLinecap="butt"
            strokeDasharray={`${circumference * 0.35} ${circumference * 0.65}`}
            strokeDashoffset={-circumference * 0.35}
            transform="rotate(-90 72 72)"
          />
          <circle
            cx="72"
            cy="72"
            r={radius}
            fill="none"
            stroke="rgba(239,68,68,0.06)"
            strokeWidth="10"
            strokeLinecap="butt"
            strokeDasharray={`${circumference * 0.30} ${circumference * 0.70}`}
            strokeDashoffset={-circumference * 0.70}
            transform="rotate(-90 72 72)"
          />

          {/* Pressure arc — animated with transform only */}
          <motion.circle
            cx="72"
            cy="72"
            r={radius}
            fill="none"
            stroke={state.color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            transform="rotate(-90 72 72)"
            initial={false}
            animate={{ strokeDasharray: `${dash} ${gap}` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-3xl font-bold tabular-nums transition-colors duration-300"
            style={{ color: state.color }}
          >
            {displayValue}
          </span>
          <span className="text-[10px] text-[#6B7380] mt-0.5 font-medium uppercase tracking-wide">
            {state.label}
          </span>
        </div>
      </div>

      {/* Breakdown — matte, structured */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 mt-4 w-full text-[10px]">
        <MetricRow label="CPU" value={cpuPercent} threshold={80} />
        <MetricRow label="RAM" value={ramPercent} threshold={85} />
        <MetricRow label="Disk" value={diskPercent} threshold={90} />
        <MetricRow label="Procs" value={Math.round(processLoad)} threshold={80} />
      </div>
    </div>
  );
});

function MetricRow({
  label,
  value,
  threshold,
}: {
  label: string;
  value: number;
  threshold: number;
}) {
  const isHigh = value > threshold;
  const isModerate = value > threshold * 0.6;
  const dotColor = isHigh ? "#EF4444" : isModerate ? "#F59E0B" : "#00D4FF";

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
      <span className="text-[#6B7380]">{label}</span>
      <span
        className={cn(
          "tabular-nums ml-auto font-medium",
          isHigh ? "text-[#EF4444]" : isModerate ? "text-[#F59E0B]" : "text-[#E6EAF0]"
        )}
      >
        {Math.round(value)}%
      </span>
    </div>
  );
}
