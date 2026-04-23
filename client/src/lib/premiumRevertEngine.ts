/**
 * Premium Revert Engine
 * ─────────────────────
 * Reverts tweaks, network tweaks, and power plan changes applied by the app
 * during trial or premium use.
 *
 * OWNERSHIP ELIGIBILITY
 * ---------------------
 * Tweaks / network tweaks:
 *   Only reverted when appliedByApp === true AND isPremium === true (tweaks)
 *   or appliedByApp === true (network tweaks — all are premium-gated).
 *   Items where appliedByApp === false are NEVER touched (user pre-existing state).
 *
 * Power plan — strict special rules:
 *   1. Always read the CURRENTLY active plan from Windows — do not trust the
 *      Zustand store alone. This catches stale / missing / cleared records.
 *   2. If the active plan is NOT a SwitchControl plan (detected by GUID or name
 *      prefix) → skip. The user already moved away. Clean state.
 *   3. If the active plan IS a SwitchControl plan → MUST revert:
 *        a) Use previousPlanGuid from ownership if valid and not itself a SC plan.
 *        b) Otherwise force Windows Balanced (BALANCED_GUID).
 *        c) If primary target fails → try Balanced as last resort.
 */

import { useTweakOwnershipStore } from '@/stores/tweakOwnershipStore';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Windows Balanced built-in GUID — immutable restore target. */
const BALANCED_GUID = '381b4222-f694-41f0-9685-ff5bb260df2e';

/**
 * All SwitchControl-managed power plan names start with this prefix.
 * Used as a name-based fallback when the GUID record is unavailable.
 */
const SC_PLAN_NAME_PREFIX = 'SwitchControl -';

// ── Result types ───────────────────────────────────────────────────────────────

export type RevertItemStatus =
  | 'reverted'            // successfully reverted and verified
  | 'skipped_conflict'    // current state differs from appliedState — user changed manually
  | 'skipped_user_owned'  // appliedByApp === false — was pre-existing, never touched
  | 'skipped_not_active'  // item exists in store but is no longer in an applied state
  | 'failed';             // revert attempted but failed or could not be verified

export interface RevertItemResult {
  tweakId: string;
  label: string;
  status: RevertItemStatus;
  reason?: string;
}

