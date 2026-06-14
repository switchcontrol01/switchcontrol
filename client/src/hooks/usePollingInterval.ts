import { useEffect, useRef } from "react";

/**
 * Shared polling hook used by MemoryIntelligenceModal and CpuCoresModal.
 * Manages a periodic fetch interval with:
 *   - automatic cleanup on unmount / enabled→false
 *   - document.hidden visibility guard (pauses when tab is hidden)
 *   - mountedRef returned so async fetchFn can abort stale setState calls
 *
 * Usage:
 *   const mountedRef = usePollingInterval(fetchFn, 2000, open);
 *   // inside fetchFn: after any await, `if (!mountedRef.current) return;`
 */
export function usePollingInterval(
  fetchFn: () => Promise<void> | void,
  intervalMs: number,
  enabled: boolean
): React.RefObject<boolean> {
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const stopPoll = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
    const safeFetch = () => {
      if (document.hidden || !mountedRef.current) return;
      fetchRef.current();
    };
    const startPoll = () => {
      if (intervalRef.current) return;
      safeFetch();
      intervalRef.current = setInterval(safeFetch, intervalMs);
    };
    const handleVisibility = () => { document.hidden ? stopPoll() : startPoll(); };
    document.addEventListener("visibilitychange", handleVisibility);
    if (!document.hidden) startPoll();

    return () => {
      mountedRef.current = false;
      stopPoll();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, intervalMs]);

  return mountedRef;
}
