import { useMemo, useState, useEffect } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  delay: number;
  colorIndex: number;
  tier: 'dot' | 'orb' | 'blob';
}

const PARTICLE_COLORS = [
  `rgba(168, 85, 247, {o})`,   // violet
  `rgba(139, 92, 246, {o})`,   // purple
  `rgba(34, 211, 238, {o})`,   // cyan
  `rgba(192, 132, 252, {o})`,  // lavender
  `rgba(255, 255, 255, {o})`,  // white
  `rgba(236, 72, 153, {o})`,   // pink
  `rgba(99, 179, 237, {o})`,   // sky
];

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function LoginParticles() {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const particles = useMemo<Particle[]>(() => {
    const list: Particle[] = [];

    // Tier 1 — small sharp dots (many)
    const dotCount = isMobile ? 26 : 64;
    for (let i = 0; i < dotCount; i++) {
      list.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: randomBetween(1.5, 3.5),
        opacity: randomBetween(0.22, 0.55),
        speed: randomBetween(12, 28),
        delay: Math.random() * 10,
        colorIndex: Math.floor(Math.random() * PARTICLE_COLORS.length),
        tier: 'dot',
      });
    }

    // Tier 2 — medium glowing orbs (fewer)
    const orbCount = isMobile ? 9 : 22;
    for (let i = 0; i < orbCount; i++) {
      list.push({
        id: dotCount + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: randomBetween(6, 14),
        opacity: randomBetween(0.16, 0.38),
        speed: randomBetween(18, 38),
        delay: Math.random() * 12,
        colorIndex: Math.floor(Math.random() * PARTICLE_COLORS.length),
        tier: 'orb',
      });
    }

    // Tier 3 — large soft blobs (very few, big radial glow)
    const blobCount = isMobile ? 4 : 10;
    for (let i = 0; i < blobCount; i++) {
      list.push({
        id: dotCount + orbCount + i,
        x: randomBetween(5, 95),
        y: randomBetween(5, 95),
        size: randomBetween(70, 150),
        opacity: randomBetween(0.06, 0.14),
        speed: randomBetween(25, 55),
        delay: Math.random() * 15,
        colorIndex: [0, 1, 2, 5, 6][i % 5],
        tier: 'blob',
      });
    }

    return list;
  }, [isMobile]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {particles.map((p) => {
        const colorTemplate = PARTICLE_COLORS[p.colorIndex];
        const color = colorTemplate.replace('{o}', String(p.opacity));
        const colorInner = colorTemplate.replace('{o}', String(p.opacity * 0.6));

        let background: string;
        if (p.tier === 'dot') {
          background = `radial-gradient(circle, ${color} 0%, ${colorInner} 40%, transparent 100%)`;
        } else if (p.tier === 'orb') {
          background = `radial-gradient(circle, ${color} 0%, ${colorInner} 35%, transparent 75%)`;
        } else {
          background = `radial-gradient(ellipse at center, ${color} 0%, transparent 70%)`;
        }

        return (
          <div
            key={p.id}
            className="absolute rounded-full will-change-transform animate-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              background,
              '--particle-speed': `${p.speed}s`,
              animationDuration: `${p.speed}s, ${randomBetween(3, 6).toFixed(1)}s`,
              animationDelay: `${p.delay}s, ${(p.delay * 0.5).toFixed(1)}s`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
