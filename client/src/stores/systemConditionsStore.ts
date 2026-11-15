/**
 * systemConditionsStore.ts, Tracks OS-level conditions that affect whether
 * applied tweaks will stick: Tamper Protection state and elevation (admin) status.
 *
 * Read during startup reconciliation in App.tsx and refreshed explicitly on
 * the Security page. TweaksList uses this shared snapshot without rescanning
 * Windows whenever the user navigates to the section.
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
