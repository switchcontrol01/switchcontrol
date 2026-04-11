/**
 * PremiumOverlayCard
 *
 * The single shared "premium upgrade" card UI that was previously copy-pasted
 * into PremiumPageOverlay, PremiumCardOverlay, and PremiumLockOverlay.
 *
 * Handles:
 *  - AnimatedCrown glow pulse (self-contained here, not re-implemented elsewhere)
 *  - Attention bounce animation via useAttentionBounce
 *  - Unlock CTA button
 */

import { createPortal } from "react-dom";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCrown } from "@/components/ui/animated-crown";
import { motion } from "@/lib/motion";
import { useAttentionBounce } from "@/hooks/useAttentionBounce";
import { premiumColor, premiumOverlay, premiumRgba } from "@/lib/themeTokens";
import { openPricing } from "@/lib/pricing";

export interface PremiumOverlayCardProps {
  featureName: string;
  buttonText?: string;
  description?: string;
  /** Called on every outside-area click (in addition to the bounce). Optional. */
  onOuterClick?: () => void;
  /** Extra classes forwarded to the outer wrapper */
  className?: string;
  /** Size variant — "page" adds fixed inset backdrop, "card" is used inline */
  variant?: "page" | "card";
}

/**
 * The animated crown glow orb.  Lives here (single definition) so neither
 * premium-lock-overlay nor premium-page-overlay need to duplicate it.
 */
function CrownGlowOrb() {
  return (
    <motion.div
      className="mx-auto w-14 h-14 rounded-full flex items-center justify-center"
      style={{ backgroundColor: premiumRgba.glow15 }}
      animate={{
        boxShadow: [
          `0 0 24px ${premiumRgba.glow25}`,
          `0 0 24px ${premiumRgba.glow45}`,
          `0 0 24px ${premiumRgba.glow25}`,
        ],
      }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      <motion.div
        animate={{ opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <Crown className="size-7" style={{ color: premiumColor.light }} />
      </motion.div>
    </motion.div>
  );
}

export function PremiumOverlayCard({
  featureName,
  buttonText,
  description,
  onOuterClick,
  className,
  variant = "card",
}: PremiumOverlayCardProps) {
  const { bounceProps, trigger } = useAttentionBounce();

  const handleOuterClick = () => {
    trigger();
    onOuterClick?.();
  };

  const cardInner = (
    <motion.div
      className="text-center space-y-5 p-8 rounded-2xl max-w-sm w-full mx-4 border"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(220,210,255,0.14) 50%, rgba(255,255,255,0.16) 100%)",
        borderColor: "rgba(255,255,255,0.28)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        boxShadow: "0 8px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.12) inset, 0 1px 0 rgba(255,255,255,0.2) inset",
      }}
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      {...(bounceProps as any)}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      data-testid="premium-overlay-card"
    >
      <AnimatedCrown size="lg" className="mx-auto pointer-events-none" />

      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold text-white">{featureName}</h3>
        <p className="text-sm text-white/60">
          {description ?? "This is a Premium feature. Upgrade to unlock it."}
        </p>
      </div>

      <Button
        size="sm"
        onClick={openPricing}
        className="w-full text-white font-semibold py-2"
        style={{
          background: `linear-gradient(to right, ${premiumColor.main}, ${premiumColor.end})`,
        }}
        data-testid="button-unlock-premium"
      >
        <Crown className="size-3.5 mr-2" />
        {buttonText ?? `Unlock ${featureName}`}
      </Button>
    </motion.div>
  );

  if (variant === "page") {
    // Portal to document.body so the fixed overlay escapes CSS mask-image /
    // filter / transform containing blocks on ancestor elements.
    // left-64 (256px) keeps the sidebar uncovered — only the main content area
    // gets the blur/overlay treatment.
    return createPortal(
      <div
        className={`fixed top-0 right-0 bottom-0 left-64 z-[9999] flex items-center justify-center ${className ?? ""}`}
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(168,85,247,0.10) 50%, rgba(255,255,255,0.05) 100%)",
          backdropFilter: "blur(3px) saturate(1.4)",
          WebkitBackdropFilter: "blur(3px) saturate(1.4)",
        }}
        onClick={handleOuterClick}
        data-testid="premium-overlay"
      >
        {cardInner}
      </div>,
      document.body,
    );
  }

  // card variant — caller positions the wrapper
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center z-10 ${className ?? ""}`}
      onClick={handleOuterClick}
      data-testid="premium-card-overlay"
    >
      {cardInner}
    </div>
  );
}

/**
 * CrownGlowOrb is also exported for the rare cases where the icon glow
 * is needed independently (e.g. inside PremiumLockOverlay's lock panel).
 */
export { CrownGlowOrb };
