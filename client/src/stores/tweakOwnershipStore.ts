import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Persist migration v0 → v1 ──────────────────────────────────────────────────
// Old records stored `appliedByApp: boolean`. New records use `provenance: 'app' | 'baseline'`.
// We map `appliedByApp: true` → `provenance: 'app'`, `false` → `provenance: 'baseline'`.
// Any other fields pass through unchanged. Unknown record shapes are returned as-is
// so the store's normal rehydration doesn't crash on unexpected data.

type LegacyRecord = Record<string, unknown> & { appliedByApp?: boolean };

function migrateRecord(rec: LegacyRecord): Record<string, unknown> {
  if (typeof rec.appliedByApp !== 'boolean') return rec;
  const { appliedByApp, ...rest } = rec;
  return { ...rest, provenance: appliedByApp ? 'app' : 'baseline' };
}

function migrateAppliedTweaks(
  appliedTweaks: Record<string, LegacyRecord> | undefined
): Record<string, TweakOwnership> {
  if (!appliedTweaks) return {};
  const out: Record<string, TweakOwnership> = {};
  for (const [k, rec] of Object.entries(appliedTweaks)) {
    out[k] = migrateRecord(rec) as unknown as TweakOwnership;
  }
  return out;
}

function migrateNetworkTweaks(
  networkTweaks: Record<string, LegacyRecord> | undefined
): Record<string, NetworkTweakOwnership> {
  if (!networkTweaks) return {};
  const out: Record<string, NetworkTweakOwnership> = {};
  for (const [k, rec] of Object.entries(networkTweaks)) {
    out[k] = migrateRecord(rec) as unknown as NetworkTweakOwnership;
  }
  return out;
}

function migratePowerPlan(
  powerPlan: LegacyRecord | null | undefined
): PowerPlanOwnership | null {
  if (!powerPlan) return null;
  return migrateRecord(powerPlan) as unknown as PowerPlanOwnership;
}

// ── Ownership record shapes ────────────────────────────────────────────────────

/** Metadata for a tweak the app knows about.
 *
 * Record existence does NOT imply the tweak is currently applied.
 * The canonical on/off boolean lives in `useStore.getState().tweaks[id]`.
 * This store only tracks provenance (did WE apply it or was it already on at
 * baseline?), revert eligibility, and diagnostic state. */
export interface TweakOwnership {
  provenance: 'app' | 'baseline';
  timestamp: number;
  revertFailed: boolean;
  conflictDetected: boolean;
  isPremium: boolean;
  label: string;
}

export interface NetworkTweakOwnership {
  provenance: 'app' | 'baseline';
  timestamp: number;
  previousStatus: 'on' | 'off' | 'unknown';
  appliedStatus: 'on' | 'off';
  revertFailed: boolean;
  conflictDetected: boolean;
  label: string;
}

