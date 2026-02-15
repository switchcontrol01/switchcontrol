import { useEffect } from "react";

type Options = {
  selector?: string;
  rootMargin?: string;
  threshold?: number;
  once?: boolean;
};

export function useRevealOnScroll({
  selector = "[data-reveal]",
  rootMargin = "0px 0px -10% 0px",
  threshold = 0.15,
  once = true,
}: Options = {}) {
  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (!els.length) return;

    if (reduceMotion) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }

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
      { root: null, rootMargin, threshold }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [selector, rootMargin, threshold, once]);
}
