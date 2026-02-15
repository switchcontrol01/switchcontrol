import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoNoCrown from '@/assets/premium/logo-no-crown.png';
import { useAuthStore } from '@/lib/auth-store';

interface PremiumUpgradeAnimationProps {
  show: boolean;
  onComplete: () => void;
}

type AnimationPhase = 'idle' | 'anticipation' | 'impact' | 'crown-morph' | 'settle' | 'done';

const ANIMATION_SHOWN_KEY = 'sc_premium_animation_shown';

const CUBIC_SNAP = [0.22, 1, 0.36, 1] as const;

export function PremiumUpgradeAnimation({ show, onComplete }: PremiumUpgradeAnimationProps) {
  const [phase, setPhase] = useState<AnimationPhase>('idle');
  const [showCrown, setShowCrown] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      angle: (i / 20) * Math.PI * 2 + (Math.random() - 0.5) * 0.3,
      distance: 70 + Math.random() * 80,
      delay: Math.random() * 0.15,
      duration: 0.6 + Math.random() * 0.4,
      size: 2 + Math.random() * 5,
      hue: 250 + Math.random() * 60,
    })),
  []);

  const skipAnimation = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase('done');
    localStorage.setItem(ANIMATION_SHOWN_KEY, 'true');
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

  const playLockClick = useCallback(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch { /* fail silently */ }
  }, [getAudioCtx]);

  const playUnlockWhoosh = useCallback(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const ctx = getAudioCtx();
      if (!ctx) return;

      const bufferSize = ctx.sampleRate * 0.3;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2000, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.25);
      filter.Q.value = 1.5;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(ctx.currentTime);

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

      playChime(523, 0.05, 0.2, 0.08);
      playChime(659, 0.1, 0.2, 0.09);
      playChime(784, 0.15, 0.25, 0.1);
      playChime(1047, 0.22, 0.4, 0.12);
    } catch { /* fail silently */ }
  }, [getAudioCtx]);

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      setShowCrown(false);
      setShowParticles(false);
      setIsExiting(false);
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    timersRef.current = timers;

    setPhase('anticipation');
    playLockClick();

    timers.push(setTimeout(() => {
      setPhase('impact');
      setShowParticles(true);
      playUnlockWhoosh();
    }, 250));

    timers.push(setTimeout(() => {
      setPhase('crown-morph');
      setShowCrown(true);
    }, 750));

    timers.push(setTimeout(() => {
      setPhase('settle');
    }, 1150));

    timers.push(setTimeout(() => {
      setIsExiting(true);
    }, 1750));

    timers.push(setTimeout(() => {
      setPhase('done');
      localStorage.setItem(ANIMATION_SHOWN_KEY, 'true');
      onComplete();
    }, 2300));

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [show, onComplete, playLockClick, playUnlockWhoosh]);

  if (!show && phase === 'idle') return null;

  const isActive = phase !== 'idle' && phase !== 'done';

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto cursor-pointer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: isExiting ? 0.5 : 0.2 }}
          onClick={skipAnimation}
        >
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/40 text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'settle' ? 0.6 : 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            Click anywhere to skip
          </motion.div>

          <motion.div
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{
              opacity: isExiting ? 0 :
                       phase === 'anticipation' ? 0.96 :
                       phase === 'impact' ? 0.88 :
                       0.9
            }}
            transition={{ duration: isExiting ? 0.5 : 0.2 }}
          />

          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.7) 100%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: isExiting ? 0 : 1 }}
            transition={{ duration: 0.3 }}
          />

          <AnimatePresence>
            {phase === 'impact' && (
              <motion.div
                className="absolute w-80 h-80 rounded-full pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(139,92,246,0.5) 0%, rgba(139,92,246,0.15) 40%, transparent 65%)',
                }}
                initial={{ opacity: 0, scale: 0.2 }}
                animate={{ opacity: [0, 1, 0.3], scale: [0.2, 1.8, 2.2] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase === 'impact' && (
              <motion.div
                className="absolute w-[500px] h-[500px] rounded-full pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 50%)',
                }}
                initial={{ opacity: 0, scale: 0.1 }}
                animate={{ opacity: [0, 0.8, 0], scale: [0.1, 2, 2.5] }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>

          <motion.div
            className="relative flex flex-col items-center"
            animate={{
              scale: isExiting ? 0.15 : 1,
              y: isExiting ? -280 : 0,
              x: isExiting ? -420 : 0,
            }}
            transition={{
              duration: isExiting ? 0.55 : 0.3,
              ease: [...CUBIC_SNAP],
            }}
          >
            <AnimatePresence>
              {(phase === 'anticipation') && (
                <motion.div
                  className="absolute -top-24"
                  initial={{ opacity: 0, scale: 0.7, y: 16 }}
                  animate={{
                    opacity: 1,
                    scale: [1, 0.96, 0.96],
                    x: [0, -2, 2, -2, 2, -1, 1, 0],
                  }}
                  exit={{ opacity: 0, scale: 0.5, y: -30 }}
                  transition={{
                    duration: 0.25,
                    x: { duration: 0.25, ease: 'linear' },
                    scale: { duration: 0.25 },
                  }}
                >
                  <LockIconSVG glowing />
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
                        opacity: [0, 1, 0.8, 0],
                        scale: [0, 1.5, 1, 0.3],
                      }}
                      transition={{
                        duration: p.duration,
                        delay: p.delay,
                        ease: [...CUBIC_SNAP],
                      }}
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>

            <motion.div
              className="relative w-48 h-48 flex items-center justify-center"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{
                scale: phase === 'anticipation' ? 0.96 :
                       phase === 'impact' ? 1.12 :
                       phase === 'crown-morph' ? 1.05 :
                       phase === 'settle' ? 1 : 1,
                opacity: 1,
              }}
              transition={{
                duration: phase === 'impact' ? 0.15 : 0.4,
                ease: [...CUBIC_SNAP],
              }}
            >
              <motion.img
                src={logoNoCrown}
                alt=""
                className="absolute w-40 h-40 object-contain"
                initial={{ opacity: 1 }}
                animate={{
                  opacity: 1,
                  filter: phase === 'anticipation' ? 'brightness(1.3) drop-shadow(0 0 20px rgba(139,92,246,0.6))' :
                          phase === 'impact' ? 'brightness(1.8) drop-shadow(0 0 40px rgba(139,92,246,0.9))' :
                          'brightness(1) drop-shadow(0 0 15px rgba(139,92,246,0.4))',
                }}
                transition={{ duration: 0.3 }}
              />

              <AnimatePresence>
                {showCrown && (
                  <motion.div
                    className="absolute -top-3"
                    initial={{ opacity: 0, y: -20, scale: 0.5 }}
                    animate={{ opacity: 1, y: -8, scale: 1 }}
                    transition={{
                      duration: 0.4,
                      ease: [...CUBIC_SNAP],
                      y: { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] },
                    }}
                  >
                    <CrownSVG />
                  </motion.div>
                )}
              </AnimatePresence>

              {showCrown && !isExiting && (
                <motion.div
                  className="absolute inset-0 pointer-events-none overflow-hidden rounded-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.9, 0] }}
                  transition={{ duration: 0.7, delay: 0.15 }}
                >
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
                      transform: 'skewX(-20deg)',
                    }}
                    initial={{ x: '-200%' }}
                    animate={{ x: '200%' }}
                    transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
                  />
                </motion.div>
              )}
            </motion.div>

            <motion.div
              className="absolute -z-10 w-96 h-96 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(139,92,246,0.45) 0%, rgba(168,85,247,0.15) 40%, transparent 65%)',
              }}
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{
                opacity: (phase === 'crown-morph' || phase === 'settle') && !isExiting ? [0, 1, 0.6] : 0,
                scale: (phase === 'crown-morph' || phase === 'settle') && !isExiting ? [0.3, 1.2, 1] : 0.3,
              }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />

            <AnimatePresence>
              {(phase === 'settle' || phase === 'crown-morph') && !isExiting && (
                <motion.div
                  className="mt-8"
                  initial={{ opacity: 0, y: 20, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: [...CUBIC_SNAP] }}
                >
                  <motion.span
                    className="text-2xl font-bold bg-gradient-to-r from-purple-300 via-white to-purple-300 bg-clip-text text-transparent drop-shadow-lg"
                    animate={{
                      backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                    }}
                    transition={{
                      duration: 2,
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CrownSVG() {
  return (
    <svg width="48" height="36" viewBox="0 0 48 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="crownGrad" x1="0" y1="0" x2="48" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <filter id="crownGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#crownGlow)">
        <path
          d="M4 28L8 12L16 20L24 6L32 20L40 12L44 28H4Z"
          fill="url(#crownGrad)"
          stroke="#fbbf24"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="12" r="2.5" fill="#fbbf24" />
        <circle cx="24" cy="6" r="3" fill="#fbbf24" />
        <circle cx="40" cy="12" r="2.5" fill="#fbbf24" />
        <rect x="4" y="28" width="40" height="4" rx="1" fill="url(#crownGrad)" />
      </g>
    </svg>
  );
}

function LockIconSVG({ glowing }: { glowing?: boolean }) {
  return (
    <motion.svg
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white/90"
      style={{
        filter: glowing ? 'drop-shadow(0 0 12px rgba(139,92,246,0.7))' : 'drop-shadow(0 0 6px rgba(255,255,255,0.3))',
      }}
    >
      <path
        d="M6 10V7C6 4.79086 7.79086 3 10 3H14C16.2091 3 18 4.79086 18 7V10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="4"
        y="10"
        width="16"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <circle cx="12" cy="15" r="1.5" fill="rgba(255,255,255,0.9)" />
      <path
        d="M12 16.5V18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

export function shouldShowPremiumAnimation(): boolean {
  const user = useAuthStore.getState().user;
  const hasSeenServer = user?.hasSeenPremiumUnlock === true;
  const alreadyShownLocal = localStorage.getItem(ANIMATION_SHOWN_KEY) === 'true';
  const shouldShow = !hasSeenServer && !alreadyShownLocal;
  return shouldShow;
}

export function resetPremiumAnimationFlag(): void {
  localStorage.removeItem(ANIMATION_SHOWN_KEY);
}
