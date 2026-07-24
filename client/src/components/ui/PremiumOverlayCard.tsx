/**
 * PremiumOverlayCard
 *
 * The single shared premium upgrade card used by PremiumPageOverlay and
 * PremiumCardOverlay. Upgraded to match the rich glass-panel design.
 *
 * Layout: crown orb + "PREMIUM FEATURE" label + feature name heading,
 * Cyan-accented divider, 3 feature-aware benefit bullets, dual CTA.
 * Animations are CSS @keyframes (zero framer-motion infinite loops).
 */

import { createPortal } from "react-dom";
import { Crown, Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { motion } from "@/lib/motion";
import { useAttentionBounce } from "@/hooks/useAttentionBounce";
import { premiumColor, premiumRgba } from "@/lib/themeTokens";
import { openPricing } from "@/lib/pricing";
import { useTrialExpiryStore } from "@/stores/trialExpiryStore";
import { getBenefits } from "@/lib/premiumBenefits";

// ── CSS keyframes injected once ───────────────────────────────────────────────

// box-shadow is NOT animated in these keyframes — animating box-shadow forces a
// full CPU repaint on every frame and cannot be compositor-accelerated.
// Instead each animation pulses opacity only; the visible glow ring comes from
// the static boxShadow set on each element's inline style.
const KEYFRAMES = `
@keyframes sc-poc-glow {
  0%,100%{ opacity:0.88; }
  50%    { opacity:1; }
}
@keyframes sc-poc-orb {
  0%,100%{ opacity:.85; }
  50%    { opacity:1; }
}
@keyframes sc-poc-p0{ 0%,100%{transform:translateY(0);opacity:.20} 50%{transform:translateY(-12px);opacity:.50} }
@keyframes sc-poc-p1{ 0%,100%{transform:translateY(0);opacity:.14} 50%{transform:translateY(-9px); opacity:.42} }
@keyframes sc-poc-p2{ 0%,100%{transform:translateY(0);opacity:.18} 50%{transform:translateY(-15px);opacity:.38} }
`;

// Inject KEYFRAMES once at module-load time so multiple simultaneous card
// instances (e.g. a tweak list with several locked entries) share one <style>
// tag instead of each mounting their own identical copy.
if (typeof document !== 'undefined') {
  const _styleId = 'sc-poc-keyframes';
  if (!document.getElementById(_styleId)) {
    const _el = document.createElement('style');
    _el.id = _styleId;
    _el.textContent = KEYFRAMES;
    document.head.appendChild(_el);
  }
}

// ── Crown orb (CSS-animated, no framer-motion loop) ───────────────────────────

function CrownOrb() {
  return (
    <div
      className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
      style={{
        background: `rgba(168,85,247,0.16)`,
        // Static glow ring — sc-poc-orb pulses opacity, not box-shadow.
        boxShadow: "0 0 22px rgba(168,85,247,0.25),0 0 0 1px rgba(168,85,247,0.14)",
        animation: "sc-poc-orb 3s ease-in-out infinite",
      }}
    >
      <Crown className="size-6" style={{ color: premiumColor.light }} />
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PremiumOverlayCardProps {
  featureName: string;
  buttonText?: string;
  description?: string;
  onOuterClick?: () => void;
  className?: string;
  variant?: "page" | "card";
}

export function PremiumOverlayCard({
  featureName,
  buttonText,
  description,
  onOuterClick,
  className,
  variant = "card",
}: PremiumOverlayCardProps) {
  const trialEndingFlowActive = useTrialExpiryStore(s => s.trialEndingFlowActive);
  const { bounceProps, trigger } = useAttentionBounce();

  if (trialEndingFlowActive) return null;

  const handleOuterClick = () => {
    trigger();
    onOuterClick?.();
  };

  // Derive clean display name (strip trailing "is a Premium Feature" etc.)
  const displayName = featureName
    .replace(/\s+is\s+a\s+premium\s+feature/gi, "")
    .trim();

  const benefits = getBenefits(displayName || featureName);

  const isCard = variant === "card";

  const cardInner = (
    <motion.div
      className={cn(
        "relative text-left rounded-2xl w-full space-y-4",
        isCard ? "p-5" : "p-7 max-w-md mx-4"
      )}
      style={{
        background: "linear-gradient(135deg,rgba(255,255,255,0.12) 0%,rgba(195,165,255,0.09) 45%,rgba(255,255,255,0.11) 100%)",
        backdropFilter: "blur(36px)",
        WebkitBackdropFilter: "blur(36px)",
        boxShadow: "0 24px 72px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.09) inset,0 1px 0 rgba(255,255,255,0.15) inset",
        animation: "sc-poc-glow 3s ease-in-out infinite",
      }}
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      // bounceProps.animate drives both the mount animation (animateIdle = {opacity:1,scale:1,y:0})
      // and the attention-bounce animation — do NOT also set animate here or TypeScript
      // will warn TS2783 (duplicate prop) and the explicit value will be overwritten.
      {...bounceProps}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      data-testid="premium-overlay-card"
    >
      {/* Header row: crown orb + labels */}
      <div className="flex items-center gap-3">
        <CrownOrb />
        <div className="min-w-0">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-0.5"
            style={{ color: premiumColor.lighter }}
          >
            Premium Feature
          </p>
          <h3 className={cn(
            "font-bold text-[#E6EAF0] leading-tight truncate",
            isCard ? "text-base" : "text-[1.2rem]"
          )}>
            {displayName || featureName}
          </h3>
        </div>
      </div>

      {/* Optional description override */}
      {description && (
        <p className="text-sm text-[#A0A8B3] -mt-1">{description}</p>
      )}

      {/* Divider */}
      <div
        className="h-px w-full"
        style={{ background: "linear-gradient(to right,rgba(168,85,247,0.25),rgba(255,255,255,0.06),rgba(168,85,247,0.10))" }}
      />

      {/* Feature benefit bullets */}
      <ul className="space-y-2">
        {benefits.map((b, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className="mt-0.5 flex-shrink-0 inline-flex w-4 h-4 items-center justify-center rounded-full"
              style={{ background: premiumRgba.glow20 }}
            >
              <Check className="w-2.5 h-2.5" style={{ color: premiumColor.lighter }} />
            </span>
            <span className={cn(
              "text-[#E6EAF0]/65 leading-snug",
              isCard ? "text-xs" : "text-sm"
            )}>{b}</span>
          </li>
        ))}
      </ul>

      {/* CTA buttons */}
      <div className={cn(
        "flex items-center gap-2",
        isCard && "flex-wrap"
      )}>
        <Button
          onClick={openPricing}
          className={cn(
            "text-[#E6EAF0] font-semibold rounded-xl",
            isCard ? "flex-1 min-w-[120px] py-2 text-xs" : "flex-1 py-2.5"
          )}
          style={{
            background: `linear-gradient(135deg,${premiumColor.main},${premiumColor.end})`,
            boxShadow: `0 4px 22px ${premiumRgba.glow35},0 0 0 1px rgba(255,255,255,0.10) inset`,
          }}
          data-testid="button-unlock-premium"
        >
          <Crown className={cn("mr-1.5", isCard ? "size-3" : "size-3.5")} />
          {buttonText ?? `Unlock ${displayName || featureName}`}
        </Button>

        <Button
          variant="outline"
          onClick={openPricing}
          className={cn(
            "text-[#A0A8B3] hover:text-[#E6EAF0] transition-colors rounded-xl whitespace-nowrap",
            isCard ? "px-3 py-2 text-xs" : "px-4 py-2.5"
          )}
          style={{
            background: "rgba(255,255,255,0.05)",
            borderColor: "rgba(255,255,255,0.12)",
          }}
          data-testid="button-view-plans"
        >
          View plans
          <ArrowRight className={cn("ml-1.5", isCard ? "size-3" : "size-3.5")} />
        </Button>
      </div>
    </motion.div>
  );

  if (variant === "page") {
    return createPortal(
      <div
        // left-64 assumes a 256px (16rem) sidebar.  If the sidebar width is ever
        // changed, update this Tailwind class to match (or replace with a CSS var).
        className={`fixed top-0 right-0 bottom-0 left-64 z-[9999] flex items-center justify-center overflow-hidden ${className ?? ""}`}
        style={{
          background: "rgba(0,0,0,0.42)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
        }}
        onClick={handleOuterClick}
        data-testid="premium-overlay"
      >
        {/* KEYFRAMES injected once at module level — no <style> tag here */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <div style={{ position:"absolute", left:"18%", top:"22%", width:5, height:5, borderRadius:"50%", background:premiumRgba.glow45, animation:"sc-poc-p0 5s ease-in-out infinite" }} />
          <div style={{ position:"absolute", right:"22%", top:"30%", width:3, height:3, borderRadius:"50%", background:premiumRgba.glow35, animation:"sc-poc-p1 6.5s ease-in-out infinite 1.2s" }} />
          <div style={{ position:"absolute", left:"55%", bottom:"25%", width:4, height:4, borderRadius:"50%", background:premiumRgba.glow40, animation:"sc-poc-p2 4.8s ease-in-out infinite 2.5s" }} />
        </div>
        {cardInner}
      </div>,
      document.body,
    );
  }

  /* card variant — fills its container (placed inside PremiumCardOverlay's
     dark-bg wrapper, so no absolute overlay needed here) */
  return (
    <div
      className={`relative w-full flex items-center justify-center overflow-hidden px-4 py-6 ${className ?? ""}`}
      onClick={handleOuterClick}
      data-testid="premium-card-overlay"
    >
      {/* KEYFRAMES injected once at module level — no <style> tag here */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div style={{ position:"absolute", left:"18%", top:"22%", width:5, height:5, borderRadius:"50%", background:premiumRgba.glow45, animation:"sc-poc-p0 5s ease-in-out infinite" }} />
        <div style={{ position:"absolute", right:"22%", top:"30%", width:3, height:3, borderRadius:"50%", background:premiumRgba.glow35, animation:"sc-poc-p1 6.5s ease-in-out infinite 1.2s" }} />
        <div style={{ position:"absolute", left:"55%", bottom:"25%", width:4, height:4, borderRadius:"50%", background:premiumRgba.glow40, animation:"sc-poc-p2 4.8s ease-in-out infinite 2.5s" }} />
      </div>
      {cardInner}
    </div>
  );
}

export { CrownOrb as CrownGlowOrb };
