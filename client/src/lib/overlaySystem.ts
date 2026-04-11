/**
 * overlaySystem.ts
 *
 * Single import point for all premium overlay and lock components.
 *
 * Usage:
 *   import { PremiumPageOverlay, PremiumCardOverlay, PremiumLockOverlay } from "@/lib/overlaySystem";
 *
 * Routing:
 *  - PremiumPageOverlay      — full-page gate (covers viewport) → premium-page-overlay.tsx
 *  - PremiumCardOverlay      — card-level gate (renders over children) → premium-page-overlay.tsx
 *  - PremiumHeaderBadge      — small "Premium" indicator → premium-page-overlay.tsx
 *  - PremiumLockOverlay      — blurs + covers a section → premium-lock-overlay.tsx
 *  - PremiumToggleLock       — toggle-row lock (small inline icon) → premium-lock-overlay.tsx
 *  - PremiumPageHeader       — page title with premium badge → premium-lock-overlay.tsx
 *  - PremiumOverlayCard      — raw animated card (compose your own overlay) → PremiumOverlayCard.tsx
 *  - CrownGlowOrb            — animated crown glow orb primitive → PremiumOverlayCard.tsx
 */

export {
  PremiumPageOverlay,
  PremiumCardOverlay,
  PremiumHeaderBadge,
} from "@/components/ui/premium-page-overlay";

export {
  PremiumLockOverlay,
  PremiumToggleLock,
  PremiumPageHeader,
} from "@/components/ui/premium-lock-overlay";

export {
  PremiumOverlayCard,
  CrownGlowOrb,
} from "@/components/ui/PremiumOverlayCard";
