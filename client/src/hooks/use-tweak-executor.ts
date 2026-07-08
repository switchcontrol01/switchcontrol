import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTweakOwnershipStore } from '@/stores/tweakOwnershipStore';
import { isTweakPremium } from '@/lib/premium-config';
import { TWEAKS_DATA } from '@/lib/mock-data';
import {
  HKCU_TOGGLE_IDS,
  ADMIN_TOGGLE_IDS,
  SLIDER_IDS,
  PRESET_IDS,
  UNSUPPORTED_MAP,
} from '@/lib/tweak-registry';

// ── syncAll cooldown — prevents repeated full scans on rapid remounts / focus ─
// Module-level so it persists across component remounts for the app session.
// First call always runs (0 is far enough in the past).
let _lastSyncAllMs = 0;
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ── Failure types ────────────────────────────────────────────────────────────
export type FailureType =
  | 'requires_admin'
  | 'blocked_by_policy'
  | 'uac_cancelled'
  | 'access_denied'
  | 'verification_failed'
  | 'not_found'
  | 'unsupported'
  | 'blocked_by_guard'
  | 'rollback_triggered'
  | 'unknown';

// ── Result / status shapes ────────────────────────────────────────────────────
export interface TweakResult {
  success: boolean;
  requiresReboot: boolean;
  requiresAdmin: boolean;
  unsupported?: boolean;
  verified?: boolean;
  commandsRun: string[];
  message: string | null;
  error: string | null;
  failureType?: FailureType | null;
  userMessage?: string | null;
  hint?: string | null;
}

export interface TweakExecuteOutcome {
  success: boolean;
  failureType?: FailureType | null;
  userMessage?: string | null;
  hint?: string | null;
  requiresReboot?: boolean;
}

export interface TweakStatus {
  tweakId: string;
  isApplied: boolean;
  applied: boolean;
  unsupported?: boolean;
  error: string | null;
}

interface LocalTweakState {
  appliedTweaks: Record<string, boolean>;
  lastSync: string | null;
  windowsBuild?: string;
}

// ── Static tweak classification — derived from the canonical registry ─────────

/** HKCU (non-admin) toggle tweaks — no elevation needed. */
const HKCU_TWEAKS: string[] = HKCU_TOGGLE_IDS;

/** Admin-elevation toggle tweaks. */
const ADMIN_TWEAKS: string[] = ADMIN_TOGGLE_IDS;

/**
 * Slider tweaks use a separate IPC path (readSliderValue / applySliderValue).
 * They are NOT in REAL_TWEAKS (toggle path) — TweakSliderCard handles them.
 */
export const SLIDER_TWEAKS = SLIDER_IDS as readonly string[];
export type SliderTweakId = (typeof SLIDER_TWEAKS)[number];

/**
 * Preset-profile tweaks use a separate IPC path (presetTweaks:getState / apply /
 * revert). They are NOT in REAL_TWEAKS (toggle path) — TweakPresetCard handles them.
 */
export const PRESET_TWEAKS = PRESET_IDS as readonly string[];
export type PresetTweakId = (typeof PRESET_TWEAKS)[number];

/** Map of unsupported tweak ID → human-readable reason. */
export const UNSUPPORTED_TWEAKS: Record<string, string> = UNSUPPORTED_MAP;

export const REAL_TWEAKS = [...HKCU_TWEAKS, ...ADMIN_TWEAKS];

export function isRealTweak(tweakId: string): boolean  { return REAL_TWEAKS.includes(tweakId); }
export function isUnsupportedTweak(tweakId: string): boolean { return tweakId in UNSUPPORTED_TWEAKS; }
export function isTierATweak(tweakId: string): boolean { return HKCU_TWEAKS.includes(tweakId); }
export function isTierBTweak(tweakId: string): boolean { return ADMIN_TWEAKS.includes(tweakId); }
export function isAdminTweak(tweakId: string): boolean { return ADMIN_TWEAKS.includes(tweakId); }
export function isSliderTweak(tweakId: string): boolean { return (SLIDER_TWEAKS as readonly string[]).includes(tweakId); }
export function isPresetTweak(tweakId: string): boolean { return (PRESET_TWEAKS as readonly string[]).includes(tweakId); }

export function isElectronWithTweaks(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI?.tweaks;
}

function getTweaksAPI() {
  return (window as any).electronAPI?.tweaks;
}

// Toast title/description per failure type
const FAILURE_TOAST: Record<FailureType, { title: string; description: string }> = {
  requires_admin:      { title: 'Requires Administrator Mode',    description: 'Right-click SwitchControl and choose "Run as administrator".' },
  blocked_by_policy:   { title: 'Blocked by Windows Policy',      description: 'A Group Policy or MDM rule is preventing this change.' },
  uac_cancelled:       { title: 'UAC Prompt Declined',            description: 'Click "Yes" on the prompt that appears to allow the change.' },
  access_denied:       { title: 'Access Denied',                  description: 'Windows is blocking access to this system resource.' },
  verification_failed: { title: 'Setting Could Not Be Verified',  description: 'The command ran, but the system state did not change.' },
  not_found:           { title: 'Not Supported on This System',   description: 'This registry key, service, or feature does not exist on your version.' },
  unsupported:         { title: 'Tweak Not Supported',            description: 'This tweak cannot be implemented on modern Windows.' },
  blocked_by_guard:    { title: 'Blocked by Safety Guard',        description: 'This tweak was blocked to protect audio/network devices. Apply individually if you are sure.' },
  rollback_triggered:  { title: 'Auto-Rolled Back for Safety',    description: 'Network ping worsened after applying, so the tweak was automatically reverted.' },
  unknown:             { title: 'Tweak Could Not Be Applied',     description: 'An unexpected error occurred. Check logs for details.' },
};

