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
 * Used for slider-based and advanced controls that should not be gated.
 */
export const FREE_EXCEPTION_IDS: Set<string> = new Set([
  "win32-priority-sep",
  "mouse-queue-size",
  "kbd-queue-size",
  "sys-responsiveness",
  "net-throttle-index",
  "menu-show-delay",
  "hung-app-timeout",
  "power-throttling",
  "disable-transparency",
  "disable-animations",
  "ntfs-last-access",
  "low-level-hooks-timeout",
  "wait-to-kill-app",
  "show-file-extensions",
  "explorer-separate-process",
  "disable-auto-restart-apps",
  // Specific Advanced tweaks that should be free for all users
  "disable-mpo",
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

  // Memory and Storage
  "mem-opt":                  { level: "Recommended",  category: "Memory and Storage" },
  "large-system-cache":       { level: "Advanced",     category: "Memory and Storage" },
  "page-combining":           { level: "Advanced",     category: "Memory and Storage" },
  "prefetch":                 { level: "Advanced",     category: "Memory and Storage" },
  "superfetch":               { level: "Advanced",     category: "Memory and Storage" },
  "storage-sense":            { level: "Recommended",  category: "Memory and Storage" },
  "ntfs-last-access":         { level: "Advanced",     category: "Memory and Storage" },
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
  "net-throttle-index":       { level: "Advanced",     category: "Gaming and Latency" },
  "irq-priority":             { level: "Experimental", category: "Gaming and Latency" },
  "synth-timers":             { level: "Experimental", category: "Gaming and Latency" },
  "timer-res":                { level: "Advanced",     category: "Gaming and Latency" },
  "disable-fso":              { level: "Recommended",  category: "Gaming and Latency" },
  "usb-selective-suspend":    { level: "Recommended",  category: "Gaming and Latency" },
  "mmcss-gaming":             { level: "Advanced",     category: "Gaming and Latency" },

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
  "show-file-extensions":     { level: "Recommended",  category: "Windows UX" },
  "explorer-separate-process":{ level: "Advanced",     category: "Windows UX" },
};

export function isPremiumTweakById(tweakId: string): boolean {
  // Explicit free exceptions always override level/category logic
  if (FREE_EXCEPTION_IDS.has(tweakId)) return false;

  const info = TWEAK_TIER_MAP[tweakId];
  // Unknown tweaks default to free — benefit of the doubt rather than false gating
  if (!info) return false;
  if (PREMIUM_TWEAK_LEVELS.includes(info.level)) return true;
  if (PREMIUM_TWEAK_CATEGORIES.includes(info.category)) return true;
  return false;
}

export function isFreeTweakById(tweakId: string): boolean {
  return !isPremiumTweakById(tweakId);
}

export function getTweakTierById(tweakId: string): "free" | "premium" {
  return isPremiumTweakById(tweakId) ? "premium" : "free";
}
