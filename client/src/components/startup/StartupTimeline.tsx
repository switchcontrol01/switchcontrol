import { useMemo } from "react";
import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import type { BootApp, StartupCategory } from "./startupUtils";

const CAT_COLORS: Record<StartupCategory, string> = {
  system:     "#a78bfa", // purple
  drivers:    "#22d3ee", // cyan
  userApps:   "#f97316", // orange
  scheduled:  "#4ade80", // green
  broken:     "#ef4444", // red
};

interface Props {
  apps: BootApp[];
  visible: boolean;
}

export function StartupTimeline({ apps, visible }: Props) {
  const segments = useMemo(() => {
    const enabled = apps.filter(a => a.entry.enabled && !a.entry.broken);
    if (enabled.length === 0) return [];

    const totalDelay = enabled.reduce((s, a) => s + a.delayMs, 0) || 1;
    let acc = 0;
    return enabled.map(a => {
      const pct = a.delayMs / totalDelay;
      const start = acc;
      acc += pct;
      return {
        app: a,
        pct,
        start,
        end: acc,
        widthPct: Math.max(pct * 100, 1.5),
      };
    });
  }, [apps]);

  if (!visible || segments.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
        <p className="text-xs text-muted-foreground/40">Scan to see boot timeline</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white">Boot Sequence</span>
        <span className="text-[10px] text-muted-foreground/40">left = first → right = last</span>
      </div>

      {/* Timeline bar */}
      <div className="flex h-5 rounded-lg overflow-hidden bg-[#21262D]">
        {segments.map((seg, i) => (
          <motion.div
            key={seg.app.entry.id}
            className="h-full relative group cursor-pointer"
            style={{ backgroundColor: CAT_COLORS[seg.app.category] }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
            title={`${seg.app.entry.name} — ${Math.round(seg.app.delayMs)}ms est.`}
          >
            {/* Tooltip on hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              <div className="px-2 py-1 rounded-md bg-[#0c0c14]/90 border border-[#2A313A]0 text-[10px] text-white whitespace-nowrap shadow-xl">
                {seg.app.entry.name} · {Math.round(seg.app.delayMs)}ms
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(CAT_COLORS)
          .filter(([cat]) => segments.some(s => s.app.category === cat))
          .map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-1 text-[10px]">
              <span className="size-2 rounded-sm" style={{ backgroundColor: color }} />
              <span className="text-white/50 capitalize">{cat === "userApps" ? "User Apps" : cat}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
