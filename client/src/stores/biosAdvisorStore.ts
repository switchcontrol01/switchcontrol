import { create } from "zustand";
import { persist } from "zustand/middleware";
import { sanitizeScoreObject } from "../lib/bios-advisor-data";
import type { BiosScore, OptimizationLevel } from "../lib/bios-advisor-data";
import type { FirmwareDetection, HardwareTelemetry } from "../lib/firmware-analyzer";

export interface AiExplanation {
  overview: string;
  settingExplanations: { settingId: string; explanation: string; impact: string }[];
  recommendations: string[];
  confidenceNote: string;
}

interface BiosAdvisorState {
  hasScanned: boolean;
  detections: FirmwareDetection[];
  photoDetections: FirmwareDetection[];
  lastTelemetry: HardwareTelemetry | null;
  lastScanTime: string | null;
  analysisHash: string | null;
  telemetrySource: "electron" | "web-inferred";
  scores: BiosScore | null;
  optimizationLevel: OptimizationLevel | null;
  aiExplanation: AiExplanation | null;
  aiExplanationHash: string | null;
  scanChanged: boolean | null;
  previousScore: number | null;

  completeScan: (payload: {
    detections: FirmwareDetection[];
    telemetry: HardwareTelemetry;
    hash: string;
    telemetrySource: "electron" | "web-inferred";
    scores: BiosScore;
    optimizationLevel: OptimizationLevel;
    scanChanged: boolean | null;
    previousScore: number | null;
  }) => void;

  setPhotoDetections: (detections: FirmwareDetection[]) => void;
  updateScores: (scores: BiosScore, optimizationLevel: OptimizationLevel) => void;
  setAiExplanation: (explanation: AiExplanation, hash: string) => void;
  clearAiExplanation: () => void;
  resetBiosAdvisor: () => void;
}

const initialState = {
  hasScanned: false,
  detections: [] as FirmwareDetection[],
  photoDetections: [] as FirmwareDetection[],
  lastTelemetry: null,
  lastScanTime: null,
  analysisHash: null,
  telemetrySource: "web-inferred" as const,
  scores: null,
  optimizationLevel: null,
  aiExplanation: null,
  aiExplanationHash: null,
  scanChanged: null,
  previousScore: null,
};

export const useBiosAdvisorStore = create<BiosAdvisorState>()(
  persist(
    (set, get) => ({
      ...initialState,

      completeScan: (payload) => {
        const state = get();
        const hashChanged = state.analysisHash !== null && state.analysisHash !== payload.hash;
        console.log('[BiosStore] completeScan | raw scores BEFORE sanitize:', JSON.stringify(payload.scores));
        const sanitized = sanitizeScoreObject(payload.scores);
        console.log('[BiosStore] completeScan | scores AFTER sanitize:', JSON.stringify(sanitized));
        set({
          hasScanned: true,
          detections: payload.detections,
          lastTelemetry: payload.telemetry,
          lastScanTime: new Date().toISOString(),
          analysisHash: payload.hash,
          telemetrySource: payload.telemetrySource,
          scores: sanitized,
          optimizationLevel: payload.optimizationLevel,
          scanChanged: payload.scanChanged,
          previousScore: payload.previousScore,
          aiExplanation: hashChanged ? null : state.aiExplanation,
          aiExplanationHash: hashChanged ? null : state.aiExplanationHash,
        });
      },

      setPhotoDetections: (detections) =>
        set({ photoDetections: detections, aiExplanation: null, aiExplanationHash: null }),

      updateScores: (scores, optimizationLevel) => {
        console.log('[BiosStore] updateScores | raw:', JSON.stringify(scores));
        const sanitized = sanitizeScoreObject(scores);
        console.log('[BiosStore] updateScores | sanitized:', JSON.stringify(sanitized));
        set({ scores: sanitized, optimizationLevel });
      },

      setAiExplanation: (explanation, hash) =>
        set({ aiExplanation: explanation, aiExplanationHash: hash }),

      clearAiExplanation: () =>
        set({ aiExplanation: null, aiExplanationHash: null }),

      resetBiosAdvisor: () => set(initialState),
    }),
    {
      name: "sc-bios-advisor-store",
      version: 2,
      migrate: (persisted: any, version: number) => {
        console.log('[BiosStore] migrate | persisted version:', version, '| raw scores:', JSON.stringify(persisted?.scores));
        if (persisted?.scores != null) {
          persisted.scores = sanitizeScoreObject(persisted.scores as BiosScore);
          console.log('[BiosStore] migrate | sanitized scores:', JSON.stringify(persisted.scores));
        }
        return persisted;
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[BiosStore] hydration error:', error);
          return;
        }
        if (!state) return;
        console.log('[BiosStore] hydrated | scores from storage:', JSON.stringify(state.scores));
        if (state.scores != null) {
          const sanitized = sanitizeScoreObject(state.scores);
          const hasInvalid =
            !Number.isFinite(state.scores.competitiveReadiness) ||
            !Number.isFinite(state.scores.latency) ||
            !Number.isFinite(state.scores.frametime) ||
            !Number.isFinite(state.scores.stability);
          if (hasInvalid) {
            console.warn('[BiosStore] hydrated scores had non-finite values — clearing and resetting');
            state.scores = sanitized;
            state.hasScanned = false;
          }
          console.log('[BiosStore] hydrated | sanitized scores:', JSON.stringify(sanitized));
        }
      },
      partialize: (state) => ({
        hasScanned: state.hasScanned,
        detections: state.detections,
        photoDetections: state.photoDetections,
        lastTelemetry: state.lastTelemetry,
        lastScanTime: state.lastScanTime,
        analysisHash: state.analysisHash,
        telemetrySource: state.telemetrySource,
        scores: state.scores,
        optimizationLevel: state.optimizationLevel,
        aiExplanation: state.aiExplanation,
        aiExplanationHash: state.aiExplanationHash,
        scanChanged: state.scanChanged,
        previousScore: state.previousScore,
      }),
    }
  )
);
