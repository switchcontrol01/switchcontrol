/**
 * Premium Revert Engine v2
 * ────────────────────────
 * Reverts tweaks, network tweaks, Extreme Labs, and power plan changes applied
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
 * • Extreme Labs: fully integrated. Records apply/revert in the ownership store
 *   (ExtremeLabs.tsx) and reverts via electronAPI.extremeLabs.restoreBaseline().
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

const EL_SLIDER_DEFAULTS: Record<string, number> = {
  'net-throttle-index': 10,
  'win32-priority-sep': 2,
  'sys-responsiveness': 20,
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
  extremeLabsResults: RevertItemResult[];
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
function getExtremeLabsAPI(){ return (window as any).electronAPI?.extremeLabs  ?? null; }
function getSliderAPI()     { return (window as any).electronAPI?.tweaks       ?? null; }
function getPresetAPI()     { return (window as any).electronAPI?.presetTweaks ?? null; }

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
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
    return [];
  }

  const revertedIds: string[] = lastResult.reverted ?? [];
  const failedList: Array<{ tweakId: string; error: string }> = lastResult.failed ?? [];

  // Reset the Zustand store so slider UI immediately reflects Windows defaults.
  // We always clear, even when revertedIds is empty, because the executor may
  // have reverted to default without adding to the list (idempotent writes).
  clearPremiumSliderStoreValues(revertedIds.length > 0 ? revertedIds : undefined);
  dispatchRevertEvent('sc:sliders-reverted', { ids: revertedIds });

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
        console.warn(`[Revert:NET] not verified tweakId="${tweakId}" attempt=${attempt}`);
        if (attempt < MAX_RETRY_ATTEMPTS) { await delay(RETRY_BASE_DELAY_MS * attempt); continue; }
        useTweakOwnershipStore.getState().markNetworkTweakRevertFailed(tweakId);
        return 'failed';
      }

      // Report success to backend (non-fatal)
      const { apiPost } = await import('./api');
      await apiPost(`/network-tweaks/${tweakId}/report`, {
        action: 'disable',
        success: true,
        verified: true,
        message: 'Reverted on premium expiry',
      }).catch(() => {});

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

// ── Extreme Labs revert ───────────────────────────────────────────────────────
//
// NEW: Extreme Labs was previously completely unconnected from the revert engine
// (0% success rate). Now:
//   1. ExtremeLabs.tsx records each apply/undo in the ownership store.
//   2. On trial expiry, restoreBaseline() is called — it reverts all IDs atomically
//      (registry, slider, and NIC tweaks) via the Electron IPC handler.
//   3. Retried up to 3× before marking failures.

async function revertExtremeLabsTweaks(): Promise<RevertItemResult[]> {
  const store = useTweakOwnershipStore.getState();
  const entries = Object.entries(store.extremeLabs).filter(([, rec]) => rec.provenance === 'app');

  const api = getExtremeLabsAPI();
  if (!api?.restoreBaseline) {
    // No API — only report failure for tracked items; if store is empty just skip silently.
    if (entries.length === 0) return [];
    console.warn('[Revert:EL] electronAPI.extremeLabs.restoreBaseline not available');
    return entries.map(([tweakId, rec]) => ({
      tweakId,
      label: rec.label,
      status: 'failed' as const,
      reason: 'Electron API not available',
    }));
  }

  // Pass the specific IDs we tracked so the handler only reverts those tweaks —
  // avoids spawning PowerShell for tweaks that were never applied.
  // When the store is empty (cleared between sessions) we pass undefined so the
  // handler does a full safety sweep of all known IDs — this closes the loophole
  // where a user applied tweaks, the store was lost, and trial expiry ran: the
  // actual registry/system changes get rolled back even without store records.
  const trackedIds = entries.map(([id]) => id);

  let lastResult: any = null;
  let success = false;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      lastResult = await api.restoreBaseline(trackedIds.length > 0 ? trackedIds : undefined);
      if (lastResult?.ok) {
        success = true;
        console.log(`[Revert:EL] restoreBaseline succeeded attempt=${attempt} ids=${trackedIds.length || 'all'}`);
        break;
      }
      console.warn(`[Revert:EL] restoreBaseline failed attempt=${attempt}`, lastResult?.error);
    } catch (err) {
      console.error(`[Revert:EL] exception attempt=${attempt}`, err);
    }
    if (attempt < MAX_RETRY_ATTEMPTS) await delay(RETRY_BASE_DELAY_MS * attempt);
  }

  // Nothing tracked in the store — safety sweep completed but nothing to report to UI.
  if (entries.length === 0) {
    // Still clear localStorage + main store so the component doesn't show stale
    // Applied state on any page (Extreme Labs or Tweaks).
    if (success) {
      try { localStorage.removeItem('extreme-labs-applied'); } catch (_) {}
      clearMainStoreForELTweaks();
      dispatchRevertEvent('sc:el-reverted');
    }
    return [];
  }

  const results = entries.map(([tweakId, rec]) => {
    const itemResult = lastResult?.results?.find((r: any) => r.id === tweakId);
    // If the baseline call succeeded and there's no per-item failure → reverted
    const reverted = success && (itemResult ? itemResult.reverted !== false : true);

    if (reverted) {
      store.recordExtremeLabsRevertSuccess(tweakId);
      return { tweakId, label: rec.label, status: 'reverted' as const };
    } else {
      store.markExtremeLabsRevertFailed(tweakId);
      return {
        tweakId,
        label: rec.label,
        status: 'failed' as const,
        reason: itemResult?.error ?? lastResult?.error ?? 'Extreme Labs restore failed',
      };
    }
  });

  // Clear UI state for reverted items (localStorage, main store, and event dispatch)
  const anyReverted = results.some(r => r.status === 'reverted');
  if (anyReverted) {
    try { localStorage.removeItem('extreme-labs-applied'); } catch (_) {}
    clearMainStoreForELTweaks();
    dispatchRevertEvent('sc:el-reverted');
  }

  return results;
}

// ── Power plan revert ─────────────────────────────────────────────────────────
//
// Unchanged from v1 — power plans already had ~100% success. Kept intact.

async function revertPowerPlan(): Promise<PowerPlanRevertResult> {
  const store = useTweakOwnershipStore.getState();
  const rec   = store.powerPlan;

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
    if (rec?.provenance === 'app') store.markPowerPlanRevertFailed();
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
    if (rec?.provenance === 'app') store.recordPowerPlanRevertSuccess();
    return {
      status: 'skipped_not_sc',
      reason: currentGuid
        ? `Active plan "${currentName}" is not a SwitchControl plan — user already changed it`
        : 'Could not read active plan — nothing to revert',
    };
  }

  const targetGuid = BALANCED_GUID;

  if (!api.activateByGuid) {
    if (rec?.provenance === 'app') store.markPowerPlanRevertFailed();
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
        if (rec?.provenance === 'app') store.markPowerPlanRevertFailed();
        return { status: 'failed', reason: 'Power plan set but verification failed', targetGuid };
      }
      console.log(`[Revert:PLAN] Verification passed — active: "${verifiedActiveName}" (${verifiedGuid})`);
    } catch { /* non-fatal */ }

    if (rec?.provenance === 'app') store.recordPowerPlanRevertSuccess();
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
  if (rec?.provenance === 'app') store.markPowerPlanRevertFailed();
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
 * Phase order:
 *   locking → reverting_tweaks → reverting_network → reverting_extreme_labs
 *   → verifying (power plan + cleanup) → complete
 *
 * @param onProgress  Optional callback invoked at each phase boundary so the
 *                    UI can display a live animated progress indicator.
 */