export interface PowerPlanRevertResult {
  /** What happened to the power plan. */
  status:
    | 'reverted'        // restored to previousPlanGuid successfully
    | 'forced_balanced' // forced to Windows Balanced (no valid previous GUID or as fallback)
    | 'skipped_not_sc'  // active plan was not a SwitchControl plan — nothing to do
    | 'failed'          // revert attempted but failed
    | 'not_applicable'; // power plan API unavailable (non-Electron env)
  targetGuid?: string;
  previousPlanName?: string;
  appliedPlanName?: string;
  reason?: string;
  forcedBalanced?: boolean;
  /** Plans deleted from Windows Power Options during cleanup. */
  plansDeleted?: number;
  /** True if post-cleanup verification confirmed no SC plans remain + active=Balanced. */
  verifiedClean?: boolean;
  /** The active scheme name as read back from Windows after full revert+cleanup. */
  verifiedActiveName?: string;
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

function getPremiumAPI() {
  return (window as any).electronAPI?.premium ?? null;
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

    // 3. Execute revert
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

    // 3. Execute revert
    const result = await api.execute(tweakId, 'revert');
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

/**
 * Revert the active power plan.
 *
 * STRICT RULES — see module header for full description.
 * Always checks the live active plan, not just the Zustand record.
 */
async function revertPowerPlan(): Promise<PowerPlanRevertResult> {
  const store = useTweakOwnershipStore.getState();
  const rec = store.powerPlan;

  const api = getPowerPlanAPI();
  if (!api) {
    return { status: 'not_applicable' };
  }

  // ── Step 1: Read the CURRENTLY active plan from Windows ─────────────────────
  let currentGuid = '';
  let currentName = '';
  try {
    const stateResult = await api.getState();
    if (stateResult?.success) {
      currentGuid = (stateResult.activeScheme?.guid ?? '').toLowerCase();
      currentName = stateResult.activeScheme?.name ?? '';
    }
  } catch (e) {
    console.error('[Revert:PLAN] Failed to read active power scheme:', e);
    if (rec?.appliedByApp) store.markPowerPlanRevertFailed();
    return { status: 'failed', reason: 'Could not read current power plan state' };
  }

  // ── Step 2: Is the current plan a SwitchControl-managed plan? ───────────────
  // Detection via:
  //   A. GUID matches what we applied (from Zustand ownership record)
  //   B. Plan name starts with the SC prefix (covers missing ownership records)
  const guidMatchesSC = !!(
    rec?.appliedByApp &&
    rec.appliedPlanGuid &&
    currentGuid &&
    currentGuid === rec.appliedPlanGuid.toLowerCase()
  );
  const nameMatchesSC = currentName.startsWith(SC_PLAN_NAME_PREFIX);
  const activeIsSCPlan = guidMatchesSC || nameMatchesSC;

  if (!activeIsSCPlan) {
    // Active plan is not SC-managed — user already moved away. Nothing to do.
    console.log(`[Revert:PLAN] Active plan "${currentName}" (${currentGuid}) is not SC-managed — skipping`);
    if (rec?.appliedByApp) {
      // User changed away from the SC plan themselves — ownership fulfilled
      store.recordPowerPlanRevertSuccess();
    }
    return {
      status: 'skipped_not_sc',
      reason: currentGuid
        ? `Active plan "${currentName}" is not a SwitchControl plan — user already changed it`
        : 'Could not read active plan — nothing to revert',
    };
  }

  // ── Step 3: Active plan IS SC-managed. Hard-target Windows Balanced. ─────────
  // FIX: NEVER restore previousPlanGuid on trial/premium expiry. previousPlanGuid
  // may be stale after reinstall, may itself be an SC plan, or may have been
  // deleted. The only guaranteed safe end-state is the built-in Windows Balanced
  // GUID.  After expiry, users must not retain any SC-applied power configuration.
  const targetGuid    = BALANCED_GUID;
  const forcedBalanced = true;

  if (!api.activateByGuid) {
    if (rec?.appliedByApp) store.markPowerPlanRevertFailed();
    return { status: 'failed', reason: 'Power plan restore requires an app update (activateByGuid not exposed)' };
  }

  console.log(
    `[Revert:PLAN] Active SC plan "${currentName}" (${currentGuid})` +
    ` — hard-target Windows Balanced (${BALANCED_GUID}) [trial expiry policy]`
  );

  // ── Step 4: Activate target plan ────────────────────────────────────────────
  const restoreResult = await api.activateByGuid(targetGuid);

  if (restoreResult?.success) {
    // ── Cleanup: delete all SC plans from Windows ──────────────────────────────
    let plansDeleted = 0;
    let verifiedClean = false;
    let verifiedActiveName: string | undefined;
    try {
      const premiumAPI = getPremiumAPI();
      if (premiumAPI?.cleanupScPlans) {
        const cleanup = await premiumAPI.cleanupScPlans();
        plansDeleted = cleanup?.deleted?.length ?? 0;
        verifiedClean = cleanup?.verified ?? false;
        console.log(`[Revert:PLAN] SC plan cleanup — deleted=${plansDeleted} verified=${verifiedClean}`);
      }
    } catch (e) {
      console.warn('[Revert:PLAN] SC plan cleanup threw (non-fatal):', e);
    }

    // ── Verify: read back active plan and confirm it matches target ────────────
    try {
      const verify = await api.getState();
      const verifiedGuid = (verify?.activeScheme?.guid ?? '').toLowerCase();
      verifiedActiveName = verify?.activeScheme?.name;
      if (verifiedGuid !== targetGuid) {
        console.error(`[Revert:PLAN] Verification failed — expected ${targetGuid} got ${verifiedGuid}`);
        if (rec?.appliedByApp) store.markPowerPlanRevertFailed();
        return { status: 'failed', reason: 'Power plan set but verification failed', targetGuid };
      }
      console.log(`[Revert:PLAN] Verification passed — active: "${verifiedActiveName}" (${verifiedGuid})`);
    } catch { /* non-fatal */ }

    if (rec?.appliedByApp) store.recordPowerPlanRevertSuccess();
    return {
      status: forcedBalanced ? 'forced_balanced' : 'reverted',
      targetGuid,
      forcedBalanced,
      previousPlanName: rec?.previousPlanName,
      appliedPlanName:  currentName,
      plansDeleted,
      verifiedClean,
      verifiedActiveName,
    };
  }

  // targetGuid is always BALANCED_GUID. If activateByGuid returned not-ok
  // (activatePlanByGuid already tried restoredefaultschemes + retry internally),
  // there is nothing more we can do.
  console.error(`[Revert:PLAN] Windows Balanced activation failed: ${restoreResult?.error}`);
  if (rec?.appliedByApp) store.markPowerPlanRevertFailed();
  return {
    status: 'failed',
    reason: restoreResult?.error ?? 'Power plan restore failed',
    appliedPlanName: currentName,
    targetGuid,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full premium revert sequence.
 *
 * Eligibility:
 *   Tweaks:        appliedByApp === true AND isPremium === true
 *   Network tweaks: appliedByApp === true (all network tweaks are premium-gated)
 *   Power plan:    checked unconditionally — uses live active-plan detection
 *                  so it works even if the Zustand record is missing/stale.
 *
 * Returns a full per-item report of what happened.
 */
export async function runPremiumRevert(): Promise<PremiumRevertReport> {
  console.log('[Revert] Starting premium revert sequence...');
  const store = useTweakOwnershipStore.getState();

  const tweakResults: RevertItemResult[] = [];
  const networkResults: RevertItemResult[] = [];

  // ── Tweaks ──────────────────────────────────────────────────────────────────
  // Only revert items that are:
  //   • premium-gated (isPremium)
  //   • confirmed applied by the app (appliedByApp)
  // This ensures free tweaks and pre-existing tweaks are never touched.
  const tweakEntries = Object.entries(store.appliedTweaks)
    .filter(([, rec]) => rec.appliedByApp && rec.isPremium);

  for (const [tweakId, rec] of tweakEntries) {
    console.log(`[Revert] processing tweak "${tweakId}" label="${rec.label}"`);
    const status = await revertSingleTweak(tweakId, rec.label, rec.appliedState.isApplied);
    tweakResults.push({ tweakId, label: rec.label, status });
  }

  // ── Network tweaks ──────────────────────────────────────────────────────────
  // All network tweaks are premium-gated — only revert app-applied ones.
  const networkEntries = Object.entries(store.networkTweaks)
    .filter(([, rec]) => rec.appliedByApp);

  for (const [tweakId, rec] of networkEntries) {
    console.log(`[Revert] processing network tweak "${tweakId}" label="${rec.label}"`);
    const status = await revertSingleNetworkTweak(tweakId, rec.label, rec.appliedStatus);
    networkResults.push({ tweakId, label: rec.label, status });
  }

  // ── Power plan ──────────────────────────────────────────────────────────────
  // Always run — detects SC plans by live active-plan check, not just Zustand.
  const powerPlanResult = await revertPowerPlan();

  const anyFailed =
    tweakResults.some(r => r.status === 'failed') ||
    networkResults.some(r => r.status === 'failed') ||
    powerPlanResult.status === 'failed';

  const anyConflict =
    tweakResults.some(r => r.status === 'skipped_conflict') ||
    networkResults.some(r => r.status === 'skipped_conflict');

  const revertedCount =
    tweakResults.filter(r => r.status === 'reverted').length +
    networkResults.filter(r => r.status === 'reverted').length +
    (powerPlanResult.status === 'reverted' || powerPlanResult.status === 'forced_balanced' ? 1 : 0);

  console.log(
    `[Revert] Complete — reverted=${revertedCount} failed=${anyFailed} conflict=${anyConflict}`
  );

  return { tweakResults, networkResults, powerPlan: powerPlanResult, anyFailed, anyConflict, revertedCount };
}

/**
 * Returns true if there are any app-applied premium items that would need reverting.
 */
export function hasPremiumItemsToRevert(): boolean {
  const store = useTweakOwnershipStore.getState();
  const hasTweaks  = Object.values(store.appliedTweaks).some(r => r.appliedByApp && r.isPremium);
  const hasNetwork = Object.values(store.networkTweaks).some(r => r.appliedByApp);
  const hasPlan    = store.powerPlan?.appliedByApp === true;
  return hasTweaks || hasNetwork || hasPlan;
}
