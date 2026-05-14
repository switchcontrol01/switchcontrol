import { useEffect, useRef, useCallback } from 'react';
import { useMotion } from '@/lib/motion';

export function SpotlightCursor() {
  const spotRef = useRef<HTMLDivElement>(null);
  const isMobileRef = useRef(true);
  const { prefersReducedMotion } = useMotion();
  const rafRef = useRef<number | undefined>(undefined);
  const cur = useRef({ x: 0, y: 0 });
  const targ = useRef({ x: 0, y: 0 });
  const visibleRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);

  useEffect(() => {
    const checkMobile = () => {
      isMobileRef.current = window.innerWidth < 768 || 'ontouchstart' in window;
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const el = spotRef.current;
    if (!el) return;

    const smoothness = prefersReducedMotion ? 0.15 : 0.08;

    const handleMouseMove = (e: MouseEvent) => {
      if (isMobileRef.current) return;
      targ.current.x = e.clientX;
      targ.current.y = e.clientY;
      if (!visibleRef.current) {
        visibleRef.current = true;
        el.style.opacity = '1';
      }

      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (!running.current) {
        running.current = true;
        rafRef.current = requestAnimationFrame(tick);
      }
      idleTimer.current = setTimeout(() => {
        running.current = false;
        visibleRef.current = false;
        el.style.opacity = '0';
      }, 2000);
    };

    const tick = () => {
      if (!running.current) {
        rafRef.current = undefined;
        return;
      }
      if (!isMobileRef.current) {
        cur.current.x += (targ.current.x - cur.current.x) * smoothness;
        cur.current.y += (targ.current.y - cur.current.y) * smoothness;
        el.style.transform = `translate3d(calc(${cur.current.x.toFixed(1)}px - 50%), calc(${cur.current.y.toFixed(1)}px - 50%), 0)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', handleMouseMove);
    rafRef.current = requestAnimationFrame(tick);
    running.current = true;

    return () => {
      running.current = false;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [prefersReducedMotion]);

  return (
    <div
      ref={spotRef}
      className="fixed top-0 left-0 pointer-events-none"
      style={{
        width: 600,
        height: 600,
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, rgba(139, 92, 246, 0.02) 30%, transparent 70%)',
        opacity: 0,
        zIndex: 1,
        transition: 'opacity 0.5s',
        willChange: 'transform',
      }}
      aria-hidden="true"
    />
  );
}
