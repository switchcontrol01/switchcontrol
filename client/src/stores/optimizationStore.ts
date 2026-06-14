/**
 * optimizationStore.ts — Isolated Zustand slice for the Adaptive Optimization Engine.
 *
 * Completely separate from the main store so optimization state changes
 * (phase transitions, plan loading) NEVER cause TweaksList to re-render.
 */

import { create } from "zustand";
import type { OptimizationPlan } from "@shared/optimizationEngine";
import type { OptimizationIntent } from "@shared/tweakOptimizationMeta";

// ── State machine phases ──────────────────────────────────────────────────────

export type OptimizationPhase =
  | "idle"
  | "snapshotting"   // collecting hardware snapshot
  | "intent"         // showing intent picker to user
  | "deciding"       // running the engine (< 100ms, shows brief "analyzing" flash)
  | "plan"           // showing the optimization plan to user
  | "applying"       // executing tweaks
  | "done";          // session complete, showing rollback option

// ── Store shape ───────────────────────────────────────────────────────────────

export interface OptimizationState {
  phase: OptimizationPhase;
  intent: OptimizationIntent | null;
  plan: OptimizationPlan | null;
  sessionAppliedIds: string[];   // track for session rollback
  error: string | null;

  // Actions — all synchronous state transitions
  startFlow: () => void;
  setSnapshotReady: (plan: OptimizationPlan | null, error?: string) => void;
  setIntent: (intent: OptimizationIntent) => void;
  decidePlan: (plan: OptimizationPlan) => void;
  startApplying: () => void;
  finishApplying: (appliedIds: string[]) => void;
  markDone: () => void;
  setError: (error: string) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  phase: "idle" as OptimizationPhase,
  intent: null,
  plan: null,
  sessionAppliedIds: [],
  error: null,
};

export const useOptimizationStore = create<OptimizationState>((set) => ({
  ...INITIAL_STATE,

  startFlow: () => set({ ...INITIAL_STATE, phase: "snapshotting" }),

  setSnapshotReady: (plan, error) => {
    if (error) {
      set({ phase: "intent", error });
      return;
    }
    set({ phase: "intent", error: null });
  },

  setIntent: (intent) =>
    set({ intent, phase: "deciding" }),

  decidePlan: (plan) =>
    set({ plan, phase: "plan" }),

  startApplying: () =>
    set({ phase: "applying" }),

  finishApplying: (appliedIds) =>
    set({ sessionAppliedIds: appliedIds, phase: "done" }),

  markDone: () =>
    set({ phase: "done" }),

  setError: (error) =>
    set({ error, phase: "idle" }),

  reset: () =>
    set(INITIAL_STATE),
}));
