/**
 * useEntitlementUiState
 *
 * The single reactive source of truth for entitlement UI across all surfaces.
 * Uses resolveEntitlementUiState() every render so there is NEVER stale state
 * from a useState() lazy initializer.  A minute-tick keeps the countdown live
 * without any useState for the label itself.
 *
 * Usage:
 *   const ent = useEntitlementUiState();
 *   ent.showTrialBanner   → drive TrialCountdownBanner visibility
 *   ent.countdownLabel    → display text, always fresh
 *   ent.showPremiumBadge  → footer badge
 *   ent.status            → for dev logging / conditional styling
 */

import { useState } from "react";
import { useAppAuth } from "@/lib/appAuthContext";
import { usePremiumGraceStore } from "@/stores/premiumGraceStore";
import { useNetworkStore } from "@/stores/networkStore";
import { useVisibilityInterval } from "@/hooks/useVisibilityInterval";
import {
  resolveEntitlementUiState,
  EntitlementUiState,
} from "@/lib/entitlementResolver";

export type { EntitlementUiState } from "@/lib/entitlementResolver";

const DEV = import.meta.env.DEV;

export function useEntitlementUiState(): EntitlementUiState {
  const { user: rawUser, entitlementsVerified } = useAppAuth();
  const grace = usePremiumGraceStore();
  const isBackendReachable = useNetworkStore((s) => s.isBackendReachable);
  const graceStatus = grace.getStatus(isBackendReachable);

  // Map AppAuthContext user → resolver input shape.
  // useAppAuth().user is the raw AuthUser from the store; the auth hook remaps
  // it into a display-oriented shape.  The resolver only needs plan/isPremium/
  // trialEndsAt, all of which exist on AuthUser.
  const user = rawUser
    ? {
        loggedIn: rawUser.loggedIn ?? true,
        plan: rawUser.plan,
        isPremium: rawUser.isPremium,
        trialEndsAt: rawUser.trialEndsAt,
      }
    : null;

  // Keep track of whether the trial is currently active so we can set up a
  // minute-tick only when needed (avoids orphaned intervals on free/premium).
  const trialEndMs =
    user?.plan === "trial" && user.trialEndsAt
      ? new Date(user.trialEndsAt).getTime()
      : null;
  const trialCurrentlyActive = trialEndMs !== null && trialEndMs > Date.now();

  // Tick counter — increments every minute while trial is active.
  // This forces a re-render so resolveEntitlementUiState() is called with
  // a fresh Date.now(), keeping the countdown accurate without any useState
  // for the label string.
  const [, setTick] = useState(0);
  useVisibilityInterval(
    () => setTick((n) => n + 1),
    60_000,
    "Entitlement:trialCountdown",
    "useEntitlementUiState.ts",
    trialCurrentlyActive,
  );

  const cachedFeatures = grace.features;

  const result = resolveEntitlementUiState({
    user,
    entitlementsVerified,
    graceStatus,
    features: cachedFeatures,
  });

  if (DEV) {
    // One-line trace: cheap object comparison is skipped — just log on every
    // render so devtools shows the last value without needing React DevTools.
    // In practice renders are rare (auth changes, minute ticks, grace changes).
    console.debug(
      `[Entitlement] status=${result.status} verified=${entitlementsVerified} plan=${user?.plan ?? "null"} isPremium=${user?.isPremium ?? false} trialEndsAt=${user?.trialEndsAt ?? "null"} graceStatus=${graceStatus}`,
    );
  }

  return result;
}
