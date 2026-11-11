import type { ReactNode } from "react";

interface DelayedTooltipProps {
  children: ReactNode;
  content?: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  isAi?: boolean;
  className?: string;
}

/**
 * No-op passthrough — the hover tooltip has been removed app-wide.
 * Kept as a component (rather than deleting the file) so every existing
 * import site (TweakPresetCard, TweakSliderCard, TweakCard, etc.)
 * keeps compiling with zero changes. It just renders its children directly.
 */
export function DelayedTooltip({ children }: DelayedTooltipProps) {
  return <>{children}</>;
}
