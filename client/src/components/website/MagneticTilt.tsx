import { useRef, useEffect, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

interface MagneticTiltProps {
  children: ReactNode;
  maxTilt?: number;
  className?: string;
}

export default function MagneticTilt({
  children,
  maxTilt = 3,
  className = "",
}: MagneticTiltProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) return;
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let rafId: number | null = null;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const tick = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      el.style.transform = `perspective(1200px) rotateX(${currentX.toFixed(2)}deg) rotateY(${currentY.toFixed(2)}deg)`;

      // Stop scheduling once all values have converged to near-zero.
      // The loop self-restarts on the next mousemove.
      const settled =
        Math.abs(currentX) < 0.01 &&
        Math.abs(currentY) < 0.01 &&
        Math.abs(targetX) < 0.01 &&
        Math.abs(targetY) < 0.01;
      if (!settled) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      targetX = dy * maxTilt;
      targetY = -dx * maxTilt;
      // Restart the loop only if it has already settled (rafId === null).
      if (!rafId) rafId = requestAnimationFrame(tick);
    };

    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      // Let the tick loop drain the spring to zero naturally; settle check stops it.
      if (!rafId) rafId = requestAnimationFrame(tick);
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    // Do NOT start the loop at mount, let mousemove trigger it.

    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isMobile, maxTilt]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transformStyle: "preserve-3d",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}
