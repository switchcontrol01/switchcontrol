export type TweakLevel = "Recommended" | "Advanced" | "Experimental";
export type TweakCategory = 
  | "System and Power"
  | "Memory and Storage"
  | "Privacy and Telemetry"
  | "Gaming and Latency"
  | "Input"
  | "GPU and Graphics"
  | "Network"
  | "Debloat and Apps"
  | "Windows UX";

export const PREMIUM_TWEAK_LEVELS: TweakLevel[] = ["Advanced", "Experimental"];
export const PREMIUM_TWEAK_CATEGORIES: TweakCategory[] = ["Network"];
export const FREE_TWEAK_LEVELS: TweakLevel[] = ["Recommended"];

/**
 * Tweaks in this set are always free regardless of their level/category.
 * Common / basic / safe tweaks that every user should have access to.
 */
export const FREE_EXCEPTION_IDS: Set<string> = new Set([
  // ── System and Power ───────────────────────────────────────────────────────
  "hibernation",
  "fast-startup",
  "energy-logging",
  "maintenance",
  "power-throttling",
  "notifications",
  "disable-auto-restart-apps",
  // ── Memory and Storage ────────────────────────────────────────────────────
  "prefetch",
  "superfetch",
  "storage-sense",
  "win-search-index",
  // ── Privacy and Telemetry ─────────────────────────────────────────────────
  "telemetry",
  "copilot",
  "cortana",
  "search-highlights",
  "disable-delivery-opt",
  "disable-wer",
  "disable-activity-history",
  // ── Gaming and Latency ────────────────────────────────────────────────────
  "gaming-mode",
  "disable-fso",
  "usb-selective-suspend",
  // ── GPU and Graphics ──────────────────────────────────────────────────────
  "disable-mpo",
  "preemption",
  // ── Network ────────────────────────────────────────────────────────────────
  // bluetooth: kept free-tier so users can toggle it without a paywall.
  // WARNING: do NOT move to PREMIUM_EXCEPTION_IDS — hooks.ts GUARDED_TWEAK_IDS
  // explicitly excludes it from bulk-apply regardless of tier, so it is never
  // auto-applied even though it is free. The free-tier placement only controls
  // the paywall gate; the safety guard lives in hooks.ts isRecommendedSafe().
  "bluetooth",
  "wifi",
  // ── Debloat and Apps ──────────────────────────────────────────────────────
  "xbox-bar",
  "xbox-services",
  "fax-printer",
  // ── Windows UX ────────────────────────────────────────────────────────────
  "compact-explorer",
  "recent-files",
  "disable-transparency",
  "disable-animations",
  "show-file-extensions",
  "explorer-separate-process",
  "disable-pointer-precision",
  "disable-lock-screen",
  "bg-apps",
]);

/**
 * Tweaks that are always premium — risky, hardware-specific, reboot-required,
 * network-breaking, security-sensitive, or helper-requiring.
 */
export const PREMIUM_EXCEPTION_IDS: Set<string> = new Set([
  // ── System and Power ───────────────────────────────────────────────────────
  "core-isolation",
  "vbs",
  "hyper-v",
  "p-states",
  "pcie-link-state",
  "svchost-split-threshold",
  // ── Memory and Storage ────────────────────────────────────────────────────
  "mem-opt",
  "large-system-cache",
  "page-combining",
  "ntfs-last-access",
  "io-optimization-profile",
  // ── Privacy and Telemetry ─────────────────────────────────────────────────
  "nvidia-telemetry",
  // ── Gaming and Latency ────────────────────────────────────────────────────
  "irq-priority",
  "irq-optimization-profile",
  "synth-timers",
  "timer-res",
  "hpet-disable",
  "tune-priority",
  "win32-priority-sep",
  "sys-responsiveness",
  "max-pending-interrupts",
  "timer-resolution-slider",
  "net-throttle-index",
  "fortnite-high-priority",
  // ── Input ─────────────────────────────────────────────────────────────────
  "mouse-queue-size",
  "kbd-queue-size",
  "low-level-hooks-timeout",
  // ── GPU and Graphics ──────────────────────────────────────────────────────
  "desktop-comp",
  "hdcp",
  "directx-optimization-profile",
  // ── Windows UX ────────────────────────────────────────────────────────────
  "menu-show-delay",
  "hung-app-timeout",
  // ── Premium Power / GPU ──────────────────────────────────────────────────
  "maximum-cpu-responsiveness",
  "gpu-msi-mode",
  "pci-msi-mode",
  "wait-to-kill-app",
  "disable-wallpaper-compression",
]);

