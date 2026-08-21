/**
 * Premium Revert Engine v2
 * ────────────────────────
 * Reverts tweaks, network tweaks, and power plan changes applied
 * during trial or premium use.
 *
 * RELIABILITY FIXES (v2)
 * ──────────────────────
 * • Normal tweaks: if current state is already the target end-state (not applied)
 *   we count it as 'reverted' rather than 'skipped_conflict'. Handles reboots,
 *   Windows updates, or manual user changes that already undid the tweak.
 * • Network tweaks: removed HTTP backend state pre-check — it used a potentially
 *   stale DB snapshot and caused false "conflict → skip" on every state divergence.
 *   Now executes IPC revert directly and verifies via the IPC result.
 * • Retry loop: all three categories retry up to MAX_RETRY_ATTEMPTS on failure,
 *   with exponential back-off, before marking an item as failed.
 * • Live progress: runPremiumRevert() accepts an onProgress callback so the UI
 *   can display animated phase steps while the engine runs.
 */

import { useTweakOwnershipStore } from '@/stores/tweakOwnershipStore';
import { useStore } from './store';
import { isTweakPremium } from './premium-config';
import { TWEAKS_DATA } from './tweak-registry';

// ── Constants ─────────────────────────────────────────────────────────────────

const BALANCED_GUID       = '381b4222-f694-41f0-9685-ff5bb260df2e';
const SC_PLAN_NAME_PREFIX = 'SwitchControl -';
const MAX_RETRY_ATTEMPTS  = 3;
const RETRY_BASE_DELAY_MS = 600;

// ── Premium slider defaults ───────────────────────────────────────────────────
//
// Mirrors the defaultValue fields in electron/slider-tweak-executor.js.
// Used to (a) reset the Zustand store after revert so the UI immediately
// shows Windows defaults, and (b) detect non-default premium slider values
// in hasPremiumItemsToRevert().
//
// Disabled sliders (mouse-queue-size, kbd-queue-size) are intentionally
// excluded — they can never be applied, so there is nothing to revert.

const PREMIUM_SLIDER_DEFAULTS: Record<string, number> = {
  'win32-priority-sep':       2,
  'sys-responsiveness':       20,
  'max-pending-interrupts':   4,
  'timer-resolution-slider':  156,
  'net-throttle-index':       10,
  'menu-show-delay':          400,
  'hung-app-timeout':         5000,
  'low-level-hooks-timeout':  5000,
  'wait-to-kill-app':         20000,
  'svchost-split-threshold':  380000,
};

// ── Premium preset defaults ───────────────────────────────────────────────────
//
// Mirrors the defaultOptionId fields in electron/preset-tweak-executor.js.
// Used to reset the Zustand presetOptions store after revert so the UI
// immediately shows the Windows-default option rather than the stale
// premium option (e.g. "Gaming" → "standard", "extended" → "standard").

const PREMIUM_PRESET_DEFAULTS: Record<string, string> = {
  'fortnite-high-priority':    'normal',
  'irq-optimization-profile':  'balanced',
  'io-optimization-profile':   'standard',
  'directx-optimization-profile': 'standard',
};

// ── Extreme Labs → main Zustand store bridge mappings ───────────────────────
//
// When Extreme Labs tweaks are reverted (trial expiry), the local appliedTweaks
// Set and localStorage get cleared. But the main store also holds state for
// registry/slider/preset tweaks that EL bridges to. These mappings let us
// clear the main store so the Tweaks page doesn't still show them as applied.

const EL_REGISTRY_TWEAK_IDS: string[] = [
  'timer-res', 'synth-timers', 'hpet-disable', 'power-throttling',
  'disable-game-dvr', 'disable-xbox-capture', 'optimize-windowed-games',
  'mmcss-nolazymode', 'tcp-no-delay',
  'win-search-index', 'superfetch', 'fax-printer', 'xbox-services',
  'bluetooth', 'edge-update', 'adobe-updater', 'teams-startup', 'vendor-updaters',
];

// Single source of truth: reference PREMIUM_SLIDER_DEFAULTS so these never
// silently diverge if defaults are updated in one object but not the other.
const EL_SLIDER_DEFAULTS: Record<string, number> = {
  'net-throttle-index': PREMIUM_SLIDER_DEFAULTS['net-throttle-index'],
  'win32-priority-sep': PREMIUM_SLIDER_DEFAULTS['win32-priority-sep'],
  'sys-responsiveness': PREMIUM_SLIDER_DEFAULTS['sys-responsiveness'],
};

const EL_PRESET_DEFAULTS: Record<string, string> = {
  'fortnite-high-priority': 'normal',
};

/**
 * Reset the Zustand main store's sliderValues for every reverted ID to its
 * Windows default so the slider UI immediately reflects the reverted state.
 * Falls back to resetting ALL known premium sliders when no specific list is
 * provided (e.g. when the IPC call succeeded but reverted[] was empty).
 */
function clearPremiumSliderStoreValues(revertedIds?: string[]): void {
  try {
    const store = useStore.getState();
    const ids = (revertedIds && revertedIds.length > 0)
      ? revertedIds
      : Object.keys(PREMIUM_SLIDER_DEFAULTS);
    for (const id of ids) {
      const defaultVal = PREMIUM_SLIDER_DEFAULTS[id];
      if (defaultVal !== undefined) {
        store.setSliderValue(id, defaultVal);
      }
    }
    console.log(`[Revert:SLIDER] store cleared for ${ids.length} slider(s)`);
  } catch (e) {
    console.warn('[Revert:SLIDER] clearPremiumSliderStoreValues failed:', e);
  }
}

