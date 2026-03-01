import { useEffect } from "react";

export function useMomentumScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768 || "ontouchstart" in window;
    if (isMobile) return;

    let velocity = 0;
    let lastScrollTime = 0;
    let rafId: number | null = null;
    let isCoasting = false;

    const decay = 0.92;
    const minVelocity = 0.5;

    const coast = () => {
      if (Math.abs(velocity) < minVelocity) {
        isCoasting = false;
        return;
      }
      velocity *= decay;
      window.scrollBy(0, velocity);
      rafId = requestAnimationFrame(coast);
    };

    const handleWheel = (e: WheelEvent) => {
      lastScrollTime = performance.now();
      velocity = e.deltaY * 0.15;

      if (isCoasting && rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      isCoasting = false;
    };

    const handleScrollEnd = () => {
      const now = performance.now();
      if (now - lastScrollTime > 50 && !isCoasting && Math.abs(velocity) > minVelocity) {
        isCoasting = true;
        rafId = requestAnimationFrame(coast);
      }
    };

    let checkInterval: ReturnType<typeof setInterval>;

    const startCheck = () => {
      checkInterval = setInterval(() => {
        if (performance.now() - lastScrollTime > 50 && !isCoasting) {
          handleScrollEnd();
        }
      }, 60);
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    startCheck();

    return () => {
      window.removeEventListener("wheel", handleWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearInterval(checkInterval);
    };
  }, []);
}
