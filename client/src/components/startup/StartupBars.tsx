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
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
        <p className="text-xs text-muted-foreground/40">Scan to see boot weight</p>
      </div>
    );
  }

  const bars = [
    {
      label: "CPU Load", icon: Cpu, color: "#a78bfa", // purple
      value: totals.cpu, max: totals.maxCpu, unit: "%",
    },
    {
      label: "Disk I/O", icon: HardDrive, color: "#22d3ee", // cyan
      value: totals.disk, max: totals.maxDisk, unit: "%",
    },
    {
      label: "Delay", icon: Gauge, color: "#f97316", // orange
      value: totals.delay, max: totals.maxDelay, unit: "ms",
    },
  ];

  return (
    <div className="space-y-3">
      <span className="text-xs font-medium text-white">Boot Weight</span>
      <div className="space-y-2.5">
        {bars.map((bar, i) => {
          const Icon = bar.icon;
          const pct = Math.min((bar.value / bar.max) * 100, 100);
          return (
            <div key={bar.label} className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground/60 flex items-center gap-1">
                  <Icon className="size-3" style={{ color: bar.color }} /> {bar.label}
                </span>
                <span className="text-white/60 tabular-nums">
                  {Math.round(bar.value)}{bar.unit}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: bar.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(pct, 2)}%` }}
                  transition={{ duration: 0.6, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
