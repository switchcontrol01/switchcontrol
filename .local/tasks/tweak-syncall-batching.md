# Batch tweak:syncAll PowerShell Calls

## What & Why
`tweak:syncAll` in `electron/main.js` checks all 63 tweak states by spawning a separate PowerShell process for each one — sequentially, one at a time. This takes ~37 seconds per run and fires not just at startup but on **every window focus event**, meaning a user who alt-tabs back to the app triggers another 37-second background barrage.

`electron/tweak-executor.js` already contains a batch checker function (around line 1473) described as "Replaces 60+ sequential PS launches with a single script written to a temp file" — but the `tweak:syncAll` IPC handler (main.js lines 3028–3032) still uses the old `for...of` loop calling `checkTweakStatus` per tweak instead.

## Done looks like
- `tweak:syncAll` completes in under 3 seconds (single PS invocation instead of 63)
- Alt-tabbing back into the app does not trigger another full sync if one ran within the last 5 minutes
- Tweak states on the Tweaks page still reflect real Windows state after the batch check
- The PS-Limiter `SKIPPED` log no longer fires 7× in a row from overlapping sync attempts

## Out of scope
- Changing how individual tweak toggles execute (apply/revert)
- Network Tweaks batching (already fixed separately)
- Changing the `checkTweakStatus` API used for single-tweak verification post-apply

## Steps
1. **Wire `tweak:syncAll` to the existing batch checker** — Replace the sequential `for...of` loop in `ipcMain.handle('tweak:syncAll')` with a call to the batch-check function already in `tweak-executor.js`. Return the same result shape (`Record<tweakId, status>`) that the renderer expects.
2. **Add a focus-event cooldown on the client** — In whatever hook or component triggers `syncAll` on window focus, add a module-level timestamp guard: skip the sync if the last one ran fewer than 5 minutes ago. This prevents repeated 37-second runs when the user alt-tabs repeatedly.
3. **Smoke-test** — Confirm in Electron logs that `tweak:syncAll` shows a single PS-Exec entry with total time under 3 seconds, and that a second focus event within 5 minutes logs a skip rather than re-running.

## Relevant files
- `electron/main.js:3018-3038`
- `electron/tweak-executor.js:1447-1578`
- `electron/preload.js:325`
