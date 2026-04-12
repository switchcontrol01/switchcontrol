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
  rootMargin = "0px 0px -6% 0px",
  threshold = 0.06,
  once = true,
  locationKey,
}: Options = {}) {
  useEffect(() => {
    // Reset previously-revealed elements so new page starts hidden
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      el.classList.remove("is-visible");
    });

    let io: IntersectionObserver | null = null;
    let mo: MutationObserver | null = null;

    // Smart emergency fallback: after 900ms reveal only elements
    // already in the viewport (not elements further down the page)
    const emergencyTimer = setTimeout(() => {
      document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight * 1.1 && rect.bottom > 0) {
          el.classList.add("is-visible");
        }
      });
    }, 900);

    // Small delay: let the incoming page finish mounting before observing
    const timerId = setTimeout(() => {
      const observeEl = (el: HTMLElement) => {
        if (el.classList.contains("is-visible")) return;
        io!.observe(el);
      };

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

      // Observe all currently-mounted elements
      const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
      els.forEach(observeEl);

      // MutationObserver: pick up data-reveal elements added after initial mount
      // (e.g. elements inside conditionally rendered sections)
      mo = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;
            // Check if the added node itself matches
            if (node.matches(selector)) observeEl(node);
            // Check descendants
            node.querySelectorAll<HTMLElement>(selector).forEach(observeEl);
          }
        }
      });

      mo.observe(document.body, { childList: true, subtree: true });
    }, 80);

    return () => {
      clearTimeout(timerId);
      clearTimeout(emergencyTimer);
      io?.disconnect();
      mo?.disconnect();
    };
  // locationKey drives re-runs on navigation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationKey]);
}