interface TweakTierInfo {
  level: TweakLevel;
  category: TweakCategory;
}

export const TWEAK_TIER_MAP: Record<string, TweakTierInfo> = {
  // System and Power
  "hibernation":              { level: "Recommended",  category: "System and Power" },
  "fast-startup":             { level: "Experimental", category: "System and Power" },
  "energy-logging":           { level: "Advanced",     category: "System and Power" },
  "maintenance":              { level: "Recommended",  category: "System and Power" },
  "bg-apps":                  { level: "Recommended",  category: "System and Power" },
  "core-isolation":           { level: "Experimental", category: "System and Power" },
  "vbs":                      { level: "Experimental", category: "System and Power" },
  "hyper-v":                  { level: "Advanced",     category: "System and Power" },
  "p-states":                 { level: "Experimental", category: "System and Power" },
  "notifications":            { level: "Recommended",  category: "System and Power" },
  "power-throttling":         { level: "Advanced",     category: "System and Power" },
  "pcie-link-state":          { level: "Advanced",     category: "System and Power" },
  "disable-auto-restart-apps":{ level: "Advanced",     category: "System and Power" },
  "svchost-split-threshold":  { level: "Advanced",     category: "System and Power" },
  "disable-dcom":             { level: "Experimental", category: "System and Power" },

  // Memory and Storage
  "mem-opt":                  { level: "Recommended",  category: "Memory and Storage" },
  "large-system-cache":       { level: "Advanced",     category: "Memory and Storage" },
  "page-combining":           { level: "Advanced",     category: "Memory and Storage" },
  "prefetch":                 { level: "Advanced",     category: "Memory and Storage" },
  "superfetch":               { level: "Advanced",     category: "Memory and Storage" },
  "storage-sense":            { level: "Recommended",  category: "Memory and Storage" },
  "ntfs-last-access":         { level: "Advanced",     category: "Memory and Storage" },
  "io-optimization-profile":  { level: "Advanced",     category: "Memory and Storage" },
  "win-search-index":         { level: "Advanced",     category: "Memory and Storage" },

  // Privacy and Telemetry
  "telemetry":                { level: "Advanced",     category: "Privacy and Telemetry" },
  "nvidia-telemetry":         { level: "Advanced",     category: "Privacy and Telemetry" },
  "copilot":                  { level: "Recommended",  category: "Privacy and Telemetry" },
  "cortana":                  { level: "Recommended",  category: "Privacy and Telemetry" },
  "search-highlights":        { level: "Recommended",  category: "Privacy and Telemetry" },
  "disable-delivery-opt":     { level: "Recommended",  category: "Privacy and Telemetry" },
  "disable-wer":              { level: "Advanced",     category: "Privacy and Telemetry" },
  "disable-activity-history": { level: "Recommended",  category: "Privacy and Telemetry" },

  // Gaming and Latency
  "gaming-mode":              { level: "Recommended",  category: "Gaming and Latency" },
  "tune-priority":            { level: "Advanced",     category: "Gaming and Latency" },
  "win32-priority-sep":       { level: "Advanced",     category: "Gaming and Latency" },
  "sys-responsiveness":       { level: "Advanced",     category: "Gaming and Latency" },
  "max-pending-interrupts":   { level: "Advanced",     category: "Gaming and Latency" },
  "timer-resolution-slider":  { level: "Advanced",     category: "Gaming and Latency" },
  "net-throttle-index":       { level: "Advanced",     category: "Gaming and Latency" },
  "irq-priority":             { level: "Experimental", category: "Gaming and Latency" },
  "irq-optimization-profile": { level: "Advanced",     category: "Gaming and Latency" },
  "synth-timers":             { level: "Experimental", category: "Gaming and Latency" },
  "timer-res":                { level: "Advanced",     category: "Gaming and Latency" },
  "hpet-disable":             { level: "Advanced",     category: "Gaming and Latency" },
  "disable-fso":              { level: "Recommended",  category: "Gaming and Latency" },
  "usb-selective-suspend":    { level: "Recommended",  category: "Gaming and Latency" },

  // Input
  "disable-pointer-precision":{ level: "Recommended",  category: "Input" },
  "mouse-queue-size":         { level: "Advanced",     category: "Input" },
  "kbd-queue-size":           { level: "Advanced",     category: "Input" },
  "low-level-hooks-timeout":  { level: "Advanced",     category: "Input" },

  // GPU and Graphics
  "desktop-comp":             { level: "Experimental", category: "GPU and Graphics" },
  "hdcp":                     { level: "Experimental", category: "GPU and Graphics" },
  "preemption":               { level: "Advanced",     category: "GPU and Graphics" },
  "disable-mpo":              { level: "Advanced",     category: "GPU and Graphics" },
  "directx-optimization-profile": { level: "Advanced",     category: "GPU and Graphics" },

  // Network
  "bluetooth":                { level: "Recommended",  category: "Network" },
  "wifi":                     { level: "Advanced",     category: "Network" },

  // Debloat and Apps
  "xbox-bar":                 { level: "Recommended",  category: "Debloat and Apps" },
  "xbox-services":            { level: "Advanced",     category: "Debloat and Apps" },
  "fax-printer":              { level: "Advanced",     category: "Debloat and Apps" },

  // Windows UX
  "compact-explorer":         { level: "Recommended",  category: "Windows UX" },
  "recent-files":             { level: "Recommended",  category: "Windows UX" },
  "menu-show-delay":          { level: "Advanced",     category: "Windows UX" },
  "hung-app-timeout":         { level: "Advanced",     category: "Windows UX" },
  "disable-transparency":     { level: "Recommended",  category: "Windows UX" },
  "disable-animations":       { level: "Recommended",  category: "Windows UX" },
  "wait-to-kill-app":         { level: "Advanced",     category: "Windows UX" },
  "show-file-extensions":     { level: "Advanced",     category: "Windows UX" },
  "explorer-separate-process":{ level: "Advanced",     category: "Windows UX" },
  "disable-lock-screen":      { level: "Advanced",     category: "Windows UX" },
  "disable-wallpaper-compression": { level: "Advanced", category: "Windows UX" },

  // ── Premium Power / GPU ───────────────────────────────────────────────────
  "maximum-cpu-responsiveness": { level: "Advanced",   category: "System and Power" },
  "gpu-msi-mode":               { level: "Advanced",   category: "GPU and Graphics" },
  "pci-msi-mode":               { level: "Advanced",   category: "Gaming and Latency" },
};

export function isPremiumTweakById(tweakId: string): boolean {
  // Free exceptions always override everything
  if (FREE_EXCEPTION_IDS.has(tweakId)) return false;

  // Premium exceptions always override everything
  if (PREMIUM_EXCEPTION_IDS.has(tweakId)) return true;

  const info = TWEAK_TIER_MAP[tweakId];
  // Unknown tweaks default to free — benefit of the doubt rather than false gating
  if (!info) return false;

  // Experimental tweaks are premium unless explicitly listed as free
  if (info.level === "Experimental") return true;

  // Advanced and Recommended tweaks are free unless explicitly listed as premium
  return false;
}

export function isFreeTweakById(tweakId: string): boolean {
  return !isPremiumTweakById(tweakId);
}

export function getTweakTierById(tweakId: string): "free" | "premium" {
  return isPremiumTweakById(tweakId) ? "premium" : "free";
}
