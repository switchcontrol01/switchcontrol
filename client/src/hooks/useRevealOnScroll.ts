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
    // Reset any previously-revealed elements so the new page starts hidden
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      el.classList.remove("is-visible");
    });

    // Small delay: let the incoming page finish mounting/painting before observing
    let io: IntersectionObserver | null = null;
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
      io?.disconnect();
    };
  // locationKey is intentionally the only dependency that drives re-runs on nav
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationKey]);
}
