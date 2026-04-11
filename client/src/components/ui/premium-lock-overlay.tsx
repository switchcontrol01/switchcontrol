/**
 * premium-lock-overlay.tsx
 *
 * Inline lock overlays for individual features / toggle rows.
 * All glow animation delegated to PremiumOverlayCard / CrownGlowOrb.
 */

import { cn } from "@/lib/utils";
import { Crown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "@/lib/motion";
import { PremiumOverlayCard, CrownGlowOrb } from "@/components/ui/PremiumOverlayCard";
import { useAttentionBounce } from "@/hooks/useAttentionBounce";
import { premiumColor, premiumRgba } from "@/lib/themeTokens";
import { openPricing } from "@/lib/pricing";

// ── Full lock overlay (blurs + covers a section) ─────────────────────────────

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
  const { bounceProps, trigger } = useAttentionBounce();

  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className={cn("relative", className)}>
      <div className="opacity-60 blur-[2px] pointer-events-none select-none">
        {children}
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center z-10"
        onClick={trigger}
      >
        <motion.div
          className="text-center space-y-3 p-6 rounded-2xl backdrop-blur-md border max-w-sm mx-4"
          style={{
            background: `linear-gradient(135deg, hsl(270,60%,20%,0.85), hsl(270,50%,15%,0.9), hsl(280,60%,15%,0.85))`,
            borderColor: `hsl(270,60%,55%,0.25)`,
          }}
          {...(bounceProps as any)}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <CrownGlowOrb />

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
            className="text-white"
            style={{
              background: `linear-gradient(to right, ${premiumColor.main}, ${premiumColor.end})`,
            }}
          >
            <Crown className="size-3 mr-1.5" />
            Unlock {featureName}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

// ── Toggle-row lock (small inline lock icon on a row) ─────────────────────────

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
        <Lock className="size-4" style={{ color: premiumColor.light }} />
      </div>
    </div>
  );
}

// ── Page header "Premium" badge ───────────────────────────────────────────────

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
            className="flex items-center gap-2 px-3 py-1 rounded-full border"
            style={{
              background: `linear-gradient(to right, ${premiumRgba.badge1}, ${premiumRgba.badge2})`,
              borderColor: premiumRgba.border,
            }}
            animate={{
              boxShadow: [
                `0 0 12px ${premiumRgba.glow20}`,
                `0 0 20px ${premiumRgba.glow35}`,
                `0 0 12px ${premiumRgba.glow20}`,
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.div
              animate={{ opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Crown className="size-4" style={{ color: premiumColor.light }} />
            </motion.div>
            <span className="text-xs font-medium" style={{ color: premiumColor.lighter }}>Premium</span>
          </motion.div>
        )}
      </div>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
