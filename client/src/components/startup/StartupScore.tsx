import { useState, useEffect } from "react";
import { motion } from "@/lib/motionTokens";
import { getScoreColor, getScoreLabel } from "./startupUtils";

interface Props {
  score: number;
  visible: boolean;
}

// Severity bg glows — mirrors Cleaner's drive-health color logic
function severityBg(score: number): string {
  if (score >= 75) return "rgba(74,222,128,0.08)";
  if (score >= 50) return "rgba(251,191,36,0.08)";
  return "rgba(248,113,113,0.08)";
}

export function StartupScore({ score, visible }: Props) {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);

  // r=40 — larger than original (r=44 but viewBox 100), stroke=11 (Cleaner uses 14)
  const r = 40;
  const circumference = 2 * Math.PI * r;

  // Animate ring fill from 0 → value on mount (Cleaner pattern)
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => setDrawn(true), 80);
      return () => clearTimeout(t);
    }
    setDrawn(false);
  }, [visible]);

  const dashOffset = drawn ? circumference - (score / 100) * circumference : circumference;

  return (
    <div
      className="relative flex flex-col items-center justify-center p-6 rounded-2xl border overflow-hidden group"
      style={{
        background: "#1A1F26",
        borderColor: "rgba(255,255,255,0.04)",
      }}
    >
      {/* Ambient glow behind ring — severity color, same as Cleaner's health glow */}
      <div
        className="absolute inset-0 transition-opacity duration-700 pointer-events-none group-hover:opacity-100 opacity-70"
        style={{ background: `radial-gradient(circle at center, ${severityBg(score)} 0%, transparent 70%)` }}
      />

      {/* Ring gauge — Cleaner stroke width 11 (wider than original 6) */}
      <div className="relative w-36 h-36 flex items-center justify-center">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Outer track */}
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="11" />
          {/* Inner tick ring */}
          <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1.5" strokeDasharray="1.5 5" />
          {/* Value arc — Cleaner-style transition */}
          <circle
            cx="50" cy="50" r={r}
            fill="none"
            stroke={color}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              transition: "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)",
              filter: `drop-shadow(0 0 5px ${color}80)`,
            }}
          />
        </svg>

        {/* Center content */}
        <div className="flex flex-col items-center justify-center relative z-10 text-center">
          <motion.span
            className="text-4xl font-black tracking-tighter leading-none"
            style={{ color: visible ? "#E6EAF0" : "rgba(255,255,255,0.2)" }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: visible ? 1 : 0.8, opacity: visible ? 1 : 0.4 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            {visible ? score : "—"}
          </motion.span>
          <motion.span
            className="text-[9px] uppercase tracking-[0.2em] font-bold mt-1"
            style={{ color: visible ? color : "rgba(255,255,255,0.25)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {visible ? label : "Score"}
          </motion.span>
        </div>
      </div>

      {/* Card label */}
      <div className="mt-3 text-center">
        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-[0.18em] font-bold">
          Boot Score
        </p>
        {visible && (
          <motion.div
            className="mt-1.5 flex items-center justify-center gap-1.5"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: color }}
            />
            <span className="text-[9px] font-semibold" style={{ color }}>
              {score >= 75 ? "Optimized" : score >= 50 ? "Review recommended" : "Needs attention"}
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
