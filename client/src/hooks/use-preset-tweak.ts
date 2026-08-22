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

  const refresh = useCallback(async () => {
    // Always restore the user's last-applied option first — this survives app restarts
    // and any registry-read failure. The live read only updates currentOptionId for display.
    const cached = useStore.getState().presetOptions?.[tweakId] ?? null;

    if (!isElectron) {
      setState(s => ({
        ...s,
        currentOptionId: cached ?? config.defaultOptionId,
        pendingOptionId: s.pendingOptionId ?? cached ?? config.defaultOptionId,
        status:          'idle',
      }));
      return;
    }

    setState(s => ({ ...s, status: 'loading', lastError: null }));
    try {
      const api = getPresetAPI();
      if (!api?.getState) {
        // API missing — keep cached option, never fall back to default
        setState(s => ({
          ...s,
          currentOptionId: cached ?? config.defaultOptionId,
          pendingOptionId: s.pendingOptionId ?? cached ?? config.defaultOptionId,
          status:          'idle',
        }));
        return;
      }
      const result: { optionId: string | null; error: string | null } = await api.getState(tweakId);

      if (result.error && result.optionId === null) {
        const isBusy = result.error === 'busy';
        if (isBusy) {
          console.info(`[PresetHydration] ${tweakId}: read skipped — limiter busy (expected at startup)`);
          if (retryCountRef.current < 2) {
            retryCountRef.current += 1;
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              refresh();
            }, 3500);
          }
        } else {
          console.warn(`[PresetHydration] ${tweakId}: read failed — ${result.error}`);
        }
        // Keep cached option — the user's choice never gets overwritten by a default
        setState(s => ({
          ...s,
          currentOptionId: cached ?? config.defaultOptionId,
          pendingOptionId: s.pendingOptionId ?? cached ?? config.defaultOptionId,
          status:          'idle',
          lastError:       result.error,
        }));
      } else {
        const resolvedId = result.optionId ?? config.defaultOptionId;
        retryCountRef.current = 0;
        setPresetOption(tweakId, resolvedId);
        // currentOptionId shows the live registry state; pendingOptionId stays
        // locked to the user's cached choice so the UI never "jumps" on them.
        setState(s => ({
          ...s,
          currentOptionId: resolvedId,
          pendingOptionId: s.pendingOptionId ?? cached ?? resolvedId,
          status:          'idle',
          lastError:       null,
        }));
      }
    } catch (err) {
      // Any unexpected crash — keep cached option, never fall back to default
      const cached = useStore.getState().presetOptions?.[tweakId] ?? null;
      setState(s => ({
        ...s,
        currentOptionId: cached ?? config.defaultOptionId,
        pendingOptionId: s.pendingOptionId ?? cached ?? config.defaultOptionId,
        status:          'idle',
        lastError:       err instanceof Error ? err.message : 'Read failed',
      }));
    }
  }, [isElectron, tweakId, config.defaultOptionId]);

  useEffect(() => {
    refresh();
    return () => {
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
      const result: { ok: boolean; error: string | null } = await api.apply(tweakId, optionToApply);

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
        toast({ title: 'Profile Applied', description: `${label} applied and verified on your system.` });
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
      const result: { ok: boolean; optionId?: string; error: string | null } = await api.revert(tweakId);
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
        toast({ title: 'Reverted', description: 'Restored to previous profile.' });
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

  const isDirty = state.pendingOptionId !== null && state.pendingOptionId !== state.currentOptionId;

  return { state, isDirty, select, apply, revert, refresh, dismissResult };
}
