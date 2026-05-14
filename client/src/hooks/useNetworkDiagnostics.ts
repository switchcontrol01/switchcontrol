import { useState, useEffect, useRef, useCallback } from "react";

export interface PingSample {
  avg: number; min: number; max: number; jitter: number; loss: number; ts: number;
}

export interface SpikeEvent {
  ts: number; ping: number; baselineAvg: number;
}

export interface HealthScore {
  score: number;
  tier: "Excellent" | "Good" | "Unstable" | "Poor";
  color: string;
}

export interface BenchmarkResult {
  before: { avg: number; min: number; max: number; jitter: number; loss: number };
  after:  { avg: number; min: number; max: number; jitter: number; loss: number };
  verdict: {
    latency: "improved" | "unchanged" | "worse";
    jitter:  "improved" | "unchanged" | "worse";
    loss:    "improved" | "unchanged" | "worse";
  };
}

export interface PcVsInternetResult {
  cloudflare: number | null;
  google: number | null;
  providerVariance: number;
  verdict: "stable" | "local_issue" | "internet_issue" | "mixed" | "offline";
  explanation: string;
  confidence: "low" | "medium" | "high";
}

export type BenchmarkState  = "idle" | "baseline" | "waiting" | "comparing" | "done";
export type PcVsInternetState = "idle" | "running" | "done";
export type MonitorPhase = "off" | "starting" | "live" | "error";

export interface DiagnosticsState {
  isMonitoring: boolean;
  monitorPhase: MonitorPhase;
  monitorError: string | null;
  history: PingSample[];
  current: PingSample | null;
  spikes: SpikeEvent[];
  spikesPerMin: number;
  health: HealthScore | null;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  retryMonitoring: () => void;
  benchmarkState: BenchmarkState;
  benchmarkResult: BenchmarkResult | null;
  startBenchmark: () => Promise<void>;
  runBenchmarkCompare: () => Promise<void>;
  resetBenchmark: () => void;
  pcVsInternetState: PcVsInternetState;
  pcVsInternetResult: PcVsInternetResult | null;
  runPcVsInternet: () => Promise<void>;
  resetPcVsInternet: () => void;
}

const HISTORY_MAX = 60;
const POLL_INTERVAL_MS = 8000;
const SPIKE_MULTIPLIER = 1.5;
const SPIKE_MIN_DELTA_MS = 20;

function computeHealth(sample: PingSample, spikesPerMin: number): HealthScore {
  let s = 100;
  s -= Math.min(40, (sample.avg / 100) * 40);
  s -= Math.min(30, (sample.jitter / 20) * 30);
  s -= Math.min(20, (sample.loss / 10) * 20);
  s -= Math.min(10, (spikesPerMin / 5) * 10);
  const score = Math.max(0, Math.round(s));
  const tier: HealthScore["tier"] =
    score >= 85 ? "Excellent" : score >= 65 ? "Good" : score >= 40 ? "Unstable" : "Poor";
  const color =
    score >= 85 ? "#10b981" : score >= 65 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  return { score, tier, color };
}

