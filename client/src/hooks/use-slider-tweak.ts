import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { isElectronWithTweaks } from '@/hooks/use-tweak-executor';
import { SliderConfig, SliderPreset } from '@/lib/mock-data';
import { useStore } from '@/lib/store';
import { logHistory } from '@/lib/logHistory';
import { isSliderDirty } from '@/lib/slider-state';

// ── Cross-tweak sync constants ────────────────────────────────────────────────
// timer-res (toggle) and timer-resolution-slider (slider) both control the same
// Windows NtSetTimerResolution call.  When either is applied/reverted we mirror
// the change into the other's Zustand slot so every UI surface stays consistent.
const TIMER_SLIDER_ID  = 'timer-resolution-slider';
const TIMER_TOGGLE_ID  = 'timer-res';
const TIMER_SLIDER_DEFAULT = 156;   // 15.6ms — "using default" sentinel

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
  const setTweak       = useStore((s) => s.setTweak);
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
  const retryTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef  = useRef(0);
  // A user drag is never overwritten by a late hydration response. Once the
  // native read confirms the registry, however, the confirmed value replaces
  // the cached pending value and becomes the source for both surfaces.
  const pendingTouchedRef = useRef(false);

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
    // Always restore the user's last-applied value first — this survives app restarts,
    // PowerShell failures, and any other read problems. The registry read only updates
    // currentValue for display; pendingValue (the user's choice) never gets overwritten.
    const cached = useStore.getState().sliderValues[tweakId] ?? null;

    if (!isElectron) {
      setState(s => ({
        ...s,
        currentValue:   config.defaultValue,
        pendingValue:   s.pendingValue ?? cached ?? config.defaultValue,
        isUsingDefault: cached === null,
        status:         'idle',
      }));
      return;
    }

    setState(s => ({ ...s, status: 'loading', lastError: null }));
    try {
      const api = getSliderAPI();
      if (!api?.readValue) {
        // API missing (e.g. web mode) — keep cached value, never fall back to default
        setState(s => ({
          ...s,
          currentValue:   cached ?? null,
          pendingValue:   s.pendingValue ?? cached ?? config.defaultValue,
          isUsingDefault: cached === null,
          status:         'idle',
        }));
        return;
      }
      const result: { value: number | null; missing?: boolean; error: string | null } =
        await api.readValue(tweakId);

      if (result.error && result.value === null) {
        const isBusy = result.error === "busy";
        if (isBusy) {
          console.info(`[SliderHydration] ${tweakId}: read skipped — limiter busy (expected at startup)`);
          if (retryCountRef.current < 2) {
            retryCountRef.current += 1;
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              refresh();
            }, 3500);
          }
        } else {
          console.warn(`[SliderHydration] ${tweakId}: read failed — ${result.error}`);
        }
        // Keep cached value — never fall back to default. The user chose this value.
        setState(s => ({
          ...s,
          currentValue:   cached ?? null,
          pendingValue:   s.pendingValue ?? cached ?? config.defaultValue,
          isUsingDefault: cached === null,
          status:         'idle',
          lastError:      result.error,
        }));
      } else if (result.value === null) {
        // value null but no error — shouldn't occur, but keep cached value
        setState(s => ({
          ...s,
          currentValue:   cached ?? null,
          pendingValue:   s.pendingValue ?? cached ?? config.defaultValue,
          isUsingDefault: cached === null,
          status:         'idle',
          lastError:      null,
        }));
      } else {
        // Successful native reads are authoritative over persisted session
        // cache. Preserve only an active user edit that happened while the
        // read was in flight.
        console.log(`[SliderHydration] ${tweakId}: value=${result.value} missing=${result.missing ?? false}`);
        retryCountRef.current = 0;
        const confirmedValue = result.value!;
        setSliderValue(tweakId, confirmedValue);
        if (tweakId === 'net-throttle-index') {
          setTweak('tcp-throttling-index', confirmedValue === 4294967295);
          window.dispatchEvent(new CustomEvent('sc:slider-state-changed', {
            detail: { sliderId: tweakId, value: confirmedValue },
          }));
        }
        setState(s => ({
          ...s,
          currentValue:   confirmedValue,
          pendingValue:   pendingTouchedRef.current ? s.pendingValue : confirmedValue,
          isUsingDefault: result.missing ?? false,
          status:         'idle',
          lastError:      null,
        }));
      }
    } catch (err) {
      // Any unexpected crash — keep cached value, never fall back to default
      const cached = useStore.getState().sliderValues[tweakId] ?? null;
      setState(s => ({
        ...s,
        currentValue:   cached ?? null,
        pendingValue:   s.pendingValue ?? cached ?? config.defaultValue,
        isUsingDefault: cached === null,
        status:         'idle',
        lastError:      err instanceof Error ? err.message : 'Read failed',
      }));
    }
  }, [isElectron, tweakId, config.defaultValue]);

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

  // Network Tweaks and Slider Tweaks are two views of the same registry value.
  // Adopt a value that was already verified by the other surface instead of
  // waiting for a remount or leaving this card showing a stale "unapplied"
  // pending state.
  useEffect(() => {
    const handleExternalSync = (event: Event) => {
      const detail = (event as CustomEvent<{ sliderId?: string; value?: number }>).detail;
      if (detail?.sliderId !== tweakId || typeof detail.value !== "number" || !Number.isFinite(detail.value)) return;
      const value = detail.value;
      pendingTouchedRef.current = false;
      setSliderValue(tweakId, value);
      setState(s => ({
        ...s,
        currentValue: value,
        pendingValue: value,
        isUsingDefault: value === config.defaultValue,
        status: 'idle',
        verifyResult: null,
        lastError: null,
      }));
    };
    window.addEventListener('sc:slider-state-changed', handleExternalSync);
    return () => window.removeEventListener('sc:slider-state-changed', handleExternalSync);
  }, [config.defaultValue, setSliderValue, tweakId]);

  const setPending = useCallback((value: number) => {
    pendingTouchedRef.current = true;
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
        previousValue: s.previousValue,
        status:        'failed',
        verifyResult:  { ok: false, actualValue: null, error: 'Slider verification is unavailable outside the desktop app.' },
        lastError:     'Slider verification is unavailable outside the desktop app.',
      }));
      scheduleResultDismiss();
      return;
    }

    try {
      const api = getSliderAPI();
      if (!api?.applyValue || !api?.readValue) throw new Error('Slider verification is unavailable.');
      const result: { ok: boolean; verified: boolean; actualValue: number | null; error: string | null } =
        await api.applyValue(tweakId, valueToApply);

      if (result.ok && result.verified) {
        const readback = await api.readValue(tweakId);
        if (readback.error || readback.value !== result.actualValue) {
          const msg = readback.error ?? `Read-back returned ${readback.value ?? 'no value'} instead of ${result.actualValue ?? valueToApply}.`;
          setState(s => ({ ...s, status: 'failed', verifyResult: { ok: false, actualValue: readback.value, error: msg }, lastError: msg }));
          toast({ title: 'Apply Unverified', description: msg, variant: 'destructive' });
          return;
        }
        const confirmedValue = result.actualValue ?? valueToApply;
        const restoreValue = state.currentValue;
        pendingTouchedRef.current = false;
        // Persist confirmed value — survives app restarts and busy-limiter fallback.
        setSliderValue(tweakId, confirmedValue);
        if (tweakId === 'net-throttle-index') {
          // The Network Tweaks toggle is the boolean view of this slider:
          // 0xFFFFFFFF means throttling disabled, while all other values mean
          // the Windows throttling limit is active.
          setTweak('tcp-throttling-index', confirmedValue === 4294967295);
          window.dispatchEvent(new CustomEvent('sc:slider-state-changed', {
            detail: { sliderId: tweakId, value: confirmedValue },
          }));
        }
        // Cross-state: keep the timer-res toggle in sync so its card + detected
        // issues reflect the real system state regardless of which surface was used.
        if (tweakId === TIMER_SLIDER_ID) {
          setTweak(TIMER_TOGGLE_ID, confirmedValue < TIMER_SLIDER_DEFAULT);
          window.dispatchEvent(new CustomEvent('sc:timer-toggle-state-changed', {
            detail: { enabled: confirmedValue < TIMER_SLIDER_DEFAULT },
          }));
        }
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
        logHistory(`Slider: ${tweakId}`, "Tweaks", "Applied", `Tweak ID: ${tweakId} | Value: ${confirmedValue}`, {
          category: "slider", targetId: tweakId, restoreValue, reversible: restoreValue !== null,
          reason: restoreValue === null ? "No prior slider value was available." : undefined,
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
        previousValue: s.previousValue,
        status:        'failed',
        verifyResult:  { ok: false, actualValue: null, error: 'Slider verification is unavailable outside the desktop app.' },
        lastError:     'Slider verification is unavailable outside the desktop app.',
      }));
      scheduleResultDismiss();
      return;
    }

    try {
      const api = getSliderAPI();
      const result: { ok: boolean; verified: boolean; actualValue: number | null; error: string | null } =
        await api.resetValue(tweakId);

      if (result.ok && result.verified) {
        const readback = await api.readValue(tweakId);
        if (readback.error || readback.value !== result.actualValue) throw new Error(readback.error ?? 'Reset read-back did not match the requested value.');
        const resetValue = result.actualValue ?? config.defaultValue;
        pendingTouchedRef.current = false;
        // Persist the reset-to-default value so next startup shows default, not old applied value.
        setSliderValue(tweakId, resetValue);
        if (tweakId === 'net-throttle-index') {
          setTweak('tcp-throttling-index', resetValue === 4294967295);
          window.dispatchEvent(new CustomEvent('sc:slider-state-changed', {
            detail: { sliderId: tweakId, value: resetValue },
          }));
        }
        // Cross-state: resetting timer-resolution-slider to default means no active
        // resolution request — mirror that into the toggle so it shows as "off".
        if (tweakId === TIMER_SLIDER_ID) {
          setTweak(TIMER_TOGGLE_ID, false);
          window.dispatchEvent(new CustomEvent('sc:timer-toggle-state-changed', {
            detail: { enabled: false },
          }));
        }
        setState(s => ({
          ...s,
          previousValue: s.currentValue,
          currentValue:  resetValue,
          pendingValue:  resetValue,
          status:        'verified',
          verifyResult:  { ok: true, actualValue: result.actualValue, error: null },
          lastError:     null,
        }));
        toast({ title: 'Reset to Default', description: `Restored to ${resetValue}.` });
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
    // Clamp the stored previous value to the safe range so a value that was
    // written by older code (e.g. 380000 for svchost-split-threshold, which is
    // below safeMin 8388608) never reaches the backend and causes a hard failure.
    const clampedPrev = (() => {
      let v = state.previousValue as number;
      if (config.safeMin !== undefined && v < config.safeMin) v = config.defaultValue;
      if (config.safeMax !== undefined && v > config.safeMax) v = config.defaultValue;
      return v;
    })();
    setState(s => ({ ...s, pendingValue: clampedPrev, verifyResult: null }));
    // Apply the previous value
    const prevVal = clampedPrev;
    pendingTouchedRef.current = true;
    setState(s => ({ ...s, status: 'applying', lastError: null }));

    if (!isElectron) {
      setState(s => ({
        ...s,
        previousValue: s.previousValue,
        status:        'failed',
        verifyResult:  { ok: false, actualValue: null, error: 'Slider verification is unavailable outside the desktop app.' },
        lastError:     'Slider verification is unavailable outside the desktop app.',
      }));
      scheduleResultDismiss();
      return;
    }

    try {
      const api = getSliderAPI();
      const result = await api.applyValue(tweakId, prevVal);
      if (result.ok && result.verified) {
        const readback = await api.readValue(tweakId);
        if (readback.error || readback.value !== result.actualValue) throw new Error(readback.error ?? 'Revert read-back did not match the requested value.');
        pendingTouchedRef.current = false;
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

  // Guard against false-positive dirty state on load: if currentValue is still
  // null (registry read pending or failed), pendingValue !== null alone would
  // light up Apply spuriously. Once the user explicitly changes the control,
  // pendingTouchedRef allows that choice to be applied without waiting for a
  // successful readback.
  const isDirty = isSliderDirty(
    state.currentValue,
    state.pendingValue,
    pendingTouchedRef.current,
  );

  return { state, isDirty, setPending, apply, reset, revert, refresh, dismissResult };
}
