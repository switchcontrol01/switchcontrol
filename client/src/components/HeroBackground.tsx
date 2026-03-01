import { useEffect, useRef, useState, useCallback } from 'react';
import { useMotion } from '@/lib/motion';

export function HeroBackground() {
  const { prefersReducedMotion } = useMotion();
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
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

  const parallaxAmount = prefersReducedMotion ? 5 : 12;

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% 20%, hsl(270 55% 45% / 0.2) 0%, transparent 60%)`,
          transform: `translate3d(${(mousePosition.x - 0.5) * parallaxAmount}px, ${(mousePosition.y - 0.5) * parallaxAmount}px, 0)`
        }}
      />

      <div
        className="absolute top-[15%] left-[20%] w-[450px] h-[450px] rounded-full blur-[100px] will-change-transform"
        style={{
          background: 'hsl(270 55% 50% / 0.12)',
          animation: prefersReducedMotion ? 'none' : 'blobFloat1 25s ease-in-out infinite',
        }}
      />
      <div
        className="absolute top-[25%] right-[15%] w-[350px] h-[350px] rounded-full blur-[80px] will-change-transform"
        style={{
          background: 'hsl(280 50% 45% / 0.08)',
          animation: prefersReducedMotion ? 'none' : 'blobFloat2 30s ease-in-out infinite',
        }}
      />

      <div className="absolute inset-0 bg-noise opacity-[0.015]" />
    </div>
  );
}

export function ScrollIndicator() {
  const { prefersReducedMotion } = useMotion();

  return (
    <button
      className="flex flex-col items-center gap-1.5 cursor-pointer bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 rounded-full p-2 group"
      onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
      aria-label="Scroll down"
      data-testid="button-scroll-indicator"
    >
      <div className="w-[18px] h-7 rounded-full border border-white/10 group-hover:border-white/20 transition-colors flex justify-center pt-1.5">
        <div
          className="w-0.5 h-1.5 rounded-full bg-white/25"
          style={{
            animation: prefersReducedMotion ? 'none' : 'scrollDot 1.8s ease-in-out infinite',
          }}
        />
      </div>
    </button>
  );
}
