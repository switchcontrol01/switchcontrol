import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from '@/lib/motionTokens';
import { Zap, Clock, Brain, Cpu, Wifi, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { formatTrialCountdown, formatTrialEndsAt, getTrialTimeRemaining } from '@/lib/trialCountdown';
import logoImg from '@/assets/logo.webp';

interface Props {
  show: boolean;
  onComplete: () => void;
}

type Phase =
  | 'idle'
  | 'darken'
  | 'ring-appear'
  | 'card-reveal'
  | 'graph-draw'
  | 'text-reveal'
  | 'cta-reveal'
  | 'exiting'
  | 'done';

const PARTICLES = Array.from({ length: 48 }, (_, i) => ({
  id: i,
  angle: (i / 48) * Math.PI * 2 + (((i * 7919) % 100) / 100 - 0.5) * 0.4,
  dist: 80 + ((i * 6271) % 100) * 1.8,
  delay: ((i * 3571) % 100) / 100 * 0.4,
  dur: 0.55 + ((i * 4793) % 100) / 100 * 0.55,
  size: 1.5 + ((i * 2381) % 100) / 100 * 4,
  hue: 180 + ((i * 5483) % 100) * 0.8,
  opacity: 0.55 + ((i * 1987) % 100) / 100 * 0.45,
}));

const TRAILS = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  angle: (i / 16) * Math.PI * 2,
  dist: 100 + ((i * 4127) % 100) * 0.9,
  delay: ((i * 2311) % 100) / 100 * 0.15,
  dur: 0.7 + ((i * 3701) % 100) / 100 * 0.35,
  size: 1 + ((i * 1873) % 100) / 100 * 2.5,
}));

