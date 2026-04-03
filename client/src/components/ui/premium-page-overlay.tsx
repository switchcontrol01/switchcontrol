import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatedCrown } from "@/components/ui/animated-crown";
import { openPricing } from "@/lib/pricing";

interface PremiumPageOverlayProps {
  featureName: string;
  buttonText?: string;
  description?: string;
}

export function PremiumPageOverlay({ featureName, buttonText, description }: PremiumPageOverlayProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const triggerAttentionAnimation = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);
  };

  const overlay = (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
      onClick={triggerAttentionAnimation}
      data-testid="premium-overlay"
    >
      <motion.div
        className="text-center space-y-4 p-6 rounded-2xl bg-gradient-to-br from-[hsl(270,60%,20%,0.9)] via-[hsl(270,50%,15%,0.95)] to-[hsl(280,60%,15%,0.9)] backdrop-blur-md border border-[hsl(270,60%,55%,0.25)] max-w-sm mx-4"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={isAnimating ? {
          opacity: 1,
          scale: [1, 1.03, 1],
          boxShadow: [
            "0 0 40px rgba(168,85,247,0.2)",
            "0 0 60px rgba(168,85,247,0.4)",
            "0 0 40px rgba(168,85,247,0.2)"
          ]
        } : {
          opacity: 1,
          scale: 1,
          boxShadow: "0 0 40px rgba(168,85,247,0.2)"
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        <AnimatedCrown size="lg" className="mx-auto pointer-events-none" />
        <div>
          <h3 className="text-lg font-semibold text-white">{featureName}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {description || "Premium feature – unlock to apply"}
          </p>
        </div>
        <Button
          size="sm"
          onClick={openPricing}
          className="bg-gradient-to-r from-[hsl(270,60%,55%)] to-[hsl(280,70%,65%)] hover:from-[hsl(270,60%,50%)] hover:to-[hsl(280,70%,60%)] text-white"
          data-testid="button-unlock-premium"
        >
          <Crown className="size-3 mr-1.5" />
          {buttonText || `Unlock ${featureName}`}
        </Button>
      </motion.div>
    </div>
  );

  return createPortal(overlay, document.body);
}

interface PremiumCardOverlayProps {
  featureName: string;
  buttonText?: string;
  children: React.ReactNode;
  isLocked: boolean;
}

export function PremiumCardOverlay({ featureName, buttonText, children, isLocked }: PremiumCardOverlayProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  if (!isLocked) {
    return <>{children}</>;
  }

  const triggerAttentionAnimation = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <div className="relative h-full">
      {children}
      <div
        className="absolute inset-0 flex items-center justify-center z-10"
        onClick={triggerAttentionAnimation}
        data-testid="premium-card-overlay"
      >
        <motion.div
          className="text-center space-y-4 p-6 rounded-2xl bg-gradient-to-br from-[hsl(270,60%,20%,0.9)] via-[hsl(270,50%,15%,0.95)] to-[hsl(280,60%,15%,0.9)] backdrop-blur-md border border-[hsl(270,60%,55%,0.25)] max-w-sm mx-4"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={isAnimating ? {
            opacity: 1,
            scale: [1, 1.03, 1],
            boxShadow: [
              "0 0 40px rgba(168,85,247,0.2)",
              "0 0 60px rgba(168,85,247,0.4)",
              "0 0 40px rgba(168,85,247,0.2)"
            ]
          } : {
            opacity: 1,
            scale: 1,
            boxShadow: "0 0 40px rgba(168,85,247,0.2)"
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
        >
          <AnimatedCrown size="lg" className="mx-auto pointer-events-none" />
          <div>
            <h3 className="text-lg font-semibold text-white">{featureName}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Premium feature – unlock to apply
            </p>
          </div>
          <Button
            size="sm"
            onClick={openPricing}
            className="bg-gradient-to-r from-[hsl(270,60%,55%)] to-[hsl(280,70%,65%)] hover:from-[hsl(270,60%,50%)] hover:to-[hsl(280,70%,60%)] text-white"
            data-testid="button-unlock-premium"
          >
            <Crown className="size-3 mr-1.5" />
            {buttonText || `Unlock ${featureName}`}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

export function PremiumHeaderBadge({ isLocked }: { isLocked: boolean }) {
  if (!isLocked) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-[rgba(124,58,237,0.2)] to-[rgba(168,85,247,0.15)] border border-[rgba(168,85,247,0.3)]">
      <Crown className="size-4 text-[hsl(270,60%,65%)]" />
      <span className="text-xs font-medium text-[hsl(270,60%,75%)]">Premium</span>
    </div>
  );
}