export function useNetworkDiagnostics(): DiagnosticsState {
  const [isMonitoring, setIsMonitoring]     = useState(false);
  const [monitorPhase, setMonitorPhase]     = useState<MonitorPhase>("starting");
  const [monitorError, setMonitorError]     = useState<string | null>(null);
  const [history, setHistory]               = useState<PingSample[]>([]);
  const [current, setCurrent]               = useState<PingSample | null>(null);
  const [spikes, setSpikes]                 = useState<SpikeEvent[]>([]);
  const [spikesPerMin, setSpikesPerMin]     = useState(0);
  const [health, setHealth]                 = useState<HealthScore | null>(null);
  const [benchmarkState, setBenchmarkState] = useState<BenchmarkState>("idle");
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [pcVsInternetState, setPcVsInternetState] = useState<PcVsInternetState>("idle");
  const [pcVsInternetResult, setPcVsInternetResult] = useState<PcVsInternetResult | null>(null);

  const intervalRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const spikeTimestampsRef = useRef<number[]>([]);
  const mountedRef         = useRef(true);
  const historyRef         = useRef<PingSample[]>([]);
  const consecutiveFailRef = useRef(0);

  const fetchSample = useCallback(async () => {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 12000);
      const resp = await fetch("/api/network/ping-sample", { signal: controller.signal });
      clearTimeout(tid);

      if (!mountedRef.current) return;

      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}`);
      }

      const sample: PingSample = await resp.json();
      if (
        typeof sample?.avg !== "number" ||
        typeof sample?.ts !== "number"
      ) {
        throw new Error("Malformed sample from server");
      }

      consecutiveFailRef.current = 0;

      historyRef.current = [...historyRef.current, sample].slice(-HISTORY_MAX);

      // Spike detection
      if (historyRef.current.length >= 5) {
        const window = historyRef.current.slice(-11, -1);
        const windowAvg = window.reduce((s, p) => s + p.avg, 0) / window.length;
        const isSpike =
          sample.avg > windowAvg * SPIKE_MULTIPLIER &&
          sample.avg - windowAvg > SPIKE_MIN_DELTA_MS;
        if (isSpike) {
          spikeTimestampsRef.current.push(Date.now());
          setSpikes(prev => [
            ...prev.slice(-9),
            { ts: sample.ts, ping: sample.avg, baselineAvg: parseFloat(windowAvg.toFixed(1)) },
          ]);
        }
      }

      const now = Date.now();
      spikeTimestampsRef.current = spikeTimestampsRef.current.filter(t => now - t < 60000);
      const spm = spikeTimestampsRef.current.length;

      setHistory([...historyRef.current]);
      setCurrent(sample);
      setSpikesPerMin(spm);
      setHealth(computeHealth(sample, spm));
      setMonitorError(null);
      setMonitorPhase("live");
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const msg = isAbort
        ? "Probe timed out — check your connection"
        : err instanceof Error
        ? err.message
        : "Unknown error";

      consecutiveFailRef.current++;

      // Only surface error after 2 consecutive failures (avoids single-blip false alarms)
      if (consecutiveFailRef.current >= 2) {
        setMonitorError(msg);
        setMonitorPhase("error");
      }
    }
  }, []);

  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return;
    consecutiveFailRef.current = 0;
    historyRef.current = [];
    setIsMonitoring(true);
    setMonitorPhase("starting");
    setMonitorError(null);
    setHistory([]);
    setCurrent(null);
    setSpikes([]);
    setSpikesPerMin(0);
    setHealth(null);
    spikeTimestampsRef.current = [];
    // First sample immediately, then poll
    fetchSample();
    intervalRef.current = setInterval(fetchSample, POLL_INTERVAL_MS);
  }, [fetchSample]);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
    setMonitorPhase("off");
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const retryMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startMonitoring();
  }, [startMonitoring]);

  // Auto-start monitoring when this hook mounts
  useEffect(() => {
    mountedRef.current = true;
    startMonitoring();
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Benchmark ────────────────────────────────────────────────────────────────

  const startBenchmark = useCallback(async () => {
    setBenchmarkState("baseline");
    setBenchmarkResult(null);
    try {
      await fetch("/api/network/benchmark/baseline", { method: "POST" });
      if (mountedRef.current) setBenchmarkState("waiting");
    } catch {
      if (mountedRef.current) setBenchmarkState("idle");
    }
  }, []);

  const runBenchmarkCompare = useCallback(async () => {
    setBenchmarkState("comparing");
    try {
      const resp = await fetch("/api/network/benchmark/compare");
      if (!resp.ok) throw new Error();
      const result: BenchmarkResult = await resp.json();
      if (mountedRef.current) { setBenchmarkResult(result); setBenchmarkState("done"); }
    } catch {
      if (mountedRef.current) setBenchmarkState("idle");
    }
  }, []);

  const resetBenchmark = useCallback(() => {
    setBenchmarkState("idle");
    setBenchmarkResult(null);
  }, []);

  // ── PC vs Internet ────────────────────────────────────────────────────────────

  const runPcVsInternet = useCallback(async () => {
    setPcVsInternetState("running");
    setPcVsInternetResult(null);
    try {
      const resp = await fetch("/api/network/pc-vs-internet");
      if (!resp.ok) throw new Error();
      const result: PcVsInternetResult = await resp.json();
      if (mountedRef.current) { setPcVsInternetResult(result); setPcVsInternetState("done"); }
    } catch {
      if (mountedRef.current) setPcVsInternetState("idle");
    }
  }, []);

  const resetPcVsInternet = useCallback(() => {
    setPcVsInternetState("idle");
    setPcVsInternetResult(null);
  }, []);

  return {
    isMonitoring, monitorPhase, monitorError,
    history, current, spikes, spikesPerMin, health,
    startMonitoring, stopMonitoring, retryMonitoring,
    benchmarkState, benchmarkResult, startBenchmark, runBenchmarkCompare, resetBenchmark,
    pcVsInternetState, pcVsInternetResult, runPcVsInternet, resetPcVsInternet,
  };
}
