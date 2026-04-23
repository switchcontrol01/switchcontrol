/**
 * trialExpiryStore
 * ─────────────────
 * Global flag controlling the trial-ending UX flow.
 *
 * When trialEndingFlowActive is true:
 *  - All premium gate overlays return null (preventing z-9999 blocking of revert modal)
 *  - App.tsx forces a route redirect to /dashboard
 *  - PremiumRevertModal renders unobstructed
 *
 * Flow lifecycle:
 *  1. usePremiumExpiry.triggerRevert() → setTrialEndingFlowActive(true)
 *  2. App.tsx detects revertModalOpen → setLocation('/dashboard')
 *  3. User closes PremiumRevertModal → closeRevertModal() → setTrialEndingFlowActive(false)
 *  4. Premium gates resume normal behaviour
 */

import { create } from 'zustand';

interface TrialExpiryStore {
  /** True while the revert flow is running and the revert modal is open. */
  trialEndingFlowActive: boolean;
  setTrialEndingFlowActive: (active: boolean) => void;
}

export const useTrialExpiryStore = create<TrialExpiryStore>()((set) => ({
  trialEndingFlowActive: false,
  setTrialEndingFlowActive: (active) => {
    console.log(`[TrialExpiry] trialEndingFlowActive → ${active}`);
    set({ trialEndingFlowActive: active });
  },
}));
