import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from '@/lib/motionTokens';
import { UPGRADE_TIMING, PREMIUM_EASE } from '@/lib/premiumMotionTokens';
import logoImg from '@/assets/logo.webp';


interface PremiumUpgradeAnimationProps {
  show: boolean;
  onComplete: () => void;
}

type Phase =
  | 'idle'
  | 'darken'
  | 'lock-appear'
  | 'glow-build'
  | 'shake-buildup'
  | 'unlock-snap'
  | 'shockwave'
  | 'logo-reveal'
  | 'text-reveal'
  | 'exiting'
  | 'done';


export function PremiumUpgradeAnimation({ show, onComplete }: PremiumUpgradeAnimationProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [lockUnlocked, setLockUnlocked] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef = useRef<{ stop: () => void } | null>(null);
  const risingRef = useRef<{ stop: () => void } | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const prefersReduced = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  []);

  const particles = useMemo(() =>
    Array.from({ length: 45 }, (_, i) => ({
      id: i,
      angle: (i / 45) * Math.PI * 2 + (Math.random() - 0.5) * 0.3,
      dist: 70 + Math.random() * 160,
      delay: Math.random() * 0.25,
      dur: 0.5 + Math.random() * 0.5,
      size: 2 + Math.random() * 5,
      hue: 250 + Math.random() * 60,
    })),
  []);

  const sparkTrails = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      angle: (i / 12) * Math.PI * 2,
      dist: 120 + Math.random() * 80,
      delay: Math.random() * 0.1,
      dur: 0.6 + Math.random() * 0.3,
      size: 1 + Math.random() * 2,
    })),
  []);

  const skip = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    audioRef.current?.stop();
    risingRef.current?.stop();
    setPhase('done');
    console.log('[PremiumAnimation] Skipped by user click');
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      setLockUnlocked(false);
      return;
    }

    console.log('[PremiumAnimation] show=true, starting sequence, prefersReduced=', prefersReduced);

    if (prefersReduced) {
      setPhase('logo-reveal');
      setLockUnlocked(true);
      const t = setTimeout(() => {
        setPhase('done');
        console.log('[PremiumAnimation] Reduced-motion complete');
        onCompleteRef.current();
      }, UPGRADE_TIMING.reducedDoneMs);
      timersRef.current = [t];
      return () => clearTimeout(t);
    }

    const t: ReturnType<typeof setTimeout>[] = [];
    timersRef.current = t;

    setPhase('darken');

    t.push(setTimeout(() => {
      setPhase('lock-appear');
    }, UPGRADE_TIMING.lockAppearMs));

    t.push(setTimeout(() => {
      setPhase('glow-build');
    }, UPGRADE_TIMING.glowBuildMs));

    t.push(setTimeout(() => {
      setPhase('shake-buildup');
    }, UPGRADE_TIMING.shakeBuildupMs));

    t.push(setTimeout(() => {
      setPhase('unlock-snap');
      setLockUnlocked(true);
      risingRef.current?.stop();
    }, UPGRADE_TIMING.unlockSnapMs));

    t.push(setTimeout(() => {
      setPhase('shockwave');
    }, UPGRADE_TIMING.shockwaveMs));

    t.push(setTimeout(() => {
      setPhase('logo-reveal');
    }, UPGRADE_TIMING.logoRevealMs));

    t.push(setTimeout(() => {
      setPhase('text-reveal');
    }, UPGRADE_TIMING.textRevealMs));

    t.push(setTimeout(() => {
      setPhase('exiting');
    }, UPGRADE_TIMING.exitingMs));

    t.push(setTimeout(() => {
      setPhase('done');
      console.log('[PremiumAnimation] Full sequence complete');
      onCompleteRef.current();
    }, UPGRADE_TIMING.doneMs));

    return () => {
      t.forEach(clearTimeout);
      audioRef.current?.stop();
      risingRef.current?.stop();
    };
  }, [show, prefersReduced]);

  if (!show && phase === 'idle') return null;
  const isActive = phase !== 'idle' && phase !== 'done';

  const phaseIndex = [
    'idle', 'darken', 'lock-appear', 'glow-build', 'shake-buildup', 'unlock-snap',
    'shockwave', 'logo-reveal', 'text-reveal', 'exiting', 'done'
  ].indexOf(phase);

  const showLock = phaseIndex >= 2 && phaseIndex <= 6;
  const showGlowBuild = phaseIndex >= 3 && phaseIndex <= 6;
  const showShakeBuildup = phaseIndex >= 4 && phaseIndex <= 5;
  const showShockwave = phaseIndex >= 6;
  const showLogo = phaseIndex >= 7;
  const showText = phaseIndex >= 8;

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
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(10,5,20,0.96) 0%, rgba(0,0,0,0.99) 100%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          />

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

            <div className="relative" style={{ width: 160, height: 200 }}>

              <AnimatePresence>
                {showGlowBuild && !showShockwave && (
                  <motion.div
                    className="absolute pointer-events-none"
                    style={{
                      width: 240,
                      height: 240,
                      top: '40%',
                      left: '50%',
                    }}
                    initial={{ opacity: 0, scale: 0.6, x: '-50%', y: '-50%' }}
                    animate={{
                      opacity: [0.3, 0.7, 0.3],
                      scale: showShakeBuildup ? 1.1 : 1,
                      rotate: 360,
                    }}
                    exit={{ opacity: 0, scale: 1.5 }}
                    transition={{
                      opacity: { duration: showShakeBuildup ? 0.8 : 1.5, repeat: Infinity, ease: 'easeInOut' },
                      rotate: { duration: showShakeBuildup ? 2 : 4, repeat: Infinity, ease: 'linear' },
                      scale: { duration: 0.6, ease: [...PREMIUM_EASE] },
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

              {showGlowBuild && !showShockwave && (
                <>
                  {[1, 2, 3].map((n) => (
                    <motion.div
                      key={`pulse-${n}`}
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 160,
                        height: 160,
                        top: '40%',
                        left: '50%',
                        border: `1px solid rgba(139,92,246,${showShakeBuildup ? 0.5 : 0.35})`,
                      }}
                      initial={{ opacity: 0.7, scale: 0.5, x: '-50%', y: '-50%' }}
                      animate={{ opacity: 0, scale: showShakeBuildup ? 3 : 2.5 }}
                      transition={{
                        duration: showShakeBuildup ? 1 : 1.5,
                        delay: n * (showShakeBuildup ? 0.3 : 0.5),
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                    />
                  ))}
                </>
              )}

              <AnimatePresence>
                {showShockwave && (
                  <>
                    <motion.div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 300,
                        height: 300,
                        top: '40%',
                        left: '50%',
                        background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, rgba(168,85,247,0.2) 40%, transparent 65%)',
                      }}
                      initial={{ opacity: 0, scale: 0.2, x: '-50%', y: '-50%' }}
                      animate={{ opacity: [0, 1, 0], scale: [0.2, 3, 4] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.9, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 200,
                        height: 200,
                        top: '40%',
                        left: '50%',
                        border: '2px solid rgba(139,92,246,0.6)',
                      }}
                      initial={{ opacity: 0, scale: 0.3, x: '-50%', y: '-50%' }}
                      animate={{ opacity: [0, 0.8, 0], scale: [0.3, 3.5, 4.5] }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 160,
                        height: 160,
                        top: '40%',
                        left: '50%',
                        background: 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 50%)',
                      }}
                      initial={{ opacity: 0, scale: 0.1, x: '-50%', y: '-50%' }}
                      animate={{ opacity: [0, 1, 0], scale: [0.1, 2.5, 3] }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: 100,
                        height: 100,
                        top: '40%',
                        left: '50%',
                        border: '1px solid rgba(6,182,212,0.4)',
                      }}
                      initial={{ opacity: 0, scale: 0.5, x: '-50%', y: '-50%' }}
                      animate={{ opacity: [0, 0.6, 0], scale: [0.5, 4, 5] }}
                      transition={{ duration: 1.1, delay: 0.1, ease: 'easeOut' }}
                    />
                  </>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {(phase === 'unlock-snap' || phase === 'shockwave') && (
                  <div className="absolute pointer-events-none overflow-visible" style={{ top: '40%', left: '50%', width: 0, height: 0 }}>
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
                          opacity: [0, 1, 0.8, 0],
                          scale: [0, 1.8, 1, 0],
                        }}
                        transition={{
                          duration: p.dur,
                          delay: p.delay,
                          ease: [...PREMIUM_EASE],
                        }}
                      />
                    ))}
                    {sparkTrails.map((s) => (
                      <motion.div
                        key={`trail-${s.id}`}
                        className="absolute"
                        style={{
                          width: s.size,
                          height: s.size * 8,
                          background: `linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(139,92,246,0.6), transparent)`,
                          borderRadius: '50%',
                          transformOrigin: 'center top',
                          rotate: `${(s.angle * 180) / Math.PI + 90}deg`,
                        }}
                        initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                        animate={{
                          x: Math.cos(s.angle) * s.dist,
                          y: Math.sin(s.angle) * s.dist,
                          opacity: [0, 0.8, 0],
                          scale: [0, 1.5, 0],
                        }}
                        transition={{
                          duration: s.dur,
                          delay: s.delay,
                          ease: 'easeOut',
                        }}
                      />
                    ))}
                  </div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showLock && (
                  <motion.div
                    className="absolute flex items-center justify-center"
                    style={{ top: 0, left: '50%', width: 80, height: 80 }}
                    initial={{ opacity: 0, scale: 0.5, x: '-50%' }}
                    animate={{
                      opacity: 1,
                      scale: lockUnlocked ? 1.2 : (showShakeBuildup ? [1, 1.06, 1, 1.06, 1] : 1),
                      x: '-50%',
                    }}
                    exit={{ opacity: 0, scale: 1.5, x: '-50%' }}
                    transition={{
                      opacity: { duration: 0.5 },
                      scale: lockUnlocked
                        ? { duration: 0.15, ease: [...PREMIUM_EASE] }
                        : showShakeBuildup
                          ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' }
                          : { duration: 0.6, ease: [...PREMIUM_EASE] },
                    }}
                  >
                    <motion.div
                      style={{
                        filter: showGlowBuild
                          ? showShakeBuildup
                            ? 'drop-shadow(0 0 40px rgba(139,92,246,0.8)) drop-shadow(0 0 80px rgba(139,92,246,0.4))'
                            : 'drop-shadow(0 0 30px rgba(139,92,246,0.7)) drop-shadow(0 0 60px rgba(139,92,246,0.3))'
                          : 'drop-shadow(0 0 15px rgba(139,92,246,0.4))',
                      }}
                      animate={
                        lockUnlocked
                          ? { x: [0, -6, 6, -5, 5, -3, 3, 0] }
                          : showShakeBuildup
                            ? { x: [0, -2, 2, -3, 3, -2, 2, 0], y: [0, -1, 1, -1, 1, 0] }
                            : phase === 'lock-appear'
                              ? { scale: [1, 1.04, 1] }
                              : {}
                      }
                      transition={
                        lockUnlocked
                          ? { duration: 0.35, ease: 'easeOut' }
                          : showShakeBuildup
                            ? { duration: 0.4, repeat: Infinity, ease: 'easeInOut' }
                            : phase === 'lock-appear'
                              ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                              : {}
                      }
                    >
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
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
                            fill: 'rgba(139,92,246,1)',
                            scale: 1.3,
                          } : showShakeBuildup ? {
                            fill: ['rgba(168,132,255,0.9)', 'rgba(200,160,255,1)', 'rgba(168,132,255,0.9)'],
                          } : {}}
                          transition={showShakeBuildup
                            ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' }
                            : { duration: 0.2, delay: 0.1 }
                          }
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

                    {showGlowBuild && !lockUnlocked && (
                      <motion.div
                        className="absolute inset-0 overflow-hidden pointer-events-none"
                        style={{ borderRadius: 16 }}
                      >
                        <motion.div
                          className="absolute inset-0"
                          style={{
                            background: 'linear-gradient(100deg, transparent 0%, rgba(139,92,246,0.3) 42%, rgba(255,255,255,0.5) 50%, rgba(139,92,246,0.3) 58%, transparent 100%)',
                            transform: 'skewX(-20deg)',
                          }}
                          animate={{ x: ['-200%', '200%'] }}
                          transition={{ duration: showShakeBuildup ? 0.8 : 1.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: showShakeBuildup ? 0.1 : 0.5 }}
                        />
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showLogo && (
                  <motion.div
                    className="absolute flex items-center justify-center"
                    style={{ top: 20, left: '50%', width: 160, height: 160 }}
                    initial={{ opacity: 0, scale: 0.3, x: '-50%' }}
                    animate={{ opacity: 1, scale: 1, x: '-50%' }}
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
                          'drop-shadow(0 0 20px rgba(139,92,246,0.4)) drop-shadow(0 0 40px rgba(139,92,246,0.2))',
                          'drop-shadow(0 0 35px rgba(139,92,246,0.7)) drop-shadow(0 0 60px rgba(139,92,246,0.4))',
                          'drop-shadow(0 0 20px rgba(139,92,246,0.4)) drop-shadow(0 0 40px rgba(139,92,246,0.2))',
                        ],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <img
                        src={logoImg}
                        alt="SwitchControl"
                        className="w-24 h-24 object-contain"
                        draggable={false}
                      />
                    </motion.div>

                    <motion.div
                      className="absolute inset-0 overflow-hidden pointer-events-none rounded-full"
                    >
                      <motion.div
                        className="absolute inset-0"
                        style={{
                          background: 'linear-gradient(100deg, transparent 0%, rgba(139,92,246,0.3) 42%, rgba(255,255,255,0.5) 50%, rgba(139,92,246,0.3) 58%, transparent 100%)',
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

              <AnimatePresence>
                {showLogo && (
                  <motion.div
                    className="absolute -z-10 rounded-full"
                    style={{
                      width: 320,
                      height: 320,
                      top: '40%',
                      left: '50%',
                      background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, rgba(168,85,247,0.1) 40%, transparent 65%)',
                    }}
                    initial={{ opacity: 0, scale: 0.3, x: '-50%', y: '-50%' }}
                    animate={{ opacity: [0, 0.8, 0.5], scale: [0.3, 1.2, 1] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              {(phase === 'glow-build' || phase === 'shake-buildup') && (
                <motion.p
                  key="activating"
                  className="mt-6 text-sm font-medium tracking-[0.15em] uppercase"
                  style={{ color: 'rgba(139,92,246,0.7)' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: phase === 'shake-buildup' ? [0.7, 1, 0.7] : 1,
                    y: 0,
                  }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={phase === 'shake-buildup'
                    ? { opacity: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' }, y: { duration: 0.4 } }
                    : { duration: 0.4, ease: [...PREMIUM_EASE] }
                  }
                >
                  {phase === 'shake-buildup' ? 'Unlocking…' : 'Activating Premium'}
                </motion.p>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {(showLogo || phase === 'exiting') && (
                <motion.div
                  className="mt-8 text-center"
                  initial={{ opacity: 0, y: 24, scale: 0.9 }}
                  animate={{ opacity: phase === 'exiting' ? 0.4 : 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.6, ease: [...PREMIUM_EASE] }}
                >
                  <motion.p
                    className="text-xs font-medium tracking-[0.2em] uppercase mb-2"
                    style={{ color: 'rgba(139,92,246,0.7)' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.4 }}
                  >
                    PREMIUM ACTIVATED
                  </motion.p>
                  <motion.h2
                    className="text-2xl md:text-3xl font-bold tracking-tight"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(168,85,247,1) 50%, rgba(139,92,246,0.9) 100%)',
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
                    System Upgraded
                  </motion.h2>
                  <motion.p
                    className="text-white/40 text-sm mt-2 tracking-wide"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                  >
                    Your SwitchControl system has been upgraded.
                  </motion.p>
                  <motion.p
                    className="text-white/40 text-sm tracking-wide"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                  >
                    All premium optimizations are now unlocked.
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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
