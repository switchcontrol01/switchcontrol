import { useMemo, useState, useEffect } from 'react';
import { SpotlightCursor } from './SpotlightCursor';

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

interface ContourLine {
  y: number;
  amplitude: number;
  strokeWidth: number;
  opacity: number;
  gradientId: string;
  animClass: string;
}

export function AppBackground() {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Layer 2: Glow blobs - subtle ambient lighting
  const glowBlobs = useMemo<GlowBlob[]>(() => [
    { id: 'top-left', top: '5%', left: '5%', size: 450, color: 'hsl(270 70% 50%)', blur: 100, opacity: 0.06, animClass: 'animate-blob-1' },
    { id: 'top-right', top: '10%', right: '10%', size: 350, color: 'hsl(320 70% 50%)', blur: 80, opacity: 0.05, animClass: 'animate-blob-2' },
    { id: 'mid', top: '45%', left: '50%', size: 500, color: 'hsl(280 60% 45%)', blur: 120, opacity: 0.05, animClass: 'animate-blob-3' },
    { id: 'bottom', top: '80%', right: '20%', size: 380, color: 'hsl(320 60% 50%)', blur: 100, opacity: 0.06, animClass: 'animate-blob-1' },
  ], []);

  // Layer 1: Contour lines - 20 lines on desktop, 12 on mobile
  const contourLines = useMemo<ContourLine[]>(() => {
    const lines: ContourLine[] = [];
    const lineCount = isMobile ? 10 : 20;
    
    for (let i = 0; i < lineCount; i++) {
      const y = (i + 0.5) * (100 / lineCount);
      
      lines.push({
        y,
        amplitude: 6 + Math.sin(i * 0.5) * 4,
        strokeWidth: 1.2 + (i % 4) * 0.3,
        opacity: 0.18 + Math.sin(i * 0.4) * 0.08,
        gradientId: i % 4 === 0 ? 'app-contour-1' : i % 4 === 1 ? 'app-contour-2' : i % 4 === 2 ? 'app-contour-3' : 'app-contour-4',
        animClass: `animate-contour-${(i % 4) + 1}`,
      });
    }
    return lines;
  }, [isMobile]);

  return (
    <div 
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {/* Layer 0: Base gradient */}
      <div 
        className="absolute inset-0 opacity-25"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 20% 30%, rgba(139, 92, 246, 0.12) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 70%, rgba(236, 72, 153, 0.08) 0%, transparent 50%)
          `,
        }}
      />

      {/* Layer 1: Contour lines SVG */}
      <svg 
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="app-contour-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0)" />
            <stop offset="15%" stopColor="rgba(139, 92, 246, 0.5)" />
            <stop offset="50%" stopColor="rgba(236, 72, 153, 0.4)" />
            <stop offset="85%" stopColor="rgba(139, 92, 246, 0.5)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
          </linearGradient>
          <linearGradient id="app-contour-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(168, 85, 247, 0)" />
            <stop offset="20%" stopColor="rgba(168, 85, 247, 0.45)" />
            <stop offset="80%" stopColor="rgba(168, 85, 247, 0.45)" />
            <stop offset="100%" stopColor="rgba(168, 85, 247, 0)" />
          </linearGradient>
          <linearGradient id="app-contour-3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(236, 72, 153, 0)" />
            <stop offset="25%" stopColor="rgba(236, 72, 153, 0.4)" />
            <stop offset="75%" stopColor="rgba(236, 72, 153, 0.4)" />
            <stop offset="100%" stopColor="rgba(236, 72, 153, 0)" />
          </linearGradient>
          <linearGradient id="app-contour-4" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0)" />
            <stop offset="30%" stopColor="rgba(139, 92, 246, 0.35)" />
            <stop offset="70%" stopColor="rgba(236, 72, 153, 0.35)" />
            <stop offset="100%" stopColor="rgba(236, 72, 153, 0)" />
          </linearGradient>
        </defs>
        
        {contourLines.map((line, i) => {
          const amp = line.amplitude;
          const y = line.y;
          const variant = i % 4;
          
          const pathD = variant === 0
            ? `M-5,${y} Q25,${y - amp} 50,${y} T105,${y}`
            : variant === 1
            ? `M-5,${y} Q30,${y + amp * 0.7} 55,${y} T105,${y}`
            : variant === 2
            ? `M-5,${y} Q20,${y - amp * 0.5} 40,${y + amp * 0.4} T105,${y}`
            : `M-5,${y} Q35,${y + amp * 0.6} 65,${y - amp * 0.3} T105,${y}`;
          
          return (
            <g key={i} className={line.animClass}>
              <path
                d={pathD}
                fill="none"
                stroke={`url(#${line.gradientId})`}
                strokeWidth={line.strokeWidth * 0.12}
                opacity={line.opacity}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>

      {/* Layer 2: Glow blobs */}
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
          }}
        />
      ))}

      {/* Layer 3: Spotlight cursor (desktop only) */}
      <SpotlightCursor />
    </div>
  );
}
