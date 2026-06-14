import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LiveTelemetry } from "@/hooks/useLiveTelemetry";

interface SystemAuraProps {
  telemetry: LiveTelemetry | null;
  className?: string;
}

// Returns 0 = normal, 1 = medium-load, 2 = high-load
function getAuraState(t: LiveTelemetry | null): 0 | 1 | 2 {
  if (!t) return 0;
  const load = t.cpu.load;
  const ramPct = t.ram.usedPercent;
  const hot = t.temps.cpu !== null && t.temps.cpu > 80;
  if (hot || load > 85 || ramPct > 88) return 2;
  if (load > 65 || ramPct > 70) return 1;
  return 0;
}

// Three fixed colour layers, always present in the DOM.
// Only `opacity` is animated — backgroundColor and filter are static styles,
// so the compositor rasterises each layer exactly once and never repaints it.
// Previously, animating backgroundColor + filter: blur() caused a full
// rasterisation pass on every frame transition.
const LAYERS = [
  { color: "hsl(var(--primary))",   blur: 80,  opacityOn: 0.04 }, // 0 = normal
  { color: "hsl(38, 90%, 55%)",     blur: 90,  opacityOn: 0.05 }, // 1 = medium
  { color: "hsl(0, 80%, 55%)",      blur: 100, opacityOn: 0.06 }, // 2 = high
] as const;

const TRANSITION = { duration: 2.5, ease: "easeInOut" };

export function SystemAura({ telemetry, className }: SystemAuraProps) {
  const state = getAuraState(telemetry);
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)}
      aria-hidden
    >
      {LAYERS.map((layer, i) => (
        <motion.div
          key={i}
          className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full"
          style={{
            backgroundColor: layer.color,
            filter: `blur(${layer.blur}px)`,
          }}
          animate={{ opacity: state === i ? layer.opacityOn : 0 }}
          transition={TRANSITION}
        />
      ))}
    </div>
  );
}
