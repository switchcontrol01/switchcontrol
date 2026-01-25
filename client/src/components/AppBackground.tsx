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

export function AppBackground() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateDimensions = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const glowBlobs = useMemo<GlowBlob[]>(() => [
    { id: 'top-left', top: '5%', left: '10%', size: 400, color: 'hsl(270 70% 50%)', blur: 100, opacity: 0.06, animClass: 'animate-blob-1' },
    { id: 'top-right', top: '10%', right: '5%', size: 350, color: 'hsl(190 70% 50%)', blur: 90, opacity: 0.04, animClass: 'animate-blob-2' },
    { id: 'mid', top: '45%', left: '50%', size: 500, color: 'hsl(280 60% 45%)', blur: 120, opacity: 0.03, animClass: 'animate-blob-3' },
    { id: 'bottom', top: '80%', right: '20%', size: 380, color: 'hsl(320 60% 50%)', blur: 100, opacity: 0.04, animClass: 'animate-blob-1' },
  ], []);

  const contourLines = useMemo<ContourLine[]>(() => {
    const lines: ContourLine[] = [];
    const lineCount = isMobile ? 20 : 35;
    
    for (let i = 0; i < lineCount; i++) {
      const y = (i + 1) * (100 / (lineCount + 1));
      const waveOffset = Math.sin(i * 0.3) * 8;
      
      lines.push({
        y: y + waveOffset,
        amplitude: 15 + Math.sin(i * 0.5) * 12 + Math.cos(i * 0.3) * 8,
        strokeWidth: 0.3 + (i % 4) * 0.15,
        opacity: 0.06 + Math.sin(i * 0.4) * 0.03,
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
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          background: `
            radial-gradient(ellipse 60% 40% at 20% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
            radial-gradient(ellipse 50% 30% at 80% 70%, rgba(6, 182, 212, 0.06) 0%, transparent 50%),
            radial-gradient(ellipse 70% 50% at 50% 100%, rgba(139, 92, 246, 0.08) 0%, transparent 50%)
          `,
        }}
      />

      <svg 
        className="absolute inset-0 w-full h-full" 
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="app-contour-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0)" />
            <stop offset="20%" stopColor="rgba(139, 92, 246, 0.25)" />
            <stop offset="50%" stopColor="rgba(236, 72, 153, 0.18)" />
            <stop offset="80%" stopColor="rgba(139, 92, 246, 0.25)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
          </linearGradient>
          <linearGradient id="app-contour-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(6, 182, 212, 0)" />
            <stop offset="25%" stopColor="rgba(6, 182, 212, 0.18)" />
            <stop offset="75%" stopColor="rgba(6, 182, 212, 0.18)" />
            <stop offset="100%" stopColor="rgba(6, 182, 212, 0)" />
          </linearGradient>
          <linearGradient id="app-contour-3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(168, 85, 247, 0)" />
            <stop offset="30%" stopColor="rgba(168, 85, 247, 0.2)" />
            <stop offset="70%" stopColor="rgba(168, 85, 247, 0.2)" />
            <stop offset="100%" stopColor="rgba(168, 85, 247, 0)" />
          </linearGradient>
          <linearGradient id="app-contour-4" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(236, 72, 153, 0)" />
            <stop offset="35%" stopColor="rgba(236, 72, 153, 0.15)" />
            <stop offset="65%" stopColor="rgba(139, 92, 246, 0.12)" />
            <stop offset="100%" stopColor="rgba(236, 72, 153, 0)" />
          </linearGradient>
        </defs>
        
        {contourLines.map((line, i) => {
          const curveVariant = i % 3;
          const pathD = curveVariant === 0
            ? `M-10,${line.y}% Q20,${line.y - line.amplitude * 0.4}% 40,${line.y}% T80,${line.y - line.amplitude * 0.2}% T110,${line.y}%`
            : curveVariant === 1
            ? `M-10,${line.y}% Q30,${line.y + line.amplitude * 0.3}% 55,${line.y}% T85,${line.y + line.amplitude * 0.15}% T110,${line.y}%`
            : `M-10,${line.y}% Q15,${line.y - line.amplitude * 0.25}% 45,${line.y + line.amplitude * 0.2}% T75,${line.y}% T110,${line.y}%`;
          
          return (
            <g key={i} className={line.animClass}>
              <path
                d={pathD}
                fill="none"
                stroke={`url(#${line.gradientId})`}
                strokeWidth={line.strokeWidth * 4}
                opacity={line.opacity * 0.4}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={pathD}
                fill="none"
                stroke={`url(#${line.gradientId})`}
                strokeWidth={line.strokeWidth}
                opacity={line.opacity}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>

      <div className="absolute inset-0">
        {glowBlobs.map((blob) => (
          <div
            key={blob.id}
            className={`absolute rounded-full will-change-transform ${blob.animClass}`}
            style={{
              top: blob.top,
              left: blob.left,
              right: blob.right,
              width: blob.size,
              height: blob.size,
              background: `radial-gradient(circle, ${blob.color} 0%, transparent 70%)`,
              filter: `blur(${blob.blur}px)`,
              opacity: blob.opacity,
              transform: 'translate3d(0,0,0)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
