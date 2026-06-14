import { useState, useEffect } from "react";
import { formatTrialCountdown, getTrialTimeRemaining } from "@/lib/trialCountdown";

/**
 * Shared countdown hook for trial expiry display.
 * Used by TrialActivationAnimation (CountdownDisplay) and TrialTour (LiveCountdown)
 * to eliminate duplicated interval/cleanup/visibility logic.
 *
 * - Ticks every second
 * - Pauses when document.hidden (visibility guard)
 * - Stops automatically once the trial has expired
 * - Cleans up the interval on unmount
 */
export function useTrialCountdown(trialEndsAt: string | null): string {
  const [text, setText] = useState(() => formatTrialCountdown(trialEndsAt));

  useEffect(() => {
    setText(formatTrialCountdown(trialEndsAt));
    if (!trialEndsAt) return;
    const initial = getTrialTimeRemaining(trialEndsAt);
    if (initial.expired) return;

    const id = setInterval(() => {
      if (document.hidden) return;
      const r = getTrialTimeRemaining(trialEndsAt);
      setText(formatTrialCountdown(trialEndsAt));
      if (r.expired) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [trialEndsAt]);

  return text;
}