/**
 * Reset the Zustand presetOptions for every reverted preset ID to its
 * Windows-default option so the preset card immediately shows the default
 * option (not the stale premium selection) after trial expiry revert.
 * Falls back to resetting ALL known premium presets when no specific list is
 * provided.
 */
function clearPremiumPresetStoreValues(revertedIds?: string[]): void {
  try {
    const store = useStore.getState();
    const ids = (revertedIds && revertedIds.length > 0)
      ? revertedIds
      : Object.keys(PREMIUM_PRESET_DEFAULTS);
    let cleared = 0;
    for (const id of ids) {
      const defaultOptionId = PREMIUM_PRESET_DEFAULTS[id];
      if (defaultOptionId !== undefined) {
        store.setPresetOption(id, defaultOptionId);
        cleared++;
      }
    }
    console.log(`[Revert:PRESET] store cleared for ${cleared} preset(s)`);
  } catch (e) {
    console.warn('[Revert:PRESET] clearPremiumPresetStoreValues failed:', e);
  }
}

/**
 * Reset the main Zustand store for all Extreme Labs-bridged tweaks.
 * Registry tweaks are set to false, sliders to Windows defaults, presets to
 * their defaultOptionId. Called after a successful EL restoreBaseline() so
 * the Tweaks page and Extreme Labs page both reflect the reverted state.
 */
function clearMainStoreForELTweaks(): void {
  try {
    const mainStore = useStore.getState();
    for (const id of EL_REGISTRY_TWEAK_IDS) {
      mainStore.setTweak(id, false);
    }
    for (const [id, defaultVal] of Object.entries(EL_SLIDER_DEFAULTS)) {
      mainStore.setSliderValue(id, defaultVal);
    }
    for (const [id, defaultOptionId] of Object.entries(EL_PRESET_DEFAULTS)) {
      mainStore.setPresetOption(id, defaultOptionId);
    }
    console.log('[Revert:EL] main store cleared for bridged EL tweaks');
  } catch (e) {
    console.warn('[Revert:EL] clearMainStoreForELTweaks failed:', e);
  }
}

/**
 * Reset the main Zustand tweak store for the given IDs.
 * This is the missing link that makes the Tweaks page UI immediately reflect
 * the reverted state (registry tweaks turn off / blue highlight disappears).
 */
function clearMainStoreForTweaks(tweakIds: string[]): void {
  try {
    const mainStore = useStore.getState();
    for (const id of tweakIds) {
      mainStore.setTweak(id, false);
    }
    console.log(`[Revert:TWEAK] main store cleared for ${tweakIds.length} tweak(s)`);
  } catch (e) {
    console.warn('[Revert:TWEAK] clearMainStoreForTweaks failed:', e);
  }
}

// ── Phase type (exported for progress UI) ────────────────────────────────────

export type RevertPhase =
  | 'locking'
  | 'reverting_tweaks'
  | 'reverting_sliders'
  | 'reverting_presets'
  | 'reverting_network'
  | 'reverting_extreme_labs'
  | 'verifying'
  | 'complete';

// ── Result types ──────────────────────────────────────────────────────────────

export type RevertItemStatus =
  | 'reverted'
  | 'skipped_conflict'
  | 'skipped_user_owned'
  | 'skipped_not_active'
  | 'failed';

export interface RevertItemResult {
  tweakId: string;
  label: string;
  status: RevertItemStatus;
  reason?: string;
}

export interface PowerPlanRevertResult {
  status:
    | 'reverted'
    | 'forced_balanced'
    | 'skipped_not_sc'
    | 'failed'
    | 'not_applicable';
  targetGuid?: string;
  previousPlanName?: string;
  appliedPlanName?: string;
  reason?: string;
  forcedBalanced?: boolean;
  plansDeleted?: number;
  verifiedClean?: boolean;
  verifiedActiveName?: string;
}