export interface PowerPlanOwnership {
  provenance: 'app' | 'baseline';
  timestamp: number;
  previousPlanGuid: string;
  previousPlanName: string;
  appliedPlanGuid: string;
  appliedPlanName: string;
  revertFailed: boolean;
  conflictDetected: boolean;
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface TweakOwnershipState {
  appliedTweaks: Record<string, TweakOwnership>;
  networkTweaks: Record<string, NetworkTweakOwnership>;
  powerPlan: PowerPlanOwnership | null;
  baselineInitialized: boolean;

  // ── Tweak actions ────────────────────────────────────────────────────────────
  recordTweakBaseline: (tweakId: string, isApplied: boolean, label: string, isPremium: boolean) => void;
  recordTweakApply: (tweakId: string, label: string, isPremium: boolean) => void;
  recordTweakRevertSuccess: (tweakId: string) => void;
  markTweakConflict: (tweakId: string) => void;
  markTweakRevertFailed: (tweakId: string) => void;

  // ── Network tweak actions ────────────────────────────────────────────────────
  recordNetworkTweakBaseline: (tweakId: string, status: 'on' | 'off' | 'unknown', label: string) => void;
  recordNetworkTweakApply: (tweakId: string, previousStatus: 'on' | 'off' | 'unknown', label: string) => void;
  recordNetworkTweakRevertSuccess: (tweakId: string) => void;
  markNetworkTweakConflict: (tweakId: string) => void;
  markNetworkTweakRevertFailed: (tweakId: string) => void;

  // ── Power plan actions ───────────────────────────────────────────────────────
  recordPowerPlanApply: (
    previousGuid: string, previousName: string,
    appliedGuid: string, appliedName: string
  ) => void;
  recordPowerPlanRevertSuccess: () => void;
  markPowerPlanConflict: () => void;
  markPowerPlanRevertFailed: () => void;

  // ── Baseline ─────────────────────────────────────────────────────────────────
  setBaselineInitialized: () => void;
  resetOwnership: () => void;
  clearPremiumOwnership: () => void;
}

export const useTweakOwnershipStore = create<TweakOwnershipState>()(
  persist(
    (set, get) => ({
      appliedTweaks: {},
      networkTweaks: {},
      powerPlan: null,
      baselineInitialized: false,

      // ── Tweak ───────────────────────────────────────────────────────────────
      recordTweakBaseline(tweakId, isApplied, label, isPremium) {
        if (!isApplied) return;
        set(s => {
          const existing = s.appliedTweaks[tweakId];
          if (existing?.provenance === 'app') return s; // app override wins
          return {
            appliedTweaks: {
              ...s.appliedTweaks,
              [tweakId]: {
                provenance:       'baseline',
                timestamp:        Date.now(),
                revertFailed:     false,
                conflictDetected: false,
                isPremium,
                label,
              },
            },
          };
        });
      },

      recordTweakApply(tweakId, label, isPremium) {
        set(s => ({
          appliedTweaks: {
            ...s.appliedTweaks,
            [tweakId]: {
              provenance:       'app',
              timestamp:        Date.now(),
              revertFailed:     false,
              conflictDetected: false,
              isPremium,
              label,
            },
          },
        }));
        console.log(`[Ownership:TWEAK] recorded apply tweakId="${tweakId}" premium=${isPremium}`);
      },

      recordTweakRevertSuccess(tweakId) {
        set(s => {
          const { [tweakId]: _, ...rest } = s.appliedTweaks;
          return { appliedTweaks: rest };
        });
        console.log(`[Ownership:TWEAK] cleared after revert tweakId="${tweakId}"`);
      },

      markTweakConflict(tweakId) {
        set(s => {
          const rec = s.appliedTweaks[tweakId];
          if (!rec) return s;
          return { appliedTweaks: { ...s.appliedTweaks, [tweakId]: { ...rec, conflictDetected: true } } };
        });
      },

      markTweakRevertFailed(tweakId) {
        set(s => {
          const rec = s.appliedTweaks[tweakId];
          if (!rec) return s;
          return { appliedTweaks: { ...s.appliedTweaks, [tweakId]: { ...rec, revertFailed: true } } };
        });
      },

      // ── Network ─────────────────────────────────────────────────────────────
      recordNetworkTweakBaseline(tweakId, status, label) {
        if (status !== 'on') return;
        set(s => {
          const existing = s.networkTweaks[tweakId];
          if (existing?.provenance === 'app') return s;
          return {
            networkTweaks: {
              ...s.networkTweaks,
              [tweakId]: {
                provenance: 'baseline',
                timestamp: Date.now(),
                previousStatus: 'off',
                appliedStatus: 'on',
                revertFailed: false,
                conflictDetected: false,
                label,
              },
            },
          };
        });
      },

      recordNetworkTweakApply(tweakId, previousStatus, label) {
        set(s => ({
          networkTweaks: {
            ...s.networkTweaks,
            [tweakId]: {
              provenance: 'app',
              timestamp: Date.now(),
              previousStatus,
              appliedStatus: 'on',
              revertFailed: false,
              conflictDetected: false,
              label,
            },
          },
        }));
        console.log(`[Ownership:NET] recorded apply tweakId="${tweakId}" prev=${previousStatus}`);
      },

      recordNetworkTweakRevertSuccess(tweakId) {
        set(s => {
          const { [tweakId]: _, ...rest } = s.networkTweaks;
          return { networkTweaks: rest };
        });
        console.log(`[Ownership:NET] cleared after revert tweakId="${tweakId}"`);
      },

      markNetworkTweakConflict(tweakId) {
        set(s => {
          const rec = s.networkTweaks[tweakId];
          if (!rec) return s;
          return { networkTweaks: { ...s.networkTweaks, [tweakId]: { ...rec, conflictDetected: true } } };
        });
      },

      markNetworkTweakRevertFailed(tweakId) {
        set(s => {
          const rec = s.networkTweaks[tweakId];
          if (!rec) return s;
          return { networkTweaks: { ...s.networkTweaks, [tweakId]: { ...rec, revertFailed: true } } };
        });
      },

      // ── Power plan ──────────────────────────────────────────────────────────
      recordPowerPlanApply(previousGuid, previousName, appliedGuid, appliedName) {
        set({
          powerPlan: {
            provenance: 'app',
            timestamp: Date.now(),
            previousPlanGuid: previousGuid,
            previousPlanName: previousName,
            appliedPlanGuid: appliedGuid,
            appliedPlanName: appliedName,
            revertFailed: false,
            conflictDetected: false,
          },
        });
        console.log(`[Ownership:PLAN] recorded apply, prev="${previousName}" (${previousGuid}) → applied="${appliedName}" (${appliedGuid})`);
      },

      recordPowerPlanRevertSuccess() {
        set({ powerPlan: null });
        console.log('[Ownership:PLAN] cleared after revert');
      },

      markPowerPlanConflict() {
        set(s => s.powerPlan ? { powerPlan: { ...s.powerPlan, conflictDetected: true } } : s);
      },

      markPowerPlanRevertFailed() {
        set(s => s.powerPlan ? { powerPlan: { ...s.powerPlan, revertFailed: true } } : s);
      },

      // ── Baseline ────────────────────────────────────────────────────────────
      setBaselineInitialized() {
        set({ baselineInitialized: true });
        console.log('[Ownership:BASELINE] initialized');
      },

      resetOwnership() {
        set({ appliedTweaks: {}, networkTweaks: {}, powerPlan: null, baselineInitialized: false });
      },

      clearPremiumOwnership() {
        set(s => {
          const remaining: Record<string, TweakOwnership> = {};
          for (const [id, rec] of Object.entries(s.appliedTweaks)) {
            if (rec.provenance === 'baseline') remaining[id] = rec;
          }
          return { appliedTweaks: remaining, networkTweaks: {}, powerPlan: null };
        });
        console.log('[Ownership] clearPremiumOwnership, app-applied premium entries removed');
      },
    }),
    {
      name: 'sc_tweak_ownership_v1',
      version: 1,
      migrate: (persistedState: any) => {
        const s = persistedState as any;
        return {
          ...s,
          appliedTweaks: migrateAppliedTweaks(s?.appliedTweaks),
          networkTweaks: migrateNetworkTweaks(s?.networkTweaks),
          powerPlan: migratePowerPlan(s?.powerPlan),
        };
      },
      partialize: (s) => ({
        appliedTweaks:       s.appliedTweaks,
        networkTweaks:       s.networkTweaks,
        powerPlan:           s.powerPlan,
        baselineInitialized: s.baselineInitialized,
      }),
    }
  )
);
