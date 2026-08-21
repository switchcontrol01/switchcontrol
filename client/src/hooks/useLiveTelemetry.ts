import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
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
  status: TelemetryStatus;
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

// All three variants must be kept in sync with LiveTelemetry.status above.
export type TelemetryStatus = "loading" | "ready" | "unavailable";

// ── Hook ───────────────────────────────────────────────────────────────────────
//
// All state lives in useTelemetryStore (Zustand singleton). This hook just
// ensures the manager is running and returns the current store slice.
//
// useShallow is used so that the returned object reference only changes when
// one of the selected fields actually changes — not on every unrelated set().
// This prevents consumers from re-rendering when e.g. only `lastUpdateTs`
// changed but not the fields they use.

export function useLiveTelemetry() {
  useTelemetryManager();

  return useTelemetryStore(
    useShallow((s) => ({
      telemetry: s.telemetry,
      history: s.history,
      spikes: s.spikes,
      status: s.status,
      connected: s.connected,
      warmingUp: s.warmingUp,
    }))
  );
}

function useTelemetryManager() {
  useEffect(() => {
    // Fire-and-forget: telemetry is intended to run for the full app lifetime,
    // so there is deliberately no stop() on unmount. start() is idempotent —
    // calling it when already running is a silent no-op, so multiple concurrent
    // consumers of this hook are safe.
    // A route transition can briefly pause the singleton while the route-demand
    // effect and the global visibility/preference effects settle. If this is an
    // active telemetry route, resume that existing manager instead of relying on
    // startWhenIdle() (which intentionally does nothing once _started is true).
    if (telemetryManager.demandMode !== "paused") {
      telemetryManager.resume();
    } else {
      telemetryManager.startWhenIdle();
    }
  }, []);
}

export function useLiveTelemetryValues() {
  useTelemetryManager();

  return useTelemetryStore(
    useShallow((s) => ({
      telemetry: s.telemetry,
      spikes: s.spikes,
      status: s.status,
      connected: s.connected,
      warmingUp: s.warmingUp,
    }))
  );
}

export function useTelemetryHistory() {
  useTelemetryManager();
  return useTelemetryStore((s) => s.history);
}

// ── Formatters ─────────────────────────────────────────────────────────────────

export function formatBytes(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
}

export function formatKbps(kbps: number): string {
  if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
  return `${(kbps / 1024).toFixed(1)} MB/s`; // 1 decimal — consistent with formatBytes
}
