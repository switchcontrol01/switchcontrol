import { cn } from "@/lib/utils";
import { Crown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { openPricing } from "@/lib/pricing";

interface PremiumLockOverlayProps {
  featureName: string;
  description?: string;
  className?: string;
  showInlineText?: boolean;
  children: React.ReactNode;
  isLocked: boolean;
}

export function PremiumLockOverlay({
  featureName,
  description,
  className,
  showInlineText = true,
  children,
  isLocked,
}: PremiumLockOverlayProps) {
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
    <div className={cn("relative", className)}>
      <div className="opacity-60 blur-[2px] pointer-events-none select-none">
        {children}
      </div>
      
      <div 
        className="absolute inset-0 flex items-center justify-center z-10"
        onClick={triggerAttentionAnimation}
      >
        <motion.div 
          className="text-center space-y-3 p-6 rounded-2xl bg-gradient-to-br from-[hsl(270,60%,20%,0.85)] via-[hsl(270,50%,15%,0.9)] to-[hsl(280,60%,15%,0.85)] backdrop-blur-md border border-[hsl(270,60%,55%,0.25)] max-w-sm mx-4"
          animate={isAnimating ? {
            scale: [1, 1.03, 1],
            boxShadow: [
              "0 0 40px rgba(168,85,247,0.15)",
              "0 0 60px rgba(168,85,247,0.35)",
              "0 0 40px rgba(168,85,247,0.15)"
            ]
          } : {
            scale: 1,
            boxShadow: "0 0 40px rgba(168,85,247,0.15)"
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            className="mx-auto w-14 h-14 rounded-full bg-[rgba(168,85,247,0.15)] flex items-center justify-center"
            animate={{
              boxShadow: [
                "0 0 24px rgba(168,85,247,0.25)",
                "0 0 24px rgba(168,85,247,0.45)",
                "0 0 24px rgba(168,85,247,0.25)",
              ],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <motion.div
              animate={{ opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Crown className="size-7 text-[hsl(270,60%,65%)]" />
            </motion.div>
          </motion.div>
          
          <div>
            <h3 className="text-lg font-semibold text-white">{featureName}</h3>
            {showInlineText && (
              <p className="text-xs text-muted-foreground mt-1">
                Premium feature – unlock to apply
              </p>
            )}
            {description && (
              <p className="text-xs text-muted-foreground mt-2">{description}</p>
            )}
          </div>
          
          <Button
            size="sm"
            onClick={openPricing}
            className="bg-gradient-to-r from-[hsl(270,60%,55%)] to-[hsl(280,70%,65%)] hover:from-[hsl(270,60%,50%)] hover:to-[hsl(280,70%,60%)] text-white"
          >
            <Crown className="size-3 mr-1.5" />
            Unlock {featureName}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

interface PremiumToggleLockProps {
  isLocked: boolean;
  onLockedClick: () => void;
  children: React.ReactNode;
}

export function PremiumToggleLock({ isLocked, onLockedClick, children }: PremiumToggleLockProps) {
  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div 
      className="relative cursor-pointer opacity-50"
      onClick={onLockedClick}
    >
      <div className="pointer-events-none">
        {children}
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 mr-2">
        <Lock className="size-4 text-[hsl(270,60%,65%)]" />
      </div>
    </div>
  );
}

interface PremiumPageHeaderProps {
  title: string;
  description: string;
  isLocked: boolean;
}

export function PremiumPageHeader({ title, description, isLocked }: PremiumPageHeaderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
          {title}
        </h1>
        {isLocked && (
          <motion.div
            className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-[rgba(124,58,237,0.2)] to-[rgba(168,85,247,0.15)] border border-[rgba(168,85,247,0.3)]"
            animate={{
              boxShadow: [
                "0 0 12px rgba(168,85,247,0.2)",
                "0 0 20px rgba(168,85,247,0.35)",
                "0 0 12px rgba(168,85,247,0.2)",
              ],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <motion.div
              animate={{ opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Crown className="size-4 text-[hsl(270,60%,65%)]" />
            </motion.div>
            <span className="text-xs font-medium text-[hsl(270,60%,75%)]">Premium</span>
          </motion.div>
        )}
      </div>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
