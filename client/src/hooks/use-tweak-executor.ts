import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

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
  // Structured failure info (new)
  failureType?: FailureType | null;
  userMessage?: string | null;
  hint?: string | null;
}

/** Return value from executeTweak — replaces the old boolean */
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

// ── Static tweak classification ────────────────────────────────────────────────
const HKCU_TWEAKS = [
  'gaming-mode', 'notifications', 'copilot', 'cortana', 'search-highlights',
  'storage-sense', 'compact-explorer', 'recent-files', 'xbox-bar', 'bg-apps',
  'disable-fso', 'disable-pointer-precision',
];

const ADMIN_TWEAKS = [
  'hibernation', 'fast-startup', 'energy-logging', 'maintenance',
  'core-isolation', 'vbs', 'hyper-v', 'large-system-cache', 'page-combining',
  'prefetch', 'superfetch', 'mem-opt', 'telemetry', 'nvidia-telemetry',
  'tune-priority', 'bluetooth', 'wifi', 'xbox-services', 'fax-printer',
  'synth-timers', 'preemption',
  'disable-mpo', 'usb-selective-suspend', 'pcie-link-state', 'mmcss-gaming',
  'disable-delivery-opt', 'disable-wer', 'win-search-index', 'disable-activity-history',
];

export const UNSUPPORTED_TWEAKS: Record<string, string> = {
  'p-states':     'Requires a runtime agent process for CPU P-state control. Cannot be applied persistently via registry.',
  'irq-priority': 'Requires kernel-level interrupt affinity control not accessible from user-mode.',
  'timer-res':    'Timer resolution requires a persistent runtime process. The effect resets on process exit. Requires agent.',
  'desktop-comp': 'Desktop Window Manager cannot be disabled on Windows 10/11. This is a legacy Windows XP/Vista feature.',
  'hdcp':         'HDCP enforcement is controlled at hardware/driver level and cannot be reliably toggled via software.',
};

export const REAL_TWEAKS = [...HKCU_TWEAKS, ...ADMIN_TWEAKS];

export function isRealTweak(tweakId: string): boolean  { return REAL_TWEAKS.includes(tweakId); }
export function isUnsupportedTweak(tweakId: string): boolean { return tweakId in UNSUPPORTED_TWEAKS; }
export function isTierATweak(tweakId: string): boolean { return HKCU_TWEAKS.includes(tweakId); }
export function isTierBTweak(tweakId: string): boolean { return ADMIN_TWEAKS.includes(tweakId); }
export function isAdminTweak(tweakId: string): boolean { return ADMIN_TWEAKS.includes(tweakId); }

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

    try {
      const result: TweakResult = await getTweaksAPI().execute(tweakId, action);

      if (result.unsupported) {
        const t = FAILURE_TOAST.unsupported;
        toast({ title: t.title, description: result.message ?? t.description, variant: 'destructive' });
        return FAIL('unsupported', result.userMessage, result.hint);
      }

      // Detect UAC cancelled from the old path (no failureType) as well as the new path
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
        // Verification mismatch after backend reported success — edge case
        return FAIL('verification_failed', 'Setting Could Not Be Verified', 'The change was applied but the system state still reads as unchanged.');
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
