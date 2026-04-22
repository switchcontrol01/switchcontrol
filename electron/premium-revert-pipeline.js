/**
 * premium-revert-pipeline.js
 *
 * Executes a safe, exact-value revert of every system change SwitchControl
 * made on behalf of a premium session — invoked when a trial expires or a
 * premium subscription is cancelled.
 *
 * GUARANTEES
 * ----------
 * 1. Only reverts items where appliedByApp === true in the ownership store.
 * 2. Never touches items the user had configured before SwitchControl ran.
 * 3. Restores exact previousValue captured at first-apply time, not a guess.
 * 4. Skips any item whose baseline was not captured (fail-safe).
 * 5. Records revert in ownership store ONLY after executor confirms success.
 * 6. Produces a full per-item result report for logging / display.
 *
 * REVERT LOGIC PER TYPE
 * ---------------------
 * tweak / network_tweak:
 *   previousValue = boolean
 *     true  → run apply script (it was already enabled before us — keep it enabled)
 *     false → run revert script (it was disabled before us — disable it again)
 *     null  → skip (inconclusive baseline, fail-safe)
 *
 * nic:
 *   previousValue = { registryValue, displayValue }
 *     registryValue present → restore with setNicProperty(adapterName, key, registryValue)
 *     registryValue null    → reset to driver default with resetNicProperty(adapterName, key)
 *
 * power_plan:
 *   previousPlanGuid = exact GUID before SwitchControl changed it
 *   → activatePlanByGuid(previousPlanGuid)
 *   Null GUID → skip (fail-safe)
 */

'use strict';

const ownershipStore = require('./ownership-store');

// Lazy-require executors to avoid circular-dependency issues at module load.
// Each getter is called once per pipeline run.
function getTweakExecutor()          { return require('./tweak-executor'); }
function getNetworkTweakExecutor()   { return require('./network-tweak-executor'); }
function getNicExecutor()            { return require('./nic-executor'); }
function getPowerPlanManager()       { return require('./power-plan-manager'); }

// ── per-type revert handlers ──────────────────────────────────────────────────

async function revertTweak(record) {
  const { itemId, previousValue, scopeKey } = record;

  if (previousValue === null || previousValue === undefined) {
    return { skipped: true, reason: 'Baseline is inconclusive (null) — cannot determine original state. Failing safe.' };
  }

  const action = previousValue === true ? 'apply' : 'revert';
  console.log(`[RevertPipeline] tweak:${itemId} → restoring previousValue=${previousValue} via action="${action}"`);

  try {
    const result = await getTweakExecutor().executeTweak(itemId, action);
    if (result.success) {
      ownershipStore.recordRevert(scopeKey);
      return { success: true, action, verified: result.verified };
    }
    return { success: false, action, error: result.error || result.message || 'executeTweak failed' };
  } catch (e) {
    return { success: false, action, error: e.message };
  }
}

async function revertNetworkTweak(record) {
  const { itemId, previousValue, scopeKey } = record;

  if (previousValue === null || previousValue === undefined) {
    return { skipped: true, reason: 'Baseline is inconclusive (null) — cannot determine original state. Failing safe.' };
  }

  const action = previousValue === true ? 'apply' : 'revert';
  console.log(`[RevertPipeline] network_tweak:${itemId} → restoring previousValue=${previousValue} via action="${action}"`);

  try {
    const result = await getNetworkTweakExecutor().executeNetworkTweak(itemId, action);
    if (result.success) {
      ownershipStore.recordRevert(scopeKey);
      return { success: true, action, verified: result.verified };
    }
    return { success: false, action, error: result.error || result.message || 'executeNetworkTweak failed' };
  } catch (e) {
    return { success: false, action, error: e.message };
  }
}

async function revertNicProperty(record) {
  const { itemId, adapterName, previousValue, scopeKey } = record;

  if (!adapterName) {
    return { skipped: true, reason: 'No adapterName stored in baseline.' };
  }

  const nicExec = getNicExecutor();

  // previousValue = { registryValue, displayValue }
  const registryValue = previousValue?.registryValue ?? null;

  if (registryValue !== null && registryValue !== undefined) {
    console.log(`[RevertPipeline] nic:${adapterName}:${itemId} → restoring registryValue="${registryValue}"`);
    try {
      const result = await nicExec.setNicProperty(adapterName, itemId, String(registryValue));
      if (result.ok) {
        ownershipStore.recordRevert(scopeKey);
        return { success: true, action: 'restore_exact_value', registryValue, verified: result.verified };
      }
      return { success: false, action: 'restore_exact_value', registryValue, error: result.error || 'setNicProperty failed' };
    } catch (e) {
      return { success: false, action: 'restore_exact_value', registryValue, error: e.message };
    }
  } else {
    // No registry value captured — reset to driver default
    console.log(`[RevertPipeline] nic:${adapterName}:${itemId} → no registryValue in baseline, resetting to driver default`);
    try {
      const result = await nicExec.resetNicProperty(adapterName, itemId);
      if (result.ok) {
        ownershipStore.recordRevert(scopeKey);
        return { success: true, action: 'reset_to_default', verified: result.verified };
      }
      return { success: false, action: 'reset_to_default', error: result.error || 'resetNicProperty failed' };
    } catch (e) {
      return { success: false, action: 'reset_to_default', error: e.message };
    }
  }
}

