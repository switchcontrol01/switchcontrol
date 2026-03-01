import { useEffect } from "react";

export function useMomentumScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768 || "ontouchstart" in window;
    if (isMobile) return;

    let velocity = 0;
    let rafId: number | null = null;
    let isCoasting = false;
    let lastWheelTime = 0;

    const decay = 0.95;
    const minVelocity = 0.3;

    const coast = () => {
      velocity *= decay;
      if (Math.abs(velocity) < minVelocity) {
        isCoasting = false;
        velocity = 0;
        return;
      }
      window.scrollBy(0, velocity);
      rafId = requestAnimationFrame(coast);
    };

    const handleWheel = (e: WheelEvent) => {
      const now = performance.now();
      const dt = now - lastWheelTime;
      lastWheelTime = now;

      if (isCoasting && rafId !== null) {
        cancelAnimationFrame(rafId);
        isCoasting = false;
      }

      if (dt < 200) {
        velocity = velocity * 0.6 + e.deltaY * 0.08;
      } else {
        velocity = e.deltaY * 0.08;
      }
    };

    const handleWheelEnd = () => {
      if (!isCoasting && Math.abs(velocity) > minVelocity) {
        isCoasting = true;
        rafId = requestAnimationFrame(coast);
      }
    };

    let endTimer: ReturnType<typeof setTimeout>;
    const wrappedWheel = (e: WheelEvent) => {
      handleWheel(e);
      clearTimeout(endTimer);
      endTimer = setTimeout(handleWheelEnd, 80);
    };

    window.addEventListener("wheel", wrappedWheel, { passive: true });

    return () => {
      window.removeEventListener("wheel", wrappedWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearTimeout(endTimer);
    };
  }, []);
}
