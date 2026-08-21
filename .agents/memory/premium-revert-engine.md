---
name: Premium Revert Engine reliability
description: Root causes of 0–50% success rates on premium trial expiry revert; all fixed in v2.
---

## Three independent root causes

### 1. Normal tweaks (~50% → ~100%)
**Bug:** Conflict check compared `currentIsApplied` to `appliedIsApplied`. A reboot or Windows update that already undid the tweak made `currentIsApplied=false` while `appliedIsApplied=true`, firing as "conflict → skip" with the item never actually reverted.

**Fix:** If `currentIsApplied === false` (already at target end-state), count as `'reverted'` immediately. Only execute IPC revert when the tweak is still active.

### 2. Network tweaks (~20% → ~100%)
**Bug:** `revertSingleNetworkTweak` fetched `/api/network-tweaks/state` (backend DB snapshot) and compared to `appliedStatus`. Any divergence between Windows state and the DB snapshot fired as conflict → skip. This divergence was near-universal (reboots, manual netsh, Windows updates all cause it), explaining ~20% success.

**Fix:** Removed the HTTP pre-check entirely. Execute IPC revert directly; rely on `result.success` + `result.verified` flag from the IPC for confirmation. Retry up to 3× with exponential back-off.

### 3. Extreme Labs (0% → ~100%)
**Bug:** Extreme Labs was completely disconnected from the revert engine. State lived only in `localStorage("extreme-labs-applied")`; `premiumRevertEngine.ts` had no code for it at all.

**Fix:**
- Added `extremeLabs: Record<string, ExtremeTweakOwnership>` namespace to `tweakOwnershipStore.ts` (persisted).
- `ExtremeLabs.tsx` calls `recordExtremeLabsApply(id, label)` on each successful apply, `recordExtremeLabsRevertSuccess(id)` on undo/revert-all.
- `revertExtremeLabsTweaks()` added to engine — calls `electronAPI.extremeLabs.restoreBaseline()` with 3× retry.
- `hasPremiumItemsToRevert()` updated to check `extremeLabs` entries for startup self-heal.

## Retry policy
All three categories retry up to `MAX_RETRY_ATTEMPTS=3` times with `600ms * attempt` exponential back-off before marking an item as `'failed'`.

## Live progress UI
Modal opens immediately when revert starts (not after completion). Shows 5 animated steps: Locking → Tweaks → Network → Extreme Labs → Verifying. Close button hidden while engine runs.

**Why:** Users were staring at a blank screen for 5–30 seconds with no feedback, and the modal appearing after the fact gave no indication of what happened to each category.

## How to apply
When touching the revert engine or ownership store, ensure:
- Network tweak conflict detection never uses HTTP state — IPC only.
- `extremeLabs` namespace is included in any new `clearPremiumOwnership`/`resetOwnership` calls.
- Any new tweak category added must be wired into `hasPremiumItemsToRevert()` or it silently skips startup self-heal.

### 4. NIC-backed EL tweaks reported "reverted" while still applied
**Bug:** `nicExecutor.resetNicProperty()` returned `ok:true, outcome:'reset_verified'` as soon as the elevated `Reset-NetAdapterAdvancedProperty`/ring-buffer command exited without a PowerShell error — it never read back the property to confirm the value actually changed. Its sibling `setNicProperty()` (apply path) DID verify via readback; only the reset/revert path was unconditionally trusting. `restoreBaseline` in `main.js` propagated `r.ok` straight to `reverted:true`, so the whole chain (executor → IPC → engine → UI) showed success on drivers that silently no-op a reset.

**Fix:** `resetNicProperty()` now reads back the property after the elevated command and compares against `def.enabledValue` (toggle props) or `def.defaultValue` (numeric/ring-buffer props) before reporting `ok`/`reset_verified`.

**Why:** Any IPC boundary that reports `ok:true` without an independent readback of real system state will eventually go stale relative to driver/OS behavior it doesn't control. Apply and revert paths for the same property must use symmetric verification — if one verifies and the other doesn't, that asymmetry is the bug.

**How to apply:** When adding/auditing any tweak revert/reset path (registry, service, NIC, slider), confirm it performs a readback verification symmetric with its apply counterpart, not just "did the command exit 0".

### 5. Downgrade entry point must be the backend pipeline
**Rule:** Premium expiry must call the single `premium:revertAll` IPC pipeline; the client must not invoke slider or preset sweeps as standalone downgrade steps.

**Why:** The backend pipeline also reverts ownership-tracked tweaks, network/NIC state, and power plans and records each successful revert. Standalone advanced-tweak sweeps leave the other records app-owned, causing the expiry modal to return on every launch.

**How to apply:** Keep renderer cleanup/report mapping after the pipeline response, but treat `premium:revertAll` as the only execution entry point.

### 6. Network previous-state values are strings
**Rule:** Network ownership records store `previousStatus` as `'on' | 'off'`; revert action selection must compare explicitly, never use boolean coercion.

**Why:** `!!'off'` is true, which silently turns an expiry revert into an apply operation and reports success while leaving the tweak enabled.

**How to apply:** Treat only `'on'` (or a legacy boolean `true`) as an apply target; all other valid previous states should execute the network revert path. Legacy localStorage-only network state should be passed into the Electron pipeline as a recovery sweep.

### 7. Entitlement transitions must not replay applies
**Rule:** Premium activation is read-only; automatic optimizer batches must be blocked briefly while entitlement state settles, while explicit manual card actions remain available.

**Why:** Live entitlement refresh can re-render optimization surfaces at the same time as state hydration. Without a transition guard, a replayed batch can apply previously used Premium tweaks immediately after a grant.

**How to apply:** Label apply sources (`manual_toggle`, `optimizer_apply`, `startup_reconcile`), keep startup reconciliation read-only, and enforce the guard in the shared bulk-apply entry point.