export interface PremiumRevertReport {
  tweakResults: RevertItemResult[];
  sliderResults: RevertItemResult[];
  presetResults: RevertItemResult[];
  networkResults: RevertItemResult[];
  powerPlan: PowerPlanRevertResult;
  anyFailed: boolean;
  anyConflict: boolean;
  revertedCount: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function getTweaksAPI()     { return (window as any).electronAPI?.tweaks       ?? null; }
function getNetworkAPI()    { return (window as any).electronAPI?.networkTweaks ?? null; }
function getPowerPlanAPI()  { return (window as any).electronAPI?.powerPlans    ?? null; }
function getPremiumAPI()    { return (window as any).electronAPI?.premium       ?? null; }
function getSliderAPI()     { return (window as any).electronAPI?.tweaks       ?? null; }
function getPresetAPI()     { return (window as any).electronAPI?.presetTweaks ?? null; }

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * The Electron pipeline is the single owner of premium expiry reverts. It
 * handles every ownership type (including sliders, presets, NIC properties,
 * network tweaks, and power plans) and clears each ownership record after a
 * successful revert. Do not call the individual slider/preset IPC sweeps here:
 * doing so leaves the other ownership records behind and reopens the modal on
 * every launch.
 */
async function runPipelineRevert(
  onProgress?: (phase: RevertPhase) => void,
): Promise<PremiumRevertReport> {
  const api = getPremiumAPI();
  onProgress?.('locking');
  if (!api?.revertAll) {
    throw new Error('Premium revert pipeline is unavailable');
  }

  onProgress?.('reverting_tweaks');
  // Some older sessions have network tweak state in localStorage but no
  // ownership record. Pass that state to the Electron recovery sweep.
  const fallbackNetworkTweakIds = readEnabledNetworkTweakIdsFromLocalStorage();
  const response = await api.revertAll({ fallbackNetworkTweakIds });
  onProgress?.('verifying');

  const details = response?.details && typeof response.details === 'object'
    ? response.details as Record<string, any>
    : {};
  const toItem = (scopeKey: string, detail: any): RevertItemResult => ({
    tweakId: scopeKey,
    label: detail?.label || scopeKey,
    status: detail?.skipped ? 'skipped_not_active' : detail?.success ? 'reverted' : 'failed',
    reason: detail?.reason || detail?.error,
  });
  const entries = Object.entries(details);
  const networkEntries = entries
    .filter(([key]) => key.startsWith('network_tweak:') || key.startsWith('network:'));
  const tweakResults = entries
    .filter(([key]) =>
      !key.startsWith('slider:') &&
      !key.startsWith('preset:') &&
      !key.startsWith('power_plan') &&
      !key.startsWith('network_tweak:') &&
      !key.startsWith('network:'))
    .map(([key, value]) => toItem(key, value));
  const networkResults = networkEntries.map(([key, value]) => toItem(key, value));
  const sliderResults = entries
    .filter(([key]) => key.startsWith('slider:'))
    .map(([key, value]) => toItem(key.slice(7), value));
  const presetResults = entries
    .filter(([key]) => key.startsWith('preset:'))
    .map(([key, value]) => toItem(key.slice(7), value));
  const powerPlanEntry = entries.find(([key]) => key.startsWith('power_plan'));
  const powerPlan: PowerPlanRevertResult = powerPlanEntry
    ? {
        status: powerPlanEntry[1]?.success ? 'reverted' : powerPlanEntry[1]?.skipped ? 'skipped_not_sc' : 'failed',
        reason: powerPlanEntry[1]?.reason || powerPlanEntry[1]?.error,
      }
    : { status: 'not_applicable' };

  // Keep renderer state aligned with the authoritative backend result.
  clearPremiumSliderStoreValues();
  clearPremiumPresetStoreValues();
  try {
    const mainStore = useStore.getState();
    const premiumIds = TWEAKS_DATA.filter(t => t.supported && isTweakPremium(t.id)).map(t => t.id);
    for (const id of premiumIds) mainStore.setTweak(id, false);
  } catch (e) {
    console.warn('[Revert:PIPELINE] renderer store cleanup failed:', e);
  }

  const anyFailed = response?.success === false ||
    Number(response?.failed || 0) > 0 ||
    [...tweakResults, ...sliderResults, ...presetResults].some(r => r.status === 'failed') ||
    powerPlan.status === 'failed';
  const anyConflict = [...tweakResults, ...sliderResults, ...presetResults]
    .some(r => r.status === 'skipped_conflict');
  const revertedCount = Number(response?.reverted || 0);

  onProgress?.('complete');
  console.log(`[Revert] Pipeline complete — total=${response?.total ?? entries.length} reverted=${revertedCount} skipped=${response?.skipped ?? 0} failed=${response?.failed ?? 0}`);
  return {
    tweakResults,
    sliderResults,
    presetResults,
    networkResults,
    powerPlan,
    anyFailed,
    anyConflict,
    revertedCount,
  };
}

// ── Slider revert ───────────────────────────────────────────────────────────
//
// Slider tweaks were completely skipped by the old revert engine (0% success).
// They store their original values in slider-state.json on the backend, so we
// delegate to the Electron backend's revertAllPremiumSliders() sweep.
//
// RELIABILITY FIXES (v3):
//   • Bug fix — success check was `lastResult?.success` but the IPC returned
//     { reverted, failed } with NO 'success' field, so it was always undefined
//     (falsy). The retry loop ran 3× needlessly. On attempt 1 the originalValues
//     backup was cleared; attempts 2 and 3 found nothing and returned reverted=[].
//     Reading results from the LAST attempt therefore always showed 0 reverts.
//     Fix: treat any call that returns an Array-shaped 'reverted' field as success.
//   • After revert, clear the Zustand sliderValues store for every reverted ID so
//     the slider UI immediately shows Windows defaults instead of stale premium vals.
//   • Dispatch sc:sliders-reverted so any mounted slider component can react.

async function revertSliderTweaks(): Promise<RevertItemResult[]> {
  const api = getSliderAPI();
  if (!api?.revertAllSliders) {
    console.warn('[Revert:SLIDER] electronAPI.tweaks.revertAllSliders not available');
    return [];
  }

  let lastResult: any = null;
  let success = false;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      lastResult = await api.revertAllSliders();
      // The executor returns { success?, reverted, failed }.  Older builds did
      // not include 'success', so fall back to checking for the reverted array.
      if (lastResult?.success === true || Array.isArray(lastResult?.reverted)) {
        success = true;
        console.log(`[Revert:SLIDER] revertAllSliders succeeded attempt=${attempt}`);
        break;
      }
      console.warn(`[Revert:SLIDER] revertAllSliders unexpected response attempt=${attempt}`, lastResult);
    } catch (err) {
      console.error(`[Revert:SLIDER] revertAllSliders exception attempt=${attempt}`, err);
    }
    if (attempt < MAX_RETRY_ATTEMPTS) await delay(RETRY_BASE_DELAY_MS * attempt);
  }

  if (!lastResult) {
    // IPC failed on all retries — still clear the Zustand store so the UI
    // doesn't keep showing stale premium slider values after trial expiry.
    clearPremiumSliderStoreValues(); // no arg = clear all known premium sliders
    return [];
  }

  const revertedIds: string[] = lastResult.reverted ?? [];
  const failedList: Array<{ tweakId: string; error: string }> = lastResult.failed ?? [];

  // Reset the Zustand store so slider UI immediately reflects Windows defaults.
  // We always clear, even when revertedIds is empty, because the executor may
  // have reverted to default without adding to the list (idempotent writes).
  clearPremiumSliderStoreValues(revertedIds.length > 0 ? revertedIds : undefined);
  // Gate dispatch: don't fire the event when nothing was reverted — components
  // listening to sc:sliders-reverted would clear their UI state unnecessarily.
  if (revertedIds.length > 0) {
    dispatchRevertEvent('sc:sliders-reverted', { ids: revertedIds });
  }

  const results: RevertItemResult[] = [];

  for (const tweakId of revertedIds) {
    results.push({ tweakId, label: tweakId, status: 'reverted' });
  }
  for (const { tweakId, error } of failedList) {
    results.push({ tweakId, label: tweakId, status: 'failed', reason: error });
  }

  console.log(`[Revert:SLIDER] total=${results.length} reverted=${revertedIds.length} failed=${failedList.length} success=${success}`);
  return results;
}

