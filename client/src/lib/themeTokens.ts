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

// ── Primary brand cyan (v2 redesign) ─────────────────────────────────────────
export const premiumColor = {
  /** #00D4FF — main accent / CTA cyan */
  main:     "#00D4FF",
  /** #33E0FF — icon / text accent */
  light:    "#33E0FF",
  /** #66EBFF — secondary text */
  lighter:  "#66EBFF",
  /** #00C8F5 — gradient end */
  end:      "#00C8F5",
  /** #0099CC — hover state for main */
  hover:    "#0099CC",
  /** #00B8E6 — hover state for end */
  hoverEnd: "#00B8E6",
} as const;

// ── RGBA raw values (for boxShadow / backdrop configs) ────────────────────────
export const premiumRgba = {
  /** rgba(0, 212, 255, …) helpers */
  glow10:  "rgba(0,212,255,0.10)",
  glow15:  "rgba(0,212,255,0.15)",
  glow20:  "rgba(0,212,255,0.20)",
  glow25:  "rgba(0,212,255,0.25)",
  glow35:  "rgba(0,212,255,0.35)",
  glow40:  "rgba(0,212,255,0.40)",
  glow45:  "rgba(0,212,255,0.45)",
  glow60:  "rgba(0,212,255,0.60)",
  /** Badge gradients */
  badge1:  "rgba(0,212,255,0.20)",
  badge2:  "rgba(51,224,255,0.15)",
  border:  "rgba(0,212,255,0.30)",
} as const;

// ── Overlay card background ────────────────────────────────────────────────────
export const premiumOverlay = {
  /** Glass-morphism white card with a very subtle cyan tint */
  cardBg:     `linear-gradient(135deg, rgba(255,255,255,0.11) 0%, rgba(195,240,255,0.08) 50%, rgba(255,255,255,0.10) 100%)`,
  /** Crisp white border with faint cyan tint */
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

// ── Startup page amber/orange accent ─────────────────────────────────────────
/** Distinct from Cleaner's purple and PowerPlan's cyan/red */
export const startupColor = {
  /** #f97316 — orange-500, matches existing StartupBars/Timeline convention */
  main:     "#f97316",
  /** #fb923c — orange-400 (lighter accent) */
  light:    "#fb923c",
  /** #ea580c — orange-600 (gradient end) */
  end:      "#ea580c",
  /** #fbbf24 — amber-400 (secondary, for the ratio ring) */
  gold:     "#fbbf24",
  glow20:   "rgba(249,115,22,0.20)",
  glow30:   "rgba(249,115,22,0.30)",
  glow40:   "rgba(249,115,22,0.40)",
  bg08:     "rgba(249,115,22,0.08)",
  bg15:     "rgba(249,115,22,0.15)",
  border30: "rgba(249,115,22,0.30)",
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
