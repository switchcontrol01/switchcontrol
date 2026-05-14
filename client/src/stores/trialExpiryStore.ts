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

export type RevertReason =
  | "trial_expired"
  | "admin_downgrade"
  | "subscription_cancelled"
  | "payment_failed"
  | "device_denied"
  | "premium_removed"
  | null;

interface TrialExpiryStore {
  /** True while the revert flow is running and the revert modal is open. */
  trialEndingFlowActive: boolean;
  setTrialEndingFlowActive: (active: boolean) => void;
  /** Why the premium access was lost — drives modal copy. */
  revertReason: RevertReason;
  setRevertReason: (reason: RevertReason) => void;
}

export const useTrialExpiryStore = create<TrialExpiryStore>()((set) => ({
  trialEndingFlowActive: false,
  setTrialEndingFlowActive: (active) => {
    console.log(`[TrialExpiry] trialEndingFlowActive → ${active}`);
    set({ trialEndingFlowActive: active });
  },
  revertReason: null,
  setRevertReason: (reason) => {
    console.log(`[TrialExpiry] revertReason → ${reason}`);
    set({ revertReason: reason });
  },
}));
