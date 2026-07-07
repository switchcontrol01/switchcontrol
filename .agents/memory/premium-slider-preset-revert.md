---
name: Premium Slider/Preset Revert Fix
description: Slider and preset tweaks were skipped during trial expiry revert; fixed by wiring backend batch reverts into the client-side engine.
---

**Problem:** Slider and preset tweaks never got reverted when trial expired. The client-side `runPremiumRevert()` engine in `premiumRevertEngine.ts` had NO code to handle them, so the modal always reported 0 reverted for these categories.

**Why:** Slider/preset original values are stored in `slider-state.json` and `preset-state.json` by the backend executors (`slider-tweak-executor.js`, `preset-tweak-executor.js`). The backend already had `revertAllPremiumSliders()` and `revertAllPremiumPresets()` sweeps that read these files and restore originals. But:
1. There were no IPC handlers exposing these sweeps.
2. The client-side revert engine didn't call them.
3. The modal didn't display their results.

**Fix:**
- Added `ipcMain.handle('tweak:revertAllSliders', ...)` and `ipcMain.handle('presetTweaks:revertAll', ...)` in `electron/main.js`.
- Exposed them in `electron/preload.js`.
- Added `revertSliderTweaks()` and `revertPresetTweaks()` to `client/src/lib/premiumRevertEngine.ts`, with retry logic matching the rest of the engine.
- Added `sliderResults` and `presetResults` to `PremiumRevertReport`.
- Updated `PremiumRevertModal` phases and results display.
- Updated `usePremiumExpiry.ts` default report shapes.

**Why:** This closes the loophole where trial expiry left premium slider/preset registry changes permanently applied.

---

**Follow-up fix (v1.1.9):** The backup-capture mechanism was itself broken. When the state file was created after tweaks were already applied (e.g., state file lost, migrated from an older version, or first capture ran on an already-tweaked system), the "original backup" stored the tweaked value, not the true Windows default. On revert, the engine restored the tweaked value back to the registry, making it appear like nothing changed.

**Fix (v1.1.9):**
- Created `forceRevertSliderToDefault()` and `forceRevertPresetToDefault()` that bypass the user-data backup and always write the static `defaultValue` / `defaultOptionId` from the tweak definition.
- `revertAllPremiumSliders()` and `revertAllPremiumPresets()` now call the force-default functions.
- After successful revert, stale backup entries are cleared from the state file so the next manual apply captures a fresh true original.

**Also fixed in v1.1.9:** `teams-startup` toggle tweak revert failed because the PowerShell command had `"Teams.exe"` inside a JavaScript template literal. The `"` became a raw `"` in PowerShell, prematurely closing the `-Value` string argument. Fixed by using a `$val` variable with single-quoted `'Teams.exe'` inside the double-quoted path.

**Why:** The user-data backup can never be trusted as the sole source of truth for revert. The static defaults in the tweak definitions are the canonical Windows defaults and must be used for trial expiry reverts.