export async function runPremiumRevert(
  onProgress?: (phase: RevertPhase) => void,
): Promise<PremiumRevertReport> {
  console.log('[Revert] Starting premium revert sequence v2...');
  onProgress?.('locking');

  const store = useTweakOwnershipStore.getState();

  const tweakResults:       RevertItemResult[] = [];
  let   sliderResults:      RevertItemResult[] = [];
  let   presetResults:      RevertItemResult[] = [];
  const networkResults:     RevertItemResult[] = [];
  let   extremeLabsResults: RevertItemResult[] = [];

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

  // ── Extreme Labs ─────────────────────────────────────────────────────────────
  onProgress?.('reverting_extreme_labs');
  try {
    extremeLabsResults = await revertExtremeLabsTweaks();
  } catch (err) {
    console.error('[Revert:EL] unexpected error:', err);
    extremeLabsResults = Object.entries(store.extremeLabs)
      .filter(([, r]) => r.provenance === 'app')
      .map(([tweakId, rec]) => ({ tweakId, label: rec.label, status: 'failed' as const }));
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
    extremeLabsResults.some(r => r.status === 'failed') ||
    powerPlanResult.status === 'failed';

  const anyConflict =
    tweakResults.some(r => r.status === 'skipped_conflict') ||
    networkResults.some(r => r.status === 'skipped_conflict');

  const revertedCount =
    tweakResults.filter(r => r.status === 'reverted').length +
    sliderResults.filter(r => r.status === 'reverted').length +
    presetResults.filter(r => r.status === 'reverted').length +
    networkResults.filter(r => r.status === 'reverted').length +
    extremeLabsResults.filter(r => r.status === 'reverted').length +
    (powerPlanResult.status === 'reverted' || powerPlanResult.status === 'forced_balanced' ? 1 : 0);

  // ── Final safety sweep: turn off every premium tweak in the main Zustand store
  // regardless of ownership-store state. This catches edge cases like tweaks applied
  // outside the app, ownership store cleared by prior upgrade, or IPC failures where
  // the registry revert succeeded but the store was never updated.
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
    console.warn('[Revert:SAFETY] final sweep failed:', e);
  }

  console.log(
    `[Revert] Complete — reverted=${revertedCount} failed=${anyFailed} conflict=${anyConflict}` +
    ` sliders=${sliderResults.length} presets=${presetResults.length} el=${extremeLabsResults.length}`
  );

  return {
    tweakResults,
    sliderResults,
    presetResults,
    networkResults,
    extremeLabsResults,
    powerPlan: powerPlanResult,
    anyFailed,
    anyConflict,
    revertedCount,
  };
}

