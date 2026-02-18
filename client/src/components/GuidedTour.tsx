import { useState, useEffect, useCallback, useRef } from 'react';
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
  Crown,
  Lock,
  Unlock
} from 'lucide-react';
import { useHashLocation } from 'wouter/use-hash-location';
import { useAuthStore, postTourSeen } from '@/lib/auth-store';

const TOOLTIP_HEIGHT = 280;

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  targetSelector: string;
  route: string;
  isPremiumSection?: boolean;
  highlightInfoButton?: boolean;
  infoButtonHint?: string;
}

const PREMIUM_TOUR_STEPS: TourStep[] = [
  {
    id: 'power-plan',
    title: 'Power Plan',
    description: 'Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.',
    icon: <Zap className="w-5 h-5 text-amber-400" />,
    targetSelector: '[data-tour="power-plan"]',
    route: '/dashboard',
    isPremiumSection: true,
  },
  {
    id: 'network-tweaks',
    title: 'Network Tweaks',
    description: 'Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.',
    icon: <Wifi className="w-5 h-5 text-cyan-400" />,
    targetSelector: '[data-tour="network"]',
    route: '/dashboard',
    isPremiumSection: true,
    highlightInfoButton: true,
    infoButtonHint: 'Each tweak contains detailed technical explanation. Click this icon to understand impact, expected change, and risk level.',
  },
  {
    id: 'bios-advisor',
    title: 'BIOS Advisor',
    description: 'Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.',
    icon: <Cpu className="w-5 h-5 text-cyan-400" />,
    targetSelector: '[data-tour="bios-advisor"]',
    route: '/dashboard',
    isPremiumSection: true,
  },
  {
    id: 'ai-advisor',
    title: 'AI Advisor',
    description: 'Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.',
    icon: <Sparkles className="w-5 h-5 text-purple-400" />,
    targetSelector: '[data-tour="ai-advisor"]',
    route: '/dashboard',
    isPremiumSection: true,
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Manage your app preferences, sound effects, enhanced sensors, and account details — all in one place.',
    icon: <Settings className="w-5 h-5 text-gray-400" />,
    targetSelector: '[data-tour="settings"]',
    route: '/dashboard',
  },
  {
    id: 'support-email',
    title: 'Priority Email',
    description: 'Your dedicated support line — reach us anytime at switchcontrol67@gmail.com. We typically reply within 24 hours.',
    icon: <Mail className="w-5 h-5 text-emerald-400" />,
    targetSelector: '[data-tour="settings-email"]',
    route: '/settings',
  },
  {
    id: 'priority-support-unlocked',
    title: 'Priority Support Unlocked',
    description: "You now have direct access to our team. If you ever need help with tweaks, configs, or troubleshooting — we're one email away. Enjoy your Premium experience.",
    icon: <Crown className="w-5 h-5 text-amber-400" />,
    targetSelector: '[data-tour="settings-email"]',
    route: '/settings',
  },
];

interface GuidedTourProps {
  show: boolean;
  onComplete: () => void;
}

function SectionUnlockSweep({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-[101] pointer-events-none flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.25, 0] }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{
          background: 'radial-gradient(ellipse at center, rgba(139, 92, 246, 0.3) 0%, rgba(139, 92, 246, 0.05) 60%, transparent 80%)',
          filter: 'blur(40px)',
        }}
      />

      <motion.div
        className="relative flex flex-col items-center gap-3"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <motion.div
          className="relative"
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.15, delay: 0.15 }}
          >
            <Lock className="w-8 h-8 text-purple-400" />
          </motion.div>
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0, rotate: -15 }}
            animate={{ opacity: 1, rotate: 0 }}
            transition={{ duration: 0.15, delay: 0.15 }}
          >
            <Unlock className="w-8 h-8 text-purple-300" />
          </motion.div>
        </motion.div>

        <motion.div
          className="absolute inset-0 rounded-full"
          initial={{ boxShadow: '0 0 0 0 rgba(139, 92, 246, 0)' }}
          animate={{ boxShadow: ['0 0 0 0 rgba(139, 92, 246, 0.4)', '0 0 30px 20px rgba(139, 92, 246, 0)'] }}
          transition={{ duration: 0.4, delay: 0.15 }}
          onAnimationComplete={onComplete}
        />
      </motion.div>
    </motion.div>
  );
}

