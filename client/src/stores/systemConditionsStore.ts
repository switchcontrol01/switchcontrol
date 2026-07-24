/**
 * systemConditionsStore.ts — Tracks OS-level conditions that affect whether
 * applied tweaks will stick: Tamper Protection state and elevation (admin) status.
 *
 * Read at startup in App.tsx alongside the startup reconcile, refreshed whenever
 * Security page calls getStatus. Used by TweaksList to show a root-cause banner.
 */

import { create } from "zustand";

interface SystemConditionsState {
  /** Whether the app is running as Administrator. null = not yet checked. */
  isAdmin: boolean | null;
  /** Whether Windows Tamper Protection is active. null = not yet checked. */
  tamperProtection: boolean | null;

  setIsAdmin: (v: boolean) => void;
  setTamperProtection: (v: boolean) => void;
  setConditions: (isAdmin: boolean | null, tamperProtection: boolean | null) => void;
}

export const useSystemConditionsStore = create<SystemConditionsState>()((set) => ({
  isAdmin: null,
  tamperProtection: null,

  setIsAdmin: (v) => set({ isAdmin: v }),
  setTamperProtection: (v) => set({ tamperProtection: v }),
  setConditions: (isAdmin, tamperProtection) => set({ isAdmin, tamperProtection }),
}));
