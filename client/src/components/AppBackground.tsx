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

  const glowBlobs = useMemo<GlowBlob[]>(() => [
    { id: 'top-left', top: '5%', left: '5%', size: 450, color: 'hsl(270 50% 45%)', blur: 120, opacity: 0.09, animClass: 'animate-blob-1' },
    { id: 'top-right', top: '10%', right: '10%', size: 350, color: 'hsl(190 70% 45%)', blur: 100, opacity: 0.07, animClass: 'animate-blob-2' },
    { id: 'mid', top: '45%', left: '50%', size: 500, color: 'hsl(275 55% 50%)', blur: 140, opacity: 0.06, animClass: 'animate-blob-3' },
    { id: 'bottom', top: '80%', right: '20%', size: 380, color: 'hsl(265 50% 45%)', blur: 110, opacity: 0.08, animClass: 'animate-blob-1' },
  ], []);

  const contourLines = useMemo<ContourLine[]>(() => {
    const lines: ContourLine[] = [];
    const lineCount = isMobile ? 8 : 14;
    
    for (let i = 0; i < lineCount; i++) {
      const spacing = 100 / lineCount;
      const variation = Math.sin(i * 0.7) * 2;
      const y = (i + 0.5) * spacing + variation;
      
      lines.push({
        y,
        amplitude: 4 + Math.sin(i * 0.6) * 3,
        strokeWidth: 0.6 + (i % 3) * 0.2,
        opacity: 0.10 + Math.sin(i * 0.5) * 0.04,
        gradientId: i % 4 === 0 ? 'app-contour-1' : i % 4 === 1 ? 'app-contour-2' : i % 4 === 2 ? 'app-contour-3' : 'app-contour-4',
        animClass: `animate-contour-${(i % 4) + 1}`,
      });
    }
    return lines;
  }, [isMobile]);

  return (
    <div 
      className="fixed inset-0 overflow-hidden"
      style={{ zIndex: 0, transform: 'rotate(-12deg) scale(1.3)', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 70% 50% at 20% 30%, hsl(270 50% 45% / 0.10) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 70%, hsl(190 70% 45% / 0.08) 0%, transparent 50%),
            radial-gradient(ellipse 50% 40% at 50% 80%, hsl(275 55% 50% / 0.06) 0%, transparent 50%)
          `,
        }}
      />

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
            <stop offset="15%" stopColor="hsl(270 50% 50% / 0.2)" />
            <stop offset="50%" stopColor="hsl(275 45% 55% / 0.18)" />
            <stop offset="85%" stopColor="hsl(270 50% 50% / 0.2)" />
            <stop offset="100%" stopColor="hsl(270 50% 50% / 0)" />
          </linearGradient>
          <linearGradient id="app-contour-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(265 45% 45% / 0)" />
            <stop offset="20%" stopColor="hsl(265 45% 45% / 0.18)" />
            <stop offset="80%" stopColor="hsl(265 45% 45% / 0.18)" />
            <stop offset="100%" stopColor="hsl(265 45% 45% / 0)" />
          </linearGradient>
          <linearGradient id="app-contour-3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(280 50% 50% / 0)" />
            <stop offset="25%" stopColor="hsl(280 50% 50% / 0.15)" />
            <stop offset="75%" stopColor="hsl(280 50% 50% / 0.15)" />
            <stop offset="100%" stopColor="hsl(280 50% 50% / 0)" />
          </linearGradient>
          <linearGradient id="app-contour-4" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(190 60% 45% / 0)" />
            <stop offset="30%" stopColor="hsl(190 60% 45% / 0.12)" />
            <stop offset="70%" stopColor="hsl(195 55% 50% / 0.12)" />
            <stop offset="100%" stopColor="hsl(190 60% 45% / 0)" />
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
                strokeWidth={line.strokeWidth * 0.1}
                opacity={line.opacity}
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

      <SpotlightCursor />
    </div>
  );
}
