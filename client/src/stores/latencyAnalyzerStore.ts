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
  computeOverallScore,
  scoreToStatus,
  type LatencyStatus,
} from "@/lib/latency-analyzer-config";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChartSample {
  ts: number;         // epoch ms
  elapsed: number;    // seconds since start
  dpcPct: number;
  intrPct: number;
  pageFaultsSec: number;
}

export interface DriverRow {
  name: string;
  description: string;
  type: string;
  state: string;
  // extended (may be null when not determinable in user mode)
  dpcCount: null;
  isrCount: null;
  highestExec: null;
  totalExec: null;
  impact: "Low" | "Medium" | "High" | "Unknown";
  suggestedAction: string;
}

export interface AudioDevice {
  name: string;
  manufacturer: string;
  status: string;
}

export interface AnalysisResult {
  id: string;
  label: string;
  timestamp: number;
  durationSec: number;
  sampleCount: number;
  avgDpcPct: number;
  avgIntrPct: number;
  peakDpcPct: number;
  peakIntrPct: number;
  avgPageFaultsSec: number;
  peakPageFaultsSec: number;
  overallScore: number;
  status: LatencyStatus;
  drivers: DriverRow[];
  audioDevices: AudioDevice[];
  isAdmin: boolean;
}

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
  overallScore: number;
  status: LatencyStatus;

  // drivers & audio
  drivers: DriverRow[];
  driversScanned: boolean;   // true once scanDrivers() has resolved (even if list is empty)
  audioDevices: AudioDevice[];
  isAdmin: boolean;

  // baseline comparison
  baseline: AnalysisResult | null;
  currentResult: AnalysisResult | null;

  // notes for current test
  testLabel: string;

  // actions
  setDuration: (sec: number) => void;
  setSessionStatus: (s: SessionStatus, err?: string) => void;
  setStartedAt: (ts: number) => void;
  tick: () => void;
  pushSample: (s: { dpcPct: number; intrPct: number; pageFaultsSec: number }) => void;
  setDrivers: (d: DriverRow[]) => void;
  setDriversScanned: (v: boolean) => void;
  setAudioDevices: (d: AudioDevice[]) => void;
  setIsAdmin: (v: boolean) => void;
  setTestLabel: (l: string) => void;
  finalize: () => AnalysisResult;
  saveBaseline: () => void;
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

function makeId(): string {
  return `la-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useLatencyAnalyzerStore = create<LatencyAnalyzerState>((set, get) => ({
  sessionStatus: "idle",
  sessionError: null,
  startedAt: null,
  elapsedSec: 0,
  sampleCount: 0,
  durationSec: 60,

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
  overallScore: 0,
  status: "Not enough data",

  drivers: [],
  driversScanned: false,
  audioDevices: [],
  isAdmin: false,

  baseline: null,
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

  pushSample: ({ dpcPct, intrPct, pageFaultsSec }) =>
    set((st) => {
      const dpcH   = [...st.dpcPctHistory, dpcPct];
      const intrH  = [...st.intrPctHistory, intrPct];
      const pfH    = [...st.pageFaultsHistory, pageFaultsSec];
      const n      = dpcH.length;

      const avgDpc = avg(dpcH);
      const avgInt = avg(intrH);
      const avgPf  = avg(pfH);
      const score  = computeOverallScore(avgDpc, avgInt, avgPf);
      const elapsed = st.startedAt ? Math.floor((Date.now() - st.startedAt) / 1000) : 0;

      const newSample: ChartSample = {
        ts: Date.now(),
        elapsed,
        dpcPct,
        intrPct,
        pageFaultsSec,
      };

      const chart = [...st.chartSamples, newSample].slice(-MAX_CHART_SAMPLES);

      return {
        liveDpcPct: dpcPct,
        liveIntrPct: intrPct,
        livePageFaultsSec: pageFaultsSec,
        dpcPctHistory: dpcH,
        intrPctHistory: intrH,
        pageFaultsHistory: pfH,
        chartSamples: chart,
        sampleCount: n,
        avgDpcPct: avgDpc,
        avgIntrPct: avgInt,
        avgPageFaultsSec: avgPf,
        peakDpcPct: peak(dpcH),
        peakIntrPct: peak(intrH),
        peakPageFaultsSec: peak(pfH),
        overallScore: score,
        status: scoreToStatus(score, n, elapsed),
      };
    }),

  setDrivers: (d) => set({ drivers: d }),
  setDriversScanned: (v) => set({ driversScanned: v }),
  setAudioDevices: (d) => set({ audioDevices: d }),
  setIsAdmin: (v) => set({ isAdmin: v }),
  setTestLabel: (l) => set({ testLabel: l }),

  finalize: () => {
    const st = get();
    const result: AnalysisResult = {
      id: makeId(),
      label: st.testLabel || "Test Result",
      timestamp: Date.now(),
      durationSec: st.elapsedSec,
      sampleCount: st.sampleCount,
      avgDpcPct: st.avgDpcPct,
      avgIntrPct: st.avgIntrPct,
      peakDpcPct: st.peakDpcPct,
      peakIntrPct: st.peakIntrPct,
      avgPageFaultsSec: st.avgPageFaultsSec,
      peakPageFaultsSec: st.peakPageFaultsSec,
      overallScore: st.overallScore,
      status: st.status,
      drivers: st.drivers,
      audioDevices: st.audioDevices,
      isAdmin: st.isAdmin,
    };
    set({ currentResult: result });
    return result;
  },

  saveBaseline: () => {
    const { currentResult } = get();
    if (!currentResult) return;
    try { localStorage.setItem(LA_BASELINE_KEY, JSON.stringify(currentResult)); } catch {}
    set({ baseline: currentResult });
  },

  loadBaseline: () => {
    try {
      const raw = localStorage.getItem(LA_BASELINE_KEY);
      if (raw) set({ baseline: JSON.parse(raw) });
    } catch {}
  },

  clearBaseline: () => {
    try { localStorage.removeItem(LA_BASELINE_KEY); } catch {}
    set({ baseline: null });
  },

  reset: () =>
    set({
      sessionStatus: "idle",
      sessionError: null,
      startedAt: null,
      elapsedSec: 0,
      sampleCount: 0,
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
      overallScore: 0,
      status: "Not enough data",
      drivers: [],
      driversScanned: false,
      audioDevices: [],
      currentResult: null,
      testLabel: "",
    }),
}));
