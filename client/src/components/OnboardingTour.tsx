import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { 
  Sparkles, 
  Cpu, 
  Wifi, 
  Zap, 
  Shield, 
  Settings,
  ChevronRight,
  X
} from "lucide-react";

interface TourStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  position: "top" | "bottom" | "left" | "right";
}

const tourSteps: TourStep[] = [
  {
    id: "dashboard",
    targetSelector: '[data-tour="dashboard"]',
    title: "Dashboard Overview",
    description: "Monitor your system's performance in real-time. View CPU, GPU, RAM usage and disk health at a glance.",
    icon: <Sparkles className="w-5 h-5" />,
    position: "right"
  },
  {
    id: "ai-advisor",
    targetSelector: '[data-tour="ai-advisor"]',
    title: "System Advisor",
    description: "Get personalized optimization recommendations based on your current system configuration.",
    icon: <Cpu className="w-5 h-5" />,
    position: "right"
  },
  {
    id: "tweaks",
    targetSelector: '[data-tour="tweaks"]',
    title: "System Tweaks",
    description: "Apply proven Windows optimizations to reduce latency and boost FPS in your favorite games.",
    icon: <Zap className="w-5 h-5" />,
    position: "right"
  },
  {
    id: "network",
    targetSelector: '[data-tour="network"]',
    title: "Network Optimization",
    description: "Fine-tune your network settings for lower ping and more stable online gaming.",
    icon: <Wifi className="w-5 h-5" />,
    position: "right"
  },
  {
    id: "security",
    targetSelector: '[data-tour="security"]',
    title: "Security Center",
    description: "Keep your system secure without sacrificing gaming performance.",
    icon: <Shield className="w-5 h-5" />,
    position: "right"
  },
  {
    id: "settings",
    targetSelector: '[data-tour="settings"]',
    title: "Settings",
    description: "Customize SwitchControl to fit your preferences and manage your account.",
    icon: <Settings className="w-5 h-5" />,
    position: "right"
  }
];

interface OnboardingTourProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function OnboardingTour({ onComplete, onSkip }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  const step = tourSteps[currentStep];

  const updateTargetPosition = useCallback(() => {
    if (!step) return;
    const target = document.querySelector(step.targetSelector);
    if (target) {
      const rect = target.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    updateTargetPosition();
    window.addEventListener("resize", updateTargetPosition);
    window.addEventListener("scroll", updateTargetPosition);
    
    const interval = setInterval(updateTargetPosition, 100);
    
    return () => {
      window.removeEventListener("resize", updateTargetPosition);
      window.removeEventListener("scroll", updateTargetPosition);
      clearInterval(interval);
    };
  }, [updateTargetPosition, currentStep]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      setIsVisible(false);
      setTimeout(onComplete, 300);
    }
  };

  const handleSkip = () => {
    setIsVisible(false);
    setTimeout(onSkip, 300);
  };

  const getTooltipPosition = () => {
    if (!targetRect) return { top: "50%", left: "50%" };
    
    const padding = 20;
    const tooltipWidth = 320;
    const tooltipHeight = 180;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let top: number;
    let left: number;
    
    switch (step.position) {
      case "right":
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.right + padding;
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.left - tooltipWidth - padding;
        break;
      case "bottom":
        top = targetRect.bottom + padding;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case "top":
        top = targetRect.top - tooltipHeight - padding;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      default:
        return { top: "50%", left: "50%" };
    }
    
    // Clamp to viewport bounds
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
          data-testid="onboarding-tour"
        >
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ mixBlendMode: "normal" }}
          >
            <defs>
              <mask id="spotlight-mask">
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
              <filter id="blur-filter">
                <feGaussianBlur stdDeviation="2" />
              </filter>
            </defs>
            
            <motion.rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.85)"
              mask="url(#spotlight-mask)"
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
                  "0 0 0 2px rgba(139, 92, 246, 0.3), 0 0 20px rgba(139, 92, 246, 0.2)",
                  "0 0 0 4px rgba(139, 92, 246, 0.5), 0 0 40px rgba(139, 92, 246, 0.3)",
                  "0 0 0 2px rgba(139, 92, 246, 0.3), 0 0 20px rgba(139, 92, 246, 0.2)"
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
              top: typeof tooltipPos.top === "number" ? tooltipPos.top : tooltipPos.top,
              left: typeof tooltipPos.left === "number" ? tooltipPos.left : tooltipPos.left,
            }}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
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
                        Step {currentStep + 1} of {tourSteps.length}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSkip}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-white"
                    data-testid="tour-skip"
                  >
                    <X className="w-4 h-4" />
                  </button>
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
                    {tourSteps.map((_, idx) => (
                      <motion.div
                        key={idx}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          idx === currentStep 
                            ? "w-6 bg-gradient-to-r from-primary to-pink-500" 
                            : idx < currentStep 
                            ? "w-1.5 bg-primary/50" 
                            : "w-1.5 bg-white/20"
                        }`}
                        animate={idx === currentStep ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ duration: 0.5 }}
                      />
                    ))}
                  </div>
                  
                  <motion.button
                    onClick={handleNext}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-pink-500 text-white font-medium text-sm hover:opacity-90 transition-opacity"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    data-testid="tour-next"
                  >
                    {currentStep === tourSteps.length - 1 ? "Get Started" : "Next"}
                    <ChevronRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            </div>

            {step.position === "left" && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
                <div className="w-4 h-4 rotate-45 bg-zinc-900 border-r border-t border-white/10" 
                  style={{ marginRight: "-8px" }} 
                />
              </div>
            )}
            {step.position === "right" && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full">
                <div className="w-4 h-4 rotate-45 bg-zinc-900 border-l border-b border-white/10" 
                  style={{ marginLeft: "-8px" }} 
                />
              </div>
            )}
          </motion.div>

          <motion.div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <button
              onClick={handleSkip}
              className="text-sm text-muted-foreground hover:text-white transition-colors underline-offset-4 hover:underline"
              data-testid="tour-skip-bottom"
            >
              Skip tour
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
