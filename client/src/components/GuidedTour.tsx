import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, 
  ChevronLeft, 
  Zap, 
  Wifi, 
  Cpu, 
  Sparkles, 
  Settings, 
  Mail, 
  Crown 
} from 'lucide-react';
import { useHashLocation } from 'wouter/use-hash-location';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  targetSelector: string;
  route: string;
  position: 'right' | 'bottom';
}

const PREMIUM_TOUR_STEPS: TourStep[] = [
  {
    id: 'power-plan',
    title: 'Power Plan',
    description: 'Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.',
    icon: <Zap className="w-5 h-5 text-amber-400" />,
    targetSelector: '[data-tour="power-plan"]',
    route: '/dashboard',
    position: 'right',
  },
  {
    id: 'network-tweaks',
    title: 'Network Tweaks',
    description: 'Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.',
    icon: <Wifi className="w-5 h-5 text-cyan-400" />,
    targetSelector: '[data-tour="network"]',
    route: '/dashboard',
    position: 'right',
  },
  {
    id: 'bios-advisor',
    title: 'BIOS Advisor',
    description: 'Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.',
    icon: <Cpu className="w-5 h-5 text-cyan-400" />,
    targetSelector: '[data-tour="bios-advisor"]',
    route: '/dashboard',
    position: 'right',
  },
  {
    id: 'ai-advisor',
    title: 'AI Advisor',
    description: 'Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.',
    icon: <Sparkles className="w-5 h-5 text-purple-400" />,
    targetSelector: '[data-tour="ai-advisor"]',
    route: '/dashboard',
    position: 'right',
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Manage your app preferences, sound effects, enhanced sensors, and account details — all in one place.',
    icon: <Settings className="w-5 h-5 text-gray-400" />,
    targetSelector: '[data-tour="settings"]',
    route: '/dashboard',
    position: 'right',
  },
  {
    id: 'support-email',
    title: 'Priority Email',
    description: 'Your dedicated support line — reach us anytime at switchcontrol67@gmail.com. We typically reply within 24 hours.',
    icon: <Mail className="w-5 h-5 text-emerald-400" />,
    targetSelector: '[data-tour="settings-email"]',
    route: '/settings',
    position: 'right',
  },
  {
    id: 'priority-support-unlocked',
    title: 'Priority Support Unlocked',
    description: "You now have direct access to our team. If you ever need help with tweaks, configs, or troubleshooting — we're one email away. Enjoy your Premium experience.",
    icon: <Crown className="w-5 h-5 text-amber-400" />,
    targetSelector: '[data-tour="settings-email"]',
    route: '/settings',
    position: 'right',
  },
];

const PREMIUM_TOUR_KEY = 'sc_premium_tour_completed';

interface GuidedTourProps {
  show: boolean;
  onComplete: () => void;
}

