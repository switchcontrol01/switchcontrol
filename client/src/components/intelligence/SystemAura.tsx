import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LiveTelemetry } from "@/hooks/useLiveTelemetry";

interface SystemAuraProps {
  telemetry: LiveTelemetry | null;
  className?: string;
}

function getAuraConfig(t: LiveTelemetry | null) {
  if (!t) return { color: "hsl(var(--primary))", opacity: 0.04, blur: 80 };
  const load = t.cpu.load;
  const ramPct = t.ram.usedPercent;
  const hot = t.temps.cpu !== null && t.temps.cpu > 80;

  if (hot || load > 85 || ramPct > 88) {
    return { color: "hsl(0, 80%, 55%)", opacity: 0.06, blur: 100 };
  }
  if (load > 65 || ramPct > 70) {
    return { color: "hsl(38, 90%, 55%)", opacity: 0.05, blur: 90 };
  }
  return { color: "hsl(var(--primary))", opacity: 0.04, blur: 80 };
}

export function SystemAura({ telemetry, className }: SystemAuraProps) {
  const cfg = getAuraConfig(telemetry);
  return (
    <motion.div
      className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)}
      aria-hidden
    >
      <motion.div
        className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full"
        initial={{
          backgroundColor: cfg.color,
          opacity: cfg.opacity,
          filter: `blur(${cfg.blur}px)`,
        }}
        animate={{
          backgroundColor: cfg.color,
          opacity: cfg.opacity,
          filter: `blur(${cfg.blur}px)`,
        }}
        transition={{ duration: 2.5, ease: "easeInOut" }}
      />
    </motion.div>
  );
}
