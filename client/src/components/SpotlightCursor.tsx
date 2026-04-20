import { useEffect, useRef } from 'react';
import { useMotion } from '@/lib/motion';

export function SpotlightCursor() {
  const spotRef = useRef<HTMLDivElement>(null);
  const isMobileRef = useRef(true);
  const { prefersReducedMotion } = useMotion();
  const rafRef = useRef<number | undefined>(undefined);
  const cur = useRef({ x: 0, y: 0 });
  const targ = useRef({ x: 0, y: 0 });
  const visibleRef = useRef(false);

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

    let running = true;
    const smoothness = prefersReducedMotion ? 0.15 : 0.08;

    const handleMouseMove = (e: MouseEvent) => {
      if (isMobileRef.current) return;
      targ.current.x = e.clientX;
      targ.current.y = e.clientY;
      if (!visibleRef.current) {
        visibleRef.current = true;
        el.style.opacity = '1';
      }
    };

    const handleMouseLeave = () => {
      visibleRef.current = false;
      el.style.opacity = '0';
    };

    const tick = () => {
      if (!running) return;
      if (!isMobileRef.current) {
        cur.current.x += (targ.current.x - cur.current.x) * smoothness;
        cur.current.y += (targ.current.y - cur.current.y) * smoothness;
        el.style.transform = `translate3d(calc(${cur.current.x.toFixed(1)}px - 50%), calc(${cur.current.y.toFixed(1)}px - 50%), 0)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
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
