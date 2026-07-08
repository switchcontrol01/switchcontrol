/**
 * useVisibilityInterval
 *
 * Drop-in replacement for setInterval that:
 *  1. Pauses automatically when document.hidden (tab hidden / window minimized).
 *  2. Resumes — and immediately fires once — when visible again.
 *  3. Registers itself in the global pollingRegistry for diagnostics.
 *  4. Respects the LPM (low-performance mode) multiplier from performanceStore.
 *
 * @param callback  Function to call on each tick.
 * @param baseMs    Nominal interval in ms (≥ POLL_FLOOR_MS enforced).
 * @param name      Human-readable name for the registry (e.g. "LiveGraph:fetchTelemetry").
 * @param file      Source file name for the registry.
 * @param enabled   When false the interval is completely inactive (default: true).
 */
import { useEffect, useRef, useCallback } from 'react';
import { pollingRegistry } from '@/lib/pollingRegistry';
import { usePerformanceStore } from '@/stores/performanceStore';
import { useAppModeStore, getPollingMultiplier } from '@/lib/appModeStore';

let _nextId = 1;

export function useVisibilityInterval(
  callback: () => void,
  baseMs: number,
  name: string,
  file: string,
  enabled = true,
): void {
  const { effectiveInterval, lpmActive } = usePerformanceStore();
  // Every useVisibilityInterval caller automatically obeys the global
  // ApplicationMode — no per-call-site wiring needed. Reading `mode` here
  // (not just calling getPollingMultiplier() inside the effect) ensures the
  // effect re-runs and reschedules the instant the user switches modes.
  const appMode = useAppModeStore((s) => s.mode);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  // Stable wrapper so we can safely call from event handlers
  const fire = useCallback(() => { cbRef.current(); }, []);

  useEffect(() => {
    if (!enabled) return;

    const intervalMs = Math.round(effectiveInterval(baseMs) * getPollingMultiplier());
    const registryId = _nextId++;

    pollingRegistry.register(registryId, name, file, intervalMs);

    let timerId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timerId !== null) return; // already running
      fire(); // immediate tick on resume
      timerId = setInterval(() => {
        pollingRegistry.tick(registryId);
        fire();
      }, intervalMs);
    };

    const stop = () => {
      if (timerId === null) return;
      clearInterval(timerId);
      timerId = null;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    // Start immediately if visible
    if (!document.hidden) {
      start();
    }

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
      pollingRegistry.unregister(registryId);
    };
  // Re-create when LPM toggles, ApplicationMode changes, or enabled changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, baseMs, lpmActive, appMode, name, file]);
}
