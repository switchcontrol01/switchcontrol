import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Zap, Gauge, Volume2, Trophy } from "lucide-react";

export type IntentMode = "competitive" | "balanced" | "silent" | "max-fps";

interface ModeConfig {
  id: IntentMode;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
  glow: string;
  description: string;
}

export const INTENT_MODES: ModeConfig[] = [
  {
    id: "competitive",
    label: "Competitive",
    sublabel: "Low latency priority",
    icon: Zap,
    color: "text-primary",
    glow: "shadow-[0_0_20px_hsl(var(--primary)/0.25)]",
    description:
      "Minimizes input latency, disables power saving, prioritizes game processes.",
  },
  {
    id: "balanced",
    label: "Balanced",
    sublabel: "Efficient & responsive",
    icon: Gauge,
    color: "text-blue-400",
    glow: "shadow-[0_0_20px_hsl(210,80%,55%,0.2)]",
    description:
      "Maintains smooth frames while keeping system thermals in check.",
  },
  {
    id: "silent",
    label: "Silent",
    sublabel: "Quiet & cool",
    icon: Volume2,
    color: "text-emerald-400",
    glow: "shadow-[0_0_20px_hsl(150,70%,45%,0.2)]",
    description: "Fan noise and power draw minimized. For desktop or browsing.",
  },
  {
    id: "max-fps",
    label: "Max FPS",
    sublabel: "Uncapped performance",
    icon: Trophy,
    color: "text-amber-400",
    glow: "shadow-[0_0_20px_hsl(38,90%,55%,0.25)]",
    description:
      "Strips all limits. Best for benchmarking and competitive scenes.",
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
                    "border-white/20 bg-white/8",
                    mode.glow
                  )
                : "border-white/8 bg-white/3 hover:bg-white/5 hover:border-white/12"
            )}
          >
            {active && (
              <motion.div
                layoutId="intent-mode-active"
                className="absolute inset-0 rounded-xl ring-1 ring-white/15"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Icon
              className={cn(
                "size-4 transition-colors duration-200",
                active ? mode.color : "text-muted-foreground"
              )}
            />
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
    <motion.p
      key={mode}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("text-xs text-muted-foreground leading-relaxed", className)}
    >
      {cfg.description}
    </motion.p>
  );
}
