import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { isElectronWithTweaks } from '@/hooks/use-tweak-executor';
import { PresetConfig, PresetOption } from '@/lib/tweak-registry';
import { useStore } from '@/lib/store';
import { logHistory } from '@/lib/logHistory';

function getPresetAPI() {
  return (window as any).electronAPI?.presetTweaks;
}

export type PresetStatus = 'idle' | 'loading' | 'applying' | 'reverting' | 'verified' | 'failed';

export interface PresetVerifyResult {
  ok: boolean;
  error: string | null;
}

export interface PresetTweakState {
  /** Currently active option id as read from the system (null = not yet loaded) */
  currentOptionId: string | null;
  /** Option the user has selected but not yet applied */
  pendingOptionId: string | null;
  /** Option before the last apply (enables session-level revert) */
  previousOptionId: string | null;
  status: PresetStatus;
  verifyResult: PresetVerifyResult | null;
  lastError: string | null;
}

export interface PresetTweakActions {
  select: (optionId: string) => void;
  apply: () => Promise<void>;
  revert: () => Promise<void>;
  refresh: () => Promise<void>;
  dismissResult: () => void;
}

const MAX_BUSY_READ_RETRIES = 6;

export function getPresetOption(optionId: string | null, config: PresetConfig): PresetOption | undefined {
  if (optionId === null) return undefined;
  return config.options.find(o => o.id === optionId);
}

/**
 * Hook that manages preset-profile tweak state: reading, applying, reverting.
 * Mirrors useSliderTweak but keys on a string optionId rather than a numeric value.
 */
