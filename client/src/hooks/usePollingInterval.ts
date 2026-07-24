import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useAppModeStore, getPollingMultiplier } from "@/lib/appModeStore";

/**
 * Shared polling hook used by MemoryIntelligenceModal and CpuCoresModal.
 * Manages a periodic fetch interval with:
 *   - automatic cleanup on unmount / enabled→false
 *   - document.hidden visibility guard (pauses when tab is hidden)
 *   - in-flight guard (skips interval tick if a fetch is already in progress)
 *   - mountedRef returned so async fetchFn can abort stale setState calls
 *
 * Usage:
 *   const mountedRef = usePollingInterval(fetchFn, 2000, open);
 *   // inside fetchFn: read mountedRef.current AFTER each await — do not
 *   // capture it in a variable before the await or you will get a stale value:
 *   //   ✓  const data = await fetch(...); if (!mountedRef.current) return;
 *   //   ✗  const mounted = mountedRef.current; ... if (!mounted) return;
 */
export function usePollingInterval(
  fetchFn: () => Promise<void> | void,
  intervalMs: number,
  enabled: boolean
): RefObject<boolean> {
  const fetchRef  = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const mountedRef   = useRef(true);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef  = useRef(false);
  // Read the global ApplicationMode so every usePollingInterval caller
  // automatically slows down in Light Mode without touching call sites.
  const appMode = useAppModeStore((s) => s.mode);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const effectiveMs = Math.round(intervalMs * getPollingMultiplier());

    const stopPoll = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
    const safeFetch = async () => {
      if (document.hidden || !mountedRef.current) return;
      // Skip this tick if the previous fetch is still in progress — prevents
      // concurrent requests when fetchFn takes longer than effectiveMs.
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await fetchRef.current();
      } finally {
        inFlightRef.current = false;
      }
    };
    const startPoll = () => {
      if (intervalRef.current) return;
      safeFetch();
      intervalRef.current = setInterval(safeFetch, effectiveMs);
    };
    const handleVisibility = () => { document.hidden ? stopPoll() : startPoll(); };
    document.addEventListener("visibilitychange", handleVisibility);
    if (!document.hidden) startPoll();

    return () => {
      mountedRef.current = false;
      stopPoll();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, intervalMs, appMode]);

  return mountedRef;
}
