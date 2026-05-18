/**
 * authGuards.ts
 * Entitlement-checking helpers and auth header builder for use in hooks/components.
 * Thin layer over authStore + entitlementService — no direct fetch logic here.
 */

import { useAuthStore, safeGetJwt, AuthUser } from './authStore';

// ── buildAuthHeaders ──────────────────────────────────────────────────────────
/**
 * Returns a headers dict with Authorization bearer token if a valid JWT exists.
 * Always includes Content-Type: application/json.
 */
export function buildAuthHeaders(): Record<string, string> {
  const jwt = safeGetJwt();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  return headers;
}

// ── Entitlement helpers ───────────────────────────────────────────────────────

/** True if a valid, cloud-verified session exists. Never trust cached-only state. */
export function isSessionValid(entitlementsVerified: boolean): boolean {
  const user = useAuthStore.getState().user;
  return !!(user?.loggedIn && entitlementsVerified);
}

/**
 * Returns the current user only if the session is cloud-verified.
 * Returns null for cached-only (unverified) sessions.
 * Use this before gating sensitive UI or making write API calls.
 */
export function getVerifiedUser(entitlementsVerified: boolean): AuthUser | null {
  if (!entitlementsVerified) return null;
  const user = useAuthStore.getState().user;
  return user?.loggedIn ? user : null;
}

// ── Error helpers ─────────────────────────────────────────────────────────────

/** Returns true if an Error message matches a 401 Unauthorized pattern. */
export function isUnauthorizedError(error: Error): boolean {
  return /^401:.*Unauthorized/i.test(error.message);
}

/**
 * Redirect to the login page, optionally showing a toast first.
 * Only use for web contexts — Electron handles auth via deep links.
 */
export function redirectToLogin(
  toast?: (opts: { title: string; description: string; variant: string }) => void,
): void {
  if (toast) {
    toast({
      title: 'Unauthorized',
      description: 'You are logged out. Logging in again…',
      variant: 'destructive',
    });
  }
  setTimeout(() => {
    window.location.href = '/api/login';
  }, 500);
}
