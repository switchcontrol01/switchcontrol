/**
 * Premium Revert Engine
 * ─────────────────────
 * Safely reverts tweaks, network tweaks, and power plan changes that were
 * applied by the app during trial or premium use.
 *
 * Safety rules:
 *  - Only reverts items where appliedByApp === true
 *  - Checks for manual user changes before reverting (conflict detection)
 *  - Verifies the revert actually succeeded before clearing ownership metadata
 *  - Never blindly overwrites manual post-apply changes
 *  - Never touches pre-existing user/system tweaks (appliedByApp === false)
 */

import { useTweakOwnershipStore } from '@/stores/tweakOwnershipStore';

// ── Result types ───────────────────────────────────────────────────────────────

export type RevertItemStatus =
  | 'reverted'           // successfully reverted and verified
  | 'skipped_conflict'   // current state differs from appliedState — user changed manually
  | 'skipped_user_owned' // appliedByApp === false — never touch
  | 'failed';            // revert attempted but failed or could not be verified

export interface RevertItemResult {
  tweakId: string;
  label: string;
  status: RevertItemStatus;
  reason?: string;
}

export interface PowerPlanRevertResult {
  status: 'reverted' | 'skipped_conflict' | 'failed' | 'not_applicable';
  previousPlanName?: string;
  appliedPlanName?: string;
  reason?: string;
}

