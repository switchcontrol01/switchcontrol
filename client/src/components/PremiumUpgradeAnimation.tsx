import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from '@/lib/motionTokens';
import { UPGRADE_TIMING } from '@/lib/premiumMotionTokens';
import logoImg from '@/assets/logo.webp';

const EXPO_OUT   = [0.16, 1, 0.3,  1]  as const;
const QUINT_OUT  = [0.22, 1, 0.36, 1]  as const;
const CUBIC_IO   = [0.65, 0, 0.35, 1]  as const;

// ── Stable geometry ──────────────────────────────────────────────────────────

const RAY_COUNT = 14;
const rays = Array.from({ length: RAY_COUNT }, (_, i) => ({
  id:    i,
  angle: (i / RAY_COUNT) * 360,
  len:   160 + (i % 3) * 55,
  w:     1.2 + (i % 4) * 0.55,
  delay: (i % 5) * 0.07,
  hue:   250 + (i % 7) * 12,
  alpha: 0.35 + (i % 3) * 0.18,
}));

const STREAK_COUNT = 22;
const streaks = Array.from({ length: STREAK_COUNT }, (_, i) => {
  const ang  = (i / STREAK_COUNT) * Math.PI * 2;
  return {
    id:    i,
    angle: ang,
    dist:  90 + (i % 6) * 28,
    delay: (i % 5) * 0.04,
    dur:   0.6 + (i % 4) * 0.15,
    len:   8  + (i % 5) * 7,
    w:     1  + (i % 3) * 0.7,
    hue:   252 + (i % 8) * 11,
  };
});

const ORB_COUNT = 8;
const orbs = Array.from({ length: ORB_COUNT }, (_, i) => ({
  id:    i,
  r:     96 + (i % 3) * 38,
  angle: (i / ORB_COUNT) * 360,
  size:  2  + (i % 3) * 1.5,
  dur:   9  + (i % 4) * 3.5,
  dir:   i % 2 === 0 ? 1 : -1,
  hue:   252 + (i % 6) * 14,
  alpha: 0.55 + (i % 3) * 0.22,
}));

const HEADING = 'System Upgraded'.split('');

// Arc circumference for r=130 circle
const ARC_R   = 130;
const ARC_C   = 2 * Math.PI * ARC_R; // ≈ 817

interface Props { show: boolean; onComplete: () => void; }

type Phase = 'idle'|'detecting'|'activating'|'completing'|'holding'|'exiting'|'done';
const PHASES: Phase[] = ['idle','detecting','activating','completing','holding','exiting','done'];

