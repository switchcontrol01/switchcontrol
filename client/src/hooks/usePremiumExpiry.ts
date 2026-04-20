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
    if (!isElectronWithTweaks()) {
      // Non-Electron: nothing to revert — show modal only if there were items
      if (hasPremiumItemsToRevert()) {
        setRevertReport({
          tweakResults: [],
          networkResults: [],
          powerPlan: { status: 'not_applicable' },
          anyFailed: false,
          anyConflict: false,
          revertedCount: 0,
        });
        setModalOpen(true);
      }
      return;
    }

    revertRunning.current = true;
    console.log('[PremiumExpiry] Detected premium→inactive transition — running revert sequence');
    try {
      const report = await runPremiumRevert();
      setRevertReport(report);
      // Show modal if anything was attempted or if there were any app-applied items
      const hadItems = report.tweakResults.length > 0 || report.networkResults.length > 0 ||
        report.powerPlan.status !== 'not_applicable';
      if (hadItems) {
        setModalOpen(true);
      }
    } catch (err) {
      console.error('[PremiumExpiry] Revert sequence threw', err);
    } finally {
      revertRunning.current = false;
    }
  }, []);

  useEffect(() => {
    // Wait until we have verified entitlements and the user is logged in
    if (!isLoggedIn || !entitlementsVerified) {
      prevWasActive.current = null;
      return;
    }

    const wasActive = prevWasActive.current;

    if (wasActive === null) {
      // First verified read — just record current state without triggering revert
      prevWasActive.current = isCurrentlyActive;
      console.log(`[PremiumExpiry] Initial state recorded — active=${isCurrentlyActive}`);
      return;
    }

    // Detect transition: was active → is now inactive
    if (wasActive && !isCurrentlyActive) {
      console.log('[PremiumExpiry] Transition detected: active → inactive');
      triggerRevert();
    }

    prevWasActive.current = isCurrentlyActive;
  }, [isCurrentlyActive, isLoggedIn, entitlementsVerified, triggerRevert]);

  const retryRevert = useCallback(async () => {
    revertRunning.current = false; // allow retry
    await triggerRevert();
  }, [triggerRevert]);

  return {
    revertModalOpen: modalOpen,
    revertReport,
    closeRevertModal: () => setModalOpen(false),
    retryRevert,
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
