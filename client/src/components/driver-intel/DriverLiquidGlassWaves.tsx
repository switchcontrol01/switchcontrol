interface DriverLiquidGlassWavesProps {
  /** Identifies the glass surface for browser motion checks. */
  surface: "health" | "board" | "inspector" | "component" | "news" | "advisor";
}

/**
 * Low-cost moving color inside each glass panel, below its content and glass
 * highlight. CSS transforms move pre-painted gradients; there is no JS loop,
 * synthesized data, or change to device-evidence/status colors.
 */
export function DriverLiquidGlassWaves({ surface }: DriverLiquidGlassWavesProps) {
  return (
    <span className="di-glass-tide" data-testid={`driver-glass-${surface}`} aria-hidden="true">
      <span className="di-glass-tide__sheet di-glass-tide__sheet--deep" />
      <span className="di-glass-tide__sheet di-glass-tide__sheet--light" />
    </span>
  );
}
