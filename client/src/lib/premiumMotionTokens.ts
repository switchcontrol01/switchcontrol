/**
 * premiumMotionTokens.ts
 *
 * Named timing constants for all premium animation sequences:
 *   - PremiumUpgradeAnimation (lock → unlock → reveal)
 *   - PremiumUnlockAnimation  (flash overlay)
 *   - PremiumSuccess          (check → confetti → CTA)
 *
 * Usage:
 *   import { UPGRADE_TIMING, UNLOCK_TIMING, SUCCESS_TIMING } from "@/lib/premiumMotionTokens";
 *
 * All values are milliseconds from the start of show=true.
 */

// ── PremiumUpgradeAnimation phase timeline ────────────────────────────────────
export const UPGRADE_TIMING = {
  /** Phase 1 — Atmosphere: background + ambient bloom fade in */
  detectingMs:    0,
  /** Phase 2 — Logo materialises from darkness with soft glow behind it */
  activatingMs:   1400,
  /** Phase 3 — Text block rises in below the logo */
  completingMs:   3600,
  /** Hold — long, slow breathing state with subtle float */
  holdingMs:      5400,
  /** Scene begins exiting — onComplete fires at this point */
  exitingMs:      12000,
  /** Animation fully done (AnimatePresence handles exit; this is a safety fallback) */
  doneMs:         13400,
  /** Reduced-motion fast path */
  reducedDoneMs:  2400,
} as const;

// ── PremiumUnlockAnimation timing ─────────────────────────────────────────────
export const UNLOCK_TIMING = {
  /** Total display time before auto-dismiss */
  displayMs: 3500,
} as const;

// ── PremiumSuccess animation sequence ─────────────────────────────────────────
export const SUCCESS_TIMING = {
  /** Circle stroke begins drawing */
  strokeMs:   0,
  /** Check mark draws in */
  checkMs:    1200,
  /** Glow pulse starts */
  glowMs:     1700,
  /** Confetti burst */
  confettiMs: 2000,
  /** Text block reveals */
  textMs:     2400,
  /** CTA buttons appear */
  buttonsMs:  2900,
  /** Animation fully settled */
  readyMs:    3300,
  /** Minimum loading spinner display time */
  minLoadingMs: 1200,
} as const;

// ── Shared premium easing ──────────────────────────────────────────────────────
/** Consistent luxury ease for all premium moments */
export const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

/** Tight ease for shockwave / energy bursts */
export const PREMIUM_EASE_OUT = 'easeOut' as const;
