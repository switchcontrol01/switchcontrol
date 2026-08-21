import { useState } from "react";
import { formatTrialCountdown, getTrialTimeRemaining } from "@/lib/trialCountdown";
import { useVisibilityInterval } from "@/hooks/useVisibilityInterval";

/**
 * Shared countdown hook for trial expiry display.
 * Used by TrialActivationAnimation (CountdownDisplay) and TrialTour (LiveCountdown)
 * to eliminate duplicated interval/cleanup/visibility logic.
 *
 * - Ticks every second in Normal mode, with the shared low-power multiplier
 * - Pauses while document.hidden and refreshes immediately when visible
 * - Stops automatically once the trial has expired
 * - Cleans up the interval on unmount
 */
export function useTrialCountdown(trialEndsAt: string | null): string {
  const [text, setText] = useState(() => formatTrialCountdown(trialEndsAt));
  const countdownActive = !!trialEndsAt && !getTrialTimeRemaining(trialEndsAt).expired;

  useVisibilityInterval(
    () => setText(formatTrialCountdown(trialEndsAt)),
    1_000,
    "TrialCountdown:refresh",
    "useTrialCountdown.ts",
    countdownActive,
  );

  return text;
}
