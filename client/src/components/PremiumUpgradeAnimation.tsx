import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import scLogo from '@/assets/premium/sc-logo.png';
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
  | 'dark-activation'
  | 'energy-build'
  | 'premium-surge'
  | 'confirmation'
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
  const [statusText, setStatusText] = useState('');
  const [pulseCount, setPulseCount] = useState(0);
  const [visibleFeatures, setVisibleFeatures] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef = useRef<{ stop: () => void } | null>(null);
  const risingRef = useRef<{ stop: () => void } | null>(null);

  const prefersReduced = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  []);

  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      angle: (i / 20) * Math.PI * 2 + (Math.random() - 0.5) * 0.3,
      dist: 70 + Math.random() * 100,
      delay: Math.random() * 0.15,
      dur: 0.4 + Math.random() * 0.3,
      size: 2 + Math.random() * 3,
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
      setStatusText('');
      setPulseCount(0);
      setVisibleFeatures(0);
      return;
    }

    if (prefersReduced) {
      setPhase('confirmation');
      setStatusText('');
      setVisibleFeatures(FEATURES.length);
      const t = setTimeout(() => {
        setPhase('done');
        onComplete();
      }, 2000);
      timersRef.current = [t];
      return () => clearTimeout(t);
    }

    const t: ReturnType<typeof setTimeout>[] = [];
    timersRef.current = t;

    setPhase('dark-activation');
    t.push(setTimeout(() => {
      audioRef.current = playCinematicHum(1.4);
    }, 150));

    t.push(setTimeout(() => {
      setPhase('energy-build');
      setStatusText('Activating Premium');
      risingRef.current = playRisingTone(2.0);
    }, 1400));

    t.push(setTimeout(() => { playPulseTick(); setPulseCount(1); }, 1800));
    t.push(setTimeout(() => { playPulseTick(); setPulseCount(2); }, 2250));
    t.push(setTimeout(() => { setStatusText('Finalizing Upgrade'); }, 2400));
    t.push(setTimeout(() => { playPulseTick(); setPulseCount(3); }, 2700));

    t.push(setTimeout(() => {
      setPhase('premium-surge');
      setStatusText('');
      risingRef.current?.stop();
      playMetallicSnap();
    }, 3500));

    t.push(setTimeout(() => {
      playPremiumChime();
    }, 3700));

    t.push(setTimeout(() => {
      setPhase('confirmation');
    }, 4500));

    FEATURES.forEach((_, i) => {
      t.push(setTimeout(() => setVisibleFeatures(i + 1), 4800 + i * 150));
    });

    t.push(setTimeout(() => {
      setPhase('exiting');
    }, 6000));

    t.push(setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 6500));

    return () => {
      t.forEach(clearTimeout);
      audioRef.current?.stop();
      risingRef.current?.stop();
    };
  }, [show, onComplete, prefersReduced]);

  if (!show && phase === 'idle') return null;
  const isActive = phase !== 'idle' && phase !== 'done';

  const logoGlow =
    phase === 'dark-activation' ? 'drop-shadow(0 0 15px rgba(139,92,246,0.3))' :
    phase === 'energy-build' ? 'drop-shadow(0 0 30px rgba(139,92,246,0.6)) brightness(1.15)' :
    phase === 'premium-surge' ? 'drop-shadow(0 0 50px rgba(139,92,246,0.9)) drop-shadow(0 0 20px rgba(255,215,0,0.5)) brightness(1.4)' :
    'drop-shadow(0 0 25px rgba(139,92,246,0.5)) brightness(1.1)';

  const logoScale =
    phase === 'dark-activation' ? 0.92 :
    phase === 'energy-build' ? 1.0 :
    phase === 'premium-surge' ? 1.12 :
    phase === 'confirmation' ? 1.0 :
    phase === 'exiting' ? 0.9 : 1;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto cursor-pointer select-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'exiting' ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: phase === 'exiting' ? 0.5 : 0.3 }}
          onClick={skip}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(10,5,20,0.95) 0%, rgba(0,0,0,0.98) 100%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          />

          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 30% 20%, rgba(139,92,246,0.06) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(6,182,212,0.04) 0%, transparent 50%)',
            }}
          />

          <div className="relative flex flex-col items-center">
            <div className="relative">
              <AnimatePresence>
                {(phase === 'energy-build' || phase === 'dark-activation') && (
                  <motion.div
                    className="absolute inset-0 m-auto rounded-full pointer-events-none"
                    style={{
                      width: 220,
                      height: 220,
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                    }}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{
                      opacity: phase === 'energy-build' ? [0.3, 0.6, 0.3] : 0.15,
                      scale: phase === 'energy-build' ? 1 : 0.8,
                      rotate: phase === 'energy-build' ? 360 : 0,
                    }}
                    exit={{ opacity: 0, scale: 1.5 }}
                    transition={{
                      opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
                      rotate: { duration: 4, repeat: Infinity, ease: 'linear' },
                      scale: { duration: 0.6, ease: [...EASE_LUXURY] },
                    }}
                  >
                    <svg viewBox="0 0 220 220" className="w-full h-full">
                      <defs>
                        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="rgba(139,92,246,0.8)" />
                          <stop offset="50%" stopColor="rgba(6,182,212,0.6)" />
                          <stop offset="100%" stopColor="rgba(139,92,246,0.8)" />
                        </linearGradient>
                      </defs>
                      <circle
                        cx="110" cy="110" r="100"
                        fill="none"
                        stroke="url(#ringGrad)"
                        strokeWidth="2"
                        strokeDasharray="12 8"
                        opacity="0.7"
                      />
                      <circle
                        cx="110" cy="110" r="90"
                        fill="none"
                        stroke="rgba(139,92,246,0.2)"
                        strokeWidth="1"
                      />
                    </svg>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {phase === 'premium-surge' && (
                  <>
                    <motion.div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 300,
                        height: 300,
                        top: '50%',
                        left: '50%',
                        background: 'radial-gradient(circle, rgba(255,215,0,0.4) 0%, rgba(139,92,246,0.2) 40%, transparent 65%)',
                      }}
                      initial={{ opacity: 0, scale: 0.2, x: '-50%', y: '-50%' }}
                      animate={{ opacity: [0, 1, 0.3], scale: [0.2, 1.8, 2.2] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 180,
                        height: 180,
                        top: '50%',
                        left: '50%',
                        background: 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 50%)',
                      }}
                      initial={{ opacity: 0, scale: 0.1, x: '-50%', y: '-50%' }}
                      animate={{ opacity: [0, 0.9, 0], scale: [0.1, 2, 2.5] }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                    />
                  </>
                )}
              </AnimatePresence>

              {[1, 2, 3].map((n) => (
                <AnimatePresence key={n}>
                  {pulseCount >= n && phase === 'energy-build' && (
                    <motion.div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 160,
                        height: 160,
                        top: '50%',
                        left: '50%',
                        border: '1px solid rgba(139,92,246,0.4)',
                      }}
                      initial={{ opacity: 0.8, scale: 0.5, x: '-50%', y: '-50%' }}
                      animate={{ opacity: 0, scale: 2 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  )}
                </AnimatePresence>
              ))}

              <AnimatePresence>
                {phase === 'premium-surge' && (
                  <div className="absolute inset-0 pointer-events-none overflow-visible" style={{ top: '50%', left: '50%', width: 0, height: 0 }}>
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

              <motion.div
                className="relative"
                animate={{
                  scale: logoScale,
                  filter: logoGlow,
                }}
                transition={{
                  scale: { duration: phase === 'premium-surge' ? 0.15 : 0.6, ease: [...EASE_LUXURY] },
                  filter: { duration: 0.4 },
                }}
              >
                <motion.img
                  src={scLogo}
                  alt="SwitchControl"
                  className="w-40 h-40 object-contain rounded-2xl"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: [...EASE_LUXURY] }}
                />

                <AnimatePresence>
                  {phase === 'premium-surge' && (
                    <motion.div
                      className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.9, 0] }}
                      transition={{ duration: 0.55 }}
                    >
                      <motion.div
                        className="absolute inset-0"
                        style={{
                          background: 'linear-gradient(100deg, transparent 0%, rgba(255,215,0,0.5) 42%, rgba(255,255,255,0.7) 50%, rgba(255,215,0,0.5) 58%, transparent 100%)',
                          transform: 'skewX(-20deg)',
                        }}
                        initial={{ x: '-200%' }}
                        animate={{ x: '200%' }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              <AnimatePresence>
                {(phase === 'confirmation' || phase === 'exiting') && (
                  <motion.div
                    className="absolute -z-10 rounded-full"
                    style={{
                      width: 280,
                      height: 280,
                      top: '50%',
                      left: '50%',
                      background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(168,85,247,0.08) 45%, transparent 65%)',
                    }}
                    initial={{ opacity: 0, scale: 0.4, x: '-50%', y: '-50%' }}
                    animate={{ opacity: [0, 0.7, 0.4], scale: [0.4, 1.1, 1] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              {statusText && phase === 'energy-build' && (
                <motion.p
                  key={statusText}
                  className="mt-6 text-sm font-medium tracking-[0.15em] uppercase"
                  style={{ color: 'rgba(139,92,246,0.7)' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4, ease: [...EASE_LUXURY] }}
                >
                  {statusText}
                </motion.p>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {(phase === 'premium-surge' || phase === 'confirmation' || phase === 'exiting') && (
                <motion.div
                  className="mt-8 text-center"
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: phase === 'exiting' ? 0.5 : 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, ease: [...EASE_LUXURY] }}
                >
                  <motion.h2
                    className="text-2xl md:text-3xl font-bold tracking-tight"
                    style={{
                      background: 'linear-gradient(135deg, rgba(168,85,247,1) 0%, rgba(255,255,255,0.95) 50%, rgba(6,182,212,0.9) 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                    animate={{
                      backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                    }}
                    transition={{ duration: 3, ease: 'linear', repeat: Infinity }}
                  >
                    PREMIUM UNLOCKED
                  </motion.h2>
                  <motion.p
                    className="text-white/50 text-sm mt-1 tracking-wide"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                  >
                    Power. Speed. Control.
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {phase === 'confirmation' && visibleFeatures > 0 && (
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
                            ? 'rgba(139,92,246,0.8)'
                            : i === 3
                            ? 'rgba(6,182,212,0.8)'
                            : 'rgba(168,85,247,0.6)',
                        }}
                      />
                      <span className="text-white/60 font-medium">{feat}</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/20 text-xs tracking-wide"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'confirmation' ? 0.4 : 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
            Click anywhere to skip
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
