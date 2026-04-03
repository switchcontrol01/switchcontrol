import { useEffect, useRef, useState, useCallback } from "react";

export interface LiveTelemetry {
  ts: number;
  cpu: { load: number; speed: number; cores: number };
  ram: { totalGB: number; usedGB: number; usedPercent: number };
  network: { rx_sec: number; tx_sec: number; latency_ms: number };
  temps: { cpu: number | null; gpu: number | null };
  processes: { running: number; total: number };
  load_trend: "rising" | "falling" | "stable";
}

export interface TelemetryHistory {
  cpu: number[];
  ram: number[];
  rxKbps: number[];
  txKbps: number[];
}

const HISTORY_LEN = 30;

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${proto}//${host}/ws/telemetry`;
}

export function useLiveTelemetry() {
  const [telemetry, setTelemetry] = useState<LiveTelemetry | null>(null);
  const [history, setHistory] = useState<TelemetryHistory>({
    cpu: [],
    ram: [],
    rxKbps: [],
    txKbps: [],
  });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    try {
      const ws = new WebSocket(buildWsUrl());
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
          setTelemetry(data);
          setHistory((prev) => {
            const append = <T,>(arr: T[], val: T): T[] => {
              const next = [...arr, val];
              if (next.length > HISTORY_LEN) next.shift();
              return next;
            };
            return {
              cpu: append(prev.cpu, data.cpu.load),
              ram: append(prev.ram, data.ram.usedPercent),
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
    } catch {}
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { telemetry, history, connected };
}

export function formatBytes(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
}

export function formatKbps(kbps: number): string {
  if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
  return `${(kbps / 1024).toFixed(2)} MB/s`;
}
