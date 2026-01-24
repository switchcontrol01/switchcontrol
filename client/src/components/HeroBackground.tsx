import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { motion, useMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

function Particles({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  const count = prefersReducedMotion ? 6 : 12;
  const particles = useMemo(() => 
    [...Array(count)].map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: prefersReducedMotion ? 10 + Math.random() * 4 : 6 + Math.random() * 4,
      delay: Math.random() * 4,
    })), 
  [count, prefersReducedMotion]);

  return (
    <div className="absolute inset-0 will-change-transform">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute w-1 h-1 rounded-full bg-white/20 animate-particle"
          style={{ 
            left: `${p.left}%`, 
            top: `${p.top}%`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`
          }}
        />
      ))}
    </div>
  );
}

export function HeroBackground() {
  const { prefersReducedMotion } = useMotion();
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // Throttled mouse tracking for performance
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

  const parallaxAmount = prefersReducedMotion ? 8 : 15;

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Main gradient - GPU accelerated with will-change */}
      <div 
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/25 via-purple-600/10 to-transparent will-change-transform"
        style={{
          transform: `translate3d(${(mousePosition.x - 0.5) * parallaxAmount}px, ${(mousePosition.y - 0.5) * parallaxAmount}px, 0)`
        }}
      />

      {/* Simplified blobs with smaller blur for better performance */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-primary/15 blur-[80px] animate-blob-1 will-change-transform" />
      <div className="absolute top-1/3 right-1/4 w-[350px] h-[350px] rounded-full bg-pink-500/10 blur-[70px] animate-blob-2 will-change-transform" />

      {/* CSS-animated contour lines instead of Framer Motion */}
      <svg className="absolute inset-0 w-full h-full will-change-transform" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="wave-gradient-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0.3)" />
            <stop offset="50%" stopColor="rgba(236, 72, 153, 0.2)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0.3)" />
          </linearGradient>
          <linearGradient id="wave-gradient-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0.15)" />
            <stop offset="50%" stopColor="rgba(168, 85, 247, 0.1)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0.15)" />
          </linearGradient>
        </defs>
        
        {/* Use CSS animations for contour lines */}
        <path
          className="animate-wave-1"
          d="M-100,150 Q200,100 500,150 T1100,150 T1700,150 T2300,150"
          fill="none"
          stroke="url(#wave-gradient-1)"
          strokeWidth="1.3"
          opacity="0.25"
        />
        <path
          className="animate-wave-2"
          d="M-100,210 Q200,160 500,210 T1100,210 T1700,210 T2300,210"
          fill="none"
          stroke="url(#wave-gradient-2)"
          strokeWidth="1.1"
          opacity="0.2"
        />
        <path
          className="animate-wave-3"
          d="M-100,270 Q200,230 500,270 T1100,270 T1700,270 T2300,270"
          fill="none"
          stroke="url(#wave-gradient-1)"
          strokeWidth="0.9"
          opacity="0.15"
        />
      </svg>

      <Particles prefersReducedMotion={prefersReducedMotion} />

      <div className="absolute inset-0 bg-noise opacity-[0.02]" />

      {/* Simplified center glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]">
        <div className="absolute inset-0 rounded-full bg-primary/5 blur-[60px] animate-pulse-slow will-change-transform" />
      </div>
    </div>
  );
}