function InfoButtonPulse({ rect }: { rect: DOMRect }) {
  return (
    <motion.div
      className="absolute pointer-events-none z-[102]"
      style={{
        left: rect.left - 6,
        top: rect.top - 6,
        width: rect.width + 12,
        height: rect.height + 12,
      }}
    >
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-purple-400/60"
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.8, 0, 0.8],
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-0 rounded-full border border-purple-300/40"
        animate={{
          scale: [1, 1.7, 1],
          opacity: [0.5, 0, 0.5],
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      />
    </motion.div>
  );
}

export function GuidedTour({ show, onComplete }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [showSweep, setShowSweep] = useState(false);
  const [tooltipReady, setTooltipReady] = useState(true);
  const [infoButtonRect, setInfoButtonRect] = useState<DOMRect | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState(TOOLTIP_HEIGHT);
  const [, setLocation] = useHashLocation();
  const prevStepRef = useRef(-1);
  const sweepPlayedRef = useRef(false);
  const highlightedInfoBtnRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const step = PREMIUM_TOUR_STEPS[currentStep];
  const total = PREMIUM_TOUR_STEPS.length;

  useEffect(() => {
    if (tooltipRef.current && tooltipReady) {
      const h = tooltipRef.current.getBoundingClientRect().height;
      if (h > 0 && h !== tooltipHeight) {
        setTooltipHeight(h);
      }
    }
  }, [currentStep, tooltipReady]);

  const cleanupInfoButton = useCallback(() => {
    if (highlightedInfoBtnRef.current) {
      highlightedInfoBtnRef.current.style.opacity = '';
      highlightedInfoBtnRef.current = null;
    }
    setInfoButtonRect(null);
  }, []);

  const updateTargetPosition = useCallback(() => {
    if (!step) return;
    const target = document.querySelector(step.targetSelector);
    if (target) {
      const rect = target.getBoundingClientRect();
      setTargetRect(rect);

      if (step.highlightInfoButton) {
        const infoBtn = target.querySelector(`[data-testid^="button-info-"]`)
          || target.parentElement?.querySelector(`[data-testid^="button-info-"]`);
        if (infoBtn) {
          const el = infoBtn as HTMLElement;
          if (highlightedInfoBtnRef.current !== el) {
            cleanupInfoButton();
          }
          el.style.opacity = '1';
          highlightedInfoBtnRef.current = el;
          setInfoButtonRect(el.getBoundingClientRect());
        }
      } else {
        cleanupInfoButton();
      }
    } else {
      setTargetRect(null);
      cleanupInfoButton();
    }
  }, [step, cleanupInfoButton]);

  useEffect(() => {
    if (!show || !isVisible) return;

    const isNewStep = prevStepRef.current !== currentStep;
    prevStepRef.current = currentStep;

    if (isNewStep && !step.highlightInfoButton) {
      cleanupInfoButton();
    }

    const currentHash = window.location.hash.replace('#', '') || '/';
    if (step.route && currentHash !== step.route) {
      setLocation(step.route);
      const navTimer = setTimeout(() => {
        updateTargetPosition();
        scrollTargetIntoView();
        if (isNewStep && step.isPremiumSection && !sweepPlayedRef.current) {
          sweepPlayedRef.current = true;
          triggerSweep();
        }
      }, 500);
      return () => clearTimeout(navTimer);
    }

    updateTargetPosition();

    requestAnimationFrame(() => {
      scrollTargetIntoView();
    });

    if (isNewStep && step.isPremiumSection && !sweepPlayedRef.current) {
      sweepPlayedRef.current = true;
      triggerSweep();
    }

    window.addEventListener('resize', updateTargetPosition);
    window.addEventListener('scroll', updateTargetPosition);
    const interval = setInterval(updateTargetPosition, 100);

    return () => {
      window.removeEventListener('resize', updateTargetPosition);
      window.removeEventListener('scroll', updateTargetPosition);
      clearInterval(interval);
    };
  }, [updateTargetPosition, currentStep, show, isVisible, step, setLocation, cleanupInfoButton]);

  const scrollTargetIntoView = () => {
    if (!step) return;
    const target = document.querySelector(step.targetSelector);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const isFullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!isFullyVisible) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => updateTargetPosition(), 400);
    }
  };

  const handleSweepComplete = useCallback(() => {
    setShowSweep(false);
    setTooltipReady(true);
  }, []);

  const triggerSweep = () => {
    setShowSweep(true);
    setTooltipReady(false);
    setTimeout(() => {
      setShowSweep(false);
      setTooltipReady(true);
    }, 600);
  };

  const handleNext = () => {
    if (currentStep < total - 1) {
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

  useEffect(() => {
    return () => {
      cleanupInfoButton();
    };
  }, [cleanupInfoButton]);

  const handleComplete = () => {
    cleanupInfoButton();
    setIsVisible(false);
    setTimeout(onComplete, 300);
  };

  if (!show) return null;

  const isLastStep = currentStep === total - 1;
  const progressPercent = ((currentStep + 1) / total) * 100;

  const getPlacement = (): 'top' | 'bottom' => {
    if (!targetRect) return 'bottom';
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;
    const effectiveHeight = tooltipHeight || TOOLTIP_HEIGHT;

    if (spaceBelow >= effectiveHeight + 20) return 'bottom';
    if (spaceAbove >= effectiveHeight + 20) return 'top';
    return spaceBelow >= spaceAbove ? 'bottom' : 'top';
  };

  const getTooltipPosition = () => {
    if (!targetRect) return { top: '50%', left: '50%' };

    const padding = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const placement = getPlacement();
    const effectiveHeight = tooltipHeight || TOOLTIP_HEIGHT;

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
  const placement = typeof tooltipPos === 'object' && 'placement' in tooltipPos ? tooltipPos.placement : 'bottom';

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

          {step.highlightInfoButton && infoButtonRect && (
            <InfoButtonPulse rect={infoButtonRect} />
          )}

          <AnimatePresence>
            {showSweep && <SectionUnlockSweep onComplete={handleSweepComplete} />}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {tooltipReady && (
              <motion.div
                ref={tooltipRef}
                className="absolute pointer-events-auto"
                style={{
                  top: typeof tooltipPos.top === 'number' ? tooltipPos.top : tooltipPos.top,
                  left: typeof tooltipPos.left === 'number' ? tooltipPos.left : tooltipPos.left,
                  transform: 'translateX(-50%)',
                  width: 'clamp(280px, 85vw, 420px)',
                  maxHeight: '70vh',
                }}
                initial={{ opacity: 0, y: placement === 'top' ? -20 : 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: placement === 'top' ? 10 : -10, scale: 0.95 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                key={currentStep}
              >
                <div className="relative bg-gradient-to-br from-zinc-900/95 via-zinc-900/90 to-zinc-800/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-pink-500/5" />
                  
                  <motion.div
                    className="h-[2px] bg-gradient-to-r from-primary via-pink-500 to-primary origin-left"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: progressPercent / 100 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  />

                  <div className="relative p-5 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 4px)' }}>
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
                      className="text-sm text-zinc-300 leading-relaxed mb-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.1 }}
                    >
                      {step.description}
                    </motion.p>

                    {step.highlightInfoButton && step.infoButtonHint && (
                      <motion.div
                        className="flex items-start gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 mb-4"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                      >
                        <div className="p-1 rounded-full bg-purple-500/20 shrink-0 mt-0.5">
                          <Sparkles className="w-3 h-3 text-purple-300" />
                        </div>
                        <p className="text-xs text-purple-200/80 leading-relaxed">
                          {step.infoButtonHint}
                        </p>
                      </motion.div>
                    )}

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
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function usePremiumTourState() {
  const [showTour, setShowTour] = useState(false);

  const triggerTour = useCallback(() => {
    const user = useAuthStore.getState().user;
    if (user?.isPremium === true && user?.hasSeenPremiumTour === false) {
      console.log('[PremiumTour] Triggering premium guided tour (server-driven)');
      setShowTour(true);
    } else {
      console.log(`[PremiumTour] Tour skipped — isPremium=${user?.isPremium} hasSeenPremiumTour=${user?.hasSeenPremiumTour}`);
    }
  }, []);

  const completeTour = useCallback(async () => {
    console.log('[PremiumTour] Tour completed — posting tour-seen to server');
    await postTourSeen();
    setShowTour(false);
  }, []);

  return { showTour, triggerTour, completeTour };
}
