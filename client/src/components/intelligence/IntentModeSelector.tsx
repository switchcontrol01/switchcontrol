import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Activity, Volume2, Trophy, MousePointer2, Video, Thermometer,
  Monitor, ListMinus,
} from "lucide-react";

export type IntentMode =
  | "competitive-fps"
  | "frametime-stability"
  | "low-input-delay"
  | "streaming-gaming"
  | "quiet-efficient"
  | "thermal-balanced"
  | "high-refresh"
  | "background-reduction";

interface ModeConfig {
  id: IntentMode;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
  glow: string;
  description: string;
  profileLabel: string;
  profileColor: string;
}

export const INTENT_MODES: ModeConfig[] = [
  {
    id: "competitive-fps",
    label: "Competitive FPS",
    sublabel: "Max responsiveness",
    icon: Trophy,
    color: "text-primary",
    glow: "shadow-[0_0_20px_hsl(var(--primary)/0.25)]",
    description:
      "Lifts power limits and prioritizes the game for the highest frame rates in competitive matches.",
    profileLabel: "Max Performance",
    profileColor: "text-primary",
  },
  {
    id: "frametime-stability",
    label: "Frametime Stability",
    sublabel: "Smooth, no stutters",
    icon: Activity,
    color: "text-cyan-400",
    glow: "shadow-[0_0_20px_hsl(190,90%,55%,0.22)]",
    description:
      "Targets consistent frame pacing and stronger 1% lows over peak FPS — the stability-first default for smooth gameplay.",
    profileLabel: "Balanced Gaming",
    profileColor: "text-cyan-400",
  },
  {
    id: "low-input-delay",
    label: "Low Input Delay",
    sublabel: "Fastest reaction",
    icon: MousePointer2,
    color: "text-fuchsia-400",
    glow: "shadow-[0_0_20px_hsl(290,80%,60%,0.22)]",
    description:
      "Minimizes input latency end-to-end — keeps the CPU awake and trims buffering so the game reacts instantly.",
    profileLabel: "Max Performance",
    profileColor: "text-primary",
  },
  {
    id: "streaming-gaming",
    label: "Streaming & Gaming",
    sublabel: "Play + broadcast",
    icon: Video,
    color: "text-rose-400",
    glow: "shadow-[0_0_20px_hsl(350,80%,60%,0.2)]",
    description:
      "Balances game performance with headroom for encoding so your stream stays smooth while you play.",
    profileLabel: "Balanced Gaming",
    profileColor: "text-cyan-400",
  },
  {
    id: "quiet-efficient",
    label: "Quiet & Efficient",
    sublabel: "Low noise & power",
    icon: Volume2,
    color: "text-emerald-400",
    glow: "shadow-[0_0_20px_hsl(150,70%,45%,0.2)]",
    description:
      "Lowers fan noise and power draw. Best for desktop work, browsing, or laptops on battery.",
    profileLabel: "Efficiency / Laptop",
    profileColor: "text-emerald-400",
  },
  {
    id: "thermal-balanced",
    label: "Thermal Balanced",
    sublabel: "Cool & steady",
    icon: Thermometer,
    color: "text-blue-400",
    glow: "shadow-[0_0_20px_hsl(210,80%,55%,0.2)]",
    description:
      "Holds performance while keeping temperatures in check — ideal for long sessions and warm rooms.",
    profileLabel: "Balanced Gaming",
    profileColor: "text-cyan-400",
  },
  {
    id: "high-refresh",
    label: "High Refresh Smoothness",
    sublabel: "Pace to your display",
    icon: Monitor,
    color: "text-violet-400",
    glow: "shadow-[0_0_20px_hsl(260,80%,60%,0.22)]",
    description:
      "Tunes frame pacing to your monitor's refresh rate for fluid motion without chasing wasted frames.",
    profileLabel: "Max Performance",
    profileColor: "text-primary",
  },
  {
    id: "background-reduction",
    label: "Background Reduction",
    sublabel: "Free up resources",
    icon: ListMinus,
    color: "text-amber-400",
    glow: "shadow-[0_0_20px_hsl(38,90%,55%,0.22)]",
    description:
      "Eases background process and service activity so more CPU, RAM and disk go to your game.",
    profileLabel: "Balanced Gaming",
    profileColor: "text-cyan-400",
  },
];

interface IntentModeSelectorProps {
  value: IntentMode;
  onChange: (mode: IntentMode) => void;
  className?: string;
}

export function IntentModeSelector({
  value,
  onChange,
  className,
}: IntentModeSelectorProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
      {INTENT_MODES.map((mode) => {
        const Icon = mode.icon;
        const active = value === mode.id;
        return (
          <motion.button
            key={mode.id}
            onClick={() => onChange(mode.id)}
            data-testid={`intent-mode-${mode.id}`}
            whileTap={{ scale: 0.97 }}
            className={cn(
              "relative flex flex-col items-start gap-1.5 rounded-xl border px-3 py-3 text-left transition-colors duration-200",
              active
                ? cn(
                    "border-[#2A313A] bg-white/8",
                    mode.glow
                  )
                : "border-[#2A313A] bg-[#1A1F26] hover:bg-[#21262D] hover:border-[#2A313A]2"
            )}
          >
            {active && (
              <motion.div
                layoutId="intent-mode-active"
                className="absolute inset-0 rounded-xl ring-1 ring-white/15"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <div className="flex w-full items-start justify-between gap-1">
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors duration-200",
                  active ? mode.color : "text-muted-foreground"
                )}
              />
              <span
                className={cn(
                  "text-[9px] font-medium leading-none px-1.5 py-0.5 rounded-md border transition-colors duration-200",
                  active
                    ? cn("border-white/10 bg-white/6", mode.profileColor)
                    : "border-white/5 bg-white/3 text-muted-foreground/50"
                )}
              >
                {mode.profileLabel}
              </span>
            </div>
            <div>
              <p
                className={cn(
                  "text-xs font-semibold leading-none transition-colors duration-200",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {mode.label}
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">
                {mode.sublabel}
              </p>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

export function IntentModeDescription({
  mode,
  className,
}: {
  mode: IntentMode;
  className?: string;
}) {
  const cfg = INTENT_MODES.find((m) => m.id === mode)!;
  return (
    <motion.div
      key={mode}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex items-start gap-2", className)}
    >
      <p className="text-xs text-muted-foreground leading-relaxed flex-1">
        {cfg.description}
      </p>
      <span className={cn("text-[10px] font-medium shrink-0 mt-0.5 opacity-70", cfg.profileColor)}>
        → {cfg.profileLabel}
      </span>
    </motion.div>
  );
}