// ── Preset revert ─────────────────────────────────────────────────────────────
//
// NEW: Preset tweaks were completely skipped by the revert engine (0% success).
// They store their original options in preset-state.json on the backend, so we
// delegate to the Electron backend's revertAllPremiumPresets() sweep.

async function revertPresetTweaks(): Promise<RevertItemResult[]> {
  const api = getPresetAPI();
  if (!api?.revertAll) {
    console.warn('[Revert:PRESET] electronAPI.presetTweaks.revertAll not available');
    return [];
  }

  let lastResult: any = null;
  let success = false;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      lastResult = await api.revertAll();
      // Same fix as slider: the executor returns { reverted, failed }, no 'success' field.
      if (lastResult?.success === true || Array.isArray(lastResult?.reverted)) {
        success = true;
        console.log(`[Revert:PRESET] revertAll succeeded attempt=${attempt}`);
        break;
      }
      console.warn(`[Revert:PRESET] revertAll unexpected response attempt=${attempt}`, lastResult);
    } catch (err) {
      console.error(`[Revert:PRESET] revertAll exception attempt=${attempt}`, err);
    }
    if (attempt < MAX_RETRY_ATTEMPTS) await delay(RETRY_BASE_DELAY_MS * attempt);
  }

  if (!lastResult) {
    return [];
  }

  const revertedIds: string[] = lastResult.reverted ?? [];
  const failedList: Array<{ tweakId: string; error: string }> = lastResult.failed ?? [];

  // Reset the Zustand preset store so the card UI immediately shows the
  // Windows-default option instead of the stale premium selection.
  clearPremiumPresetStoreValues(revertedIds.length > 0 ? revertedIds : undefined);
  dispatchRevertEvent('sc:presets-reverted', { ids: revertedIds });

  const results: RevertItemResult[] = [];

  for (const tweakId of revertedIds) {
    results.push({ tweakId, label: tweakId, status: 'reverted' });
  }
  for (const { tweakId, error } of failedList) {
    results.push({ tweakId, label: tweakId, status: 'failed', reason: error });
  }

  console.log(`[Revert:PRESET] total=${results.length} reverted=${revertedIds.length} failed=${failedList.length}`);
  return results;
}

// ── Tweak revert ──────────────────────────────────────────────────────────────
//
// FIX: The previous code treated "current state ≠ recorded applied state" as a
// conflict and skipped the item. This caused ~50% failures: any tweak that was
// already undone (reboot, Windows update, user toggle) would be marked conflict.
//
// New logic:
//   • current=false (already not applied) → that IS the target end-state → reverted ✓
//   • current=true (still applied)        → execute revert → verify → retry up to 3x

async function revertSingleTweak(
  tweakId: string,
  label: string,
): Promise<RevertItemStatus> {
  const api = getTweaksAPI();
  if (!api) return 'failed';

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const status = await api.checkStatus(tweakId);
      const currentIsApplied: boolean = status?.isApplied ?? false;

      // Already at target end-state — count as success
      if (!currentIsApplied) {
        useTweakOwnershipStore.getState().recordTweakRevertSuccess(tweakId);
        console.log(`[Revert:TWEAK] already reverted tweakId="${tweakId}" (attempt ${attempt})`);
        return 'reverted';
      }

      // Execute revert
      const result = await api.execute(tweakId, 'revert');
      if (!result?.success) {
        console.warn(`[Revert:TWEAK] execute failed tweakId="${tweakId}" attempt=${attempt}`, result?.error);
        if (attempt < MAX_RETRY_ATTEMPTS) { await delay(RETRY_BASE_DELAY_MS * attempt); continue; }
        useTweakOwnershipStore.getState().markTweakRevertFailed(tweakId);
        return 'failed';
      }

      // Verify
      const afterStatus = await api.checkStatus(tweakId);
      if ((afterStatus?.isApplied ?? false) !== false) {
        console.warn(`[Revert:TWEAK] still applied tweakId="${tweakId}" attempt=${attempt}`);
        if (attempt < MAX_RETRY_ATTEMPTS) { await delay(RETRY_BASE_DELAY_MS * attempt); continue; }
        useTweakOwnershipStore.getState().markTweakRevertFailed(tweakId);
        return 'failed';
      }

      useTweakOwnershipStore.getState().recordTweakRevertSuccess(tweakId);
      console.log(`[Revert:TWEAK] success tweakId="${tweakId}" attempt=${attempt}`);
      return 'reverted';

    } catch (err) {
      console.error(`[Revert:TWEAK] exception tweakId="${tweakId}" attempt=${attempt}`, err);
      if (attempt < MAX_RETRY_ATTEMPTS) { await delay(RETRY_BASE_DELAY_MS * attempt); continue; }
      useTweakOwnershipStore.getState().markTweakRevertFailed(tweakId);
      return 'failed';
    }
  }
  return 'failed';
}

