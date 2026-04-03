import { useMemo } from 'react';
import { motion } from 'framer-motion';

export type DashboardTimeOfDay = 'morning' | 'afternoon' | 'evening';

interface Props {
  timeOfDay?: DashboardTimeOfDay;
}

const MOOD: Record<DashboardTimeOfDay, {
  orb1: string; orb2: string; orb3: string;
  spotlight: string; particleColor: string;
}> = {
  morning: {
    orb1:        'radial-gradient(ellipse, rgba(0,210,255,0.17) 0%, transparent 65%)',
    orb2:        'radial-gradient(ellipse, rgba(167,139,250,0.12) 0%, transparent 65%)',
    orb3:        'radial-gradient(ellipse, rgba(125,211,252,0.08) 0%, transparent 65%)',
    spotlight:   'radial-gradient(ellipse 55% 80% at 28% 50%, rgba(0,210,255,0.06) 0%, transparent 70%)',
    particleColor: 'rgba(0,210,255,',
  },
  afternoon: {
    orb1:        'radial-gradient(ellipse, rgba(139,92,246,0.19) 0%, transparent 65%)',
    orb2:        'radial-gradient(ellipse, rgba(236,72,153,0.10) 0%, transparent 65%)',
    orb3:        'radial-gradient(ellipse, rgba(168,85,247,0.09) 0%, transparent 65%)',
    spotlight:   'radial-gradient(ellipse 55% 80% at 28% 50%, rgba(139,92,246,0.08) 0%, transparent 70%)',
    particleColor: 'rgba(168,85,247,',
  },
  evening: {
    orb1:        'radial-gradient(ellipse, rgba(67,90,230,0.17) 0%, transparent 65%)',
    orb2:        'radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 65%)',
    orb3:        'radial-gradient(ellipse, rgba(0,120,200,0.08) 0%, transparent 65%)',
    spotlight:   'radial-gradient(ellipse 55% 80% at 28% 50%, rgba(67,90,230,0.07) 0%, transparent 70%)',
    particleColor: 'rgba(100,120,255,',
  },
};

function seeded(s: number) {
  const x = Math.sin(s + 1) * 10000;
  return x - Math.floor(x);
}

export function DashboardHeaderParticles({ timeOfDay = 'afternoon' }: Props) {
  const mood = MOOD[timeOfDay];

  const particles = useMemo(() =>
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      left:    2  + seeded(i * 7)  * 96,
      top:     5  + seeded(i * 13) * 88,
      size:    1.2 + seeded(i * 19) * 2.2,
      opacity: 0.12 + seeded(i * 23) * 0.22,
      dur:     10  + seeded(i * 11) * 10,
      delay:   seeded(i * 5) * 7,
      dy:      8   + seeded(i * 17) * 14,
    })),
  []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl" aria-hidden="true">

      {/* Ambient orb 1 — left side */}
      <motion.div
        className="absolute"
        style={{
          left: '-6%', top: '-25%',
          width: '55%', height: '200%',
          background: mood.orb1,
          filter: 'blur(60px)',
        }}
        animate={{ x: [0, 20, 0], y: [0, 12, 0], opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Ambient orb 2 — right side */}
      <motion.div
        className="absolute"
        style={{
          right: '4%', top: '-15%',
          width: '42%', height: '175%',
          background: mood.orb2,
          filter: 'blur(70px)',
        }}
        animate={{ x: [0, -16, 0], y: [0, -9, 0], opacity: [0.45, 0.8, 0.45] }}
        transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut', delay: 2.5 }}
      />

      {/* Tertiary orb — centre accent */}
      <motion.div
        className="absolute"
        style={{
          left: '32%', top: '-30%',
          width: '32%', height: '180%',
          background: mood.orb3,
          filter: 'blur(52px)',
        }}
        animate={{ x: [0, 12, -10, 0], opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
      />

      {/* Directional spotlight */}
      <div className="absolute inset-0" style={{ background: mood.spotlight }} />

      {/* Micro floating particles */}
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left:       `${p.left}%`,
            top:        `${p.top}%`,
            width:      p.size,
            height:     p.size,
            background: `${mood.particleColor}${p.opacity})`,
            boxShadow:  `0 0 ${p.size * 2.5}px ${mood.particleColor}${p.opacity * 0.55})`,
          }}
          animate={{ y: [-p.dy, p.dy, -p.dy], opacity: [0, p.opacity * 1.5, 0] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {/* Bottom fade to background */}
      <div
        className="absolute bottom-0 left-0 right-0 h-10"
        style={{ background: 'linear-gradient(to bottom, transparent, hsl(var(--background) / 0.5))' }}
      />
    </div>
  );
}
