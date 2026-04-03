import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { ChevronRight, ChevronLeft, X, Sparkles, CheckCircle2 } from 'lucide-react';
import { useTourStore } from '@/lib/tour-store';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
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

function seededRand(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ── Completion burst ─────────────────────────────────────────────────────────
function CompletionMoment({ onDone, isPremium }: { onDone: () => void; isPremium?: boolean }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);

  const color1 = isPremium ? 'rgba(251,191,36,0.7)' : 'rgba(139,92,246,0.7)';
  const color2 = isPremium ? 'rgba(245,158,11,0.5)' : 'rgba(236,72,153,0.5)';
  const glowColor = isPremium ? 'rgba(251,191,36,' : 'rgba(139,92,246,';

  const particles = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    id: i,
    angle: (i / 28) * Math.PI * 2,
    radius: 40 + seededRand(i * 7) * 60,
    size: 2 + seededRand(i * 13) * 4,
    delay: seededRand(i * 5) * 0.3,
    color: i % 3 === 0 ? color1 : i % 3 === 1 ? color2 : 'rgba(255,255,255,0.4)',
  })), []);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute" style={{ left: '50%', top: '50%' }}>
        {particles.map(p => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              width: p.size, height: p.size,
              marginLeft: -p.size / 2, marginTop: -p.size / 2,
              background: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
            animate={{
              x: Math.cos(p.angle) * p.radius,
              y: Math.sin(p.angle) * p.radius,
              opacity: [0, 1, 0],
              scale: [0, 1.5, 0],
            }}
            transition={{ duration: 0.9 + p.delay, delay: 0.2 + p.delay, ease: 'easeOut' }}
          />
        ))}
      </div>

      <motion.div
        className="flex flex-col items-center gap-5 text-center"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.1 }}
      >
        <div className="relative flex items-center justify-center">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="absolute rounded-full border"
              style={{ borderColor: i === 0 ? color1 : color2, opacity: 0 }}
              initial={{ width: 64, height: 64, opacity: 0.8 }}
              animate={{ width: 64 + (i + 1) * 44, height: 64 + (i + 1) * 44, opacity: 0 }}
              transition={{ duration: 1.2, delay: 0.3 + i * 0.22, ease: 'easeOut' }}
            />
          ))}
          <motion.div
            className="w-16 h-16 rounded-2xl flex items-center justify-center relative"
            style={{
              background: isPremium
                ? 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.15))'
                : 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(168,85,247,0.2))',
              border: `1px solid ${isPremium ? 'rgba(251,191,36,0.4)' : 'rgba(168,85,247,0.4)'}`,
            }}
            animate={{
              boxShadow: [
                `0 0 30px ${glowColor}0.4)`,
                `0 0 60px ${glowColor}0.7)`,
                `0 0 30px ${glowColor}0.4)`,
              ],
            }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            {isPremium
              ? <Sparkles className="w-7 h-7 text-amber-300" />
              : <CheckCircle2 className="w-7 h-7 text-purple-200" />
            }
          </motion.div>
        </div>

        <div>
          <motion.p className="text-xl font-bold text-white"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            {isPremium ? 'Premium Activated' : "You're all set"}
          </motion.p>
          <motion.p className="text-sm text-white/45 mt-1.5"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            {isPremium
              ? 'Full access unlocked. Let the gains begin.'
              : 'SwitchControl is ready to optimize your system'}
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
}

// ── Backdrop orbs that shift per step ────────────────────────────────────────
function BackdropOrbs({ stepIndex, isPremium }: { stepIndex: number; isPremium?: boolean }) {
  const hues = isPremium
    ? ['rgba(251,191,36,', 'rgba(245,158,11,', 'rgba(234,179,8,']
    : ['rgba(139,92,246,', 'rgba(236,72,153,', 'rgba(56,189,248,',
       'rgba(168,85,247,', 'rgba(20,184,166,', 'rgba(251,146,60,', 'rgba(99,102,241,'];
  const c  = hues[stepIndex % hues.length];
  const c2 = hues[(stepIndex + 1) % hues.length];
  return (
    <>
      <motion.div className="absolute pointer-events-none"
        style={{
          left: '40%', top: '20%', width: '50vw', height: '50vw',
          background: `radial-gradient(ellipse, ${c}0.14) 0%, transparent 70%)`,
          filter: 'blur(80px)',
        }}
        animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.1, 1] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div className="absolute pointer-events-none"
        style={{
          right: '10%', bottom: '20%', width: '35vw', height: '35vw',
          background: `radial-gradient(ellipse, ${c2}0.1) 0%, transparent 70%)`,
          filter: 'blur(70px)',
        }}
        animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.15, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
      />
    </>
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

  // Apply step's highlight + route whenever step changes
  const applyStep = useCallback((index: number) => {
    const s = steps[index];
    if (s?.sidebarHighlight) setTourHighlight(s.sidebarHighlight);
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

  // Accent palette
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

  const cardParticles = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    id: i,
    x: 10 + seededRand(i * 9) * 80,
    y: 10 + seededRand(i * 17) * 80,
    size: 1 + seededRand(i * 23) * 2,
    delay: seededRand(i * 7) * 2,
    dur: 2.5 + seededRand(i * 11) * 2,
  })), []);

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="tour-root"
        className="fixed inset-0 z-[200] pointer-events-none"
        data-testid={testId}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
      >
        {/* ── Dark overlay — only over the CONTENT area (right of sidebar) ── */}
        <div
          className="absolute inset-y-0 right-0 pointer-events-auto"
          style={{ left: 256 }}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(4,3,12,0.82)' }}
          />
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(200,180,255,0.8) 1px, transparent 1px)',
              backgroundSize: '36px 36px',
            }}
          />
          {/* Animated color orbs */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`orbs-${stepIndex}`}
              className="absolute inset-0"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.7 }}
            >
              <BackdropOrbs stepIndex={stepIndex} isPremium={isPremium} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Soft vignette on left edge of content area ── */}
        <div
          className="absolute inset-y-0 pointer-events-none"
          style={{
            left: 256,
            width: 80,
            background: `linear-gradient(90deg, ${pal.primary}0.12) 0%, transparent 100%)`,
            filter: 'blur(4px)',
          }}
        />

        {/* ── Completing state ── */}
        <AnimatePresence>
          {completing && (
            <motion.div
              key="completing"
              className="absolute inset-0 z-10 pointer-events-auto"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
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

                {/* Floating card particles */}
                {cardParticles.map(p => (
                  <motion.div
                    key={p.id}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      left: `${p.x}%`, top: `${p.y}%`,
                      width: p.size, height: p.size,
                      background: isPremium ? 'rgba(251,191,36,0.5)' : 'rgba(168,85,247,0.5)',
                    }}
                    animate={{ opacity: [0, 0.6, 0], y: [0, -14, 0] }}
                    transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
                  />
                ))}

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
                  <div className="flex items-center gap-3.5 mb-6">
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
                    className="text-[19px] font-bold leading-snug mb-3"
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

                  {step?.action && (
                    <motion.div className="mt-5"
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.15 }}
                    >
                      {step.action}
                    </motion.div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-8">
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