export function GuidedTour({ show, onComplete }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [, setLocation] = useHashLocation();

  const step = PREMIUM_TOUR_STEPS[currentStep];

  const updateTargetPosition = useCallback(() => {
    if (!step) return;
    const target = document.querySelector(step.targetSelector);
    if (target) {
      setTargetRect(target.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    if (!show || !isVisible) return;

    const currentHash = window.location.hash.replace('#', '') || '/';
    if (step.route && currentHash !== step.route) {
      setLocation(step.route);
      const navTimer = setTimeout(() => {
        updateTargetPosition();
      }, 500);
      return () => clearTimeout(navTimer);
    }

    updateTargetPosition();

    window.addEventListener('resize', updateTargetPosition);
    window.addEventListener('scroll', updateTargetPosition);
    const interval = setInterval(updateTargetPosition, 100);

    return () => {
      window.removeEventListener('resize', updateTargetPosition);
      window.removeEventListener('scroll', updateTargetPosition);
      clearInterval(interval);
    };
  }, [updateTargetPosition, currentStep, show, isVisible, step, setLocation]);

  const handleNext = () => {
    if (currentStep < PREMIUM_TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(PREMIUM_TOUR_KEY, 'true');
    setIsVisible(false);
    setTimeout(onComplete, 300);
  };

  if (!show || localStorage.getItem(PREMIUM_TOUR_KEY) === 'true') return null;

  const total = PREMIUM_TOUR_STEPS.length;
  const isLastStep = currentStep === total - 1;

  const getTooltipPosition = () => {
    if (!targetRect) return { top: '50%', left: '50%' };

    const padding = 20;
    const tooltipWidth = 320;
    const tooltipHeight = 200;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
    let left = targetRect.right + padding;

    left = Math.max(padding, Math.min(left, viewportWidth - tooltipWidth - padding));
    top = Math.max(padding, Math.min(top, viewportHeight - tooltipHeight - padding));

    return { top, left };
  };

  const tooltipPos = getTooltipPosition();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100]"
          data-testid="premium-guided-tour"
        >
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ mixBlendMode: 'normal' }}
          >
            <defs>
              <mask id="premium-spotlight-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {targetRect && (
                  <motion.rect
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    x={targetRect.left - 8}
                    y={targetRect.top - 8}
                    width={targetRect.width + 16}
                    height={targetRect.height + 16}
                    rx="12"
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            
            <motion.rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.85)"
              mask="url(#premium-spotlight-mask)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            />
          </svg>

          {targetRect && (
            <motion.div
              className="absolute pointer-events-none"
              style={{
                left: targetRect.left - 12,
                top: targetRect.top - 12,
                width: targetRect.width + 24,
                height: targetRect.height + 24,
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ 
                opacity: 1, 
                scale: 1,
                boxShadow: [
                  '0 0 0 2px rgba(139, 92, 246, 0.3), 0 0 20px rgba(139, 92, 246, 0.2)',
                  '0 0 0 4px rgba(139, 92, 246, 0.5), 0 0 40px rgba(139, 92, 246, 0.3)',
                  '0 0 0 2px rgba(139, 92, 246, 0.3), 0 0 20px rgba(139, 92, 246, 0.2)'
                ]
              }}
              transition={{ 
                boxShadow: { duration: 2, repeat: Infinity },
                default: { duration: 0.3 }
              }}
            >
              <div className="absolute inset-0 rounded-xl border-2 border-primary/50" />
            </motion.div>
          )}

          <motion.div
            className="absolute w-80 pointer-events-auto"
            style={{
              top: typeof tooltipPos.top === 'number' ? tooltipPos.top : tooltipPos.top,
              left: typeof tooltipPos.left === 'number' ? tooltipPos.left : tooltipPos.left,
            }}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            key={currentStep}
          >
            <div className="relative bg-gradient-to-br from-zinc-900/95 via-zinc-900/90 to-zinc-800/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-pink-500/5" />
              
              <div className="relative p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <motion.div 
                      className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-pink-500/20 text-primary"
                      animate={{ 
                        rotate: [0, 5, -5, 0],
                        scale: [1, 1.05, 1]
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      {step.icon}
                    </motion.div>
                    <div>
                      <h3 className="font-semibold text-white text-lg">{step.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        Step {currentStep + 1} of {total}
                      </p>
                    </div>
                  </div>
                </div>

                <motion.p 
                  className="text-sm text-zinc-300 leading-relaxed mb-5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  {step.description}
                </motion.p>

                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {PREMIUM_TOUR_STEPS.map((_, idx) => (
                      <motion.div
                        key={idx}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          idx === currentStep 
                            ? 'w-6 bg-gradient-to-r from-primary to-pink-500' 
                            : idx < currentStep 
                            ? 'w-1.5 bg-primary/50' 
                            : 'w-1.5 bg-white/20'
                        }`}
                        animate={idx === currentStep ? { scale: [1, 1.1, 1] } : {}}
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
                        data-testid="premium-tour-back"
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
                      data-testid="premium-tour-next"
                    >
                      {isLastStep ? 'Done' : 'Next'}
                      <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>

            {step.position === 'right' && targetRect && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full">
                <div className="w-4 h-4 rotate-45 bg-zinc-900 border-l border-b border-white/10" 
                  style={{ marginLeft: '-8px' }} 
                />
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function usePremiumTourState() {
  const [showTour, setShowTour] = useState(false);

  const triggerTour = useCallback(() => {
    if (localStorage.getItem(PREMIUM_TOUR_KEY) !== 'true') {
      console.log('[PremiumTour] Triggering premium guided tour');
      setShowTour(true);
    } else {
      console.log('[PremiumTour] Tour already completed, skipping');
    }
  }, []);

  const completeTour = useCallback(() => {
    console.log('[PremiumTour] Tour completed');
    setShowTour(false);
  }, []);

  return { showTour, triggerTour, completeTour };
}
