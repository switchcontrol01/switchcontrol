/**
 * themeTokens.ts
 *
 * Single source of truth for all brand/premium color values and
 * glow constants used across the SwitchControl UI.
 *
 * Usage (JS/TS):
 *   import { premiumColor, premiumGlow } from "@/lib/themeTokens";
 *   style={{ boxShadow: premiumGlow.card }}
 *
 * For Tailwind class strings, use the CSS custom properties defined
 * in index.css (--premium-*, etc.).  Never hard-code hex/rgb/hsl
 * literals in component files — always reference these tokens.
 */

// ── Primary brand purple ───────────────────────────────────────────────────────
export const premiumColor = {
  /** hsl(270, 60%, 55%) — main crown / CTA purple */
  main:     "hsl(270,60%,55%)",
  /** hsl(270, 60%, 65%) — icon / text accent */
  light:    "hsl(270,60%,65%)",
  /** hsl(270, 60%, 75%) — secondary text */
  lighter:  "hsl(270,60%,75%)",
  /** hsl(280, 70%, 65%) — gradient end */
  end:      "hsl(280,70%,65%)",
  /** hsl(270, 60%, 50%) — hover state for main */
  hover:    "hsl(270,60%,50%)",
  /** hsl(280, 70%, 60%) — hover state for end */
  hoverEnd: "hsl(280,70%,60%)",
} as const;

// ── RGBA raw values (for boxShadow / backdrop configs) ────────────────────────
export const premiumRgba = {
  /** rgba(168, 85, 247, …) helpers */
  glow10:  "rgba(168,85,247,0.10)",
  glow15:  "rgba(168,85,247,0.15)",
  glow20:  "rgba(168,85,247,0.20)",
  glow25:  "rgba(168,85,247,0.25)",
  glow35:  "rgba(168,85,247,0.35)",
  glow40:  "rgba(168,85,247,0.40)",
  glow45:  "rgba(168,85,247,0.45)",
  glow60:  "rgba(168,85,247,0.60)",
  /** Violet/indigo for badge gradients */
  badge1:  "rgba(124,58,237,0.20)",
  badge2:  "rgba(168,85,247,0.15)",
  border:  "rgba(168,85,247,0.30)",
} as const;

// ── Overlay card background ────────────────────────────────────────────────────
export const premiumOverlay = {
  /** Glass-morphism white card with a very subtle purple tint */
  cardBg:     `linear-gradient(135deg, rgba(255,255,255,0.11) 0%, rgba(210,195,255,0.08) 50%, rgba(255,255,255,0.10) 100%)`,
  /** Crisp white border with faint lavender tint */
  cardBorder: `rgba(255,255,255,0.18)`,
} as const;

// ── Glow shadow presets ────────────────────────────────────────────────────────
export const premiumGlow = {
  /** Ambient card glow (resting) */
  card:      `0 0 40px ${premiumRgba.glow15}`,
  /** Card glow (attention bounce peak) */
  cardPeak:  `0 0 60px ${premiumRgba.glow35}`,
  /** Crown icon glow (resting) */
  icon:      `0 0 24px ${premiumRgba.glow25}`,
  /** Crown icon glow (peak) */
  iconPeak:  `0 0 24px ${premiumRgba.glow45}`,
  /** Page-level header glow */
  header:    `0 0 12px ${premiumRgba.glow20}`,
  headerPeak:`0 0 20px ${premiumRgba.glow35}`,
} as const;

// ── Attention bounce animation config ─────────────────────────────────────────
/** Duration (ms) for the attention bounce state reset */
export const ATTENTION_BOUNCE_DURATION_MS = 300;

// ── CSS gradient class strings (Tailwind-safe) ────────────────────────────────
export const premiumGradient = {
  /** CTA button gradient */
  button:       `bg-gradient-to-r from-[${premiumColor.main}] to-[${premiumColor.end}]`,
  buttonHover:  `hover:from-[${premiumColor.hover}] hover:to-[${premiumColor.hoverEnd}]`,
  /** Badge background gradient */
  badge:        `bg-gradient-to-r from-[${premiumRgba.badge1}] to-[${premiumRgba.badge2}]`,
} as const;

// ── Emerald / success ─────────────────────────────────────────────────────────
export const successColor = {
  main:  "rgb(52,211,153)",
  glow:  "rgba(52,211,153,0.8)",
} as const;

// ── Amber / tour premium palette ──────────────────────────────────────────────
/** Amber/gold palette used by the premium (isPremium=true) tour theme */
export const tourColor = {
  /** Primary amber CTA / text */
  main:   '#fbbf24',
  /** Darker amber for button gradient end */
  end:    '#f59e0b',
  /** Softer light amber for headings */
  light:  '#fde68a',
  /** Medium warm amber for glow layers */
  mid:    '#fcd34d',
} as const;

export const tourGlow = {
  /** Card ambient glow (amber, resting) */
  card:    '0 0 80px rgba(251,191,36,0.08)',
  /** Button shadow */
  btn:     '0 4px 22px rgba(245,158,11,0.35)',
  /** Ambient halo */
  ambient: '0 0 40px rgba(251,191,36,0.15)',
} as const;

// ── Semantic aliases ──────────────────────────────────────────────────────────
export const brand = {
  premium: premiumColor,
  glow:    premiumGlow,
  rgba:    premiumRgba,
  overlay: premiumOverlay,
  success: successColor,
  tour:    tourColor,
  tourGlow,
} as const;
