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

export interface TweakScore {
  tweakId: string;
  score: number;
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
  tweakScores: TweakScore[];
  posture: PostureDimension[];
  overallCoverage: number;
  cpuLoad: number;
  memPct: number;
  processCount: number;
  networkKbs: number;
  loadTrend: "rising" | "falling" | "stable";
  loading: boolean;
  availability: "loading" | "ready" | "partial" | "stale" | "unavailable";
  error: string | null;
  lastUpdated: number | null;
}

const DEFAULT_STATE: TweakIntelligenceState = {
  signals: [],
  tweakScores: [],
  posture: [],
  overallCoverage: 0,
  cpuLoad: 0,
  memPct: 0,
  processCount: 0,
  networkKbs: 0,
  loadTrend: "stable",
  loading: true,
  availability: "loading",
  error: null,
  lastUpdated: null,
};

// Bound IPC, HTTP and JSON work, including transports that ignore cancellation.
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Request cancelled", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      value => { signal.removeEventListener("abort", onAbort); resolve(value); },
      error => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
    if (signal.aborted) onAbort();
  });
}

export function useTweakIntelligence(pollIntervalMs = 5_000) {
  const tweaks = useStore((s) => s.tweaks);
  const gpuName = useStore((s) => s.stats.gpuName);
  const [state, setState] = useState<TweakIntelligenceState>(DEFAULT_STATE);
  const abortRef              = useRef<AbortController | null>(null);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef            = useRef(true);
  const failuresRef = useRef(0);
  const postureNeededRef = useRef(true);

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
    let timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; ac.abort(); }, 12_000);
    const isCurrent = () => !isStale() && mountedRef.current && abortRef.current === ac;

    try {
      // In Electron, the main process owns the live telemetry loop while the
      // embedded backend deliberately does not start a duplicate scheduler.
      // Forward the already-available live signal subset so intelligence can
      // render on the first visit instead of receiving 503 "Telemetry not
      // ready" until another route happens to remount this component.
      let liveQuery = "";
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.isElectron && electronAPI.telemetry?.getLive) {
        const live: any = await abortable(electronAPI.telemetry.getLive().catch(() => null), ac.signal);
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
      // doesn't discard perfectly good signals/category scores from the other
      // two.  Each result is merged independently — partial data is better
      // than a blank dashboard.
      const [stateResult, scoresResult, postureResult] = await abortable(Promise.allSettled([
        apiFetch(`/tweak-intelligence/system-state?${liveQuery.slice(1)}`, {}, { signal: ac.signal }),
        apiFetch(`/tweak-intelligence/category-scores?applied=${encodeURIComponent(param)}&gpu=${gpu}${liveQuery}`, {}, { signal: ac.signal }),
        fetchPosture
          ? apiFetch(`/tweak-intelligence/posture?applied=${encodeURIComponent(param)}`, {}, { signal: ac.signal })
          : Promise.resolve(null),
      ]), ac.signal);

      // Guard immediately after the await — if the effect was cleaned up while
      // the fetches were in flight, abort.
      if (!isCurrent() || ac.signal.aborted) return;

      // Resolve each response independently.  A rejected or non-ok result
      // leaves that slice as null; the setState below falls back to the
      // previous slice value so existing good data isn't blanked.
      const toJson = async (result: PromiseSettledResult<Response | null> | null) => {
        if (!result) return null;
        if (result.status === "rejected") return null;
        if (!result.value?.ok) return null;
        try { return await result.value.json(); } catch { return null; }
      };

      const parsed = await abortable(Promise.all([
        toJson(stateResult),
        toJson(scoresResult),
        toJson(postureResult),
      ]), ac.signal);
      const systemState = Array.isArray(parsed[0]?.signals) ? parsed[0] : null;
      const scoreData = Array.isArray(parsed[1]?.scores) ? parsed[1] : null;
      const postureData = Array.isArray(parsed[2]?.dimensions) && Number.isFinite(parsed[2]?.overallCoverage) ? parsed[2] : null;

      // Second guard after the .json() round-trip.
      if (!isCurrent() || ac.signal.aborted) return;

      // Track whether at least one endpoint succeeded.
      const anySucceeded = systemState !== null || scoreData !== null || postureData !== null;
      if (!anySucceeded) {
        const statuses = [stateResult, scoresResult, postureResult].map(r =>
          r.status === "fulfilled" ? r.value?.status ?? "not-requested" : "transport-error");
        throw new Error(`Intelligence unavailable (endpoint statuses: ${statuses.join(", ")})`);
      }

      // Reset the first-load failure counter on any partial success.
      failuresRef.current = 0;
      if (postureData !== null) postureNeededRef.current = false;

      setState((prev: TweakIntelligenceState) => ({
        signals:         systemState?.signals       ?? prev.signals,
        tweakScores:     scoreData?.scores         ?? prev.tweakScores,
        posture:         postureData?.dimensions    ?? prev.posture,
        overallCoverage: postureData?.overallCoverage ?? prev.overallCoverage,
        cpuLoad:         systemState?.cpuLoad       ?? prev.cpuLoad,
        memPct:          systemState?.memPct        ?? prev.memPct,
        processCount:    systemState?.processCount  ?? prev.processCount,
        networkKbs:      systemState?.networkKbs    ?? prev.networkKbs,
        loadTrend:       systemState?.loadTrend     ?? prev.loadTrend,
        loading:         false,
        availability: systemState && scoreData && (!fetchPosture || postureData) ? "ready" : "partial",
        error:           null,
        lastUpdated:     Date.now(),
      }));
    } catch (e: any) {
      if (e.name === "AbortError" && !timedOut) return;
      if (!isCurrent()) return;
      failuresRef.current += 1;
      if (failuresRef.current === 1) {
        console.info("[TweakIntelligence] Keeping available data; retrying with backoff.", timedOut ? "Request deadline reached." : e.message);
      }

      setState((prev: TweakIntelligenceState) => {
        // Optional intelligence must never raise a repeated red error banner.
        // Keep evidence, stop the spinner, and expose a quiet, honest status.
        return { ...prev, loading: false, error: null,
          availability: prev.lastUpdated === null ? "unavailable" : "stale" };
      });
    } finally {
      clearTimeout(deadline);
      if (abortRef.current === ac) abortRef.current = null;
    }
  }, []);

  const refresh = useCallback(() => {
    // Coalesce repeated clicks; do not abort an already-running recovery.
    if (abortRef.current) return;
    failuresRef.current = 0;
    setState((prev) => ({ ...prev, loading: prev.lastUpdated === null, error: null }));
    void fetchAll(appliedParam, gpuParam, () => false, true);
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
    postureNeededRef.current = true;

    const poll = async () => {
      if (cancelled) return;
      // A manual refresh may own the current request. Never cancel it.
      if (!abortRef.current) {
        await fetchAll(appliedParam, gpuParam, isStale, postureNeededRef.current);
      }
      if (cancelled) return;
      const backoff = Math.min(60_000, pollIntervalMs * 2 ** Math.min(failuresRef.current, 4));
      // Schedule only after completion, not while the previous request runs.
      timerRef.current = setTimeout(poll, Math.max(pollIntervalMs, backoff));
    };
    void poll();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedParam, gpuParam, pollIntervalMs]);

  return { ...state, refresh };
}
