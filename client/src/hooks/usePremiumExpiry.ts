/**
 * usePremiumExpiry
 * ────────────────
 * Detects when the user's premium/trial status transitions from active to
 * inactive (expiry or cancellation). On that event, triggers the safe revert
 * engine and surfaces the result modal.
 *
 * Only runs in Electron mode — web mode has no real system state to revert.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { isElectronWithTweaks } from '@/hooks/use-tweak-executor';
import { runPremiumRevert, hasPremiumItemsToRevert, PremiumRevertReport } from '@/lib/premiumRevertEngine';
import { isTrialActive } from '@/lib/trialCountdown';
import { useTrialExpiryStore } from '@/stores/trialExpiryStore';

interface UsePremiumExpiryOptions {
  isPremium: boolean;
  plan: string | null | undefined;
  trialEndsAt: string | null | undefined;
  isLoggedIn: boolean;
  entitlementsVerified: boolean;
}

interface UsePremiumExpiryReturn {
  revertModalOpen: boolean;
  revertReport: PremiumRevertReport | null;
  closeRevertModal: () => void;
  retryRevert: () => void;
  /** True when the user currently has active premium/trial access (client-side truth). */
  isActive: boolean;
}

export function usePremiumExpiry({
  isPremium,
  plan,
  trialEndsAt,
  isLoggedIn,
  entitlementsVerified,
}: UsePremiumExpiryOptions): UsePremiumExpiryReturn {
  const prevWasActive   = useRef<boolean | null>(null);
  const revertRunning   = useRef(false);

  const [modalOpen,    setModalOpen]    = useState(false);
  const [revertReport, setRevertReport] = useState<PremiumRevertReport | null>(null);

  // True when the user currently has active premium access
  const isCurrentlyActive = isPremium || isTrialActive(plan ?? '', trialEndsAt);

  const triggerRevert = useCallback(async () => {
    if (revertRunning.current) return;

    // Immediately suppress all premium gates and signal App.tsx to redirect.
    // This fires synchronously before any async work so there is zero window
    // where a z-9999 premium overlay can block the revert modal.
    useTrialExpiryStore.getState().setTrialEndingFlowActive(true);

    if (!isElectronWithTweaks()) {
      // Non-Electron: nothing real to revert — always show the modal so the
      // user is informed their trial ended, even if no tweaks were applied.
      setRevertReport({
        tweakResults: [],
        networkResults: [],
        powerPlan: { status: 'not_applicable' },
        anyFailed: false,
        anyConflict: false,
        revertedCount: 0,
      });
      setModalOpen(true);
      return;
    }

    revertRunning.current = true;
    console.log('[PremiumExpiry] Detected premium→inactive transition — running revert sequence');
    try {
      const report = await runPremiumRevert();
      setRevertReport(report);
      // Always show the modal so the user is informed their trial ended.
      setModalOpen(true);
    } catch (err) {
      console.error('[PremiumExpiry] Revert sequence threw', err);
      // Still show modal even if revert failed — user must know trial ended
      setRevertReport({
        tweakResults: [],
        networkResults: [],
        powerPlan: { status: 'not_applicable' },
        anyFailed: true,
        anyConflict: false,
        revertedCount: 0,
      });
      setModalOpen(true);
    } finally {
      revertRunning.current = false;
    }
  }, []);

  // ── State-change watcher ───────────────────────────────────────────────────
  // Detects when isPremium flips from true→false (e.g. server-side cancellation).
  useEffect(() => {
    // Wait until we have verified entitlements and the user is logged in
    if (!isLoggedIn || !entitlementsVerified) {
      prevWasActive.current = null;
      return;
    }

    const wasActive = prevWasActive.current;

    if (wasActive === null) {
      // First verified read — record state and handle "opened after expiry" case.
      prevWasActive.current = isCurrentlyActive;
      console.log(`[PremiumExpiry] Initial state recorded — active=${isCurrentlyActive}`);

      if (!isCurrentlyActive) {
        // Section 6 — Startup sanity check (belt-and-suspenders).
        // If the user is not premium and a SC power plan is still active, force
        // it to Windows Balanced immediately — regardless of Zustand store state.
        // This closes the loophole where the revert previously skipped/failed the
        // power plan step, or ownership data was cleared while the plan persisted.
        if (isElectronWithTweaks()) {
          const premiumAPI = (window as any).electronAPI?.premium;
          if (premiumAPI?.powerPlanSanityCheck) {
            console.log('[PremiumExpiry] Running startup power plan sanity check...');
            premiumAPI.powerPlanSanityCheck().then((result: any) => {
              console.log('[PremiumExpiry] Sanity check result:', result);
            }).catch((e: any) => {
              console.error('[PremiumExpiry] Sanity check error:', e);
            });
          }
        }

        if (hasPremiumItemsToRevert()) {
          console.log('[PremiumExpiry] Opened post-expiry with owned items — triggering revert');
          triggerRevert();
        }
      }
      return;
    }

    // Detect transition: was active → is now inactive
    if (wasActive && !isCurrentlyActive) {
      console.log('[PremiumExpiry] Transition detected: active → inactive');
      triggerRevert();
    }

    prevWasActive.current = isCurrentlyActive;
  }, [isCurrentlyActive, isLoggedIn, entitlementsVerified, triggerRevert]);

  // ── Countdown timer watcher ────────────────────────────────────────────────
  // The state-change watcher above only fires when React props change.
  // For trial expiry by time (trialEndsAt passes), we need an explicit timer.
  useEffect(() => {
    if (!isLoggedIn || !entitlementsVerified) return;
    if (plan !== 'trial' || !trialEndsAt) return;

    const msUntilExpiry = new Date(trialEndsAt).getTime() - Date.now();

    // Already expired before we even mounted — prevWasActive handles this
    if (msUntilExpiry <= 0) return;

    console.log(`[PremiumExpiry] Trial timer armed — fires in ${Math.round(msUntilExpiry / 1000)}s`);

    const timerId = setTimeout(() => {
      console.log('[PremiumExpiry] Trial timer fired — triggering revert');
      // Only fire if prevWasActive still says we were active (avoid double-trigger)
      if (prevWasActive.current !== false) {
        prevWasActive.current = false;
        triggerRevert();
      }
    }, msUntilExpiry + 500); // +500ms buffer so the clock is definitely past end

    return () => clearTimeout(timerId);
  }, [isLoggedIn, entitlementsVerified, plan, trialEndsAt, triggerRevert]);

  const retryRevert = useCallback(async () => {
    revertRunning.current = false; // allow retry
    await triggerRevert();
  }, [triggerRevert]);

  return {
    revertModalOpen: modalOpen,
    revertReport,
    closeRevertModal: () => {
      setModalOpen(false);
      // Release the gate suppression — premium overlays return to normal after user
      // has seen the revert summary and dismissed the modal.
      useTrialExpiryStore.getState().setTrialEndingFlowActive(false);
    },
    retryRevert,
    isActive: isCurrentlyActive,
  };
}

