import { useEffect } from "react";

type Options = {
  selector?: string;
  rootMargin?: string;
  threshold?: number;
  once?: boolean;
};

export function useRevealOnScroll({
  selector = "[data-reveal]",
  rootMargin = "50px 0px 0px 0px",
  threshold = 0.05,
  once = true,
}: Options = {}) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (!els.length) return;

    // CRITICAL FIX: Check if elements are already in viewport on mount
    // This fixes desktop where content is visible immediately on load
    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
      if (inViewport) {
        el.classList.add("is-visible");
      }
    });

    // Then set up observer for elements not yet visible
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            if (once) io.unobserve(e.target);
          } else if (!once) {
            e.target.classList.remove("is-visible");
          }
        }
      },
      { rootMargin, threshold }
    );

    els.forEach((el) => {
      if (!el.classList.contains("is-visible")) {
        io.observe(el);
      }
    });
    return () => io.disconnect();
  }, [selector, rootMargin, threshold, once]);
}
