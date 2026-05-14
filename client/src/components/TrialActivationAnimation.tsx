import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from '@/lib/motionTokens';
import { Brain, Cpu, Wifi, Zap, Clock } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { formatTrialCountdown, formatTrialEndsAt, getTrialTimeRemaining } from '@/lib/trialCountdown';
import logoImg from '@/assets/logo.webp';

interface Props {
  show: boolean;
  onComplete: () => void;
}

type Phase = 'idle' | 'entrance' | 'burst' | 'settle' | 'card' | 'features' | 'breathe' | 'exiting' | 'done';

// Deterministic pseudo-random particles — orbital burst on logo reveal
const BURST_PARTICLES = Array.from({ length: 36 }, (_, i) => {
  const seed = i + 1;
  const angle = (i / 36) * Math.PI * 2 + ((seed * 7919) % 100) / 100 * 0.25;
  return {
    id: i,
    angle,
    dist: 70 + ((seed * 3571) % 100) * 1.2,
    delay: ((seed * 2311) % 100) / 100 * 0.22,
    dur: 0.65 + ((seed * 4793) % 100) / 100 * 0.55,
    size: 1.5 + ((seed * 1873) % 100) / 100 * 3.5,
    hue: 175 + ((seed * 5483) % 100) * 0.7,
    opacity: 0.5 + ((seed * 1987) % 100) / 100 * 0.5,
  };
});

// Slow orbital floaters — ambient while card is visible
const ORBITERS = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  angle: (i / 8) * Math.PI * 2,
  r: 110 + i * 14,
  size: 2 + (i % 3),
  dur: 12 + i * 3,
  hue: i % 2 === 0 ? 186 : 258,
  delay: i * 1.5,
}));

const FEATURES = [
  { icon: Brain, label: 'AI Advisor',       sub: 'Smart tuning',    color: '#00D4FF', glow: 'rgba(139,92,246,0.35)' },
  { icon: Cpu,   label: 'BIOS Advisor',     sub: 'Hardware unlock', color: '#06b6d4', glow: 'rgba(6,182,212,0.35)'  },
  { icon: Wifi,  label: 'Network Tweaks',   sub: 'Latency cuts',    color: '#3b82f6', glow: 'rgba(59,130,246,0.35)' },
  { icon: Zap,   label: 'Power Plans',      sub: 'FPS boost',       color: '#34d399', glow: 'rgba(52,211,153,0.35)' },
];

function CountdownDisplay({ trialEndsAt }: { trialEndsAt: string | null }) {
  const [countdown, setCountdown] = useState(() => formatTrialCountdown(trialEndsAt));
  const [remaining, setRemaining] = useState(() => getTrialTimeRemaining(trialEndsAt));

  useEffect(() => {
    if (!trialEndsAt) return;
    const id = setInterval(() => {
      setCountdown(formatTrialCountdown(trialEndsAt));
      setRemaining(getTrialTimeRemaining(trialEndsAt));
    }, 1000);
    return () => clearInterval(id);
  }, [trialEndsAt]);

  const totalMs  = trialEndsAt ? new Date(trialEndsAt).getTime() - Date.now() : 0;
  const maxMs    = 7 * 24 * 60 * 60 * 1000;
  const fraction = Math.max(0, Math.min(1, totalMs / maxMs));
  const R        = 30;
  const circ     = 2 * Math.PI * R;

  return (
    <div className="flex items-center gap-3">
      {/* Ring clock */}
      <div className="relative shrink-0" style={{ width: 72, height: 72 }}>
        <svg width="72" height="72" viewBox="0 0 72 72" className="absolute inset-0 -rotate-90">
          <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(6,182,212,0.1)" strokeWidth="2.5" />
          <defs>
            <linearGradient id="cdRingGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#00D4FF" />
            </linearGradient>
          </defs>
          <motion.circle
            cx="36" cy="36" r={R}
            fill="none"
            stroke="url(#cdRingGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ * (1 - fraction) }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Clock className="w-3 h-3 mb-0.5" style={{ color: 'rgba(6,182,212,0.8)' }} />
          <span className="text-[13px] font-bold leading-none tabular-nums" style={{ color: '#06b6d4' }}>
            {remaining.days > 0 ? `${remaining.days}d` : `${remaining.hours}h`}
          </span>
          <span className="text-[8px] leading-none mt-0.5" style={{ color: 'rgba(6,182,212,0.55)' }}>
            {remaining.days > 0 ? `${remaining.hours}h left` : `${remaining.minutes}m left`}
          </span>
        </div>
      </div>

      {/* Text */}
      <div>
        <div className="text-[11px] font-bold" style={{ color: 'rgba(6,182,212,0.7)' }}>Free Trial Active</div>
        <div className="text-[18px] font-bold leading-tight tabular-nums" style={{ color: '#fff' }}>{countdown}</div>
        <div className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Ends {formatTrialEndsAt(trialEndsAt)}
        </div>
      </div>
    </div>
  );
}