function PerformanceGraph({ visible }: { visible: boolean }) {
  const points = [
    [0, 72], [10, 68], [20, 74], [30, 65], [40, 70],
    [50, 58], [60, 45], [70, 38], [80, 30], [90, 22], [100, 18],
  ];
  const toSvg = (pts: number[][]) =>
    pts.map(([x, y]) => `${(x / 100) * 200},${y}`).join(' ');

  const fpsPoints = [
    [0, 60], [10, 62], [20, 58], [30, 65], [40, 60],
    [50, 72], [60, 80], [70, 88], [80, 92], [90, 95], [100, 97],
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl overflow-hidden"
      style={{
        background: "linear-gradient(145deg, rgba(6,182,212,0.07) 0%, rgba(139,92,246,0.05) 100%)",
        border: "1px solid rgba(6,182,212,0.18)",
      }}
    >
      <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(6,182,212,0.65)" }}>
          Performance Preview
        </span>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-0.5">
            <span className="size-1.5 rounded-full" style={{ background: "rgba(6,182,212,0.9)" }} />
            <span className="text-[8px]" style={{ color: "rgba(6,182,212,0.65)" }}>Latency</span>
          </span>
          <span className="flex items-center gap-0.5">
            <span className="size-1.5 rounded-full" style={{ background: "rgba(139,92,246,0.9)" }} />
            <span className="text-[8px]" style={{ color: "rgba(139,92,246,0.65)" }}>FPS</span>
          </span>
        </div>
      </div>

      <div className="px-2 pb-2">
        <svg viewBox="0 0 200 100" className="w-full h-16" preserveAspectRatio="none">
          <defs>
            <linearGradient id="trialCyanGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(6,182,212,0.35)" />
              <stop offset="100%" stopColor="rgba(6,182,212,0)" />
            </linearGradient>
            <linearGradient id="trialVioletGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(139,92,246,0.3)" />
              <stop offset="100%" stopColor="rgba(139,92,246,0)" />
            </linearGradient>
            <clipPath id="trialGraphClip">
              <motion.rect
                x="0" y="0" height="100"
                initial={{ width: 0 }}
                animate={visible ? { width: 200 } : { width: 0 }}
                transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              />
            </clipPath>
          </defs>

          <g clipPath="url(#trialGraphClip)">
            <polyline
              points={toSvg(points)}
              fill="none"
              stroke="rgba(6,182,212,0.9)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polygon
              points={`${toSvg(points)} 200,100 0,100`}
              fill="url(#trialCyanGrad)"
            />

            <polyline
              points={toSvg(fpsPoints)}
              fill="none"
              stroke="rgba(139,92,246,0.8)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polygon
              points={`${toSvg(fpsPoints)} 200,100 0,100`}
              fill="url(#trialVioletGrad)"
            />
          </g>
        </svg>

        <div className="mt-1 flex justify-between px-1">
          <div className="text-center">
            <div className="text-[8px]" style={{ color: "rgba(255,255,255,0.3)" }}>Before</div>
          </div>
          <div className="text-center">
            <div className="text-[8px]" style={{ color: "rgba(6,182,212,0.7)" }}>Premium Active →</div>
          </div>
          <div className="text-center">
            <div className="text-[8px]" style={{ color: "rgba(255,255,255,0.3)" }}>After</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function TrialCountdownRing({ trialEndsAt, visible }: { trialEndsAt: string | null; visible: boolean }) {
  const [countdown, setCountdown] = useState(() => formatTrialCountdown(trialEndsAt));
  const [remaining, setRemaining] = useState(() => getTrialTimeRemaining(trialEndsAt));

  useEffect(() => {
    if (!trialEndsAt) return;
    const tick = () => {
      setCountdown(formatTrialCountdown(trialEndsAt));
      setRemaining(getTrialTimeRemaining(trialEndsAt));
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [trialEndsAt]);

  const totalMs = trialEndsAt ? new Date(trialEndsAt).getTime() - Date.now() : 0;
  const maxMs = 7 * 24 * 60 * 60 * 1000;
  const fraction = Math.max(0, Math.min(1, totalMs / maxMs));
  const circumference = 2 * Math.PI * 38;
  const strokeDash = circumference * fraction;

  return (
    <motion.div
      className="flex flex-col items-center gap-2"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={visible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
        <svg width="88" height="88" viewBox="0 0 88 88" className="absolute inset-0 -rotate-90">
          <circle cx="44" cy="44" r="38" fill="none" stroke="rgba(6,182,212,0.12)" strokeWidth="3" />
          <motion.circle
            cx="44" cy="44" r="38"
            fill="none"
            stroke="url(#trialRingGrad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            initial={{ strokeDashoffset: circumference }}
            animate={visible ? { strokeDashoffset: circumference - strokeDash } : { strokeDashoffset: circumference }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          />
          <defs>
            <linearGradient id="trialRingGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(6,182,212,1)" />
              <stop offset="100%" stopColor="rgba(139,92,246,1)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="flex flex-col items-center z-10">
          <Clock className="w-4 h-4 mb-0.5" style={{ color: "rgba(6,182,212,0.9)" }} />
          {remaining.days > 0 ? (
            <>
              <span className="text-lg font-bold leading-none tabular-nums" style={{ color: "rgba(6,182,212,1)" }}>
                {remaining.days}d
              </span>
              <span className="text-[9px]" style={{ color: "rgba(6,182,212,0.6)" }}>{remaining.hours}h left</span>
            </>
          ) : (
            <>
              <span className="text-base font-bold leading-none tabular-nums" style={{ color: "rgba(6,182,212,1)" }}>
                {remaining.hours}h
              </span>
              <span className="text-[9px]" style={{ color: "rgba(6,182,212,0.6)" }}>{remaining.minutes}m left</span>
            </>
          )}
        </div>
      </div>
      <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.45)" }}>
        Ends {formatTrialEndsAt(trialEndsAt)}
      </p>
    </motion.div>
  );
}

export function TrialActivationAnimation({ show, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const user = useAuthStore(s => s.user);
  const trialEndsAt = user?.trialEndsAt ?? null;

  const prefersReduced = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  []);

  const advance = useCallback((delay: number, fn: () => void) => {
    const t = setTimeout(fn, delay);
    timersRef.current.push(t);
    return t;
  }, []);

  const skip = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase('exiting');
    const t = setTimeout(() => {
      setPhase('done');
      onCompleteRef.current();
    }, 400);
    timersRef.current.push(t);
  }, []);

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }

    console.log('[TrialAnimation] show=true, starting sequence, prefersReduced=', prefersReduced);

    if (prefersReduced) {
      setPhase('card-reveal');
      advance(600,  () => setPhase('graph-draw'));
      advance(1300, () => setPhase('text-reveal'));
      advance(2100, () => setPhase('cta-reveal'));
      advance(8100, () => {
        setPhase('exiting');
        advance(600, () => {
          setPhase('done');
          onCompleteRef.current();
        });
      });
      return;
    }

    setPhase('darken');
    advance(600,  () => setPhase('ring-appear'));
    advance(1400, () => setPhase('card-reveal'));
    advance(2500, () => setPhase('graph-draw'));
    advance(3700, () => setPhase('text-reveal'));
    advance(5000, () => setPhase('cta-reveal'));
    advance(10000, () => {
      setPhase('exiting');
      advance(800, () => {
        setPhase('done');
        onCompleteRef.current();
      });
    });

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [show]);

  const phaseIdx: Record<Phase, number> = {
    idle: 0, darken: 1, 'ring-appear': 2, 'card-reveal': 3,
    'graph-draw': 4, 'text-reveal': 5, 'cta-reveal': 6, exiting: 7, done: 8,
  };
  const p = (min: Phase) => phaseIdx[phase] >= phaseIdx[min];

  const isVisible = phase !== 'idle' && phase !== 'done';

  const particlesActive = p('ring-appear') && phase !== 'exiting';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'exiting' ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: phase === 'exiting' ? 0.65 : 0.3, ease: "easeInOut" }}
          onClick={skip}
          style={{ cursor: 'pointer' }}
        >
          {/* Dark overlay */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #020617 0%, #0a0f1e 50%, #060312 100%)" }}
          />

          {/* Ambient radial bloom — cyan */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(6,182,212,0.18) 0%, rgba(6,182,212,0.06) 40%, transparent 70%)",
            }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={p('ring-appear') ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Violet ambient bloom */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 40% 45% at 30% 70%, rgba(139,92,246,0.14) 0%, transparent 60%)",
            }}
            initial={{ opacity: 0 }}
            animate={p('card-reveal') ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />

          {/* Particles */}
          <AnimatePresence>
            {particlesActive && PARTICLES.map(pt => {
              const x = Math.cos(pt.angle) * pt.dist;
              const y = Math.sin(pt.angle) * pt.dist;
              return (
                <motion.div
                  key={pt.id}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: pt.size,
                    height: pt.size,
                    left: '50%',
                    top: '50%',
                    background: `hsla(${pt.hue}, 90%, 70%, ${pt.opacity})`,
                    boxShadow: `0 0 ${pt.size * 2}px hsla(${pt.hue}, 90%, 65%, 0.6)`,
                  }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                  animate={phase === 'ring-appear' ? {
                    x, y,
                    opacity: [0, pt.opacity, pt.opacity * 0.3, 0],
                    scale: [0, 1.2, 0.8, 0],
                  } : { x: x * 1.8, y: y * 1.8, opacity: 0, scale: 0 }}
                  transition={{
                    duration: pt.dur,
                    delay: pt.delay,
                    ease: "easeOut",
                  }}
                />
              );
            })}
          </AnimatePresence>

          {/* Trails */}
          <AnimatePresence>
            {phase === 'ring-appear' && TRAILS.map(tr => {
              const x = Math.cos(tr.angle) * tr.dist;
              const y = Math.sin(tr.angle) * tr.dist;
              return (
                <motion.div
                  key={`trail-${tr.id}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: tr.size,
                    height: tr.size * 3,
                    left: '50%',
                    top: '50%',
                    background: "linear-gradient(180deg, rgba(6,182,212,0.9) 0%, transparent 100%)",
                    transformOrigin: "50% 100%",
                    rotate: (tr.angle * 180 / Math.PI) + 90,
                    borderRadius: '50% 50% 50% 50% / 70% 70% 30% 30%',
                  }}
                  initial={{ x: 0, y: 0, scaleY: 0, opacity: 0 }}
                  animate={{ x, y, scaleY: [0, 1.2, 0], opacity: [0, 0.9, 0] }}
                  transition={{ duration: tr.dur, delay: tr.delay, ease: "easeOut" }}
                />
              );
            })}
          </AnimatePresence>

          {/* Access ring */}
          <motion.div
            className="absolute pointer-events-none"
            style={{ width: 160, height: 160, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={p('ring-appear') ? { scale: [0, 1.15, 1], opacity: [0, 1, 1] } : { scale: 0, opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <svg viewBox="0 0 160 160" className="w-full h-full">
              <defs>
                <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="rgba(6,182,212,1)" />
                  <stop offset="50%" stopColor="rgba(139,92,246,0.9)" />
                  <stop offset="100%" stopColor="rgba(59,130,246,0.8)" />
                </linearGradient>
              </defs>
              <circle cx="80" cy="80" r="72" fill="none" stroke="rgba(6,182,212,0.15)" strokeWidth="1.5" />
              <motion.circle
                cx="80" cy="80" r="72"
                fill="none"
                stroke="url(#ringGrad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="452"
                initial={{ strokeDashoffset: 452, rotate: -90 }}
                animate={p('ring-appear') ? { strokeDashoffset: 0 } : { strokeDashoffset: 452 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                style={{ transformOrigin: '80px 80px' }}
              />
            </svg>

            {/* Ring glow */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: "0 0 0 1px rgba(6,182,212,0.2), 0 0 32px rgba(6,182,212,0.25), 0 0 60px rgba(6,182,212,0.1)" }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>

          {/* Logo in ring center */}
          <motion.div
            className="absolute pointer-events-none"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
            initial={{ scale: 0, opacity: 0, filter: "blur(8px)" }}
            animate={p('ring-appear') ? { scale: 1, opacity: 1, filter: "blur(0px)" } : { scale: 0, opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          >
            <div className="relative">
              <img src={logoImg} alt="SwitchControl" className="w-10 h-10 object-contain select-none" />
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(6,182,212,0.3) 0%, transparent 70%)" }}
                animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0.4, 0.8] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </motion.div>

          {/* Main glass card */}
          <motion.div
            className="relative z-10 mx-auto"
            style={{ width: 340, maxWidth: "calc(100vw - 32px)" }}
            initial={{ opacity: 0, y: 40, scale: 0.96, filter: "blur(6px)" }}
            animate={p('card-reveal') ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" } : { opacity: 0, y: 40, scale: 0.96, filter: "blur(6px)" }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "linear-gradient(145deg, rgba(6,182,212,0.09) 0%, rgba(139,92,246,0.07) 50%, rgba(15,23,42,0.85) 100%)",
                border: "1px solid rgba(6,182,212,0.22)",
                boxShadow: "0 0 0 1px rgba(6,182,212,0.08), 0 24px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(6,182,212,0.15), 0 0 80px rgba(6,182,212,0.08)",
                backdropFilter: "blur(24px)",
              }}
            >
              {/* Top status bar */}
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{
                  background: "linear-gradient(90deg, rgba(6,182,212,0.14) 0%, rgba(139,92,246,0.08) 100%)",
                  borderBottom: "1px solid rgba(6,182,212,0.12)",
                }}
              >
                <div className="flex items-center gap-2">
                  <motion.div
                    className="size-2 rounded-full"
                    style={{ background: "#06b6d4" }}
                    animate={{ opacity: [1, 0.4, 1], scale: [1, 0.85, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(6,182,212,0.85)" }}>
                    Free Trial Activated
                  </span>
                </div>
                <motion.div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(6,182,212,0.12)",
                    border: "1px solid rgba(6,182,212,0.28)",
                  }}
                  animate={{ opacity: [1, 0.7, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Zap className="w-2.5 h-2.5" style={{ color: "#06b6d4" }} />
                  <span className="text-[8px] font-bold" style={{ color: "rgba(6,182,212,0.9)" }}>PREMIUM ACCESS</span>
                </motion.div>
              </div>

              <div className="p-5 space-y-4">
                {/* Main heading */}
                <motion.div
                  className="text-center space-y-1"
                  initial={{ opacity: 0, y: 8 }}
                  animate={p('text-reveal') ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <h2
                    className="text-[22px] font-bold leading-tight"
                    style={{
                      background: "linear-gradient(135deg, #ffffff 0%, rgba(6,182,212,0.95) 50%, rgba(139,92,246,0.9) 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    Premium Unlocked
                  </h2>
                  <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Your free trial gives you temporary elite access
                  </p>
                </motion.div>

                {/* Countdown ring + features split layout */}
                <div className="flex items-start gap-4">
                  <TrialCountdownRing trialEndsAt={trialEndsAt} visible={p('text-reveal')} />

                  {/* Feature access list */}
                  <motion.div
                    className="flex-1 space-y-1.5"
                    initial={{ opacity: 0, x: 10 }}
                    animate={p('text-reveal') ? { opacity: 1, x: 0 } : { opacity: 0, x: 10 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                  >
                    {[
                      { icon: Brain, label: "AI Advisor", color: "rgba(139,92,246,0.9)" },
                      { icon: Cpu, label: "BIOS Advisor", color: "rgba(6,182,212,0.9)" },
                      { icon: Wifi, label: "Network Tweaks", color: "rgba(59,130,246,0.9)" },
                      { icon: Zap, label: "Power Plans", color: "rgba(52,211,153,0.9)" },
                    ].map((feat, i) => (
                      <motion.div
                        key={feat.label}
                        className="flex items-center gap-2 py-1 px-2 rounded-lg"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                        initial={{ opacity: 0, x: 8 }}
                        animate={p('text-reveal') ? { opacity: 1, x: 0 } : { opacity: 0, x: 8 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.12 + i * 0.07 }}
                      >
                        <feat.icon className="w-3 h-3 shrink-0" style={{ color: feat.color }} />
                        <span className="text-[10.5px] font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>
                          {feat.label}
                        </span>
                        <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: feat.color, boxShadow: `0 0 4px ${feat.color}` }} />
                      </motion.div>
                    ))}
                  </motion.div>
                </div>

                {/* Graph */}
                <PerformanceGraph visible={p('graph-draw')} />

                {/* CTA */}
                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={p('cta-reveal') ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.button
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[13px] relative overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, rgba(6,182,212,0.9) 0%, rgba(139,92,246,0.85) 100%)",
                      boxShadow: "0 0 0 1px rgba(6,182,212,0.3), 0 4px 20px rgba(6,182,212,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
                      color: "#ffffff",
                    }}
                    whileHover={{ scale: 1.015, boxShadow: "0 0 0 1px rgba(6,182,212,0.5), 0 8px 30px rgba(6,182,212,0.4), inset 0 1px 0 rgba(255,255,255,0.2)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={(e) => { e.stopPropagation(); skip(); }}
                    data-testid="trial-activation-cta"
                  >
                    <motion.div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }}
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "linear", repeatDelay: 1.5 }}
                    />
                    <Zap className="w-4 h-4" />
                    Start Exploring Premium
                    <ChevronRight className="w-3.5 h-3.5" />
                  </motion.button>

                  <p className="text-center text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                    Click anywhere to continue
                  </p>
                </motion.div>
              </div>
            </div>

            {/* Outer card glow */}
            <motion.div
              className="absolute -inset-px rounded-2xl pointer-events-none"
              style={{ boxShadow: "0 0 40px rgba(6,182,212,0.15), 0 0 80px rgba(6,182,212,0.06)" }}
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
