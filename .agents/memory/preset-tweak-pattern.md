---
name: Preset-card tweak pattern
description: How preset-profile tweaks (multi-option cards) mirror the slider-tweak pattern end-to-end
---

Preset-profile tweaks (e.g. IRQ/IO/DirectX optimization profiles) are implemented as a parallel track to slider tweaks, not a variant of the toggle system.

**Why:** presets need >2 discrete named options (not on/off, not a numeric range), each with its own registry/config target, so they need their own executor, IPC namespace, hook, and store slice rather than overloading `tweaks`/`sliderValues`.

**How to apply:** when adding a new multi-option control, mirror the existing trio exactly:
- `electron/preset-tweak-executor.js` mirrors `slider-tweak-executor.js` (state keyed by string `optionId`, not numeric value), exports `revertAllPremiumPresets()` for the trial/premium revert pipeline.
- IPC namespace `presetTweaks` (getState/apply/revert/getMeta/checkCrashSentinel) mirrors `tweaks`, added to both `main.js` and `preload.js` and typed in `client/src/types/electron.d.ts`.
- `client/src/hooks/use-preset-tweak.ts` mirrors `use-slider-tweak.ts`.
- Zustand `presetOptions: Record<string, string>` mirrors `sliderValues`, with the same onRehydrateStorage sanitize-guard pattern (reject non-object/array, drop non-string values) to survive corrupted localStorage.
- UI: `TweakPresetCard.tsx` mirrors `TweakSliderCard.tsx`'s structure (badges, VerifyBanner, AdvancedDetails, apply/revert buttons) but renders option cards instead of a slider.
- Tweaks flagged `isAdvancedTuning: true` in `tweak-registry.ts` are excluded from the normal category/chip filtering and rendered together in one dedicated "Advanced Tuning" section in `TweaksList.tsx`, regardless of controlType (slider or preset).

**Preset restart recovery:** Persist the last successfully applied option separately from both `originalValues` (the revert baseline) and `presetOptions` (a UI cache of last observed Windows state). Only restore explicit verified targets after entitlement verification; clear them only after a verified user reset or premium downgrade. Older installs can migrate a target from the latest successful audit-log action only when the original baseline proves SwitchControl previously applied that profile.

**Why:** Windows may remove a preset registry value during reboot. Reading the live default back into the UI without restoring a saved, app-owned target silently loses the user's selected profile; treating the UI cache alone as ownership could instead apply a value the user never chose.

**How to apply:** Any preset apply/reset/downgrade or startup-reconciliation change must preserve this three-way separation, verify the live registry after writes, and keep premium entitlement checks in the native executor.
