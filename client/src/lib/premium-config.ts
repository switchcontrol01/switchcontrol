export const FREE_TWEAK_IDS = [
  "notifications",
  "bg-apps",
  "search-highlights", 
  "cortana",
  "copilot",
  "gaming-mode",
  "storage-sense",
];

export function isTweakFree(tweakId: string): boolean {
  return FREE_TWEAK_IDS.includes(tweakId);
}

export function isTweakPremium(tweakId: string): boolean {
  return !FREE_TWEAK_IDS.includes(tweakId);
}
