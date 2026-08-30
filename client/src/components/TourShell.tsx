import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from '@/lib/motionTokens';
import { useLocation } from 'wouter';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { clearTourState, useTourStore } from '@/lib/tour-store';
import { TOUR_COMPLETION_TIMING, TOUR_STEP_TIMING, tourPalette } from '@/lib/tourMotionTokens';
import logoImg from '@/assets/logo.webp';
import { useTranslation } from '@/lib/i18n';
import {
  FIRST_RUN_TRANSITION_MS,
  firstRunTransition,
  firstRunVisualExit,
  firstRunVisualInitial,
  firstRunVisualVisible,
  useFirstRunReducedMotion,
} from '@/lib/firstRunTransition';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
  preview?: ReactNode;
  targetSelector?: string;
  route?: string;
  sidebarHighlight?: string;
  accentColor?: string;
}

interface TourShellProps {
  show: boolean;
  steps: TourStep[];
  onComplete: () => void;
  onSkip?: () => void;
  canSkip?: boolean;
  testId?: string;
  returnRoute?: string;
  isPremium?: boolean;
}

// ── Scene geometry — deterministic, computed once at module level ─────────────

// 28 particles across 3 size tiers, varied opacity + directional drift
const PARTICLES = Array.from({ length: 28 }, (_, i) => {
  const col = i % 7;
  const row = Math.floor(i / 7);
  return {
    id: i,
    // Stagger positions so no two overlap
    x: 6 + col * 13 + (row % 2) * 6.5,
    y: 8 + row * 22 + (col % 3) * 6,
    size: ([1, 1.6, 2.4] as const)[i % 3],
    opacity: ([0.16, 0.26, 0.38, 0.20] as const)[i % 4],
    // Slight x-drift for depth, upward y-drift
    driftX: ([-16, -8, 0, 8, 16, -11, 11] as const)[col],
    driftY: -(6 + (i % 5) * 5),
    duration: 5 + (i % 7) * 1.2,
    delay: (i * 0.33) % 5.2,
  };
});

// 5 diagonal light streaks — no two share the same angle/width pair
const STREAKS = [
  { left: '6%',  top: '10%', width: 340, angle: 27,  opacity: 0.07,  dur: 7,    delay: 0    },
  { left: '40%', top: '-4%', width: 500, angle: 19,  opacity: 0.05,  dur: 10,   delay: 1.6  },
  { left: '20%', top: '58%', width: 260, angle: 38,  opacity: 0.058, dur: 8.5,  delay: 0.9  },
  { left: '68%', top: '16%', width: 210, angle: 14,  opacity: 0.042, dur: 11.5, delay: 2.4  },
  { left: '52%', top: '72%', width: 170, angle: 31,  opacity: 0.034, dur: 6.5,  delay: 3.1  },
];