// ── localStorage helpers ──────────────────────────────────────────────────────
//
// After a successful revert the engine must clear the two UI-owned localStorage
// keys so the pages don't re-display stale "Applied" state on the next mount:
//
//   "extreme-labs-applied"  — Set<string> written by ExtremeLabs.tsx
//   "sc-net-tweak-state-v1" — Record<id,TweakStatus> written by NetworkTweaks.tsx
//
// We also dispatch custom DOM events so any *mounted* component can update its
// in-memory React state immediately without waiting for a remount.

// Returns all network tweak IDs that localStorage shows as "enabled".
// Used as a fallback when the ownership store has been cleared (e.g. after a
// premium upgrade) so we still catch tweaks applied in a previous session.
function readEnabledNetworkTweakIdsFromLocalStorage(): string[] {
  try {
    const raw = localStorage.getItem('sc-net-tweak-state-v1');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(parsed)
      .filter(([, v]) => v === 'enabled')
      .map(([id]) => id);
  } catch (_) {
    return [];
  }
}

function patchNetworkTweakLocalStorage(revertedIds: string[]): void {
  if (revertedIds.length === 0) return;
  try {
    const raw = localStorage.getItem('sc-net-tweak-state-v1');
    const state: Record<string, string> = raw ? JSON.parse(raw) : {};
    for (const id of revertedIds) state[id] = 'idle';
    localStorage.setItem('sc-net-tweak-state-v1', JSON.stringify(state));
  } catch (_) {}
}

function dispatchRevertEvent(name: string, detail?: unknown): void {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (_) {}
}

// ── Network tweak revert ──────────────────────────────────────────────────────
//
// FIX: The previous code fetched /api/network-tweaks/state (backend DB snapshot)
// and compared it to the recorded appliedStatus. If Windows diverged from the DB
// at all (e.g. system restart, netsh manual run), this fired as "conflict → skip"
// with near 100% probability, giving ~20% success overall.
//
// New logic: skip the HTTP pre-check entirely. Execute IPC revert directly and
// rely on the IPC result + verified flag. Retry up to 3x on failure.

async function revertSingleNetworkTweak(
  tweakId: string,
  label: string,
): Promise<RevertItemStatus> {
  const api = getNetworkAPI();
  if (!api) return 'failed';

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await api.execute(tweakId, 'revert');

      if (!result?.success) {
        console.warn(`[Revert:NET] execute failed tweakId="${tweakId}" attempt=${attempt}`, result?.message);
        if (attempt < MAX_RETRY_ATTEMPTS) { await delay(RETRY_BASE_DELAY_MS * attempt); continue; }
        useTweakOwnershipStore.getState().markNetworkTweakRevertFailed(tweakId);
        return 'failed';
      }

      if (result.verified === false) {
        // Executor confirmed revert did NOT stick — retry.
        console.warn(`[Revert:NET] not verified tweakId="${tweakId}" attempt=${attempt}`);
        if (attempt < MAX_RETRY_ATTEMPTS) { await delay(RETRY_BASE_DELAY_MS * attempt); continue; }
        useTweakOwnershipStore.getState().markNetworkTweakRevertFailed(tweakId);
        return 'failed';
      }
      if (result.verified === undefined) {
        // Executor has no verification support — accept but surface for diagnostics.
        // This is inconsistent with revertSingleTweak which always re-checks status;
        // logging here makes silent no-verification cases visible in crash reports.
        console.warn(`[Revert:NET] tweakId="${tweakId}" — executor returned no verification; accepting result unverified (attempt ${attempt})`);
      }

      // Report success to backend (non-fatal).
      // Validate tweakId before interpolating into URL — lsEnabledIds reads from
      // localStorage which could be tampered with to inject path traversal chars.
      const { apiPost } = await import('./api');
      if (!/^[\w-]+$/.test(tweakId)) {
        console.error(`[Revert:NET] tweakId "${tweakId}" failed allowlist check — skipping backend report`);
      } else {
      await apiPost(`/network-tweaks/${tweakId}/report`, {
        action: 'disable',
        success: true,
        verified: true,
        message: 'Reverted on premium expiry',
      }).catch(() => {});
      } // end tweakId allowlist guard

      // Patch localStorage so the UI shows "idle" on next mount
      patchNetworkTweakLocalStorage([tweakId]);

      useTweakOwnershipStore.getState().recordNetworkTweakRevertSuccess(tweakId);
      console.log(`[Revert:NET] success tweakId="${tweakId}" attempt=${attempt}`);
      return 'reverted';

    } catch (err) {
      console.error(`[Revert:NET] exception tweakId="${tweakId}" attempt=${attempt}`, err);
      if (attempt < MAX_RETRY_ATTEMPTS) { await delay(RETRY_BASE_DELAY_MS * attempt); continue; }
      useTweakOwnershipStore.getState().markNetworkTweakRevertFailed(tweakId);
      return 'failed';
    }
  }
  return 'failed';
}

