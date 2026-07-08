---
name: Premium Slider/Preset Revert Fix
description: Slider and preset tweaks were skipped during trial expiry revert; fixed in v2 by wiring backend batch reverts; fixed again in v3 for three deeper root causes; v4 fixes preset Zustand store clear + tcp-throttling-index check.
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

---

**Fix (v4 — preset Zustand store + tcp-throttling-index check bug):**

**Root cause 4 — Preset Zustand store never cleared after revert:**
Backend (PresetExecutor) correctly wrote Windows defaults to all 3 preset registries (reverted=3 failed=0). But `revertPresetTweaks()` had NO equivalent of `clearPremiumSliderStoreValues()`. The `pendingOptionId` in TweakPresetCard reads directly from `useStore.presetOptions`, which was never reset. Result: NTFS I/O Optimization Profile showed "Pending: Gaming" and GPU Driver Timeout Profile showed "Pending: Extended Timeout" in the UI even though the registry was already at defaults.
Fix: Added `PREMIUM_PRESET_DEFAULTS` map (`irq-optimization-profile` → `balanced`, `io-optimization-profile` → `standard`, `directx-optimization-profile` → `standard`). Added `clearPremiumPresetStoreValues()` that calls `store.setPresetOption(id, defaultOptionId)` for each. Called after successful backend revert + dispatches `sc:presets-reverted`. Also added preset check to `hasPremiumItemsToRevert()`.

**Key invariant:** `PREMIUM_PRESET_DEFAULTS` must stay in sync with `defaultOptionId` fields in `electron/preset-tweak-executor.js`. Add new entries whenever a new premium preset tweak is added.

**Root cause 5 — tcp-throttling-index check always returns "true" after revert:**
The check script: `if ($v -ge 0xFFFFFFF0) { "true" } else { "false" }`.
In PowerShell 5.1, `0xFFFFFFF0` is a hex literal parsed as Int32 = **-16**. So the condition becomes `$v -ge -16`. After reverting to value 10: `10 -ge -16` = `$true` → check reports "applied". Verification can never pass after a revert.
Fix: Changed to `if ($null -ne $v -and $v -lt 0) { "true" } else { "false" }`. The applied value (0xFFFFFFFF) is read by PS as Int32 -1 (< 0 ✓). The reverted value (10) correctly returns false.

**Why this PowerShell gotcha matters:** Registry DWORD values larger than Int32.MaxValue (2147483647) are read back by PowerShell 5.1 as negative Int32 values. Any hex literal `0xXXXXXXXX` > 0x7FFFFFFF is also parsed as negative Int32. Never use `$v -ge 0xFFFFF...` range checks for these; use `$v -lt 0` or `$v -eq -1`.
