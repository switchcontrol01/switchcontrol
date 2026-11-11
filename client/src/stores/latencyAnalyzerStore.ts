/**
 * latencyAnalyzerStore.ts
 *
 * Zustand store for Latency Analyzer page state.
 * Keeps analysis session data, chart samples, baseline comparison,
 * and UI state separate from the page component.
 */

import { create } from "zustand";
import {
  MAX_CHART_SAMPLES,
  LA_BASELINE_KEY,
} from "@/lib/latency-analyzer-config";
import {
  createMeasuredCapture,
  isAudioDeviceInventory,
  isDriverInventoryRow,
  summarizeCounterSamples,
  validateCounterSample,
  validateStoredCapture,
  type AudioDeviceInventory,
  type DriverInventoryRow,
  type MeasuredCapture,
  type NativeCounterSample,
} from "@/lib/responsivenessMetrics";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChartSample {
  ts: number;         // epoch ms
  elapsed: number;    // seconds since start
  dpcPct: number;
  intrPct: number;
  pageFaultsSec: number;
}

export type DriverRow = DriverInventoryRow;
export type AudioDevice = AudioDeviceInventory;
export type AnalysisResult = MeasuredCapture;

export type SessionStatus =
  | "idle"
  | "starting"
  | "collecting"
  | "stopping"
  | "stopped"
  | "error";

interface LatencyAnalyzerState {
  // session
  sessionStatus: SessionStatus;
  sessionError: string | null;
  startedAt: number | null;
  elapsedSec: number;
  sampleCount: number;
  durationSec: number; // user-chosen analysis duration (0 = unlimited)
  lastSampleAt: number | null;
  lastSampleError: string | null;
  rejectedSampleCount: number;
  counterSamples: NativeCounterSample[];

  // live values
  liveDpcPct: number | null;
  liveIntrPct: number | null;
  livePageFaultsSec: number | null;

  // accumulated
  dpcPctHistory: number[];
  intrPctHistory: number[];
  pageFaultsHistory: number[];
  chartSamples: ChartSample[];

  // derived
  avgDpcPct: number;
  avgIntrPct: number;
  avgPageFaultsSec: number;
  peakDpcPct: number;
  peakIntrPct: number;
  peakPageFaultsSec: number;

  // drivers & audio
  drivers: DriverRow[];
  driversScanned: boolean;   // true once scanDrivers() has resolved (even if list is empty)
  audioDevices: AudioDevice[];
  isAdmin: boolean;

  // baseline comparison
  baseline: AnalysisResult | null;
  baselineError: string | null;
  currentResult: AnalysisResult | null;

  // notes for current test
  testLabel: string;