// ── Power plan revert ─────────────────────────────────────────────────────────
//
// Unchanged from v1 — power plans already had ~100% success. Kept intact.

async function revertPowerPlan(): Promise<PowerPlanRevertResult> {
  // Read rec once for checking provenance/guids — but re-read store before any
  // write so we're never calling actions on a reference that could be stale
  // from a concurrent async operation having mutated the store in between.
  const rec = useTweakOwnershipStore.getState().powerPlan;

  const api = getPowerPlanAPI();
  if (!api) return { status: 'not_applicable' };

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
    if (rec?.provenance === 'app') useTweakOwnershipStore.getState().markPowerPlanRevertFailed();
    return { status: 'failed', reason: 'Could not read current power plan state' };
  }

  const guidMatchesSC = !!(
    rec?.provenance === 'app' &&
    rec.appliedPlanGuid &&
    currentGuid &&
    currentGuid === rec.appliedPlanGuid.toLowerCase()
  );
  const nameMatchesSC = currentName.startsWith(SC_PLAN_NAME_PREFIX);

  let guidInStoredSC = false;
  if (currentGuid && !guidMatchesSC && !nameMatchesSC) {
    try {
      const storedGuids: string[] = (await (api as any).getStoredSCGuids?.()) ?? [];
      guidInStoredSC = storedGuids.map((g: string) => g.toLowerCase()).includes(currentGuid);
      if (guidInStoredSC) {
        console.log(`[Revert:PLAN] Active plan "${currentName}" (${currentGuid}) matched stored SC GUID list`);
      }
    } catch (e) {
      console.warn('[Revert:PLAN] getStoredSCGuids unavailable (non-fatal):', e);
    }
  }

  const activeIsSCPlan = guidMatchesSC || nameMatchesSC || guidInStoredSC;

  if (!activeIsSCPlan) {
    console.log(`[Revert:PLAN] Active plan "${currentName}" (${currentGuid}) is not SC-managed — skipping`);
    if (rec?.provenance === 'app') useTweakOwnershipStore.getState().recordPowerPlanRevertSuccess();
    return {
      status: 'skipped_not_sc',
      reason: currentGuid
        ? `Active plan "${currentName}" is not a SwitchControl plan — user already changed it`
        : 'Could not read active plan — nothing to revert',
    };
  }

  const targetGuid = BALANCED_GUID;

  if (!api.activateByGuid) {
    if (rec?.provenance === 'app') useTweakOwnershipStore.getState().markPowerPlanRevertFailed();
    return { status: 'failed', reason: 'Power plan restore requires an app update (activateByGuid not exposed)' };
  }

  console.log(
    `[Revert:PLAN] Active SC plan "${currentName}" (${currentGuid})` +
    ` — hard-target Windows Balanced (${BALANCED_GUID})`
  );

  const restoreResult = await api.activateByGuid(targetGuid);

  if (restoreResult?.success) {
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

    try {
      const verify = await api.getState();
      const verifiedGuid = (verify?.activeScheme?.guid ?? '').toLowerCase();
      verifiedActiveName = verify?.activeScheme?.name;
      if (verifiedGuid !== targetGuid) {
        console.error(`[Revert:PLAN] Verification failed — expected ${targetGuid} got ${verifiedGuid}`);
        if (rec?.provenance === 'app') useTweakOwnershipStore.getState().markPowerPlanRevertFailed();
        return { status: 'failed', reason: 'Power plan set but verification failed', targetGuid };
      }
      console.log(`[Revert:PLAN] Verification passed — active: "${verifiedActiveName}" (${verifiedGuid})`);
    } catch { /* non-fatal */ }

    if (rec?.provenance === 'app') useTweakOwnershipStore.getState().recordPowerPlanRevertSuccess();
    return {
      status: 'forced_balanced',
      targetGuid,
      forcedBalanced: true,
      previousPlanName: rec?.previousPlanName,
      appliedPlanName:  currentName,
      plansDeleted,
      verifiedClean,
      verifiedActiveName,
    };
  }

  console.error(`[Revert:PLAN] Windows Balanced activation failed: ${restoreResult?.error}`);
  if (rec?.provenance === 'app') useTweakOwnershipStore.getState().markPowerPlanRevertFailed();
  return {
    status: 'failed',
    reason: restoreResult?.error ?? 'Power plan restore failed',
    appliedPlanName: currentName,
    targetGuid,
  };
}

// ── In-flight guard ───────────────────────────────────────────────────────────
// Prevents two concurrent runPremiumRevert() calls (e.g. double-click, timer retry)
// from processing the same ownership records in parallel and double-writing store state.

let _revertInFlight = false;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full premium revert sequence.
 *
 * Phase order:
 *   locking → reverting_tweaks → reverting_network
 *   → verifying (power plan + cleanup) → complete
 *
 * @param onProgress  Optional callback invoked at each phase boundary so the
 *                    UI can display a live animated progress indicator.
 */