// ── First-run baseline scan ───────────────────────────────────────────────────

import { useTweakOwnershipStore } from '@/stores/tweakOwnershipStore';
import { REAL_TWEAKS } from '@/hooks/use-tweak-executor';
import { isTweakPremium } from '@/lib/premium-config';
import { TWEAKS_DATA } from '@/lib/mock-data';

/**
 * Runs the first-launch baseline scan to record all tweaks that are already
 * applied on the system before the app touched them.
 * Only runs once per device (guarded by baselineInitialized flag).
 * Must only run in Electron mode.
 */
export function useBaselineScan() {
  const baselineInitialized = useTweakOwnershipStore(s => s.baselineInitialized);
  const {
    recordTweakBaseline,
    recordNetworkTweakBaseline,
    setBaselineInitialized,
  } = useTweakOwnershipStore.getState();

  const ran = useRef(false);

  useEffect(() => {
    if (baselineInitialized) return;
    if (ran.current) return;
    if (!isElectronWithTweaks()) return;

    ran.current = true;

    const scan = async () => {
      console.log('[Baseline] Starting first-run baseline scan...');
      const api = (window as any).electronAPI?.tweaks;
      if (!api) return;

      let scanned = 0;
      for (const tweakId of REAL_TWEAKS) {
        try {
          const status = await api.checkStatus(tweakId);
          const isApplied: boolean = status?.isApplied ?? false;
          const tweakMeta = TWEAKS_DATA.find(t => t.id === tweakId);
          const label = tweakMeta?.title ?? tweakId;
          const isPremium = isTweakPremium(tweakId);
          recordTweakBaseline(tweakId, isApplied, label, isPremium);
          scanned++;
        } catch {
          // Silently skip — unavailable tweaks are not baselined
        }
      }

      // Network tweaks baseline — read from backend API
      try {
        const r = await fetch('/api/network-tweaks/state');
        if (r.ok) {
          const data = await r.json();
          for (const [id, s] of Object.entries(data?.state ?? {})) {
            const status = (s as any).status === 'on' ? 'on' : 'off';
            recordNetworkTweakBaseline(id, status, id);
            scanned++;
          }
        }
      } catch {
        // Non-fatal
      }

      setBaselineInitialized();
      console.log(`[Baseline] Complete — ${scanned} tweaks scanned`);
    };

    scan();
  }, [baselineInitialized, recordTweakBaseline, recordNetworkTweakBaseline, setBaselineInitialized]);
}
