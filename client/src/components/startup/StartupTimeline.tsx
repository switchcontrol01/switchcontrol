import { useMemo } from "react";
import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import type { BootApp, StartupCategory } from "./startupUtils";

const CAT_COLORS: Record<StartupCategory, string> = {
  system:     "#00D4FF",
  drivers:    "#22d3ee",
  userApps:   "#f97316",
  scheduled:  "#4ade80",
  broken:     "#ef4444",
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
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-[#1A1F26]/60 backdrop-blur-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#E6EAF0] uppercase tracking-wider">Sequence</span>
        <span className="text-[9px] text-muted-foreground/40 font-mono">T=0ms</span>
      </div>

      {/* Timeline bar */}
      <div className="relative flex h-3 rounded-md overflow-hidden bg-black/40 border border-white/[0.02]">
        {segments.map((seg, i) => (
          <motion.div
            key={seg.app.entry.id}
            className="h-full relative group cursor-pointer border-r border-[#1A1F26]/80 last:border-r-0"
            style={{
              backgroundColor: CAT_COLORS[seg.app.category],
              width: `${seg.widthPct}%`,
              transformOrigin: "left",
            }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Tooltip on hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-20 translate-y-2 group-hover:translate-y-0">
              <div className="px-2.5 py-1.5 rounded-lg bg-[#0c0c14]/95 border border-white/[0.08] backdrop-blur-xl text-[10px] text-[#E6EAF0] whitespace-nowrap shadow-2xl flex flex-col items-center gap-0.5">
                <span className="font-medium">{seg.app.entry.name}</span>
                <span className="text-muted-foreground font-mono">{Math.round(seg.app.delayMs)}ms</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
        {Object.entries(CAT_COLORS)
          .filter(([cat]) => segments.some(s => s.app.category === cat))
          .map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide font-medium">
              <span className="size-2 rounded-full shadow-sm" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }} />
              <span className="text-[#A0A8B3]">{cat === "userApps" ? "User Apps" : cat}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