export interface PremiumRevertReport {
  tweakResults: RevertItemResult[];
  networkResults: RevertItemResult[];
  powerPlan: PowerPlanRevertResult;
  anyFailed: boolean;
  anyConflict: boolean;
  revertedCount: number;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function getTweaksAPI() {
  return (window as any).electronAPI?.tweaks ?? null;
}

function getNetworkAPI() {
  return (window as any).electronAPI?.networkTweaks ?? null;
}

function getPowerPlanAPI() {
  return (window as any).electronAPI?.powerPlans ?? null;
}

// ── Core revert functions ──────────────────────────────────────────────────────

async function revertSingleTweak(
  tweakId: string,
  label: string,
  appliedIsApplied: boolean,
): Promise<RevertItemStatus> {
  const api = getTweaksAPI();
  if (!api) return 'failed';

  try {
    // 1. Read current live state
    const status = await api.checkStatus(tweakId);
    const currentIsApplied: boolean = status?.isApplied ?? false;

    // 2. Conflict detection — did the user manually change state after we applied?
    if (currentIsApplied !== appliedIsApplied) {
      console.warn(`[Revert:TWEAK] conflict detected tweakId="${tweakId}" — expected applied=${appliedIsApplied} got current=${currentIsApplied}`);
      useTweakOwnershipStore.getState().markTweakConflict(tweakId);
      return 'skipped_conflict';
    }

    // 3. Execute revert (pass currentlyEnabled=true so executor calls 'revert' action)
    const result = await api.execute(tweakId, 'revert');
    if (!result?.success) {
      console.error(`[Revert:TWEAK] execute failed tweakId="${tweakId}"`, result?.error);
      useTweakOwnershipStore.getState().markTweakRevertFailed(tweakId);
      return 'failed';
    }

    // 4. Verify the revert worked
    const afterStatus = await api.checkStatus(tweakId);
    const afterIsApplied: boolean = afterStatus?.isApplied ?? false;

    if (afterIsApplied !== false) {
      // Revert claimed success but system still reads as applied
      console.error(`[Revert:TWEAK] verification failed tweakId="${tweakId}" — still applied after revert`);
      useTweakOwnershipStore.getState().markTweakRevertFailed(tweakId);
      return 'failed';
    }

    // 5. Clear ownership — only after verified success
    useTweakOwnershipStore.getState().recordTweakRevertSuccess(tweakId);
    console.log(`[Revert:TWEAK] success tweakId="${tweakId}"`);
    return 'reverted';

  } catch (err) {
    console.error(`[Revert:TWEAK] exception tweakId="${tweakId}"`, err);
    useTweakOwnershipStore.getState().markTweakRevertFailed(tweakId);
    return 'failed';
  }
}

async function revertSingleNetworkTweak(
  tweakId: string,
  label: string,
  appliedStatus: 'on' | 'off',
): Promise<RevertItemStatus> {
  const api = getNetworkAPI();
  if (!api) return 'failed';

  try {
    // 1. Read current backend state
    const stateResp = await fetch('/api/network-tweaks/state');
    let currentStatus: string | null = null;
    if (stateResp.ok) {
      const data = await stateResp.json();
      currentStatus = data?.state?.[tweakId]?.status ?? null;
    }

    // 2. Conflict detection
    if (currentStatus !== null && currentStatus !== appliedStatus) {
      console.warn(`[Revert:NET] conflict detected tweakId="${tweakId}" — expected=${appliedStatus} got=${currentStatus}`);
      useTweakOwnershipStore.getState().markNetworkTweakConflict(tweakId);
      return 'skipped_conflict';
    }

    // 3. Execute disable
    const result = await api.execute(tweakId, 'disable');
    if (!result?.success) {
      console.error(`[Revert:NET] execute failed tweakId="${tweakId}"`, result?.message);
      useTweakOwnershipStore.getState().markNetworkTweakRevertFailed(tweakId);
      return 'failed';
    }

    // 4. Verify
    if (result.verified === false) {
      console.error(`[Revert:NET] not verified tweakId="${tweakId}"`);
      useTweakOwnershipStore.getState().markNetworkTweakRevertFailed(tweakId);
      return 'failed';
    }

    // 5. Report and clear
    await fetch(`/api/network-tweaks/${tweakId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disable', success: true, verified: true, message: 'Reverted on premium expiry' }),
    }).catch(() => {});

    useTweakOwnershipStore.getState().recordNetworkTweakRevertSuccess(tweakId);
    console.log(`[Revert:NET] success tweakId="${tweakId}"`);
    return 'reverted';

  } catch (err) {
    console.error(`[Revert:NET] exception tweakId="${tweakId}"`, err);
    useTweakOwnershipStore.getState().markNetworkTweakRevertFailed(tweakId);
    return 'failed';
  }
}

async function revertPowerPlan(): Promise<PowerPlanRevertResult> {
  const store = useTweakOwnershipStore.getState();
  const rec = store.powerPlan;

  if (!rec || !rec.appliedByApp) {
    return { status: 'not_applicable' };
  }

  const api = getPowerPlanAPI();
  if (!api) {
    store.markPowerPlanRevertFailed();
    return { status: 'failed', reason: 'Power plan API not available' };
  }

  try {
    // 1. Read current active plan
    const stateResult = await api.getState();
    if (!stateResult?.success) {
      store.markPowerPlanRevertFailed();
      return { status: 'failed', reason: 'Could not read current power plan state' };
    }

    const currentGuid: string = stateResult.activeScheme?.guid ?? '';

    // 2. Conflict detection — did the user manually change the plan after we applied?
    if (currentGuid && currentGuid.toLowerCase() !== rec.appliedPlanGuid.toLowerCase()) {
      console.warn(`[Revert:PLAN] conflict — expected applied=${rec.appliedPlanGuid} got current=${currentGuid}`);
      store.markPowerPlanConflict();
      return {
        status: 'skipped_conflict',
        previousPlanName: rec.previousPlanName,
        appliedPlanName: rec.appliedPlanName,
        reason: 'Power plan was changed manually after the app applied it',
      };
    }

    // 3. Restore previous plan via activateByGuid if available, else fail gracefully
    if (!api.activateByGuid) {
      // Capability not present — mark for retry
      store.markPowerPlanRevertFailed();
      return {
        status: 'failed',
        previousPlanName: rec.previousPlanName,
        reason: 'Power plan restore requires an app update',
      };
    }

    const restoreResult = await api.activateByGuid(rec.previousPlanGuid);
    if (!restoreResult?.success) {
      console.error('[Revert:PLAN] activateByGuid failed', restoreResult?.error);
      store.markPowerPlanRevertFailed();
      return {
        status: 'failed',
        previousPlanName: rec.previousPlanName,
        reason: restoreResult?.error ?? 'Power plan restore failed',
      };
    }

    // 4. Verify — check active plan is now the previous one
    const verifyState = await api.getState();
    const verifiedGuid: string = verifyState?.activeScheme?.guid ?? '';
    if (verifiedGuid.toLowerCase() !== rec.previousPlanGuid.toLowerCase()) {
      console.error('[Revert:PLAN] verification failed — expected', rec.previousPlanGuid, 'got', verifiedGuid);
      store.markPowerPlanRevertFailed();
      return { status: 'failed', reason: 'Power plan restore could not be verified' };
    }

    // 5. Clear ownership — verified success
    store.recordPowerPlanRevertSuccess();
    console.log(`[Revert:PLAN] success — restored "${rec.previousPlanName}" (${rec.previousPlanGuid})`);
    return {
      status: 'reverted',
      previousPlanName: rec.previousPlanName,
      appliedPlanName: rec.appliedPlanName,
    };

  } catch (err) {
    console.error('[Revert:PLAN] exception', err);
    store.markPowerPlanRevertFailed();
    return { status: 'failed', reason: err instanceof Error ? err.message : 'Unexpected error' };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full premium revert sequence.
 * Only processes items where appliedByApp === true.
 * Returns a full report of what happened.
 */
export async function runPremiumRevert(): Promise<PremiumRevertReport> {
  console.log('[Revert] Starting premium revert sequence...');
  const store = useTweakOwnershipStore.getState();

  const tweakResults: RevertItemResult[] = [];
  const networkResults: RevertItemResult[] = [];

  // ── Tweaks ──────────────────────────────────────────────────────────────────
  const tweakEntries = Object.entries(store.appliedTweaks)
    .filter(([, rec]) => rec.appliedByApp); // only app-applied

  for (const [tweakId, rec] of tweakEntries) {
    console.log(`[Revert] processing tweak "${tweakId}" label="${rec.label}"`);
    const status = await revertSingleTweak(tweakId, rec.label, rec.appliedState.isApplied);
    tweakResults.push({ tweakId, label: rec.label, status });
  }

  // ── Network tweaks ──────────────────────────────────────────────────────────
  const networkEntries = Object.entries(store.networkTweaks)
    .filter(([, rec]) => rec.appliedByApp);

  for (const [tweakId, rec] of networkEntries) {
    console.log(`[Revert] processing network tweak "${tweakId}" label="${rec.label}"`);
    const status = await revertSingleNetworkTweak(tweakId, rec.label, rec.appliedStatus);
    networkResults.push({ tweakId, label: rec.label, status });
  }

  // ── Power plan ──────────────────────────────────────────────────────────────
  const powerPlanResult = await revertPowerPlan();

  const anyFailed =
    tweakResults.some(r => r.status === 'failed') ||
    networkResults.some(r => r.status === 'failed') ||
    powerPlanResult.status === 'failed';

  const anyConflict =
    tweakResults.some(r => r.status === 'skipped_conflict') ||
    networkResults.some(r => r.status === 'skipped_conflict') ||
    powerPlanResult.status === 'skipped_conflict';

  const revertedCount =
    tweakResults.filter(r => r.status === 'reverted').length +
    networkResults.filter(r => r.status === 'reverted').length +
    (powerPlanResult.status === 'reverted' ? 1 : 0);

  console.log(
    `[Revert] Complete — reverted=${revertedCount} failed=${anyFailed} conflict=${anyConflict}`
  );

  return { tweakResults, networkResults, powerPlan: powerPlanResult, anyFailed, anyConflict, revertedCount };
}

/**
 * Returns true if there are any app-applied items that would need reverting.
 */
export function hasPremiumItemsToRevert(): boolean {
  const store = useTweakOwnershipStore.getState();
  const hasTweaks = Object.values(store.appliedTweaks).some(r => r.appliedByApp);
  const hasNetwork = Object.values(store.networkTweaks).some(r => r.appliedByApp);
  const hasPlan = store.powerPlan?.appliedByApp === true;
  return hasTweaks || hasNetwork || hasPlan;
}
