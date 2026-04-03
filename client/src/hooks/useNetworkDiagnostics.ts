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
  after: { avg: number; min: number; max: number; jitter: number; loss: number };
  verdict: {
    latency: "improved" | "unchanged" | "worse";
    jitter: "improved" | "unchanged" | "worse";
    loss: "improved" | "unchanged" | "worse";
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

export type BenchmarkState = "idle" | "baseline" | "waiting" | "comparing" | "done";
export type PcVsInternetState = "idle" | "running" | "done";

export interface DiagnosticsState {
  isMonitoring: boolean;
  history: PingSample[];
  current: PingSample | null;
  spikes: SpikeEvent[];
  spikesPerMin: number;
  health: HealthScore | null;
  startMonitoring: () => void;
  stopMonitoring: () => void;
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
const SPIKE_MULTIPLIER = 1.5;
const SPIKE_MIN_DELTA_MS = 20;

function computeHealth(sample: PingSample, spikesPerMin: number): HealthScore {
  let s = 100;
  s -= Math.min(40, (sample.avg / 100) * 40);
  s -= Math.min(30, (sample.jitter / 20) * 30);
  s -= Math.min(20, (sample.loss / 10) * 20);
  s -= Math.min(10, (spikesPerMin / 5) * 10);
  const score = Math.max(0, Math.round(s));
  const tier: HealthScore["tier"] = score >= 85 ? "Excellent" : score >= 65 ? "Good" : score >= 40 ? "Unstable" : "Poor";
  const color = score >= 85 ? "#10b981" : score >= 65 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  return { score, tier, color };
}

export function useNetworkDiagnostics(): DiagnosticsState {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [history, setHistory] = useState<PingSample[]>([]);
  const [current, setCurrent] = useState<PingSample | null>(null);
  const [spikes, setSpikes] = useState<SpikeEvent[]>([]);
  const [spikesPerMin, setSpikesPerMin] = useState(0);
  const [health, setHealth] = useState<HealthScore | null>(null);
  const [benchmarkState, setBenchmarkState] = useState<BenchmarkState>("idle");
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [pcVsInternetState, setPcVsInternetState] = useState<PcVsInternetState>("idle");
  const [pcVsInternetResult, setPcVsInternetResult] = useState<PcVsInternetResult | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spikeTimestampsRef = useRef<number[]>([]);
  const mountedRef = useRef(true);
  const historyRef = useRef<PingSample[]>([]);

  const fetchSample = useCallback(async () => {
    try {
      const resp = await fetch("/api/network/ping-sample");
      if (!resp.ok || !mountedRef.current) return;
      const sample: PingSample = await resp.json();

      historyRef.current = [...historyRef.current, sample].slice(-HISTORY_MAX);

      if (historyRef.current.length >= 5) {
        const window = historyRef.current.slice(-11, -1);
        const windowAvg = window.reduce((s, p) => s + p.avg, 0) / window.length;
        const isSpike = sample.avg > windowAvg * SPIKE_MULTIPLIER && sample.avg - windowAvg > SPIKE_MIN_DELTA_MS;
        if (isSpike) {
          spikeTimestampsRef.current.push(Date.now());
          setSpikes(prev => [...prev.slice(-9), {
            ts: sample.ts, ping: sample.avg, baselineAvg: parseFloat(windowAvg.toFixed(1)),
          }]);
        }
      }

      const now = Date.now();
      spikeTimestampsRef.current = spikeTimestampsRef.current.filter(t => now - t < 60000);
      const spm = spikeTimestampsRef.current.length;

      setHistory([...historyRef.current]);
      setCurrent(sample);
      setSpikesPerMin(spm);
      setHealth(computeHealth(sample, spm));
    } catch {}
  }, []);

  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return;
    setIsMonitoring(true);
    fetchSample();
    intervalRef.current = setInterval(fetchSample, 2000);
  }, [fetchSample]);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startBenchmark = useCallback(async () => {
    setBenchmarkState("baseline");
    setBenchmarkResult(null);
    try {
      await fetch("/api/network/benchmark/baseline", { method: "POST" });
      if (mountedRef.current) setBenchmarkState("waiting");
    } catch { if (mountedRef.current) setBenchmarkState("idle"); }
  }, []);

  const runBenchmarkCompare = useCallback(async () => {
    setBenchmarkState("comparing");
    try {
      const resp = await fetch("/api/network/benchmark/compare");
      if (!resp.ok) throw new Error();
      const result: BenchmarkResult = await resp.json();
      if (mountedRef.current) { setBenchmarkResult(result); setBenchmarkState("done"); }
    } catch { if (mountedRef.current) setBenchmarkState("idle"); }
  }, []);

  const resetBenchmark = useCallback(() => {
    setBenchmarkState("idle");
    setBenchmarkResult(null);
  }, []);

  const runPcVsInternet = useCallback(async () => {
    setPcVsInternetState("running");
    setPcVsInternetResult(null);
    try {
      const resp = await fetch("/api/network/pc-vs-internet");
      if (!resp.ok) throw new Error();
      const result: PcVsInternetResult = await resp.json();
      if (mountedRef.current) { setPcVsInternetResult(result); setPcVsInternetState("done"); }
    } catch { if (mountedRef.current) setPcVsInternetState("idle"); }
  }, []);

  const resetPcVsInternet = useCallback(() => {
    setPcVsInternetState("idle");
    setPcVsInternetResult(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    isMonitoring, history, current, spikes, spikesPerMin, health,
    startMonitoring, stopMonitoring,
    benchmarkState, benchmarkResult, startBenchmark, runBenchmarkCompare, resetBenchmark,
    pcVsInternetState, pcVsInternetResult, runPcVsInternet, resetPcVsInternet,
  };
}
