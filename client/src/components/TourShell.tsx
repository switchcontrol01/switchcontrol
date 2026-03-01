import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  targetSelector: string;
  route?: string;
  action?: React.ReactNode;
}

interface TourShellProps {
  show: boolean;
  steps: TourStep[];
  onComplete: () => void;
  onSkip?: () => void;
  canSkip?: boolean;
  returnRoute?: string;
  testId?: string;
}

const TIMING = {
  fadeOut: 220,
  scrollDuration: 600,
  spotlightFadeIn: 250,
};

function smoothScrollTo(container: Element | null, targetY: number, duration = TIMING.scrollDuration): Promise<void> {
  return new Promise(resolve => {
    const el = container || document.documentElement;
    const startY = container ? container.scrollTop : window.scrollY;
    const diff = targetY - startY;
    if (Math.abs(diff) < 2) { resolve(); return; }
    const start = performance.now();

    function step(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      if (container) {
        container.scrollTop = startY + diff * ease;
      } else {
        window.scrollTo(0, startY + diff * ease);
      }
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function getScrollContainer(): Element | null {
  return document.querySelector('.app-content') || null;
}

export function TourShell({ show, steps, onComplete, onSkip, canSkip = false, returnRoute, testId = "tour" }: TourShellProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [tooltipHeight, setTooltipHeight] = useState(260);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const prevStepRef = useRef(-1);
  const animFrameRef = useRef<number | null>(null);
  const prevShowRef = useRef(show);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (show && !prevShowRef.current) {
      setCurrentStep(0);
      setIsVisible(true);
      setIsTransitioning(false);
      setTargetRect(null);
      prevStepRef.current = -1;
    }
    prevShowRef.current = show;
  }, [show]);

  const step = steps[currentStep];
  const total = steps.length;
  const isLastStep = currentStep === total - 1;
  const progressPercent = ((currentStep + 1) / total) * 100;

  useEffect(() => {
    if (tooltipRef.current) {
      const h = tooltipRef.current.getBoundingClientRect().height;
      if (h > 0 && Math.abs(h - tooltipHeight) > 4) {
        setTooltipHeight(h);
      }
    }
  }, [currentStep, tooltipHeight]);

  const updateTargetPosition = useCallback(() => {
    if (!step) return;
    const target = document.querySelector(step.targetSelector);
    if (target) {
      setTargetRect(target.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step]);

  const scrollToTarget = useCallback(async () => {
    if (!step) return;
    const target = document.querySelector(step.targetSelector);
    if (!target) return;

    const container = getScrollContainer();
    const rect = target.getBoundingClientRect();
    const viewH = container ? container.clientHeight : window.innerHeight;
    const isFullyVisible = rect.top >= 0 && rect.bottom <= viewH;

    if (!isFullyVisible) {
      const scrollTop = container ? container.scrollTop : window.scrollY;
      const offsetTop = rect.top + scrollTop - viewH / 2 + rect.height / 2;
      await smoothScrollTo(container, Math.max(0, offsetTop));
    }
    updateTargetPosition();
  }, [step, updateTargetPosition]);

  const navigateToRoute = useCallback((route: string) => {
    const currentHash = window.location.hash.replace('#', '') || '/';
    if (currentHash !== route) {
      window.location.hash = route;
    }
  }, []);

  const waitForElement = useCallback(async (selector: string, maxWait = 2000): Promise<Element | null> => {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const el = document.querySelector(selector);
      if (el) return el;
      await new Promise(r => setTimeout(r, 50));
    }
    return document.querySelector(selector);
  }, []);

  const transitionToStep = useCallback(async (nextIdx: number) => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    await new Promise(r => setTimeout(r, TIMING.fadeOut));

    setCurrentStep(nextIdx);
    const nextStep = steps[nextIdx];

    if (nextStep?.route) {
      navigateToRoute(nextStep.route);
      await new Promise(r => setTimeout(r, 200));
    }

    const target = await waitForElement(nextStep?.targetSelector || '', nextStep?.route ? 2000 : 500);
    if (target) {
      const container = getScrollContainer();
      const rect = target.getBoundingClientRect();
      const viewH = container ? container.clientHeight : window.innerHeight;
      const isFullyVisible = rect.top >= 0 && rect.bottom <= viewH;

      if (!isFullyVisible) {
        const scrollTop = container ? container.scrollTop : window.scrollY;
        const offsetTop = rect.top + scrollTop - viewH / 2 + rect.height / 2;
        await smoothScrollTo(container, Math.max(0, offsetTop));
      }
    }

    updateTargetPosition();
    setIsTransitioning(false);
  }, [isTransitioning, steps, navigateToRoute, updateTargetPosition, waitForElement]);

  useEffect(() => {
    if (!show || !isVisible) return;

    const isNewStep = prevStepRef.current !== currentStep;
    prevStepRef.current = currentStep;

    if (isNewStep && currentStep === 0) {
      if (step?.route) {
        navigateToRoute(step.route);
        waitForElement(step.targetSelector, 2000).then(() => {
          scrollToTarget();
        });
      } else {
        scrollToTarget();
      }
    }

    updateTargetPosition();

    const onResize = () => updateTargetPosition();
    const onScroll = () => updateTargetPosition();
    window.addEventListener('resize', onResize);

    const container = getScrollContainer();
    if (container) {
      container.addEventListener('scroll', onScroll, { passive: true });
    } else {
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    const interval = setInterval(updateTargetPosition, 200);

    return () => {
      window.removeEventListener('resize', onResize);
      if (container) {
        container.removeEventListener('scroll', onScroll);
      } else {
        window.removeEventListener('scroll', onScroll);
      }
      clearInterval(interval);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [updateTargetPosition, currentStep, show, isVisible, step, navigateToRoute, scrollToTarget, waitForElement]);

  const handleNext = () => {
    if (isTransitioning) return;
    if (currentStep < total - 1) {
      transitionToStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (isTransitioning || currentStep <= 0) return;
    transitionToStep(currentStep - 1);
  };

  const handleComplete = async () => {
    setIsVisible(false);
    if (returnRoute) {
      navigateToRoute(returnRoute);
      const container = getScrollContainer();
      await smoothScrollTo(container, 0, 400);
    }
    setTimeout(onComplete, 400);
  };

  const handleSkip = () => {
    setIsVisible(false);
    if (returnRoute) {
      navigateToRoute(returnRoute);
    }
    setTimeout(() => onSkip?.() ?? onComplete(), 300);
  };

  if (!show) return null;

  const springTransition = prefersReducedMotion
    ? { type: 'tween' as const, duration: 0.15 }
    : { type: 'spring' as const, stiffness: 300, damping: 30 };

  const tooltipSpring = prefersReducedMotion
    ? { type: 'tween' as const, duration: 0.15 }
    : { type: 'spring' as const, stiffness: 400, damping: 28 };

  const getPlacement = (): 'top' | 'bottom' => {
    if (!targetRect) return 'bottom';
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;
    const effectiveHeight = tooltipHeight || 260;
    if (spaceBelow >= effectiveHeight + 20) return 'bottom';
    if (spaceAbove >= effectiveHeight + 20) return 'top';
    return spaceBelow >= spaceAbove ? 'bottom' : 'top';
  };

  const getTooltipPosition = () => {
    if (!targetRect) return { top: '50%', left: '50%', placement: 'bottom' as const };
    const padding = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const placement = getPlacement();
    const effectiveHeight = tooltipHeight || 260;

    let left = targetRect.left + targetRect.width / 2;
    left = Math.max(padding + 160, Math.min(left, viewportWidth - 160 - padding));

    let top: number;
    if (placement === 'top') {
      top = targetRect.top - padding - effectiveHeight;
    } else {
      top = targetRect.bottom + padding;
    }
    top = Math.max(padding, Math.min(top, viewportHeight - effectiveHeight - padding));

    return { top, left, placement };
  };

  const tooltipPos = getTooltipPosition();
  const placement = tooltipPos.placement;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.15 : 0.4 }}
          className="fixed inset-0 z-[100] select-none"
          data-testid={testId}
        >
          <div className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.03\'/%3E%3C/svg%3E")',
              backgroundRepeat: 'repeat',
            }}
          />

          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.12 }}
              transition={{ duration: prefersReducedMotion ? 0.3 : 1.5, ease: 'easeOut' }}
              style={{
                background: 'radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.25) 0%, transparent 60%)',
              }}
            />

            {!prefersReducedMotion && (
              <>
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 180,
                    height: 180,
                    background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                  }}
                  animate={{
                    x: ['-10%', '60%', '30%', '-10%'],
                    y: ['20%', '50%', '70%', '20%'],
                  }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 140,
                    height: 140,
                    background: 'radial-gradient(circle, rgba(236,72,153,0.06) 0%, transparent 70%)',
                    filter: 'blur(50px)',
                  }}
                  animate={{
                    x: ['70%', '20%', '50%', '70%'],
                    y: ['60%', '30%', '10%', '60%'],
                  }}
                  transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 100,
                    height: 100,
                    background: 'radial-gradient(circle, rgba(56,189,248,0.05) 0%, transparent 70%)',
                    filter: 'blur(35px)',
                  }}
                  animate={{
                    x: ['40%', '80%', '10%', '40%'],
                    y: ['80%', '20%', '50%', '80%'],
                  }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                />
              </>
            )}
          </div>

          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <mask id={`${testId}-spotlight-mask`}>
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {targetRect && (
                  <motion.rect
                    animate={{
                      x: targetRect.left - 8,
                      y: targetRect.top - 8,
                      width: targetRect.width + 16,
                      height: targetRect.height + 16,
                    }}
                    transition={springTransition}
                    rx="12"
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <motion.rect
              x="0" y="0" width="100%" height="100%"
              fill="rgba(0, 0, 0, 0.82)"
              mask={`url(#${testId}-spotlight-mask)`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: prefersReducedMotion ? 0.15 : 0.4 }}
            />
          </svg>

          {targetRect && (
            <motion.div
              className="absolute pointer-events-none"
              animate={{
                left: targetRect.left - 12,
                top: targetRect.top - 12,
                width: targetRect.width + 24,
                height: targetRect.height + 24,
              }}
              transition={springTransition}
            >
              <motion.div
                className="absolute inset-0 rounded-xl border-2 border-primary/40"
                animate={prefersReducedMotion ? {} : {
                  boxShadow: [
                    '0 0 0 2px rgba(139,92,246,0.2), 0 0 16px rgba(139,92,246,0.15)',
                    '0 0 0 3px rgba(139,92,246,0.4), 0 0 32px rgba(139,92,246,0.25)',
                    '0 0 0 2px rgba(139,92,246,0.2), 0 0 16px rgba(139,92,246,0.15)',
                  ]
                }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          )}

          <motion.div
            ref={tooltipRef}
            className="absolute pointer-events-auto"
            animate={{
              top: typeof tooltipPos.top === 'number' ? tooltipPos.top : undefined,
              left: typeof tooltipPos.left === 'number' ? tooltipPos.left : undefined,
              opacity: isTransitioning ? 0 : 1,
              scale: isTransitioning ? 0.96 : 1,
            }}
            style={{
              transform: 'translateX(-50%)',
              width: 'clamp(280px, 85vw, 420px)',
              maxHeight: '70vh',
            }}
            transition={tooltipSpring}
          >
            <div className="relative bg-gradient-to-br from-zinc-900/95 via-zinc-900/90 to-zinc-800/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-pink-500/4 pointer-events-none" />

              <motion.div
                className="h-[2px] bg-gradient-to-r from-primary via-pink-500 to-primary origin-left"
                animate={{ scaleX: progressPercent / 100 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />

              <div className="relative p-5 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 4px)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-pink-500/20 text-primary"
                      animate={prefersReducedMotion ? {} : { rotate: [0, 4, -4, 0], scale: [1, 1.04, 1] }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                    >
                      {step.icon}
                    </motion.div>
                    <div>
                      <h3 className="font-semibold text-white text-lg">{step.title}</h3>
                      <p className="text-xs text-muted-foreground">Step {currentStep + 1} of {total}</p>
                    </div>
                  </div>
                  {canSkip && (
                    <button
                      onClick={handleSkip}
                      className="text-xs text-muted-foreground hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                      data-testid={`${testId}-skip`}
                    >
                      Skip
                    </button>
                  )}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: prefersReducedMotion ? 0.1 : 0.25 }}
                  >
                    <p className="text-sm text-zinc-300 leading-relaxed mb-4">
                      {step.description}
                    </p>

                    {step.action && (
                      <div className="mb-4">
                        {step.action}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {steps.map((_, idx) => (
                      <motion.div
                        key={idx}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          idx === currentStep
                            ? 'w-6 bg-gradient-to-r from-primary to-pink-500'
                            : idx < currentStep
                            ? 'w-1.5 bg-primary/50'
                            : 'w-1.5 bg-white/20'
                        }`}
                        animate={idx === currentStep && !prefersReducedMotion ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ duration: 0.5 }}
                      />
                    ))}
                  </div>

                  <div className="flex gap-2">
                    {currentStep > 0 && (
                      <motion.button
                        onClick={handleBack}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl text-white/50 hover:text-white text-sm transition-colors hover:bg-white/5"
                        whileTap={{ scale: 0.98 }}
                        data-testid={`${testId}-back`}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                      </motion.button>
                    )}
                    <motion.button
                      onClick={handleNext}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-pink-500 text-white font-medium text-sm hover:opacity-90 transition-opacity"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      data-testid={`${testId}-next`}
                    >
                      {isLastStep ? 'Done' : 'Next'}
                      <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
