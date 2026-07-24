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
  const circumference = 2 * Math.PI * 44; // r=44

  return (
    <div className="relative flex flex-col items-center justify-center p-6 rounded-2xl bg-[#1A1F26]/60 border border-white/[0.04] backdrop-blur-xl overflow-hidden group">
      {/* Background ambient glow */}
      <div 
        className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity duration-700 pointer-events-none"
        style={{ background: `radial-gradient(circle at center, ${color} 0%, transparent 70%)` }}
      />
      
      <div className="relative w-32 h-32 flex items-center justify-center">
        <svg className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-xl" viewBox="0 0 100 100">
          {/* Track */}
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="6" />
          {/* Ticks */}
          <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" strokeDasharray="2 4" />
          {/* Value */}
          <motion.circle
            cx="50" cy="50" r="44"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: visible ? circumference - (score / 100) * circumference : circumference }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </svg>
        
        <div className="flex flex-col items-center justify-center relative z-10">
          <motion.span
            className="text-4xl font-bold tracking-tighter"
            style={{ color: visible ? "#E6EAF0" : "rgba(255,255,255,0.2)" }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: visible ? 1 : 0.8, opacity: visible ? 1 : 0.5 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {visible ? score : "—"}
          </motion.span>
          <motion.span 
            className="text-[10px] uppercase tracking-[0.2em] font-bold mt-1"
            style={{ color: visible ? color : "rgba(255,255,255,0.3)" }}
          >
            {visible ? label : "Score"}
          </motion.span>
        </div>
      </div>
    </div>
  );
}
