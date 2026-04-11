import { useEffect } from "react";

type Options = {
  selector?: string;
  rootMargin?: string;
  threshold?: number;
  once?: boolean;
  /** Pass the current route so the hook re-fires on every page navigation */
  locationKey?: string;
};

export function useRevealOnScroll({
  selector = "[data-reveal]",
  rootMargin = "0px 0px -8% 0px",
  threshold = 0.08,
  once = true,
  locationKey,
}: Options = {}) {
  useEffect(() => {
    // If reduced motion is preferred, immediately reveal all elements
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Reset previously-revealed elements
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      el.classList.remove("is-visible");
    });

    if (prefersReduced) {
      // Immediately show all — no animation needed
      document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        el.classList.add("is-visible");
      });
      return;
    }

    let io: IntersectionObserver | null = null;

    // Emergency fallback: force all visible after 600ms in case observer fails
    const emergencyTimer = setTimeout(() => {
      document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        el.classList.add("is-visible");
      });
    }, 600);

    // Small delay: let the incoming page finish mounting/painting before observing
    const timerId = setTimeout(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
      if (!els.length) return;

      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              (e.target as HTMLElement).classList.add("is-visible");
              if (once) io!.unobserve(e.target);
            } else if (!once) {
              (e.target as HTMLElement).classList.remove("is-visible");
            }
          }
        },
        { root: null, rootMargin, threshold }
      );

      els.forEach((el) => io!.observe(el));
    }, 80);

    return () => {
      clearTimeout(timerId);
      clearTimeout(emergencyTimer);
      io?.disconnect();
    };
  // locationKey is intentionally the only dependency that drives re-runs on nav
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationKey]);
}
