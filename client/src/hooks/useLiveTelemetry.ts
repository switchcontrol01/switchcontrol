import { useEffect } from "react";
import { telemetryManager } from "@/lib/telemetryManager";
import { useTelemetryStore } from "@/stores/telemetryStore";

// ── Types (exported so other files can import them) ────────────────────────────

export interface GpuTelemetry {
  load: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  vramPercent: number | null;
  tempC: number | null;
  clockMhz: number | null;
  name: string | null;
}

export interface DiskTelemetry {
  activeTimePct: number | null;
  readKBps: number | null;
  writeKBps: number | null;
  available: boolean;
}

export interface LiveTelemetry {
  ts: number;
  status: "ready" | "loading";
  cpu: { load: number; speed: number; cores: number };
  ram: { totalGB: number; usedGB: number; usedPercent: number };
  network: { rx_sec: number; tx_sec: number; latency_ms: number };
  temps: { cpu: number | null; gpu: number | null };
  gpu: GpuTelemetry;
  disk: DiskTelemetry;
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
  diskActiveTime: (number | null)[];
  diskReadKBps: (number | null)[];
  diskWriteKBps: (number | null)[];
}

export interface SpikeState {
  cpu: boolean;
  ram: boolean;
  gpu: boolean;
}

export type TelemetryStatus = "loading" | "ready" | "unavailable";

// ── Hook ───────────────────────────────────────────────────────────────────────
//
// All state lives in useTelemetryStore (Zustand singleton). This hook just
// ensures the manager is running and returns the current store slice.
// Navigating away from a page that uses this hook no longer resets anything —
// the manager and store survive the full app lifetime.

export function useLiveTelemetry() {
  useEffect(() => {
    // Idempotent — calling start() when already running is a no-op.
    telemetryManager.start();
    console.log("[Telemetry] subscription resumed — reading from persistent store");
  }, []);

  const { telemetry, history, spikes, status, connected } = useTelemetryStore();
  return { telemetry, history, spikes, status, connected };
}

// ── Formatters ─────────────────────────────────────────────────────────────────

export function formatBytes(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
}

export function formatKbps(kbps: number): string {
  if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
  return `${(kbps / 1024).toFixed(2)} MB/s`;
}
