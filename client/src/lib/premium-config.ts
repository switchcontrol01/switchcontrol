import { 
  isPremiumTweakById as sharedIsPremiumTweakById,
  isFreeTweakById as sharedIsFreeTweakById,
  getTweakTierById,
  TWEAK_TIER_MAP
} from "../../../shared/tweak-tiers";

export { getTweakTierById };

export const isTweakPremium = sharedIsPremiumTweakById;
export const isTweakFree = sharedIsFreeTweakById;

export function countFreeTweaks(): number {
  return Object.keys(TWEAK_TIER_MAP).filter(id => !sharedIsPremiumTweakById(id)).length;
}

export function countPremiumTweaks(): number {
  return Object.keys(TWEAK_TIER_MAP).filter(id => sharedIsPremiumTweakById(id)).length;
}
