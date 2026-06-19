import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { isElectronWithTweaks } from '@/hooks/use-tweak-executor';
import { SliderConfig, SliderPreset } from '@/lib/mock-data';
import { useStore } from '@/lib/store';

function getSliderAPI() {
  return (window as any).electronAPI?.tweaks;
}

export type SliderStatus = 'idle' | 'loading' | 'applying' | 'resetting' | 'verified' | 'failed';

export interface SliderVerifyResult {
  ok: boolean;
  actualValue: number | null;
  error: string | null;
}

export interface SliderTweakState {
  /** Current value as read from the system (null = not yet loaded) */
  currentValue: number | null;
  /** Value the user has set on the slider but not yet applied */
  pendingValue: number | null;
  /** Value before the last apply (enables session-level revert) */
  previousValue: number | null;
  /** Whether the key was missing from registry (using default) */
  isUsingDefault: boolean;
  status: SliderStatus;
  verifyResult: SliderVerifyResult | null;
  lastError: string | null;
}

export interface SliderTweakActions {
  setPending: (value: number) => void;
  apply: () => Promise<void>;
  reset: () => Promise<void>;
  revert: () => Promise<void>;
  refresh: () => Promise<void>;
  dismissResult: () => void;
}

/**
 * Resolves the actual registry value from a slider position.
 * For stepped sliders, the `pendingValue` IS already the registry value
 * (selected from presets). For continuous sliders it's the direct number.
 */
export function resolveSliderValue(
  sliderPosition: number,
  config: SliderConfig,
): number {
  if (config.stepped && config.presets && config.presets.length > 0) {
    const idx = Math.min(Math.max(Math.round(sliderPosition), 0), config.presets.length - 1);
    return config.presets[idx].value;
  }
  return sliderPosition;
}

/**
 * Resolves a raw registry value back to a slider position index.
 * For stepped sliders, finds the closest preset index.
 */
export function valueToSliderPos(
  registryValue: number,
  config: SliderConfig,
): number {
  if (config.stepped && config.presets && config.presets.length > 0) {
    const idx = config.presets.findIndex(p => p.value === registryValue);
    return idx >= 0 ? idx : 0;
  }
  return registryValue;
}

/**
 * Returns the label string for a given registry value using config presets.
 */
export function getPresetLabel(value: number, config: SliderConfig): string {
  if (config.presets) {
    const p = config.presets.find(x => x.value === value);
    if (p) return p.label;
  }
  return String(value);
}

/**
 * Returns the preset object for a registry value (for stepped sliders).
 */
export function getPreset(value: number, config: SliderConfig): SliderPreset | undefined {
  return config.presets?.find(p => p.value === value);
}

/**
 * Hook that manages slider tweak state: reading, applying, verifying, resetting, reverting.
 */
