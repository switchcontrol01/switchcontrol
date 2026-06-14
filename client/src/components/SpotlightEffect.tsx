import { useEffect, useRef } from "react";

/**
 * SpotlightEffect — compositor-thread-only mouse-follow spotlight.
 *
 * Rendering strategy:
 *   • The gradient is a FIXED radial on an inner element (no repaint on move).
 *   • Movement is driven by `transform: translate()` only — compositor thread,
 *     zero per-frame paints, zero GPU background recomputations.
 *   • RAF only runs while the mouse is moving; stops 2 s after last move.
 */
export function SpotlightEffect() {
  const innerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dirtyRef = useRef(false);
  const mouseRef = useRef({ x: 0, y: 0 });
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    // Half the spotlight diameter — used to center the gradient on the cursor.
    const RADIUS = 350;

    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      dirtyRef.current = true;

      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (!running.current) {
        running.current = true;
        rafRef.current = requestAnimationFrame(tick);
      }
      idleTimer.current = setTimeout(() => {
        running.current = false;
      }, 2000);
    };

    const tick = () => {
      if (!running.current) {
        rafRef.current = 0;
        return;
      }
      if (dirtyRef.current && inner) {
        // Translate so the centre of the gradient tracks the cursor.
        // The inner div is top-left anchored at (-RADIUS, -RADIUS) via CSS,
        // so translate(x, y) places its centre at (x, y) relative to the viewport.
        inner.style.transform = `translate(${mouseRef.current.x}px, ${mouseRef.current.y}px)`;
        dirtyRef.current = false;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMove);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      running.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[1] pointer-events-none overflow-hidden"
      data-testid="spotlight-effect"
    >
      {/*
        Inner: fixed-size element with a centred radial gradient.
        Its top-left corner sits at (-350px, -350px) relative to its translate origin,
        so the gradient centre lands exactly on the cursor position.
        Only `transform` changes on each frame — no paint, no layout.
      */}
      <div
        ref={innerRef}
        style={{
          position: "absolute",
          top: -350,
          left: -350,
          width: 700,
          height: 700,
          background:
            "radial-gradient(350px circle at center, rgba(139,92,246,0.06), transparent 70%)",
          willChange: "transform",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