export function TrialActivationAnimation({ show, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const timersRef     = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const user       = useAuthStore(s => s.user);
  const trialEndsAt = user?.trialEndsAt ?? null;

  const at = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
  }, []);

  const skip = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase('exiting');
    // Call onComplete immediately — AnimatePresence exit handles the blur-out
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }

    const reduced = typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setPhase('card');
      at(600,  () => setPhase('features'));
      at(1200, () => setPhase('breathe'));
      at(5000, () => { setPhase('exiting'); onCompleteRef.current(); });
      return;
    }

    setPhase('entrance');
    at(700,  () => setPhase('burst'));
    at(1350, () => setPhase('settle'));
    at(2100, () => setPhase('card'));
    at(2750, () => setPhase('features'));
    at(3500, () => setPhase('breathe'));
    // Exit: call onComplete at start of exit so tour blur-in overlaps with our blur-out
    at(9200, () => {
      setPhase('exiting');
      onCompleteRef.current();
    });

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [show]);

  const pi = { idle: 0, entrance: 1, burst: 2, settle: 3, card: 4, features: 5, breathe: 6, exiting: 7, done: 8 };
  const p  = (min: Phase) => pi[phase] >= pi[min];

  return (
    <AnimatePresence>
      {phase !== 'idle' && phase !== 'done' && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, filter: 'blur(22px)', scale: 1.05 }}
          transition={{ duration: 0.75, ease: [0.4, 0, 0.8, 1] }}
          onClick={skip}
          style={{ cursor: 'pointer' }}
        >
          {/* ── Base background ─────────────────────────────────────────────── */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 100% 100% at 50% 50%, #040511 0%, #020310 60%, #010208 100%)' }}
          />

          {/* ── Aurora blooms ────────────────────────────────────────────────── */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 65% 55% at 50% 50%, rgba(6,182,212,0.16) 0%, rgba(6,182,212,0.05) 45%, transparent 70%)',
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={p('burst') ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 50% 50% at 28% 72%, rgba(139,92,246,0.13) 0%, transparent 60%)',
            }}
            initial={{ opacity: 0 }}
            animate={p('card') ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 40% 40% at 72% 28%, rgba(59,130,246,0.09) 0%, transparent 60%)',
            }}
            initial={{ opacity: 0 }}
            animate={p('card') ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 1.8, ease: 'easeOut', delay: 0.3 }}
          />

          {/* ── Burst particles (fire once on logo reveal) ───────────────────── */}
          <AnimatePresence>
            {phase === 'burst' && BURST_PARTICLES.map(pt => {
              const tx = Math.cos(pt.angle) * pt.dist;
              const ty = Math.sin(pt.angle) * pt.dist;
              return (
                <motion.span
                  key={pt.id}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: pt.size, height: pt.size,
                    left: '50%', top: '50%',
                    background: `hsla(${pt.hue},90%,70%,${pt.opacity})`,
                    boxShadow: `0 0 ${pt.size * 2.5}px hsla(${pt.hue},90%,65%,0.6)`,
                    translateX: '-50%', translateY: '-50%',
                  }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                  animate={{ x: tx, y: ty, opacity: [0, pt.opacity, 0], scale: [0, 1.3, 0.6] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: pt.dur, delay: pt.delay, ease: [0.22, 0.8, 0.35, 1] }}
                />
              );
            })}
          </AnimatePresence>

          {/* ── Slow ambient orbiters ────────────────────────────────────────── */}
          {p('settle') && ORBITERS.map(orb => (
            <motion.span
              key={orb.id}
              className="absolute rounded-full pointer-events-none"
              style={{
                width: orb.size, height: orb.size,
                left: '50%', top: '50%',
                translateX: '-50%', translateY: '-50%',
                background: `hsla(${orb.hue},80%,70%,0.55)`,
                boxShadow: `0 0 ${orb.size * 3}px hsla(${orb.hue},80%,65%,0.4)`,
              }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0, 0.7, 0.4, 0.7, 0],
                x: [
                  Math.cos(orb.angle) * orb.r,
                  Math.cos(orb.angle + Math.PI / 2) * orb.r,
                  Math.cos(orb.angle + Math.PI) * orb.r,
                  Math.cos(orb.angle + Math.PI * 1.5) * orb.r,
                  Math.cos(orb.angle + Math.PI * 2) * orb.r,
                ],
                y: [
                  Math.sin(orb.angle) * orb.r,
                  Math.sin(orb.angle + Math.PI / 2) * orb.r,
                  Math.sin(orb.angle + Math.PI) * orb.r,
                  Math.sin(orb.angle + Math.PI * 1.5) * orb.r,
                  Math.sin(orb.angle + Math.PI * 2) * orb.r,
                ],
              }}
              transition={{ duration: orb.dur, delay: orb.delay, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
            />
          ))}

          {/* ── Central logo — large during burst, shrinks away before card ─── */}
          <motion.div
            className="absolute pointer-events-none"
            style={{ left: '50%', top: '50%' }}
            initial={{ x: '-50%', y: '-50%', scale: 0, opacity: 0, filter: 'blur(12px)' }}
            animate={
              p('settle') && !p('card')
                ? { x: '-50%', y: '-50%', scale: 1, opacity: 1, filter: 'blur(0px)' }
              : p('card')
                ? { x: '-50%', y: '-180%', scale: 0.55, opacity: 0, filter: 'blur(6px)' }
                : { x: '-50%', y: '-50%', scale: 0, opacity: 0, filter: 'blur(12px)' }
            }
            transition={{
              duration: p('card') ? 0.55 : 0.6,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {/* Outer glow rings */}
            <motion.div
              className="absolute rounded-full"
              style={{
                inset: -32,
                background: 'radial-gradient(circle, rgba(6,182,212,0.22) 0%, transparent 70%)',
              }}
              animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                inset: -20,
                border: '1px solid rgba(6,182,212,0.25)',
              }}
              animate={{ scale: [1, 1.35, 1.35], opacity: [0.8, 0, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
            />

            {/* Logo */}
            <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
              <div
                className="absolute inset-0 rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(6,182,212,0.18) 0%, rgba(139,92,246,0.14) 100%)',
                  border: '1px solid rgba(6,182,212,0.3)',
                  boxShadow: '0 0 48px rgba(6,182,212,0.35), 0 0 16px rgba(139,92,246,0.2), inset 0 1px 0 rgba(6,182,212,0.25)',
                  borderRadius: 20,
                }}
              />
              <img src={logoImg} alt="SwitchControl" className="relative w-12 h-12 object-contain select-none" />
            </div>
          </motion.div>

          {/* ── Main card ────────────────────────────────────────────────────── */}
          <motion.div
            className="relative z-10 mx-auto"
            style={{ width: 368, maxWidth: 'calc(100vw - 32px)' }}
            initial={{ opacity: 0, y: 48, scale: 0.95, filter: 'blur(10px)' }}
            animate={
              p('card')
                ? { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }
                : { opacity: 0, y: 48, scale: 0.95, filter: 'blur(10px)' }
            }
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
          >
            {/* Card glass shell */}
            <div
              className="rounded-[22px] overflow-hidden"
              style={{
                background: 'linear-gradient(160deg, rgba(8,20,50,0.88) 0%, rgba(5,10,28,0.92) 100%)',
                border: '1px solid rgba(6,182,212,0.2)',
                boxShadow: [
                  '0 0 0 1px rgba(6,182,212,0.07)',
                  '0 32px 80px rgba(0,0,0,0.8)',
                  '0 0 100px rgba(6,182,212,0.07)',
                  'inset 0 1px 0 rgba(6,182,212,0.14)',
                  'inset 0 -1px 0 rgba(139,92,246,0.08)',
                ].join(', '),
                backdropFilter: 'blur(32px)',
              }}
            >
              {/* ── Top status bar ─────────────────────────────────────────── */}
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{
                  background: 'linear-gradient(90deg, rgba(6,182,212,0.1) 0%, rgba(139,92,246,0.06) 100%)',
                  borderBottom: '1px solid rgba(6,182,212,0.1)',
                }}
              >
                <div className="flex items-center gap-2">
                  <motion.span
                    className="size-1.5 rounded-full"
                    style={{ background: '#06b6d4' }}
                    animate={{ opacity: [1, 0.35, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <span
                    className="text-[9px] font-bold uppercase tracking-[0.22em]"
                    style={{ color: 'rgba(6,182,212,0.8)' }}
                  >
                    Free Trial Activated
                  </span>
                </div>
                <motion.div
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(6,182,212,0.1)',
                    border: '1px solid rgba(6,182,212,0.25)',
                  }}
                  animate={{ opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Zap className="w-2.5 h-2.5" style={{ color: '#06b6d4' }} />
                  <span className="text-[8px] font-bold tracking-wider" style={{ color: 'rgba(6,182,212,0.9)' }}>
                    PREMIUM ACCESS
                  </span>
                </motion.div>
              </div>

              <div className="p-6 space-y-5">
                {/* ── Headline ─────────────────────────────────────────────── */}
                <div className="text-center space-y-1.5">
                  <motion.h2
                    className="text-[26px] font-bold leading-tight"
                    style={{
                      background: 'linear-gradient(135deg, #ffffff 0%, rgba(6,182,212,0.95) 45%, rgba(139,92,246,0.9) 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={p('card') ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
                  >
                    7 Days of Elite Access
                  </motion.h2>
                  <motion.p
                    className="text-[12px]"
                    style={{ color: 'rgba(255,255,255,0.42)' }}
                    initial={{ opacity: 0 }}
                    animate={p('card') ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut', delay: 0.22 }}
                  >
                    Full premium unlocked. No card required.
                  </motion.p>
                </div>

                {/* ── Countdown ────────────────────────────────────────────── */}
                <motion.div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(139,92,246,0.05) 100%)',
                    border: '1px solid rgba(6,182,212,0.16)',
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={p('card') ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.28 }}
                >
                  <CountdownDisplay trialEndsAt={trialEndsAt} />
                </motion.div>

                {/* ── Feature grid ─────────────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-2">
                  {FEATURES.map((feat, i) => {
                    const Icon = feat.icon;
                    return (
                      <motion.div
                        key={feat.label}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                        style={{
                          background: `linear-gradient(135deg, ${feat.glow.replace('0.35', '0.07')} 0%, rgba(255,255,255,0.03) 100%)`,
                          border: `1px solid ${feat.glow.replace('0.35', '0.18')}`,
                        }}
                        initial={{ opacity: 0, scale: 0.92, y: 8 }}
                        animate={
                          p('features')
                            ? { opacity: 1, scale: 1, y: 0 }
                            : { opacity: 0, scale: 0.92, y: 8 }
                        }
                        transition={{
                          duration: 0.45,
                          ease: [0.22, 1, 0.36, 1],
                          delay: 0.06 * i,
                        }}
                      >
                        <div
                          className="shrink-0 flex items-center justify-center size-7 rounded-lg"
                          style={{
                            background: feat.glow.replace('0.35', '0.12'),
                            border: `1px solid ${feat.glow.replace('0.35', '0.3')}`,
                          }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color: feat.color }} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold leading-none text-[#E6EAF0] truncate">
                            {feat.label}
                          </div>
                          <div className="text-[9px] mt-0.5 leading-none truncate" style={{ color: 'rgba(255,255,255,0.38)' }}>
                            {feat.sub}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* ── Skip hint ────────────────────────────────────────────── */}
                <motion.p
                  className="text-center text-[9px]"
                  style={{ color: 'rgba(255,255,255,0.2)' }}
                  initial={{ opacity: 0 }}
                  animate={p('breathe') ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.4 }}
                >
                  Click anywhere to continue
                </motion.p>
              </div>
            </div>

            {/* Ambient card glow */}
            <motion.div
              className="absolute -inset-4 rounded-[32px] pointer-events-none -z-10"
              style={{
                background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(6,182,212,0.12) 0%, transparent 70%)',
                filter: 'blur(20px)',
              }}
              animate={{ opacity: [0.6, 1, 0.6], scale: [0.96, 1.04, 0.96] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
