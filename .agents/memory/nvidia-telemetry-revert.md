---
name: NVIDIA telemetry revert — modern driver no-op success
description: executeNvidiaTelemetry revert always failed on modern NVIDIA driver installs; root cause and fix.
---

## Rule
Two bugs must both be fixed together — fixing only one still causes revert to fail.

**Bug 1 — verifyTweak (isApplied):**
The PS query for nvidia-telemetry returned `$true` when no tasks AND no service existed ("no components = already disabled = applied"). This is wrong — "applied" requires components to actually exist and be disabled. Fix: `no tasks + no service → $false`; tasks exist → check all disabled; only service → check StartType=Disabled.

**Bug 2 — executeNvidiaTelemetry revert early-return:**
On modern drivers with no components, `ok = !verified = !$true = false` always. Add a revert-only pre-check: if no components exist, return `ok: true` immediately (nothing to restore = already default state).

**Why both are needed:**
- verifyTweak drives `revertSingleTweak`'s pre-check (line 406) AND post-execute check (line 426)
- If verifyTweak is fixed alone: pre-check returns `isApplied=false` → revert engine short-circuits with "already reverted" without ever calling execute → ok for modern drivers, but if components existed and the execute early-return wasn't there, the execute path still has its own internal verification bug
- If executeNvidiaTelemetry is fixed alone: execute returns ok=true, but post-execute checkStatus still calls verifyTweak with the old bug → `isApplied=true` → retry → fail

**How to apply:**
- `electron/tweak-executor.js` → `verifyTweak()`: nvidia-telemetry branch, update PS query
- `electron/tweak-executor.js` → `executeNvidiaTelemetry()`: add `if (action === 'revert') { hasComponents check; early-return ok:true if none }`
- Affects both manual toggle revert AND premium revert engine (both call same executeTweak → executeNvidiaTelemetry; both call checkStatus → verifyTweak)
