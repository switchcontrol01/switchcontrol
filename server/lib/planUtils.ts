export type EffectivePlan = "free" | "trial" | "trial_expired" | "premium";

interface PlanResolvable {
  isPremium: boolean;
  plan?: string | null;
  trialEndsAt?: Date | null;
}

/**
 * Single source of truth for resolving a user's effective plan.
 *
 * Priority order:
 *  1. plan === 'premium'       → premium (admin grant or Stripe-synced)
 *  2. plan === 'trial'         → trial (if active) or trial_expired
 *  3. isPremium === true       → premium (legacy Stripe boolean fallback)
 *  4. everything else          → free
 *
 * The `plan` field is checked before the raw `isPremium` boolean so that an
 * explicit admin plan grant (e.g. "trial") is never overridden by a stale
 * `isPremium=true` left over from a previous state.  The boolean is kept as a
 * final fallback so that accounts whose plan column is null but whose Stripe
 * webhook already set isPremium=true are still correctly treated as premium.
 */
export function resolveEffectivePlan(user: PlanResolvable): EffectivePlan {
  if (user.plan === "premium") return "premium";

  if (user.plan === "trial") {
    if (user.trialEndsAt && new Date() < new Date(user.trialEndsAt)) {
      return "trial";
    }
    return "trial_expired";
  }

  // Legacy fallback: isPremium boolean set directly by Stripe webhook on
  // accounts that pre-date the explicit `plan` column.
  if (user.isPremium) return "premium";

  return "free";
}

/** Returns true if the user currently has any active entitlement (premium OR active trial). */
export function isPlanActive(plan: EffectivePlan): boolean {
  return plan === "premium" || plan === "trial";
}

/** Formats a trial expiry for display. Returns null when not on trial. */
export function formatTrialExpiry(user: PlanResolvable): string | null {
  const plan = resolveEffectivePlan(user);
  if (plan !== "trial" || !user.trialEndsAt) return null;
  return new Date(user.trialEndsAt).toISOString();
}