/**
 * Batch-reads ALL tweak states from real Windows registry/service state in a
 * single PowerShell invocation. Used for startup reconciliation so the Zustand
 * store reflects reality even after an AppData wipe (which resets the persisted
 * UI state but leaves Windows registry changes intact).
 *
 * Returns null if not in Electron or if the PS limiter was busy (caller skips).
 */
export async function batchCheckAllTweaks(): Promise<Record<string, TweakStatus> | null> {
  if (!isElectronWithTweaks()) return null;
  try {
    const results = await getTweaksAPI().batchCheckAll();
    return results ?? null;
  } catch (err) {
    console.error('[TweakExecutor] batchCheckAll failed:', err);
    return null;
  }
}

/** Bulk revert: execute multiple tweaks in revert direction.
 *  Used for session rollback after an optimization plan is undone.
 *  Returns empty map (success) on non-Electron (store handles state update).
 */
export async function bulkRevertTweaks(tweakIds: string[]): Promise<Record<string, TweakResult>> {
  if (!isElectronWithTweaks()) {
    const empty: Record<string, TweakResult> = {};
    for (const id of tweakIds) {
      empty[id] = { success: true, requiresReboot: false, requiresAdmin: false, commandsRun: [], message: null, error: null };
    }
    return empty;
  }
  const api = getTweaksAPI();
  const results: Record<string, TweakResult> = {};
  for (const id of tweakIds) {
    try {
      results[id] = await api.execute(id, 'revert', { context: 'bulk' });
    } catch (err) {
      results[id] = {
        success: false, requiresReboot: false, requiresAdmin: false,
        commandsRun: [], message: null, error: err instanceof Error ? err.message : String(err),
        failureType: 'unknown',
      };
    }
  }
  return results;
}

/** Bulk apply: execute multiple tweaks with safety guards active.
 *  Passes `context: 'bulk'` so AudioGuard/NetworkGuard can block/rollback.
 */
