import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from '@/lib/motionTokens';
import { UPGRADE_TIMING } from '@/lib/premiumMotionTokens';
import logoImg from '@/assets/logo.webp';

// ── Easing ───────────────────────────────────────────────────────────────────
const SILK    = [0.22, 1, 0.36, 1]  as const;  // smooth luxury ease-out
const EXHALE  = [0.16, 1, 0.3,  1]  as const;  // slightly faster ease-out

// ── Headline character split ──────────────────────────────────────────────────
const HEADLINE = 'Premium Unlocked'.split('');

// ── Very subtle background rings — drawn BEHIND logo via absolute positioning ─
const BG_RINGS = [
  { r: 180, w: 0.6, opacity: 0.06, dash: '6 28', dur: 38, delay: 0 },
  { r: 240, w: 0.5, opacity: 0.04, dash: '4 36', dur: 52, delay: 4 },
];

interface Props { show: boolean; onComplete: () => void; }

type Phase = 'idle' | 'detecting' | 'activating' | 'completing' | 'holding' | 'exiting' | 'done';
const PHASE_ORDER: Phase[] = ['idle', 'detecting', 'activating', 'completing', 'holding', 'exiting', 'done'];

export function PremiumUpgradeAnimation({ show, onComplete }: Props) {
  const [phase, setPhase]   = useState<Phase>('idle');
  const timersRef           = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onCompleteRef       = useRef(onComplete);
  onCompleteRef.current     = onComplete;

  const prefersReduced = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  const skip = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase('exiting');
    // Fire onComplete immediately — AnimatePresence blur-out runs while tour fades in
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    if (!show) { setPhase('idle'); return; }

    if (prefersReduced) {
      setPhase('completing');
      const t = setTimeout(() => { onCompleteRef.current(); }, UPGRADE_TIMING.reducedDoneMs);
      timersRef.current = [t];
      return () => clearTimeout(t);
    }

    const at = (ms: number, fn: () => void) => {
      const t = setTimeout(fn, ms);
      timersRef.current.push(t);
    };

    timersRef.current = [];
    setPhase('detecting');

    at(UPGRADE_TIMING.activatingMs,  () => setPhase('activating'));
    at(UPGRADE_TIMING.completingMs,  () => setPhase('completing'));
    at(UPGRADE_TIMING.holdingMs,     () => setPhase('holding'));
    // Exit: call onComplete at START of exit so tour blur-in overlaps our blur-out
    at(UPGRADE_TIMING.exitingMs,     () => {
      setPhase('exiting');
      onCompleteRef.current();
    });

    return () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  }, [show, prefersReduced]);

  if (!show && phase === 'idle') return null;

  const pi           = PHASE_ORDER.indexOf(phase);
  const isDetecting  = pi >= 1;
  const isActivating = pi >= 2;
  const isCompleting = pi >= 3;
  const isHolding    = pi >= 4;
  const isExiting    = pi >= 5;

  return (
    <AnimatePresence>
      {phase !== 'idle' && phase !== 'done' && (
        <motion.div
          key="premium-upgrade-overlay"
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden select-none cursor-pointer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, filter: 'blur(22px)', scale: 1.04 }}
          transition={{ duration: 0.7, ease: SILK }}
          onClick={skip}
          data-testid="premium-upgrade-animation"
        >
          {/* ── Base — deepest dark with slight violet tint ──────────────────── */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 46%, #08011a 0%, #040010 50%, #020009 100%)' }}
          />

          {/* ── Layer 2: large ambient violet bloom — breathes in/out ─────────── */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 70% 60% at 50% 46%, rgba(100,30,220,0.14) 0%, rgba(80,20,180,0.06) 55%, transparent 80%)',
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: isExiting ? 0
                : isHolding      ? [0.7, 1.0, 0.7]
                : isActivating   ? 0.8
                : 0.3,
            }}
            transition={
              isHolding && !isExiting
                ? { duration: 5, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 1.8, ease: SILK }
            }
          />

          {/* ── Layer 3: secondary tighter bloom — behind logo ───────────────── */}
          <motion.div
            className="absolute pointer-events-none"
            style={{
              width: 480, height: 480,
              left: '50%', top: '46%',
              translate: '-50% -50%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(139,92,246,0.22) 0%, rgba(100,40,200,0.10) 45%, transparent 72%)',
              filter: 'blur(32px)',
            }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{
              opacity: isExiting ? 0 : isActivating ? (isHolding ? [0.8, 1, 0.8] : 1) : 0,
              scale:   isActivating ? (isHolding ? [1, 1.12, 1] : 1) : 0.4,
            }}
            transition={
              isHolding && !isExiting
                ? { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 1.4, ease: EXHALE }
            }
          />

          {/* ── Layer 4: close inner bloom directly behind logo ──────────────── */}
          <motion.div
            className="absolute pointer-events-none"
            style={{
              width: 260, height: 260,
              left: '50%', top: '46%',
              translate: '-50% -50%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(168,85,247,0.30) 0%, rgba(139,60,240,0.12) 50%, transparent 72%)',
              filter: 'blur(20px)',
            }}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{
              opacity: isExiting ? 0 : isActivating ? (isHolding ? [0.75, 1, 0.75] : 0.85) : 0,
              scale:   isActivating ? 1 : 0.3,
            }}
            transition={
              isHolding && !isExiting
                ? { duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }
                : { duration: 1.0, ease: EXHALE }
            }
          />

          {/* ── Background rings — faint, slow-rotating, never touching logo ─── */}
          {isActivating && !isExiting && (
            <div
              className="absolute pointer-events-none"
              style={{ left: '50%', top: '46%', translate: '-50% -50%' }}
            >
              {BG_RINGS.map((ring, i) => (
                <motion.svg
                  key={i}
                  width={ring.r * 2 + 8}
                  height={ring.r * 2 + 8}
                  viewBox={`0 0 ${ring.r * 2 + 8} ${ring.r * 2 + 8}`}
                  style={{ position: 'absolute', translate: '-50% -50%', left: '50%', top: '50%' }}
                  initial={{ opacity: 0, rotate: 0 }}
                  animate={{
                    opacity: isExiting ? 0 : ring.opacity,
                    rotate: ring.dur * 360 / ring.dur,
                  }}
                  transition={{
                    opacity: { duration: 2.5, ease: SILK, delay: i * 0.5 },
                    rotate:  { duration: ring.dur, repeat: Infinity, ease: 'linear' },
                  }}
                >
                  <circle
                    cx={ring.r + 4}
                    cy={ring.r + 4}
                    r={ring.r}
                    fill="none"
                    stroke={`rgba(168,85,247,${ring.opacity * 4})`}
                    strokeWidth={ring.w}
                    strokeDasharray={ring.dash}
                  />
                </motion.svg>
              ))}
            </div>
          )}

          {/* ── LOGO — the hero, always on top, never covered ────────────────── */}
          <motion.div
            className="relative flex flex-col items-center"
            style={{ zIndex: 2 }}
            initial={{ opacity: 0, scale: 0.82, y: 14 }}
            animate={
              isExiting
                ? { opacity: 0, scale: 0.94, y: -8, filter: 'blur(10px)' }
                : isActivating
                  ? {
                      opacity: 1,
                      scale: isHolding ? [1, 1.025, 1] : 1,
                      y: isHolding ? [0, -7, 0] : 0,
                      filter: 'blur(0px)',
                    }
                  : { opacity: 0.18, scale: 0.82, y: 14, filter: 'blur(2px)' }
            }
            transition={
              isHolding && !isExiting
                ? { scale: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
                    y:     { duration: 5, repeat: Infinity, ease: 'easeInOut' },
                    opacity: { duration: 0 } }
                : { duration: isExiting ? 0.85 : 1.0, ease: SILK }
            }
          >
            {/* Logo container — glow effect via box-shadow, behind image */}
            <div
              className="relative flex items-center justify-center"
              style={{ width: 148, height: 148 }}
            >
              {/* Glow halo — behind logo via absolute positioning */}
              <motion.div
                className="absolute inset-0 rounded-[28px] pointer-events-none"
                style={{ zIndex: 0 }}
                animate={{
                  boxShadow: isExiting    ? '0 0 0px 0px transparent'
                    : isCompleting        ? '0 0 60px 16px rgba(139,92,246,0.55), 0 0 120px 28px rgba(100,40,200,0.22), 0 0 8px 1px rgba(200,150,255,0.3)'
                    : isActivating        ? '0 0 40px 10px rgba(139,92,246,0.45), 0 0 80px 18px rgba(100,40,200,0.18)'
                    :                      '0 0 20px 4px rgba(139,92,246,0.2)',
                }}
                transition={{ duration: 0.9, ease: SILK }}
              />

              {/* Logo image — always clean */}
              <img
                src={logoImg}
                alt="SwitchControl"
                className="relative object-contain select-none"
                draggable={false}
                style={{
                  width: 128,
                  height: 128,
                  borderRadius: 24,
                  zIndex: 1,
                  filter: isCompleting
                    ? 'drop-shadow(0 2px 24px rgba(139,92,246,0.5))'
                    : isActivating
                      ? 'drop-shadow(0 2px 14px rgba(139,92,246,0.35))'
                      : 'none',
                  transition: 'filter 1s ease',
                }}
              />

              {/* Single shimmer sweep across logo on initial reveal only */}
              <AnimatePresence>
                {isActivating && !isCompleting && (
                  <motion.div
                    key="shimmer"
                    className="absolute inset-0 pointer-events-none overflow-hidden"
                    style={{ borderRadius: 24, zIndex: 2 }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        background: 'linear-gradient(112deg, transparent 20%, rgba(255,255,255,0.35) 50%, transparent 80%)',
                      }}
                      initial={{ x: '-140%' }}
                      animate={{ x: '200%' }}
                      transition={{ duration: 1.1, delay: 0.35, ease: 'easeOut' }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* ── Text block — rises in below logo ─────────────────────────────── */}
          <AnimatePresence>
            {isCompleting && (
              <motion.div
                key="text-block"
                className="relative mt-8 text-center"
                style={{ maxWidth: 380, zIndex: 2 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: isExiting ? 0 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: isExiting ? 0.7 : 0.5 }}
              >
                {/* "PREMIUM ACTIVATED" badge */}
                <motion.p
                  className="text-[10px] font-bold tracking-[0.36em] uppercase mb-4"
                  style={{ color: 'rgba(168,85,247,0.72)' }}
                  initial={{ opacity: 0, y: 10, letterSpacing: '0.16em' }}
                  animate={{ opacity: 1, y: 0, letterSpacing: '0.36em' }}
                  transition={{ duration: 0.9, ease: SILK, delay: 0.05 }}
                >
                  Premium Activated
                </motion.p>

                {/* "Premium Unlocked" — character stagger, slow and deliberate */}
                <div
                  className="flex flex-wrap justify-center gap-0 mb-4"
                  aria-label="Premium Unlocked"
                >
                  {HEADLINE.map((char, i) => (
                    <motion.span
                      key={i}
                      style={{
                        fontSize: '2.25rem',
                        fontWeight: 700,
                        letterSpacing: '-0.01em',
                        lineHeight: 1.15,
                        background: 'linear-gradient(138deg, #ffffff 0%, #d8b4fe 45%, #a855f7 100%)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        display: 'inline-block',
                        whiteSpace: char === ' ' ? 'pre' : 'normal',
                      }}
                      initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      transition={{
                        delay: 0.22 + i * 0.055,
                        duration: 0.75,
                        ease: SILK,
                      }}
                    >
                      {char}
                    </motion.span>
                  ))}
                </div>

                {/* Gradient divider */}
                <motion.div
                  className="mx-auto mb-5"
                  style={{
                    height: 1,
                    background: 'linear-gradient(to right, transparent, rgba(168,85,247,0.35), transparent)',
                  }}
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 160, opacity: 1 }}
                  transition={{ delay: 0.65, duration: 1.0, ease: EXHALE }}
                />

                {/* Subtitle */}
                <motion.p
                  className="text-[14px] leading-relaxed"
                  style={{ color: 'rgba(255,255,255,0.48)' }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.85, duration: 0.8, ease: SILK }}
                >
                  All premium features are now unlocked.
                </motion.p>

                <motion.p
                  className="text-[11px] mt-1.5"
                  style={{ color: 'rgba(255,255,255,0.27)' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.05, duration: 0.7, ease: SILK }}
                >
                  Every optimisation, no limits, forever.
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Skip hint — appears only during hold phase ────────────────────── */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[11px] tracking-widest pointer-events-none"
            style={{ color: 'rgba(255,255,255,0.18)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: isHolding && !isExiting ? 1 : 0 }}
            transition={{ duration: 1.0, delay: isHolding ? 1.2 : 0, ease: 'easeOut' }}
          >
            Click anywhere to continue
          </motion.div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}
