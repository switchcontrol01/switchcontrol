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
 * POWER PLAN — SPECIAL RULES
 * --------------------------
 * Power plan revert is stricter than tweak revert:
 *
 *   1. Always read the CURRENTLY active plan from Windows — do not rely solely
 *      on the ownership record. This catches cases where the ownership store
 *      is stale, missing, or was cleared.
 *
 *   2. If the currently active plan is NOT a SwitchControl-managed plan, the
 *      user already moved away from it. Skip with action='skipped_not_sc'.
 *
 *   3. If the currently active plan IS a SwitchControl plan it MUST be reverted,
 *      regardless of whether a conflict was detected:
 *        a) If previousPlanGuid is known and is not itself a SC plan → restore it.
 *        b) Otherwise → force Windows Balanced (BALANCED_GUID).
 *
 *   4. If the primary target fails → try Windows Balanced as last resort.
 *
 * Windows Balanced GUID (immutable truth):
 *   381b4222-f694-41f0-9685-ff5bb260df2e
 */

'use strict';

const ownershipStore = require('./ownership-store');

const BALANCED_GUID = '381b4222-f694-41f0-9685-ff5bb260df2e';

// Lazy-require executors to avoid circular-dependency issues at module load.
function getTweakExecutor()          { return require('./tweak-executor'); }
function getNetworkTweakExecutor()   { return require('./network-tweak-executor'); }
function getNicExecutor()            { return require('./nic-executor'); }
function getPowerPlanManager()       { return require('./power-plan-manager'); }

// ── SC plan detection ─────────────────────────────────────────────────────────

/** Prefix shared by every SwitchControl-managed power plan name. */
const SC_PLAN_NAME_PREFIX = 'SwitchControl -';

/**
 * Return all GUIDs that SwitchControl has ever created/activated, lowercased.
 * Read directly from the power-plans.json state file via the manager export.
 */
function getSCPlanGuids() {
  try {
    const mgr = getPowerPlanManager();
    const guids = Object.values(mgr.getStoredSchemeGuids());
    return guids.filter(Boolean).map(g => String(g).toLowerCase());
  } catch {
    return [];
  }
}

/**
 * True if the given GUID belongs to a SwitchControl-managed premium power plan.
 *
 * Uses dual detection for belt-and-suspenders safety:
 *   1. GUID is in power-plans.json (primary — exact match)
 *   2. Plan name starts with SC prefix (fallback — covers reinstall/cleared-file scenarios)
 *
 * @param {string|null} guid
 * @param {string|null} [name] — optional plan name for name-based fallback
 */
function isSwitchControlPlanGuid(guid, name) {
  if (!guid) return false;
  const guidMatch = getSCPlanGuids().includes(String(guid).toLowerCase());
  if (guidMatch) return true;
  // Fallback: name-based detection covers cases where power-plans.json is missing
  // (e.g. reinstall) but an SC-named plan is still active on the system.
  if (name && typeof name === 'string') {
    return name.startsWith(SC_PLAN_NAME_PREFIX);
  }
  return false;
}

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

/**
 * Revert the active power plan.
 *
 * STRICT RULES — see module header comment for full description:
 *  - Ownership enforcement: only called for records where appliedByApp === true
 *    (getAllAppOwned() in the main pipeline already filters on this).
 *  - Always reads the CURRENTLY active plan first.
 *  - Manual change protection: if active plan is NOT SC-managed, the user already
 *    moved away after SwitchControl applied. Skip with reason='user_changed_plan_after_apply'.
 *  - If active plan IS SC-managed → must revert:
 *      • Use previousPlanGuid if valid and not itself a SC plan.
 *      • Otherwise force Windows Balanced (BALANCED_GUID).
 *      • If primary target fails → try Balanced as last resort.
 *
 * Return shapes follow the activatePlanByGuid contract (ok-based):
 *   { ok, success, skipped?, reason?, action?, guid?, forcedBalanced?, ... }
 * Both ok and success are set to the same value for compatibility with
 * the revertAllAppOwned loop which checks itemResult.success.
 */
