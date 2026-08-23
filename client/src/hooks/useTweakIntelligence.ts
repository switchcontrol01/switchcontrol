import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useStore } from "@/lib/store";
import { apiFetch } from "@/lib/api";

export type PressureLevel = "low" | "moderate" | "elevated" | "high";

export interface SystemSignal {
  id: string;
  label: string;
  level: PressureLevel;
  value: string;
  detail: string;
  subsystem: "cpu" | "memory" | "process" | "network" | "trend";
}

export interface TweakRanking {
  tweakId: string;
  score: number;
  relevance: "high" | "medium" | "low" | "none";
  reason: string;
  dominantSignal: string;
  alreadyApplied: boolean;
}

export interface PostureDimension {
  id: string;
  label: string;
  score: number;
  applied: number;
  total: number;
  color: string;
}

export interface TweakIntelligenceState {
  signals: SystemSignal[];
  rankings: TweakRanking[];
  posture: PostureDimension[];
  overallCoverage: number;
  cpuLoad: number;
  memPct: number;
  processCount: number;
  networkKbs: number;
  loadTrend: "rising" | "falling" | "stable";
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

const DEFAULT_STATE: TweakIntelligenceState = {
  signals: [],
  rankings: [],
  posture: [],
  overallCoverage: 0,
  cpuLoad: 0,
  memPct: 0,
  processCount: 0,
  networkKbs: 0,
  loadTrend: "stable",
  loading: true,
  error: null,
  lastUpdated: null,
};

// After this many consecutive first-load failures we stop hiding the error.
// Without a cap, a misconfigured or permanently-down backend shows an
// infinite loading spinner with no user-facing signal that anything is wrong.
const MAX_SILENT_FIRST_LOAD_FAILURES = 3;

export function useTweakIntelligence(pollIntervalMs = 5_000) {
  const tweaks = useStore((s) => s.tweaks);
  const gpuName = useStore((s) => s.stats.gpuName);
  const [state, setState] = useState<TweakIntelligenceState>(DEFAULT_STATE);
  const abortRef              = useRef<AbortController | null>(null);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef            = useRef(true);
  // Counts consecutive failures that occurred while lastUpdated === null (first load).
  const firstLoadFailuresRef  = useRef(0);

  // Fix #4: memoize so the filter doesn't run on every render — only when
  // `tweaks` actually changes.
  const appliedParam = useMemo(
    () => Object.keys(tweaks).filter((id) => tweaks[id]).join(","),
    [tweaks],
  );

  // GPU name — forwarded to the server so vendor-specific tweaks (e.g.
  // nvidia-telemetry) are excluded for users without matching hardware.
  const gpuParam = useMemo(
    () => encodeURIComponent(gpuName ?? ""),
    [gpuName],
  );

  // Fix #1: `isStale` is a per-effect closure that returns true the moment the
  // effect that created it is cleaned up (i.e. `appliedParam` changed or the
  // component unmounted).  It is threaded into `fetchAll` so that every
  // `setState` call is guarded by *this specific effect run's* staleness, not
  // by `mountedRef` which gets flipped back to `true` immediately by the next
  // effect run — causing stale responses for old `appliedParam` values to
  // overwrite state set by the new fetch.
  //
  // `mountedRef` is still used as a secondary guard against updates after
  // actual component unmount (the case `isStale` doesn't distinguish from
  // a same-component re-run).
  const fetchAll = useCallback(async (
    param: string,
    gpu: string,
    isStale: () => boolean,
    fetchPosture: boolean,
  ) => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      // In Electron, the main process owns the live telemetry loop while the
      // embedded backend deliberately does not start a duplicate scheduler.
      // Forward the already-available live signal subset so intelligence can
      // render on the first visit instead of receiving 503 "Telemetry not
      // ready" until another route happens to remount this component.
      let liveQuery = "";
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.isElectron && electronAPI.telemetry?.getLive) {
        const live = await electronAPI.telemetry.getLive().catch(() => null);
        const cpuLoad = live?.cpu?.usagePct;
        const memPct = live?.ram?.usagePct;
        const networkKbs = (Number(live?.network?.rxKBps) || 0) + (Number(live?.network?.txKBps) || 0);
        if (Number.isFinite(cpuLoad) && Number.isFinite(memPct)) {
          const params = new URLSearchParams({
            cpuLoad: String(cpuLoad),
            memPct: String(memPct),
            networkKbs: String(networkKbs),
          });
          liveQuery = `&${params.toString()}`;
        }
      }

      // Fix #3: use Promise.allSettled so a flaky endpoint (e.g. posture)
      // doesn't discard perfectly good signals/rankings data from the other
      // two.  Each result is merged independently — partial data is better
      // than a blank dashboard.
      const [stateResult, rankResult, postureResult] = await Promise.allSettled([
        apiFetch(`/tweak-intelligence/system-state?${liveQuery.slice(1)}`, {}, { signal: ac.signal }),
        apiFetch(`/tweak-intelligence/rankings?applied=${encodeURIComponent(param)}&gpu=${gpu}${liveQuery}`, {}, { signal: ac.signal }),
        fetchPosture
          ? apiFetch(`/tweak-intelligence/posture?applied=${encodeURIComponent(param)}`, {}, { signal: ac.signal })
          : Promise.resolve(null),
      ]);

      // Guard immediately after the await — if the effect was cleaned up while
      // the fetches were in flight, abort.
      if (isStale() || !mountedRef.current) return;

      // Resolve each response independently.  A rejected or non-ok result
      // leaves that slice as null; the setState below falls back to the
      // previous slice value so existing good data isn't blanked.
      const toJson = async (result: PromiseSettledResult<Response> | null) => {
        if (!result) return null;
        if (result.status === "rejected") return null;
        if (!result.value.ok) return null;
        try { return await result.value.json(); } catch { return null; }
      };

      const [systemState, rankData, postureData] = await Promise.all([
        toJson(stateResult),
        toJson(rankResult),
        toJson(postureResult),
      ]);

      // Second guard after the .json() round-trip.
      if (isStale() || !mountedRef.current) return;

      // Track whether at least one endpoint succeeded.
      const anySucceeded = systemState !== null || rankData !== null || postureData !== null;
      if (!anySucceeded) {
        throw new Error("All three intelligence endpoints failed");
      }

      // Reset the first-load failure counter on any partial success.
      firstLoadFailuresRef.current = 0;

      setState((prev: TweakIntelligenceState) => ({
        signals:         systemState?.signals       ?? prev.signals,
        rankings:        rankData?.rankings         ?? prev.rankings,
        posture:         postureData?.dimensions    ?? prev.posture,
        overallCoverage: postureData?.overallCoverage ?? prev.overallCoverage,
        cpuLoad:         systemState?.cpuLoad       ?? prev.cpuLoad,
        memPct:          systemState?.memPct        ?? prev.memPct,
        processCount:    systemState?.processCount  ?? prev.processCount,
        networkKbs:      systemState?.networkKbs    ?? prev.networkKbs,
        loadTrend:       systemState?.loadTrend     ?? prev.loadTrend,
        loading:         false,
        error:           null,
        lastUpdated:     Date.now(),
      }));
    } catch (e: any) {
      if (e.name === "AbortError") return;
      if (isStale() || !mountedRef.current) return;

      setState((prev: TweakIntelligenceState) => {
        if (prev.lastUpdated === null) {
          // Fix #2: cap the number of times we silently suppress a first-load
          // error.  After MAX_SILENT_FIRST_LOAD_FAILURES consecutive failures
          // we surface a real error so the user knows something is wrong
          // rather than seeing an infinite loading spinner.
          firstLoadFailuresRef.current += 1;
          if (firstLoadFailuresRef.current <= MAX_SILENT_FIRST_LOAD_FAILURES) {
            // Still within tolerance — keep loading:true, suppress error banner.
            // The poll will retry automatically.
            return { ...prev, loading: true, error: null };
          }
          // Exceeded tolerance — surface the error so the user can act.
          return { ...prev, loading: false, error: "Could not load system intelligence." };
        }
        // Subsequent failure after we had real data — show the error.
        return { ...prev, loading: false, error: "Could not load system intelligence." };
      });
    }
  }, []);

  const refresh = useCallback(() => {
    // A manual retry is an explicit recovery action after the bounded
    // first-load failure policy has surfaced the error banner.
    firstLoadFailuresRef.current = 0;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchAll(appliedParam, gpuParam, () => false, true);
  }, [appliedParam, fetchAll, gpuParam]);

  // Poll on mount and whenever applied IDs change.
  useEffect(() => {
    mountedRef.current = true;
    // Per-effect cancellation closure — maps 1:1 to "is this effect run still
    // the current one?"  Passed into fetchAll as `isStale` so stale responses
    // from a previous effect run (old appliedParam) cannot overwrite state set
    // by the new effect run even if the requests had already resolved before
    // cleanup fired (the window where abort() is a no-op).
    let cancelled = false;
    const isStale = () => cancelled;

    fetchAll(appliedParam, gpuParam, isStale, true);

    const schedule = () => {
      if (cancelled) return;
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        // System state remains live at the five-second cadence. Posture is
        // derived solely from applied IDs, so it is fetched on the initial
        // request and when this effect restarts because those IDs changed.
        fetchAll(appliedParam, gpuParam, isStale, false);
        schedule();
      }, pollIntervalMs);
    };
    schedule();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedParam, gpuParam, pollIntervalMs]);

  return { ...state, refresh };
}
