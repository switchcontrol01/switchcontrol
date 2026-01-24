import { useMemo, useEffect, useState } from 'react';

export function PageBackground() {
  const [docHeight, setDocHeight] = useState(3000);

  useEffect(() => {
    const updateHeight = () => {
      const height = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        window.innerHeight * 3
      );
      setDocHeight(height);
    };
    
    updateHeight();
    window.addEventListener('resize', updateHeight);
    
    // Recheck after content loads
    const timer = setTimeout(updateHeight, 1000);
    
    return () => {
      window.removeEventListener('resize', updateHeight);
      clearTimeout(timer);
    };
  }, []);

  const blobs = useMemo(() => [
    { top: '5%', left: '10%', size: 400, color: 'primary', blur: 100, opacity: 0.06, animClass: 'animate-blob-1' },
    { top: '25%', right: '15%', size: 350, color: 'pink', blur: 90, opacity: 0.05, animClass: 'animate-blob-2' },
    { top: '45%', left: '20%', size: 300, color: 'purple', blur: 80, opacity: 0.04, animClass: 'animate-blob-3' },
    { top: '65%', right: '25%', size: 280, color: 'primary', blur: 70, opacity: 0.04, animClass: 'animate-blob-1' },
    { top: '85%', left: '15%', size: 260, color: 'pink', blur: 70, opacity: 0.03, animClass: 'animate-blob-2' },
  ], []);

  // Generate wave positions distributed across page height
  const waveYPositions = useMemo(() => {
    const positions = [];
    for (let i = 0; i < 8; i++) {
      positions.push((i + 1) * (docHeight / 9));
    }
    return positions;
  }, [docHeight]);

  return (
    <div 
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: -1, height: docHeight }}
      aria-hidden="true"
    >
      {blobs.map((blob, i) => (
        <div
          key={i}
          className={`absolute rounded-full will-change-transform ${blob.animClass}`}
          style={{
            top: blob.top,
            left: blob.left,
            right: blob.right,
            width: blob.size,
            height: blob.size,
            background: blob.color === 'primary' 
              ? 'hsl(270 70% 60%)' 
              : blob.color === 'pink' 
                ? 'hsl(320 80% 60%)' 
                : 'hsl(280 60% 50%)',
            filter: `blur(${blob.blur}px)`,
            opacity: blob.opacity,
          }}
        />
      ))}
      
      <svg 
        className="absolute inset-0 w-full will-change-transform" 
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        style={{ height: docHeight }}
      >
        <defs>
          <linearGradient id="page-wave-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0.12)" />
            <stop offset="50%" stopColor="rgba(236, 72, 153, 0.08)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0.12)" />
          </linearGradient>
          <linearGradient id="page-wave-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0.06)" />
            <stop offset="50%" stopColor="rgba(168, 85, 247, 0.04)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0.06)" />
          </linearGradient>
        </defs>
        
        {waveYPositions.map((y, i) => (
          <path
            key={i}
            className={i % 3 === 0 ? 'animate-wave-1' : i % 3 === 1 ? 'animate-wave-2' : 'animate-wave-3'}
            d={`M-100,${y} Q400,${y - 50} 800,${y} T1600,${y} T2400,${y}`}
            fill="none"
            stroke={i % 2 === 0 ? 'url(#page-wave-1)' : 'url(#page-wave-2)'}
            strokeWidth={1 - (i * 0.08)}
            opacity={0.3 - (i * 0.02)}
          />
        ))}
      </svg>
    </div>
  );
}
