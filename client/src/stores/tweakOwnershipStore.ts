import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Ownership record shapes ────────────────────────────────────────────────────

export interface TweakOwnership {
  appliedByApp: boolean;
  timestamp: number;
  previousState: {
    isApplied: boolean;
  };
  appliedState: {
    isApplied: boolean;
  };
  revertFailed: boolean;
  conflictDetected: boolean;
  isPremium: boolean;
  label: string;
}

export interface NetworkTweakOwnership {
  appliedByApp: boolean;
  timestamp: number;
  previousStatus: 'on' | 'off' | 'unknown';
  appliedStatus: 'on' | 'off';
  revertFailed: boolean;
  conflictDetected: boolean;
  label: string;
}

export interface PowerPlanOwnership {
  appliedByApp: boolean;
  timestamp: number;
  previousPlanGuid: string;
  previousPlanName: string;
  appliedPlanGuid: string;
  appliedPlanName: string;
  revertFailed: boolean;
  conflictDetected: boolean;
}

export interface ExtremeTweakOwnership {
  appliedByApp: boolean;
  timestamp: number;
  label: string;
  revertFailed: boolean;
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface TweakOwnershipState {
  appliedTweaks: Record<string, TweakOwnership>;
  networkTweaks: Record<string, NetworkTweakOwnership>;
  powerPlan: PowerPlanOwnership | null;
  /** Extreme Labs tweaks applied by the app — tracked for premium revert. */
  extremeLabs: Record<string, ExtremeTweakOwnership>;
  baselineInitialized: boolean;

  // ── Tweak actions ────────────────────────────────────────────────────────────
  recordTweakBaseline: (tweakId: string, isApplied: boolean, label: string, isPremium: boolean) => void;
  recordTweakApply: (tweakId: string, previousIsApplied: boolean, appliedIsApplied: boolean, label: string, isPremium: boolean) => void;
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

  // ── Extreme Labs actions ─────────────────────────────────────────────────────
  recordExtremeLabsApply: (tweakId: string, label: string) => void;
  recordExtremeLabsRevertSuccess: (tweakId: string) => void;
  markExtremeLabsRevertFailed: (tweakId: string) => void;

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
      extremeLabs: {},
      baselineInitialized: false,

      // ── Tweak ───────────────────────────────────────────────────────────────
      recordTweakBaseline(tweakId, isApplied, label, isPremium) {
        if (!isApplied) return;
        set(s => {
          const existing = s.appliedTweaks[tweakId];
          if (existing?.appliedByApp) return s;
          return {
            appliedTweaks: {
              ...s.appliedTweaks,
              [tweakId]: {
                appliedByApp: false,
                timestamp: Date.now(),
                previousState:  { isApplied: false },
                appliedState:   { isApplied: true },
                revertFailed:   false,
                conflictDetected: false,
                isPremium,
                label,
              },
            },
          };
        });
      },

      recordTweakApply(tweakId, previousIsApplied, appliedIsApplied, label, isPremium) {
        set(s => ({
          appliedTweaks: {
            ...s.appliedTweaks,
            [tweakId]: {
              appliedByApp:    true,
              timestamp:       Date.now(),
              previousState:   { isApplied: previousIsApplied },
              appliedState:    { isApplied: appliedIsApplied },
              revertFailed:    false,
              conflictDetected: false,
              isPremium,
              label,
            },
          },
        }));
        console.log(`[Ownership:TWEAK] recorded apply tweakId="${tweakId}" prev=${previousIsApplied} applied=${appliedIsApplied} premium=${isPremium}`);
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
          if (existing?.appliedByApp) return s;
          return {
            networkTweaks: {
              ...s.networkTweaks,
              [tweakId]: {
                appliedByApp: false,
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
              appliedByApp: true,
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
            appliedByApp: true,
            timestamp: Date.now(),
            previousPlanGuid: previousGuid,
            previousPlanName: previousName,
            appliedPlanGuid: appliedGuid,
            appliedPlanName: appliedName,
            revertFailed: false,
            conflictDetected: false,
          },
        });
        console.log(`[Ownership:PLAN] recorded apply — prev="${previousName}" (${previousGuid}) → applied="${appliedName}" (${appliedGuid})`);
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

      // ── Extreme Labs ─────────────────────────────────────────────────────────
      recordExtremeLabsApply(tweakId, label) {
        set(s => ({
          extremeLabs: {
            ...s.extremeLabs,
            [tweakId]: {
              appliedByApp: true,
              timestamp: Date.now(),
              label,
              revertFailed: false,
            },
          },
        }));
        console.log(`[Ownership:EL] recorded apply tweakId="${tweakId}"`);
      },

      recordExtremeLabsRevertSuccess(tweakId) {
        set(s => {
          const { [tweakId]: _, ...rest } = s.extremeLabs;
          return { extremeLabs: rest };
        });
        console.log(`[Ownership:EL] cleared after revert tweakId="${tweakId}"`);
      },

      markExtremeLabsRevertFailed(tweakId) {
        set(s => {
          const rec = s.extremeLabs[tweakId];
          if (!rec) return s;
          return { extremeLabs: { ...s.extremeLabs, [tweakId]: { ...rec, revertFailed: true } } };
        });
      },

      // ── Baseline ────────────────────────────────────────────────────────────
      setBaselineInitialized() {
        set({ baselineInitialized: true });
        console.log('[Ownership:BASELINE] initialized');
      },

      resetOwnership() {
        set({ appliedTweaks: {}, networkTweaks: {}, powerPlan: null, extremeLabs: {}, baselineInitialized: false });
      },

      clearPremiumOwnership() {
        set(s => {
          const remaining: Record<string, TweakOwnership> = {};
          for (const [id, rec] of Object.entries(s.appliedTweaks)) {
            if (!rec.appliedByApp) remaining[id] = rec;
          }
          return { appliedTweaks: remaining, networkTweaks: {}, powerPlan: null, extremeLabs: {} };
        });
        console.log('[Ownership] clearPremiumOwnership — app-applied premium entries removed');
      },
    }),
    {
      name: 'sc_tweak_ownership_v1',
      partialize: (s) => ({
        appliedTweaks:       s.appliedTweaks,
        networkTweaks:       s.networkTweaks,
        powerPlan:           s.powerPlan,
        extremeLabs:         s.extremeLabs,
        baselineInitialized: s.baselineInitialized,
      }),
    }
  )
);
