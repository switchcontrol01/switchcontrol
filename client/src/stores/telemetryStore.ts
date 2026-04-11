import { create } from "zustand";
import type { LiveTelemetry, TelemetryHistory, SpikeState, TelemetryStatus } from "@/hooks/useLiveTelemetry";

const HISTORY_LEN = 60;

interface TelemetryStoreState {
  telemetry: LiveTelemetry | null;
  history: TelemetryHistory;
  spikes: SpikeState;
  status: TelemetryStatus;
  connected: boolean;
  lastUpdateTs: number | null;

  _setTelemetry: (t: LiveTelemetry) => void;
  _setStatus: (s: TelemetryStatus) => void;
  _setConnected: (c: boolean) => void;
  _setSpikes: (updater: (prev: SpikeState) => SpikeState) => void;
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

function appendCapped<T>(arr: T[], val: T): T[] {
  const next = [...arr, val];
  if (next.length > HISTORY_LEN) next.shift();
  return next;
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

  _setTelemetry: (t) => set({ telemetry: t, lastUpdateTs: Date.now() }),
  _setStatus: (s) => set({ status: s }),
  _setConnected: (c) => set({ connected: c }),
  _setSpikes: (updater) => set((state) => ({ spikes: updater(state.spikes) })),
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