export function PremiumUpgradeAnimation({ show, onComplete }: Props) {
  const [phase, setPhase]       = useState<Phase>('idle');
  const [arcPct, setArcPct]     = useState(0);
  const timersRef               = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onCompleteRef           = useRef(onComplete);
  onCompleteRef.current         = onComplete;
  const arcRafRef               = useRef<number | null>(null);

  const prefersReduced = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  const skip = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (arcRafRef.current) cancelAnimationFrame(arcRafRef.current);
    setPhase('done');
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    if (!show) { setPhase('idle'); setArcPct(0); return; }

    if (prefersReduced) {
      setPhase('completing');
      const t = setTimeout(() => { setPhase('done'); onCompleteRef.current(); }, UPGRADE_TIMING.reducedDoneMs);
      timersRef.current = [t];
      return () => clearTimeout(t);
    }

    const sched = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timersRef.current.push(t);
    };

    timersRef.current = [];
    setArcPct(0);
    setPhase('detecting');

    // Animate the arc charge during activating phase (900ms → 2300ms = 1400ms window)
    sched(() => {
      setPhase('activating');
      const start = performance.now();
      const dur   = 1300; // slightly shorter than the activating window for suspense
      const tick  = (now: number) => {
        const pct = Math.min((now - start) / dur, 1);
        // easeInOutCubic for a satisfying charge feel
        const eased = pct < 0.5 ? 4*pct*pct*pct : 1 - Math.pow(-2*pct+2, 3)/2;
        setArcPct(eased);
        if (pct < 1) arcRafRef.current = requestAnimationFrame(tick);
      };
      arcRafRef.current = requestAnimationFrame(tick);
    }, UPGRADE_TIMING.activatingMs);

    sched(() => setPhase('completing'), UPGRADE_TIMING.completingMs);
    sched(() => setPhase('holding'),    UPGRADE_TIMING.holdingMs);
    sched(() => setPhase('exiting'),    UPGRADE_TIMING.exitingMs);
    sched(() => { setPhase('done'); onCompleteRef.current(); }, UPGRADE_TIMING.doneMs);

    return () => {
      timersRef.current.forEach(clearTimeout);
      if (arcRafRef.current) cancelAnimationFrame(arcRafRef.current);
    };
  }, [show, prefersReduced]);

  if (!show && phase === 'idle') return null;

  const pi           = PHASES.indexOf(phase);
  const isDetecting  = pi >= 1;
  const isActivating = pi >= 2;
  const isCompleting = pi >= 3;
  const isHolding    = pi >= 4;
  const isExiting    = pi >= 5;

  const arcOffset = ARC_C * (1 - arcPct); // strokeDashoffset: full → 0

  return (
    <AnimatePresence>
      {phase !== 'idle' && phase !== 'done' && (
        <motion.div
          key="upgrade-overlay"
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden select-none cursor-pointer"
          style={{ pointerEvents: 'auto' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: isExiting ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: isExiting ? 1.2 : 0.55, ease: CUBIC_IO }}
          onClick={skip}
          data-testid="premium-upgrade-animation"
        >

          {/* ── BG: deep cosmic gradient ───────────────────────────────────── */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 48%, #0c051f 0%, #07030f 52%, #000000 100%)' }}
          />

          {/* ── BG: breathing violet bloom ─────────────────────────────────── */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{
              opacity: isExiting ? 0 : isCompleting ? [0.6, 1.0, 0.6] : isActivating ? 0.55 : 0.2,
            }}
            transition={isCompleting && !isExiting
              ? { duration: 4, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 1.4, ease: CUBIC_IO }
            }
            style={{
              background: 'radial-gradient(ellipse 65% 55% at 50% 50%, rgba(120,50,255,0.18) 0%, rgba(90,30,200,0.09) 55%, transparent 80%)',
            }}
          />

          {/* ── BG: top light sweep on activating ──────────────────────────── */}
          <motion.div
            className="absolute inset-x-0 top-0 pointer-events-none"
            style={{ height: '45%', background: 'linear-gradient(to bottom, rgba(130,60,255,0.07) 0%, transparent 100%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: isActivating && !isExiting ? 0.85 : 0 }}
            transition={{ duration: 1.0, ease: EXPO_OUT }}
          />

          {/* ── SCAN LINE (detecting only) ──────────────────────────────────── */}
          {isDetecting && !isActivating && (
            <motion.div
              className="absolute inset-x-0 pointer-events-none"
              style={{
                height: 2,
                background: 'linear-gradient(to right, transparent 0%, rgba(168,85,247,0.0) 5%, rgba(168,85,247,0.9) 30%, rgba(200,140,255,1) 50%, rgba(168,85,247,0.9) 70%, rgba(168,85,247,0.0) 95%, transparent 100%)',
                boxShadow: '0 0 18px 4px rgba(168,85,247,0.5)',
                top: 0,
              }}
              initial={{ top: '0%', opacity: 0 }}
              animate={{ top: '100%', opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.85, ease: 'easeInOut', times: [0, 0.08, 0.85, 1] }}
            />
          )}

          {/* ── CENTERED STAGE ─────────────────────────────────────────────── */}
          <div className="relative flex flex-col items-center" style={{ zIndex: 2 }}>

            {/* Ring + logo container */}
            <div className="relative flex items-center justify-center" style={{ width: 320, height: 320 }}>

              {/* ── Slow dashed ambient orbit (detecting+) ──────────────────── */}
              {isDetecting && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  initial={{ opacity: 0, rotate: 0 }}
                  animate={{ opacity: isExiting ? 0 : 0.3, rotate: 360 }}
                  transition={{
                    opacity: { duration: 1.2, ease: CUBIC_IO },
                    rotate:  { duration: 24, repeat: Infinity, ease: 'linear' },
                  }}
                >
                  <svg viewBox="0 0 320 320" className="w-full h-full">
                    <defs>
                      <linearGradient id="ambientRing" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%"   stopColor="rgba(139,92,246,0.0)" />
                        <stop offset="30%"  stopColor="rgba(139,92,246,0.55)" />
                        <stop offset="70%"  stopColor="rgba(168,85,247,0.55)" />
                        <stop offset="100%" stopColor="rgba(139,92,246,0.0)" />
                      </linearGradient>
                    </defs>
                    <circle cx="160" cy="160" r="148" fill="none" stroke="url(#ambientRing)" strokeWidth="0.8" strokeDasharray="5 18" />
                  </svg>
                </motion.div>
              )}

              {/* ── ENERGY CHARGING ARC (activating, SVG) ───────────────────── */}
              {isActivating && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isCompleting ? 0 : isExiting ? 0 : 1 }}
                  transition={{ duration: isCompleting ? 0.4 : 0.5, ease: EXPO_OUT }}
                >
                  <svg viewBox="0 0 320 320" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
                    <defs>
                      <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%"   stopColor="#7c3aed" stopOpacity="0.5" />
                        <stop offset="50%"  stopColor="#a855f7" stopOpacity="1" />
                        <stop offset="100%" stopColor="#c084fc" stopOpacity="0.9" />
                      </linearGradient>
                      <filter id="arcGlow">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                      </filter>
                    </defs>
                    {/* Track ring */}
                    <circle cx="160" cy="160" r={ARC_R} fill="none" stroke="rgba(139,92,246,0.12)" strokeWidth="2" />
                    {/* Charging arc */}
                    <circle
                      cx="160" cy="160" r={ARC_R}
                      fill="none"
                      stroke="url(#arcGrad)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${ARC_C} ${ARC_C}`}
                      strokeDashoffset={arcOffset}
                      filter="url(#arcGlow)"
                    />
                    {/* Leading dot glow */}
                    {arcPct > 0.02 && (() => {
                      const ang = (-Math.PI / 2) + arcPct * Math.PI * 2;
                      const cx  = 160 + ARC_R * Math.cos(ang);
                      const cy  = 160 + ARC_R * Math.sin(ang);
                      return (
                        <>
                          <circle cx={cx} cy={cy} r="6"  fill="rgba(192,132,252,0.3)" />
                          <circle cx={cx} cy={cy} r="3"  fill="rgba(216,180,254,1)" />
                        </>
                      );
                    })()}
                  </svg>
                </motion.div>
              )}

              {/* ── Three expanding shockwave rings (activating) ─────────────── */}
              {isActivating && !isCompleting && !isExiting && [0, 1, 2].map((n) => (
                <motion.div
                  key={`ring-${n}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width:  120 + n * 50,
                    height: 120 + n * 50,
                    border: `1px solid rgba(139,92,246,${0.65 - n * 0.18})`,
                    boxShadow: n === 0 ? '0 0 22px 2px rgba(139,92,246,0.25)' : 'none',
                  }}
                  initial={{ opacity: 0, scale: 0.2 }}
                  animate={{ opacity: [0, 0.8, 0], scale: [0.2, 3.2 + n * 0.55, 3.8 + n * 0.55] }}
                  transition={{
                    duration:    1.8 + n * 0.35,
                    delay:       n * 0.3,
                    ease:        EXPO_OUT,
                    repeat:      Infinity,
                    repeatDelay: 0.4,
                  }}
                />
              ))}

              {/* ── Particle streak burst (activating → completing transition) ── */}
              {isActivating && !isCompleting && (
                <div className="absolute" style={{ top: '50%', left: '50%', width: 0, height: 0 }}>
                  {streaks.map((s) => (
                    <motion.div
                      key={s.id}
                      className="absolute"
                      style={{
                        width:           s.w,
                        height:          s.len,
                        borderRadius:    99,
                        background:      `linear-gradient(to bottom, rgba(255,255,255,1), hsla(${s.hue},90%,75%,0.85), transparent)`,
                        transformOrigin: 'center top',
                        rotate:          `${(s.angle * 180) / Math.PI + 90}deg`,
                      }}
                      initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                      animate={{
                        x:       Math.cos(s.angle) * s.dist,
                        y:       Math.sin(s.angle) * s.dist,
                        opacity: [0, 1, 0],
                        scale:   [0, 1.6, 0.1],
                      }}
                      transition={{ duration: s.dur, delay: s.delay + 0.2, ease: EXPO_OUT }}
                    />
                  ))}
                </div>
              )}

              {/* ── RADIAL LIGHT RAYS (completing phase) ─────────────────────── */}
              {isCompleting && !isExiting && (
                <div className="absolute" style={{ top: '50%', left: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
                  {rays.map((r) => (
                    <motion.div
                      key={r.id}
                      className="absolute"
                      style={{
                        width:           r.w,
                        height:          r.len,
                        originX:         '50%',
                        originY:         '0%',
                        background:      `linear-gradient(to bottom, hsla(${r.hue},85%,72%,${r.alpha}), transparent)`,
                        borderRadius:    99,
                        rotate:          `${r.angle}deg`,
                        translateX:      '-50%',
                      }}
                      initial={{ scaleY: 0, opacity: 0 }}
                      animate={{ scaleY: isHolding ? [1, 0.7, 1] : 1, opacity: isHolding ? [r.alpha * 0.9, r.alpha * 0.4, r.alpha * 0.9] : r.alpha }}
                      transition={isHolding
                        ? { duration: 3.5 + r.delay * 2, repeat: Infinity, ease: 'easeInOut', delay: r.delay }
                        : { duration: 0.9, delay: r.delay, ease: EXPO_OUT }
                      }
                    />
                  ))}
                </div>
              )}

              {/* ── Glow bloom under logo (activating+) ─────────────────────── */}
              {isActivating && (
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 240, height: 240,
                    background: 'radial-gradient(circle, rgba(120,50,255,0.32) 0%, rgba(100,35,220,0.16) 42%, transparent 70%)',
                  }}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{
                    opacity: isExiting ? 0 : isCompleting ? [0.75, 1.0, 0.75] : 0.8,
                    scale:   isCompleting ? [1, 1.18, 1] : 1,
                  }}
                  transition={isCompleting && !isExiting
                    ? { duration: 3.5, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.75, ease: EXPO_OUT }
                  }
                />
              )}

              {/* ── Completing flash burst ────────────────────────────────────── */}
              {isCompleting && (
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 380, height: 380,
                    background: 'radial-gradient(circle, rgba(180,100,255,0.28) 0%, rgba(140,60,240,0.12) 42%, transparent 70%)',
                  }}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: isExiting ? 0 : [0, 1.0, 0.45], scale: [0.4, 1.4, 1.05] }}
                  transition={{ duration: 1.1, ease: EXPO_OUT }}
                />
              )}

              {/* ── Drifting orbs during holding phase ───────────────────────── */}
              {isHolding && !isExiting && orbs.map((o) => {
                const rad = (o.angle * Math.PI) / 180;
                const x   = o.r * Math.cos(rad);
                const y   = o.r * Math.sin(rad);
                return (
                  <motion.div
                    key={o.id}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: o.size, height: o.size,
                      background: `hsla(${o.hue},80%,70%,${o.alpha})`,
                      boxShadow:  `0 0 ${o.size * 2}px hsla(${o.hue},80%,70%,${o.alpha * 0.7})`,
                      left: '50%', top: '50%',
                      marginLeft: -o.size / 2, marginTop: -o.size / 2,
                    }}
                    initial={{ x, y, opacity: 0 }}
                    animate={{
                      x:       [x, x + o.dir * 12, x - o.dir * 8, x],
                      y:       [y, y + 8,           y - 12,         y],
                      opacity: [0, o.alpha, o.alpha, 0],
                    }}
                    transition={{
                      duration: o.dur,
                      repeat:   Infinity,
                      ease:     'easeInOut',
                      delay:    o.id * 0.22,
                    }}
                  />
                );
              })}

              {/* ── LOGO ─────────────────────────────────────────────────────── */}
              <motion.div
                className="relative z-10 flex items-center justify-center"
                style={{ width: 130, height: 130 }}
                initial={{ opacity: 0, scale: 0.55, y: 10 }}
                animate={
                  !isActivating
                    ? { opacity: 0.55, scale: 0.82, y: 10 }
                    : isActivating && !isCompleting
                      ? { opacity: 1,  scale: [0.82, 1.15, 1.02], y: [10, -4, 0] }
                      : { opacity: isExiting ? 0 : 1, scale: isHolding ? [1.02, 1.06, 1.02] : 1.02, y: isHolding ? [0, -3, 0] : 0 }
                }
                transition={
                  isActivating && !isCompleting
                    ? { duration: 0.95, times: [0, 0.5, 1], ease: QUINT_OUT }
                    : isHolding
                      ? { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 0.65, ease: QUINT_OUT }
                }
              >
                {/* Multi-layer glow shadow */}
                <div
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  style={{
                    boxShadow: isCompleting
                      ? '0 0 48px 12px rgba(139,92,246,0.7), 0 0 100px 20px rgba(100,40,200,0.35)'
                      : isActivating
                        ? '0 0 28px 6px rgba(139,92,246,0.55), 0 0 60px 10px rgba(100,40,200,0.22)'
                        : '0 0 14px 2px rgba(139,92,246,0.25)',
                    transition: 'box-shadow 0.7s ease',
                    borderRadius: 18,
                  }}
                />

                {/* Logo image */}
                <div className="relative overflow-hidden" style={{ width: 110, height: 110, borderRadius: 22 }}>
                  <img
                    src={logoImg}
                    alt="SwitchControl"
                    className="w-full h-full object-contain"
                    draggable={false}
                    style={{
                      filter: isCompleting
                        ? 'drop-shadow(0 0 30px rgba(139,92,246,0.95)) drop-shadow(0 0 70px rgba(120,50,240,0.55))'
                        : isActivating
                          ? 'drop-shadow(0 0 18px rgba(139,92,246,0.75)) drop-shadow(0 0 40px rgba(120,50,240,0.35))'
                          : 'drop-shadow(0 0 10px rgba(139,92,246,0.35))',
                      transition: 'filter 0.65s ease',
                    }}
                  />

                  {/* Shimmer sweep across logo on reveal */}
                  {isActivating && !isCompleting && (
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        background: 'linear-gradient(108deg, transparent 15%, rgba(255,255,255,0.65) 50%, transparent 85%)',
                        skewX: '-12deg',
                      }}
                      initial={{ x: '-160%' }}
                      animate={{ x: '220%' }}
                      transition={{ duration: 0.75, delay: 0.18, ease: 'easeOut' }}
                    />
                  )}

                  {/* Holding-phase shimmer pulse */}
                  {isHolding && !isExiting && (
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        background: 'linear-gradient(108deg, transparent 20%, rgba(255,255,255,0.18) 50%, transparent 80%)',
                        skewX: '-12deg',
                      }}
                      initial={{ x: '-160%' }}
                      animate={{ x: '220%' }}
                      transition={{ duration: 1.1, delay: 0, ease: 'easeInOut', repeat: Infinity, repeatDelay: 3.5 }}
                    />
                  )}
                </div>
              </motion.div>

            </div>

            {/* ── Status text (detecting / activating) ─────────────────────── */}
            <AnimatePresence mode="wait">
              {isDetecting && !isCompleting && (
                <motion.p
                  key="status"
                  className="mt-3 text-[11px] font-medium tracking-[0.22em] uppercase"
                  style={{ color: 'rgba(139,92,246,0.65)' }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{
                    opacity: isActivating ? [0.65, 0.95, 0.65] : 0.65,
                    y:       0,
                  }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.35 } }}
                  transition={isActivating
                    ? { opacity: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }, y: { duration: 0.45 } }
                    : { duration: 0.5, ease: QUINT_OUT }
                  }
                >
                  {isActivating ? 'Applying upgrade\u2026' : 'Initialising\u2026'}
                </motion.p>
              )}
            </AnimatePresence>

            {/* ── Completion block ──────────────────────────────────────────── */}
            <AnimatePresence>
              {isCompleting && (
                <motion.div
                  key="completion-block"
                  className="mt-5 text-center"
                  style={{ maxWidth: 360 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isExiting ? 0 : 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: isExiting ? 1.2 : 0.4 }}
                >
                  {/* "PREMIUM ACTIVATED" label */}
                  <motion.p
                    className="text-[10px] font-semibold tracking-[0.32em] uppercase mb-3"
                    style={{ color: 'rgba(168,85,247,0.75)' }}
                    initial={{ opacity: 0, y: 8, letterSpacing: '0.18em' }}
                    animate={{ opacity: 1, y: 0, letterSpacing: '0.32em' }}
                    transition={{ delay: 0.05, duration: 0.7, ease: QUINT_OUT }}
                  >
                    PREMIUM ACTIVATED
                  </motion.p>

                  {/* "System Upgraded" — character stagger */}
                  <div
                    className="text-3xl md:text-4xl font-bold tracking-tight mb-3 flex flex-wrap justify-center gap-0"
                    aria-label="System Upgraded"
                  >
                    {HEADING.map((char, i) => (
                      <motion.span
                        key={i}
                        style={{
                          background: 'linear-gradient(135deg, #ffffff 0%, #c084fc 50%, #8b5cf6 100%)',
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          display: 'inline-block',
                          whiteSpace: char === ' ' ? 'pre' : 'normal',
                        }}
                        initial={{ opacity: 0, y: 22, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        transition={{
                          delay:    0.18 + i * 0.038,
                          duration: 0.7,
                          ease:     QUINT_OUT,
                        }}
                      >
                        {char}
                      </motion.span>
                    ))}
                  </div>

                  {/* Divider line */}
                  <motion.div
                    className="mx-auto mb-4"
                    style={{
                      height: 1,
                      background: 'linear-gradient(to right, transparent, rgba(168,85,247,0.4), transparent)',
                    }}
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 140, opacity: 1 }}
                    transition={{ delay: 0.55, duration: 0.8, ease: EXPO_OUT }}
                  />

                  {/* Subtitle line 1 */}
                  <motion.p
                    className="text-white/55 text-sm tracking-wide leading-relaxed"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.65, duration: 0.65, ease: QUINT_OUT }}
                  >
                    Premium features unlocked.
                  </motion.p>

                  {/* Subtitle line 2 */}
                  <motion.p
                    className="text-white/35 text-xs tracking-wide mt-1.5"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.88, duration: 0.6, ease: QUINT_OUT }}
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
            transition={{ duration: 0.7, delay: isCompleting ? 0.9 : 0 }}
          >
            Click anywhere to skip
          </motion.div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}
