import { TWEAKS_DATA, type Tweak, type TweakLevel, type TweakCategory } from "./mock-data";

// Premium tier definitions - matches server-side logic
export const PREMIUM_TWEAK_LEVELS: TweakLevel[] = ["Advanced", "Experimental"];
export const PREMIUM_TWEAK_CATEGORIES: TweakCategory[] = ["Network"];

// Free tier - only Recommended level tweaks from non-Network categories
export const FREE_TWEAK_LEVELS: TweakLevel[] = ["Recommended"];

export function isTweakPremiumByDefinition(tweak: Tweak): boolean {
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

export function isTweakFreeByDefinition(tweak: Tweak): boolean {
  return !isTweakPremiumByDefinition(tweak);
}

// Lookup functions by ID
const tweakMap = new Map<string, Tweak>();
TWEAKS_DATA.forEach(t => tweakMap.set(t.id, t));

export function isTweakPremium(tweakId: string): boolean {
  const tweak = tweakMap.get(tweakId);
  if (!tweak) return false;
  return isTweakPremiumByDefinition(tweak);
}

export function isTweakFree(tweakId: string): boolean {
  return !isTweakPremium(tweakId);
}

export function getTweakTier(tweakId: string): "free" | "premium" {
  return isTweakPremium(tweakId) ? "premium" : "free";
}

// Count helpers
export function countFreeTweaks(): number {
  return TWEAKS_DATA.filter(t => !isTweakPremiumByDefinition(t)).length;
}

export function countPremiumTweaks(): number {
  return TWEAKS_DATA.filter(t => isTweakPremiumByDefinition(t)).length;
}

// Get lists
export function getFreeTweaks(): Tweak[] {
  return TWEAKS_DATA.filter(t => !isTweakPremiumByDefinition(t));
}

export function getPremiumTweaks(): Tweak[] {
  return TWEAKS_DATA.filter(t => isTweakPremiumByDefinition(t));
}
