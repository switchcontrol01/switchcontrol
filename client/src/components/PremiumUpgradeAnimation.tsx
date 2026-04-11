import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from '@/lib/motionTokens';
import { UPGRADE_TIMING, PREMIUM_EASE } from '@/lib/premiumMotionTokens';
import logoImg from '@/assets/logo.webp';

// ── Easing presets ─────────────────────────────────────────────────────────────
const EXPO_OUT   = [0.16, 1, 0.3, 1]  as const; // easeOutExpo — for rings/energy
const CUBIC_IO   = [0.65, 0, 0.35, 1] as const; // easeInOutCubic — for smooth blooms
const SPRING_LUX = [0.22, 1, 0.36, 1] as const; // luxury spring — for text/logo

interface PremiumUpgradeAnimationProps {
  show: boolean;
  onComplete: () => void;
}

type Phase =
  | 'idle'
  | 'detecting'   // 0 → 600ms  — backdrop dims, ambient glow, status text
  | 'activating'  // 600 → 1600ms — rings expand, particles, logo scales
  | 'completing'  // 1600 → 3300ms — glow pulse, text reveals
  | 'holding'     // 3300 → 4100ms — everything visible, subtle breathe
  | 'exiting'     // 4100 → 4800ms — full fade-out
  | 'done';

// ── Stable random seeds for particles ─────────────────────────────────────────
const STREAK_COUNT = 16;
const streaks = Array.from({ length: STREAK_COUNT }, (_, i) => {
  const base = (i / STREAK_COUNT) * Math.PI * 2;
  const jitter = (i % 3 - 1) * 0.18;
  return {
    id: i,
    angle: base + jitter,
    dist: 110 + (i % 5) * 24,
    delay: (i % 4) * 0.06,
    dur: 0.55 + (i % 3) * 0.12,
    len: 10 + (i % 4) * 6,
    w: 1.2 + (i % 2) * 0.8,
    hue: 258 + (i % 6) * 10,
  };
});

