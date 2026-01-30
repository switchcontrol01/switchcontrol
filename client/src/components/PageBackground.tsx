import { useMemo, useEffect, useState } from 'react';

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

export function PageBackground() {
  const [docHeight, setDocHeight] = useState(3000);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateDimensions = () => {
      const height = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        window.innerHeight * 3
      );
      setDocHeight(height);
      setIsMobile(window.innerWidth < 768);
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    const timers = [
      setTimeout(updateDimensions, 300),
      setTimeout(updateDimensions, 1000),
    ];
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
      timers.forEach(clearTimeout);
    };
  }, []);

  // Layer 1: Contour lines - 20 lines spread across page
  const contourLines = useMemo<ContourLine[]>(() => {
    const lines: ContourLine[] = [];
    const lineCount = isMobile ? 12 : 20;
    
    for (let i = 0; i < lineCount; i++) {
      const y = (i + 0.5) * (100 / lineCount); // percentage-based
      
      lines.push({
        y,
        amplitude: 8 + Math.sin(i * 0.7) * 5,
        strokeWidth: 1.5 + (i % 3) * 0.5,
        opacity: 0.25 + Math.sin(i * 0.5) * 0.1,
        gradientId: i % 3 === 0 ? 'pg-contour-1' : i % 3 === 1 ? 'pg-contour-2' : 'pg-contour-3',
        animClass: `animate-contour-${(i % 4) + 1}`,
      });
    }
    return lines;
  }, [isMobile]);

  // Layer 2: Glow blobs - cyan only for speed/performance aesthetic
  const glowBlobs = useMemo<GlowBlob[]>(() => [
    { id: 'hero', top: '5%', left: '5%', size: 500, color: 'hsl(190 90% 50%)', blur: 120, opacity: 0.08, animClass: 'animate-blob-1' },
    { id: 'hero-right', top: '8%', right: '10%', size: 400, color: 'hsl(185 80% 45%)', blur: 100, opacity: 0.06, animClass: 'animate-blob-2' },
    { id: 'mid-left', top: '35%', left: '15%', size: 450, color: 'hsl(200 85% 55%)', blur: 110, opacity: 0.04, animClass: 'animate-blob-3' },
    { id: 'mid-right', top: '50%', right: '5%', size: 380, color: 'hsl(190 90% 50%)', blur: 90, opacity: 0.05, animClass: 'animate-blob-1' },
    { id: 'lower', top: '70%', left: '20%', size: 420, color: 'hsl(185 80% 45%)', blur: 100, opacity: 0.04, animClass: 'animate-blob-2' },
    { id: 'footer', top: '88%', right: '15%', size: 350, color: 'hsl(190 90% 50%)', blur: 80, opacity: 0.04, animClass: 'animate-blob-3' },
  ], []);

  return (
    <div 
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0, height: docHeight }}
      aria-hidden="true"
    >
      {/* Layer 0: Base ambient gradient - cyan primary */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          height: docHeight,
          background: `
            radial-gradient(ellipse 80% 50% at 20% 20%, hsl(190 90% 50% / 0.12) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 60%, hsl(185 80% 45% / 0.08) 0%, transparent 50%)
          `,
        }}
      />

      {/* Layer 1: Contour lines - percentage based positioning */}
      <svg 
        className="absolute inset-0 w-full"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ height: docHeight }}
      >
        <defs>
          {/* Cyan contour gradients */}
          <linearGradient id="pg-contour-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(190 90% 50% / 0)" />
            <stop offset="15%" stopColor="hsl(190 90% 50% / 0.5)" />
            <stop offset="50%" stopColor="hsl(185 80% 55% / 0.4)" />
            <stop offset="85%" stopColor="hsl(190 90% 50% / 0.5)" />
            <stop offset="100%" stopColor="hsl(190 90% 50% / 0)" />
          </linearGradient>
          <linearGradient id="pg-contour-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(185 80% 45% / 0)" />
            <stop offset="20%" stopColor="hsl(185 80% 45% / 0.4)" />
            <stop offset="80%" stopColor="hsl(185 80% 45% / 0.4)" />
            <stop offset="100%" stopColor="hsl(185 80% 45% / 0)" />
          </linearGradient>
          <linearGradient id="pg-contour-3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(200 85% 55% / 0)" />
            <stop offset="25%" stopColor="hsl(200 85% 55% / 0.35)" />
            <stop offset="75%" stopColor="hsl(200 85% 55% / 0.35)" />
            <stop offset="100%" stopColor="hsl(200 85% 55% / 0)" />
          </linearGradient>
        </defs>
        
        {contourLines.map((line, i) => {
          const amp = line.amplitude;
          const y = line.y;
          const variant = i % 3;
          
          const pathD = variant === 0
            ? `M-5,${y} Q25,${y - amp} 50,${y} T105,${y}`
            : variant === 1
            ? `M-5,${y} Q30,${y + amp * 0.8} 60,${y} T105,${y}`
            : `M-5,${y} Q20,${y - amp * 0.6} 45,${y + amp * 0.5} T105,${y}`;
          
          return (
            <g key={i} className={line.animClass}>
              <path
                d={pathD}
                fill="none"
                stroke={`url(#${line.gradientId})`}
                strokeWidth={line.strokeWidth * 0.15}
                opacity={line.opacity}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>

      {/* Layer 2: Glow blobs */}
      <div className="absolute inset-0" style={{ height: docHeight }}>
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
      </div>
    </div>
  );
}
