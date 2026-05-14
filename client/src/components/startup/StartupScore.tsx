import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { getScoreColor, getScoreLabel } from "./startupUtils";

interface Props {
  score: number;
  visible: boolean;
}

export function StartupScore({ score, visible }: Props) {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const circumference = 2 * Math.PI * 36; // r=36
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background ring */}
          <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
          {/* Score ring */}
          <motion.circle
            cx="50" cy="50" r="36"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={visible ? { strokeDashoffset: dashOffset } : { strokeDashoffset: circumference }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-2xl font-bold"
            style={{ color }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={visible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            {visible ? score : "—"}
          </motion.span>
          <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">{visible ? label : "Score"}</span>
        </div>
      </div>
    </div>
  );
}
