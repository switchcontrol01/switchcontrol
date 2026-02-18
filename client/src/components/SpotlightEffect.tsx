import { useEffect, useRef } from "react";

export function SpotlightEffect() {
  const spotlightRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dirtyRef = useRef(false);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = spotlightRef.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      dirtyRef.current = true;
    };

    const tick = () => {
      if (dirtyRef.current && el) {
        el.style.background = `radial-gradient(700px circle at ${mouseRef.current.x}px ${mouseRef.current.y}px, rgba(139,92,246,0.06), transparent 70%)`;
        dirtyRef.current = false;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={spotlightRef}
      className="fixed inset-0 z-[1] pointer-events-none"
      style={{ willChange: "background" }}
      data-testid="spotlight-effect"
    />
  );
}
