import { useEffect } from "react";

export function useMomentumScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768 || "ontouchstart" in window;
    if (isMobile) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const isTrackpad = navigator.platform?.includes("Mac") || /Mac/.test(navigator.userAgent);
    if (isTrackpad) return;

    let velocity = 0;
    let rafId: number | null = null;
    let isCoasting = false;
    let lastWheelTime = 0;
    let consecutiveWheels = 0;

    const decay = 0.92;
    const minVelocity = 0.4;
    const maxVelocity = 10;
    const velocityScale = 0.04;

    const coast = () => {
      velocity *= decay;
      if (Math.abs(velocity) < minVelocity) {
        isCoasting = false;
        velocity = 0;
        rafId = null;
        return;
      }
      window.scrollBy(0, velocity);
      rafId = requestAnimationFrame(coast);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;

      if (e.deltaMode !== 0) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-scroll-container], .overflow-auto, .overflow-y-auto, .overflow-y-scroll")) return;

      const now = performance.now();
      const dt = now - lastWheelTime;
      lastWheelTime = now;

      if (isCoasting && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
        isCoasting = false;
      }

      if (dt < 120) {
        consecutiveWheels++;
        velocity = velocity * 0.5 + e.deltaY * velocityScale;
      } else {
        consecutiveWheels = 1;
        velocity = e.deltaY * velocityScale;
      }

      velocity = Math.max(-maxVelocity, Math.min(maxVelocity, velocity));
    };

    let endTimer: ReturnType<typeof setTimeout>;
    const wrappedWheel = (e: WheelEvent) => {
      handleWheel(e);
      clearTimeout(endTimer);
      endTimer = setTimeout(() => {
        if (!isCoasting && Math.abs(velocity) > minVelocity && consecutiveWheels >= 3) {
          isCoasting = true;
          rafId = requestAnimationFrame(coast);
        }
      }, 100);
    };

    window.addEventListener("wheel", wrappedWheel, { passive: true });

    return () => {
      window.removeEventListener("wheel", wrappedWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearTimeout(endTimer);
    };
  }, []);
}
