import { useMemo } from "react";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { fmtBytes } from "@/hooks/useCountUp";

interface CategorySegment {
  name: string;
  bytes: number;
  color: string;
}

interface Props {
  categories: CategorySegment[];
  totalBytes: number;
  visible: boolean;
}

const CAT_COLORS: Record<string, string> = {
  storage: "#33E0FF",
  privacy: "#22d3ee",
  latency: "#f97316",
  performance: "#4ade80",
};

const CAT_NAMES: Record<string, string> = {
  storage: "Storage Noise",
  privacy: "Privacy Residue",
  latency: "Latency Killers",
  performance: "Performance Waste",
};

export function CleanerRadialChart({ categories, totalBytes, visible }: Props) {
  const segments = useMemo(() => {
    const valid = categories.filter(c => c.bytes > 0);
    const total = valid.reduce((a, c) => a + c.bytes, 0) || 1;
    let acc = 0;
    return valid.map(c => {
      const pct = c.bytes / total;
      const start = acc;
      acc += pct;
      return {
        ...c,
        pct,
        start,
        end: acc,
        dashArray: `${pct * 251.2} ${251.2 - pct * 251.2}`,
        dashOffset: -start * 251.2,
      };
    });
  }, [categories]);

  const hasData = segments.length > 0 && visible;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-48">
        {/* Background ring */}
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
          <AnimatePresence>
            {hasData && segments.map((seg, i) => (
              <motion.circle
                key={seg.name}
                cx="50" cy="50" r="40"
                fill="none"
                stroke={seg.color}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={seg.dashArray}
                initial={{ strokeDashoffset: -251.2 }}
                animate={{ strokeDashoffset: seg.dashOffset }}
                transition={{ duration: 0.8, delay: 0.15 * i, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </AnimatePresence>
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.p
            className="text-xl font-bold text-white"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={hasData ? { opacity: 1, scale: 1 } : { opacity: 0.3 }}
            transition={{ duration: 0.5 }}
          >
            {hasData ? fmtBytes(totalBytes) : "—"}
          </motion.p>
          <p className="text-[10px] text-muted-foreground/60">total found</p>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4 w-full">
        {segments.map((seg) => (
          <div key={seg.name} className="flex items-center gap-2 text-[11px]">
            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-white/70 truncate">{seg.name}</span>
            <span className="text-muted-foreground/50 ml-auto tabular-nums">{fmtBytes(seg.bytes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function useRadialData(
  categoryTotals: Record<string, { sizeBytes: number; fileCount: number; itemCount: number }> | null
): CategorySegment[] {
  return useMemo(() => {
    if (!categoryTotals) return [];
    return Object.entries(categoryTotals)
      .filter(([, v]) => v.sizeBytes > 0)
      .map(([cat, v]) => ({
        name: CAT_NAMES[cat] ?? cat,
        bytes: v.sizeBytes,
        color: CAT_COLORS[cat] ?? "#94a3b8",
      }));
  }, [categoryTotals]);
}
