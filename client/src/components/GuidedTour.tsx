import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Sparkles, Cpu, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  highlight?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'ai-advisor',
    title: 'AI Advisor',
    description: 'Get personalized optimization recommendations powered by AI. Scans your system and suggests the best tweaks.',
    icon: <Sparkles className="w-5 h-5 text-purple-400" />,
    highlight: 'ai-advisor',
  },
  {
    id: 'bios-advisor',
    title: 'BIOS Advisor',
    description: 'Expert guidance for BIOS settings to maximize gaming performance and reduce input lag.',
    icon: <Cpu className="w-5 h-5 text-blue-400" />,
    highlight: 'bios-advisor',
  },
  {
    id: 'premium-tweaks',
    title: 'Premium Tweaks',
    description: 'Access advanced system optimizations that were previously locked. All premium features are now available.',
    icon: <Zap className="w-5 h-5 text-yellow-400" />,
    highlight: 'premium-tweaks',
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

  useEffect(() => {
    const localCompleted = localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    if (localCompleted) {
      setDismissed(true);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
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

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className="relative w-full max-w-md bg-card/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-6 shadow-2xl"
        >
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-white transition-colors"
            data-testid="tour-skip"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/20">
              {step.icon}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{step.title}</h3>
              <p className="text-xs text-muted-foreground">
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </p>
            </div>
          </div>

          <p className="text-sm text-white/80 mb-6 leading-relaxed">
            {step.description}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === currentStep ? 'bg-purple-500' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-muted-foreground"
                data-testid="tour-skip-btn"
              >
                Skip
              </Button>
              <Button
                size="sm"
                onClick={handleNext}
                className="bg-purple-600 hover:bg-purple-700"
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
