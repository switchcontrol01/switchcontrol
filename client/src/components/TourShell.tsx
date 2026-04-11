import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from '@/lib/motionTokens';
import { useLocation } from 'wouter';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { useTourStore } from '@/lib/tour-store';
import { TOUR_COMPLETION_TIMING, TOUR_STEP_TIMING, tourPalette } from '@/lib/tourMotionTokens';
import logoImg from '@/assets/logo.webp';

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

// ── "You're All Set" completion screen ───────────────────────────────────────
function CompletionMoment({ onDone, isPremium }: { onDone: () => void; isPremium?: boolean }) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), TOUR_COMPLETION_TIMING.holdMs);
    const t2 = setTimeout(() => setPhase('exit'), TOUR_COMPLETION_TIMING.exitMs);
    const t3 = setTimeout(onDone, TOUR_COMPLETION_TIMING.doneMs);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const isExiting = phase === 'exit';
  const cp = isPremium ? tourPalette.premium : tourPalette.free;
  const { c1, c2, c3, accentHex, accentHex2 } = cp;

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'rgba(4,3,14,0.97)' }}
      initial={{ opacity: 0, filter: 'blur(20px)', scale: 0.97 }}
      animate={isExiting
        ? { opacity: 0, filter: 'blur(28px)', scale: 1.06 }
        : { opacity: 1, filter: 'blur(0px)', scale: 1 }
      }
      transition={isExiting
        ? { duration: 1.4, ease: [0.4, 0, 0.8, 1] }
        : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Outer ambient halo — slow breathe */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80vw', height: '80vw',
          background: `radial-gradient(ellipse, ${c1}0.16) 0%, ${c1}0.06) 42%, transparent 68%)`,
          filter: 'blur(70px)',
        }}
        animate={{ opacity: [0.5, 1, 0.5], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Mid-ring glow — faster breathe */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '50vw', height: '50vw',
          background: `radial-gradient(ellipse, ${c2}0.28) 0%, ${c2}0.10) 38%, transparent 62%)`,
          filter: 'blur(40px)',
        }}
        animate={{ opacity: [0.4, 0.9, 0.4], scale: [0.97, 1.04, 0.97] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
      {/* Core orb — tight and bright */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '22vw', height: '22vw',
          background: `radial-gradient(ellipse, ${c3}0.45) 0%, ${c3}0.18) 50%, transparent 78%)`,
          filter: 'blur(20px)',
        }}
        animate={{ opacity: [0.55, 1, 0.55], scale: [0.94, 1.06, 0.94] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
      />

      {/* Center content */}
      <motion.div
        className="relative flex flex-col items-center gap-6 text-center z-10"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      >
        {/* Logo — bigger, with layered glow */}
        <div className="relative flex items-center justify-center mb-2">
          <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 200, height: 200,
              background: `radial-gradient(ellipse, ${c1}0.35) 0%, ${c2}0.14) 45%, transparent 72%)`,
              filter: 'blur(22px)',
            }}
            animate={{ opacity: [0.5, 1, 0.5], scale: [0.92, 1.08, 0.92] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 110, height: 110,
              background: `radial-gradient(ellipse, ${c3}0.55) 0%, transparent 70%)`,
              filter: 'blur(10px)',
            }}
            animate={{ opacity: [0.4, 0.85, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
          />
          <motion.img
            src={logoImg}
            alt="SwitchControl"
            className="w-24 h-24 object-contain rounded-[22%] relative z-10"
            draggable={false}
            animate={{
              filter: [
                `drop-shadow(0 0 10px ${accentHex}66)`,
                `drop-shadow(0 0 24px ${accentHex}99)`,
                `drop-shadow(0 0 10px ${accentHex}66)`,
              ],
            }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* "You're all set." — word-by-word blur-in */}
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
          {["You're", 'all', 'set.'].map((word, i) => (
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
            ? 'Full premium access unlocked. Every optimization is now yours.'
            : 'SwitchControl is configured and ready to boost your system.'}
        </motion.p>

        {/* Glowing accent line */}
        <motion.div
          className="relative"
          style={{ height: 2, borderRadius: 2, overflow: 'visible' }}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 200, opacity: 1 }}
          transition={{ delay: 1.7, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            style={{
              position: 'absolute', inset: 0, borderRadius: 2,
              background: `linear-gradient(90deg, transparent, ${accentHex}, ${accentHex2}, ${accentHex}, transparent)`,
              boxShadow: `0 0 10px 2px ${accentHex}88, 0 0 24px 4px ${accentHex}44`,
            }}
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
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [completing, setCompleting] = useState(false);
  // Defer rendering by one paint cycle so the app's own page fade-in has
  // time to settle before the tour overlay appears — prevents the dark-flash
  // glitch where the tour backdrop fires while the app is still mid-transition.
  const [visible, setVisible] = useState(false);
  const [, navigate] = useLocation();
  const { setTourHighlight, setTourActive } = useTourStore();

  const applyStep = useCallback((index: number) => {
    const s = steps[index];
    if (s?.sidebarHighlight) {
      setTourHighlight(s.sidebarHighlight);
      setTimeout(() => {
        const el = document.querySelector(`[data-tour="${s.sidebarHighlight}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, TOUR_STEP_TIMING.highlightScrollDelayMs);
    }
    if (s?.route) navigate(s.route);
  }, [steps, setTourHighlight, navigate]);

  // Gated visibility — defer one rAF tick after show=true so the underlying
  // page transition completes before the overlay paints.
  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }
    // requestAnimationFrame ensures the browser has flushed the current frame
    // (the app's fade-in) before we commit the overlay to the DOM.
    const raf = requestAnimationFrame(() => {
      setVisible(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [show]);

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
    }
  }, [show]);

  const step = steps[stepIndex];
  const total = steps.length;
  const isLast = stepIndex === total - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      setCompleting(true);
    } else {
      const nextIdx = stepIndex + 1;
      setDirection(1);
      setStepIndex(nextIdx);
      applyStep(nextIdx);
    }
  }, [isLast, stepIndex, applyStep]);

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
    (onSkip ?? onComplete)();
  }, [onSkip, onComplete, setTourActive, setTourHighlight]);

  const handleComplete = useCallback(() => {
    setTourActive(false);
    setTourHighlight(null);
    onComplete();
  }, [onComplete, setTourActive, setTourHighlight]);

  const pal = isPremium ? tourPalette.premium : tourPalette.free;

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="tour-root"
        className="fixed inset-0 z-[200] pointer-events-none"
        data-testid={testId}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.5 } }}
        transition={{ duration: 0.35 }}
      >
        {/* ── Dark overlay — only over the CONTENT area (right of sidebar) ── */}
        <div
          className="absolute inset-y-0 right-0 pointer-events-auto"
          style={{ left: 256 }}
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

        {/* ── Soft vignette on left edge of content area ── */}
        <div
          className="absolute inset-y-0 pointer-events-none"
          style={{
            left: 256, width: 80,
            background: `linear-gradient(90deg, ${pal.primary}0.12) 0%, transparent 100%)`,
            filter: 'blur(4px)',
          }}
        />

        {/* ── Cinematic completion overlay (fullscreen, over sidebar too) ── */}
        <AnimatePresence>
          {completing && (
            <motion.div
              key="completing"
              className="absolute inset-0 z-20 pointer-events-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <CompletionMoment onDone={handleComplete} isPremium={isPremium} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Step card — centered in content area ── */}
        {!completing && (
          <div
            className="absolute inset-y-0 right-0 flex items-center justify-center pointer-events-auto"
            style={{ left: 256 }}
          >
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={stepIndex}
                custom={direction}
                variants={{
                  enter: (dir: number) => ({ opacity: 0, x: dir * 70, scale: 0.96, y: 10 }),
                  center: { opacity: 1, x: 0, scale: 1, y: 0 },
                  exit: (dir: number) => ({ opacity: 0, x: dir * -70, scale: 0.96, y: -10 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-[460px] max-w-[calc(100vw-300px)] rounded-2xl overflow-hidden"
                style={{
                  background: pal.cardBg,
                  backdropFilter: 'blur(52px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(52px) saturate(180%)',
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
                      className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all"
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
                        Step {stepIndex + 1} of {total}
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
                          Premium
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
                    className="text-sm leading-relaxed text-white/55"
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
                          <ChevronLeft className="w-4 h-4 text-white/45" />
                        </motion.button>
                      )}
                      <motion.button
                        onClick={handleNext}
                        className="h-9 px-5 rounded-xl flex items-center gap-1.5 text-sm font-semibold text-white"
                        style={{ background: pal.btnBg, border: `1px solid ${pal.btnBorder}`, boxShadow: pal.btnShadow }}
                        whileHover={{ scale: 1.04, filter: 'brightness(1.15)' }}
                        whileTap={{ scale: 0.97 }}
                        data-testid={`${testId}-next`}
                      >
                        {isLast ? 'Finish' : 'Next'}
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
        )}
      </motion.div>
    </AnimatePresence>
  );
}
