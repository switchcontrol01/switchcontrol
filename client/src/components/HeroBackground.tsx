import { useEffect, useRef, useState, useCallback } from 'react';
import { useMotion } from '@/lib/motion';

export function HeroBackground() {
  const { prefersReducedMotion } = useMotion();
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  /* GPU: throttle to every other frame */
  const skipFrame = useRef(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      skipFrame.current = !skipFrame.current;
      if (!skipFrame.current) {
        rafRef.current = null;
        return;
      }
      if (!containerRef.current) {
        rafRef.current = null;
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setMousePosition({ x, y });
      rafRef.current = null;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseMove]);

  const parallaxAmount = prefersReducedMotion ? 3 : 6;

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Main hero glow — no blur, just gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% 20%, hsl(270 55% 45% / 0.2) 0%, transparent 60%)`,
          transform: `translate3d(${(mousePosition.x - 0.5) * parallaxAmount}px, ${(mousePosition.y - 0.5) * parallaxAmount}px, 0)`,
          willChange: 'transform',
        }}
      />

      {/* GPU: blur reduced 100px -> 30px, lower opacity */}
      <div
        className="absolute top-[15%] left-[20%] w-[450px] h-[450px] rounded-full blur-[30px]"
        style={{
          background: 'hsl(270 55% 50% / 0.10)',
          animation: prefersReducedMotion ? 'none' : 'blobFloat1 25s ease-in-out infinite',
          willChange: 'transform',
        }}
      />
      <div
        className="absolute top-[25%] right-[15%] w-[350px] h-[350px] rounded-full blur-[24px]"
        style={{
          background: 'hsl(280 50% 45% / 0.06)',
          animation: prefersReducedMotion ? 'none' : 'blobFloat2 30s ease-in-out infinite',
          willChange: 'transform',
        }}
      />

      {/* Static noise — very low opacity */}
      <div className="absolute inset-0 bg-noise opacity-[0.010]" />
    </div>
  );
}
