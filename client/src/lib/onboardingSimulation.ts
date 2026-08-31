import type { AuthUser } from "@/lib/auth-store";

export const ONBOARDING_SIMULATION_ADMIN_EMAIL = "switchcontrol67@gmail.com";

export function normalizeAccountEmail(email: string | null | undefined): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/**
 * The UI check is intentionally the same as the action check. A persisted
 * client-side isAdmin value is not trusted until the current session has been
 * confirmed by the server.
 */
export function canSimulateFirstTimeUser(
  user: Pick<AuthUser, "email" | "isAdmin" | "loggedIn"> | null,
  entitlementsVerified: boolean,
  isElectron: boolean,
): boolean {
  return Boolean(
    isElectron &&
      entitlementsVerified &&
      user?.loggedIn === true &&
      user.isAdmin === true &&
      normalizeAccountEmail(user.email) === ONBOARDING_SIMULATION_ADMIN_EMAIL,
  );
}