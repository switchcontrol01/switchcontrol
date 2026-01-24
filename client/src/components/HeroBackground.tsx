import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, useMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

function Particles({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  const particles = useMemo(() => 
    [...Array(prefersReducedMotion ? 8 : 20)].map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: prefersReducedMotion ? 8 + Math.random() * 4 : 4 + Math.random() * 4,
      delay: Math.random() * 4,
    })), 
  [prefersReducedMotion]);

  return (
    <div className="absolute inset-0">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-1 h-1 rounded-full bg-white/20"
          style={{ left: `${p.left}%`, top: `${p.top}%` }}
          animate={{ 
            y: prefersReducedMotion ? [0, -15, 0] : [0, -30, 0], 
            opacity: prefersReducedMotion ? [0.1, 0.25, 0.1] : [0.1, 0.4, 0.1] 
          }}
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
    // Always track mouse, but apply reduced parallax via style prop
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      <div 
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/30 via-purple-600/10 to-transparent transition-transform duration-300"
        style={{
          transform: `translate(${(mousePosition.x - 0.5) * (prefersReducedMotion ? 8 : 20)}px, ${(mousePosition.y - 0.5) * (prefersReducedMotion ? 8 : 20)}px)`
        }}
      />

      <div className={cn(
        "absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full",
        "bg-gradient-to-r from-primary/20 to-purple-600/20 blur-[120px]",
        "animate-blob-1"
      )} />
      <div className={cn(
        "absolute top-1/3 right-1/4 w-[500px] h-[500px] rounded-full",
        "bg-gradient-to-r from-pink-500/15 to-purple-500/15 blur-[100px]",
        "animate-blob-2"
      )} />
      <div className={cn(
        "absolute bottom-1/4 left-1/3 w-[400px] h-[400px] rounded-full",
        "bg-gradient-to-r from-blue-500/10 to-primary/10 blur-[80px]",
        "animate-blob-3"
      )} />

      <motion.div
        className="absolute inset-0"
        animate={{
          background: [
            'radial-gradient(circle at 30% 40%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)',
            'radial-gradient(circle at 70% 60%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)',
            'radial-gradient(circle at 30% 40%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)',
          ]
        }}
        transition={{ duration: prefersReducedMotion ? 16 : 8, repeat: Infinity, ease: "easeInOut" }}
      />

      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="wave-gradient-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0.4)" />
            <stop offset="50%" stopColor="rgba(236, 72, 153, 0.3)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0.4)" />
          </linearGradient>
          <linearGradient id="wave-gradient-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0.2)" />
            <stop offset="50%" stopColor="rgba(168, 85, 247, 0.15)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0.2)" />
          </linearGradient>
        </defs>
        
        {[...Array(5)].map((_, i) => {
          // Reduce animation intensity for reduced motion
          const xRange = prefersReducedMotion ? 20 : 50;
          const yRange = prefersReducedMotion ? 4 : 10 + i * 3;
          const duration = prefersReducedMotion ? 20 + i * 3 : 12 + i * 2;
          
          return (
            <motion.path
              key={i}
              d={`M-100,${150 + i * 60} Q200,${100 + i * 40} 500,${150 + i * 60} T1100,${150 + i * 60} T1700,${150 + i * 60} T2300,${150 + i * 60}`}
              fill="none"
              stroke={i % 2 === 0 ? "url(#wave-gradient-1)" : "url(#wave-gradient-2)"}
              strokeWidth={1.5 - i * 0.2}
              opacity={0.3 - i * 0.04}
              initial={{ x: 0, y: 0 }}
              animate={{ 
                x: [0, xRange, 0, -xRange, 0],
                y: [0, yRange, 0, -yRange, 0]
              }}
              transition={{ 
                duration, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: i * 0.5
              }}
            />
          );
        })}
      </svg>

      <Particles prefersReducedMotion={prefersReducedMotion} />

      <div className="absolute inset-0 bg-noise opacity-[0.03]" />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px]">
        <motion.div
          className="absolute inset-0 rounded-full bg-primary/5 blur-3xl"
          animate={{
            scale: prefersReducedMotion ? [1, 1.05, 1] : [1, 1.1, 1],
            opacity: prefersReducedMotion ? [0.3, 0.4, 0.3] : [0.3, 0.5, 0.3],
          }}
          transition={{ duration: prefersReducedMotion ? 8 : 4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