async function revertPowerPlan(record) {
  const { previousPlanGuid, appliedPlanGuid, scopeKey } = record;
  const mgr = getPowerPlanManager();

  // Normalise the GUID the app actually activated (from ownership record).
  // This is the authoritative source — does not depend on power-plans.json.
  const appliedLower = appliedPlanGuid ? String(appliedPlanGuid).trim().toLowerCase() : null;

  // Step 1: Read what is CURRENTLY active on Windows.
  let currentGuid = null;
  let currentName = null;
  try {
    const active = await mgr.getActivePowerScheme();
    currentGuid = active.scheme?.guid ? active.scheme.guid.toLowerCase() : null;
    currentName = active.scheme?.name ?? null;
    console.log(
      `[RevertPipeline] power_plan — current active GUID: ${currentGuid ?? '(unreadable)'}` +
      ` name: "${currentName ?? ''}"` +
      ` | appliedPlanGuid (ownership): ${appliedLower ?? '(none)'}`
    );
  } catch (e) {
    console.warn('[RevertPipeline] power_plan — could not read active power scheme:', e.message);
    return { ok: false, success: false, action: 'restore_guid', guid: null, error: `Cannot read active scheme: ${e.message}` };
  }

  // Step 2: Manual change protection.
  //
  // Primary check — compare currentGuid directly against what the app applied.
  //   If appliedPlanGuid is on record and current ≠ applied → user moved away → skip.
  //   This works regardless of whether the GUID is in power-plans.json.
  //
  // Fallback (appliedPlanGuid missing / old records) — fall back to the
  //   isSwitchControlPlanGuid() check against power-plans.json.
  let userChangedPlan = false;
  if (currentGuid) {
    if (appliedLower) {
      // Primary: exact ownership-record match
      userChangedPlan = (currentGuid !== appliedLower);
      if (userChangedPlan) {
        console.log(
          `[RevertPipeline] power_plan — revert skipped: user changed plan after apply` +
          ` (current=${currentGuid} ≠ applied=${appliedLower})`
        );
      }
    } else {
      // Fallback: GUID+name dual check (covers reinstall / cleared power-plans.json)
      userChangedPlan = !isSwitchControlPlanGuid(currentGuid, currentName);
      if (userChangedPlan) {
        console.log(
          `[RevertPipeline] power_plan — revert skipped: current plan not SC-managed` +
          ` (guid=${currentGuid} name="${currentName}" — no appliedPlanGuid in record, treating as user change)`
        );
      }
    }
  }

  if (userChangedPlan) {
    ownershipStore.recordRevert(scopeKey);
    return {
      ok: true,
      success: true,
      skipped: true,
      reason: 'user_changed_plan_after_apply',
      action: 'skipped_not_sc',
      currentGuid,
      appliedLower,
    };
  }

  // Step 3: Active plan IS the one the app set (or currentGuid is null — fail safe).
  // Determine restore target:
  //   a) previousPlanGuid if it is a valid UUID and is NOT itself an SC plan
  //      (checked against both power-plans.json and the appliedPlanGuid record)
  //   b) BALANCED_GUID otherwise — the safe absolute truth
  let targetGuid = BALANCED_GUID;
  let forcedBalanced = true;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (previousPlanGuid && UUID_RE.test(String(previousPlanGuid).trim())) {
    const prevLower = previousPlanGuid.trim().toLowerCase();
    // Reject previousPlanGuid if it is itself an SC plan (either via ownership record
    // or via power-plans.json) — restoring to another SC plan defeats the purpose.
    const prevIsApplied = appliedLower && prevLower === appliedLower;
    const prevIsScPlan  = prevIsApplied || isSwitchControlPlanGuid(prevLower);
    if (!prevIsScPlan) {
      targetGuid = prevLower;
      forcedBalanced = false;
      console.log(`[RevertPipeline] power_plan — target: previousPlanGuid=${targetGuid}`);
    } else {
      console.warn(
        `[RevertPipeline] power_plan — previousPlanGuid (${prevLower}) is itself an SC plan` +
        ` (appliedLower=${appliedLower}, inSchemeGuids=${isSwitchControlPlanGuid(prevLower)}).` +
        ` Forcing Windows Balanced (${BALANCED_GUID}).`
      );
    }
  } else {
    console.warn(
      `[RevertPipeline] power_plan — no valid previousPlanGuid in baseline.` +
      ` Forcing Windows Balanced (${BALANCED_GUID}).`
    );
  }

  console.log(`[RevertPipeline] power_plan → activatePlanByGuid("${targetGuid}") forcedBalanced=${forcedBalanced}`);

  try {
    const result = await mgr.activatePlanByGuid(targetGuid);

    if (result.ok) {
      if (result.alreadyActive) {
        console.log(`[RevertPipeline] power_plan — revert skipped because already active: ${targetGuid}`);
      } else if (result.restoredDefaults) {
        console.log(`[RevertPipeline] power_plan — restoredefaultschemes invoked and retry succeeded: ${targetGuid}`);
      } else {
        console.log(`[RevertPipeline] power_plan — activated ${targetGuid} (changed=true)`);
      }
      ownershipStore.recordRevert(scopeKey);
      return {
        ok: true,
        success: true,
        action: forcedBalanced ? 'forced_balanced' : 'restore_guid',
        guid: targetGuid,
        forcedBalanced,
        alreadyActive:    result.alreadyActive    || false,
        restoredDefaults: result.restoredDefaults || false,
        retried:          result.retried          || false,
      };
    }

    // Primary target failed. If we weren't already targeting Balanced, try it as last resort.
    if (!forcedBalanced) {
      console.warn(
        `[RevertPipeline] power_plan — restore to ${targetGuid} failed (${result.error}).` +
        ` Trying forced Balanced (${BALANCED_GUID}) as last resort.`
      );
      const fallback = await mgr.activatePlanByGuid(BALANCED_GUID);
      if (fallback.ok) {
        if (fallback.restoredDefaults) {
          console.log('[RevertPipeline] power_plan — restoredefaultschemes invoked and fallback Balanced activated');
        }
        ownershipStore.recordRevert(scopeKey);
        return {
          ok: true,
          success: true,
          action: 'forced_balanced_after_restore_fail',
          guid: BALANCED_GUID,
          forcedBalanced: true,
          restoredDefaults: fallback.restoredDefaults || false,
          retried:          fallback.retried          || false,
          primaryError: result.error,
        };
      }
      return {
        ok: false,
        success: false,
        action: 'restore_guid',
        guid: BALANCED_GUID,
        error: `Primary (${targetGuid}) failed: ${result.error}. Fallback Balanced also failed: ${fallback.error}`,
      };
    }

    return { ok: false, success: false, action: 'restore_guid', guid: targetGuid, error: result.error };
  } catch (e) {
    return { ok: false, success: false, action: 'restore_guid', guid: targetGuid, error: e.message };
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

    // Power plan is exempt from the baseline-captured requirement —
    // it has its own strict active-plan check and forced-Balanced fallback.
    if (itemType !== 'power_plan' && !baselineCaptured) {
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
      console.log(`[RevertPipeline] OK   ${scopeKey} (action=${itemResult.action})`);
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
    willSkip:         !record.baselineCaptured && record.itemType !== 'power_plan',
  }));
}

