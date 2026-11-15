/**
 * systemConditionsStore.ts, Tracks OS-level conditions that affect whether
 * applied tweaks will stick: Tamper Protection state and elevation (admin) status.
 *
 * Read at startup in App.tsx, refreshed by the Tweaks page on entry/focus and
 * by the Security page. Used by TweaksList to show a root-cause banner.
 */

import { create } from "zustand";

interface SystemConditionsState {
  /** Whether the app is running as Administrator. null = not yet checked. */
  isAdmin: boolean | null;
  /** Whether Windows Tamper Protection is active. null = not yet checked. */
  tamperProtection: boolean | null;
  /** Whether startup or a Security-page read has completed. */
  conditionsChecked: boolean;

  setIsAdmin: (v: boolean) => void;
  setTamperProtection: (v: boolean | null) => void;
  setConditions: (isAdmin: boolean | null, tamperProtection: boolean | null) => void;
}

export const useSystemConditionsStore = create<SystemConditionsState>()((set) => ({
  isAdmin: null,
  tamperProtection: null,
  conditionsChecked: false,

  setIsAdmin: (v) => set({ isAdmin: v }),
  setTamperProtection: (v) => set({ tamperProtection: v, conditionsChecked: true }),
  setConditions: (isAdmin, tamperProtection) => set({ isAdmin, tamperProtection, conditionsChecked: true }),
}));
