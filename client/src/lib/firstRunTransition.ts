/**
 * Shared visual contract for the authenticated first-run handoff.
 *
 * The dashboard cannot be filtered directly because its fixed descendants
 * (sidebar and modals) would become fixed to the filtered wrapper. In that
 * case, use the sibling dashboard scrim exported below instead.
 */
import { useUserPreferencesStore } from "@/stores/userPreferencesStore";

export const FIRST_RUN_TRANSITION_MS = 2000;
export const FIRST_RUN_TRANSITION_SECONDS = FIRST_RUN_TRANSITION_MS / 1000;
export const FIRST_RUN_BLUR_PX = 18;
export const FIRST_RUN_HANDOFF_BLUR_PX = 12;
export const FIRST_RUN_HANDOFF_OPACITY = [0, 0.38, 0.72, 0.38, 0] as const;
export const FIRST_RUN_HANDOFF_TIMES = [0, 0.26, 0.5, 0.74, 1] as const;
export const FIRST_RUN_INTERACTION_MS = 200;
export const FIRST_RUN_INTERACTION_SECONDS = FIRST_RUN_INTERACTION_MS / 1000;
export const FIRST_RUN_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * First-run motion is controlled by SwitchControl's own preference rather
 * than the host OS media query. The app is a Windows tweaking utility and
 * should not require users to enable Windows-wide animation effects just to
 * see its own onboarding handoffs.
 */
export function useFirstRunReducedMotion(): boolean {
  return useUserPreferencesStore((state) => state.reducedMotion);
}

export function firstRunTransition(prefersReducedMotion = false) {
  return {
    duration: prefersReducedMotion ? 0 : FIRST_RUN_TRANSITION_SECONDS,
    ease: FIRST_RUN_EASE,
  } as const;
}

export function firstRunInteractionTransition(prefersReducedMotion = false) {
  return {
    duration: prefersReducedMotion ? 0 : FIRST_RUN_INTERACTION_SECONDS,
    ease: FIRST_RUN_EASE,
  } as const;
}

export function firstRunVisualInitial() {
  return {
    opacity: 0,
    filter: `blur(${FIRST_RUN_BLUR_PX}px)`,
  } as const;
}

export function firstRunVisualVisible() {
  return {
    opacity: 1,
    filter: "blur(0px)",
  } as const;
}

export function firstRunVisualExit() {
  return {
    opacity: 0,
    filter: `blur(${FIRST_RUN_BLUR_PX}px)`,
  } as const;
}