import { useEffect } from "react";
import { create } from "zustand";
import {
  deriveAdaptiveProfile,
  getAdaptiveTelemetryPolicy,
  getAdaptiveVisualPolicy,
  resolveAdaptivePerformanceProfile,
  type AdaptiveCapabilitySnapshot,
  type AdaptivePerformanceDecision,
  type AdaptivePerformanceProfile,
} from "@shared/adaptivePerformance";
import { useUserPreferencesStore } from "@/stores/userPreferencesStore";

interface AdaptivePerformanceState {
  capabilities: AdaptiveCapabilitySnapshot | null;
  decision: AdaptivePerformanceDecision;
  refreshing: boolean;
  setCapabilities: (capabilities: AdaptiveCapabilitySnapshot) => void;
  setRefreshing: (refreshing: boolean) => void;
}

const initialDecision: AdaptivePerformanceDecision = {
  profile: "unknown",
  confidence: 0,
  score: 0,
  availableSignals: 0,
  reasons: ["Capability detection has not completed yet"],
  constrainedSignals: [],
};

export const useAdaptivePerformanceStore = create<AdaptivePerformanceState>((set) => ({
  capabilities: null,
  decision: initialDecision,
  refreshing: false,
  setCapabilities: (capabilities) => set({
    capabilities,
    decision: deriveAdaptiveProfile(capabilities),
  }),
  setRefreshing: (refreshing) => set({ refreshing }),
}));

export function getAdaptivePerformanceProfile(): AdaptivePerformanceProfile {
  const detected = useAdaptivePerformanceStore.getState().decision.profile;
  const override = useUserPreferencesStore.getState().performanceProfileOverride;
  return resolveAdaptivePerformanceProfile(detected, override);
}

export function getAdaptivePerformanceTelemetryPolicy() {
  return getAdaptiveTelemetryPolicy(getAdaptivePerformanceProfile());
}

export function useAdaptivePerformance() {
  const state = useAdaptivePerformanceStore();
  const override = useUserPreferencesStore((preferences) => preferences.performanceProfileOverride);
  return {
    ...state.decision,
    detectedProfile: state.decision.profile,
    profile: resolveAdaptivePerformanceProfile(state.decision.profile, override),
    override,
    capabilities: state.capabilities,
    refreshing: state.refreshing,
  };
}

let refreshFlight: Promise<void> | null = null;
let pendingForcedRefresh = false;

export async function refreshAdaptiveCapabilities(force = false): Promise<void> {
  const api = (window as any).electronAPI;
  if (!api?.system?.getCapabilities) return;
  if (refreshFlight) {
    if (force) pendingForcedRefresh = true;
    return refreshFlight;
  }
  const store = useAdaptivePerformanceStore.getState();
  store.setRefreshing(true);
  refreshFlight = Promise.resolve()
    .then(() => api.system.getCapabilities({ force }))
    .then((raw: AdaptiveCapabilitySnapshot) => {
      if (raw) useAdaptivePerformanceStore.getState().setCapabilities(raw);
    })
    .catch(() => {
      // Keep the last known snapshot. An unavailable refresh must not cause a
      // visible profile oscillation or reset telemetry demand.
    })
    .finally(() => {
      useAdaptivePerformanceStore.getState().setRefreshing(false);
      refreshFlight = null;
      if (pendingForcedRefresh) {
        pendingForcedRefresh = false;
        queueMicrotask(() => void refreshAdaptiveCapabilities(true));
      }
    });
  return refreshFlight;
}

/**
 * Mount once near the authenticated app shell. The native event is a hint to
 * refresh; all reads remain deduplicated and profile updates are state-only.
 */
export function AdaptivePerformanceSync() {
  const api = (window as any).electronAPI;
  const profile = useAdaptivePerformance().profile;
  const reducedMotion = useUserPreferencesStore((state) => state.reducedMotion);

  useEffect(() => {
    if (!api?.system?.getCapabilities) return;
    void refreshAdaptiveCapabilities();
    const unsubscribe = api.system.onCapabilitiesChanged?.(() => {
      void refreshAdaptiveCapabilities(true);
    });
    return typeof unsubscribe === "function" ? unsubscribe : undefined;
  }, [api]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.performanceProfile = profile;
    root.classList.toggle("sc-adaptive-efficiency", profile === "efficiency" || profile === "unknown");
    root.classList.toggle("sc-adaptive-balanced", profile === "balanced");
    root.classList.toggle("sc-adaptive-enhanced", profile === "enhanced");
    root.classList.toggle(
      "sc-adaptive-no-chart-animation",
      !getAdaptiveVisualPolicy(profile, reducedMotion).chartAnimation,
    );
    const update = api?.telemetry?.setPerformanceProfile?.(profile);
    if (update && typeof update.catch === "function") void update.catch(() => {});
    window.dispatchEvent(new CustomEvent("sc:adaptive-profile-changed", { detail: { profile } }));
  }, [api, profile, reducedMotion]);

  return null;
}