import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  playCinematicHum,
  playRisingTone,
  playPulseTick,
  playMetallicSnap,
  playPremiumChime,
} from '@/lib/premium-audio';

interface PremiumUpgradeAnimationProps {
  show: boolean;
  onComplete: () => void;
}

type Phase =
  | 'idle'
  | 'darken'
  | 'lock-appear'
  | 'glow-build'
  | 'unlock-snap'
  | 'shockwave'
  | 'crown-reveal'
  | 'text-reveal'
  | 'exiting'
  | 'done';

const EASE_LUXURY = [0.22, 1, 0.36, 1] as const;

const FEATURES = [
  'Power Plan',
  'Network Tweaks',
  'BIOS Advisor',
  'AI Advisor',
  'Priority Support',
];

export function PremiumUpgradeAnimation({ show, onComplete }: PremiumUpgradeAnimationProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [visibleFeatures, setVisibleFeatures] = useState(0);
  const [lockUnlocked, setLockUnlocked] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef = useRef<{ stop: () => void } | null>(null);
  const risingRef = useRef<{ stop: () => void } | null>(null);

  const prefersReduced = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  []);

  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      angle: (i / 30) * Math.PI * 2 + (Math.random() - 0.5) * 0.3,
      dist: 80 + Math.random() * 140,
      delay: Math.random() * 0.2,
      dur: 0.5 + Math.random() * 0.4,
      size: 2 + Math.random() * 4,
      hue: 250 + Math.random() * 60,
    })),
  []);

  const skip = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    audioRef.current?.stop();
    risingRef.current?.stop();
    setPhase('done');
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      setVisibleFeatures(0);
      setLockUnlocked(false);
      return;
    }

    if (prefersReduced) {
      setPhase('crown-reveal');
      setVisibleFeatures(FEATURES.length);
      setLockUnlocked(true);
      const t = setTimeout(() => {
        setPhase('done');
        onComplete();
      }, 2000);
      timersRef.current = [t];
      return () => clearTimeout(t);
    }

    const t: ReturnType<typeof setTimeout>[] = [];
    timersRef.current = t;

    // Phase 1: Screen darkens (0-600ms)
    setPhase('darken');

    // Phase 2: Lock icon appears with ambient hum (600ms)
    t.push(setTimeout(() => {
      setPhase('lock-appear');
      audioRef.current = playCinematicHum(2.0);
    }, 600));

    // Phase 3: Glow builds around lock (1800ms)
    t.push(setTimeout(() => {
      setPhase('glow-build');
      risingRef.current = playRisingTone(2.0);
    }, 1800));

    // Pulse ticks during glow build
    t.push(setTimeout(() => { playPulseTick(); }, 2200));
    t.push(setTimeout(() => { playPulseTick(); }, 2700));
    t.push(setTimeout(() => { playPulseTick(); }, 3100));

    // Phase 4: Lock snaps open (3400ms)
    t.push(setTimeout(() => {
      setPhase('unlock-snap');
      setLockUnlocked(true);
      risingRef.current?.stop();
      playMetallicSnap();
    }, 3400));

    // Phase 5: Shockwave ripple (3700ms)
    t.push(setTimeout(() => {
      setPhase('shockwave');
    }, 3700));

    // Phase 6: Crown reveals (4200ms)
    t.push(setTimeout(() => {
      setPhase('crown-reveal');
      playPremiumChime();
    }, 4200));

    // Phase 7: Text and features stagger in (4800ms)
    t.push(setTimeout(() => {
      setPhase('text-reveal');
    }, 4800));

    FEATURES.forEach((_, i) => {
      t.push(setTimeout(() => setVisibleFeatures(i + 1), 5100 + i * 150));
    });

    // Phase 8: Exit (6200ms)
    t.push(setTimeout(() => {
      setPhase('exiting');
    }, 6200));

    t.push(setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 6800));

    return () => {
      t.forEach(clearTimeout);
      audioRef.current?.stop();
      risingRef.current?.stop();
    };
  }, [show, onComplete, prefersReduced]);

  if (!show && phase === 'idle') return null;
  const isActive = phase !== 'idle' && phase !== 'done';

  const phaseIndex = [
    'idle', 'darken', 'lock-appear', 'glow-build', 'unlock-snap',
    'shockwave', 'crown-reveal', 'text-reveal', 'exiting', 'done'
  ].indexOf(phase);

  const showLock = phaseIndex >= 2 && phaseIndex <= 5;
  const showGlowBuild = phaseIndex >= 3 && phaseIndex <= 5;
  const showShockwave = phaseIndex >= 5;
  const showCrown = phaseIndex >= 6;
  const showText = phaseIndex >= 7;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto cursor-pointer select-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'exiting' ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: phase === 'exiting' ? 0.6 : 0.4 }}
          onClick={skip}
          data-testid="premium-upgrade-animation"
        >
          {/* Dark background */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(10,5,20,0.96) 0%, rgba(0,0,0,0.99) 100%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          />

          {/* Ambient gradient */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: phaseIndex >= 3 ? 0.8 : 0.3 }}
            transition={{ duration: 1.5 }}
            style={{
              background: 'radial-gradient(circle at 30% 20%, rgba(139,92,246,0.08) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(6,182,212,0.05) 0%, transparent 50%)',
            }}
          />

          <div className="relative flex flex-col items-center">

            {/* ========== LOCK ICON SECTION ========== */}
            <div className="relative" style={{ width: 160, height: 160 }}>

              {/* Glow ring during glow-build */}
              <AnimatePresence>
                {showGlowBuild && !showShockwave && (
                  <motion.div
                    className="absolute pointer-events-none"
                    style={{
                      width: 240,
                      height: 240,
                      top: '50%',
                      left: '50%',
                    }}
                    initial={{ opacity: 0, scale: 0.6, x: '-50%', y: '-50%' }}
                    animate={{
                      opacity: [0.3, 0.7, 0.3],
                      scale: 1,
                      rotate: 360,
                    }}
                    exit={{ opacity: 0, scale: 1.5 }}
                    transition={{
                      opacity: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
                      rotate: { duration: 4, repeat: Infinity, ease: 'linear' },
                      scale: { duration: 0.6, ease: [...EASE_LUXURY] },
                    }}
                  >
                    <svg viewBox="0 0 240 240" className="w-full h-full">
                      <defs>
                        <linearGradient id="unlockRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="rgba(139,92,246,0.8)" />
                          <stop offset="50%" stopColor="rgba(6,182,212,0.6)" />
                          <stop offset="100%" stopColor="rgba(139,92,246,0.8)" />
                        </linearGradient>
                      </defs>
                      <circle
                        cx="120" cy="120" r="110"
                        fill="none"
                        stroke="url(#unlockRingGrad)"
                        strokeWidth="2"
                        strokeDasharray="12 8"
                        opacity="0.7"
                      />
                      <circle
                        cx="120" cy="120" r="100"
                        fill="none"
                        stroke="rgba(139,92,246,0.15)"
                        strokeWidth="1"
                      />
                    </svg>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pulse rings during glow-build */}
              {showGlowBuild && !showShockwave && (
                <>
                  {[1, 2, 3].map((n) => (
                    <motion.div
                      key={`pulse-${n}`}
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 160,
                        height: 160,
                        top: '50%',
                        left: '50%',
                        border: '1px solid rgba(139,92,246,0.35)',
                      }}
                      initial={{ opacity: 0.7, scale: 0.5, x: '-50%', y: '-50%' }}
                      animate={{ opacity: 0, scale: 2.5 }}
                      transition={{
                        duration: 1.5,
                        delay: n * 0.5,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                    />
                  ))}
                </>
              )}

              {/* Shockwave ripple */}
              <AnimatePresence>
                {showShockwave && (
                  <>
                    <motion.div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 300,
                        height: 300,
                        top: '50%',
                        left: '50%',
                        background: 'radial-gradient(circle, rgba(255,215,0,0.35) 0%, rgba(139,92,246,0.15) 40%, transparent 65%)',
                      }}
                      initial={{ opacity: 0, scale: 0.2, x: '-50%', y: '-50%' }}
                      animate={{ opacity: [0, 1, 0], scale: [0.2, 2.5, 3.5] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 200,
                        height: 200,
                        top: '50%',
                        left: '50%',
                        border: '2px solid rgba(255,215,0,0.4)',
                      }}
                      initial={{ opacity: 0, scale: 0.3, x: '-50%', y: '-50%' }}
                      animate={{ opacity: [0, 0.8, 0], scale: [0.3, 3, 4] }}
                      transition={{ duration: 0.9, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 160,
                        height: 160,
                        top: '50%',
                        left: '50%',
                        background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 50%)',
                      }}
                      initial={{ opacity: 0, scale: 0.1, x: '-50%', y: '-50%' }}
                      animate={{ opacity: [0, 0.9, 0], scale: [0.1, 2.5, 3] }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </>
                )}
              </AnimatePresence>

              {/* Particle burst on unlock */}
              <AnimatePresence>
                {(phase === 'unlock-snap' || phase === 'shockwave') && (
                  <div className="absolute pointer-events-none overflow-visible" style={{ top: '50%', left: '50%', width: 0, height: 0 }}>
                    {particles.map((p) => (
                      <motion.div
                        key={p.id}
                        className="absolute rounded-full"
                        style={{
                          width: p.size,
                          height: p.size,
                          background: `radial-gradient(circle, hsl(${p.hue}, 90%, 75%) 0%, hsl(${p.hue}, 85%, 55%) 100%)`,
                          boxShadow: `0 0 ${p.size * 3}px hsl(${p.hue}, 90%, 65%)`,
                        }}
                        initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                        animate={{
                          x: Math.cos(p.angle) * p.dist,
                          y: Math.sin(p.angle) * p.dist,
                          opacity: [0, 1, 0.6, 0],
                          scale: [0, 1.5, 1, 0],
                        }}
                        transition={{
                          duration: p.dur,
                          delay: p.delay,
                          ease: [...EASE_LUXURY],
                        }}
                      />
                    ))}
                  </div>
                )}
              </AnimatePresence>

              {/* LOCK ICON */}
              <AnimatePresence>
                {showLock && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{
                      opacity: 1,
                      scale: lockUnlocked ? 1.15 : 1,
                    }}
                    exit={{ opacity: 0, scale: 1.5 }}
                    transition={{
                      opacity: { duration: 0.5 },
                      scale: { duration: lockUnlocked ? 0.15 : 0.6, ease: [...EASE_LUXURY] },
                    }}
                  >
                    <motion.div
                      style={{
                        filter: showGlowBuild
                          ? 'drop-shadow(0 0 30px rgba(139,92,246,0.7)) drop-shadow(0 0 60px rgba(139,92,246,0.3))'
                          : 'drop-shadow(0 0 15px rgba(139,92,246,0.4))',
                      }}
                      animate={lockUnlocked ? {
                        x: [0, -4, 4, -3, 3, 0],
                      } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      <svg width="80" height="80" viewBox="0 0 24 24" fill="none">
                        <motion.path
                          d="M6 10V7C6 4.79086 7.79086 3 10 3H14C16.2091 3 18 4.79086 18 7V10"
                          stroke="rgba(168,132,255,0.9)"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          animate={lockUnlocked ? {
                            d: "M6 10V7C6 4.79086 7.79086 3 10 3H14C16.2091 3 18 4.79086 18 7V7",
                            rotate: -35,
                          } : {}}
                          transition={{ duration: 0.25, ease: 'easeOut' }}
                          style={{ originX: '75%', originY: '42%' }}
                        />
                        <rect
                          x="4" y="10" width="16" height="12" rx="2"
                          stroke="rgba(168,132,255,0.9)"
                          strokeWidth="1.8"
                          fill="none"
                        />
                        <motion.circle
                          cx="12" cy="15" r="1.5"
                          fill="rgba(168,132,255,0.9)"
                          animate={lockUnlocked ? {
                            fill: 'rgba(255,215,0,0.9)',
                            scale: 1.3,
                          } : {}}
                          transition={{ duration: 0.2, delay: 0.1 }}
                        />
                        <motion.path
                          d="M12 16.5V18.5"
                          stroke="rgba(168,132,255,0.9)"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          animate={lockUnlocked ? { opacity: 0 } : { opacity: 1 }}
                          transition={{ duration: 0.15 }}
                        />
                      </svg>
                    </motion.div>

                    {/* Metal shimmer sweep on lock */}
                    {showGlowBuild && !lockUnlocked && (
                      <motion.div
                        className="absolute inset-0 overflow-hidden pointer-events-none"
                        style={{ borderRadius: 16 }}
                      >
                        <motion.div
                          className="absolute inset-0"
                          style={{
                            background: 'linear-gradient(100deg, transparent 0%, rgba(255,215,0,0.3) 42%, rgba(255,255,255,0.5) 50%, rgba(255,215,0,0.3) 58%, transparent 100%)',
                            transform: 'skewX(-20deg)',
                          }}
                          animate={{ x: ['-200%', '200%'] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
                        />
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CROWN ICON - appears after shockwave */}
              <AnimatePresence>
                {showCrown && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.3, rotate: -15 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{
                      duration: 0.6,
                      type: 'spring',
                      stiffness: 200,
                      damping: 15,
                    }}
                  >
                    <motion.div
                      animate={{
                        filter: [
                          'drop-shadow(0 0 20px rgba(255,215,0,0.4)) drop-shadow(0 0 40px rgba(139,92,246,0.3))',
                          'drop-shadow(0 0 35px rgba(255,215,0,0.7)) drop-shadow(0 0 60px rgba(139,92,246,0.5))',
                          'drop-shadow(0 0 20px rgba(255,215,0,0.4)) drop-shadow(0 0 40px rgba(139,92,246,0.3))',
                        ],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <svg width="80" height="80" viewBox="0 0 24 24" fill="none">
                        <motion.path
                          d="M2 20h20L19 8l-4.5 5L12 4l-2.5 9L5 8l-3 12z"
                          fill="url(#crownGrad)"
                          stroke="rgba(255,215,0,0.6)"
                          strokeWidth="0.5"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.5 }}
                        />
                        <motion.path
                          d="M2 20h20"
                          stroke="rgba(255,215,0,0.8)"
                          strokeWidth="1"
                          strokeLinecap="round"
                        />
                        <defs>
                          <linearGradient id="crownGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="rgba(255,215,0,0.9)" />
                            <stop offset="50%" stopColor="rgba(255,180,0,0.8)" />
                            <stop offset="100%" stopColor="rgba(255,215,0,0.9)" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </motion.div>

                    {/* Crown shimmer */}
                    <motion.div
                      className="absolute inset-0 overflow-hidden pointer-events-none"
                    >
                      <motion.div
                        className="absolute inset-0"
                        style={{
                          background: 'linear-gradient(100deg, transparent 0%, rgba(255,215,0,0.4) 42%, rgba(255,255,255,0.6) 50%, rgba(255,215,0,0.4) 58%, transparent 100%)',
                          transform: 'skewX(-20deg)',
                        }}
                        initial={{ x: '-200%' }}
                        animate={{ x: '200%' }}
                        transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
                      />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Background glow behind crown */}
              <AnimatePresence>
                {showCrown && (
                  <motion.div
                    className="absolute -z-10 rounded-full"
                    style={{
                      width: 320,
                      height: 320,
                      top: '50%',
                      left: '50%',
                      background: 'radial-gradient(circle, rgba(255,215,0,0.15) 0%, rgba(139,92,246,0.1) 40%, transparent 65%)',
                    }}
                    initial={{ opacity: 0, scale: 0.3, x: '-50%', y: '-50%' }}
                    animate={{ opacity: [0, 0.8, 0.5], scale: [0.3, 1.2, 1] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* STATUS TEXT during glow-build */}
            <AnimatePresence mode="wait">
              {(phase === 'glow-build') && (
                <motion.p
                  key="activating"
                  className="mt-6 text-sm font-medium tracking-[0.15em] uppercase"
                  style={{ color: 'rgba(139,92,246,0.7)' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4, ease: [...EASE_LUXURY] }}
                >
                  Activating Premium
                </motion.p>
              )}
            </AnimatePresence>

            {/* MAIN TEXT - PREMIUM UNLOCKED */}
            <AnimatePresence>
              {(showCrown || phase === 'exiting') && (
                <motion.div
                  className="mt-8 text-center"
                  initial={{ opacity: 0, y: 24, scale: 0.9 }}
                  animate={{ opacity: phase === 'exiting' ? 0.4 : 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.6, ease: [...EASE_LUXURY] }}
                >
                  <motion.h2
                    className="text-2xl md:text-3xl font-bold tracking-tight"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,215,0,1) 0%, rgba(255,255,255,0.95) 40%, rgba(168,85,247,1) 70%, rgba(6,182,212,0.9) 100%)',
                      backgroundSize: '200% 200%',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                    animate={{
                      backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                    }}
                    transition={{ duration: 4, ease: 'linear', repeat: Infinity }}
                  >
                    PREMIUM UNLOCKED
                  </motion.h2>
                  <motion.p
                    className="text-white/50 text-sm mt-1 tracking-wide"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                  >
                    Power. Speed. Control.
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* FEATURES LIST - stagger in */}
            <AnimatePresence>
              {showText && visibleFeatures > 0 && (
                <motion.div
                  className="mt-6 flex flex-col items-center gap-1.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {FEATURES.slice(0, visibleFeatures).map((feat, i) => (
                    <motion.div
                      key={feat}
                      className="flex items-center gap-2 text-sm"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, ease: [...EASE_LUXURY] }}
                    >
                      <motion.div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: i < 3
                            ? 'rgba(255,215,0,0.8)'
                            : i === 3
                            ? 'rgba(6,182,212,0.8)'
                            : 'rgba(168,85,247,0.7)',
                        }}
                      />
                      <span className="text-white/60 font-medium">{feat}</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Skip hint */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/20 text-xs tracking-wide"
            initial={{ opacity: 0 }}
            animate={{ opacity: showText ? 0.4 : 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
            Click anywhere to skip
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