// ── "You're All Set" completion screen ───────────────────────────────────────
function CompletionMoment({
  onDone,
  isPremium,
  prefersReducedMotion,
}: {
  onDone: () => void;
  isPremium?: boolean;
  prefersReducedMotion: boolean;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');

  // Keep a stable ref so that parent re-renders (which produce new onDone
  // references from inline arrow functions) never restart the timers.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    const holdMs = prefersReducedMotion ? 0 : TOUR_COMPLETION_TIMING.holdMs;
    const exitMs = prefersReducedMotion ? 0 : TOUR_COMPLETION_TIMING.exitMs;
    const doneMs = prefersReducedMotion ? 0 : TOUR_COMPLETION_TIMING.doneMs;
    const t1 = setTimeout(() => { if (!cancelledRef.current) setPhase('hold'); }, holdMs);
    const t2 = setTimeout(() => { if (!cancelledRef.current) setPhase('exit'); }, exitMs);
    const t3 = setTimeout(() => { if (!cancelledRef.current) onDoneRef.current(); }, doneMs);
    return () => {
      cancelledRef.current = true;
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion]); // timers must run exactly once per motion mode

  const isExiting = phase === 'exit';
  const cp = isPremium ? tourPalette.premium : tourPalette.free;
  const { c1, c2, c3, accentHex, accentHex2 } = cp;

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'rgb(4,3,14)' }}
       {...firstRunVisualInitial()}
       animate={isExiting ? firstRunVisualExit() : firstRunVisualVisible()}
       transition={firstRunTransition(prefersReducedMotion)}
    >
      {/* ── Layer 1: Deep base gradient — upper-left purple bloom + lower-right blue-indigo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 80% 70% at 18% 22%, rgba(88,28,220,0.22) 0%, transparent 65%),
            radial-gradient(ellipse 65% 55% at 82% 78%, rgba(30,20,120,0.18) 0%, transparent 60%),
            radial-gradient(ellipse 100% 80% at 50% 50%, rgba(15,8,40,0.9) 0%, rgb(4,3,14) 70%)
          `,
        }}
      />

      {/* ── Layer 2: Secondary color accents — magenta shoulder + deep teal */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 55% 45% at 72% 15%, ${c1}0.10) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 28% 85%, ${c2}0.08) 0%, transparent 58%)
          `,
        }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* ── Layer 3: Diagonal sun / light streaks ─────────────────────────────── */}
      {STREAKS.map((s, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{
            left: s.left,
            top: s.top,
            width: s.width,
            height: 2,
            transformOrigin: 'left center',
            transform: `rotate(${s.angle}deg)`,
            background: `linear-gradient(90deg, transparent 0%, ${c1}${(s.opacity * 1.4).toFixed(2)}) 20%, ${c2}${s.opacity.toFixed(2)}) 55%, transparent 100%)`,
            filter: 'blur(1.5px)',
          }}
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{
            opacity: [0, s.opacity * 14, s.opacity * 10, s.opacity * 14, 0],
            scaleX: [0, 1, 1, 1, 0.6],
          }}
          transition={{
            duration: s.dur,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: s.delay,
            times: [0, 0.15, 0.5, 0.85, 1],
          }}
        />
      ))}

      {/* ── Layer 4: Outer ambient halo — slow breathe, wider */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '92vw', height: '85vw',
          background: `radial-gradient(ellipse, ${c1}0.20) 0%, ${c1}0.08) 40%, transparent 68%)`,
          filter: 'blur(80px)',
        }}
        animate={{ opacity: [0.55, 1, 0.55], scale: [0.94, 1.06, 0.94] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* ── Layer 5: Mid-ring glow — richer colour, tighter pulse */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '56vw', height: '52vw',
          background: `radial-gradient(ellipse, ${c2}0.32) 0%, ${c2}0.12) 36%, transparent 62%)`,
          filter: 'blur(44px)',
        }}
        animate={{ opacity: [0.45, 1, 0.45], scale: [0.96, 1.05, 0.96] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
      />

      {/* ── Layer 6: Core orb — tight, bright */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '26vw', height: '24vw',
          background: `radial-gradient(ellipse, ${c3}0.50) 0%, ${c3}0.20) 48%, transparent 76%)`,
          filter: 'blur(22px)',
        }}
        animate={{ opacity: [0.6, 1, 0.6], scale: [0.93, 1.07, 0.93] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.25 }}
      />

      {/* ── Layer 7: Particles ────────────────────────────────────────────────── */}
      {PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="absolute pointer-events-none rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.id % 3 === 0 ? c1 + '1)' : p.id % 3 === 1 ? c2 + '1)' : 'rgba(255,255,255,1)',
          }}
          animate={{
            opacity: [0, p.opacity, p.opacity * 0.6, p.opacity, 0],
            x: [0, p.driftX * 0.4, p.driftX, p.driftX * 0.7, p.driftX * 1.2],
            y: [0, p.driftY * 0.3, p.driftY, p.driftY * 1.4, p.driftY * 1.8],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: p.delay,
            times: [0, 0.2, 0.5, 0.75, 1],
          }}
        />
      ))}

      {/* ── Layer 8: Cinematic vignette — darkens edges, focuses center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 65% at 50% 50%, transparent 40%, rgba(3,2,12,0.55) 80%, rgba(2,1,10,0.85) 100%)',
        }}
      />

      {/* ── Center content (layout unchanged) ───────────────────────────────── */}
      <motion.div
        className="relative flex flex-col items-center gap-6 text-center z-10"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      >
        {/* Logo — with layered glow, subtle scale-breathe */}
        <div className="relative flex items-center justify-center mb-2">
          {/* Outer halo ring around logo */}
          <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 220, height: 220,
              background: `radial-gradient(ellipse, ${c1}0.40) 0%, ${c2}0.16) 42%, transparent 70%)`,
              filter: 'blur(28px)',
            }}
            animate={{ opacity: [0.45, 1, 0.45], scale: [0.90, 1.10, 0.90] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Inner corona */}
          <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 120, height: 120,
              background: `radial-gradient(ellipse, ${c3}0.60) 0%, transparent 68%)`,
              filter: 'blur(12px)',
            }}
            animate={{ opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut', delay: 0.35 }}
          />
          <motion.img
            src={logoImg}
            alt="SwitchControl"
            className="w-24 h-24 object-contain rounded-[22%] relative z-10"
            draggable={false}
            animate={{
              filter: [
                `drop-shadow(0 0 10px ${accentHex}55) drop-shadow(0 2px 20px ${accentHex}33)`,
                `drop-shadow(0 0 26px ${accentHex}99) drop-shadow(0 4px 36px ${accentHex}55)`,
                `drop-shadow(0 0 10px ${accentHex}55) drop-shadow(0 2px 20px ${accentHex}33)`,
              ],
              scale: [1, 1.025, 1],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* "You're all set." — word-by-word blur-in (unchanged) */}
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
          {t("You're all set.").split(' ').map((word, i) => (
            <motion.span
              key={word}
              className="text-[56px] font-extrabold leading-none tracking-tight"
              style={{
                color: i === 2 ? 'transparent' : 'white',
                backgroundImage: i === 2
                  ? `linear-gradient(135deg, ${accentHex} 0%, ${accentHex2} 55%, white 100%)`
                  : undefined,
                backgroundClip: i === 2 ? 'text' : undefined,
                WebkitBackgroundClip: i === 2 ? 'text' : undefined,
              }}
              initial={{ opacity: 0, y: 22, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.35 + i * 0.18, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              {word}
            </motion.span>
          ))}
        </div>

        {/* Subtitle */}
        <motion.p
          className="text-[15px] max-w-[310px] leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.55)' }}
          initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 1.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {isPremium
            ? t('Full premium access unlocked. Every optimization is now yours.')
            : t('SwitchControl is configured and ready to boost your system.')}
        </motion.p>

        {/* Glowing accent line — wider bloom, secondary halo */}
        <motion.div
          className="relative"
          style={{ height: 2, borderRadius: 2, overflow: 'visible' }}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 220, opacity: 1 }}
          transition={{ delay: 1.7, duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            style={{
              position: 'absolute', inset: 0, borderRadius: 2,
              background: `linear-gradient(90deg, transparent, ${accentHex}, ${accentHex2}, ${accentHex}, transparent)`,
              boxShadow: `0 0 12px 3px ${accentHex}99, 0 0 32px 6px ${accentHex}44, 0 0 60px 10px ${accentHex}1a`,
            }}
          />
          {/* Slow pulse on the line glow */}
          <motion.div
            style={{
              position: 'absolute', inset: 0, borderRadius: 2,
              background: `linear-gradient(90deg, transparent, ${accentHex2}55, ${accentHex}66, ${accentHex2}55, transparent)`,
            }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ── Subtle static backdrop — single color, no circus ─────────────────────────
function TourBackdrop({ isPremium }: { isPremium?: boolean }) {
  const pal = isPremium ? tourPalette.premium : tourPalette.free;
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top: '50%', left: '55%',
        transform: 'translate(-50%, -50%)',
        width: '60vw', height: '60vw',
        background: `radial-gradient(ellipse, ${pal.primary}0.09) 0%, transparent 68%)`,
        filter: 'blur(70px)',
      }}
    />
  );
}

// ── Main TourShell ───────────────────────────────────────────────────────────
export function TourShell({
  show,
  steps,
  onComplete,
  onSkip,
  canSkip = false,
  testId = 'tour',
  isPremium = false,
}: TourShellProps) {
  const { t } = useTranslation();
  const prefersReducedMotion = useFirstRunReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [completing, setCompleting] = useState(false);
  // Single-gate reveal: both backdrop AND card are mounted together at opacity:0,
  // then revealed together after a triple-rAF so layout is fully committed before
  // anything becomes visible. This eliminates the broken first-frame where the
  // backdrop was opaque but the card hadn't entered the DOM yet.
  const [mounted, setMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const rafRefs = useRef<number[]>([]);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasShownRef = useRef(false);
  // Tour wrappers commonly build their step array during render (for example
  // when a live trial countdown updates). Keep the current data available to
  // step navigation without changing the identity of applyStep. If applyStep
  // changes on every parent render, the show-effect below reinitializes the
  // tour and can turn the sidebar lock back on after completion.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const [, navigate] = useLocation();
  const { setTourHighlight, setTourActive, setTourNavigating } = useTourStore();

  // A parent can unmount the tour immediately (sign-out, reset, or an auth
  // rejection) without giving this component a render where show=false. Clear
  // the global lock on every unmount so the sidebar and future auth screen
  // cannot inherit stale tour state.
  useEffect(() => {
    return () => {
      clearTourState();
    };
  }, []);

  const applyStep = useCallback((index: number) => {
    const s = stepsRef.current[index];
    if (s?.sidebarHighlight) {
      setTourHighlight(s.sidebarHighlight);
      setTimeout(() => {
        const el = document.querySelector(`[data-tour="${s.sidebarHighlight}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, TOUR_STEP_TIMING.highlightScrollDelayMs);
    }
    if (s?.route) {
      // Raise the guard BEFORE navigate() so AppLayout's key expression already
      // sees isTourNavigating=true on its very next render and keeps the stable
      // "tour-stable-page" key (preventing AnimatePresence from unmounting the
      // page subtree).
      //
      // We clear the guard ourselves via double-rAF (two paint frames) so that
      // the new route's layout is fully committed before isTourNavigating resets.
      // We no longer rely on AppLayout's onAnimationComplete for this cleanup —
      // that callback only fires when the motion.div key actually changes (normal
      // navigation), not during tour navigation where the key stays stable.
      setTourNavigating(true);
      navigate(s.route);
      const outer = requestAnimationFrame(() => {
        const inner = requestAnimationFrame(() => {
          setTourNavigating(false);
        });
        rafRefs.current.push(inner);
      });
      rafRefs.current.push(outer);
    }
  }, [setTourHighlight, navigate, setTourNavigating]);

  // Unified reveal gate:
  // - On show: mount both elements at opacity:0, then after triple-rAF (three
  //   paint frames ensure full layout commit) flip revealed=true so both
  //   backdrop and card fade in together as one coordinated scene.
  // - On dismiss: flip revealed=false (both fade out), then after exit
  //   animations complete (~480ms) unmount everything.
  useEffect(() => {
    // Cancel any pending rAFs and timers from previous run
    rafRefs.current.forEach(cancelAnimationFrame);
    rafRefs.current = [];
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    if (!show) {
      if (wasShownRef.current) console.log('[TourTransition] tour dismissed — fading out');
      setRevealed(false);
      dismissTimerRef.current = setTimeout(() => {
        setMounted(false);
        if (wasShownRef.current) console.log('[TourTransition] unmounted');
      }, prefersReducedMotion ? 0 : FIRST_RUN_TRANSITION_MS);
      return;
    }

    // Mount both elements immediately — they start invisible (opacity:0 via
    // Framer initial props). No visible change on this frame.
    wasShownRef.current = true;
    setMounted(true);
    setRevealed(false);
    console.log('[TourTransition] mounted (invisible)');

    // Triple-rAF: mount → style → layout → commit → reveal
    // Three frames guarantee the browser has fully painted both elements
    // and calculated their final geometry before we make them visible.
    rafRefs.current = [];
    const r1 = requestAnimationFrame(() => {
      rafRefs.current.push(r1);
      const r2 = requestAnimationFrame(() => {
        rafRefs.current.push(r2);
        const r3 = requestAnimationFrame(() => {
          rafRefs.current.push(r3);
          setRevealed(true);
          console.log('[TourTransition] revealed — first visible frame');
        });
      });
    });
  }, [show, prefersReducedMotion]);

  useEffect(() => {
    if (show) {
      setStepIndex(0);
      setDirection(1);
      setCompleting(false);
      setTourActive(true);
      applyStep(0);
    } else {
      setTourActive(false);
      setTourHighlight(null);
      setTourNavigating(false);
      // Reset completing so the fullscreen completion layer's pointer-events-auto
      // overlay doesn't linger and block scroll/clicks after the tour exits.
      setCompleting(false);
    }
  }, [show, applyStep, setTourActive, setTourHighlight, setTourNavigating]);

  const step = steps[stepIndex];
  const total = steps.length;
  const isLast = stepIndex === total - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      // Navigate to the canonical dashboard route so the dashboard settles
      // on one consistent Route element.
      navigate('/dashboard');
      setTourHighlight(null);
      setCompleting(true);
    } else {
      const nextIdx = stepIndex + 1;
      setDirection(1);
      setStepIndex(nextIdx);
      applyStep(nextIdx);
    }
  }, [isLast, stepIndex, applyStep, navigate, setTourHighlight]);

  const handleBack = useCallback(() => {
    if (stepIndex > 0) {
      const prevIdx = stepIndex - 1;
      setDirection(-1);
      setStepIndex(prevIdx);
      applyStep(prevIdx);
    }
  }, [stepIndex, applyStep]);

  const handleSkip = useCallback(() => {
    setTourActive(false);
    setTourHighlight(null);
    setTourNavigating(false);
    (onSkip ?? onComplete)();
  }, [onSkip, onComplete, setTourActive, setTourHighlight, setTourNavigating]);

  const handleComplete = useCallback(() => {
    setTourActive(false);
    setTourHighlight(null);
    setTourNavigating(false);
    onComplete();
  }, [onComplete, setTourActive, setTourHighlight, setTourNavigating]);

  const pal = isPremium ? tourPalette.premium : tourPalette.free;

  return createPortal(
    <>
      {/* ══ Layer 1: Dark backdrop ═══════════════════════════════════════════════
           Mounts at opacity:0 (invisible). Only becomes visible once `revealed`
           is set — same tick as the card — so the user never sees the overlay
           without the card. No more broken first-frame.                         */}
      {mounted && (
        <motion.div
          key="tour-backdrop"
          className="fixed inset-0 z-[200] pointer-events-none"
          initial={{ opacity: 0, filter: "blur(18px)" }}
          animate={{
            opacity: revealed ? 1 : 0,
            filter: revealed ? "blur(0px)" : "blur(18px)",
          }}
           transition={firstRunTransition(prefersReducedMotion)}
        >
          {/* Dark overlay — only over the CONTENT area (right of sidebar) */}
          <div
            className="absolute inset-y-0 right-0"
            style={{ left: 256, pointerEvents: revealed ? 'auto' : 'none' }}
          >
            <div className="absolute inset-0" style={{ background: 'rgba(4,3,12,0.82)' }} />
            <div
              className="absolute inset-0 opacity-[0.025]"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(200,180,255,0.8) 1px, transparent 1px)',
                backgroundSize: '36px 36px',
              }}
            />
            <TourBackdrop isPremium={isPremium} />
          </div>
          {/* Soft vignette on left edge of content area */}
          <div
            className="absolute inset-y-0 pointer-events-none"
            style={{
              left: 256, width: 80,
              background: `linear-gradient(90deg, ${pal.primary}0.12) 0%, transparent 100%)`,
              filter: 'blur(4px)',
            }}
          />
        </motion.div>
      )}

      {/* ══ Layer 2: Tour card ═══════════════════════════════════════════════════
           Also mounts at opacity:0 alongside the backdrop. Reveals at the same
           tick as the backdrop via the shared `revealed` flag.                  */}
      {mounted && !completing && (
        <motion.div
          key="tour-card-layer"
          className="fixed inset-0 z-[201] pointer-events-none"
          data-testid={testId}
          initial={{ opacity: 0, filter: "blur(18px)" }}
          animate={{
            opacity: revealed ? 1 : 0,
            filter: revealed ? "blur(0px)" : "blur(18px)",
          }}
           transition={firstRunTransition(prefersReducedMotion)}
          onAnimationComplete={() => {
            if (revealed) console.log('[TourTransition] card fully visible');
          }}
        >
            {/* Step card — centered in content area */}
            <div
              className="absolute inset-y-0 right-0 flex items-center justify-center pointer-events-auto"
              style={{ left: 256 }}
            >
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={stepIndex}
                  custom={direction}
                   variants={{
                     enter: (dir: number) => ({
                       opacity: 0,
                       filter: 'blur(18px)',
                       x: dir * 70,
                       scale: 0.96,
                       y: 10,
                     }),
                     center: { opacity: 1, filter: 'blur(0px)', x: 0, scale: 1, y: 0 },
                     exit: (dir: number) => ({
                       opacity: 0,
                       filter: 'blur(18px)',
                       x: dir * -70,
                       scale: 0.96,
                       y: -10,
                     }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                   transition={firstRunTransition(prefersReducedMotion)}
                  className="relative w-[460px] max-w-[calc(100vw-300px)] rounded-2xl overflow-hidden"
                  style={{
                    background: pal.cardBg,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: `1px solid ${pal.border}`,
                    boxShadow: `0 32px 80px rgba(0,0,0,0.75), ${pal.cardGlow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
                  }}
                  data-testid={`${testId}-card`}
                >
                {/* Top accent bar */}
                <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: pal.topBar }} />

                {/* Corner glow */}
                <div
                  className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse, ${pal.primary}0.2) 0%, transparent 70%)`,
                    filter: 'blur(20px)',
                  }}
                />

                {/* Inner content */}
                <div className="p-7">
                  {canSkip && (
                    <button
                      onClick={handleSkip}
                      className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-[#6B7380]/50 hover:text-[#A0A8B3] hover:bg-[#21262D] transition-all"
                      data-testid={`${testId}-skip`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Icon + step label */}
                  <div className="flex items-center gap-3.5 mb-5">
                    <motion.div
                      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: pal.iconBg, border: `1px solid ${pal.iconBorder}` }}
                      animate={{
                        boxShadow: [
                          `0 0 0px ${pal.primary}0)`,
                          `0 0 22px ${pal.primary}0.4)`,
                          `0 0 0px ${pal.primary}0)`,
                        ],
                      }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      {step?.icon}
                    </motion.div>
                    <div className="flex flex-col gap-1">
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.18em]"
                        style={{ color: pal.text, opacity: 0.75 }}
                      >
                        {t('Step')} {stepIndex + 1} {t('of')} {total}
                      </span>
                      {isPremium && (
                        <span
                          className="text-[9px] font-semibold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-md w-fit"
                          style={{
                            background: `${pal.primary}0.12)`,
                            border: `1px solid ${pal.primary}0.2)`,
                            color: `${pal.primary}0.8)`,
                          }}
                        >
                          {t('Premium')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <motion.h3
                    className="text-[19px] font-bold leading-snug mb-2"
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span style={{ background: pal.titleGrad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      {step?.title}
                    </span>
                  </motion.h3>

                  {/* Description */}
                  <motion.p
                    className="text-sm leading-relaxed text-[#A0A8B3]"
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {step?.description}
                  </motion.p>

                  {/* Live preview showcase */}
                  {step?.preview && (
                    <motion.div
                      className="mt-4"
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {step.preview}
                    </motion.div>
                  )}

                  {step?.action && (
                    <motion.div className="mt-4"
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.18 }}
                    >
                      {step.action}
                    </motion.div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-6">
                    {/* Progress pills */}
                    <div className="flex items-center gap-1">
                      {steps.map((_, i) => (
                        <motion.div
                          key={i}
                          className="rounded-full overflow-hidden"
                          animate={{ width: i === stepIndex ? 22 : 5, opacity: i === stepIndex ? 1 : i < stepIndex ? 0.5 : 0.18 }}
                          style={{ height: 5 }}
                          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <div
                            className="w-full h-full rounded-full"
                            style={{
                              background: i <= stepIndex ? pal.pillActive : 'rgba(255,255,255,0.2)',
                              boxShadow:  i === stepIndex ? pal.pillGlow   : 'none',
                            }}
                          />
                        </motion.div>
                      ))}
                    </div>

                    {/* Nav buttons */}
                    <div className="flex items-center gap-2">
                      {stepIndex > 0 && (
                        <motion.button
                          onClick={handleBack}
                          className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
                          whileHover={{ scale: 1.05, background: 'rgba(255,255,255,0.08)' }}
                          whileTap={{ scale: 0.95 }}
                          data-testid={`${testId}-back`}
                        >
                          <ChevronLeft className="w-4 h-4 text-[#A0A8B3]" />
                        </motion.button>
                      )}
                      <motion.button
                        onClick={handleNext}
                        className="h-9 px-5 rounded-xl flex items-center gap-1.5 text-sm font-semibold text-[#E6EAF0]"
                        style={{ background: pal.btnBg, border: `1px solid ${pal.btnBorder}`, boxShadow: pal.btnShadow }}
                        whileHover={{ scale: 1.04, filter: 'brightness(1.15)' }}
                        whileTap={{ scale: 0.97 }}
                        data-testid={`${testId}-next`}
                      >
                        {isLast ? t('Finish') : t('Next')}
                        {!isLast && (
                          <motion.span
                            animate={{ x: [0, 3, 0] }}
                            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </motion.span>
                        )}
                      </motion.button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
            </div>
          </motion.div>
        )}

      {/* ══ Layer 3: Completion screen — fullscreen ════════════════════════════
           Sits above both backdrop and card layers (z-[210]).               */}
      <AnimatePresence>
        {completing && (
          <motion.div
            key="completing-fullscreen"
            className="fixed inset-0 z-[210] pointer-events-auto"
            {...firstRunVisualInitial()}
            animate={firstRunVisualVisible()}
            exit={firstRunVisualExit()}
            transition={firstRunTransition(prefersReducedMotion)}
          >
          <CompletionMoment
            onDone={handleComplete}
            isPremium={isPremium}
            prefersReducedMotion={prefersReducedMotion}
          />
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
