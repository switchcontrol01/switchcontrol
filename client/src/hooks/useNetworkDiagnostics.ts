import { useState, useEffect, useRef, useCallback } from "react";
import { cloudApiPost } from "@/lib/cloud-api";
import { useAppModeStore, getPollingMultiplier } from "@/lib/appModeStore";

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

export interface DnsProviderResult {
  id: string;
  label: string;
  ip: string;
  local?: boolean;
  avg: number;
  median: number;
  min: number;
  max: number;
  jitter: number;
  loss: number;
  stabilityScore: number;
  rank: number;
}

export interface DnsBenchmarkResult {
  providers: DnsProviderResult[];
  localResolvers?: Array<{ id: string; label: string; ip: string }>;
  recommended: string;
  recommendedReasons: string[];
  confidence: "very_high" | "high" | "medium" | "low";
  categoryWinners: {
    bestOverall: string;
    lowestLatency: string;
    lowestJitter: string;
    mostStable: string;
    bestGaming: string;
  };
  inconclusive?: boolean;
  ts: number;
}

export type BenchmarkState     = "idle" | "baseline" | "waiting" | "comparing" | "done" | "error";
export type PcVsInternetState  = "idle" | "running" | "done" | "error";
export type DnsBenchmarkState  = "idle" | "running" | "done" | "error";
export type ApplyDnsState      = "idle" | "loading" | "done" | "error" | "cancelled";
export type MonitorPhase       = "off" | "starting" | "live" | "error";

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
  benchmarkError: string | null;
  benchmarkResult: BenchmarkResult | null;
  startBenchmark: () => Promise<void>;
  runBenchmarkCompare: () => Promise<void>;
  resetBenchmark: () => void;
  pcVsInternetState: PcVsInternetState;
  pcVsInternetResult: PcVsInternetResult | null;
  pcVsInternetError: string | null;
  runPcVsInternet: () => Promise<void>;
  resetPcVsInternet: () => void;
  dnsBenchmarkState: DnsBenchmarkState;
  dnsBenchmarkResult: DnsBenchmarkResult | null;
  dnsBenchmarkError: string | null;
  runDnsBenchmark: () => Promise<void>;
  resetDnsBenchmark: () => void;
  applyDnsState: ApplyDnsState;
  applyDnsError: string | null;
  applyDns: (ip: string) => Promise<void>;
}