export async function runPremiumRevert(
  onProgress?: (phase: RevertPhase) => void,
): Promise<PremiumRevertReport> {
  if (_revertInFlight) {
    console.warn('[Revert] runPremiumRevert already in progress — ignoring concurrent call');
    // Return a benign no-op report so the caller can handle it without crashing.
    return {
      tweakResults: [], sliderResults: [], presetResults: [],
       networkResults: [],
      powerPlan: { status: 'not_applicable' },
      anyFailed: false, anyConflict: false, revertedCount: 0,
    };
  }
  _revertInFlight = true;

  try {
  // The backend pipeline is authoritative. It performs the complete revert
  // and clears disk-backed ownership records in one transaction-aware flow.
  return await runPipelineRevert(onProgress);

  console.log('[Revert] Starting premium revert sequence v2...');
  onProgress?.('locking');

  const store = useTweakOwnershipStore.getState();

  const tweakResults:       RevertItemResult[] = [];
  let   sliderResults:      RevertItemResult[] = [];
  let   presetResults:      RevertItemResult[] = [];
  const networkResults:     RevertItemResult[] = [];

  // ── Tweaks ──────────────────────────────────────────────────────────────────
  onProgress?.('reverting_tweaks');
  const tweakEntries = Object.entries(store.appliedTweaks)
    .filter(([, rec]) => rec.provenance === 'app' && rec.isPremium);

  for (const [tweakId, rec] of tweakEntries) {
    console.log(`[Revert] processing tweak "${tweakId}" label="${rec.label}"`);
    const status = await revertSingleTweak(tweakId, rec.label);
    tweakResults.push({ tweakId, label: rec.label, status });
  }

  // ── Tweak store-fallback sweep ───────────────────────────────────────────
  // Catches premium tweaks that are enabled in the main Zustand store but have
  // NO ownership record (applied in an older session before ownership tracking,
  // or after ownership was cleared by a prior upgrade). Without this, those
  // tweaks stay system-applied even though the ownership-based phase above
  // ran cleanly — they just never appeared in tweakEntries.
  //
  // Mirrors the network-tweak lsEnabledIds fallback (lines ~841-855).
  const ownershipTrackedIds = new Set(tweakEntries.map(([id]) => id));
  try {
    const mainStoreTweaks = useStore.getState().tweaks;
    const fallbackEntries = TWEAKS_DATA
      .filter(t => t.supported && isTweakPremium(t.id) && mainStoreTweaks[t.id] && !ownershipTrackedIds.has(t.id));
    for (const t of fallbackEntries) {
      console.log(`[Revert] processing tweak (store-fallback) "${t.id}" label="${t.label}"`);
      const status = await revertSingleTweak(t.id, t.label);
      tweakResults.push({ tweakId: t.id, label: t.label, status });
    }
  } catch (e) {
    console.warn('[Revert:TWEAK-FALLBACK] store-fallback sweep failed:', e);
  }

  // Immediately clear the main Zustand store for every reverted tweak so the
  // Tweaks page UI turns off / blue highlight disappears.
  const revertedTweakIds = tweakResults
    .filter(r => r.status === 'reverted')
    .map(r => r.tweakId);
  if (revertedTweakIds.length > 0) {
    clearMainStoreForTweaks(revertedTweakIds);
  }

  // ── Slider tweaks ─────────────────────────────────────────────────────────
  onProgress?.('reverting_sliders');
  try {
    sliderResults = await revertSliderTweaks();
  } catch (err) {
    console.error('[Revert:SLIDER] unexpected error:', err);
  }

  // ── Preset tweaks ─────────────────────────────────────────────────────────
  onProgress?.('reverting_presets');
  try {
    presetResults = await revertPresetTweaks();
  } catch (err) {
    console.error('[Revert:PRESET] unexpected error:', err);
  }

  // ── Network tweaks ──────────────────────────────────────────────────────────
  onProgress?.('reverting_network');
  const networkEntries = Object.entries(store.networkTweaks)
    .filter(([, rec]) => rec.provenance === 'app');

  // Also pick up any tweaks that are "enabled" in localStorage but are NOT
  // already in the ownership store. This covers the case where the user applied
  // a network tweak in a previous session and the ownership store was cleared
  // (e.g. by clearPremiumOwnership on a premium upgrade).
  const ownershipIds = new Set(networkEntries.map(([id]) => id));
  const lsEnabledIds = readEnabledNetworkTweakIdsFromLocalStorage()
    .filter(id => !ownershipIds.has(id));

  for (const [tweakId, rec] of networkEntries) {
    console.log(`[Revert] processing network tweak "${tweakId}" label="${rec.label}"`);
    const status = await revertSingleNetworkTweak(tweakId, rec.label);
    networkResults.push({ tweakId, label: rec.label, status });
  }

  for (const tweakId of lsEnabledIds) {
    console.log(`[Revert] processing network tweak (ls-fallback) "${tweakId}"`);
    const status = await revertSingleNetworkTweak(tweakId, tweakId);
    networkResults.push({ tweakId, label: tweakId, status });
  }

  // Signal any mounted NetworkTweaks component to update its in-memory cache
  const revertedNetIds = networkResults.filter(r => r.status === 'reverted').map(r => r.tweakId);
  if (revertedNetIds.length > 0) {
    dispatchRevertEvent('sc:net-reverted', { ids: revertedNetIds });
  }

  // ── Power plan ───────────────────────────────────────────────────────────────
  onProgress?.('verifying');
  const powerPlanResult = await revertPowerPlan();

  onProgress?.('complete');

  const anyFailed =
    tweakResults.some(r => r.status === 'failed') ||
    sliderResults.some(r => r.status === 'failed') ||
    presetResults.some(r => r.status === 'failed') ||
    networkResults.some(r => r.status === 'failed') ||
    powerPlanResult.status === 'failed';

  const anyConflict =
    tweakResults.some(r => r.status === 'skipped_conflict') ||
    networkResults.some(r => r.status === 'skipped_conflict');

  const revertedCount =
    tweakResults.filter(r => r.status === 'reverted').length +
    sliderResults.filter(r => r.status === 'reverted').length +
    presetResults.filter(r => r.status === 'reverted').length +
    networkResults.filter(r => r.status === 'reverted').length +
    (powerPlanResult.status === 'reverted' || powerPlanResult.status === 'forced_balanced' ? 1 : 0);

  // ── Final safety sweep ────────────────────────────────────────────────────
  // Turn off every premium tweak in the main Zustand store regardless of
  // ownership-store state. Also unconditionally clears slider and preset store
  // values — if the earlier targeted clears failed (their try/catch swallowed
  // the error), stale premium values would otherwise persist in the store.
  try {
    const mainStore = useStore.getState();
    const allPremiumIds = TWEAKS_DATA
      .filter(t => t.supported && isTweakPremium(t.id))
      .map(t => t.id);
    let swept = 0;
    for (const id of allPremiumIds) {
      if (mainStore.tweaks[id]) {
        mainStore.setTweak(id, false);
        swept++;
      }
    }
    if (swept > 0) {
      console.log(`[Revert:SAFETY] turned off ${swept} premium tweak(s) in main store`);
    }
  } catch (e) {
    console.warn('[Revert:SAFETY] final sweep (tweaks) failed:', e);
  }
  // Slider + preset store clear is unconditional here — a no-op when values are
  // already at defaults, but ensures the UI is clean even if earlier clears threw.
  clearPremiumSliderStoreValues();
  clearPremiumPresetStoreValues();

  console.log(
    `[Revert] Complete — reverted=${revertedCount} failed=${anyFailed} conflict=${anyConflict}` +
     ` sliders=${sliderResults.length} presets=${presetResults.length}`
  );

  return {
    tweakResults,
    sliderResults,
    presetResults,
    networkResults,
    powerPlan: powerPlanResult,
    anyFailed,
    anyConflict,
    revertedCount,
  };
  } finally {
    _revertInFlight = false;
  }
}