export async function bulkApplyTweaks(tweakIds: string[]): Promise<Record<string, TweakResult>> {
  if (!isElectronWithTweaks()) {
    const empty: Record<string, TweakResult> = {};
    for (const id of tweakIds) {
      empty[id] = { success: true, requiresReboot: false, requiresAdmin: false, commandsRun: [], message: null, error: null };
    }
    return empty;
  }
  const api = getTweaksAPI();
  const results: Record<string, TweakResult> = {};
  for (const id of tweakIds) {
    try {
      results[id] = await api.execute(id, 'apply', { context: 'bulk' });
    } catch (err) {
      results[id] = {
        success: false, requiresReboot: false, requiresAdmin: false,
        commandsRun: [], message: null, error: err instanceof Error ? err.message : String(err),
        failureType: 'unknown',
      };
    }
  }
  return results;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTweakExecutor() {
  const { toast } = useToast();
  const [executing, setExecuting]   = useState<string | null>(null);
  const [inProgress, setInProgress] = useState<Set<string>>(new Set());
  const [localState, setLocalState] = useState<LocalTweakState>({ appliedTweaks: {}, lastSync: null });

  useEffect(() => {
    if (isElectronWithTweaks()) {
      getTweaksAPI().getLocalState().then(setLocalState).catch(() => {});
    }
  }, []);

  const executeTweak = useCallback(async (
    tweakId: string,
    currentlyEnabled: boolean,
  ): Promise<TweakExecuteOutcome> => {
    const FAIL = (type: FailureType, msg?: string | null, hint?: string | null): TweakExecuteOutcome =>
      ({ success: false, failureType: type, userMessage: msg ?? FAILURE_TOAST[type].title, hint: hint ?? null });

    if (!isElectronWithTweaks()) return { success: true };
    if (!isRealTweak(tweakId))   return { success: true };
    if (inProgress.has(tweakId)) return FAIL('unknown', 'Another operation is already in progress.');

    setInProgress(prev => new Set(prev).add(tweakId));
    setExecuting(tweakId);
    const action = currentlyEnabled ? 'revert' : 'apply';

    try {
      const result: TweakResult = await getTweaksAPI().execute(tweakId, action);

      if (result.unsupported) {
        const t = FAILURE_TOAST.unsupported;
        toast({ title: t.title, description: result.message ?? t.description, variant: 'destructive' });
        return FAIL('unsupported', result.userMessage, result.hint);
      }

      const isCancelled = result.failureType === 'uac_cancelled' ||
        (!result.failureType && /cancel|declined|uac prompt/i.test(result.error ?? ''));

      if (isCancelled) {
        toast({ title: 'UAC Prompt Declined', description: 'Click "Yes" on the prompt that appears to allow the change.' });
        return FAIL('uac_cancelled', result.userMessage, result.hint);
      }

      if (!result.success) {
        const fType: FailureType = (result.failureType as FailureType) ?? 'unknown';
        const t = FAILURE_TOAST[fType] ?? FAILURE_TOAST.unknown;

        toast({
          title:       result.userMessage ?? t.title,
          description: result.hint        ?? result.error ?? t.description,
          variant:     'destructive',
        });

        return FAIL(fType, result.userMessage, result.hint);
      }

      // ── Verify: authoritative post-execution state check ─────────────────────
      // checkStatus MUST succeed; if it throws or returns null we cannot confirm
      // the change — treat that as a verification failure rather than assuming success.
      let status: TweakStatus | null = null;
      try {
        status = await getTweaksAPI().checkStatus(tweakId);
      } catch {
        return FAIL(
          'verification_failed',
          'Setting Could Not Be Verified',
          'The command ran, but the system state could not be read back to confirm the change.',
        );
      }

      if (!status) {
        return FAIL(
          'verification_failed',
          'Setting Could Not Be Verified',
          'The command ran, but the state check returned no result.',
        );
      }

      const actualState: boolean = status.isApplied;
      const succeeded = actualState === (action === 'apply');

      if (!succeeded) {
        // Command ran but system state did not change — do NOT update localState
        // so the store and UI stay at the pre-toggle value.
        return FAIL(
          'verification_failed',
          'Setting Could Not Be Verified',
          'The command ran but the system state did not change. An antivirus or security policy may be reverting it immediately.',
        );
      }

      // Verification confirmed — update localState and show success toast.
      setLocalState(prev => ({
        ...prev,
        appliedTweaks: { ...prev.appliedTweaks, [tweakId]: actualState },
      }));

      toast({
        title:       action === 'apply' ? 'Tweak Applied' : 'Tweak Reverted',
        description: result.message ?? `Successfully ${action === 'apply' ? 'applied' : 'reverted'}`,
      });

      if (result.requiresReboot) {
        toast({ title: 'Restart Required', description: 'This change takes full effect after a system restart.' });
      }

      // ── Ownership recording ───────────────────────────────────────────────────
      const ownership = useTweakOwnershipStore.getState();
      if (action === 'apply') {
        const tweakMeta = TWEAKS_DATA.find(t => t.id === tweakId);
        ownership.recordTweakApply(
          tweakId,
          tweakMeta?.title ?? tweakId,
          isTweakPremium(tweakId),
        );
      } else if (action === 'revert') {
        const rec = ownership.appliedTweaks[tweakId];
        if (rec?.appliedByApp) {
          ownership.recordTweakRevertSuccess(tweakId);
        }
      }

      return { success: true, requiresReboot: result.requiresReboot };

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to execute tweak';
      toast({ title: 'Execution Error', description: msg, variant: 'destructive' });
      return FAIL('unknown', 'Tweak Could Not Be Applied', msg);
    } finally {
      setExecuting(null);
      setInProgress(prev => { const n = new Set(prev); n.delete(tweakId); return n; });
    }
  }, [toast, inProgress]);

  const syncAllTweaks = useCallback(async (): Promise<Record<string, TweakStatus>> => {
    if (!isElectronWithTweaks()) return {};
    const now = Date.now();
    const elapsed = now - _lastSyncAllMs;
    if (elapsed < SYNC_COOLDOWN_MS) {
      console.log(`[TweakExecutor] syncAll cooldown — skipping (last ran ${Math.round(elapsed / 1000)}s ago, cooldown ${SYNC_COOLDOWN_MS / 1000}s)`);
      return {};
    }
    _lastSyncAllMs = now;
    try {
      const results = await getTweaksAPI().syncAll();
      // skipped result means a sync was already in-flight — use cached state, don't update
      if (!results || (results as any).skipped === true) {
        console.log('[TweakExecutor] syncAll skipped by main process — using cached state');
        _lastSyncAllMs = 0; // reset so next attempt isn't penalised by this skipped call
        return {};
      }
      const state = await getTweaksAPI().getLocalState();
      setLocalState(state);
      return results;
    } catch (err) {
      console.error('[TweakExecutor] syncAll failed:', err);
      _lastSyncAllMs = 0; // reset on error so a retry isn't blocked for 5 minutes
      return {};
    }
  }, []);

  const checkTweakStatus = useCallback(async (tweakId: string): Promise<TweakStatus | null> => {
    if (!isElectronWithTweaks()) return null;
    try { return await getTweaksAPI().checkStatus(tweakId); } catch { return null; }
  }, []);

  const isInProgress = useCallback((tweakId: string) => inProgress.has(tweakId), [inProgress]);

  return {
    executeTweak,
    syncAllTweaks,
    checkTweakStatus,
    executing,
    localState,
    isElectron: isElectronWithTweaks(),
    isTierA: isTierATweak,
    isTierB: isTierBTweak,
    isInProgress,
  };
}
