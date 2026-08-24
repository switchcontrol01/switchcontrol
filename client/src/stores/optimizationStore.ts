/**
 * optimizationStore.ts, Isolated Zustand slice for the Adaptive Optimization Engine.
 *
 * Completely separate from the main store so optimization state changes
 * (phase transitions, plan loading) NEVER cause TweaksList to re-render.
 *
 * Includes:
 * - Phase state machine (idle → snapshotting → intent → deciding → plan → applying → done)
 * - Snapshot/plan cooldown cache (10 min snapshot TTL, 15 min plan TTL per intent)
 * - Partial-failure tracking (sessionAppliedIds vs sessionFailedIds)
 */

import { create } from "zustand";
import type { OptimizationPlan } from "@shared/optimizationEngine";
import type { OptimizationIntent } from "@shared/tweakOptimizationMeta";
import type { OptimizationSnapshot } from "@/lib/optimizationSnapshot";

// ── State machine phases ──────────────────────────────────────────────────────

export type OptimizationPhase =
  | "idle"
  | "snapshotting"
  | "intent"
  | "deciding"
  | "plan"
  | "applying"
  | "done";

// ── Cache TTL constants ───────────────────────────────────────────────────────

const SNAPSHOT_TTL_MS = 10 * 60 * 1000;  // 10 minutes
const PLAN_TTL_MS     = 15 * 60 * 1000;  // 15 minutes per intent

interface SnapshotCache {
  snapshot: OptimizationSnapshot;
  expiresAt: number;
}

interface PlanCache {
  plan: OptimizationPlan;
  expiresAt: number;
}

// ── Store shape ───────────────────────────────────────────────────────────────

export interface OptimizationState {
  phase: OptimizationPhase;
  intent: OptimizationIntent | null;
  plan: OptimizationPlan | null;
  sessionAppliedIds: string[];
  sessionFailedIds: string[];
  error: string | null;

  // Internal cache, not displayed in UI
  _snapshotCache: SnapshotCache | null;
  _planCache: Partial<Record<OptimizationIntent, PlanCache>>;

  // Cache accessors
  getCachedSnapshot: () => OptimizationSnapshot | null;
  setCachedSnapshot: (snapshot: OptimizationSnapshot) => void;
  getCachedPlan: (intent: OptimizationIntent) => OptimizationPlan | null;
  setCachedPlan: (intent: OptimizationIntent, plan: OptimizationPlan) => void;

  // Phase transitions
  startFlow: () => void;
  setSnapshotReady: (error?: string) => void;
  setIntent: (intent: OptimizationIntent) => void;
  decidePlan: (plan: OptimizationPlan) => void;
  startApplying: () => void;
  finishApplying: (appliedIds: string[], failedIds: string[]) => void;
  setError: (error: string) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  phase: "idle" as OptimizationPhase,
  intent: null,
  plan: null,
  sessionAppliedIds: [],
  sessionFailedIds: [],
  error: null,
  _snapshotCache: null as SnapshotCache | null,
  _planCache: {} as Partial<Record<OptimizationIntent, PlanCache>>,
};

export const useOptimizationStore = create<OptimizationState>((set, get) => ({
  ...INITIAL_STATE,

  getCachedSnapshot: () => {
    const cache = get()._snapshotCache;
    if (!cache || Date.now() > cache.expiresAt) return null;
    return cache.snapshot;
  },

  setCachedSnapshot: (snapshot) =>
    set({ _snapshotCache: { snapshot, expiresAt: Date.now() + SNAPSHOT_TTL_MS } }),

  getCachedPlan: (intent) => {
    const entry = get()._planCache[intent];
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.plan;
  },

  setCachedPlan: (intent, plan) =>
    set(s => ({
      _planCache: {
        ...s._planCache,
        [intent]: { plan, expiresAt: Date.now() + PLAN_TTL_MS },
      },
    })),

  startFlow: () => set({ ...INITIAL_STATE, phase: "snapshotting",
    _snapshotCache: get()._snapshotCache,
    _planCache: get()._planCache,
  }),

  setSnapshotReady: (error) =>
    set({ phase: "intent", error: error ?? null }),

  setIntent: (intent) =>
    set({ intent, phase: "deciding" }),

  decidePlan: (plan) =>
    set({ plan, phase: "plan" }),

  startApplying: () =>
    set({ phase: "applying" }),

  finishApplying: (appliedIds, failedIds) =>
    // Bust all plan caches, tweak state has changed; stale plans would re-offer
    // already-applied tweaks as recommendations on re-open.
    set({ sessionAppliedIds: appliedIds, sessionFailedIds: failedIds, phase: "done", _planCache: {} }),

  setError: (error) =>
    set({ error, phase: "idle" }),

  reset: () =>
    set({
      phase: "idle",
      intent: null,
      plan: null,
      sessionAppliedIds: [],
      sessionFailedIds: [],
      error: null,
      // preserve caches across resets
    }),
}));
