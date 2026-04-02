import { create } from "zustand";
import { persist } from "zustand/middleware";
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
        set({
          hasScanned: true,
          detections: payload.detections,
          lastTelemetry: payload.telemetry,
          lastScanTime: new Date().toISOString(),
          analysisHash: payload.hash,
          telemetrySource: payload.telemetrySource,
          scores: payload.scores,
          optimizationLevel: payload.optimizationLevel,
          scanChanged: payload.scanChanged,
          previousScore: payload.previousScore,
          aiExplanation: hashChanged ? null : state.aiExplanation,
          aiExplanationHash: hashChanged ? null : state.aiExplanationHash,
        });
      },

      setPhotoDetections: (detections) => set({ photoDetections: detections }),

      setAiExplanation: (explanation, hash) =>
        set({ aiExplanation: explanation, aiExplanationHash: hash }),

      clearAiExplanation: () =>
        set({ aiExplanation: null, aiExplanationHash: null }),

      resetBiosAdvisor: () => set(initialState),
    }),
    {
      name: "sc-bios-advisor-store",
      version: 1,
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
