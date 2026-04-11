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
 *  1. plan === 'premium'  → premium (admin grant or Stripe-synced)
 *  2. isPremium === true  → premium (Stripe webhook set this)
 *  3. plan === 'trial'    → trial (if not expired) or trial_expired
 *  4. everything else     → free
 */
export function resolveEffectivePlan(user: PlanResolvable): EffectivePlan {
  if (user.plan === "premium") return "premium";
  if (user.isPremium) return "premium";

  if (user.plan === "trial") {
    if (user.trialEndsAt && new Date() < new Date(user.trialEndsAt)) {
      return "trial";
    }
    return "trial_expired";
  }

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
