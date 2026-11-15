import { useState, useEffect, useCallback, useRef } from "react";
import {
  hasUsableSystemLoadForEstimate,
  type SystemLoadMeasurement,
} from "@/lib/responsivenessMetrics";
import { useMeasuredSystemLoad } from "@/hooks/useMeasuredSystemLoad";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InstabilityData {
  score: number;
  state: "stable" | "minor_pressure" | "unstable" | "severe";
  stateLabel: string;
  source: string;
  sourceDetail: string;
  metrics: {
    cpuLoad: number;
    ramPct: number;
    processCount: number;
    loadTrend: string;
    networkKbs: number;
  };
  ts: number;
}

export interface ActiveProblem {
  id: string;
  severity: "high" | "warning" | "info";
  title: string;
  message: string;
  metric: string;
  suggestion: string;
  destination: string;
}

export interface ActiveProblemsData {
  problems: ActiveProblem[];
  allClear: boolean;
  problemCount: number;
  ts: number;
}

export interface LatencyEstimateData {
  ready: boolean;
  estimatedMs: number | null;
  quality: string;
  trend: "rising" | "falling" | "stable";
  breakdown: Array<{
    label: string;
    value: number | string;
    unit: string;
    contributionMs: number;
  }>;
  reason: string;
  sampledAt: number | null;
  stale?: boolean;
}

let dashboardLastReadyEstimate: LatencyEstimateData | null = null;

// ── Display Signal profile ─────────────────────────────────────────────────────

export interface DisplaySignalProfile {
  monitorName:    string | null;
  resolution:     string | null;
  refreshHz:      number | null;
  bitDepth:       number | null;
  hdrEnabled:     boolean | null;
  vrrEnabled:     boolean | null;
  connectionType: string | null;
  gpuName:        string | null;
  isNativeMode:   boolean | null;
  qualityScore:   number | null;
  qualityReason:  string;
  qualityAction:  string | null;
  notes:          string[];
  displayCount:   number;
  ts:             number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface DashboardIntelligenceState {
  instability:   InstabilityData | null;
  problems:      ActiveProblemsData | null;
  systemLoad:    SystemLoadMeasurement;
  latencyEstimate: LatencyEstimateData | null;
  loading:       boolean;
  refresh:       () => void;
}

async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

export function getLatencyEstimateUrl(systemLoad: SystemLoadMeasurement): string {
  const cpuCores = systemLoad.cpuCoreCount;
  const ramTotalGB = systemLoad.ramTotalGb;
  const processCount = systemLoad.processCount;
  const params = new URLSearchParams();
  const values: Record<string, number | null> = {
    cpuLoad: systemLoad.cpuUsagePct,
    cpuCores,
    ramUsedGB: systemLoad.ramUsedGb,
    ramTotalGB,
    ramUsedPercent: systemLoad.ramUsagePct,
    processCount,
  };
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "number" && Number.isFinite(value)) params.set(key, String(value));
  }
  return `/api/dashboard-intelligence/latency-estimate?${params.toString()}`;
}