/**
 * Returns true if there are any app-applied premium items that would need reverting.
 *
 * SLIDER FIX: also checks the main Zustand store's sliderValues for any premium
 * slider that is set to a non-default value.  The ownership store (tweakOwnershipStore)
 * does not track slider state, so without this check the function always returns
 * false when only slider tweaks have been applied — preventing the revert flow
 * from starting at all.
 *
 * STORE-FALLBACK FIX: also checks the main Zustand store for any premium toggle
 * tweak that is enabled but has no OwnershipStore record.  This catches tweaks
 * applied in older sessions (before ownership tracking), or detected as already
 * applied at boot via system-sync (which sets the main store but never writes an
 * OwnershipStore record).  Without this, nvidia-telemetry and similar tweaks that
 * are only visible in the main store would pass the gate check as "nothing to revert"
 * — so the revert modal never opens and runPremiumRevert()'s store-fallback sweep
 * never runs.
 */
export function hasPremiumItemsToRevert(): boolean {
  const store = useTweakOwnershipStore.getState();
  const hasTweaks      = Object.values(store.appliedTweaks).some(r => r.provenance === 'app' && r.isPremium);
  const hasNetwork     = Object.values(store.networkTweaks).some(r => r.provenance === 'app');
  const hasPlan        = store.powerPlan?.provenance === 'app';

  // Check premium sliders: any stored value that differs from the Windows default
  // means the slider was applied (even across app restarts, since sliderValues is
  // persisted in localStorage via Zustand-persist).
  let hasSliders = false;
  try {
    const sliderValues = useStore.getState().sliderValues;
    hasSliders = Object.entries(PREMIUM_SLIDER_DEFAULTS).some(([id, defaultVal]) => {
      const stored = sliderValues[id];
      // Float-safe comparison: `156.0 !== 156` is false in JS but serialized
      // floats from localStorage could produce surprising inequality.
      return stored !== undefined && Math.abs(stored - defaultVal) > 0.001;
    });
  } catch { /* non-Electron / store not ready */ }

  // Check premium presets: any stored option that differs from the Windows default
  // means the preset was applied.
  let hasPresets = false;
  try {
    const presetOptions = useStore.getState().presetOptions;
    hasPresets = Object.entries(PREMIUM_PRESET_DEFAULTS).some(([id, defaultOptionId]) => {
      const stored = presetOptions?.[id];
      return stored !== undefined && stored !== defaultOptionId;
    });
  } catch { /* non-Electron / store not ready */ }

  // Store-fallback check: premium toggle tweaks enabled in the main Zustand store
  // but absent from the OwnershipStore.  These are tweaks that were either applied
  // in an old session (before ownership tracking) or detected as applied at boot via
  // system-sync.  runPremiumRevert() has a matching sweep — this gate check must
  // be consistent with it so the revert flow starts when needed.
  let hasStoreFallbackTweaks = false;
  try {
    const mainStoreTweaks = useStore.getState().tweaks;
    const ownershipIds = new Set(Object.keys(store.appliedTweaks));
    hasStoreFallbackTweaks = TWEAKS_DATA.some(
      t => t.supported && isTweakPremium(t.id) && mainStoreTweaks[t.id] && !ownershipIds.has(t.id),
    );
  } catch { /* non-Electron / store not ready */ }

  return hasTweaks || hasNetwork || hasPlan || hasSliders || hasPresets || hasStoreFallbackTweaks;
}
