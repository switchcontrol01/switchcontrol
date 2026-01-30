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

interface TweakTierInfo {
  level: TweakLevel;
  category: TweakCategory;
}

export const TWEAK_TIER_MAP: Record<string, TweakTierInfo> = {
  "hibernation": { level: "Recommended", category: "System and Power" },
  "fast-startup": { level: "Experimental", category: "System and Power" },
  "energy-logging": { level: "Advanced", category: "System and Power" },
  "maintenance": { level: "Recommended", category: "System and Power" },
  "bg-apps": { level: "Recommended", category: "System and Power" },
  "core-isolation": { level: "Experimental", category: "System and Power" },
  "vbs": { level: "Experimental", category: "System and Power" },
  "hyper-v": { level: "Advanced", category: "System and Power" },
  "p-states": { level: "Experimental", category: "System and Power" },
  "notifications": { level: "Recommended", category: "System and Power" },
  "mem-opt": { level: "Recommended", category: "Memory and Storage" },
  "large-system-cache": { level: "Advanced", category: "Memory and Storage" },
  "page-combining": { level: "Advanced", category: "Memory and Storage" },
  "prefetch": { level: "Advanced", category: "Memory and Storage" },
  "superfetch": { level: "Advanced", category: "Memory and Storage" },
  "storage-sense": { level: "Recommended", category: "Memory and Storage" },
  "telemetry": { level: "Advanced", category: "Privacy and Telemetry" },
  "nvidia-telemetry": { level: "Advanced", category: "Privacy and Telemetry" },
  "copilot": { level: "Recommended", category: "Privacy and Telemetry" },
  "cortana": { level: "Recommended", category: "Privacy and Telemetry" },
  "search-highlights": { level: "Recommended", category: "Privacy and Telemetry" },
  "gaming-mode": { level: "Recommended", category: "Gaming and Latency" },
  "tune-priority": { level: "Advanced", category: "Gaming and Latency" },
  "irq-priority": { level: "Experimental", category: "Gaming and Latency" },
  "synth-timers": { level: "Experimental", category: "Gaming and Latency" },
  "timer-res": { level: "Advanced", category: "Gaming and Latency" },
  "desktop-comp": { level: "Experimental", category: "GPU and Graphics" },
  "hdcp": { level: "Experimental", category: "GPU and Graphics" },
  "preemption": { level: "Advanced", category: "GPU and Graphics" },
  "bluetooth": { level: "Recommended", category: "Network" },
  "wifi": { level: "Recommended", category: "Network" },
  "xbox-bar": { level: "Recommended", category: "Debloat and Apps" },
  "xbox-services": { level: "Advanced", category: "Debloat and Apps" },
  "fax-printer": { level: "Advanced", category: "Debloat and Apps" },
  "compact-explorer": { level: "Recommended", category: "Windows UX" },
  "recent-files": { level: "Recommended", category: "Windows UX" },
};

export function isPremiumTweakById(tweakId: string): boolean {
  const info = TWEAK_TIER_MAP[tweakId];
  if (!info) {
    return true;
  }
  if (PREMIUM_TWEAK_LEVELS.includes(info.level)) {
    return true;
  }
  if (PREMIUM_TWEAK_CATEGORIES.includes(info.category)) {
    return true;
  }
  return false;
}

export function isFreeTweakById(tweakId: string): boolean {
  return !isPremiumTweakById(tweakId);
}

export function getTweakTierById(tweakId: string): "free" | "premium" {
  return isPremiumTweakById(tweakId) ? "premium" : "free";
}