/**
 * Startup sanity check — belt-and-suspenders guard for Section 6.
 *
 * Call this when the frontend has verified that the user is NOT premium.
 * If a SwitchControl premium power plan is currently active, force-revert
 * to Windows Balanced immediately — regardless of ownership store state.
 *
 * This closes the loophole where:
 *   • The revert ran but the power plan step was skipped or failed.
 *   • The app was closed before revert completed.
 *   • The ownership store was cleared while the plan remained active.
 *   • The user regained and lost premium quickly (ownership record lost).
 *
 * @returns {{ checked: boolean, action: string, activeGuid?: string, activeName?: string, error?: string }}
 */
async function runStartupPowerPlanSanityCheck() {
  const mgr = getPowerPlanManager();
  let currentGuid = null;
  let currentName = null;

  try {
    const active = await mgr.getActivePowerScheme();
    currentGuid = active.scheme?.guid?.toLowerCase() ?? null;
    currentName = active.scheme?.name ?? null;
  } catch (e) {
    return { checked: true, action: 'error', error: e.message };
  }

  // Dual check: GUID match (primary) OR name prefix match (fallback for reinstall)
  if (!currentGuid || !isSwitchControlPlanGuid(currentGuid, currentName)) {
    console.log(`[Sanity] Power plan check clean — active plan is not SC-managed (guid=${currentGuid} name="${currentName}")`);
    return { checked: true, action: 'clean', activeGuid: currentGuid, activeName: currentName };
  }

  // Active plan is SC-managed — this must not persist for a non-premium user.
  console.log(`[Sanity] Non-premium user has SC plan active: "${currentName}" (${currentGuid}) — forcing Windows Balanced`);

  try {
    const result = await mgr.activatePlanByGuid(BALANCED_GUID);
    if (result.ok) {
      // Clear any stale ownership record so the report doesn't re-trigger
      const scopeKey = ownershipStore.buildScopeKey('power_plan', 'active-scheme');
      ownershipStore.recordRevert(scopeKey);
      console.log(`[Sanity] Forced Windows Balanced successfully. Removed SC plan: "${currentName}" (${currentGuid})`);
      return { checked: true, action: 'forced_balanced', activeGuid: currentGuid, activeName: currentName };
    }
    console.error(`[Sanity] Failed to force Windows Balanced: ${result.error}`);
    return { checked: true, action: 'failed', activeGuid: currentGuid, activeName: currentName, error: result.error };
  } catch (e) {
    console.error('[Sanity] Sanity check exception:', e.message);
    return { checked: true, action: 'error', error: e.message };
  }
}

module.exports = {
  revertAllAppOwned,
  previewRevert,
  runStartupPowerPlanSanityCheck,
};
