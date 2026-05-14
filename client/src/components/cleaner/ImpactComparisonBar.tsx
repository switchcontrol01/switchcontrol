import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fmtBytes } from "@/hooks/useCountUp";

interface BarItem {
  label: string;
  before: number;
  after: number;
  unit?: string;
  color?: string;
}

interface Props {
  items: BarItem[];
  visible: boolean;
  className?: string;
  delay?: number;
}

export function ImpactComparisonBar({
  items,
  visible,
  className,
  delay = 0,
}: Props) {
  const rows = useMemo(() => {
    return items.map((item) => {
      const max = Math.max(1, item.before);
      const beforePct = (item.before / max) * 100;
      const afterPct = (item.after / max) * 100;
      const reduction = Math.max(0, item.before - item.after);
      return { ...item, beforePct, afterPct, reduction };
    });
  }, [items]);

  if (!visible || rows.length === 0) return null;

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border border-[#2A313A] bg-[#1A1F26] backdrop-blur-sm p-4",
        className
      )}
    >
      <span className="text-[11px] font-medium text-[#A0A8B3] uppercase tracking-wider block mb-1">
        Impact
      </span>

      {rows.map((row, i) => {
        const color = row.color ?? "#22d3ee";

        return (
          <motion.div
            key={row.label}
            className="space-y-1.5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: delay + i * 0.1,
              duration: 0.4,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {/* Label row */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#E6EAF0] font-medium">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[#6B7380] tabular-nums">
                  {row.unit === "bytes"
                    ? fmtBytes(row.before)
                    : `${row.before}${row.unit ?? ""}`}
                </span>
                <span className="text-[#E6EAF0]/15">→</span>
                <motion.span
                  className="tabular-nums font-semibold"
                  style={{ color }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: delay + i * 0.1 + 0.3 }}
                >
                  {row.unit === "bytes"
                    ? fmtBytes(row.after)
                    : `${row.after}${row.unit ?? ""}`}
                </motion.span>
              </div>
            </div>

            {/* Bar track */}
            <div className="relative h-2.5 rounded-full bg-[#21262D] overflow-hidden">
              {/* Before bar (full width reference) */}
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${row.beforePct}%`,
                  background: "rgba(255,255,255,0.06)",
                }}
              />

              {/* After bar (shrinks from before) */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${color}80, ${color})`,
                }}
                initial={{ width: `${row.beforePct}%` }}
                animate={{ width: `${row.afterPct}%` }}
                transition={{
                  delay: delay + i * 0.1 + 0.15,
                  duration: 0.6,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />

              {/* Glow sweep */}
              <motion.div
                className="absolute inset-y-0 w-8 rounded-full"
                style={{
                  background: `linear-gradient(90deg, transparent, ${color}40, transparent)`,
                }}
                initial={{ left: "0%", opacity: 0 }}
                animate={{
                  left: `${row.afterPct - 5}%`,
                  opacity: [0, 1, 0],
                }}
                transition={{
                  delay: delay + i * 0.1 + 0.4,
                  duration: 0.5,
                  ease: "easeOut",
                }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