  // actions
  setDuration: (sec: number) => void;
  setSessionStatus: (s: SessionStatus, err?: string) => void;
  setStartedAt: (ts: number) => void;
  tick: () => void;
  pushSample: (s: unknown) => boolean;
  setDrivers: (d: DriverRow[]) => void;
  setDriversScanned: (v: boolean) => void;
  setAudioDevices: (d: AudioDevice[]) => void;
  setIsAdmin: (v: boolean) => void;
  setTestLabel: (l: string) => void;
  finalize: (completion?: MeasuredCapture["completion"]) => AnalysisResult | null;
  saveBaseline: () => boolean;
  loadBaseline: () => void;
  clearBaseline: () => void;
  reset: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function peak(arr: number[]): number {
  if (!arr.length) return 0;
  return Math.max(...arr);
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useLatencyAnalyzerStore = create<LatencyAnalyzerState>((set, get) => ({
  sessionStatus: "idle",
  sessionError: null,
  startedAt: null,
  elapsedSec: 0,
  sampleCount: 0,
  durationSec: 60,
  lastSampleAt: null,
  lastSampleError: null,
  rejectedSampleCount: 0,
  counterSamples: [],

  liveDpcPct: null,
  liveIntrPct: null,
  livePageFaultsSec: null,

  dpcPctHistory: [],
  intrPctHistory: [],
  pageFaultsHistory: [],
  chartSamples: [],

  avgDpcPct: 0,
  avgIntrPct: 0,
  avgPageFaultsSec: 0,
  peakDpcPct: 0,
  peakIntrPct: 0,
  peakPageFaultsSec: 0,

  drivers: [],
  driversScanned: false,
  audioDevices: [],
  isAdmin: false,

  baseline: null,
  baselineError: null,
  currentResult: null,
  testLabel: "",

  setDuration: (sec) => set({ durationSec: sec }),

  setSessionStatus: (s, err) =>
    set({ sessionStatus: s, sessionError: err ?? null }),

  setStartedAt: (ts) => set({ startedAt: ts, elapsedSec: 0 }),

  tick: () => {
    const { startedAt } = get();
    if (!startedAt) return;
    set({ elapsedSec: Math.floor((Date.now() - startedAt) / 1000) });
  },

  pushSample: (raw) => {
    const parsed = validateCounterSample(raw);
    const st = get();
    if (!parsed.valid || !parsed.sample || (st.lastSampleAt != null && parsed.sample.sampledAt <= st.lastSampleAt)) {
      set({
        lastSampleError: parsed.reason ?? "A duplicate or out-of-order native sample was rejected.",
        rejectedSampleCount: st.rejectedSampleCount + 1,
      });
      return false;
    }
    const sample = parsed.sample;
    const samples = [...st.counterSamples, sample];
    const summary = summarizeCounterSamples(samples)!;
    const dpcH = [...st.dpcPctHistory, sample.dpcPct];
    const intrH = [...st.intrPctHistory, sample.interruptPct];
    const pfH = [...st.pageFaultsHistory, sample.pageFaultsPerSec];
    const chartSample: ChartSample = {
      ts: sample.sampledAt,
      elapsed: Math.max(0, (sample.sampledAt - (st.startedAt ?? sample.sampledAt)) / 1000),
      dpcPct: sample.dpcPct,
      intrPct: sample.interruptPct,
      pageFaultsSec: sample.pageFaultsPerSec,
    };
    set({
      counterSamples: samples,
      lastSampleAt: sample.sampledAt,
      lastSampleError: null,
      liveDpcPct: sample.dpcPct,
      liveIntrPct: sample.interruptPct,
      livePageFaultsSec: sample.pageFaultsPerSec,
      dpcPctHistory: dpcH,
      intrPctHistory: intrH,
      pageFaultsHistory: pfH,
      chartSamples: [...st.chartSamples, chartSample].slice(-MAX_CHART_SAMPLES),
      sampleCount: summary.sampleCount,
      avgDpcPct: summary.meanDpcPct,
      avgIntrPct: summary.meanInterruptPct,
      avgPageFaultsSec: summary.meanPageFaultsPerSec,
      peakDpcPct: summary.peakDpcPct,
      peakIntrPct: summary.peakInterruptPct,
      peakPageFaultsSec: summary.peakPageFaultsPerSec,
    });
    return true;
  },

  setDrivers: (d) => set({ drivers: d.filter(isDriverInventoryRow).map(({ name, description, type, state }) => ({ name, description, type, state })) }),
  setDriversScanned: (v) => set({ driversScanned: v }),
  setAudioDevices: (d) => set({ audioDevices: d.filter(isAudioDeviceInventory) }),
  setIsAdmin: (v) => set({ isAdmin: v }),
  setTestLabel: (l) => set({ testLabel: l }),

  finalize: (completion = "completed") => {
    const st = get();
    const result = createMeasuredCapture(st.counterSamples, {
      label: st.testLabel,
      completion,
      drivers: st.drivers,
      audioDevices: st.audioDevices,
      isAdmin: st.isAdmin,
    });
    set({ currentResult: result });
    return result;
  },

  saveBaseline: () => {
    const { currentResult } = get();
    const valid = validateStoredCapture(currentResult);
    if (!valid) {
      set({ baselineError: "A completed capture with at least 8 valid samples is required for a baseline." });
      return false;
    }
    try {
      localStorage.setItem(LA_BASELINE_KEY, JSON.stringify(valid));
      set({ baseline: valid, baselineError: null });
      return true;
    } catch {
      set({ baselineError: "The measured baseline could not be saved to local storage." });
      return false;
    }
  },

  loadBaseline: () => {
    try {
      const raw = localStorage.getItem(LA_BASELINE_KEY);
      if (!raw) return;
      const valid = validateStoredCapture(JSON.parse(raw));
      if (!valid) {
        localStorage.removeItem(LA_BASELINE_KEY);
        set({ baseline: null, baselineError: "An older or invalid baseline was not loaded. Capture a new measured baseline." });
        return;
      }
      set({ baseline: valid, baselineError: null });
    } catch {
      set({ baseline: null, baselineError: "The saved baseline could not be read." });
    }
  },

  clearBaseline: () => {
    try {
      localStorage.removeItem(LA_BASELINE_KEY);
      set({ baseline: null, baselineError: null });
    } catch {
      set({ baselineError: "The saved baseline could not be removed." });
    }
  },

  reset: () =>
    set({
      sessionStatus: "idle",
      sessionError: null,
      startedAt: null,
      elapsedSec: 0,
      sampleCount: 0,
      lastSampleAt: null,
      lastSampleError: null,
      rejectedSampleCount: 0,
      counterSamples: [],
      liveDpcPct: null,
      liveIntrPct: null,
      livePageFaultsSec: null,
      dpcPctHistory: [],
      intrPctHistory: [],
      pageFaultsHistory: [],
      chartSamples: [],
      avgDpcPct: 0,
      avgIntrPct: 0,
      avgPageFaultsSec: 0,
      peakDpcPct: 0,
      peakIntrPct: 0,
      peakPageFaultsSec: 0,
      drivers: [],
      driversScanned: false,
      audioDevices: [],
      currentResult: null,
      testLabel: "",
    }),
}));
