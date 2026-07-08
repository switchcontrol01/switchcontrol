/**
 * entitlementResolver — canonical entitlement UI state.
 *
 * RULE: There is exactly ONE truth source for entitlement display.
 * Every surface that shows a trial countdown, premium badge, or expiry notice
 * must call resolveEntitlementUiState() and use nothing else.
 *
 * Priority order (strict — trial evaluated before generic isPremium):
 *  1. user is null / not logged in                                  → "unverified"
 *  2. plan === "trial" && trialEndsAt > now                         → "trial_active"
 *  3. plan === "trial" && (no date or date <= now)                  → "trial_expired"
 *  4. !entitlementsVerified && isPremium && graceStatus=active      → "premium"
 *     (startup fast-path: grace cache bridges the cloud round-trip)
 *  5. entitlementsVerified && isPremium && grace active             → "premium_grace"
 *  6. entitlementsVerified && isPremium                             → "premium"
 *  7. (everything else)                                             → "free"
 *
 * Trial state is deliberately checked before generic isPremium because the
 * backend sets isPremium=true for active trial users (so the generic premium
 * branch can never accidentally override an active-trial UI).
 *
 * Trial state uses client-side timestamp math (deterministic, no server round-
 * trip needed). Premium status is gated on entitlementsVerified because it can
 * change via Stripe webhooks or admin actions at any time.
 */

import type { PremiumVerificationStatus, EntitlementFeatures } from "@/stores/premiumGraceStore";

// ── Public types ───────────────────────────────────────────────────────────────

export type { EntitlementFeatures };

export type EntitlementUiStatus =
  | "unverified"
  | "free"
  | "trial_active"
  | "trial_expired"
  | "premium"
  | "premium_grace";

export interface EntitlementUiState {
  status: EntitlementUiStatus;

  /** Countdown string, e.g. "2d 3h remaining" or "Trial expired". */
  countdownLabel: string;

  /** Short label for the footer badge, e.g. "Premium" / "Trial" / "Free". */
  badgeText: string;

  /** True only when trial is active — drives the top countdown banner. */
  showTrialBanner: boolean;

  /** True for premium or premium_grace. */
  showPremiumBadge: boolean;

  /** True for trial_active — drives the footer trial chip. */
  showTrialBadge: boolean;

  /** trial_active with < 2 days remaining — drives red urgency styling. */
  isTrialUrgent: boolean;

  /** Full days remaining (trial_active only; 0 otherwise). */
  trialDaysRemaining: number;

  /**
   * Per-feature flags cached from /api/account/entitlements.
   * null until the first successful server response.
   */
  features: EntitlementFeatures | null;

  /**
   * True when entitlements are being served from the 30-day grace cache
   * (server unreachable). Use to show an offline/cached indicator in UI.
   */
  isOfflineCached: boolean;
}

interface ResolveInput {
  user: {
    plan?: string | null;
    isPremium?: boolean;
    trialEndsAt?: string | null;
    loggedIn?: boolean;
  } | null;
  entitlementsVerified: boolean;
  graceStatus?: PremiumVerificationStatus;
  features?: EntitlementFeatures | null;
  /** Override for testability. Defaults to Date.now(). */
  now?: number;
}

// ── Pure resolver — no side-effects, safe to call every render ────────────────

