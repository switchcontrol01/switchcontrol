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
