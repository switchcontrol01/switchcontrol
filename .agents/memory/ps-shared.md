---
name: ps-shared module
description: Architecture of the shared PowerShell primitives module used by all three executor files.
---

## Rule
All PowerShell spawning from tweak-executor.js, slider-tweak-executor.js, and preset-tweak-executor.js goes through `electron/ps-shared.js`. Never add local copies of runPS/queryPS/checkIsAdmin/runElevated to any executor file.

## What ps-shared.js owns
- `_withPsSemaphore` — shared queuing semaphore, combined cap with psLimiter (main.js)
- `_isAdminCache` — single module-level cache; one PS spawn per process lifetime
- `runPS(command)` — gated through semaphore
- `queryPS(command)` — gated through semaphore, resolves null on error
- `checkIsAdmin()` — uses shared cache
- `runElevated(command, { tempFilePrefix })` — VBScript/ShellExecute pattern, gated through semaphore

## What stays in each executor
- `psInt(v)` in slider-tweak-executor.js — DWORD cast formatter, slider-specific, do NOT move
- `logSliderEntry`, `logPresetEntry` — log formatters, do NOT move

## tempFilePrefix per executor
- tweak-executor.js: `'sc_tweak_'`
- slider-tweak-executor.js: `'sc_slider_'`
- preset-tweak-executor.js: `'sc_preset_'`

## Combined ceiling invariant
`_psActive` (ps-shared semaphore, all 3 executors) + `psLimiter.getState().active` (main.js) < `psLimiter.MAX_CONCURRENT_PS` (6)

**Why:** slider and preset executors previously called execFile() directly with zero concurrency gating — a third invisible source of PS spawns alongside main.js's psLimiter and tweak-executor's semaphore.

**How to apply:** if you add a new executor or a new direct PS spawn anywhere in electron/, route it through ps-shared.js's runPS/queryPS/runElevated rather than calling execFile directly.
