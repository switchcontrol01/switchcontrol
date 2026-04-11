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
  /** Phase 1 — Detection begins: background dims, status text, ambient glow */
  detectingMs:    0,
  /** Phase 2 — Activation: rings expand, particles, logo scales */
  activatingMs:   600,
  /** Phase 3 — Completion: glow pulse, main text reveals */
  completingMs:   1600,
  /** Hold — everything visible, subtle breathing */
  holdingMs:      3300,
  /** Scene begins exiting */
  exitingMs:      4100,
  /** Animation fully done, onComplete fires */
  doneMs:         4800,
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
