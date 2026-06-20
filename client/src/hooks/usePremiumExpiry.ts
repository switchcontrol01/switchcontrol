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
import { runPremiumRevert, hasPremiumItemsToRevert, PremiumRevertReport, RevertPhase } from '@/lib/premiumRevertEngine';
import { isTrialActive } from '@/lib/trialCountdown';
import { useTrialExpiryStore } from '@/stores/trialExpiryStore';
import { useTweakOwnershipStore } from '@/stores/tweakOwnershipStore';

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
  /** Current phase of the revert sequence — non-null while the engine is running. */
  revertPhase: RevertPhase | null;
  closeRevertModal: () => void;
  retryRevert: () => void;
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
  const prevPlan        = useRef<string | null>(null);
  const prevTrialEndsAt = useRef<string | null>(null);
  const revertRunning   = useRef(false);

  const [modalOpen,    setModalOpen]    = useState(false);
  const [revertReport, setRevertReport] = useState<PremiumRevertReport | null>(null);
  const [revertPhase,  setRevertPhase]  = useState<RevertPhase | null>(null);

  const isCurrentlyActive = isPremium || isTrialActive(plan ?? '', trialEndsAt);

  function determineRevertReason(
    prevP: string | null,
    prevTrialEnd: string | null,
  ): import("@/stores/trialExpiryStore").RevertReason {
    const wasTrial = prevP === 'trial' && Boolean(prevTrialEnd);
    if (wasTrial) return 'trial_expired';
    if (prevP === 'premium') return 'admin_downgrade';
    return 'premium_removed';
  }

  const triggerRevert = useCallback(async (reason: import("@/stores/trialExpiryStore").RevertReason) => {
    if (revertRunning.current) return;

    // Immediately suppress all premium gates and signal App.tsx to redirect.
    useTrialExpiryStore.getState().setTrialEndingFlowActive(true);
    useTrialExpiryStore.getState().setRevertReason(reason);

    if (!isElectronWithTweaks()) {
      setRevertReport({
        tweakResults: [],
        networkResults: [],
        extremeLabsResults: [],
        powerPlan: { status: 'not_applicable' },
        anyFailed: false,
        anyConflict: false,
        revertedCount: 0,
      });
      setRevertPhase('complete');
      setModalOpen(true);
      return;
    }

    revertRunning.current = true;

    // Open the modal immediately with the first phase so the user sees live
    // progress rather than staring at a blank screen for 5-30 seconds.
    setRevertReport(null);
    setRevertPhase('locking');
    setModalOpen(true);

    console.log(`[PremiumExpiry] Detected premium→inactive transition — reason=${reason} — running revert sequence`);
    try {
      const report = await runPremiumRevert((phase) => setRevertPhase(phase));
      setRevertReport(report);
      setRevertPhase('complete');
    } catch (err) {
      console.error('[PremiumExpiry] Revert sequence threw', err);
      setRevertReport({
        tweakResults: [],
        networkResults: [],
        extremeLabsResults: [],
        powerPlan: { status: 'not_applicable' },
        anyFailed: true,
        anyConflict: false,
        revertedCount: 0,
      });
      setRevertPhase('complete');
    } finally {
      revertRunning.current = false;
    }
  }, []);

  // ── State-change watcher ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn || !entitlementsVerified) {
      prevWasActive.current = null;
      return;
    }

    const wasActive = prevWasActive.current;

    if (wasActive === null) {
      prevWasActive.current = isCurrentlyActive;
      prevPlan.current = plan ?? null;
      prevTrialEndsAt.current = trialEndsAt ?? null;
      console.log(`[PremiumExpiry] Initial state recorded — active=${isCurrentlyActive} plan=${plan} trialEndsAt=${trialEndsAt}`);

      if (!isCurrentlyActive) {
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
          const reason = determineRevertReason(plan ?? null, trialEndsAt ?? null);
          console.log(`[PremiumExpiry] Opened post-expiry with owned items — reason=${reason} — triggering revert`);
          triggerRevert(reason);
        }
      }
      return;
    }

    if (wasActive && !isCurrentlyActive) {
      const reason = determineRevertReason(prevPlan.current, prevTrialEndsAt.current);
      console.log(`[PremiumExpiry] Transition detected: active → inactive — reason=${reason}`);
      triggerRevert(reason);
    }

    prevWasActive.current = isCurrentlyActive;
    prevPlan.current = plan ?? null;
    prevTrialEndsAt.current = trialEndsAt ?? null;
  }, [isCurrentlyActive, isLoggedIn, entitlementsVerified, triggerRevert]);

  // ── Countdown timer watcher ────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn || !entitlementsVerified) return;
    if (plan !== 'trial' || !trialEndsAt) return;

    const msUntilExpiry = new Date(trialEndsAt).getTime() - Date.now();
    if (msUntilExpiry <= 0) return;

    console.log(`[PremiumExpiry] Trial timer armed — fires in ${Math.round(msUntilExpiry / 1000)}s`);

    const timerId = setTimeout(() => {
      console.log('[PremiumExpiry] Trial timer fired — triggering revert');
      if (prevWasActive.current !== false) {
        prevWasActive.current = false;
        triggerRevert('trial_expired');
      }
    }, msUntilExpiry + 500);

    return () => clearTimeout(timerId);
  }, [isLoggedIn, entitlementsVerified, plan, trialEndsAt, triggerRevert]);

  const retryRevert = useCallback(async () => {
    revertRunning.current = false;
    const reason = determineRevertReason(prevPlan.current, prevTrialEndsAt.current);
    await triggerRevert(reason);
  }, [triggerRevert]);

  return {
    revertModalOpen: modalOpen,
    revertReport,
    revertPhase,
    closeRevertModal: () => {
      setModalOpen(false);
      setRevertPhase(null);
      useTweakOwnershipStore.getState().clearPremiumOwnership();
      useTrialExpiryStore.getState().setTrialEndingFlowActive(false);
      useTrialExpiryStore.getState().setRevertReason(null);
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
