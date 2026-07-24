/**
 * premiumBenefits.ts
 *
 * Single source of truth for premium feature benefit bullets.
 *
 * Both PremiumOverlayCard and PremiumLockOverlay render the same benefit
 * list — extracting it here prevents the two implementations from silently
 * drifting when copy is updated in one place but not the other.
 */

export type Benefits = [string, string, string];

export const BENEFITS_MAP: Array<[string, Benefits]> = [
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
  ["NIC Tuning", [
    "Adapter-level interrupt moderation for lower latency",
    "RSS queue tuning matched to your CPU core count",
    "Driver-level power management disabled for gaming",
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

const DEFAULT_BENEFITS: Benefits = [
  "Advanced optimisation tuned to your hardware",
  "Exclusive performance profiles across CPU, GPU & network",
  "Priority support and early access to new features",
];

export function getBenefits(featureName: string): Benefits {
  const lower = featureName.toLowerCase();
  for (const [key, val] of BENEFITS_MAP) {
    if (lower.includes(key.toLowerCase())) return val;
  }
  return DEFAULT_BENEFITS;
}
