import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Sparkles, Cpu, Zap, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tourSelector: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Your command center. View system stats, RAM usage, and run AI-powered optimization scans from here.',
    icon: <Sparkles className="w-5 h-5 text-purple-400" />,
    tourSelector: '[data-tour="dashboard"]',
  },
  {
    id: 'tweaks',
    title: 'System Tweaks',
    description: 'Browse and apply 38+ system optimizations. Each tweak is safe, explained, and fully reversible.',
    icon: <Zap className="w-5 h-5 text-yellow-400" />,
    tourSelector: '[data-tour="tweaks"]',
  },
  {
    id: 'network',
    title: 'Network Tweaks',
    description: 'Premium TCP/IP, UDP, and DNS optimizations to reduce your ping and improve online gaming performance.',
    icon: <Crown className="w-5 h-5 text-purple-400" />,
    tourSelector: '[data-tour="network"]',
  },
  {
    id: 'ai-advisor',
    title: 'BIOS Advisor',
    description: 'Expert BIOS configuration guidance. Get personalized recommendations for your specific hardware setup.',
    icon: <Cpu className="w-5 h-5 text-blue-400" />,
    tourSelector: '[data-tour="ai-advisor"]',
  },
];

const TOUR_STORAGE_KEY = 'sc_premium_tour_completed';

interface GuidedTourProps {
  show: boolean;
  onComplete: () => void;
}

export function GuidedTour({ show, onComplete }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const localCompleted = localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    if (localCompleted) {
      setDismissed(true);
    }
  }, []);

  const measureTarget = useCallback((stepIndex: number) => {
    const step = TOUR_STEPS[stepIndex];
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
    return () => window.removeEventListener('resize', handleResize);
  }, [show, dismissed, currentStep, measureTarget]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    setDismissed(true);
    onComplete();
  };

  if (!show || dismissed) return null;

  const step = TOUR_STEPS[currentStep];
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const tooltipTop = targetRect
    ? Math.max(16, targetRect.top + targetRect.height / 2 - 80)
    : '50%';
  const tooltipLeft = targetRect
    ? targetRect.right + 16
    : '50%';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] pointer-events-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleSkip();
        }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />

        {targetRect && !isMobile && (
          <>
            <motion.div
              className="absolute rounded-lg pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                top: targetRect.top - 4,
                left: targetRect.left - 4,
                width: targetRect.width + 8,
                height: targetRect.height + 8,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.7), 0 0 30px 4px rgba(139,92,246,0.5)',
                border: '2px solid rgba(139,92,246,0.6)',
              }}
              transition={{ duration: 0.3 }}
            />

            <motion.div
              className="absolute rounded-lg pointer-events-none"
              animate={{
                boxShadow: [
                  '0 0 15px 3px rgba(139,92,246,0.3)',
                  '0 0 25px 6px rgba(139,92,246,0.5)',
                  '0 0 15px 3px rgba(139,92,246,0.3)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                top: targetRect.top - 6,
                left: targetRect.left - 6,
                width: targetRect.width + 12,
                height: targetRect.height + 12,
              }}
            />
          </>
        )}

        <motion.div
          ref={tooltipRef}
          initial={{ opacity: 0, y: isMobile ? 40 : 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className={
            isMobile
              ? "fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-purple-500/30 rounded-t-2xl p-6 shadow-2xl"
              : "fixed bg-card/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-5 shadow-2xl w-80"
          }
          style={
            isMobile
              ? {}
              : {
                  top: typeof tooltipTop === 'number' ? tooltipTop : undefined,
                  left: typeof tooltipLeft === 'number' ? tooltipLeft : undefined,
                }
          }
          key={step.id}
        >
          {!isMobile && targetRect && (
            <div
              className="absolute w-3 h-3 bg-card/95 border-l border-b border-purple-500/30 rotate-45"
              style={{
                left: -7,
                top: Math.min(targetRect.height / 2 + 4, 40),
              }}
            />
          )}

          <button
            onClick={handleSkip}
            className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-white transition-colors"
            data-testid="tour-skip"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-500/20 shrink-0">
              {step.icon}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{step.title}</h3>
              <p className="text-[11px] text-muted-foreground">
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </p>
            </div>
          </div>

          <p className="text-sm text-white/80 mb-5 leading-relaxed">
            {step.description}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i === currentStep
                      ? 'bg-purple-500 scale-125'
                      : i < currentStep
                      ? 'bg-purple-500/50'
                      : 'bg-white/20'
                  }`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="text-muted-foreground h-8 px-3"
                  data-testid="tour-back-btn"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleNext}
                className="bg-purple-600 hover:bg-purple-700 h-8 px-4"
                data-testid="tour-next-btn"
              >
                {currentStep === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function usePremiumTourState() {
  const [showTour, setShowTour] = useState(false);

  const triggerTour = () => {
    const localCompleted = localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    if (!localCompleted) {
      setShowTour(true);
    }
  };

  const completeTour = () => {
    setShowTour(false);
  };

  return { showTour, triggerTour, completeTour };
}