/**
 * Returns true if there are any app-applied premium items that would need reverting.
 *
 * SLIDER FIX: also checks the main Zustand store's sliderValues for any premium
 * slider that is set to a non-default value.  The ownership store (tweakOwnershipStore)
 * does not track slider state, so without this check the function always returns
 * false when only slider tweaks have been applied — preventing the revert flow
 * from starting at all.
 */
export function hasPremiumItemsToRevert(): boolean {
  const store = useTweakOwnershipStore.getState();
  const hasTweaks      = Object.values(store.appliedTweaks).some(r => r.provenance === 'app' && r.isPremium);
  const hasNetwork     = Object.values(store.networkTweaks).some(r => r.provenance === 'app');
  const hasPlan        = store.powerPlan?.provenance === 'app';
  const hasExtremeLabs = Object.values(store.extremeLabs).some(r => r.provenance === 'app');

  // Check premium sliders: any stored value that differs from the Windows default
  // means the slider was applied (even across app restarts, since sliderValues is
  // persisted in localStorage via Zustand-persist).
  let hasSliders = false;
  try {
    const sliderValues = useStore.getState().sliderValues;
    hasSliders = Object.entries(PREMIUM_SLIDER_DEFAULTS).some(([id, defaultVal]) => {
      const stored = sliderValues[id];
      return stored !== undefined && stored !== defaultVal;
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

  return hasTweaks || hasNetwork || hasPlan || hasExtremeLabs || hasSliders || hasPresets;
}
