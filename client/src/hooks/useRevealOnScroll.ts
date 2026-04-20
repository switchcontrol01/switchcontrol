/**
 * useRevealOnScroll
 *
 * Guards reveal/visibility resets against tour navigation.
 * When the intro tour is driving route changes, this hook ensures no
 * reveal-observer teardown or ".is-visible" class removal runs — those
 * operations would blank sections that are already visible.
 *
 * The actual reveal system uses the Reveal/RevealGroup/RevealItem components
 * from lib/motion.tsx (Framer Motion useInView).  This hook is the insertion
 * point for any imperative CSS-class-based reveal logic that may be added later.
 */
import { useTourStore } from "@/lib/tour-store";

export function useRevealOnScroll(_options?: unknown) {
  // During intro tour navigation (or while any tour is active), do NOT reset
  // or reinitialize reveal state.  The stable page key in AppLayout prevents
  // destructive remounts, and this guard prevents any future imperative reveal
  // logic from un-hiding sections while the tour overlay is showing.
  const { isTourNavigating, isTourActive } = useTourStore();

  if (isTourNavigating || isTourActive) {
    // Reveal resets are suppressed — return early without running any
    // IntersectionObserver setup or class manipulation.
    return;
  }

  // No imperative reveal logic currently active.
  // Framer-based reveal (Reveal / RevealGroup / RevealItem) is handled
  // component-locally via useInView and requires no global coordination.
}
