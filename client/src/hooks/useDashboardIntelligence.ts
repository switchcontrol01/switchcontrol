import { useState, useEffect, useCallback, useRef } from "react";

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

export interface CauseFinding {
  id: string;
  label: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  subsystem: string;
  score: number;
  suggestion: string;
  destination: string;
}

export interface CausationData {
  primaryCause: CauseFinding;
  allCauses: CauseFinding[];
  noIssue: boolean;
  cpuLoad: number;
  ramPct: number;
  psCount?: number;
  topProcesses?: { name: string; cpuPct: number }[];
  ts: number;
}

export interface DNADimension {
  id: string;
  label: string;
  score: number;
  color: string;
  higherIsBad: boolean;
}

export interface SystemDNAData {
  dimensions: DNADimension[];
  profile: string;
  profileNote: string;
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

export interface LatencyBreakdown {
  label: string;
  ms: number;
  note: string;
}

export interface LatencyData {
  estimatedMs: number;
  quality: "Excellent" | "Good" | "Fair" | "Poor";
  confidence: "high" | "medium";
  trend: "rising" | "falling" | "stable";
  breakdown: LatencyBreakdown[];
  ts: number;
}

// ── Smart RAM profile — real state engine ──────────────────────────────────────

export interface TopProcess {
  name:   string;
  pid:    number | null;
  ramMb:  number | null;
  cpuPct: number | null;
}

export type RamState = "stable" | "cached_heavy" | "pressure_rising" | "bottleneck" | "critical";

export interface SmartRamProfile {
  totalGb:          number;
  usedGb:           number;
  freeGb:           number;
  availableGb:      number | null;
  standbyGb:        number | null;
  swapUsedGb:       number | null;
  reclaimableGb:    number;
  reclaimableSource: "measured" | "estimated";
  newUsedPct:       number;
  usedPct:          number;
  state:            RamState;
  reason:           string;
  recommendation:   string;
  topProcesses:     TopProcess[];
  ts:               number;
}

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
  dna:           SystemDNAData | null;
  problems:      ActiveProblemsData | null;
  latency:       LatencyData | null;
  ram:           SmartRamProfile | null;
  loading:       boolean;
  causation:     CausationData | null;
  causeLoading:  boolean;
  analyzeCause:  () => Promise<void>;
  refresh:       () => void;
  refreshRam:    () => Promise<void>;
}

async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

export function useDashboardIntelligence(enabled = true): DashboardIntelligenceState {
  const [instability,   setInstability]   = useState<InstabilityData | null>(null);
  const [dna,           setDna]           = useState<SystemDNAData | null>(null);
  const [problems,      setProblems]      = useState<ActiveProblemsData | null>(null);
  const [latency,       setLatency]       = useState<LatencyData | null>(null);
  const [ram,           setRam]           = useState<SmartRamProfile | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [causation,     setCausation]     = useState<CausationData | null>(null);
  const [causeLoading,  setCauseLoading]  = useState(false);
  const initRef = useRef(false);
  // F-3: AbortController so an unmount mid-fetch cancels the network requests
  // AND prevents the setState() calls from running on an unmounted hook.
  const abortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    try {
      const [inst, d, probs, lat, r] = await Promise.allSettled([
        fetchJSON<InstabilityData>("/api/dashboard-intelligence/instability", signal),
        fetchJSON<SystemDNAData>("/api/dashboard-intelligence/system-dna", signal),
        fetchJSON<ActiveProblemsData>("/api/dashboard-intelligence/active-problems", signal),
        fetchJSON<LatencyData>("/api/dashboard-intelligence/latency-estimate", signal),
        fetchJSON<SmartRamProfile>("/api/dashboard-intelligence/ram-analysis", signal),
      ]);
      // F-3: Bail before any setState if the caller has aborted (unmount).
      if (signal?.aborted) return;
      if (inst.status  === "fulfilled") setInstability(inst.value);
      if (d.status     === "fulfilled") setDna(d.value);
      if (probs.status === "fulfilled") setProblems(probs.value);
      if (lat.status   === "fulfilled") setLatency(lat.value);
      if (r.status     === "fulfilled") setRam(r.value);
    } catch (_) {}
    if (signal?.aborted) return;
    setLoading(false);
  }, []);

  const analyzeCauseAbortRef = useRef<AbortController | null>(null);
  // P1-A4: abort any in-flight analyzeCause on unmount so setState after await is safe.
  useEffect(() => {
    return () => {
      analyzeCauseAbortRef.current?.abort();
      analyzeCauseAbortRef.current = null;
    };
  }, []);
  const analyzeCause = useCallback(async () => {
    // P1-A4: cancel any in-flight analyzeCause before starting a new one;
    // guard setState after await so unmount/cancellation does not leak updates.
    analyzeCauseAbortRef.current?.abort();
    const ctrl = new AbortController();
    analyzeCauseAbortRef.current = ctrl;
    setCauseLoading(true);
    try {
      const data = await fetchJSON<CausationData>(
        `/api/dashboard-intelligence/what-caused-that?t=${Date.now()}`,
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      setCausation(data);
    } catch (_) {}
    if (ctrl.signal.aborted) return;
    setCauseLoading(false);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  const refreshRam = useCallback(async () => {
    try {
      const r = await fetchJSON<SmartRamProfile>("/api/dashboard-intelligence/ram-analysis?bust=1");
      setRam(r);
    } catch (_) {}
  }, []);

  const runningRef = useRef(false);
  const inFlightRef = useRef(false);
  const lastRunRef = useRef({
    instability: 0,
    dna: 0,
    problems: 0,
    latency: 0,
    ram: 0,
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    runningRef.current = true;
    // F-3/F-12: One controller for all fetches in this effect. Aborted on unmount.
    const ac = new AbortController();
    abortRef.current = ac;

    const TTL = {
      latency: 8000,
      instability: 15000,
      problems: 30000,
      dna: 60000,
      ram: 60000,
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

        if (now - lastRunRef.current.latency >= TTL.latency) {
          lastRunRef.current.latency = now;
          tasks.push(
            fetchJSON<LatencyData>("/api/dashboard-intelligence/latency-estimate", ac.signal)
              .then(guarded(setLatency))
              .catch(() => {})
          );
        }

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

        if (now - lastRunRef.current.dna >= TTL.dna) {
          lastRunRef.current.dna = now;
          tasks.push(
            fetchJSON<SystemDNAData>("/api/dashboard-intelligence/system-dna", ac.signal)
              .then(guarded(setDna))
              .catch(() => {})
          );
        }

        if (now - lastRunRef.current.ram >= TTL.ram) {
          lastRunRef.current.ram = now;
          tasks.push(
            fetchJSON<SmartRamProfile>("/api/dashboard-intelligence/ram-analysis", ac.signal)
              .then(guarded(setRam))
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
          dna: now,
          problems: now,
          latency: now,
          ram: now,
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

  return { instability, dna, problems, latency, ram, loading, causation, causeLoading, analyzeCause, refresh, refreshRam };
}
