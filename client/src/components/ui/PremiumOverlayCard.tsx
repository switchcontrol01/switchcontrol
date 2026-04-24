/**
 * PremiumOverlayCard
 *
 * The single shared premium upgrade card used by PremiumPageOverlay and
 * PremiumCardOverlay. Upgraded to match the rich glass-panel design.
 *
 * Layout: crown orb + "PREMIUM FEATURE" label + feature name heading,
 * purple-gradient divider, 3 feature-aware benefit bullets, dual CTA.
 * Animations are CSS @keyframes (zero framer-motion infinite loops).
 */

import { createPortal } from "react-dom";
import { Crown, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "@/lib/motion";
import { useAttentionBounce } from "@/hooks/useAttentionBounce";
import { premiumColor, premiumRgba } from "@/lib/themeTokens";
import { openPricing } from "@/lib/pricing";
import { useTrialExpiryStore } from "@/stores/trialExpiryStore";

// ── CSS keyframes injected once ───────────────────────────────────────────────

const KEYFRAMES = `
@keyframes sc-poc-glow {
  0%,100%{ box-shadow:0 0 0 1px rgba(168,85,247,0.22),0 0 28px rgba(168,85,247,0.10); }
  50%    { box-shadow:0 0 0 1px rgba(168,85,247,0.55),0 0 50px rgba(168,85,247,0.26); }
}
@keyframes sc-poc-orb {
  0%,100%{ box-shadow:0 0 22px rgba(168,85,247,0.25),0 0 0 1px rgba(168,85,247,0.14);opacity:.85; }
  50%    { box-shadow:0 0 42px rgba(168,85,247,0.52),0 0 0 1px rgba(168,85,247,0.32);opacity:1; }
}
@keyframes sc-poc-p0{ 0%,100%{transform:translateY(0);opacity:.20} 50%{transform:translateY(-12px);opacity:.50} }
@keyframes sc-poc-p1{ 0%,100%{transform:translateY(0);opacity:.14} 50%{transform:translateY(-9px); opacity:.42} }
@keyframes sc-poc-p2{ 0%,100%{transform:translateY(0);opacity:.18} 50%{transform:translateY(-15px);opacity:.38} }
`;

// ── Feature-aware benefit bullets ─────────────────────────────────────────────

type Benefits = [string, string, string];

const BENEFITS_MAP: Array<[string, Benefits]> = [
  ["AI Advisor", [
    "AI-powered diagnostics that surface hidden bottlenecks",
    "Personalised recommendations for your exact hardware",
    "Smart latency & FPS improvement suggestions in seconds",
  ]],
  ["BIOS", [
    "Unlock hidden BIOS performance settings safely",
    "XMP / EXPO memory profile tuning with live guidance",
    "Thermal and power-limit recommendations for stable gains",
  ]],
  ["Network", [
    "Reduce ping and eliminate packet jitter in real time",
    "Optimised TCP/IP stack tuned for competitive play",
    "Automatic traffic prioritisation for your game",
  ]],
  ["App Booster", [
    "Per-game optimisation profiles applied in one click",
    "CPU & GPU priority tuning for every title",
    "Background process suppression while gaming",
  ]],
  ["Startup", [
    "One-click disable for the slowest boot offenders",
    "Publisher trust scoring for unknown startup apps",
    "Boot time reduction with smart delay suggestions",
  ]],
  ["Debloat", [
    "Safe removal of telemetry and preinstalled bloatware",
    "One-click restore for anything you change your mind on",
    "Curated rules updated for every major Windows version",
  ]],
  ["Security", [
    "Hardened Windows Defender and firewall configuration",
    "Attack surface reduction with no app breakage",
    "Real-time threat status visible on your dashboard",
  ]],
];

function getBenefits(featureName: string): Benefits {
  const lower = featureName.toLowerCase();
  for (const [key, val] of BENEFITS_MAP) {
    if (lower.includes(key.toLowerCase())) return val;
  }
  return [
    "Advanced optimisation tuned to your hardware",
    "Exclusive performance profiles across CPU, GPU & network",
    "Priority support and early access to new features",
  ];
}

// ── Crown orb (CSS-animated, no framer-motion loop) ───────────────────────────

function CrownOrb() {
  return (
    <div
      className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
      style={{
        background: `rgba(168,85,247,0.16)`,
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

  const cardInner = (
    <motion.div
      className="relative text-left p-7 rounded-2xl max-w-md w-full mx-4 space-y-5"
      style={{
        background: "linear-gradient(135deg,rgba(255,255,255,0.12) 0%,rgba(195,165,255,0.09) 45%,rgba(255,255,255,0.11) 100%)",
        backdropFilter: "blur(36px)",
        WebkitBackdropFilter: "blur(36px)",
        boxShadow: "0 24px 72px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.09) inset,0 1px 0 rgba(255,255,255,0.15) inset",
        animation: "sc-poc-glow 3s ease-in-out infinite",
      }}
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      {...(bounceProps as any)}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      data-testid="premium-overlay-card"
    >
      {/* Header row: crown orb + labels */}
      <div className="flex items-center gap-4">
        <CrownOrb />
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-0.5"
            style={{ color: premiumColor.lighter }}
          >
            Premium Feature
          </p>
          <h3 className="text-[1.2rem] font-bold text-white leading-tight">
            {displayName || featureName}
          </h3>
        </div>
      </div>

      {/* Optional description override */}
      {description && (
        <p className="text-sm text-white/55 -mt-1">{description}</p>
      )}

      {/* Divider */}
      <div
        className="h-px w-full"
        style={{ background: "linear-gradient(to right,rgba(168,85,247,0.25),rgba(255,255,255,0.06),rgba(168,85,247,0.10))" }}
      />

      {/* Feature benefit bullets */}
      <ul className="space-y-2.5">
        {benefits.map((b, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className="mt-0.5 flex-shrink-0 inline-flex w-4 h-4 items-center justify-center rounded-full"
              style={{ background: premiumRgba.glow20 }}
            >
              <Check className="w-2.5 h-2.5" style={{ color: premiumColor.lighter }} />
            </span>
            <span className="text-sm text-white/65 leading-snug">{b}</span>
          </li>
        ))}
      </ul>

      {/* CTA buttons */}
      <div className="flex items-center gap-2.5 pt-0.5">
        <Button
          onClick={openPricing}
          className="flex-1 text-white font-semibold py-2.5 rounded-xl"
          style={{
            background: `linear-gradient(135deg,${premiumColor.main},${premiumColor.end})`,
            boxShadow: `0 4px 22px ${premiumRgba.glow35},0 0 0 1px rgba(255,255,255,0.10) inset`,
          }}
          data-testid="button-unlock-premium"
        >
          <Crown className="size-3.5 mr-2" />
          {buttonText ?? `Unlock ${displayName || featureName}`}
        </Button>

        <Button
          variant="outline"
          onClick={openPricing}
          className="text-white/55 hover:text-white/90 transition-colors rounded-xl"
          style={{
            background: "rgba(255,255,255,0.05)",
            borderColor: "rgba(255,255,255,0.12)",
          }}
          data-testid="button-view-plans"
        >
          View plans
          <ArrowRight className="size-3.5 ml-1.5" />
        </Button>
      </div>
    </motion.div>
  );

  if (variant === "page") {
    return createPortal(
      <div
        className={`fixed top-0 right-0 bottom-0 left-64 z-[9999] flex items-center justify-center overflow-hidden ${className ?? ""}`}
        style={{
          background: "rgba(0,0,0,0.42)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
        }}
        onClick={handleOuterClick}
        data-testid="premium-overlay"
      >
        <style>{KEYFRAMES}</style>
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
      <style>{KEYFRAMES}</style>
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