export function resolveEntitlementUiState({
  user,
  entitlementsVerified,
  graceStatus = "unknown",
  features = null,
  now = Date.now(),
}: ResolveInput): EntitlementUiState {
  const isOfflineCached = graceStatus === "grace";

  const UNVERIFIED: EntitlementUiState = {
    status: "unverified",
    countdownLabel: "",
    badgeText: "Free",
    showTrialBanner: false,
    showPremiumBadge: false,
    showTrialBadge: false,
    isTrialUrgent: false,
    trialDaysRemaining: 0,
    features,
    isOfflineCached,
  };

  if (!user || user.loggedIn === false) return UNVERIFIED;

  const plan = user.plan ?? "free";
  const trialEndsAt = user.trialEndsAt ?? null;
  const trialEndMs = trialEndsAt ? new Date(trialEndsAt).getTime() : null;
  const trialActive = plan === "trial" && trialEndMs !== null && trialEndMs > now;

  // ── 1. Trial active ─────────────────────────────────────────────────────────
  if (trialActive && trialEndMs !== null) {
    const remainingMs = trialEndMs - now;
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    return {
      status: "trial_active",
      countdownLabel: _formatCountdown(remainingMs),
      badgeText: "Trial",
      showTrialBanner: true,
      showPremiumBadge: false,
      showTrialBadge: true,
      isTrialUrgent: days < 2,
      trialDaysRemaining: days,
      features,
      isOfflineCached,
    };
  }

  // ── 2. Trial expired ────────────────────────────────────────────────────────
  if (plan === "trial") {
    return {
      status: "trial_expired",
      countdownLabel: "Trial expired",
      badgeText: "Free",
      showTrialBanner: false,
      showPremiumBadge: false,
      showTrialBadge: false,
      isTrialUrgent: false,
      trialDaysRemaining: 0,
      features,
      isOfflineCached,
    };
  }

  // ── 3. Pre-verification premium (grace cache confirms during startup) ────────
  // When entitlementsVerified is not yet true (cloud round-trip still in flight
  // or backend not yet reachable), show premium immediately from the grace cache.
  // Fires only when graceStatus === 'active' — meaning the backend IS reachable
  // and the grace store has a recent isPremium=true snapshot.  This prevents the
  // 1-2 s "Free" flash that happens on every fast-path boot (and is especially
  // noticeable after an app update) before resolveAuthState() sets
  // entitlementsVerified=true.  resolveAuthState() will correct user.isPremium if
  // the server reports a different value.
  if (!entitlementsVerified && user.isPremium && graceStatus === "active") {
    return {
      status: "premium",
      countdownLabel: "",
      badgeText: "Premium",
      showTrialBanner: false,
      showPremiumBadge: true,
      showTrialBadge: false,
      isTrialUrgent: false,
      trialDaysRemaining: 0,
      features,
      isOfflineCached: false,
    };
  }

  // ── 4. Premium grace (offline or degraded, within 30-day grace window) ──────
  if (entitlementsVerified && user.isPremium && graceStatus === "grace") {
    return {
      status: "premium_grace",
      countdownLabel: "",
      badgeText: "Premium",
      showTrialBanner: false,
      showPremiumBadge: true,
      showTrialBadge: false,
      isTrialUrgent: false,
      trialDaysRemaining: 0,
      features,
      isOfflineCached: true,
    };
  }

  // ── 4. Premium ──────────────────────────────────────────────────────────────
  if (entitlementsVerified && user.isPremium) {
    return {
      status: "premium",
      countdownLabel: "",
      badgeText: "Premium",
      showTrialBanner: false,
      showPremiumBadge: true,
      showTrialBadge: false,
      isTrialUrgent: false,
      trialDaysRemaining: 0,
      features,
      isOfflineCached,
    };
  }

  // ── 5. Free ─────────────────────────────────────────────────────────────────
  return {
    status: "free",
    countdownLabel: "",
    badgeText: "Free",
    showTrialBanner: false,
    showPremiumBadge: false,
    showTrialBadge: false,
    isTrialUrgent: false,
    trialDaysRemaining: 0,
    features,
    isOfflineCached,
  };
}

// ── Internal countdown formatter ──────────────────────────────────────────────
// Kept private — use countdownLabel from resolveEntitlementUiState instead.

function _formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "Trial expired";
  const days    = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const hours   = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
  if (days > 0)    return `${days}d ${hours}h remaining`;
  if (hours > 0)   return `${hours}h ${minutes}m remaining`;
  if (minutes > 0) return `${minutes}m ${seconds}s remaining`;
  return `${seconds}s remaining`;
}
