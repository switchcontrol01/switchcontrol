import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

interface TweakResult {
  success: boolean;
  requiresReboot: boolean;
  requiresAdmin: boolean;
  message: string | null;
  error: string | null;
}

interface TweakStatus {
  tweakId: string;
  applied: boolean;
  error: string | null;
}

interface LocalTweakState {
  appliedTweaks: Record<string, boolean>;
  lastSync: string | null;
  windowsBuild?: string;
}

interface TweakInfo {
  id: string;
  name: string;
  tier: string;
  requiresAdmin: boolean;
  requiresReboot: boolean;
}

const TIER_A_TWEAKS = [
  'gaming-mode',
  'notifications',
  'copilot',
  'cortana',
  'search-highlights',
  'storage-sense',
  'compact-explorer',
  'recent-files',
  'xbox-bar',
];

const TIER_B_TWEAKS = [
  'hibernation',
];

export function isTierATweak(tweakId: string): boolean {
  return TIER_A_TWEAKS.includes(tweakId);
}

export function isTierBTweak(tweakId: string): boolean {
  return TIER_B_TWEAKS.includes(tweakId);
}

export function isElectronWithTweaks(): boolean {
  const api = (window as any).electronAPI;
  return typeof window !== 'undefined' && !!api?.tweaks;
}

function getTweaksAPI() {
  return (window as any).electronAPI?.tweaks;
}

export function useTweakExecutor() {
  const { toast } = useToast();
  const [executing, setExecuting] = useState<string | null>(null);
  const [inProgress, setInProgress] = useState<Set<string>>(new Set());
  const [localState, setLocalState] = useState<LocalTweakState>({ appliedTweaks: {}, lastSync: null });

  useEffect(() => {
    if (isElectronWithTweaks()) {
      getTweaksAPI().getLocalState().then(setLocalState);
    }
  }, []);

  const executeTweak = useCallback(async (tweakId: string, currentlyEnabled: boolean): Promise<boolean> => {
    if (!isElectronWithTweaks()) {
      return true;
    }

    if (!isTierATweak(tweakId) && !isTierBTweak(tweakId)) {
      return true;
    }

    // Prevent double-clicks with inProgress lock
    if (inProgress.has(tweakId)) {
      console.log(`[TweakExecutor] ${tweakId} already in progress, ignoring`);
      return false;
    }

    setInProgress(prev => new Set(prev).add(tweakId));
    setExecuting(tweakId);
    const action = currentlyEnabled ? 'revert' : 'apply';

    try {
      console.log(`[TweakExecutor] Executing ${action} for ${tweakId}`);
      const result: TweakResult = await getTweaksAPI().execute(tweakId, action);
      
      if (result.requiresAdmin && !result.success) {
        toast({
          title: 'Admin Required',
          description: result.error || 'This tweak requires administrator privileges.',
          variant: 'destructive',
        });
        return false;
      }
      
      if (result.success) {
        // Re-check the actual status from the system to avoid flip-flop
        const verifiedStatus = await getTweaksAPI().checkStatus(tweakId);
        const actualState = verifiedStatus?.applied ?? (action === 'apply');
        
        console.log(`[TweakExecutor] ${tweakId} verified state: ${actualState}`);
        
        toast({
          title: action === 'apply' ? 'Tweak Applied' : 'Tweak Reverted',
          description: result.message || `Successfully ${action === 'apply' ? 'applied' : 'reverted'} tweak`,
          variant: 'default',
        });

        if (result.requiresReboot) {
          toast({
            title: 'Reboot Required',
            description: 'This change will take full effect after a system restart.',
            variant: 'default',
          });
        }

        // Update local state with verified result
        setLocalState(prev => ({
          ...prev,
          appliedTweaks: {
            ...prev.appliedTweaks,
            [tweakId]: actualState
          }
        }));

        return true;
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
      setInProgress(prev => {
        const next = new Set(prev);
        next.delete(tweakId);
        return next;
      });
    }
  }, [toast, inProgress]);

  const syncAllTweaks = useCallback(async () => {
    if (!isElectronWithTweaks()) {
      return {};
    }

    try {
      const results = await getTweaksAPI().syncAll();
      const state = await getTweaksAPI().getLocalState();
      setLocalState(state);
      return results;
    } catch (err) {
      console.error('Failed to sync tweaks:', err);
      return {};
    }
  }, []);

  const checkTweakStatus = useCallback(async (tweakId: string): Promise<boolean | null> => {
    if (!isElectronWithTweaks()) {
      return null;
    }

    try {
      const status: TweakStatus = await getTweaksAPI().checkStatus(tweakId);
      return status.error ? null : status.applied;
    } catch {
      return null;
    }
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