async function revertPowerPlan(record) {
  const { previousPlanGuid, scopeKey } = record;

  if (!previousPlanGuid) {
    return { skipped: true, reason: 'No previousPlanGuid in baseline — cannot restore original plan. Failing safe.' };
  }

  console.log(`[RevertPipeline] power_plan → restoring GUID "${previousPlanGuid}"`);

  try {
    const result = await getPowerPlanManager().activatePlanByGuid(previousPlanGuid);
    if (result.success) {
      ownershipStore.recordRevert(scopeKey);
      return { success: true, action: 'restore_guid', guid: previousPlanGuid };
    }
    return { success: false, action: 'restore_guid', guid: previousPlanGuid, error: result.error };
  } catch (e) {
    return { success: false, action: 'restore_guid', guid: previousPlanGuid, error: e.message };
  }
}

// ── main pipeline ─────────────────────────────────────────────────────────────

/**
 * Revert all app-owned premium changes.
 *
 * @returns {Promise<{
 *   total:    number,
 *   reverted: number,
 *   skipped:  number,
 *   failed:   number,
 *   details:  Record<string, object>
 * }>}
 */
async function revertAllAppOwned() {
  const owned = ownershipStore.getAllAppOwned();
  console.log(`[RevertPipeline] Starting — ${owned.length} app-owned item(s) to revert`);

  const details = {};
  let revertedCount = 0;
  let skippedCount  = 0;
  let failedCount   = 0;

  for (const record of owned) {
    const { scopeKey, itemType, baselineCaptured } = record;

    // Fail-safe: no baseline → skip unconditionally
    if (!baselineCaptured) {
      details[scopeKey] = { skipped: true, reason: 'No baseline captured — failing safe.' };
      skippedCount++;
      console.warn(`[RevertPipeline] SKIP ${scopeKey} — no baseline captured`);
      continue;
    }

    let itemResult;
    try {
      if (itemType === 'tweak') {
        itemResult = await revertTweak(record);
      } else if (itemType === 'network_tweak') {
        itemResult = await revertNetworkTweak(record);
      } else if (itemType === 'nic') {
        itemResult = await revertNicProperty(record);
      } else if (itemType === 'power_plan') {
        itemResult = await revertPowerPlan(record);
      } else {
        itemResult = { skipped: true, reason: `Unknown itemType: ${itemType}` };
      }
    } catch (e) {
      itemResult = { success: false, error: `Unhandled error: ${e.message}` };
    }

    details[scopeKey] = itemResult;

    if (itemResult.skipped) {
      skippedCount++;
      console.warn(`[RevertPipeline] SKIP ${scopeKey} — ${itemResult.reason}`);
    } else if (itemResult.success) {
      revertedCount++;
      console.log(`[RevertPipeline] OK   ${scopeKey}`);
    } else {
      failedCount++;
      console.error(`[RevertPipeline] FAIL ${scopeKey} — ${itemResult.error}`);
    }
  }

  const summary = {
    total:    owned.length,
    reverted: revertedCount,
    skipped:  skippedCount,
    failed:   failedCount,
    details,
  };

  console.log(
    `[RevertPipeline] Done — reverted=${revertedCount} skipped=${skippedCount} failed=${failedCount}`
  );

  return summary;
}

/**
 * Dry-run: return what would be reverted without executing anything.
 * Useful for displaying a confirmation dialog to the user.
 */
function previewRevert() {
  const owned = ownershipStore.getAllAppOwned();
  return owned.map(record => ({
    scopeKey:         record.scopeKey,
    itemType:         record.itemType,
    itemId:           record.itemId,
    adapterName:      record.adapterName   || null,
    baselineCaptured: record.baselineCaptured,
    previousValue:    record.previousValue,
    previousPlanGuid: record.previousPlanGuid || null,
    appliedValue:     record.appliedValue,
    lastAppliedAt:    record.lastAppliedAt,
    willSkip:         !record.baselineCaptured,
  }));
}

module.exports = {
  revertAllAppOwned,
  previewRevert,
};
