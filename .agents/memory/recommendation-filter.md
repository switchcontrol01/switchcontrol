---
name: Recommendation filter canonical
description: isRecommendedSafe in hooks.ts is the single canonical filter for bulk-apply safety — never duplicate.
---

# Recommendation Filter — One Source of Truth

## The Rule
`isRecommendedSafe()` in `client/src/lib/hooks.ts` is the ONLY place that defines which tweaks are safe for bulk-apply. It uses `GUARDED_TWEAK_IDS` (also exported from hooks.ts).

**Why:** Having a second inline filter in `store.ts enableRecommended()` meant two lists could silently diverge (different IDs excluded, no slider check, no requiresAgent check).

## How to Apply
- `hooks.ts` exports both `isRecommendedSafe` and `GUARDED_TWEAK_IDS`
- `store.ts` imports `isRecommendedSafe` from `./hooks` and uses it directly
- Any new exclusion → add to `GUARDED_TWEAK_IDS` in hooks.ts only
- `useApplyRecommended` (hooks.ts) and `enableRecommended` (store.ts) both now use the same filter

## Critical Guards in isRecommendedSafe
- `controlType === 'slider'` → always rejected (sliders need manual value choice)
- `requiresAgent` → always rejected
- `GUARDED_TWEAK_IDS` → bluetooth, wifi, all network tweaks, system-breaking tweaks
