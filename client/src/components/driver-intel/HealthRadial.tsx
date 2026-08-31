/**
 * HealthRadial.tsx
 *
 * Animated radial health score + per-subsystem bars. The ring animates once
 * on data arrival and then rests — no perpetual spinning.
 */

import { useEffect, useRef, useState } from "react";
import { motion, useMotion } from "@/lib/motion";
import type { HealthScore } from "@/lib/driver-intel-data";
import { useTranslation } from "@/lib/i18n";

function scoreColor(v: number): string {
  if (v >= 85) return "#34d399";
  if (v >= 60) return "#fbbf24";
  return "#f87171";
}

function useCountUp(target: number, run: boolean, duration = 900): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    if (!run) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, run, duration]);
  return value;
}

interface HealthRadialProps {
  score: HealthScore;
}

// Clamp a raw score value to a valid [0,100] integer. Guards against NaN,
// undefined, null, Infinity, and out-of-range values coming from any scan path.
function clamp(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.round(Math.min(100, Math.max(0, v)));
}

export function HealthRadial({ score }: HealthRadialProps) {
  const { prefersReducedMotion } = useMotion();
  const { t } = useTranslation();
  const overall = clamp(score.overall);
  const display = useCountUp(overall, !prefersReducedMotion);
  const color = scoreColor(overall);

  const R = 52;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - overall / 100);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative" style={{ width: 150, height: 150 }}>
        <svg viewBox="0 0 130 130" className="w-full h-full -rotate-90">
          <circle cx="65" cy="65" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
          <motion.circle
            cx="65"
            cy="65"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: prefersReducedMotion ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold tabular-nums" style={{ color }}>
            {display}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
            {t("Health")}
          </span>
        </div>
      </div>

      {/* Subsystem bars */}
      <div className="w-full space-y-2">
        {score.subscores.map((s, i) => {
          const safe = clamp(s.score);
          const c = scoreColor(safe);
          return (
            <div key={s.kind} className="flex items-center gap-2" data-testid={`subscore-${s.kind}`}>
              <span className="text-[11px] text-muted-foreground w-20 shrink-0 truncate">
                {t(s.label)}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: c }}
                  initial={{ width: 0 }}
                  animate={{ width: `${safe}%` }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.7,
                    delay: prefersReducedMotion ? 0 : 0.1 * i,
                    ease: "easeOut",
                  }}
                />
              </div>
              <span className="text-[11px] tabular-nums w-7 text-right" style={{ color: c }}>
                {safe}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
