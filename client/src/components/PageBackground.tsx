import { useMemo, useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  drift: number;
  delay: number;
}

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
  const [docHeight, setDocHeight] = useState(4000);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateDimensions = () => {
      const height = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        window.innerHeight * 4
      );
      setDocHeight(height);
      setIsMobile(window.innerWidth < 768);
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    const observer = new MutationObserver(updateDimensions);
    observer.observe(document.body, { childList: true, subtree: true });
    
    const timers = [
      setTimeout(updateDimensions, 500),
      setTimeout(updateDimensions, 1500),
    ];
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  // Layer 1: Contour lines - scale with page height
  const contourLines = useMemo<ContourLine[]>(() => {
    const lines: ContourLine[] = [];
    const baseCount = Math.floor(docHeight / 120);
    const lineCount = Math.min(baseCount, isMobile ? 30 : 50);
    
    for (let i = 0; i < lineCount; i++) {
      const y = (i + 1) * (docHeight / (lineCount + 1));
      const waveOffset = Math.sin(i * 0.3) * 15;
      
      lines.push({
        y: y + waveOffset,
        amplitude: 40 + Math.sin(i * 0.7) * 25,
        strokeWidth: 0.8 + (i % 3) * 0.4,
        opacity: 0.18 + Math.sin(i * 0.5) * 0.08,
        gradientId: i % 3 === 0 ? 'contour-gradient-1' : i % 3 === 1 ? 'contour-gradient-2' : 'contour-gradient-3',
        animClass: `animate-contour-${(i % 4) + 1}`,
      });
    }
    return lines;
  }, [docHeight, isMobile]);

  // Layer 2: Glow blobs for depth (6 strategically placed)
  const glowBlobs = useMemo<GlowBlob[]>(() => [
    { id: 'hero', top: '5%', left: '5%', size: 500, color: 'hsl(270 70% 50%)', blur: 120, opacity: 0.08, animClass: 'animate-blob-1' },
    { id: 'hero-right', top: '8%', right: '10%', size: 400, color: 'hsl(320 70% 50%)', blur: 100, opacity: 0.06, animClass: 'animate-blob-2' },
    { id: 'mid-left', top: '35%', left: '15%', size: 450, color: 'hsl(280 60% 45%)', blur: 110, opacity: 0.05, animClass: 'animate-blob-3' },
    { id: 'mid-right', top: '50%', right: '5%', size: 380, color: 'hsl(270 65% 55%)', blur: 90, opacity: 0.05, animClass: 'animate-blob-1' },
    { id: 'lower', top: '70%', left: '20%', size: 420, color: 'hsl(320 60% 45%)', blur: 100, opacity: 0.04, animClass: 'animate-blob-2' },
    { id: 'footer', top: '88%', right: '15%', size: 350, color: 'hsl(270 70% 50%)', blur: 80, opacity: 0.04, animClass: 'animate-blob-3' },
  ], []);

  // Layer 3: Particles - reduced on mobile
  const particles = useMemo<Particle[]>(() => {
    const particleCount = isMobile ? 35 : 55;
    const generated: Particle[] = [];
    
    for (let i = 0; i < particleCount; i++) {
      generated.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 2 + Math.random() * 2.5,
        opacity: 0.12 + Math.random() * 0.2,
        speed: 18 + Math.random() * 15,
        drift: Math.random() * 30 - 15,
        delay: Math.random() * 8,
      });
    }
    return generated;
  }, [isMobile]);

  return (
    <div 
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: -1, height: docHeight }}
      aria-hidden="true"
    >
      {/* Layer 0: Base ambient gradient overlay */}
      <div 
        className="absolute inset-0 opacity-25"
        style={{
          height: docHeight,
          background: `
            radial-gradient(ellipse 80% 50% at 20% 20%, rgba(139, 92, 246, 0.12) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 60%, rgba(236, 72, 153, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse 70% 60% at 50% 90%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)
          `,
        }}
      />

      {/* Layer 1: Contour lines - NO blur filter, use opacity + stroke width for glow effect */}
      <svg 
        className="absolute inset-0 w-full" 
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        style={{ height: docHeight }}
      >
        <defs>
          <linearGradient id="contour-gradient-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0)" />
            <stop offset="15%" stopColor="rgba(139, 92, 246, 0.5)" />
            <stop offset="50%" stopColor="rgba(236, 72, 153, 0.4)" />
            <stop offset="85%" stopColor="rgba(139, 92, 246, 0.5)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
          </linearGradient>
          <linearGradient id="contour-gradient-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(168, 85, 247, 0)" />
            <stop offset="25%" stopColor="rgba(168, 85, 247, 0.45)" />
            <stop offset="75%" stopColor="rgba(168, 85, 247, 0.45)" />
            <stop offset="100%" stopColor="rgba(168, 85, 247, 0)" />
          </linearGradient>
          <linearGradient id="contour-gradient-3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(236, 72, 153, 0)" />
            <stop offset="20%" stopColor="rgba(236, 72, 153, 0.4)" />
            <stop offset="50%" stopColor="rgba(139, 92, 246, 0.35)" />
            <stop offset="80%" stopColor="rgba(236, 72, 153, 0.4)" />
            <stop offset="100%" stopColor="rgba(236, 72, 153, 0)" />
          </linearGradient>
        </defs>
        
        {contourLines.map((line, i) => (
          <g key={i} className={line.animClass}>
            {/* Soft glow - thicker stroke, lower opacity */}
            <path
              d={`M-100,${line.y} Q${400 + line.amplitude},${line.y - line.amplitude} 800,${line.y} T1600,${line.y} T2400,${line.y} T3200,${line.y}`}
              fill="none"
              stroke={`url(#${line.gradientId})`}
              strokeWidth={line.strokeWidth * 4}
              opacity={line.opacity * 0.4}
            />
            {/* Main line */}
            <path
              d={`M-100,${line.y} Q${400 + line.amplitude},${line.y - line.amplitude} 800,${line.y} T1600,${line.y} T2400,${line.y} T3200,${line.y}`}
              fill="none"
              stroke={`url(#${line.gradientId})`}
              strokeWidth={line.strokeWidth}
              opacity={line.opacity}
            />
          </g>
        ))}
      </svg>

      {/* Layer 2: Glow blobs */}
      <div className="absolute inset-0" style={{ height: docHeight }}>
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
            }}
          />
        ))}
      </div>

      {/* Layer 3: Particle field */}
      <div 
        className="absolute inset-0"
        style={{ height: docHeight }}
      >
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute rounded-full animate-particle will-change-transform"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: particle.size,
              height: particle.size,
              background: `radial-gradient(circle, rgba(255, 255, 255, ${particle.opacity}) 0%, rgba(139, 92, 246, ${particle.opacity * 0.4}) 50%, transparent 100%)`,
              animationDuration: `${particle.speed}s`,
              animationDelay: `${particle.delay}s`,
              ['--drift-x' as string]: `${particle.drift}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
