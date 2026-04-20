import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTweakOwnershipStore } from '@/stores/tweakOwnershipStore';
import { isTweakPremium } from '@/lib/premium-config';
import { TWEAKS_DATA } from '@/lib/mock-data';
import {
  HKCU_TOGGLE_IDS,
  ADMIN_TOGGLE_IDS,
  SLIDER_IDS,
  UNSUPPORTED_MAP,
} from '@/lib/tweak-registry';

// ── Failure types ────────────────────────────────────────────────────────────
export type FailureType =
  | 'requires_admin'
  | 'blocked_by_policy'
  | 'uac_cancelled'
  | 'access_denied'
  | 'verification_failed'
  | 'not_found'
  | 'unsupported'
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

/** Map of unsupported tweak ID → human-readable reason. */
export const UNSUPPORTED_TWEAKS: Record<string, string> = UNSUPPORTED_MAP;

export const REAL_TWEAKS = [...HKCU_TWEAKS, ...ADMIN_TWEAKS];

export function isRealTweak(tweakId: string): boolean  { return REAL_TWEAKS.includes(tweakId); }
export function isUnsupportedTweak(tweakId: string): boolean { return tweakId in UNSUPPORTED_TWEAKS; }
export function isTierATweak(tweakId: string): boolean { return HKCU_TWEAKS.includes(tweakId); }
export function isTierBTweak(tweakId: string): boolean { return ADMIN_TWEAKS.includes(tweakId); }
export function isAdminTweak(tweakId: string): boolean { return ADMIN_TWEAKS.includes(tweakId); }
export function isSliderTweak(tweakId: string): boolean { return (SLIDER_TWEAKS as readonly string[]).includes(tweakId); }

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
  unknown:             { title: 'Tweak Could Not Be Applied',     description: 'An unexpected error occurred. Check logs for details.' },
};

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

    // ── Ownership: capture previous state before apply ─────────────────────────
    let previousIsApplied: boolean | null = null;
    if (action === 'apply') {
      try {
        const preStatus: TweakStatus = await getTweaksAPI().checkStatus(tweakId);
        previousIsApplied = preStatus?.isApplied ?? false;
      } catch {
        previousIsApplied = false;
      }
    }

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

      // ── Success ──────────────────────────────────────────────────────────────
      const status: TweakStatus = await getTweaksAPI().checkStatus(tweakId);
      const actualState = status?.isApplied ?? (action === 'apply');

      toast({
        title:       action === 'apply' ? 'Tweak Applied' : 'Tweak Reverted',
        description: result.message ?? `Successfully ${action === 'apply' ? 'applied' : 'reverted'}`,
      });

      if (result.requiresReboot) {
        toast({ title: 'Restart Required', description: 'This change takes full effect after a system restart.' });
      }

      setLocalState(prev => ({
        ...prev,
        appliedTweaks: { ...prev.appliedTweaks, [tweakId]: actualState },
      }));

      const succeeded = actualState === (action === 'apply');
      if (!succeeded) {
        return FAIL('verification_failed', 'Setting Could Not Be Verified', 'The change was applied but the system state still reads as unchanged.');
      }

      // ── Ownership recording ───────────────────────────────────────────────────
      const ownership = useTweakOwnershipStore.getState();
      if (action === 'apply' && previousIsApplied !== null) {
        const tweakMeta = TWEAKS_DATA.find(t => t.id === tweakId);
        ownership.recordTweakApply(
          tweakId,
          previousIsApplied,
          actualState,
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
    try {
      const results = await getTweaksAPI().syncAll();
      const state   = await getTweaksAPI().getLocalState();
      setLocalState(state);
      return results;
    } catch (err) {
      console.error('[TweakExecutor] syncAll failed:', err);
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
