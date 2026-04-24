/**
 * premium-page-overlay.tsx
 *
 * Full-page and card-level premium gate overlays.
 * All animation / styling is now delegated to PremiumOverlayCard —
 * these components are pure layout/logic wrappers.
 */

import { Crown } from "lucide-react";
import { PremiumOverlayCard } from "@/components/ui/PremiumOverlayCard";
import { premiumColor, premiumRgba } from "@/lib/themeTokens";

// ── Full-page overlay (covers the whole viewport) ────────────────────────────

interface PremiumPageOverlayProps {
  featureName: string;
  buttonText?: string;
  description?: string;
}

export function PremiumPageOverlay({ featureName, buttonText, description }: PremiumPageOverlayProps) {
  return (
    <PremiumOverlayCard
      featureName={featureName}
      buttonText={buttonText}
      description={description}
      variant="page"
    />
  );
}

// ── Card-level overlay (renders over a child element) ────────────────────────

interface PremiumCardOverlayProps {
  featureName: string;
  buttonText?: string;
  children: React.ReactNode;
  isLocked: boolean;
}

export function PremiumCardOverlay({
  featureName,
  buttonText,
  children,
  isLocked,
}: PremiumCardOverlayProps) {
  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div
      className="relative h-full min-h-[280px] rounded-xl overflow-hidden flex items-center justify-center border border-white/8"
      style={{
        background: "linear-gradient(135deg,rgba(10,8,22,0.97) 0%,rgba(30,18,55,0.95) 100%)",
      }}
    >
      <PremiumOverlayCard
        featureName={featureName}
        buttonText={buttonText}
        variant="card"
      />
    </div>
  );
}

// ── Header badge (no overlay, just a small indicator) ────────────────────────

export function PremiumHeaderBadge({ isLocked }: { isLocked: boolean }) {
  if (!isLocked) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 rounded-full border"
      style={{
        background: `linear-gradient(to right, ${premiumRgba.badge1}, ${premiumRgba.badge2})`,
        borderColor: premiumRgba.border,
      }}
    >
      <Crown className="size-4" style={{ color: premiumColor.light }} />
      <span className="text-xs font-medium" style={{ color: premiumColor.lighter }}>Premium</span>
    </div>
  );
}
