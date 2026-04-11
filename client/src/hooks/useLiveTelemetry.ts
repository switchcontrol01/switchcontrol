import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GpuTelemetry {
  load: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  vramPercent: number | null;
  tempC: number | null;
  clockMhz: number | null;
  name: string | null;
}

export interface LiveTelemetry {
  ts: number;
  status: "ready" | "loading";
  cpu: { load: number; speed: number; cores: number };
  ram: { totalGB: number; usedGB: number; usedPercent: number };
  network: { rx_sec: number; tx_sec: number; latency_ms: number };
  temps: { cpu: number | null; gpu: number | null };
  gpu: GpuTelemetry;
  processes: { running: number; total: number };
  load_trend: "rising" | "falling" | "stable";
}

export interface TelemetryHistory {
  cpu: number[];
  ram: number[];
  gpu: (number | null)[];
  vram: (number | null)[];
  rxKbps: number[];
  txKbps: number[];
}

export interface SpikeState {
  cpu: boolean;
  ram: boolean;
  gpu: boolean;
}

export type TelemetryStatus = "loading" | "ready" | "unavailable";

const HISTORY_LEN = 60;
const UNAVAILABLE_TIMEOUT_MS = 8000;
const SPIKE_THRESHOLD = 15; // % jump in one tick = spike

async function buildWsUrl(): Promise<string> {
  // In packaged Electron the page loads via file://, so window.location.host is empty.
  // We must get the local backend port from the Electron bridge instead.
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.isElectron && window.location.protocol === "file:") {
    try {
      let port: number | null = null;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        port = await electronAPI.getBackendPort?.();
        if (typeof port === "number" && port > 0) break;
        await new Promise(r => setTimeout(r, 200));
      }
      if (port) return `ws://127.0.0.1:${port}/ws/telemetry`;
    } catch {}
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${proto}//${host}/ws/telemetry`;
}

function detectSpike(history: (number | null)[], newVal: number | null): boolean {
  if (newVal == null) return false;
  const prev = [...history].reverse().find(v => v != null);
  if (prev == null) return false;
  return Math.abs(newVal - prev) >= SPIKE_THRESHOLD;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLiveTelemetry() {
  const [telemetry, setTelemetry] = useState<LiveTelemetry | null>(null);
  const [history, setHistory] = useState<TelemetryHistory>({
    cpu: [], ram: [], gpu: [], vram: [], rxKbps: [], txKbps: [],
  });
  const [spikes, setSpikes] = useState<SpikeState>({ cpu: false, ram: false, gpu: false });
  const [status, setStatus] = useState<TelemetryStatus>("loading");
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unavailableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spikeResetTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const mountedRef = useRef(true);
  const historyRef = useRef(history);
  historyRef.current = history;

  const clearUnavailableTimer = useCallback(() => {
    if (unavailableTimer.current) { clearTimeout(unavailableTimer.current); unavailableTimer.current = null; }
  }, []);

  const resetSpikeAfter = useCallback((key: keyof SpikeState, ms = 1200) => {
    if (spikeResetTimers.current[key]) clearTimeout(spikeResetTimers.current[key]);
    spikeResetTimers.current[key] = setTimeout(() => {
      if (mountedRef.current) setSpikes(prev => ({ ...prev, [key]: false }));
    }, ms);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Start unavailable timer — if no data arrives within N seconds, mark unavailable
    clearUnavailableTimer();
    unavailableTimer.current = setTimeout(() => {
      if (mountedRef.current && status !== "ready") setStatus("unavailable");
    }, UNAVAILABLE_TIMEOUT_MS);

    buildWsUrl().then((wsUrl) => {
    if (!mountedRef.current) return;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) setConnected(true);
      };

      ws.onmessage = (e) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type !== "telemetry") return;
          const data: LiveTelemetry = msg.data;

          if (data.status === "loading") return; // ignore placeholder payloads

          clearUnavailableTimer();

          setTelemetry(data);
          setStatus("ready");

          const h = historyRef.current;
          const cpuVal = data.cpu.load;
          const ramVal = data.ram.usedPercent;
          const gpuVal = data.gpu?.load ?? null;
          const vramVal = data.gpu?.vramPercent ?? null;

          const cpuSpike = detectSpike(h.cpu, cpuVal);
          const ramSpike = detectSpike(h.ram, ramVal);
          const gpuSpike = detectSpike(h.gpu, gpuVal);

          if (cpuSpike || ramSpike || gpuSpike) {
            setSpikes(prev => ({
              cpu: cpuSpike ? true : prev.cpu,
              ram: ramSpike ? true : prev.ram,
              gpu: gpuSpike ? true : prev.gpu,
            }));
            if (cpuSpike) resetSpikeAfter("cpu");
            if (ramSpike) resetSpikeAfter("ram");
            if (gpuSpike) resetSpikeAfter("gpu");
          }

          setHistory((prev) => {
            const append = <T,>(arr: T[], val: T): T[] => {
              const next = [...arr, val];
              if (next.length > HISTORY_LEN) next.shift();
              return next;
            };
            return {
              cpu: append(prev.cpu, cpuVal),
              ram: append(prev.ram, ramVal),
              gpu: append(prev.gpu, gpuVal),
              vram: append(prev.vram, vramVal),
              rxKbps: append(prev.rxKbps, data.network.rx_sec / 1024),
              txKbps: append(prev.txKbps, data.network.tx_sec / 1024),
            };
          });
        } catch {}
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };
    } catch {
      setStatus("unavailable");
    }
    }).catch(() => { setStatus("unavailable"); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearUnavailableTimer();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      Object.values(spikeResetTimers.current).forEach(t => clearTimeout(t));
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect, clearUnavailableTimer]);

  return { telemetry, history, spikes, status, connected };
}

// ── Formatters ────────────────────────────────────────────────────────────────

export function formatBytes(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
}

export function formatKbps(kbps: number): string {
  if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
  return `${(kbps / 1024).toFixed(2)} MB/s`;
}