export function useSliderTweak(tweakId: string, config: SliderConfig) {
  const { toast } = useToast();
  const isElectron = isElectronWithTweaks();
  const setSliderValue = useStore((s) => s.setSliderValue);
  // Read the cached value once at mount — use it as the initial pendingValue so
  // the UI shows the last-applied setting immediately, even before the registry
  // read completes (or if it fails due to a busy PowerShell limiter at startup).
  const cachedValue = useStore.getState().sliderValues[tweakId] ?? null;

  const [state, setState] = useState<SliderTweakState>({
    currentValue:   null,
    pendingValue:   cachedValue,   // restored from localStorage — shown instantly
    previousValue:  null,
    isUsingDefault: cachedValue === null,
    status:         'loading',
    verifyResult:   null,
    lastError:      null,
  });

  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResultTimer = useCallback(() => {
    if (resultTimerRef.current) {
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }, []);

  // Auto-dismiss verify result after 6 seconds
  const scheduleResultDismiss = useCallback(() => {
    clearResultTimer();
    resultTimerRef.current = setTimeout(() => {
      setState(s => ({ ...s, verifyResult: null }));
    }, 6000);
  }, [clearResultTimer]);

  // Read current value from system on mount (Electron only)
  const refresh = useCallback(async () => {
    if (!isElectron) {
      setState(s => ({
        ...s,
        currentValue:   config.defaultValue,
        pendingValue:   s.pendingValue ?? config.defaultValue,
        isUsingDefault: true,
        status:         'idle',
      }));
      return;
    }

    setState(s => ({ ...s, status: 'loading', lastError: null }));
    try {
      const api = getSliderAPI();
      if (!api?.readValue) {
        setState(s => ({
          ...s,
          currentValue:   config.defaultValue,
          pendingValue:   s.pendingValue ?? config.defaultValue,
          isUsingDefault: true,
          status:         'idle',
        }));
        return;
      }
      const result: { value: number | null; missing?: boolean; error: string | null } =
        await api.readValue(tweakId);

      // Real read error: PowerShell timed out, access denied, or other failure.
      // value is null AND error is set. Do NOT silently substitute the default —
      // the default might not reflect what's actually in the registry (or what was
      // previously applied). Keep currentValue null so the UI shows "—" not a fake value.
      if (result.error && result.value === null) {
        // "busy" is an expected startup race (PS limiter occupied by syncAll) — demote to info
        // so it doesn't surface as [ERROR] in the main-process log.
        const isBusy = result.error === "busy";
        if (isBusy) {
          console.info(`[SliderHydration] ${tweakId}: read skipped — limiter busy (expected at startup)`);
        } else {
          console.warn(`[SliderHydration] ${tweakId}: read failed — ${result.error}`);
        }
        // Fall back to cached value from localStorage (set by a previous successful apply/read).
        // Never use config.defaultValue here — the user may have applied a non-default value.
        const cached = useStore.getState().sliderValues[tweakId] ?? null;
        setState(s => ({
          ...s,
          currentValue:   null,
          pendingValue:   s.pendingValue ?? cached ?? config.defaultValue,
          isUsingDefault: cached === null,
          status:         'idle',
          lastError:      result.error,
        }));
      } else if (result.value === null) {
        // value is null but no error — shouldn't occur after executor fix, but handle gracefully
        setState(s => ({
          ...s,
          currentValue:   config.defaultValue,
          pendingValue:   s.pendingValue ?? config.defaultValue,
          isUsingDefault: true,
          status:         'idle',
          lastError:      null,
        }));
      } else {
        // Successful read: value is the live registry value.
        // missing=true means the key didn't exist and the executor returned the built-in default.
        console.log(`[SliderHydration] ${tweakId}: value=${result.value} missing=${result.missing ?? false}`);
        // Persist the live registry value so future startups can use it as a fallback.
        setSliderValue(tweakId, result.value!);
        setState(s => ({
          ...s,
          currentValue:   result.value!,
          pendingValue:   s.pendingValue ?? result.value!,
          isUsingDefault: result.missing ?? false,
          status:         'idle',
          lastError:      null,
        }));
      }
    } catch (err) {
      setState(s => ({
        ...s,
        currentValue:   config.defaultValue,
        pendingValue:   s.pendingValue ?? config.defaultValue,
        isUsingDefault: true,
        status:         'idle',
        lastError:      err instanceof Error ? err.message : 'Read failed',
      }));
    }
  }, [isElectron, tweakId, config.defaultValue]);

  useEffect(() => {
    refresh();
    return () => clearResultTimer();
  }, [refresh, clearResultTimer]);

  const setPending = useCallback((value: number) => {
    setState(s => ({ ...s, pendingValue: value, verifyResult: null }));
    clearResultTimer();
  }, [clearResultTimer]);

  const apply = useCallback(async () => {
    if (state.pendingValue === null) return;
    const valueToApply = state.pendingValue;

    setState(s => ({ ...s, status: 'applying', verifyResult: null, lastError: null }));

    if (!isElectron) {
      // Browser mode — just update state
      setState(s => ({
        ...s,
        previousValue: s.currentValue,
        currentValue:  valueToApply,
        status:        'verified',
        verifyResult:  { ok: true, actualValue: valueToApply, error: null },
      }));
      scheduleResultDismiss();
      return;
    }

    try {
      const api = getSliderAPI();
      const result: { ok: boolean; verified: boolean; actualValue: number | null; error: string | null } =
        await api.applyValue(tweakId, valueToApply);

      if (result.ok && result.verified) {
        const confirmedValue = result.actualValue ?? valueToApply;
        // Persist confirmed value — survives app restarts and busy-limiter fallback.
        setSliderValue(tweakId, confirmedValue);
        setState(s => ({
          ...s,
          previousValue: s.currentValue,
          currentValue:  confirmedValue,
          status:        'verified',
          verifyResult:  { ok: true, actualValue: result.actualValue, error: null },
          lastError:     null,
        }));
        toast({
          title:       'Setting Applied',
          description: `Value set to ${valueToApply} and verified on your system.`,
        });
        scheduleResultDismiss();
      } else {
        setState(s => ({
          ...s,
          status:       'failed',
          verifyResult: { ok: false, actualValue: result.actualValue, error: result.error },
          lastError:    result.error,
        }));
        toast({ title: 'Apply Failed', description: result.error ?? 'Value could not be applied.', variant: 'destructive' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      setState(s => ({ ...s, status: 'failed', lastError: msg }));
      toast({ title: 'Apply Failed', description: msg, variant: 'destructive' });
    }
  }, [isElectron, tweakId, state.pendingValue, toast, scheduleResultDismiss]);

  const reset = useCallback(async () => {
    setState(s => ({ ...s, status: 'resetting', verifyResult: null, lastError: null }));

    if (!isElectron) {
      setState(s => ({
        ...s,
        previousValue: s.currentValue,
        currentValue:  config.defaultValue,
        pendingValue:  config.defaultValue,
        status:        'verified',
        verifyResult:  { ok: true, actualValue: config.defaultValue, error: null },
      }));
      scheduleResultDismiss();
      return;
    }

    try {
      const api = getSliderAPI();
      const result: { ok: boolean; verified: boolean; actualValue: number | null; error: string | null } =
        await api.resetValue(tweakId);

      if (result.ok) {
        const resetValue = result.actualValue ?? config.defaultValue;
        // Persist the reset-to-default value so next startup shows default, not old applied value.
        setSliderValue(tweakId, resetValue);
        setState(s => ({
          ...s,
          previousValue: s.currentValue,
          currentValue:  resetValue,
          pendingValue:  resetValue,
          status:        'verified',
          verifyResult:  { ok: true, actualValue: result.actualValue, error: null },
          lastError:     null,
        }));
        toast({ title: 'Reset to Default', description: `Restored to system default (${config.defaultValue}).` });
        scheduleResultDismiss();
      } else {
        setState(s => ({ ...s, status: 'failed', lastError: result.error }));
        toast({ title: 'Reset Failed', description: result.error ?? 'Could not reset.', variant: 'destructive' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reset failed';
      setState(s => ({ ...s, status: 'failed', lastError: msg }));
      toast({ title: 'Reset Failed', description: msg, variant: 'destructive' });
    }
  }, [isElectron, tweakId, config.defaultValue, toast, scheduleResultDismiss]);

  const revert = useCallback(async () => {
    if (state.previousValue === null) return;
    setState(s => ({ ...s, pendingValue: s.previousValue, verifyResult: null }));
    // Apply the previous value
    const prevVal = state.previousValue;
    setState(s => ({ ...s, status: 'applying', lastError: null }));

    if (!isElectron) {
      setState(s => ({
        ...s,
        currentValue:  prevVal,
        pendingValue:  prevVal,
        previousValue: null,
        status:        'verified',
        verifyResult:  { ok: true, actualValue: prevVal, error: null },
      }));
      scheduleResultDismiss();
      return;
    }

    try {
      const api = getSliderAPI();
      const result = await api.applyValue(tweakId, prevVal);
      if (result.ok) {
        setState(s => ({
          ...s,
          currentValue:  result.actualValue ?? prevVal,
          pendingValue:  result.actualValue ?? prevVal,
          previousValue: null,
          status:        'verified',
          verifyResult:  { ok: true, actualValue: result.actualValue, error: null },
          lastError:     null,
        }));
        toast({ title: 'Reverted', description: `Value reverted to ${prevVal}.` });
        scheduleResultDismiss();
      } else {
        setState(s => ({ ...s, status: 'failed', lastError: result.error }));
        toast({ title: 'Revert Failed', description: result.error ?? 'Could not revert.', variant: 'destructive' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Revert failed';
      setState(s => ({ ...s, status: 'failed', lastError: msg }));
    }
  }, [isElectron, tweakId, state.previousValue, toast, scheduleResultDismiss]);

  const dismissResult = useCallback(() => {
    clearResultTimer();
    setState(s => ({ ...s, verifyResult: null, status: s.status === 'verified' || s.status === 'failed' ? 'idle' : s.status }));
  }, [clearResultTimer]);

  const isDirty = state.pendingValue !== null && state.pendingValue !== state.currentValue;

  return { state, isDirty, setPending, apply, reset, revert, refresh, dismissResult };
}
