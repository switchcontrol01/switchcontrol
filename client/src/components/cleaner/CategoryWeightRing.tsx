import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fmtBytes } from "@/hooks/useCountUp";

interface RingItem {
  id: string;
  label: string;
  valueBytes: number;
  color: string;
  selected?: boolean;
  cleaned?: boolean;
}

interface Props {
  items: RingItem[];
  maxBytes?: number;
  delay?: number;
  className?: string;
  onSelect?: (id: string) => void;
}

const SIZE = 96;
const R = 42;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function CategoryWeightRing({
  items,
  maxBytes,
  delay = 0,
  className,
  onSelect,
}: Props) {
  const max = maxBytes ?? Math.max(1, ...items.map((i) => i.valueBytes));

  const rings = useMemo(() => {
    return items.map((item) => {
      const pct = Math.min(1, item.valueBytes / max);
      const dash = pct * CIRCUMFERENCE;
      const gap = CIRCUMFERENCE - dash;
      return { ...item, pct, dash, gap };
    });
  }, [items, max]);

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4",
        className
      )}
    >
      {rings.map((r, i) => {
        const isEmpty = r.valueBytes === 0;
        const isCleaned = r.cleaned;
        const isSelected = r.selected && !isCleaned;

        return (
          <motion.button
            key={r.id}
            type="button"
            onClick={() => onSelect?.(r.id)}
            className={cn(
              "relative flex flex-col items-center justify-center rounded-xl",
              "border border-[#2A313A] bg-[#1A1F26] backdrop-blur-sm",
              "px-3 py-4 transition-colors",
              isSelected && "bg-[#21262D] border-[#2A313A]",
              isCleaned && "opacity-40"
            )}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: isSelected ? 1.04 : 1 }}
            transition={{
              delay: delay + i * 0.08,
              duration: 0.5,
              ease: [0.22, 1, 0.36, 1],
              scale: { type: "spring", stiffness: 300, damping: 20 },
            }}
            whileTap={{ scale: 0.97 }}
          >
            {/* Glow underlay */}
            {isSelected && (
              <motion.div
                className="absolute inset-0 rounded-xl"
                style={{
                  boxShadow: `0 0 24px 4px ${r.color}20, inset 0 0 12px ${r.color}10`,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
            )}

            {/* SVG Ring */}
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="mb-2"
            >
              <defs>
                <filter id={`glow-${r.id}`} x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Track */}
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="5"
              />

              {/* Animated stroke */}
              <motion.circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={r.color}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${r.dash} ${r.gap}`}
                strokeDashoffset={0}
                filter={isSelected ? `url(#glow-${r.id})` : undefined}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                initial={{ strokeDasharray: `0 ${CIRCUMFERENCE}` }}
                animate={{
                  strokeDasharray:
                    isCleaned
                      ? `0 ${CIRCUMFERENCE}`
                      : `${r.dash} ${r.gap}`,
                  opacity: isCleaned ? 0.3 : isEmpty ? 0.25 : 1,
                }}
                transition={{
                  duration: isCleaned ? 0.5 : 0.6,
                  delay: isCleaned ? 0 : delay + i * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            </svg>

            {/* Label */}
            <span className="text-[11px] font-medium text-[#E6EAF0] leading-tight text-center">
              {r.label}
            </span>
            <motion.span
              className="text-[10px] text-[#6B7380] mt-0.5 tabular-nums"
              animate={{
                opacity: isCleaned ? 0.4 : 1,
              }}
            >
              {isCleaned ? "0 MB" : fmtBytes(r.valueBytes)}
            </motion.span>
          </motion.button>
        );
      })}
    </div>
  );
}
