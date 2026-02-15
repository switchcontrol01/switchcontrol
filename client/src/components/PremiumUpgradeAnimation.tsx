import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoNoCrown from '@/assets/premium/logo-no-crown.png';
import logoWithCrown from '@/assets/premium/logo-with-crown.png';
import { useAuthStore } from '@/lib/auth-store';

interface PremiumUpgradeAnimationProps {
  show: boolean;
  onComplete: () => void;
}

type AnimationPhase = 'idle' | 'suspense' | 'impact' | 'crown-morph' | 'settle' | 'done';

const ANIMATION_SHOWN_KEY = 'sc_premium_animation_shown';
const LUXURY_EASE = [0.22, 1, 0.36, 1] as const;

export function PremiumUpgradeAnimation({ show, onComplete }: PremiumUpgradeAnimationProps) {
  const [phase, setPhase] = useState<AnimationPhase>('idle');
  const [lockUnlocked, setLockUnlocked] = useState(false);
  const [showCrownLogo, setShowCrownLogo] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [showShine, setShowShine] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const particleCount = isMobile ? 8 : 16;

  const particles = useMemo(() =>
    Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      angle: (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
      distance: 60 + Math.random() * 90,
      delay: Math.random() * 0.12,
      duration: 0.5 + Math.random() * 0.4,
      size: 2 + Math.random() * 4,
      hue: 250 + Math.random() * 50,
    })),
  [particleCount]);

  const skipAnimation = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase('done');
    onComplete();
  }, [onComplete]);

  const getAudioCtx = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch { /* audio unavailable */ }
    }
    return audioContextRef.current;
  }, []);

  const playRiser = useCallback(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const ctx = getAudioCtx();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.65);

      const noise = ctx.createOscillator();
      const ng = ctx.createGain();
      noise.connect(ng);
      ng.connect(ctx.destination);
      noise.type = 'sawtooth';
      noise.frequency.setValueAtTime(60, ctx.currentTime);
      noise.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.6);
      ng.gain.setValueAtTime(0.06, ctx.currentTime);
      ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      noise.start(ctx.currentTime);
      noise.stop(ctx.currentTime + 0.6);
    } catch { /* fail silently */ }
  }, [getAudioCtx]);

  const playUnlockSound = useCallback(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const ctx = getAudioCtx();
      if (!ctx) return;

      const bufferSize = Math.floor(ctx.sampleRate * 0.3);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.8);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2200, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(350, ctx.currentTime + 0.25);
      filter.Q.value = 1.2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(ctx.currentTime);

      const click = ctx.createOscillator();
      const cg = ctx.createGain();
      click.connect(cg);
      cg.connect(ctx.destination);
      click.type = 'square';
      click.frequency.setValueAtTime(1200, ctx.currentTime);
      click.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.04);
      cg.gain.setValueAtTime(0.2, ctx.currentTime);
      cg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      click.start(ctx.currentTime);
      click.stop(ctx.currentTime + 0.06);

      const playChime = (freq: number, delay: number, dur: number, vol: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        g.gain.setValueAtTime(0, ctx.currentTime + delay);
        g.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        o.start(ctx.currentTime + delay);
        o.stop(ctx.currentTime + delay + dur);
      };
      playChime(523, 0.04, 0.2, 0.1);
      playChime(659, 0.09, 0.2, 0.11);
      playChime(784, 0.14, 0.25, 0.12);
      playChime(1047, 0.2, 0.4, 0.14);
    } catch { /* fail silently */ }
  }, [getAudioCtx]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouseRef.current = {
        x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
        y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
      };
    };
    if (show && !isMobile) {
      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
    }
  }, [show, isMobile]);

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      setLockUnlocked(false);
      setShowCrownLogo(false);
      setShowParticles(false);
      setShowShine(false);
      setIsExiting(false);
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    timersRef.current = timers;

    setPhase('suspense');
    timers.push(setTimeout(() => playRiser(), 50));

    timers.push(setTimeout(() => {
      setPhase('impact');
      setLockUnlocked(true);
      setShowParticles(true);
      playUnlockSound();
    }, 250));

    timers.push(setTimeout(() => {
      setPhase('crown-morph');
      setShowCrownLogo(true);
      setShowShine(true);
    }, 800));

    timers.push(setTimeout(() => {
      setShowShine(false);
    }, 1250));

    timers.push(setTimeout(() => {
      setPhase('settle');
    }, 1250));

    timers.push(setTimeout(() => {
      setIsExiting(true);
    }, 1850));

    timers.push(setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 2400));

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [show, onComplete, playRiser, playUnlockSound]);

  if (!show && phase === 'idle') return null;
  const isActive = phase !== 'idle' && phase !== 'done';

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          ref={containerRef}
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto cursor-pointer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: isExiting ? 0.55 : 0.15 }}
          onClick={skipAnimation}
        >
          <motion.div
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{
              opacity: isExiting ? 0 :
                       phase === 'suspense' ? 0.96 :
                       phase === 'impact' ? 0.85 :
                       0.92
            }}
            transition={{ duration: isExiting ? 0.55 : 0.2 }}
          />

          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.8) 100%)',
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: isExiting ? 0 :
                       phase === 'suspense' ? 0.6 :
                       phase === 'impact' ? 0.9 :
                       phase === 'crown-morph' ? 0.7 :
                       0.5
            }}
            transition={{ duration: 0.4 }}
          />

          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 30% 20%, rgba(139,92,246,0.08) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(6,182,212,0.06) 0%, transparent 50%)',
            }}
            animate={{
              backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
            }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          />

          <AnimatePresence>
            {phase === 'impact' && (
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: isMobile ? 250 : 400,
                  height: isMobile ? 250 : 400,
                  background: 'radial-gradient(circle, rgba(139,92,246,0.5) 0%, rgba(139,92,246,0.15) 40%, transparent 65%)',
                }}
                initial={{ opacity: 0, scale: 0.15 }}
                animate={{ opacity: [0, 1, 0.2], scale: [0.15, 1.8, 2.4] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase === 'impact' && (
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: isMobile ? 150 : 250,
                  height: isMobile ? 150 : 250,
                  background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 50%)',
                }}
                initial={{ opacity: 0, scale: 0.1 }}
                animate={{ opacity: [0, 0.9, 0], scale: [0.1, 2.2, 2.8] }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>

          <motion.div
            className="relative flex flex-col items-center"
            animate={{
              scale: isExiting ? 0.12 : 1,
              y: isExiting ? -300 : 0,
              x: isExiting ? -420 : 0,
            }}
            transition={{
              duration: isExiting ? 0.55 : 0.3,
              ease: [...LUXURY_EASE],
            }}
          >
            <AnimatePresence mode="wait">
              {!lockUnlocked && phase === 'suspense' && (
                <motion.div
                  key="lock"
                  className="absolute -top-20"
                  initial={{ opacity: 0, scale: 0.8, y: 10 }}
                  animate={{
                    opacity: 1,
                    scale: 0.96,
                    x: [0, -2, 2, -1.5, 1.5, -1, 1, 0],
                  }}
                  exit={{ opacity: 0, scale: 1.1, y: -20 }}
                  transition={{
                    duration: 0.25,
                    x: { duration: 0.25, ease: 'linear' },
                    scale: { duration: 0.2, ease: [...LUXURY_EASE] },
                  }}
                >
                  <LockIcon glowing />
                </motion.div>
              )}
              {lockUnlocked && (phase === 'impact') && (
                <motion.div
                  key="unlock"
                  className="absolute -top-20"
                  initial={{ opacity: 0, scale: 1.3, rotate: -8 }}
                  animate={{
                    opacity: [0, 1, 1],
                    scale: [1.3, 1.1, 1.05],
                    rotate: [- 8, 4, 0],
                  }}
                  exit={{ opacity: 0, scale: 0.8, y: -30 }}
                  transition={{
                    duration: 0.45,
                    ease: [...LUXURY_EASE],
                  }}
                >
                  <UnlockIcon />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showParticles && !isExiting && (
                <div className="absolute inset-0 pointer-events-none overflow-visible">
                  {particles.map((p) => (
                    <motion.div
                      key={p.id}
                      className="absolute left-1/2 top-1/2 rounded-full"
                      style={{
                        width: p.size,
                        height: p.size,
                        background: `radial-gradient(circle, hsl(${p.hue}, 90%, 75%) 0%, hsl(${p.hue}, 85%, 55%) 100%)`,
                        boxShadow: `0 0 ${p.size * 3}px hsl(${p.hue}, 90%, 65%)`,
                      }}
                      initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                      animate={{
                        x: Math.cos(p.angle) * p.distance,
                        y: Math.sin(p.angle) * p.distance,
                        opacity: [0, 1, 0.7, 0],
                        scale: [0, 1.5, 1, 0],
                      }}
                      transition={{
                        duration: p.duration,
                        delay: p.delay,
                        ease: [...LUXURY_EASE],
                      }}
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>

            <motion.div
              className="relative w-48 h-48 flex items-center justify-center"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{
                scale: phase === 'suspense' ? 0.96 :
                       phase === 'impact' ? 1.1 :
                       phase === 'crown-morph' ? 1.04 :
                       phase === 'settle' ? 1 : 1,
                opacity: 1,
              }}
              transition={{
                duration: phase === 'impact' ? 0.12 : 0.4,
                ease: [...LUXURY_EASE],
              }}
            >
              <motion.img
                src={logoNoCrown}
                alt=""
                className="absolute w-40 h-40 object-contain"
                animate={{
                  opacity: showCrownLogo ? 0 : 1,
                  filter: phase === 'suspense' ? 'brightness(1.3) drop-shadow(0 0 20px rgba(139,92,246,0.5))' :
                          phase === 'impact' ? 'brightness(1.8) drop-shadow(0 0 40px rgba(139,92,246,0.8))' :
                          'brightness(1) drop-shadow(0 0 12px rgba(139,92,246,0.3))',
                }}
                transition={{
                  opacity: { duration: 0.35, ease: [...LUXURY_EASE] },
                  filter: { duration: 0.3 },
                }}
              />

              <motion.img
                src={logoWithCrown}
                alt=""
                className="absolute w-40 h-40 object-contain"
                initial={{ opacity: 0, y: -10 }}
                animate={{
                  opacity: showCrownLogo ? 1 : 0,
                  y: showCrownLogo ? 0 : -10,
                  filter: showCrownLogo
                    ? 'brightness(1.15) drop-shadow(0 0 25px rgba(139,92,246,0.6))'
                    : 'brightness(1)',
                }}
                transition={{
                  duration: 0.45,
                  ease: [...LUXURY_EASE],
                  y: { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] },
                }}
              />

              {showShine && !isExiting && (
                <motion.div
                  className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.85, 0] }}
                  transition={{ duration: 0.6 }}
                >
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.45) 45%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.45) 55%, transparent 100%)',
                      transform: 'skewX(-20deg)',
                    }}
                    initial={{ x: '-200%' }}
                    animate={{ x: '200%' }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                  />
                </motion.div>
              )}
            </motion.div>

            <motion.div
              className="absolute -z-10 rounded-full"
              style={{
                width: isMobile ? 280 : 380,
                height: isMobile ? 280 : 380,
                background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, rgba(168,85,247,0.12) 40%, transparent 65%)',
              }}
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{
                opacity: (phase === 'crown-morph' || phase === 'settle') && !isExiting ? [0, 0.9, 0.5] : 0,
                scale: (phase === 'crown-morph' || phase === 'settle') && !isExiting ? [0.3, 1.15, 1] : 0.3,
              }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />

            <AnimatePresence>
              {(phase === 'settle' || phase === 'crown-morph') && !isExiting && (
                <motion.div
                  className="mt-6"
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.35, ease: [...LUXURY_EASE] }}
                >
                  <motion.span
                    className="text-2xl font-bold bg-gradient-to-r from-purple-300 via-white to-purple-300 bg-clip-text text-transparent drop-shadow-lg"
                    animate={{
                      backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                    }}
                    transition={{
                      duration: 2.5,
                      ease: 'linear',
                      repeat: Infinity,
                    }}
                    style={{ backgroundSize: '200% 100%' }}
                  >
                    Premium Unlocked
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'settle' ? 0.5 : 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            Click anywhere to skip
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LockIcon({ glowing }: { glowing?: boolean }) {
  return (
    <svg
      width="52"
      height="52"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white/90"
      style={{
        filter: glowing
          ? 'drop-shadow(0 0 14px rgba(139,92,246,0.7)) drop-shadow(0 0 4px rgba(255,255,255,0.3))'
          : 'drop-shadow(0 0 6px rgba(255,255,255,0.2))',
      }}
    >
      <path
        d="M6 10V7C6 4.79086 7.79086 3 10 3H14C16.2091 3 18 4.79086 18 7V10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="4" y="10" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="15" r="1.5" fill="rgba(255,255,255,0.9)" />
      <path d="M12 16.5V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg
      width="52"
      height="52"
      viewBox="0 0 24 24"
      fill="none"
      className="text-emerald-400"
      style={{
        filter: 'drop-shadow(0 0 16px rgba(52,211,153,0.6)) drop-shadow(0 0 4px rgba(255,255,255,0.3))',
      }}
    >
      <path
        d="M7 10V7C7 4.79086 8.79086 3 11 3H13C15.2091 3 17 4.79086 17 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="4" y="10" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="15" r="1.5" fill="rgba(255,255,255,0.9)" />
      <path d="M12 16.5V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function shouldShowPremiumAnimation(): boolean {
  const user = useAuthStore.getState().user;
  const hasSeenServer = user?.hasSeenPremiumUnlock === true;
  const alreadyShownLocal = localStorage.getItem(ANIMATION_SHOWN_KEY) === 'true';
  return !hasSeenServer && !alreadyShownLocal;
}

export function resetPremiumAnimationFlag(): void {
  localStorage.removeItem(ANIMATION_SHOWN_KEY);
}
