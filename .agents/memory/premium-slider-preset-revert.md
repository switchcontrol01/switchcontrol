---
name: Premium Slider/Preset Revert Fix
description: Slider and preset tweaks were skipped during trial expiry revert; fixed in v2 by wiring backend batch reverts; fixed again in v3 for three deeper root causes.
---

**Problem:** Slider and preset tweaks never got reverted when trial expired. The client-side `runPremiumRevert()` engine in `premiumRevertEngine.ts` had NO code to handle them.

**Fix (v2 — IPC wiring):**
- Added `ipcMain.handle('tweak:revertAllSliders', ...)` and `ipcMain.handle('presetTweaks:revertAll', ...)` in `electron/main.js`.
- Exposed them in `electron/preload.js`.
- Added `revertSliderTweaks()` and `revertPresetTweaks()` to `premiumRevertEngine.ts`.
- Added `sliderResults` and `presetResults` to `PremiumRevertReport`.

---

**Follow-up fix (v2.1 — backup corruption):** The backup-capture mechanism was broken. If the state file was created after tweaks were already applied, the "original backup" stored the tweaked value. Fix: `forceRevertSliderToDefault()` / `forceRevertPresetToDefault()` bypass the user-data backup and always write the static `defaultValue` from the tweak definition.

---

**Fix (v3 — three root causes at the engine level):**

**Root cause 1 — Electron `revertAllPremiumSliders` misses sliders without backups:**
Previous code: `Object.keys(state.originalValues)` — if `slider-state.json` is missing/empty, ZERO sliders revert.
Fix: iterate `Object.entries(SLIDER_TWEAKS).filter(([, def]) => def.premium && !def.disabled)` — covers all sliders regardless of backup. Writing the Windows default to an already-default key is idempotent and safe. Added `success: true` to return object.

**Root cause 2 — Frontend success check was always falsy (3× retry, wrong results read):**
Previous code: `if (lastResult?.success)` — the IPC returns `{ reverted, failed }` with NO 'success' key. Always undefined → loop runs 3×. Attempt 1 clears originalValues from state.json; attempts 2–3 find nothing and return `reverted=[]`. Reading from the LAST attempt → engine reports 0 reverts even when all succeeded.
Fix: `if (lastResult?.success === true || Array.isArray(lastResult?.reverted))`.
Same fix applied to `revertPresetTweaks()` (identical bug).

**Root cause 3 — Zustand sliderValues never cleared after revert:**
After Windows was reverted, `useStore.sliderValues` still held premium values → slider UI showed stale premium state. `hasPremiumItemsToRevert()` also never checked slider state, so the revert was never triggered if only sliders were applied.
Fix: Added `PREMIUM_SLIDER_DEFAULTS` map (all 10 premium slider defaults). Added `clearPremiumSliderStoreValues()` that calls `setSliderValue(id, default)` for each reverted ID. Called after successful revert + dispatches `sc:sliders-reverted` DOM event. Fixed `hasPremiumItemsToRevert()` to also check `useStore.sliderValues` against the defaults map.

**Key invariant:** `PREMIUM_SLIDER_DEFAULTS` in `premiumRevertEngine.ts` must stay in sync with `defaultValue` fields in `electron/slider-tweak-executor.js`. If a new premium slider is added to the executor, add its default here too.

**Why:** The ownership store (tweakOwnershipStore) never tracked sliders — it only tracks toggle tweaks, network tweaks, EL, and power plan. Sliders must be checked against the Zustand sliderValues store + PREMIUM_SLIDER_DEFAULTS for detection, and the backend must iterate SLIDER_TWEAKS directly (not a potentially-empty backup) for reliable revert coverage.
