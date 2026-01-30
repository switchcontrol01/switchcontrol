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

  // Layer 2: Glow blobs - cyan only for speed/performance aesthetic
  const glowBlobs = useMemo<GlowBlob[]>(() => [
    { id: 'top-left', top: '5%', left: '5%', size: 450, color: 'hsl(190 90% 50%)', blur: 100, opacity: 0.07, animClass: 'animate-blob-1' },
    { id: 'top-right', top: '10%', right: '10%', size: 350, color: 'hsl(185 80% 45%)', blur: 80, opacity: 0.05, animClass: 'animate-blob-2' },
    { id: 'mid', top: '45%', left: '50%', size: 500, color: 'hsl(200 85% 55%)', blur: 120, opacity: 0.04, animClass: 'animate-blob-3' },
    { id: 'bottom', top: '80%', right: '20%', size: 380, color: 'hsl(190 90% 50%)', blur: 100, opacity: 0.06, animClass: 'animate-blob-1' },
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
      {/* Layer 0: Base gradient - cyan only */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 20% 30%, hsl(190 90% 50% / 0.1) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 70%, hsl(185 80% 45% / 0.08) 0%, transparent 50%),
            radial-gradient(ellipse 50% 40% at 50% 80%, hsl(200 85% 55% / 0.05) 0%, transparent 50%)
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
          {/* Cyan contour gradients */}
          <linearGradient id="app-contour-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(190 90% 50% / 0)" />
            <stop offset="15%" stopColor="hsl(190 90% 50% / 0.4)" />
            <stop offset="50%" stopColor="hsl(185 80% 55% / 0.35)" />
            <stop offset="85%" stopColor="hsl(190 90% 50% / 0.4)" />
            <stop offset="100%" stopColor="hsl(190 90% 50% / 0)" />
          </linearGradient>
          <linearGradient id="app-contour-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(185 80% 45% / 0)" />
            <stop offset="20%" stopColor="hsl(185 80% 45% / 0.35)" />
            <stop offset="80%" stopColor="hsl(185 80% 45% / 0.35)" />
            <stop offset="100%" stopColor="hsl(185 80% 45% / 0)" />
          </linearGradient>
          <linearGradient id="app-contour-3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(200 85% 55% / 0)" />
            <stop offset="25%" stopColor="hsl(200 85% 55% / 0.3)" />
            <stop offset="75%" stopColor="hsl(200 85% 55% / 0.3)" />
            <stop offset="100%" stopColor="hsl(200 85% 55% / 0)" />
          </linearGradient>
          {/* Fourth gradient - lighter cyan variation */}
          <linearGradient id="app-contour-4" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(195 85% 50% / 0)" />
            <stop offset="30%" stopColor="hsl(195 85% 50% / 0.25)" />
            <stop offset="70%" stopColor="hsl(190 90% 50% / 0.25)" />
            <stop offset="100%" stopColor="hsl(190 90% 50% / 0)" />
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
