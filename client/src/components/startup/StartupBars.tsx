import { useMemo } from "react";
import { motion } from "@/lib/motionTokens";
import type { BootApp } from "./startupUtils";
import { Cpu, HardDrive, Timer } from "lucide-react";

interface Props {
  apps: BootApp[];
  visible: boolean;
}

const METRICS = [
  {
    key:   "cpu"   as const,
    label: "CPU Load",
    icon:  Cpu,
    color: "#00D4FF",
    glow:  "rgba(0,212,255,0.20)",
    unit:  "%",
    dim:   "rgba(0,212,255,0.08)",
    border:"rgba(0,212,255,0.15)",
  },
  {
    key:   "disk"  as const,
    label: "Disk I/O",
    icon:  HardDrive,
    color: "#22d3ee",
    glow:  "rgba(34,211,238,0.20)",
    unit:  "%",
    dim:   "rgba(34,211,238,0.08)",
    border:"rgba(34,211,238,0.15)",
  },
  {
    key:   "delay" as const,
    label: "Total Delay",
    icon:  Timer,
    color: "#f97316",
    glow:  "rgba(249,115,22,0.20)",
    unit:  "ms",
    dim:   "rgba(249,115,22,0.08)",
    border:"rgba(249,115,22,0.15)",
  },
] as const;

export function StartupBars({ apps, visible }: Props) {
  const enabled = apps.filter(a => a.entry.enabled && !a.entry.broken);

  const totals = useMemo(() => {
    if (enabled.length === 0) return null;
    const cpu   = enabled.reduce((s, a) => s + a.cpuImpact,  0);
    const disk  = enabled.reduce((s, a) => s + a.diskImpact, 0);
    const delay = enabled.reduce((s, a) => s + a.delayMs,    0);
    return {
      cpu,  maxCpu:   enabled.length * 40,
      disk, maxDisk:  enabled.length * 35,
      delay,maxDelay: Math.max(delay, 1),
    };
  }, [enabled]);

  if (!visible || !totals) {
    return (
      <div
        className="rounded-2xl border p-6 flex items-center justify-center min-h-[130px]"
        style={{ background: "rgba(26,31,38,0.6)", borderColor: "rgba(255,255,255,0.04)" }}
      >
        <p className="text-xs text-muted-foreground/35 font-medium tracking-wide uppercase">
          Awaiting telemetry
        </p>
      </div>
    );
  }

  const values: Record<"cpu" | "disk" | "delay", number> = {
    cpu:   totals.cpu,
    disk:  totals.disk,
    delay: totals.delay,
  };
  const maxes: Record<"cpu" | "disk" | "delay", number> = {
    cpu:   totals.maxCpu,
    disk:  totals.maxDisk,
    delay: totals.maxDelay,
  };

  return (
    <div
      className="rounded-2xl border p-5 space-y-3"
      style={{ background: "rgba(26,31,38,0.6)", borderColor: "rgba(255,255,255,0.04)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#E6EAF0] uppercase tracking-wider">Boot Load</span>
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[9px] text-emerald-400 uppercase tracking-widest font-bold">Active</span>
        </div>
      </div>

      {/* Network-style metric boxes — each metric in its own bordered card */}
      <div className="grid grid-cols-3 gap-2">
        {METRICS.map((m, i) => {
          const val  = values[m.key];
          const max  = maxes[m.key];
          const pct  = Math.min((val / max) * 100, 100);
          const Icon = m.icon;

          return (
            <div
              key={m.key}
              className="rounded-xl p-3 flex flex-col gap-2 relative overflow-hidden"
              style={{
                background:  m.dim,
                border:      `1px solid ${m.border}`,
              }}
            >
              {/* Ambient glow top-right */}
              <div
                className="absolute -top-4 -right-4 w-12 h-12 rounded-full blur-xl pointer-events-none"
                style={{ background: m.glow }}
              />

              {/* Label row */}
              <div className="flex items-center gap-1.5 relative z-10">
                <span
                  className="size-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: m.color, boxShadow: `0 0 5px ${m.color}` }}
                />
                <Icon className="size-2.5" style={{ color: m.color }} />
                <span
                  className="text-[8px] font-bold uppercase tracking-wide"
                  style={{ color: m.color + "cc" }}
                >
                  {m.label}
                </span>
              </div>

              {/* Value */}
              <div className="relative z-10">
                <span className="text-lg font-black tabular-nums text-[#E6EAF0] leading-none">
                  {m.key === "delay" ? `${Math.round(val)}` : `${Math.round(val)}`}
                </span>
                <span className="text-[9px] text-muted-foreground/50 ml-0.5 font-mono">{m.unit}</span>
              </div>

              {/* Animated bar */}
              <div
                className="h-1 rounded-full overflow-hidden relative z-10"
                style={{ background: "rgba(0,0,0,0.35)" }}
              >
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    backgroundColor: m.color,
                    boxShadow: `0 0 6px ${m.color}`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(pct, 2)}%` }}
                  transition={{ duration: 0.9, delay: 0.1 * i, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
