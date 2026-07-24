/**
 * trialExpiryStore
 * ─────────────────
 * Global flag controlling the trial-ending UX flow.
 *
 * When trialEndingFlowActive is true:
 *  - All premium gate overlays return null (preventing z-9999 blocking of revert modal)
 *  - App.tsx detects `revertModalOpen` (from usePremiumExpiry) → redirects to /dashboard
 *  - PremiumRevertModal renders unobstructed
 *
 * Flow lifecycle:
 *  1. usePremiumExpiry.triggerRevert() → startRevertFlow(reason)   ← atomic: sets both fields in one set()
 *  2. App.tsx detects revertModalOpen (hook local state) → setLocation('/dashboard')
 *  3. User closes PremiumRevertModal → stopRevertFlow()             ← atomic: clears both fields
 *  4. Premium gates resume normal behaviour
 *
 * Prefer startRevertFlow / stopRevertFlow over the individual setters —
 * using them together eliminates the render frame where trialEndingFlowActive
 * is true but revertReason is still null/stale.
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
  /** Why the premium access was lost — drives modal copy. */
  revertReason: RevertReason;

  /**
   * Atomically activate the flow and record the reason in a single set() call.
   * Prevents the intermediate render frame where the flow is active but
   * revertReason is still null/stale from a previous run.
   * No-ops if the flow is already active — first trigger wins, preventing a
   * concurrent second trigger (e.g. webhook + client timer) from clobbering
   * the reason mid-revert.
   */
  startRevertFlow: (reason: RevertReason) => void;

  /**
   * Atomically deactivate the flow and clear the reason in a single set() call.
   * Always call this from every close path — closeRevertModal, error boundaries,
   * etc. — to guarantee trialEndingFlowActive never gets stuck true after a
   * modal crash (which would silently disable all premium gates app-wide).
   */
  stopRevertFlow: () => void;

  // Individual setters kept for edge-case callers; prefer startRevertFlow/stopRevertFlow.
  setTrialEndingFlowActive: (active: boolean) => void;
  setRevertReason: (reason: RevertReason) => void;
}

export const useTrialExpiryStore = create<TrialExpiryStore>()((set, get) => ({
  trialEndingFlowActive: false,
  revertReason: null,

  startRevertFlow: (reason) => {
    if (get().trialEndingFlowActive) {
      // Already running — first trigger wins. Log and bail so a concurrent
      // second trigger (e.g. webhook + client-side timer) can't overwrite the
      // reason that the active revert is already acting on.
      if (import.meta.env.DEV) {
        console.log(`[TrialExpiry] startRevertFlow(${reason}) ignored — flow already active`);
      }
      return;
    }
    if (import.meta.env.DEV) {
      console.log(`[TrialExpiry] startRevertFlow → reason=${reason}`);
    }
    set({ trialEndingFlowActive: true, revertReason: reason });
  },

  stopRevertFlow: () => {
    if (import.meta.env.DEV) {
      console.log('[TrialExpiry] stopRevertFlow — resetting flow');
    }
    set({ trialEndingFlowActive: false, revertReason: null });
  },

  setTrialEndingFlowActive: (active) => {
    if (import.meta.env.DEV) {
      console.log(`[TrialExpiry] setTrialEndingFlowActive → ${active}`);
    }
    set({ trialEndingFlowActive: active });
  },

  setRevertReason: (reason) => {
    if (import.meta.env.DEV) {
      console.log(`[TrialExpiry] setRevertReason → ${reason}`);
    }
    set({ revertReason: reason });
  },
}));
