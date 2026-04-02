import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, Sparkles } from 'lucide-react';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
  targetSelector?: string;
  route?: string;
  sidebarHighlight?: string;
}

interface TourShellProps {
  show: boolean;
  steps: TourStep[];
  onComplete: () => void;
  onSkip?: () => void;
  canSkip?: boolean;
  testId?: string;
  returnRoute?: string;
}

function CompletionMoment({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        className="flex flex-col items-center gap-5 text-center"
        initial={{ scale: 0.75, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.1 }}
      >
        <motion.div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.4), rgba(168,85,247,0.25))',
            border: '1px solid rgba(168,85,247,0.4)',
            boxShadow: '0 0 40px rgba(139,92,246,0.5)',
          }}
          animate={{
            boxShadow: [
              '0 0 40px rgba(139,92,246,0.5)',
              '0 0 70px rgba(139,92,246,0.75)',
              '0 0 40px rgba(139,92,246,0.5)',
            ],
          }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles className="w-7 h-7 text-purple-200" />
        </motion.div>

        <div>
          <motion.p
            className="text-xl font-semibold text-white"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            You&apos;re all set
          </motion.p>
          <motion.p
            className="text-sm text-white/45 mt-1.5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            SwitchControl is ready to optimize your system
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
}

export function TourShell({
  show,
  steps,
  onComplete,
  onSkip,
  canSkip = false,
  testId = 'tour',
}: TourShellProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (show) {
      setStepIndex(0);
      setDirection(1);
      setCompleting(false);
    }
  }, [show]);

  const step = steps[stepIndex];
  const total = steps.length;
  const isLast = stepIndex === total - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      setCompleting(true);
    } else {
      setDirection(1);
      setStepIndex((i) => i + 1);
    }
  }, [isLast]);

  const handleBack = useCallback(() => {
    if (stepIndex > 0) {
      setDirection(-1);
      setStepIndex((i) => i - 1);
    }
  }, [stepIndex]);

  const handleSkip = useCallback(() => {
    (onSkip ?? onComplete)();
  }, [onSkip, onComplete]);

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="tour-root"
        className="fixed inset-0 z-[200] flex items-center justify-center"
        data-testid={testId}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

        {/* Completing state */}
        <AnimatePresence>
          {completing && (
            <motion.div
              key="completing"
              className="absolute inset-0 z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <CompletionMoment onDone={onComplete} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step card */}
        {!completing && (
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={stepIndex}
              custom={direction}
              variants={{
                enter: (dir: number) => ({
                  opacity: 0,
                  x: dir * 50,
                }),
                center: {
                  opacity: 1,
                  x: 0,
                },
                exit: (dir: number) => ({
                  opacity: 0,
                  x: dir * -50,
                }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 w-[440px] max-w-[calc(100vw-32px)] rounded-2xl p-7"
              style={{
                background: 'rgba(14, 12, 28, 0.85)',
                backdropFilter: 'blur(40px) saturate(150%)',
                WebkitBackdropFilter: 'blur(40px) saturate(150%)',
                border: '1px solid rgba(168,85,247,0.18)',
                boxShadow:
                  '0 32px 80px rgba(0,0,0,0.7), 0 0 80px rgba(139,92,246,0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
              data-testid={`${testId}-card`}
            >
              {/* Subtle purple top accent */}
              <div
                className="absolute top-0 left-8 right-8 h-px rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(168,85,247,0.5), transparent)',
                }}
              />

              {/* Skip */}
              {canSkip && (
                <button
                  onClick={handleSkip}
                  className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-white/25 hover:text-white/55 hover:bg-white/[0.05] transition-all"
                  data-testid={`${testId}-skip`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Icon + step counter */}
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'rgba(139,92,246,0.15)',
                    border: '1px solid rgba(168,85,247,0.25)',
                  }}
                >
                  {step?.icon}
                </div>
                <span className="text-[11px] text-white/30 font-medium uppercase tracking-widest">
                  {stepIndex + 1} / {total}
                </span>
              </div>

              {/* Content */}
              <h3 className="text-[17px] font-semibold text-white mb-2.5 leading-snug">
                {step?.title}
              </h3>
              <p className="text-sm text-white/50 leading-relaxed">
                {step?.description}
              </p>

              {/* Action slot */}
              {step?.action && <div className="mt-5">{step.action}</div>}

              {/* Footer */}
              <div className="flex items-center justify-between mt-8">
                {/* Progress dots */}
                <div className="flex items-center gap-1.5">
                  {steps.map((_, i) => (
                    <motion.div
                      key={i}
                      className="rounded-full"
                      animate={{
                        width: i === stepIndex ? 20 : 5,
                        opacity: i === stepIndex ? 1 : i < stepIndex ? 0.45 : 0.18,
                        background:
                          i === stepIndex
                            ? 'rgb(168,85,247)'
                            : 'rgba(255,255,255,0.6)',
                      }}
                      style={{ height: 5 }}
                      transition={{ duration: 0.28 }}
                    />
                  ))}
                </div>

                {/* Nav buttons */}
                <div className="flex items-center gap-2">
                  {stepIndex > 0 && (
                    <button
                      onClick={handleBack}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white/35 hover:text-white/65 hover:bg-white/[0.06] transition-all"
                      data-testid={`${testId}-back`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className="h-9 px-5 rounded-xl flex items-center gap-1.5 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.97]"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(139,92,246,0.7), rgba(168,85,247,0.5))',
                      border: '1px solid rgba(168,85,247,0.4)',
                      boxShadow: '0 4px 18px rgba(139,92,246,0.28)',
                    }}
                    data-testid={`${testId}-next`}
                  >
                    {isLast ? 'Done' : 'Next'}
                    {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
