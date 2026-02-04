import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

declare global {
  interface Window {
    tweaks?: {
      execute: (tweakId: string, action: 'apply' | 'revert') => Promise<TweakResult>;
      checkStatus: (tweakId: string) => Promise<TweakStatus>;
      syncAll: () => Promise<Record<string, TweakStatus>>;
      getLocalState: () => Promise<LocalTweakState>;
      getInfo: () => Promise<TweakInfo[]>;
    };
  }
}

interface TweakResult {
  success: boolean;
  requiresReboot: boolean;
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
}

interface TweakInfo {
  id: string;
  name: string;
  tier: string;
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
  'hibernation'
];

export function isTierATweak(tweakId: string): boolean {
  return TIER_A_TWEAKS.includes(tweakId);
}

export function isElectronWithTweaks(): boolean {
  return typeof window !== 'undefined' && !!window.tweaks;
}

export function useTweakExecutor() {
  const { toast } = useToast();
  const [executing, setExecuting] = useState<string | null>(null);
  const [localState, setLocalState] = useState<LocalTweakState>({ appliedTweaks: {}, lastSync: null });

  useEffect(() => {
    if (isElectronWithTweaks()) {
      window.tweaks!.getLocalState().then(setLocalState);
    }
  }, []);

  const executeTweak = useCallback(async (tweakId: string, currentlyEnabled: boolean): Promise<boolean> => {
    if (!isElectronWithTweaks()) {
      return true;
    }

    if (!isTierATweak(tweakId)) {
      return true;
    }

    setExecuting(tweakId);
    const action = currentlyEnabled ? 'revert' : 'apply';

    try {
      const result = await window.tweaks!.execute(tweakId, action);
      
      if (result.success) {
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

        setLocalState(prev => ({
          ...prev,
          appliedTweaks: {
            ...prev.appliedTweaks,
            [tweakId]: action === 'apply'
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
    }
  }, [toast]);

  const syncAllTweaks = useCallback(async () => {
    if (!isElectronWithTweaks()) {
      return {};
    }

    try {
      const results = await window.tweaks!.syncAll();
      const state = await window.tweaks!.getLocalState();
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
      const status = await window.tweaks!.checkStatus(tweakId);
      return status.error ? null : status.applied;
    } catch {
      return null;
    }
  }, []);

  return {
    executeTweak,
    syncAllTweaks,
    checkTweakStatus,
    executing,
    localState,
    isElectron: isElectronWithTweaks(),
    isTierA: isTierATweak,
  };
}
