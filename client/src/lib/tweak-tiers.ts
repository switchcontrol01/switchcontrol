import type { Tweak, TweakLevel, TweakCategory } from "./mock-data";

// Premium tier definitions - matches server-side logic
export const PREMIUM_TWEAK_LEVELS: TweakLevel[] = ["Advanced", "Experimental"];
export const PREMIUM_TWEAK_CATEGORIES: TweakCategory[] = ["Network"];

// Free tier - only Recommended level tweaks from non-Network categories
export const FREE_TWEAK_LEVELS: TweakLevel[] = ["Recommended"];

export function isPremiumTweak(tweak: Tweak): boolean {
  // If level is Advanced or Experimental, it's premium
  if (PREMIUM_TWEAK_LEVELS.includes(tweak.level)) {
    return true;
  }
  // If category is Network, it's premium
  if (PREMIUM_TWEAK_CATEGORIES.includes(tweak.category)) {
    return true;
  }
  return false;
}

export function getTweakTier(tweak: Tweak): "free" | "premium" {
  return isPremiumTweak(tweak) ? "premium" : "free";
}

export function countFreeTweaks(tweaks: Tweak[]): number {
  return tweaks.filter(t => !isPremiumTweak(t)).length;
}

export function countPremiumTweaks(tweaks: Tweak[]): number {
  return tweaks.filter(t => isPremiumTweak(t)).length;
}
