import { useMemo } from "react";
import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import type { BootApp } from "./startupUtils";
import { Cpu, HardDrive, Gauge } from "lucide-react";

interface Props {
  apps: BootApp[];
  visible: boolean;
}

export function StartupBars({ apps, visible }: Props) {
  const enabled = apps.filter(a => a.entry.enabled && !a.entry.broken);

  const totals = useMemo(() => {
    if (enabled.length === 0) return null;
    return {
      cpu: enabled.reduce((s, a) => s + a.cpuImpact, 0),
      disk: enabled.reduce((s, a) => s + a.diskImpact, 0),
      delay: enabled.reduce((s, a) => s + a.delayMs, 0),
      maxCpu: enabled.length * 40,
      maxDisk: enabled.length * 35,
      maxDelay: Math.max(enabled.reduce((s, a) => s + a.delayMs, 0), 1),
    };
  }, [enabled]);

  if (!visible || !totals) {
    return (
      <div className="rounded-2xl border border-white/[0.04] bg-[#1A1F26]/60 backdrop-blur-xl p-6 flex items-center justify-center min-h-[140px]">
        <p className="text-xs text-muted-foreground/40 font-medium tracking-wide uppercase">Awaiting telemetry</p>
      </div>
    );
  }

  const bars = [
    { label: "CPU Load", icon: Cpu, color: "#00D4FF", value: totals.cpu, max: totals.maxCpu, unit: "%" },
    { label: "Disk I/O", icon: HardDrive, color: "#22d3ee", value: totals.disk, max: totals.maxDisk, unit: "%" },
    { label: "Delay", icon: Gauge, color: "#f97316", value: totals.delay, max: totals.maxDelay, unit: "ms" },
  ];

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-[#1A1F26]/60 backdrop-blur-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#E6EAF0] uppercase tracking-wider">Boot Load</span>
        <div className="flex gap-1 items-center">
          <div className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[9px] text-emerald-400 uppercase tracking-widest font-bold">Active</span>
        </div>
      </div>
      <div className="space-y-3.5">
        {bars.map((bar, i) => {
          const Icon = bar.icon;
          const pct = Math.min((bar.value / bar.max) * 100, 100);
          return (
            <div key={bar.label} className="space-y-1.5 group">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground/60 flex items-center gap-1.5 font-medium tracking-wide uppercase">
                  <Icon className="size-3.5" style={{ color: bar.color }} /> {bar.label}
                </span>
                <span className="text-[#E6EAF0] font-mono tabular-nums">
                  {Math.round(bar.value)}<span className="text-muted-foreground/50">{bar.unit}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-black/40 overflow-hidden relative border border-white/[0.02]">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: bar.color, boxShadow: `0 0 8px ${bar.color}` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(pct, 2)}%` }}
                  transition={{ duration: 0.8, delay: 0.1 * i, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
