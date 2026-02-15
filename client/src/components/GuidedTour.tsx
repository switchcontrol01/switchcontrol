import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Sparkles, Cpu, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tourSelector: string;
}

const PREMIUM_TOUR_STEPS: TourStep[] = [
  {
    id: 'ai-advisor',
    title: 'AI Advisor',
    description: 'Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.',
    icon: <Sparkles className="w-5 h-5 text-purple-400" />,
    tourSelector: '[data-tour="ai-advisor"]',
  },
  {
    id: 'bios-advisor',
    title: 'BIOS Advisor',
    description: 'Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.',
    icon: <Cpu className="w-5 h-5 text-cyan-400" />,
    tourSelector: '[data-tour="bios-advisor"]',
  },
  {
    id: 'advanced-premium-tweaks',
    title: 'Advanced Premium Tweaks',
    description: 'Unlock the full library of advanced system optimizations — deep registry tweaks, network stack tuning, and performance profiles that free users can\'t access.',
    icon: <Crown className="w-5 h-5 text-amber-400" />,
    tourSelector: '[data-tour="advanced-premium-tweaks"]',
  },
];

const PREMIUM_TOUR_KEY = 'sc_premium_tour_completed';
const LUXURY_EASE = [0.22, 1, 0.36, 1] as const;

interface GuidedTourProps {
  show: boolean;
  onComplete: () => void;
}

