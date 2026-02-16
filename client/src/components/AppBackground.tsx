import { useMemo, useState, useEffect, useRef } from 'react';
import { SpotlightCursor } from './SpotlightCursor';
import { PremiumParticles } from './PremiumBackground';
import { useMotion } from '@/lib/motion';

interface GlowBlob {
  id: string;
  top: string;
  left?: string;
  right?: string;
  size: number;
  color: string;
  blur: number;
  opacity: number;
  animClass: string;
}

export function AppBackground() {
  const [isMobile, setIsMobile] = useState(false);
  const { prefersReducedMotion } = useMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const parallaxRef = useRef({ x: 0, y: 0 });
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || isMobile) return;

    const grid = gridRef.current;
    if (!grid) return;

    let animationId: number;
    let targetX = 0;
    let targetY = 0;
    let isVisible = true;

    const handleMouseMove = (e: MouseEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 20;
      targetY = (e.clientY / window.innerHeight - 0.5) * 20;
    };

    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible) {
        animationId = requestAnimationFrame(animate);
      }
    };

    const animate = () => {
      if (!isVisible) return;
      
      parallaxRef.current.x += (targetX - parallaxRef.current.x) * 0.03;
      parallaxRef.current.y += (targetY - parallaxRef.current.y) * 0.03;
      
      grid.style.transform = `translate(${parallaxRef.current.x}px, ${parallaxRef.current.y}px)`;
      animationId = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    animationId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationId);
    };
  }, [prefersReducedMotion, isMobile]);

  const glowBlobs = useMemo<GlowBlob[]>(() => [
    { id: 'center-main', top: '30%', left: '45%', size: 700, color: 'hsl(270 60% 50%)', blur: 160, opacity: 0.25, animClass: 'animate-blob-1' },
    { id: 'top-left', top: '5%', left: '10%', size: 500, color: 'hsl(270 55% 45%)', blur: 130, opacity: 0.20, animClass: 'animate-blob-2' },
    { id: 'top-right', top: '8%', right: '5%', size: 420, color: 'hsl(280 65% 50%)', blur: 120, opacity: 0.18, animClass: 'animate-blob-3' },
    { id: 'mid-left', top: '55%', left: '5%', size: 380, color: 'hsl(265 50% 45%)', blur: 110, opacity: 0.16, animClass: 'animate-blob-2' },
    { id: 'bottom-right', top: '75%', right: '15%', size: 450, color: 'hsl(275 60% 48%)', blur: 130, opacity: 0.20, animClass: 'animate-blob-1' },
    { id: 'bottom-center', top: '90%', left: '40%', size: 550, color: 'hsl(270 50% 40%)', blur: 140, opacity: 0.15, animClass: 'animate-blob-3' },
  ], []);

  const scanLineCount = isMobile ? 15 : 30;

  return (
    <>
    <PremiumParticles config={{ count: 50, speed: 0.3, opacity: 0.18, size: 2.5 }} />
    <div 
      className="fixed inset-0 overflow-hidden"
      style={{ zIndex: 0, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <div 
        className="absolute inset-0"
        style={{
          pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 80% 60% at 40% 35%, hsl(270 60% 50% / 0.25) 0%, transparent 55%),
            radial-gradient(ellipse 70% 50% at 75% 65%, hsl(280 55% 45% / 0.18) 0%, transparent 50%),
            radial-gradient(ellipse 60% 50% at 20% 80%, hsl(265 50% 45% / 0.15) 0%, transparent 50%),
            radial-gradient(ellipse 90% 40% at 50% 10%, hsl(275 60% 50% / 0.12) 0%, transparent 45%)
          `,
        }}
      />

      <div 
        ref={gridRef}
        className="absolute inset-[-40px]"
        style={{ pointerEvents: 'none' }}
      >
        <div 
          className="absolute inset-0 app-grid-overlay"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(270 50% 55% / 0.12) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(270 50% 55% / 0.10) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        <div 
          className="absolute inset-0 app-grid-overlay-fine"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(270 50% 55% / 0.05) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(270 50% 55% / 0.04) 1px, transparent 1px)
            `,
            backgroundSize: '15px 15px',
          }}
        />

        <div 
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 50% 50% at 50% 50%, transparent 30%, hsl(0 0% 3% / 0.6) 100%)
            `,
            pointerEvents: 'none',
          }}
        />
      </div>

      <div className="absolute inset-0 app-scanlines" style={{ pointerEvents: 'none' }}>
        {Array.from({ length: scanLineCount }, (_, i) => {
          const left = (i / scanLineCount) * 100 + (Math.sin(i * 1.3) * 2);
          const height = 40 + Math.random() * 40;
          const delay = Math.random() * 8;
          const duration = 4 + Math.random() * 4;
          const opacity = 0.06 + Math.random() * 0.08;
          return (
            <div
              key={`scanline-${i}`}
              className="absolute app-scanline-fall"
              style={{
                left: `${left}%`,
                top: '-20%',
                width: '1px',
                height: `${height}%`,
                background: `linear-gradient(to bottom, transparent, hsl(270 60% 60% / ${opacity}), transparent)`,
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`,
              }}
            />
          );
        })}
      </div>

      <svg 
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="app-contour-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(270 50% 50% / 0)" />
            <stop offset="15%" stopColor="hsl(270 50% 50% / 0.3)" />
            <stop offset="50%" stopColor="hsl(275 45% 55% / 0.25)" />
            <stop offset="85%" stopColor="hsl(270 50% 50% / 0.3)" />
            <stop offset="100%" stopColor="hsl(270 50% 50% / 0)" />
          </linearGradient>
          <linearGradient id="app-contour-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(265 45% 45% / 0)" />
            <stop offset="20%" stopColor="hsl(265 45% 45% / 0.25)" />
            <stop offset="80%" stopColor="hsl(265 45% 45% / 0.25)" />
            <stop offset="100%" stopColor="hsl(265 45% 45% / 0)" />
          </linearGradient>
          <linearGradient id="app-contour-3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(280 50% 50% / 0)" />
            <stop offset="25%" stopColor="hsl(280 50% 50% / 0.22)" />
            <stop offset="75%" stopColor="hsl(280 50% 50% / 0.22)" />
            <stop offset="100%" stopColor="hsl(280 50% 50% / 0)" />
          </linearGradient>
          <linearGradient id="app-contour-4" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(190 60% 45% / 0)" />
            <stop offset="30%" stopColor="hsl(190 60% 45% / 0.18)" />
            <stop offset="70%" stopColor="hsl(195 55% 50% / 0.18)" />
            <stop offset="100%" stopColor="hsl(190 60% 45% / 0)" />
          </linearGradient>
        </defs>
        
        {Array.from({ length: isMobile ? 10 : 18 }, (_, i) => {
          const lineCount = isMobile ? 10 : 18;
          const spacing = 100 / lineCount;
          const variation = Math.sin(i * 0.7) * 2;
          const y = (i + 0.5) * spacing + variation;
          const amp = 5 + Math.sin(i * 0.6) * 4;
          const variant = i % 4;
          const sw = (0.8 + (i % 3) * 0.3) * 0.1;
          const op = 0.22 + Math.sin(i * 0.5) * 0.08;
          const gradId = `app-contour-${(i % 4) + 1}`;
          const animCls = `animate-contour-${(i % 4) + 1}`;
          
          const pathD = variant === 0
            ? `M-5,${y} Q25,${y - amp} 50,${y} T105,${y}`
            : variant === 1
            ? `M-5,${y} Q30,${y + amp * 0.7} 55,${y} T105,${y}`
            : variant === 2
            ? `M-5,${y} Q20,${y - amp * 0.5} 40,${y + amp * 0.4} T105,${y}`
            : `M-5,${y} Q35,${y + amp * 0.6} 65,${y - amp * 0.3} T105,${y}`;
          
          return (
            <g key={i} className={animCls}>
              <path
                d={pathD}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth={sw}
                opacity={op}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>

      {glowBlobs.map((blob) => (
        <div
          key={blob.id}
          className={blob.animClass}
          style={{
            position: 'absolute',
            top: blob.top,
            left: blob.left,
            right: blob.right,
            width: blob.size,
            height: blob.size,
            background: `radial-gradient(circle, ${blob.color} 0%, transparent 70%)`,
            filter: `blur(${blob.blur}px)`,
            opacity: blob.opacity,
            borderRadius: '50%',
            transform: 'translate3d(0,0,0)',
            pointerEvents: 'none',
          }}
        />
      ))}

      <div 
        className="absolute inset-0 app-pulse-vignette"
        style={{
          background: 'radial-gradient(ellipse 50% 50% at 50% 50%, hsl(270 60% 50% / 0.06) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <SpotlightCursor />
    </div>
    </>
  );
}
