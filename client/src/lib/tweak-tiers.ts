import type { Tweak } from "./mock-data";
import {
  isPremiumTweakById as sharedIsPremiumTweakById,
  isFreeTweakById as sharedIsFreeTweakById,
  getTweakTierById as sharedGetTweakTierById,
} from "../../../shared/tweak-tiers";

export { PREMIUM_TWEAK_LEVELS, PREMIUM_TWEAK_CATEGORIES, FREE_TWEAK_LEVELS } from "../../../shared/tweak-tiers";

export function isPremiumTweak(tweak: Tweak): boolean {
  return sharedIsPremiumTweakById(tweak.id);
}

export function isFreeTweak(tweak: Tweak): boolean {
  return sharedIsFreeTweakById(tweak.id);
}

export function getTweakTier(tweak: Tweak): "free" | "premium" {
  return sharedGetTweakTierById(tweak.id);
}

export function countFreeTweaks(tweaks: Tweak[]): number {
  return tweaks.filter((t) => !isPremiumTweak(t)).length;
}

export function countPremiumTweaks(tweaks: Tweak[]): number {
  return tweaks.filter((t) => isPremiumTweak(t)).length;
}
