import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, useMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

function Particles({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  const particles = useMemo(() => 
    [...Array(20)].map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: 4 + Math.random() * 4,
      delay: Math.random() * 4,
    })), 
  []);

  if (prefersReducedMotion) return null;

  return (
    <div className="absolute inset-0">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-1 h-1 rounded-full bg-white/20"
          style={{ left: `${p.left}%`, top: `${p.top}%` }}
          animate={{ y: [0, -30, 0], opacity: [0.1, 0.4, 0.1] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export function HeroBackground() {
  const { prefersReducedMotion } = useMotion();
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [prefersReducedMotion]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      <div 
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/30 via-purple-600/10 to-transparent"
        style={!prefersReducedMotion ? {
          transform: `translate(${(mousePosition.x - 0.5) * 20}px, ${(mousePosition.y - 0.5) * 20}px)`
        } : undefined}
      />

      <div className={cn(
        "absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full",
        "bg-gradient-to-r from-primary/20 to-purple-600/20 blur-[120px]",
        !prefersReducedMotion && "animate-blob-1"
      )} />
      <div className={cn(
        "absolute top-1/3 right-1/4 w-[500px] h-[500px] rounded-full",
        "bg-gradient-to-r from-pink-500/15 to-purple-500/15 blur-[100px]",
        !prefersReducedMotion && "animate-blob-2"
      )} />
      <div className={cn(
        "absolute bottom-1/4 left-1/3 w-[400px] h-[400px] rounded-full",
        "bg-gradient-to-r from-blue-500/10 to-primary/10 blur-[80px]",
        !prefersReducedMotion && "animate-blob-3"
      )} />

      <motion.div
        className="absolute inset-0"
        animate={!prefersReducedMotion ? {
          background: [
            'radial-gradient(circle at 30% 40%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)',
            'radial-gradient(circle at 70% 60%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)',
            'radial-gradient(circle at 30% 40%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)',
          ]
        } : undefined}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="wave-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0.3)" />
            <stop offset="50%" stopColor="rgba(236, 72, 153, 0.2)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0.3)" />
          </linearGradient>
        </defs>
        <motion.path
          d="M0,100 Q250,50 500,100 T1000,100 T1500,100 T2000,100"
          fill="none"
          stroke="url(#wave-gradient)"
          strokeWidth="2"
          initial={!prefersReducedMotion ? { pathOffset: 0 } : undefined}
          animate={!prefersReducedMotion ? { pathOffset: 1 } : undefined}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          style={{ transform: 'translateY(200px)' }}
        />
      </svg>

      <Particles prefersReducedMotion={prefersReducedMotion} />

      <div className="absolute inset-0 bg-noise opacity-[0.03]" />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px]">
        <motion.div
          className="absolute inset-0 rounded-full bg-primary/5 blur-3xl"
          animate={!prefersReducedMotion ? {
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3],
          } : undefined}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
