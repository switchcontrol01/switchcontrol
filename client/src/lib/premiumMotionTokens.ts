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
  /** Initial background darken */
  darkenMs:       0,
  /** Lock icon appears */
  lockAppearMs:   500,
  /** Glow ring + pulse begin */
  glowBuildMs:    1500,
  /** Shake buildup intensifies */
  shakeBuildupMs: 2800,
  /** Lock snaps open */
  unlockSnapMs:   3500,
  /** Shockwave burst */
  shockwaveMs:    3800,
  /** Logo fades in */
  logoRevealMs:   4300,
  /** Text + feature list reveals */
  textRevealMs:   4900,
  /** Scene begins exiting */
  exitingMs:      6200,
  /** Animation fully done, onComplete fires */
  doneMs:         6800,
  /** Reduced-motion fast path */
  reducedDoneMs:  2000,
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
