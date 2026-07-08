import { create } from "zustand";
import type { LiveTelemetry, TelemetryHistory, SpikeState, TelemetryStatus } from "@/hooks/useLiveTelemetry";
import { getAppMode, subscribeToAppMode } from "@/lib/appModeStore";
import { usePerformanceStore } from "@/stores/performanceStore";

// History buffer length obeys ApplicationMode — Light Mode keeps a much
// shorter buffer (releases RAM / reduces per-tick array-copy work) since
// graphs are paused by default in Light Mode anyway.
const HISTORY_LEN_NORMAL = 60;
const HISTORY_LEN_LIGHT = 20;

function currentHistoryLen(): number {
  return getAppMode() === "light" ? HISTORY_LEN_LIGHT : HISTORY_LEN_NORMAL;
}

interface TelemetryStoreState {
  telemetry: LiveTelemetry | null;
  history: TelemetryHistory;
  spikes: SpikeState;
  status: TelemetryStatus;
  connected: boolean;
  lastUpdateTs: number | null;
  // True for a short grace period right after the telemetry manager (re)starts.
  // During this window the backend/PowerShell probes are still spinning up and
  // briefly consume real CPU — that is expected noise, not a genuine system
  // problem, so consumers must not surface spikes/critical alerts while true.
  warmingUp: boolean;

  // ── Batched hot-path updater ─────────────────────────────────────────────────
  // Single set() call per telemetry tick — replaces the previous 3 separate calls
  // (_setTelemetry + _setStatus + _appendHistory) which triggered 3 React render
  // passes per second. Now exactly 1 render pass per tick.
  _onTick: (
    t: LiveTelemetry,
    spikes: SpikeState | null,
    cpu: number,
    ram: number,
    gpu: number | null,
    vram: number | null,
    rxKbps: number,
    txKbps: number,
    diskActiveTime: number | null,
    diskReadKBps: number | null,
    diskWriteKBps: number | null,
  ) => void;

  // ── Individual setters (used for connection state, resets, etc.) ─────────────
  _setStatus: (s: TelemetryStatus) => void;
  _setConnected: (c: boolean) => void;
  _setSpikes: (updater: (prev: SpikeState) => SpikeState) => void;
  _setWarmingUp: (w: boolean) => void;

  // kept for hard-reset only
  _setTelemetry: (t: LiveTelemetry) => void;
  _appendHistory: (
    cpu: number,
    ram: number,
    gpu: number | null,
    vram: number | null,
    rxKbps: number,
    txKbps: number,
    diskActiveTime: number | null,
    diskReadKBps: number | null,
    diskWriteKBps: number | null
  ) => void;
}

// slice(1) + push() is the fastest way to maintain a capped array of small
// fixed size. Cap length is mode-aware (60 Normal / 20 Light). It creates only
// 1 new array object per tick, which is negligible overhead compared to chart
// rendering.
function appendCapped<T>(arr: T[], val: T): T[] {
  const cap = currentHistoryLen();
  if (arr.length < cap) {
    return arr.concat([val]);
  }
  const next = arr.length > cap ? arr.slice(arr.length - cap + 1) : arr.slice(1);
  next.push(val);
  return next;
}

function trimAllHistory(h: TelemetryHistory, cap: number): TelemetryHistory {
  const trim = <T,>(arr: T[]) => (arr.length > cap ? arr.slice(arr.length - cap) : arr);
  return {
    cpu: trim(h.cpu), ram: trim(h.ram), gpu: trim(h.gpu), vram: trim(h.vram),
    rxKbps: trim(h.rxKbps), txKbps: trim(h.txKbps),
    diskActiveTime: trim(h.diskActiveTime), diskReadKBps: trim(h.diskReadKBps), diskWriteKBps: trim(h.diskWriteKBps),
  };
}

export const useTelemetryStore = create<TelemetryStoreState>((set) => ({
  telemetry: null,
  history: {
    cpu: [], ram: [], gpu: [], vram: [],
    rxKbps: [], txKbps: [],
    diskActiveTime: [], diskReadKBps: [], diskWriteKBps: [],
  },
  spikes: { cpu: false, ram: false, gpu: false },
  status: "loading",
  connected: false,
  lastUpdateTs: null,
  warmingUp: true,

  // Single batched update — one React render pass per tick.
  // Also drives the LPM auto-governor via performanceStore._onCpuTick so the
  // performance store never holds its own CPU copy; it derives from us.
  _onTick: (t, newSpikes, cpu, ram, gpu, vram, rxKbps, txKbps, diskActiveTime, diskReadKBps, diskWriteKBps) => {
    // Throttle LPM updates: skip if CPU change < 5% to avoid jitter
    const prevCpu = useTelemetryStore.getState().telemetry?.cpu.load ?? null;
    if (prevCpu == null || Math.abs(cpu - prevCpu) >= 5) {
      usePerformanceStore.getState()._onCpuTick(cpu);
    }
    set((state) => ({
      telemetry: t,
      lastUpdateTs: Date.now(),
      status: "ready",
      ...(newSpikes !== null ? { spikes: newSpikes } : {}),
      history: {
        cpu: appendCapped(state.history.cpu, cpu),
        ram: appendCapped(state.history.ram, ram),
        gpu: appendCapped(state.history.gpu, gpu),
        vram: appendCapped(state.history.vram, vram),
        rxKbps: appendCapped(state.history.rxKbps, rxKbps),
        txKbps: appendCapped(state.history.txKbps, txKbps),
        diskActiveTime: appendCapped(state.history.diskActiveTime, diskActiveTime),
        diskReadKBps: appendCapped(state.history.diskReadKBps, diskReadKBps),
        diskWriteKBps: appendCapped(state.history.diskWriteKBps, diskWriteKBps),
      },
    }));
  },

  _setStatus: (s) => set({ status: s }),
  _setConnected: (c) => set({ connected: c }),
  _setSpikes: (updater) => set((state) => ({ spikes: updater(state.spikes) })),
  _setWarmingUp: (w) => set({ warmingUp: w }),
  _setTelemetry: (t) => set({ telemetry: t, lastUpdateTs: Date.now() }),
  _appendHistory: (cpu, ram, gpu, vram, rxKbps, txKbps, diskActiveTime, diskReadKBps, diskWriteKBps) =>
    set((state) => ({
      history: {
        cpu: appendCapped(state.history.cpu, cpu),
        ram: appendCapped(state.history.ram, ram),
        gpu: appendCapped(state.history.gpu, gpu),
        vram: appendCapped(state.history.vram, vram),
        rxKbps: appendCapped(state.history.rxKbps, rxKbps),
        txKbps: appendCapped(state.history.txKbps, txKbps),
        diskActiveTime: appendCapped(state.history.diskActiveTime, diskActiveTime),
        diskReadKBps: appendCapped(state.history.diskReadKBps, diskReadKBps),
        diskWriteKBps: appendCapped(state.history.diskWriteKBps, diskWriteKBps),
      },
    })),
}));

// Trim history buffers immediately on switch to Light Mode (RAM release)
// instead of waiting for the natural cap to catch up over the next N ticks.
subscribeToAppMode((mode) => {
  if (mode === "light") {
    useTelemetryStore.setState((state) => ({
      history: trimAllHistory(state.history, HISTORY_LEN_LIGHT),
    }));
  }
});