export function PremiumUpgradeAnimation({ show, onComplete }: PremiumUpgradeAnimationProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const prefersReduced = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  []);

  const skip = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase('done');
    console.log('[PremiumAnimation] Skipped by user');
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      return;
    }

    console.log('[PremiumAnimation] Starting — prefersReduced:', prefersReduced);

    if (prefersReduced) {
      setPhase('completing');
      const t = setTimeout(() => {
        setPhase('done');
        onCompleteRef.current();
      }, UPGRADE_TIMING.reducedDoneMs);
      timersRef.current = [t];
      return () => clearTimeout(t);
    }

    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timersRef.current.push(t);
    };

    timersRef.current = [];
    setPhase('detecting');

    schedule(() => setPhase('activating'),  UPGRADE_TIMING.activatingMs);
    schedule(() => setPhase('completing'),  UPGRADE_TIMING.completingMs);
    schedule(() => setPhase('holding'),     UPGRADE_TIMING.holdingMs);
    schedule(() => setPhase('exiting'),     UPGRADE_TIMING.exitingMs);
    schedule(() => {
      setPhase('done');
      console.log('[PremiumAnimation] Complete');
      onCompleteRef.current();
    }, UPGRADE_TIMING.doneMs);

    return () => timersRef.current.forEach(clearTimeout);
  }, [show, prefersReduced]);

  if (!show && phase === 'idle') return null;

  const PHASES: Phase[] = ['idle','detecting','activating','completing','holding','exiting','done'];
  const pi = PHASES.indexOf(phase);

  const isDetecting  = pi >= 1;
  const isActivating = pi >= 2;
  const isCompleting = pi >= 3;
  const isHolding    = pi >= 4;
  const isExiting    = pi >= 5;

  const overlayOpacity = isExiting ? 0 : 1;

  return (
    <AnimatePresence>
      {phase !== 'idle' && phase !== 'done' && (
        <motion.div
          key="upgrade-overlay"
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden"
          style={{ pointerEvents: 'auto' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: overlayOpacity }}
          exit={{ opacity: 0 }}
          transition={{ duration: isExiting ? 0.7 : 0.45, ease: CUBIC_IO }}
          onClick={skip}
          data-testid="premium-upgrade-animation"
        >

          {/* ── Layer 1: Deep backdrop ────────────────────────────────────── */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at 50% 45%, #0d071e 0%, #060410 55%, #000000 100%)' }}
          />

          {/* ── Layer 2: Breathing ambient gradient ──────────────────────── */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{
              opacity: isActivating ? (isExiting ? 0 : [0.55, 0.85, 0.55]) : 0.3,
            }}
            transition={isActivating
              ? { opacity: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' } }
              : { duration: 1.2, ease: CUBIC_IO }
            }
            style={{
              background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(120,60,255,0.14) 0%, rgba(80,30,200,0.07) 50%, transparent 80%)',
            }}
          />

          {/* ── Layer 3: Top-edge sweep on activation ─────────────────────── */}
          {isActivating && (
            <motion.div
              className="absolute inset-x-0 top-0 pointer-events-none"
              style={{ height: '40%', background: 'linear-gradient(to bottom, rgba(120,60,255,0.06) 0%, transparent 100%)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: isExiting ? 0 : 0.7 }}
              transition={{ duration: 0.8, ease: EXPO_OUT }}
            />
          )}

          {/* ── Stage: centered canvas ───────────────────────────────────── */}
          <div className="relative flex flex-col items-center" style={{ zIndex: 2 }}>

            {/* Rings + logo container */}
            <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>

              {/* ── Slow ambient orbit ring (detecting+) ─────────────────── */}
              {isDetecting && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  initial={{ opacity: 0, rotate: 0 }}
                  animate={{ opacity: isExiting ? 0 : 0.35, rotate: 360 }}
                  transition={{
                    opacity: { duration: 1.0, ease: CUBIC_IO },
                    rotate: { duration: 18, repeat: Infinity, ease: 'linear' },
                  }}
                >
                  <svg viewBox="0 0 280 280" className="w-full h-full">
                    <defs>
                      <linearGradient id="ambientRing" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%"   stopColor="rgba(139,92,246,0.0)" />
                        <stop offset="35%"  stopColor="rgba(139,92,246,0.5)" />
                        <stop offset="65%"  stopColor="rgba(168,85,247,0.5)" />
                        <stop offset="100%" stopColor="rgba(139,92,246,0.0)" />
                      </linearGradient>
                    </defs>
                    <circle cx="140" cy="140" r="128" fill="none" stroke="url(#ambientRing)" strokeWidth="1" strokeDasharray="6 14" />
                  </svg>
                </motion.div>
              )}

              {/* ── Three expanding activation rings (activating+) ──────── */}
              {isActivating && !isExiting && [0, 1, 2].map((n) => (
                <motion.div
                  key={`ring-${n}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 100 + n * 40,
                    height: 100 + n * 40,
                    border: `1px solid rgba(139,92,246,${0.55 - n * 0.15})`,
                    boxShadow: n === 0 ? '0 0 18px rgba(139,92,246,0.22)' : 'none',
                  }}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: [0, 0.9, 0], scale: [0.3, 2.8 + n * 0.5, 3.4 + n * 0.5] }}
                  transition={{
                    duration: 1.4 + n * 0.25,
                    delay: n * 0.22,
                    ease: EXPO_OUT,
                    repeat: isHolding ? 0 : Infinity,
                    repeatDelay: 0.6,
                  }}
                />
              ))}

              {/* ── Particle streaks burst (activating only) ─────────────── */}
              {isActivating && !isCompleting && (
                <div className="absolute" style={{ top: '50%', left: '50%', width: 0, height: 0 }}>
                  {streaks.map((s) => (
                    <motion.div
                      key={s.id}
                      className="absolute"
                      style={{
                        width: s.w,
                        height: s.len,
                        borderRadius: 99,
                        background: `linear-gradient(to bottom, rgba(255,255,255,0.95), hsla(${s.hue},90%,72%,0.8), transparent)`,
                        transformOrigin: 'center top',
                        rotate: `${(s.angle * 180) / Math.PI + 90}deg`,
                      }}
                      initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                      animate={{
                        x: Math.cos(s.angle) * s.dist,
                        y: Math.sin(s.angle) * s.dist,
                        opacity: [0, 1, 0],
                        scale: [0, 1.4, 0.2],
                      }}
                      transition={{ duration: s.dur, delay: s.delay, ease: EXPO_OUT }}
                    />
                  ))}
                </div>
              )}

              {/* ── Logo glow bloom (activating+) ────────────────────────── */}
              {isActivating && (
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 200,
                    height: 200,
                    background: 'radial-gradient(circle, rgba(120,60,255,0.28) 0%, rgba(100,40,220,0.14) 40%, transparent 68%)',
                  }}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{
                    opacity: isExiting ? 0 : isCompleting ? [0.7, 1, 0.7] : 0.8,
                    scale: isCompleting ? [1, 1.15, 1] : 1,
                  }}
                  transition={isCompleting
                    ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.65, ease: EXPO_OUT }
                  }
                />
              )}

              {/* ── Strong glow burst at completion ──────────────────────── */}
              {isCompleting && (
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 320,
                    height: 320,
                    background: 'radial-gradient(circle, rgba(160,80,255,0.22) 0%, rgba(120,50,240,0.1) 45%, transparent 70%)',
                  }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: isExiting ? 0 : [0, 1, 0.5], scale: [0.5, 1.3, 1] }}
                  transition={{ duration: 0.85, ease: EXPO_OUT }}
                />
              )}

              {/* ── Logo ─────────────────────────────────────────────────── */}
              <motion.div
                className="relative z-10 flex items-center justify-center"
                style={{ width: 120, height: 120 }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={
                  isDetecting && !isActivating
                    ? { opacity: 0.6, scale: 0.88 }
                    : isActivating && !isCompleting
                      ? { opacity: 1, scale: [0.88, 1.1, 1.0] }
                      : isCompleting
                        ? { opacity: isExiting ? 0 : 1, scale: isHolding ? [1.0, 1.04, 1.0] : 1.0 }
                        : { opacity: 0, scale: 0.6 }
                }
                transition={
                  isActivating && !isCompleting
                    ? { duration: 0.7, times: [0, 0.55, 1], ease: SPRING_LUX }
                    : isHolding
                      ? { duration: 3, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 0.55, ease: SPRING_LUX }
                }
              >
                {/* Logo shimmer sweep */}
                <div className="relative overflow-hidden rounded-xl" style={{ width: 100, height: 100 }}>
                  <img
                    src={logoImg}
                    alt="SwitchControl"
                    className="w-full h-full object-contain"
                    draggable={false}
                    style={{
                      filter: isCompleting
                        ? 'drop-shadow(0 0 28px rgba(139,92,246,0.9)) drop-shadow(0 0 60px rgba(120,50,240,0.5))'
                        : isActivating
                          ? 'drop-shadow(0 0 18px rgba(139,92,246,0.7)) drop-shadow(0 0 36px rgba(120,50,240,0.3))'
                          : 'drop-shadow(0 0 10px rgba(139,92,246,0.35))',
                      transition: 'filter 0.5s ease',
                    }}
                  />
                  {/* One-time shimmer sweep on logo reveal */}
                  {isActivating && (
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        background: 'linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.55) 50%, transparent 80%)',
                        transform: 'skewX(-15deg)',
                      }}
                      initial={{ x: '-160%' }}
                      animate={{ x: '200%' }}
                      transition={{ duration: 0.65, delay: 0.15, ease: 'easeOut' }}
                    />
                  )}
                </div>
              </motion.div>

            </div>

            {/* ── Status text (detecting + activating) ───────────────────── */}
            <AnimatePresence mode="wait">
              {isDetecting && !isCompleting && (
                <motion.p
                  key="status"
                  className="mt-2 text-xs font-medium tracking-[0.2em] uppercase"
                  style={{ color: 'rgba(139,92,246,0.65)' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: isActivating ? [0.65, 0.95, 0.65] : 0.65,
                    y: 0,
                  }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={isActivating
                    ? { opacity: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }, y: { duration: 0.35 } }
                    : { duration: 0.4, ease: SPRING_LUX }
                  }
                >
                  {isActivating ? 'Applying upgrade\u2026' : 'Connecting\u2026'}
                </motion.p>
              )}
            </AnimatePresence>

            {/* ── Completion text block ──────────────────────────────────── */}
            <AnimatePresence>
              {isCompleting && (
                <motion.div
                  key="completion-block"
                  className="mt-4 text-center"
                  style={{ maxWidth: 320 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isExiting ? 0 : 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  {/* Label */}
                  <motion.p
                    className="text-[10px] font-semibold tracking-[0.28em] uppercase mb-3"
                    style={{ color: 'rgba(168,85,247,0.75)' }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.45, ease: SPRING_LUX }}
                  >
                    PREMIUM ACTIVATED
                  </motion.p>

                  {/* Main heading */}
                  <motion.h2
                    className="text-3xl md:text-4xl font-bold tracking-tight mb-2"
                    style={{
                      background: 'linear-gradient(135deg, #ffffff 0%, #c084fc 45%, #8b5cf6 100%)',
                      backgroundSize: '200% 200%',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                    initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      filter: 'blur(0px)',
                      backgroundPosition: isHolding ? ['0% 50%', '100% 50%', '0% 50%'] : '0% 50%',
                    }}
                    transition={{
                      opacity: { delay: 0.12, duration: 0.55, ease: SPRING_LUX },
                      y:       { delay: 0.12, duration: 0.55, ease: EXPO_OUT },
                      filter:  { delay: 0.12, duration: 0.55, ease: EXPO_OUT },
                      backgroundPosition: { duration: 5, repeat: Infinity, ease: 'linear' },
                    }}
                  >
                    System Upgraded
                  </motion.h2>

                  {/* Subtext line 1 */}
                  <motion.p
                    className="text-white/55 text-sm tracking-wide leading-relaxed"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.32, duration: 0.5, ease: SPRING_LUX }}
                  >
                    Premium features unlocked.
                  </motion.p>

                  {/* Subtext line 2 */}
                  <motion.p
                    className="text-white/35 text-xs tracking-wide mt-1"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.45, ease: SPRING_LUX }}
                  >
                    All optimizations are now available.
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Skip hint ─────────────────────────────────────────────────── */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/20 text-xs tracking-widest"
            initial={{ opacity: 0 }}
            animate={{ opacity: isCompleting && !isExiting ? 0.45 : 0 }}
            transition={{ duration: 0.5, delay: isCompleting ? 0.6 : 0 }}
          >
            Click anywhere to skip
          </motion.div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}
