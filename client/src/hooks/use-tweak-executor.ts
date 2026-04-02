import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

// ── Result / status shapes ──────────────────────────────────────────────────
export interface TweakResult {
  success: boolean;
  requiresReboot: boolean;
  requiresAdmin: boolean;
  unsupported?: boolean;
  verified?: boolean;
  cancelled?: boolean;
  wasElevated?: boolean;
  commandsRun: string[];
  message: string | null;
  error: string | null;
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

// ── Static tweak classification ─────────────────────────────────────────────
// HKCU tweaks — no admin needed
const HKCU_TWEAKS = [
  'gaming-mode',
  'notifications',
  'copilot',
  'cortana',
  'search-highlights',
  'storage-sense',
  'compact-explorer',
  'recent-files',
  'xbox-bar',
  'bg-apps',
];

// HKLM / service / bcdedit tweaks — require admin elevation
const ADMIN_TWEAKS = [
  'hibernation',
  'fast-startup',
  'energy-logging',
  'maintenance',
  'core-isolation',
  'vbs',
  'hyper-v',
  'large-system-cache',
  'page-combining',
  'prefetch',
  'superfetch',
  'mem-opt',
  'telemetry',
  'nvidia-telemetry',
  'tune-priority',
  'bluetooth',
  'wifi',
  'xbox-services',
  'fax-printer',
  'synth-timers',
  'preemption',
];

// Tweaks that cannot be reliably implemented — toggle disabled in UI
export const UNSUPPORTED_TWEAKS: Record<string, string> = {
  'p-states':      'Requires a runtime agent process for CPU P-state control. Cannot be applied persistently via registry.',
  'irq-priority':  'Requires kernel-level interrupt affinity control not accessible from user-mode.',
  'timer-res':     'Timer resolution requires a persistent runtime process. The effect resets on process exit. Requires agent.',
  'desktop-comp':  'Desktop Window Manager cannot be disabled on Windows 10/11. This is a legacy Windows XP/Vista feature.',
  'hdcp':          'HDCP enforcement is controlled at hardware/driver level and cannot be reliably toggled via software.',
};

export const REAL_TWEAKS = [...HKCU_TWEAKS, ...ADMIN_TWEAKS];

export function isRealTweak(tweakId: string): boolean {
  return REAL_TWEAKS.includes(tweakId);
}

export function isUnsupportedTweak(tweakId: string): boolean {
  return tweakId in UNSUPPORTED_TWEAKS;
}

/** @deprecated use isRealTweak */
export function isTierATweak(tweakId: string): boolean {
  return HKCU_TWEAKS.includes(tweakId);
}

export function isTierBTweak(tweakId: string): boolean {
  return ADMIN_TWEAKS.includes(tweakId);
}

export function isAdminTweak(tweakId: string): boolean {
  return ADMIN_TWEAKS.includes(tweakId);
}

export function isElectronWithTweaks(): boolean {
  const api = (window as any).electronAPI;
  return typeof window !== 'undefined' && !!api?.tweaks;
}

function getTweaksAPI() {
  return (window as any).electronAPI?.tweaks;
}

// ── Hook ────────────────────────────────────────────────────────────────────
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

  const executeTweak = useCallback(async (tweakId: string, currentlyEnabled: boolean): Promise<boolean> => {
    if (!isElectronWithTweaks()) return true;
    if (!isRealTweak(tweakId)) return true;
    if (inProgress.has(tweakId)) return false;

    setInProgress(prev => new Set(prev).add(tweakId));
    setExecuting(tweakId);
    const action = currentlyEnabled ? 'revert' : 'apply';

    try {
      const result: TweakResult = await getTweaksAPI().execute(tweakId, action);

      if (result.unsupported) {
        toast({
          title: 'Not Supported',
          description: result.message || 'This tweak cannot be implemented on modern Windows.',
          variant: 'destructive',
        });
        return false;
      }

      if (result.cancelled) {
        toast({
          title: 'Elevation Cancelled',
          description: 'Accept the UAC prompt to apply this tweak.',
        });
        return false;
      }

      if (result.requiresAdmin && !result.success) {
        toast({
          title: 'Elevation Failed',
          description: result.error || 'Could not obtain administrator privileges.',
          variant: 'destructive',
        });
        return false;
      }

      if (result.success) {
        // Re-verify actual system state to get ground truth
        const status: TweakStatus = await getTweaksAPI().checkStatus(tweakId);
        const actualState = status?.isApplied ?? (action === 'apply');

        toast({
          title: action === 'apply' ? 'Tweak Applied' : 'Tweak Reverted',
          description: result.message || `Successfully ${action === 'apply' ? 'applied' : 'reverted'}`,
        });

        if (result.requiresReboot) {
          toast({
            title: 'Restart Required',
            description: 'This change will take full effect after a system restart.',
          });
        }

        setLocalState(prev => ({
          ...prev,
          appliedTweaks: { ...prev.appliedTweaks, [tweakId]: actualState },
        }));

        return actualState === (action === 'apply');
      } else {
        toast({
          title: 'Tweak Failed',
          description: result.error || 'An unknown error occurred',
          variant: 'destructive',
        });
        return false;
      }
    } catch (err) {
      toast({
        title: 'Execution Error',
        description: err instanceof Error ? err.message : 'Failed to execute tweak',
        variant: 'destructive',
      });
      return false;
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
    try {
      return await getTweaksAPI().checkStatus(tweakId);
    } catch { return null; }
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
