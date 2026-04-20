import { 
  isPremiumTweakById as sharedIsPremiumTweakById,
  isFreeTweakById as sharedIsFreeTweakById,
  getTweakTierById,
} from "../../../shared/tweak-tiers";
import { REGISTRY } from "./tweak-registry";

export { getTweakTierById };

export const isTweakPremium = sharedIsPremiumTweakById;
export const isTweakFree = sharedIsFreeTweakById;

export function countFreeTweaks(): number {
  return REGISTRY.filter(t => t.supported && !t.premium).length;
}

export function countPremiumTweaks(): number {
  return REGISTRY.filter(t => t.supported && t.premium).length;
}