export function usePresetTweak(tweakId: string, config: PresetConfig) {
  const { toast } = useToast();
  const isElectron = isElectronWithTweaks();
  const setPresetOption = useStore((s) => s.setPresetOption);
  const cachedOptionId = useStore.getState().presetOptions?.[tweakId] ?? null;

  const [state, setState] = useState<PresetTweakState>({
    currentOptionId:  null,
    pendingOptionId:  cachedOptionId,
    previousOptionId: null,
    status:           'loading',
    verifyResult:     null,
    lastError:        null,
  });

  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef  = useRef(0);

  const clearResultTimer = useCallback(() => {
    if (resultTimerRef.current) {
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }, []);

  const scheduleResultDismiss = useCallback(() => {
    clearResultTimer();
    resultTimerRef.current = setTimeout(() => {
      setState(s => ({ ...s, verifyResult: null }));
    }, 6000);
  }, [clearResultTimer]);

  const refresh = useCallback(async (scheduledRetry = false) => {
    if (!scheduledRetry) retryCountRef.current = 0;
    // Always restore the user's last-applied option first — this survives app restarts
    // as the pending selection. Only a successful Windows read may set currentOptionId.
    const cached = useStore.getState().presetOptions?.[tweakId] ?? null;

    if (!isElectron) {
      setState(s => ({
        ...s,
        currentOptionId: null,
        pendingOptionId: s.pendingOptionId ?? cached ?? config.defaultOptionId,
        status:          'idle',
      }));
      return;
    }

    setState(s => ({ ...s, status: 'loading', lastError: null }));
    try {
      const api = getPresetAPI();
      if (!api?.getState) {
        // API missing — preserve the selection, but do not claim a system read.
        setState(s => ({
          ...s,
          currentOptionId: s.currentOptionId,
          pendingOptionId: s.pendingOptionId ?? cached ?? config.defaultOptionId,
          status:          'idle',
          lastError:       'The Windows preset reader is unavailable.',
        }));
        return;
      }
      const result: { optionId: string | null; error: string | null } = await api.getState(tweakId);

      if (result.error === 'busy' && result.optionId === null) {
        console.info(`[PresetHydration] ${tweakId}: Windows read busy; retry ${retryCountRef.current + 1}/${MAX_BUSY_READ_RETRIES}`);
        if (retryCountRef.current < MAX_BUSY_READ_RETRIES) {
          const attempt = retryCountRef.current++;
          const delayMs = Math.min(1500 * (2 ** attempt), 8000);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            void refresh(true);
          }, delayMs);
          setState(s => ({
            ...s,
            currentOptionId: s.currentOptionId,
            pendingOptionId: s.pendingOptionId ?? cached ?? config.defaultOptionId,
            status:          'loading',
            lastError:       null,
          }));
          return;
        }

        const message = 'Windows is still busy; the current profile was not verified. Retry the read before applying.';
        console.warn(`[PresetHydration] ${tweakId}: ${message}`);
        setState(s => ({
          ...s,
          currentOptionId: s.currentOptionId,
          pendingOptionId: s.pendingOptionId ?? cached ?? config.defaultOptionId,
          status:          'idle',
          lastError:       message,
        }));
        return;
      }

      if (result.error || result.optionId === null) {
        const message = result.error ?? 'Windows returned an unrecognized preset value.';
        console.warn(`[PresetHydration] ${tweakId}: read failed — ${message}`);
        setState(s => ({
          ...s,
          currentOptionId: s.currentOptionId,
          pendingOptionId: s.pendingOptionId ?? cached ?? config.defaultOptionId,
          status:          'idle',
          lastError:       message,
        }));
        return;
      }

      const resolvedId = result.optionId;
      retryCountRef.current = 0;
      setPresetOption(tweakId, resolvedId);
      // The current row is live Windows readback; the pending choice preserves
      // the last user-applied option until they explicitly select something else.
      setState(s => ({
        ...s,
        currentOptionId: resolvedId,
        pendingOptionId: s.pendingOptionId ?? cached ?? resolvedId,
        status:          'idle',
        lastError:       null,
      }));
    } catch (err) {
      // A failed read is unknown state, not proof that the Windows default is active.
      const cached = useStore.getState().presetOptions?.[tweakId] ?? null;
      const message = err instanceof Error ? err.message : 'Read failed';
      setState(s => ({
        ...s,
        currentOptionId: s.currentOptionId,
        pendingOptionId: s.pendingOptionId ?? cached ?? config.defaultOptionId,
        status:          'idle',
        lastError:       message,
      }));
    }
  }, [isElectron, tweakId, config.defaultOptionId]);

  useEffect(() => {
    refresh();
    const handlePresetRecovery = (event: Event) => {
      const changedTweakId = (event as CustomEvent<{ tweakId?: string }>).detail?.tweakId;
      if (!changedTweakId || changedTweakId === tweakId) void refresh();
    };
    window.addEventListener('sc:preset-state-changed', handlePresetRecovery);
    return () => {
      window.removeEventListener('sc:preset-state-changed', handlePresetRecovery);
      clearResultTimer();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [refresh, clearResultTimer]);

  const select = useCallback((optionId: string) => {
    setState(s => ({ ...s, pendingOptionId: optionId, verifyResult: null }));
    clearResultTimer();
  }, [clearResultTimer]);

  const apply = useCallback(async () => {
    if (state.pendingOptionId === null) return;
    const optionToApply = state.pendingOptionId;

    setState(s => ({ ...s, status: 'applying', verifyResult: null, lastError: null }));

    if (!isElectron) {
      setState(s => ({
        ...s,
        previousOptionId: s.previousOptionId,
        status:           'failed',
        verifyResult:     { ok: false, error: 'Preset verification is unavailable outside the desktop app.' },
        lastError:        'Preset verification is unavailable outside the desktop app.',
      }));
      scheduleResultDismiss();
      return;
    }

    try {
      const api = getPresetAPI();
      if (!api?.apply || !api?.getState) throw new Error('Preset verification is unavailable.');
      const result: { ok: boolean; error: string | null; persisted?: boolean } = await api.apply(tweakId, optionToApply);

      if (result.ok) {
        const readback = await api.getState(tweakId);
        if (readback.error || readback.optionId !== optionToApply) {
          const msg = readback.error ?? `Read-back returned ${readback.optionId ?? 'no preset'} instead of ${optionToApply}.`;
          setState(s => ({ ...s, status: 'failed', verifyResult: { ok: false, error: msg }, lastError: msg }));
          toast({ title: 'Apply Unverified', description: msg, variant: 'destructive' });
          return;
        }
        const restoreOptionId = state.currentOptionId;
        setPresetOption(tweakId, readback.optionId);
        setState(s => ({
          ...s,
          previousOptionId: s.currentOptionId,
          currentOptionId:  optionToApply,
          status:           'verified',
          verifyResult:     { ok: true, error: null },
          lastError:        null,
        }));
        const label = config.options.find(o => o.id === optionToApply)?.label ?? optionToApply;
        toast({
          title: result.persisted === false ? 'Profile Applied, Restart Restore Not Saved' : 'Profile Applied',
          description: result.persisted === false
            ? `${label} is active and verified, but SwitchControl could not save it for automatic restoration after a restart.`
            : `${label} applied and verified on your system.`,
          variant: result.persisted === false ? 'destructive' : undefined,
        });
        logHistory(`Preset: ${label}`, "Tweaks", "Applied", `Tweak ID: ${tweakId} | Option: ${optionToApply}`, {
          category: "preset", targetId: tweakId, restoreValue: restoreOptionId, reversible: restoreOptionId !== null,
          reason: restoreOptionId === null ? "No prior preset value was available." : undefined,
        });
        scheduleResultDismiss();
      } else {
        setState(s => ({
          ...s,
          status:       'failed',
          verifyResult: { ok: false, error: result.error },
          lastError:    result.error,
        }));
        toast({ title: 'Apply Failed', description: result.error ?? 'Profile could not be applied.', variant: 'destructive' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      setState(s => ({ ...s, status: 'failed', lastError: msg }));
      toast({ title: 'Apply Failed', description: msg, variant: 'destructive' });
    }
  }, [isElectron, tweakId, state.pendingOptionId, toast, scheduleResultDismiss, config.options, setPresetOption]);

  const revert = useCallback(async () => {
    setState(s => ({ ...s, status: 'reverting', verifyResult: null, lastError: null }));

    if (!isElectron) {
      setState(s => ({
        ...s,
        previousOptionId: s.previousOptionId,
        status:           'failed',
        verifyResult:     { ok: false, error: 'Preset verification is unavailable outside the desktop app.' },
        lastError:        'Preset verification is unavailable outside the desktop app.',
      }));
      scheduleResultDismiss();
      return;
    }

    try {
      const api = getPresetAPI();
      if (!api?.revert || !api?.getState) throw new Error('Preset verification is unavailable.');
      const result: { ok: boolean; optionId?: string; error: string | null; persisted?: boolean } = await api.revert(tweakId);
      if (result.ok) {
        const resetId = result.optionId ?? config.defaultOptionId;
        const readback = await api.getState(tweakId);
        if (readback.error || readback.optionId !== resetId) {
          const msg = readback.error ?? `Read-back returned ${readback.optionId ?? 'no preset'} instead of ${resetId}.`;
          setState(s => ({ ...s, status: 'failed', verifyResult: { ok: false, error: msg }, lastError: msg }));
          toast({ title: 'Revert Unverified', description: msg, variant: 'destructive' });
          return;
        }
        setPresetOption(tweakId, readback.optionId);
        setState(s => ({
          ...s,
          currentOptionId:  resetId,
          pendingOptionId:  resetId,
          previousOptionId: null,
          status:           'verified',
          verifyResult:     { ok: true, error: null },
          lastError:        null,
        }));
        toast({
          title: result.persisted === false ? 'Reverted, Restore State Not Saved' : 'Reverted',
          description: result.persisted === false
            ? 'Windows restored the previous profile, but SwitchControl could not clear the saved startup target.'
            : 'Restored to previous profile.',
          variant: result.persisted === false ? 'destructive' : undefined,
        });
        scheduleResultDismiss();
      } else {
        setState(s => ({ ...s, status: 'failed', lastError: result.error }));
        toast({ title: 'Revert Failed', description: result.error ?? 'Could not revert.', variant: 'destructive' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Revert failed';
      setState(s => ({ ...s, status: 'failed', lastError: msg }));
      toast({ title: 'Revert Failed', description: msg, variant: 'destructive' });
    }
  }, [isElectron, tweakId, config.defaultOptionId, toast, scheduleResultDismiss, setPresetOption]);

  const dismissResult = useCallback(() => {
    clearResultTimer();
    setState(s => ({ ...s, verifyResult: null, status: s.status === 'verified' || s.status === 'failed' ? 'idle' : s.status }));
  }, [clearResultTimer]);

  const isDirty = state.currentOptionId !== null &&
    state.pendingOptionId !== null &&
    state.pendingOptionId !== state.currentOptionId;

  const retryRead = useCallback(() => refresh(), [refresh]);

  return { state, isDirty, select, apply, revert, refresh: retryRead, dismissResult };
}
