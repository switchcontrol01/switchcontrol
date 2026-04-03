import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { useTourStore } from '@/lib/tour-store';
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

// ── Clean "You're All Set" completion screen ──────────────────────────────
function CompletionMoment({ onDone, isPremium }: { onDone: () => void; isPremium?: boolean }) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 2000);
    const t2 = setTimeout(() => setPhase('exit'), 4000);
    const t3 = setTimeout(onDone, 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const isExiting = phase === 'exit';
  const glowColor = isPremium ? 'rgba(251,191,36,' : 'rgba(139,92,246,';
  const accentHex  = isPremium ? '#fbbf24' : '#a855f7';

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'rgba(4,3,14,0.97)' }}
      initial={{ opacity: 0 }}
      animate={isExiting
        ? { opacity: 0, filter: 'blur(12px)' }
        : { opacity: 1, filter: 'blur(0px)' }
      }
      transition={isExiting
        ? { duration: 1.0, ease: [0.4, 0, 1, 1] }
        : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Single soft radial glow — centered */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '55vw', height: '55vw',
          background: `radial-gradient(ellipse, ${glowColor}0.12) 0%, transparent 68%)`,
          filter: 'blur(60px)',
        }}
      />

      {/* Center content */}
      <motion.div
        className="relative flex flex-col items-center gap-5 text-center z-10"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      >
        {/* Logo with gentle glow */}
        <div className="relative flex items-center justify-center mb-1">
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 120, height: 120,
              background: `radial-gradient(ellipse, ${glowColor}0.18) 0%, transparent 72%)`,
              filter: 'blur(18px)',
            }}
          />
          <img src={logoImg} alt="SwitchControl" className="w-16 h-16 object-contain rounded-[22%] relative z-10" draggable={false} />
        </div>

        {/* "You're all set." — staggered reveal */}
        <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-1">
          {["You're", 'all', 'set.'].map((word, i) => (
            <motion.span
              key={word}
              className="text-[38px] font-extrabold text-white leading-none tracking-tight"
              initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.4 + i * 0.15, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              {word}
            </motion.span>
          ))}
        </div>

        {/* Subtitle */}
        <motion.p
          className="text-[13px] max-w-[240px] leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {isPremium
            ? 'Full premium access unlocked. Every optimization is now yours.'
            : 'SwitchControl is configured and ready to boost your system.'}
        </motion.p>

        {/* Thin accent line */}
        <motion.div
          style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accentHex}99, transparent)` }}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 140, opacity: 1 }}
          transition={{ delay: 1.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </motion.div>
    </motion.div>
  );
}

// ── Subtle static backdrop — single color, no circus ─────────────────────────
function TourBackdrop({ isPremium }: { isPremium?: boolean }) {
  const glow = isPremium ? 'rgba(251,191,36,' : 'rgba(139,92,246,';
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top: '50%', left: '55%',
        transform: 'translate(-50%, -50%)',
        width: '60vw', height: '60vw',
        background: `radial-gradient(ellipse, ${glow}0.09) 0%, transparent 68%)`,
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
  const [, navigate] = useLocation();
  const { setTourHighlight, setTourActive } = useTourStore();

  const applyStep = useCallback((index: number) => {
    const s = steps[index];
    if (s?.sidebarHighlight) {
      setTourHighlight(s.sidebarHighlight);
      // Auto-scroll sidebar item into view after next render
      setTimeout(() => {
        const el = document.querySelector(`[data-tour="${s.sidebarHighlight}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
    if (s?.route) navigate(s.route);
  }, [steps, setTourHighlight, navigate]);

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

  const pal = isPremium
    ? {
        primary: 'rgba(251,191,36,',
        text: '#fbbf24',
        border: 'rgba(251,191,36,0.35)',
        iconBg: 'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.1))',
        iconBorder: 'rgba(251,191,36,0.3)',
        btnBg: 'linear-gradient(135deg, rgba(217,119,6,0.75), rgba(251,191,36,0.55))',
        btnBorder: 'rgba(251,191,36,0.45)',
        btnShadow: '0 4px 22px rgba(245,158,11,0.35)',
        topBar: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.6), rgba(245,158,11,0.4), transparent)',
        cardGlow: '0 0 80px rgba(251,191,36,0.08)',
        titleGrad: 'linear-gradient(90deg, #fde68a, #fbbf24, #f59e0b)',
        cardBg: 'linear-gradient(145deg, rgba(20,15,5,0.92) 0%, rgba(18,13,4,0.96) 100%)',
      }
    : {
        primary: 'rgba(139,92,246,',
        text: '#c084fc',
        border: 'rgba(168,85,247,0.22)',
        iconBg: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(168,85,247,0.1))',
        iconBorder: 'rgba(168,85,247,0.3)',
        btnBg: 'linear-gradient(135deg, rgba(109,40,217,0.9), rgba(168,85,247,0.7))',
        btnBorder: 'rgba(168,85,247,0.45)',
        btnShadow: '0 4px 22px rgba(139,92,246,0.38)',
        topBar: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.7), rgba(236,72,153,0.4), transparent)',
        cardGlow: '0 0 80px rgba(139,92,246,0.1)',
        titleGrad: 'linear-gradient(90deg, #e9d5ff, #c084fc, #a855f7)',
        cardBg: 'linear-gradient(145deg, rgba(14,10,28,0.92) 0%, rgba(10,8,24,0.96) 100%)',
      };


  if (!show) return null;

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
                            background: 'rgba(251,191,36,0.12)',
                            border: '1px solid rgba(251,191,36,0.2)',
                            color: 'rgba(251,191,36,0.8)',
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
                              background: i <= stepIndex
                                ? (isPremium ? 'linear-gradient(90deg, #fbbf24, #f59e0b)' : 'linear-gradient(90deg, #a855f7, #ec4899)')
                                : 'rgba(255,255,255,0.2)',
                              boxShadow: i === stepIndex
                                ? (isPremium ? '0 0 8px rgba(251,191,36,0.7)' : '0 0 8px rgba(168,85,247,0.7)')
                                : 'none',
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