export function GuidedTour({ show, onComplete }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [animatingStep, setAnimatingStep] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localStorage.getItem(PREMIUM_TOUR_KEY) === 'true') {
      setDismissed(true);
    }
  }, []);

  const measureTarget = useCallback((stepIndex: number) => {
    const step = PREMIUM_TOUR_STEPS[stepIndex];
    if (!step) return;
    const el = document.querySelector(step.tourSelector);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, []);

  useEffect(() => {
    if (!show || dismissed) return;
    measureTarget(currentStep);

    const handleResize = () => measureTarget(currentStep);
    window.addEventListener('resize', handleResize);
    const interval = setInterval(() => measureTarget(currentStep), 500);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(interval);
    };
  }, [show, dismissed, currentStep, measureTarget]);

  const changeStep = (next: number) => {
    setAnimatingStep(true);
    setTimeout(() => {
      setCurrentStep(next);
      setAnimatingStep(false);
    }, 200);
  };

  const handleNext = () => {
    if (currentStep < PREMIUM_TOUR_STEPS.length - 1) {
      changeStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      changeStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(PREMIUM_TOUR_KEY, 'true');
    setDismissed(true);
    onComplete();
  };

  if (!show || dismissed) return null;

  const step = PREMIUM_TOUR_STEPS[currentStep];
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const total = PREMIUM_TOUR_STEPS.length;

  const tooltipTop = targetRect
    ? Math.max(16, targetRect.top + targetRect.height / 2 - 90)
    : '50%';
  const tooltipLeft = targetRect
    ? targetRect.right + 20
    : '50%';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: animatingStep ? 0.7 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[150] pointer-events-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleComplete();
        }}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.85) 100%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        />

        {targetRect && !isMobile && (
          <>
            <motion.div
              className="absolute rounded-lg pointer-events-none"
              animate={{
                top: targetRect.top - 5,
                left: targetRect.left - 5,
                width: targetRect.width + 10,
                height: targetRect.height + 10,
              }}
              style={{
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.75), 0 0 30px 6px rgba(139,92,246,0.4)',
                border: '2px solid rgba(139,92,246,0.5)',
              }}
              transition={{ duration: 0.35, ease: [...LUXURY_EASE] }}
            />

            <motion.div
              className="absolute rounded-lg pointer-events-none"
              animate={{
                top: targetRect.top - 8,
                left: targetRect.left - 8,
                width: targetRect.width + 16,
                height: targetRect.height + 16,
                boxShadow: [
                  '0 0 12px 3px rgba(139,92,246,0.2)',
                  '0 0 22px 6px rgba(139,92,246,0.45)',
                  '0 0 12px 3px rgba(139,92,246,0.2)',
                ],
              }}
              transition={{
                top: { duration: 0.35, ease: [...LUXURY_EASE] },
                left: { duration: 0.35, ease: [...LUXURY_EASE] },
                width: { duration: 0.35, ease: [...LUXURY_EASE] },
                height: { duration: 0.35, ease: [...LUXURY_EASE] },
                boxShadow: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
              }}
            />
          </>
        )}

        {targetRect && isMobile && (
          <motion.div
            className="absolute rounded-lg pointer-events-none"
            animate={{
              top: targetRect.top - 4,
              left: targetRect.left - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
              boxShadow: [
                '0 0 0 9999px rgba(0,0,0,0.7), 0 0 15px 3px rgba(139,92,246,0.3)',
                '0 0 0 9999px rgba(0,0,0,0.7), 0 0 25px 5px rgba(139,92,246,0.5)',
                '0 0 0 9999px rgba(0,0,0,0.7), 0 0 15px 3px rgba(139,92,246,0.3)',
              ],
            }}
            style={{
              border: '2px solid rgba(139,92,246,0.4)',
            }}
            transition={{
              top: { duration: 0.35, ease: [...LUXURY_EASE] },
              left: { duration: 0.35, ease: [...LUXURY_EASE] },
              width: { duration: 0.35, ease: [...LUXURY_EASE] },
              height: { duration: 0.35, ease: [...LUXURY_EASE] },
              boxShadow: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
            }}
          />
        )}

        <AnimatePresence mode="wait">
          <motion.div
            ref={tooltipRef}
            key={step.id}
            initial={{ opacity: 0, y: isMobile ? 30 : 12, scale: 0.96, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: isMobile ? 20 : -8, scale: 0.97, filter: 'blur(3px)' }}
            transition={{ duration: 0.35, ease: [...LUXURY_EASE] }}
            className={
              isMobile
                ? "fixed bottom-0 left-0 right-0 bg-[hsl(260,30%,12%)]/95 backdrop-blur-xl border-t border-purple-500/25 rounded-t-2xl p-6 shadow-2xl"
                : "fixed bg-[hsl(260,30%,12%)]/95 backdrop-blur-xl border border-purple-500/25 rounded-2xl p-5 shadow-2xl w-80"
            }
            style={
              isMobile
                ? {}
                : {
                    top: typeof tooltipTop === 'number' ? tooltipTop : undefined,
                    left: typeof tooltipLeft === 'number' ? tooltipLeft : undefined,
                  }
            }
          >
            {!isMobile && targetRect && (
              <div
                className="absolute w-3 h-3 bg-[hsl(260,30%,12%)]/95 border-l border-b border-purple-500/25 rotate-45"
                style={{
                  left: -7,
                  top: Math.min(targetRect.height / 2 + 4, 44),
                }}
              />
            )}

            <button
              onClick={handleComplete}
              className="absolute top-3 right-3 p-1.5 text-white/30 hover:text-white/70 transition-colors rounded-lg hover:bg-white/5"
              data-testid="premium-tour-skip"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-purple-500/15 shrink-0 ring-1 ring-purple-500/20">
                {step.icon}
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">{step.title}</h3>
                <p className="text-[11px] text-purple-300/60 font-medium">
                  {currentStep + 1} / {total}
                </p>
              </div>
            </div>

            <p className="text-sm text-white/75 mb-5 leading-relaxed">
              {step.description}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {PREMIUM_TOUR_STEPS.map((_, i) => (
                  <motion.div
                    key={i}
                    className="h-1.5 rounded-full transition-colors duration-300"
                    animate={{
                      width: i === currentStep ? 20 : 8,
                      backgroundColor: i === currentStep
                        ? 'rgba(139,92,246,0.9)'
                        : i < currentStep
                        ? 'rgba(139,92,246,0.4)'
                        : 'rgba(255,255,255,0.15)',
                    }}
                    transition={{ duration: 0.3, ease: [...LUXURY_EASE] }}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                {currentStep > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    className="text-white/50 hover:text-white h-8 px-3"
                    data-testid="premium-tour-back"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="bg-purple-600 hover:bg-purple-700 h-8 px-4 shadow-lg shadow-purple-900/30"
                  data-testid="premium-tour-next"
                >
                  {currentStep === total - 1 ? 'Done' : 'Next'}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

export function usePremiumTourState() {
  const [showTour, setShowTour] = useState(false);

  const triggerTour = () => {
    if (localStorage.getItem(PREMIUM_TOUR_KEY) !== 'true') {
      setShowTour(true);
    }
  };

  const completeTour = () => {
    setShowTour(false);
  };

  return { showTour, triggerTour, completeTour };
}