const HISTORY_MAX = 60;
// The server allows one expensive multi-target probe every 30 seconds.
const BASE_POLL_INTERVAL_MS = 30_000;
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
  const [monitorPhase, setMonitorPhase]     = useState<MonitorPhase>("off");
  const [monitorError, setMonitorError]     = useState<string | null>(null);
  const [history, setHistory]               = useState<PingSample[]>([]);
  const [current, setCurrent]               = useState<PingSample | null>(null);
  const [spikes, setSpikes]                 = useState<SpikeEvent[]>([]);
  const [spikesPerMin, setSpikesPerMin]     = useState(0);
  const [health, setHealth]                 = useState<HealthScore | null>(null);
  const [benchmarkState, setBenchmarkState] = useState<BenchmarkState>("idle");
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [pcVsInternetState, setPcVsInternetState] = useState<PcVsInternetState>("idle");
  const [pcVsInternetResult, setPcVsInternetResult] = useState<PcVsInternetResult | null>(null);
  const [pcVsInternetError, setPcVsInternetError] = useState<string | null>(null);
  const [dnsBenchmarkState, setDnsBenchmarkState]   = useState<DnsBenchmarkState>("idle");
  const [dnsBenchmarkResult, setDnsBenchmarkResult] = useState<DnsBenchmarkResult | null>(null);
  const [dnsBenchmarkError, setDnsBenchmarkError]   = useState<string | null>(null);
  const [applyDnsState, setApplyDnsState]           = useState<ApplyDnsState>("idle");
  const [applyDnsError, setApplyDnsError]           = useState<string | null>(null);
  const applyDnsResetRef                            = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pollTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spikeTimestampsRef = useRef<number[]>([]);
  const mountedRef         = useRef(true);
  // Polling remains active only after the user explicitly starts a scan.
  const appMode = useAppModeStore((s) => s.mode);
  const historyRef         = useRef<PingSample[]>([]);
  const consecutiveFailRef = useRef(0);
  const sampleInFlightRef = useRef(false);
  const monitoringRef = useRef(false);
  const nextPollDelayRef = useRef<number | null>(null);

  const fetchSample = useCallback(async () => {
    if (sampleInFlightRef.current || document.hidden) return;
    sampleInFlightRef.current = true;
    console.info("[NetworkDiagnostics]", JSON.stringify({ event: "ping_request_started", ts: new Date().toISOString() }));
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 12000);
      const resp = await fetch("/api/network/ping-sample", { signal: controller.signal });
      clearTimeout(tid);

      if (!mountedRef.current) return;

       if (!resp.ok) {
          console.warn("[NetworkDiagnostics]", JSON.stringify({ event: "ping_response", status: resp.status, ts: new Date().toISOString() }));
          if (resp.status === 429) {
           let retryAfter = 30;
           try {
             const body = await resp.json() as { retryAfter?: number };
             if (typeof body.retryAfter === "number") {
               retryAfter = Math.max(1, Math.ceil(body.retryAfter));
             }
           } catch {}
           throw new Error(`Probe cooldown active — try again in ${retryAfter}s`);
         }
         throw new Error(`Server returned ${resp.status}`);
       }

      const sample: PingSample = await resp.json();
       console.info("[NetworkDiagnostics]", JSON.stringify({ event: "ping_response", status: resp.status, partial: sample.loss > 0, loss: sample.loss, ts: new Date().toISOString() }));
      if (typeof sample?.avg !== "number" || typeof sample?.ts !== "number") {
        throw new Error("Malformed sample from server");
      }

      consecutiveFailRef.current = 0;
      historyRef.current = [...historyRef.current, sample].slice(-HISTORY_MAX);

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
        : err instanceof Error ? err.message : "Unknown error";

      consecutiveFailRef.current++;
      console.warn("[NetworkDiagnostics]", JSON.stringify({ event: "ping_failed", timeout: isAbort, consecutiveFailures: consecutiveFailRef.current, error: msg, ts: new Date().toISOString() }));
      if (err instanceof Error && err.message.startsWith("Probe cooldown active")) {
        const retryAfter = Number(err.message.match(/in (\d+)s/)?.[1] ?? 30);
        // A 429 is an expected server-side pacing response, not a broken
        // monitor. Back off beyond the advertised window and keep the
        // existing live/starting state so the graph does not flash red.
        nextPollDelayRef.current = Math.max(1_000, (retryAfter + 1) * 1_000);
        console.info("[NetworkDiagnostics]", JSON.stringify({
          event: "ping_backoff",
          retryAfter,
          nextPollInMs: nextPollDelayRef.current,
          ts: new Date().toISOString(),
        }));
      } else if (consecutiveFailRef.current >= 2) {
        setMonitorError(msg);
        setMonitorPhase("error");
      }
    } finally {
      sampleInFlightRef.current = false;
    }
  }, []);

  const scheduleNextPoll = useCallback((delayMs?: number) => {
    if (!monitoringRef.current || sampleInFlightRef.current) return;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    const delay = delayMs ?? nextPollDelayRef.current ?? Math.round(BASE_POLL_INTERVAL_MS * getPollingMultiplier());
    nextPollDelayRef.current = null;
    pollTimerRef.current = setTimeout(() => {
      pollTimerRef.current = null;
      void fetchSample().finally(() => scheduleNextPoll());
    }, Math.max(1_000, delay));
  }, [fetchSample]);

  const startMonitoring = useCallback(() => {
    if (document.hidden) return;
    if (monitoringRef.current) return;
    consecutiveFailRef.current = 0;
    historyRef.current = [];
    monitoringRef.current = true;
    setIsMonitoring(true);
    setMonitorPhase("starting");
    setMonitorError(null);
    setHistory([]);
    setCurrent(null);
    setSpikes([]);
    setSpikesPerMin(0);
    setHealth(null);
    console.info("[NetworkDiagnostics]", JSON.stringify({ event: "monitoring_started", ts: new Date().toISOString() }));
    spikeTimestampsRef.current = [];
    void fetchSample().finally(() => scheduleNextPoll());
  }, [fetchSample, scheduleNextPoll]);

  const stopMonitoring = useCallback(() => {
    console.info("[NetworkDiagnostics]", JSON.stringify({ event: "monitoring_stopped", ts: new Date().toISOString() }));
    monitoringRef.current = false;
    setIsMonitoring(false);
    setMonitorPhase("off");
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const retryMonitoring = useCallback(() => {
    monitoringRef.current = false;
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    startMonitoring();
  }, [startMonitoring]);

  // Reschedule the live interval immediately when ApplicationMode changes
  // while monitoring is already active, instead of waiting for the old tick.
  useEffect(() => {
    if (!monitoringRef.current || sampleInFlightRef.current) return;
    scheduleNextPoll();
  }, [appMode, scheduleNextPoll]);

  useEffect(() => {
    mountedRef.current = true;

    const handleVisibility = () => {
      if (document.hidden) stopMonitoring();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      monitoringRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [stopMonitoring]);

  // ── Benchmark ────────────────────────────────────────────────────────────────

  const startBenchmark = useCallback(async () => {
    console.info("[NetworkDiagnostics]", JSON.stringify({ event: "benchmark_started", phase: "baseline", ts: new Date().toISOString() }));
    setBenchmarkState("baseline");
    setBenchmarkResult(null);
    setBenchmarkError(null);
    try {
      await cloudApiPost("/network/benchmark/baseline");
      if (mountedRef.current) setBenchmarkState("waiting");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Baseline sampling failed";
      console.warn("[NetworkDiagnostics]", JSON.stringify({ event: "benchmark_failed", phase: "baseline", error: msg, ts: new Date().toISOString() }));
      if (mountedRef.current) { setBenchmarkError(msg); setBenchmarkState("error"); }
    }
  }, []);

  const runBenchmarkCompare = useCallback(async () => {
    console.info("[NetworkDiagnostics]", JSON.stringify({ event: "benchmark_started", phase: "comparison", ts: new Date().toISOString() }));
    setBenchmarkState("comparing");
    try {
      const resp = await fetch("/api/network/benchmark/compare");
      if (!resp.ok) throw new Error();
      const result: BenchmarkResult = await resp.json();
      if (mountedRef.current) {
        setBenchmarkResult(result);
        setBenchmarkError(null);
        setBenchmarkState("done");
        console.info("[NetworkDiagnostics]", JSON.stringify({ event: "benchmark_completed", phase: "comparison", ts: new Date().toISOString() }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Comparison failed";
      console.warn("[NetworkDiagnostics]", JSON.stringify({ event: "benchmark_failed", phase: "comparison", error: msg, ts: new Date().toISOString() }));
      if (mountedRef.current) { setBenchmarkError(msg); setBenchmarkState("error"); }
    }
  }, []);

  const resetBenchmark = useCallback(() => {
    setBenchmarkState("idle");
    setBenchmarkResult(null);
    setBenchmarkError(null);
  }, []);

  // ── PC vs Internet ────────────────────────────────────────────────────────────

  const runPcVsInternet = useCallback(async () => {
    console.info("[NetworkDiagnostics]", JSON.stringify({ event: "pc_vs_internet_started", ts: new Date().toISOString() }));
    setPcVsInternetState("running");
    setPcVsInternetResult(null);
    setPcVsInternetError(null);
    try {
      const resp = await fetch("/api/network/pc-vs-internet");
      if (!resp.ok) throw new Error();
      const result: PcVsInternetResult = await resp.json();
      if (mountedRef.current) { setPcVsInternetResult(result); setPcVsInternetState("done"); console.info("[NetworkDiagnostics]", JSON.stringify({ event: "pc_vs_internet_completed", verdict: result.verdict, ts: new Date().toISOString() })); }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Diagnostic failed";
      console.warn("[NetworkDiagnostics]", JSON.stringify({ event: "pc_vs_internet_failed", error: msg, ts: new Date().toISOString() }));
      if (mountedRef.current) { setPcVsInternetError(msg); setPcVsInternetState("error"); }
    }
  }, []);

  const resetPcVsInternet = useCallback(() => {
    setPcVsInternetState("idle");
    setPcVsInternetResult(null);
    setPcVsInternetError(null);
  }, []);

  // ── DNS Benchmark ─────────────────────────────────────────────────────────────

  const runDnsBenchmark = useCallback(async () => {
    console.info("[NetworkDiagnostics]", JSON.stringify({ event: "dns_benchmark_started", desktop: !!(window as any).electronAPI?.dns?.benchmark, ts: new Date().toISOString() }));
    setDnsBenchmarkState("running");
    setDnsBenchmarkResult(null);
    setDnsBenchmarkError(null);
    try {
      const electronDns = (window as any).electronAPI?.dns;
      let result: DnsBenchmarkResult;

      if (electronDns?.benchmark) {
        // Run benchmark locally on the user's PC via Electron IPC
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 20_000);
        try {
          result = await Promise.race([
            electronDns.benchmark(),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Benchmark timed out")), 20_000)),
          ]);
        } finally {
          clearTimeout(tid);
        }
      } else {
        // Fall back to server endpoint (web / non-Electron)
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 20_000);
        const resp = await fetch("/api/network/dns-benchmark", { signal: controller.signal });
        clearTimeout(tid);
        if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
        result = await resp.json();
      }

      if (mountedRef.current) {
        setDnsBenchmarkResult(result);
        setDnsBenchmarkState("done");

        // The Apply button must reflect the real Windows resolver state, not
        // the short-lived React state from the previous session. The Electron
        // benchmark returns the currently configured DNS servers in
        // localResolvers, so reconcile the recommendation after every scan
        // (including scans performed after an app or PC restart).
        const recommendedProvider = result.providers.find(
          provider => provider.id === result.recommended,
        );
        const activeResolverIps = new Set(
          (result.localResolvers ?? []).map(resolver => resolver.ip),
        );
        if (recommendedProvider && activeResolverIps.has(recommendedProvider.ip)) {
          setApplyDnsState("done");
          setApplyDnsError(null);
        } else {
          setApplyDnsState("idle");
        }
        console.info("[NetworkDiagnostics]", JSON.stringify({ event: "dns_benchmark_completed", providers: result.providers?.length ?? 0, partial: result.inconclusive === true || (result.providers ?? []).some(p => p.loss >= 100), ts: new Date().toISOString() }));
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : "Benchmark failed";
      setDnsBenchmarkError(msg);
      setDnsBenchmarkState("error");
      console.warn("[NetworkDiagnostics]", JSON.stringify({ event: "dns_benchmark_failed", error: msg, ts: new Date().toISOString() }));
    }
  }, []);

  const resetDnsBenchmark = useCallback(() => {
    setDnsBenchmarkState("idle");
    setDnsBenchmarkResult(null);
    setDnsBenchmarkError(null);
  }, []);

  // ── Apply DNS ─────────────────────────────────────────────────────────────────

  const applyDns = useCallback(async (ip: string) => {
    if (applyDnsResetRef.current) clearTimeout(applyDnsResetRef.current);
    setApplyDnsState("loading");
    setApplyDnsError(null);
    console.info("[NetworkDiagnostics]", JSON.stringify({ event: "dns_apply_started", ts: new Date().toISOString() }));
    try {
      const result = await (window as any).electronAPI?.dns?.applyDns(ip);
      if (!mountedRef.current) return;
      if (result?.cancelled) {
        setApplyDnsState("cancelled");
        applyDnsResetRef.current = setTimeout(() => {
          if (mountedRef.current) setApplyDnsState("idle");
        }, 5_000);
      } else if (result?.ok) {
        setApplyDnsState("done");
        console.info("[NetworkDiagnostics]", JSON.stringify({ event: "dns_apply_completed", ok: true, ts: new Date().toISOString() }));
        applyDnsResetRef.current = setTimeout(() => {
          if (mountedRef.current) setApplyDnsState("idle");
        }, 8_000);
      } else {
        throw new Error(result?.error ?? "Apply DNS failed");
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setApplyDnsError(err instanceof Error ? err.message : "Apply DNS failed");
      setApplyDnsState("error");
      console.warn("[NetworkDiagnostics]", JSON.stringify({ event: "dns_apply_failed", error: err instanceof Error ? err.message : "Apply DNS failed", ts: new Date().toISOString() }));
      applyDnsResetRef.current = setTimeout(() => {
        if (mountedRef.current) { setApplyDnsState("idle"); setApplyDnsError(null); }
      }, 8_000);
    }
  }, []);

  return {
    isMonitoring, monitorPhase, monitorError,
    history, current, spikes, spikesPerMin, health,
    startMonitoring, stopMonitoring, retryMonitoring,
    benchmarkState, benchmarkResult, benchmarkError, startBenchmark, runBenchmarkCompare, resetBenchmark,
    pcVsInternetState, pcVsInternetResult, pcVsInternetError, runPcVsInternet, resetPcVsInternet,
    dnsBenchmarkState, dnsBenchmarkResult, dnsBenchmarkError, runDnsBenchmark, resetDnsBenchmark,
    applyDnsState, applyDnsError, applyDns,
  };
}