export function useLatencyEstimate(
  enabled: boolean,
  systemLoad: SystemLoadMeasurement,
): { data: LatencyEstimateData | null; refresh: () => void } {
  const [data, setData] = useState<LatencyEstimateData | null>(() => dashboardLastReadyEstimate);
  const lastReadyLatencyRef = useRef<LatencyEstimateData | null>(dashboardLastReadyEstimate);
  const systemLoadRef = useRef(systemLoad);
  const pollRef = useRef<() => void>(() => {});
  systemLoadRef.current = systemLoad;

  const refresh = useCallback(() => pollRef.current(), []);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      lastReadyLatencyRef.current = null;
      dashboardLastReadyEstimate = null;
      pollRef.current = () => {};
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const waiting: LatencyEstimateData = {
      ready: false,
      estimatedMs: null,
      quality: "Not enough data",
      trend: "stable",
      breakdown: [],
      reason: "Waiting for a complete Windows telemetry sample.",
      sampledAt: null,
    };

    const poll = async () => {
      if (cancelled || inFlight) return;
      if (timer) clearTimeout(timer);
      if (document.hidden) {
        timer = setTimeout(() => void poll(), 8_000);
        return;
      }

      const current = systemLoadRef.current;
      const localSampleReady = hasUsableSystemLoadForEstimate(current);

      if (!localSampleReady) {
        if (!cancelled) {
          setData(
            lastReadyLatencyRef.current
              ? {
                  ...lastReadyLatencyRef.current,
                  stale: true,
                  reason: current.reason || waiting.reason,
                }
              : { ...waiting, reason: current.reason || waiting.reason },
          );
        }
        timer = setTimeout(() => void poll(), 8_000);
        return;
      }

      inFlight = true;
      try {
        const next = await fetchJSON<LatencyEstimateData>(getLatencyEstimateUrl(current));
        if (cancelled) return;
        if (next.ready && typeof next.estimatedMs === "number" && Number.isFinite(next.estimatedMs)) {
          const estimate = current.state === "live"
            ? next
            : {
                ...next,
                stale: true,
                sampledAt: current.sampledAt ?? next.sampledAt,
                reason: current.state === "paused"
                  ? "Telemetry is paused; this uses the last complete local Windows sample."
                  : "This uses an older complete local Windows sample.",
              };
          lastReadyLatencyRef.current = estimate;
          dashboardLastReadyEstimate = estimate;
          setData(estimate);
        } else if (lastReadyLatencyRef.current) {
          setData({
            ...lastReadyLatencyRef.current,
            stale: true,
            reason: next.reason || waiting.reason,
          });
        } else {
          setData(next);
        }
      } catch {
        if (!cancelled) {
          setData(
            lastReadyLatencyRef.current
              ? {
                  ...lastReadyLatencyRef.current,
                  stale: true,
                  reason: "The latest complete estimate is being kept while Windows telemetry refreshes.",
                }
              : waiting,
          );
        }
      } finally {
        inFlight = false;
        if (!cancelled) timer = setTimeout(() => void poll(), 8_000);
      }
    };

    pollRef.current = () => { void poll(); };
    const onVisibility = () => {
      if (!document.hidden) pollRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    void poll();

    return () => {
      cancelled = true;
      inFlight = false;
      if (timer) clearTimeout(timer);
      pollRef.current = () => {};
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return { data, refresh };
}

export function useDashboardIntelligence(enabled = true): DashboardIntelligenceState {
  const [instability,   setInstability]   = useState<InstabilityData | null>(null);
  const [problems,      setProblems]      = useState<ActiveProblemsData | null>(null);
  const { data: systemLoad, refresh: refreshSystemLoad } = useMeasuredSystemLoad(enabled);
  const { data: latencyEstimate, refresh: refreshLatencyEstimate } = useLatencyEstimate(enabled, systemLoad);
  const [loading,       setLoading]       = useState(true);
  const initRef = useRef(false);
  // F-3: AbortController so an unmount mid-fetch cancels the network requests
  // AND prevents the setState() calls from running on an unmounted hook.
  const abortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    try {
      const [inst, probs] = await Promise.allSettled([
        fetchJSON<InstabilityData>("/api/dashboard-intelligence/instability", signal),
        fetchJSON<ActiveProblemsData>("/api/dashboard-intelligence/active-problems", signal),
      ]);
      // F-3: Bail before any setState if the caller has aborted (unmount).
      if (signal?.aborted) return;
      if (inst.status  === "fulfilled") setInstability(inst.value);
      if (probs.status === "fulfilled") setProblems(probs.value);
    } catch (_) {}
    if (signal?.aborted) return;
    setLoading(false);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchAll();
    refreshSystemLoad();
    refreshLatencyEstimate();
  }, [fetchAll, refreshSystemLoad, refreshLatencyEstimate]);

  const runningRef = useRef(false);
  const inFlightRef = useRef(false);
  const lastRunRef = useRef({
    instability: 0,
    problems: 0,
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    runningRef.current = true;
    // F-3/F-12: One controller for all fetches in this effect. Aborted on unmount.
    const ac = new AbortController();
    abortRef.current = ac;

    const TTL = {
      instability: 15000,
      problems: 30000,
    };

    // F-3: setState guards — every async write checks cancelled+aborted before
    // committing. Wrapping the setters avoids forgetting on any single branch.
    const guarded = <T,>(setter: (v: T) => void) => (v: T) => {
      if (cancelled || ac.signal.aborted) return;
      setter(v);
    };

    async function schedulerTick() {
      if (cancelled || ac.signal.aborted) return;
      if (!runningRef.current) return;
      if (document.hidden) return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;

      try {
        const now = Date.now();
        const tasks: Promise<void>[] = [];

        if (now - lastRunRef.current.instability >= TTL.instability) {
          lastRunRef.current.instability = now;
          tasks.push(
            fetchJSON<InstabilityData>("/api/dashboard-intelligence/instability", ac.signal)
              .then(guarded(setInstability))
              .catch(() => {})
          );
        }

        if (now - lastRunRef.current.problems >= TTL.problems) {
          lastRunRef.current.problems = now;
          tasks.push(
            fetchJSON<ActiveProblemsData>("/api/dashboard-intelligence/active-problems", ac.signal)
              .then(guarded(setProblems))
              .catch(() => {})
          );
        }

        if (tasks.length > 0) {
          await Promise.allSettled(tasks);
        }

        if (cancelled || ac.signal.aborted) return;
        setLoading(false);
      } finally {
        inFlightRef.current = false;
      }
    }

    async function loop() {
      if (!initRef.current) {
        initRef.current = true;
        await fetchAll(ac.signal);
        // F-12: After awaiting the initial fetch, the hook may have unmounted.
        // Bail before touching refs/state — otherwise we leak a setLoading and
        // initRef writes after teardown.
        if (cancelled || ac.signal.aborted) return;
        const now = Date.now();
        lastRunRef.current = {
          instability: now,
          problems: now,
        };
        setLoading(false);
      }

      while (!cancelled && !ac.signal.aborted && runningRef.current) {
        await schedulerTick();
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    const handleVisibility = () => {
      if (!document.hidden && runningRef.current) {
        schedulerTick();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    loop();

    return () => {
      cancelled = true;
      runningRef.current = false;
      inFlightRef.current = false;
      // F-3: Abort any in-flight fetches so their .then(setX) cannot fire
      // after unmount and so the underlying HTTP requests are actually cancelled.
      try { ac.abort(); } catch {}
      abortRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibility);
      initRef.current = false;
    };
  }, [enabled, fetchAll]);

  return { instability, problems, systemLoad, latencyEstimate, loading, refresh };
}
