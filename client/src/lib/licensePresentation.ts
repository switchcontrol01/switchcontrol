import { resolveEntitlementUiState } from "./entitlementResolver";

export type VerifiedLicenseStatus =
  | "active"
  | "trial_active"
  | "trial_expired"
  | "grace"
  | "expired"
  | "free"
  | "unknown";

export interface VerifiedLicense {
  status: VerifiedLicenseStatus;
  plan: string | null;
  isPremium: boolean;
  trialEndsAt: string | null;
  isOfflineCached: boolean;
  lastVerifiedAt: number | null;
  graceRemainingMs: number;
}

interface LicenseUserSnapshot {
  plan?: string | null;
  isPremium?: boolean;
  trialEndsAt?: string | null;
}

export function resolveLicenseSnapshot(
  user: LicenseUserSnapshot,
  lastVerifiedAt: number | null,
  offline = false,
  now = Date.now(),
): VerifiedLicense {
  const entitlement = resolveEntitlementUiState({
    user: { ...user, loggedIn: true },
    entitlementsVerified: true,
    graceStatus: offline ? "grace" : "active",
    now,
  });

  let status: VerifiedLicenseStatus;
  switch (entitlement.status) {
    case "trial_active":
    case "trial_expired":
      status = entitlement.status;
      break;
    case "premium_grace":
      status = "grace";
      break;
    case "premium":
      status = offline ? "grace" : "active";
      break;
    default:
      status = "free";
  }

  return {
    status,
    plan: user.plan ?? null,
    isPremium: !!user.isPremium,
    trialEndsAt: user.trialEndsAt ?? null,
    isOfflineCached: offline,
    lastVerifiedAt,
    graceRemainingMs: 0,
  };
}
