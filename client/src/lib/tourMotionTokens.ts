/**
 * tourMotionTokens.ts
 *
 * Named timing constants and color palettes for the tour system.
 * Import here instead of hardcoding raw millisecond values in tour components.
 *
 * Usage:
 *   import { TOUR_COMPLETION_TIMING, TOUR_STEP_TIMING, tourPalette, TOUR_EASE } from "@/lib/tourMotionTokens";
 */

// ── Completion moment timing ──────────────────────────────────────────────────
/** Named ms offsets for the CompletionMoment phase state machine */
export const TOUR_COMPLETION_TIMING = {
  /** Delay before switching to 'hold' phase */
  holdMs:  2200,
  /** Delay before switching to 'exit' phase */
  exitMs:  4800,
  /** Delay before calling onDone (must be after exit animation finishes) */
  doneMs:  6200,
} as const;

// ── Step transition timing ────────────────────────────────────────────────────
export const TOUR_STEP_TIMING = {
  /** Delay (ms) before querySelector scroll on highlight change */
  highlightScrollDelayMs: 200,
} as const;

// ── Shared easing curve ───────────────────────────────────────────────────────
/** Luxury ease-out: fast snap then slow settle */
export const TOUR_EASE = [0.22, 1, 0.36, 1] as const;

// ── Color palettes ────────────────────────────────────────────────────────────
/** All inline rgba/hex values for tour card, completion glow, progress pills */
export const tourPalette = {
  /** Amber palette — used when isPremium=true */
  premium: {
    primary:   'rgba(251,191,36,',
    text:      '#fbbf24',
    border:    'rgba(251,191,36,0.35)',
    iconBg:    'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.1))',
    iconBorder:'rgba(251,191,36,0.3)',
    btnBg:     'linear-gradient(135deg, rgba(217,119,6,0.75), rgba(251,191,36,0.55))',
    btnBorder: 'rgba(251,191,36,0.45)',
    btnShadow: '0 4px 22px rgba(245,158,11,0.35)',
    topBar:    'linear-gradient(90deg, transparent, rgba(251,191,36,0.6), rgba(245,158,11,0.4), transparent)',
    cardGlow:  '0 0 80px rgba(251,191,36,0.08)',
    titleGrad: 'linear-gradient(90deg, #fde68a, #fbbf24, #f59e0b)',
    cardBg:    'linear-gradient(145deg, rgba(20,15,5,0.92) 0%, rgba(18,13,4,0.96) 100%)',
    pillActive:'linear-gradient(90deg, #fbbf24, #f59e0b)',
    pillGlow:  '0 0 8px rgba(251,191,36,0.7)',
    /** Completion glow layers */
    c1: 'rgba(251,191,36,',
    c2: 'rgba(245,158,11,',
    c3: 'rgba(252,211,77,',
    accentHex:  '#fbbf24',
    accentHex2: '#f59e0b',
  },
  /** Purple palette — used when isPremium=false */
  free: {
    primary:   'rgba(139,92,246,',
    text:      '#c084fc',
    border:    'rgba(168,85,247,0.22)',
    iconBg:    'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(168,85,247,0.1))',
    iconBorder:'rgba(168,85,247,0.3)',
    btnBg:     'linear-gradient(135deg, rgba(109,40,217,0.9), rgba(168,85,247,0.7))',
    btnBorder: 'rgba(168,85,247,0.45)',
    btnShadow: '0 4px 22px rgba(139,92,246,0.38)',
    topBar:    'linear-gradient(90deg, transparent, rgba(168,85,247,0.7), rgba(236,72,153,0.4), transparent)',
    cardGlow:  '0 0 80px rgba(139,92,246,0.1)',
    titleGrad: 'linear-gradient(90deg, #e9d5ff, #c084fc, #a855f7)',
    cardBg:    'linear-gradient(145deg, rgba(14,10,28,0.92) 0%, rgba(10,8,24,0.96) 100%)',
    pillActive:'linear-gradient(90deg, #a855f7, #ec4899)',
    pillGlow:  '0 0 8px rgba(168,85,247,0.7)',
    /** Completion glow layers */
    c1: 'rgba(139,92,246,',
    c2: 'rgba(168,85,247,',
    c3: 'rgba(192,132,252,',
    accentHex:  '#a855f7',
    accentHex2: '#00D4FF',
  },
} as const;

export type TourPaletteKey = keyof typeof tourPalette;
export type TourPalette = typeof tourPalette.premium | typeof tourPalette.free;
