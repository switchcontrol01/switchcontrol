/**
 * entitlementService.ts
 * Canonical /api/me → AuthUser normalization and auth startup sequence.
 *
 * - normalizeApiMeUser: single source of truth for mapping a /api/me response
 *   to an AuthUser. Previously duplicated in 3 places — now one function.
 * - resolveAuthState: hardened startup sequence (load → validate → reissue → me → resolve).
 *
 * Security notes:
 *  - isPremium is taken directly from the server response. Client never synthesizes it.
 *  - isAdmin is taken from server response. UI gates are informational only;
 *    all admin API routes are protected server-side with requireAdmin middleware.
 *  - Premium is never downgraded on network/5xx failure — only on explicit cloud 401/loggedIn=false.
 */

import { useAuthStore, safeGetJwt, AuthUser, bumpMeGeneration } from './authStore';
import { AUTH_DOMAIN } from './electronAuth';
import { checkJwtExpiry, reissueJwtFromSession, jwtFingerprint } from './jwt';

const isDebug = import.meta.env.DEV;

// ── normalizeApiMeUser ────────────────────────────────────────────────────────
/**
 * Map a raw /api/me (or /api/auth/exchange) JSON response to a typed AuthUser.
 * This is the ONLY place this mapping happens — never duplicate it.
 *
 * Security: isPremium and isAdmin come from `data` (server truth).
 * The `fallback` is used only for id/email fields that may be absent in partial responses.
 */
export function normalizeApiMeUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>,
  fallback: AuthUser | null,
): AuthUser {
  // Server computes isPremium — never re-derive it client-side from plan/trialEndsAt.
  // Exception: if server returns plan=trial without isPremium, we respect the server's
  // explicit isPremium flag only. If data.isPremium is absent, default to false.
  const isPremium = !!data.isPremium;
  const plan: string = data.plan ?? (isPremium ? 'premium' : 'free');

  return {
    id: data.id || fallback?.id || '',
    email: data.email ?? null,
    username: data.name ?? data.firstName ?? null,
    avatarUrl: data.avatar ?? null,
    plan,
    isPremium,
    trialEndsAt: data.trialEndsAt ?? null,
    // isAdmin: server is authoritative. UI gates are informational; server enforces.
    isAdmin: !!data.isAdmin,
    hasSeenPremiumUnlock: !!data.hasSeenPremiumUnlock,
    hasSeenPremiumTour: !!data.hasSeenPremiumTour,
    hasSeenTrialActivation: !!data.hasSeenTrialActivation,
    hasSeenTrialTour: !!data.hasSeenTrialTour,
    loggedIn: true,
  };
}

// ── resolveAuthState ──────────────────────────────────────────────────────────

export interface AuthStateResolution {
  user: AuthUser | null;
  jwt: string | null;
  verified: boolean;
  reason: string;
}

/**
 * Full auth-truth resolution with the mandated startup order:
 *  1. Load stored user/JWT
 *  2. Check JWT structure (reject malformed)
 *  3. Check JWT expiry (with 30s tolerance, via checkJwtExpiry)
 *  4. Try JWT reissue if expired
 *  5. Call cloud /api/me
 *  6. Normalize response → AuthUser
 *  7. Update store + return result
 *
 * Premium is NEVER downgraded on network/5xx failure.
 * Only downgrade when cloud explicitly says 401 or loggedIn=false.
 */
export async function resolveAuthState(): Promise<AuthStateResolution> {
  const requestId = Math.random().toString(36).slice(2, 8);
  if (isDebug) console.log(`[AuthTruth] resolveAuthState START reqId=${requestId}`);

  const store = useAuthStore.getState();
  const storedUser = store.user;
  const storedJwt = store.jwt;

  // Step 1: loaded from persisted store (hydration already validated by authStore.ts merge)
  if (isDebug) {
    console.log(
      `[AuthTruth] step1 loaded — user=${storedUser?.id ?? 'none'} jwt=${storedJwt ? 'yes' : 'no'}`,
    );
  }

  // Step 2+3: validate JWT structure and expiry (non-destructive check)
  const jwtCheck = checkJwtExpiry(storedJwt);
  if (isDebug) {
    console.log(
      `[AuthTruth] step2 jwtCheck — malformed=${jwtCheck.malformed} expired=${jwtCheck.expired}`,
    );
  }

  let activeJwt: string | null = storedJwt;

  if (jwtCheck.malformed && activeJwt) {
    const fp = jwtFingerprint(activeJwt);
    if (isDebug) console.warn(`[AuthTruth] JWT malformed — clearing. tokenId=${fp}`);
    store.setJwt(null);
    activeJwt = null;
  }

  // Step 4: reissue if expired
  if (jwtCheck.expired && activeJwt) {
    if (isDebug) console.log('[AuthTruth] step4 JWT expired — attempting reissue');
    const reissued = await reissueJwtFromSession();
    if (reissued) {
      store.setJwt(reissued);
      activeJwt = reissued;
      if (isDebug) console.log('[AuthTruth] step4 reissue=SUCCESS');
    } else {
      if (isDebug) console.warn('[AuthTruth] step4 reissue=FAILED — sending expired JWT for one /api/me attempt (session cookie may still be valid)');
    }
  } else {
    if (isDebug) console.log('[AuthTruth] step4 reissue=SKIP');
  }

  // Step 5: call cloud /api/me
  if (isDebug) console.log(`[AuthTruth] step5 /api/me reqId=${requestId}`);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (activeJwt) headers['Authorization'] = `Bearer ${activeJwt}`;

    const resp = await fetch(`${AUTH_DOMAIN}/api/me`, { headers, credentials: 'include' });

    if (!resp.ok) {
      if (isDebug) console.warn(`[AuthTruth] /api/me HTTP ${resp.status} reqId=${requestId}`);

      if (resp.status === 401) {
        if (isDebug) console.log(`[AuthTruth] 401=LOGGED_OUT — clearing state reqId=${requestId}`);
        bumpMeGeneration();
        store.logout();
        return { user: null, jwt: null, verified: true, reason: 'logged_out_by_cloud' };
      }

      // 5xx / network hiccup — preserve cached state, do NOT downgrade premium
      if (isDebug) {
        console.warn(
          `[AuthTruth] HTTP ${resp.status}=PRESERVE_CACHED — ` +
          `userId=${storedUser?.id ?? 'none'} isPremium=${storedUser?.isPremium ?? false} reqId=${requestId}`,
        );
      }
      return { user: storedUser, jwt: activeJwt, verified: false, reason: `cloud_unavailable_${resp.status}` };
    }

    const data = await resp.json();
    if (isDebug) {
      console.log(
        `[AuthTruth] /api/me OK loggedIn=${data.loggedIn} isPremium=${data.isPremium} plan=${data.plan} reqId=${requestId}`,
      );
    }

    if (data.loggedIn === false) {
      if (isDebug) console.log(`[AuthTruth] loggedIn=false → logout reqId=${requestId}`);
      bumpMeGeneration();
      store.logout();
      return { user: null, jwt: null, verified: true, reason: 'logged_out_by_cloud' };
    }

    // Step 6: normalize
    const user = normalizeApiMeUser(data, storedUser);
    store.setUser(user);

    if (isDebug) {
      console.log(
        `[AuthTruth] source=cloud userId=${user.id} isPremium=${user.isPremium} ` +
        `plan=${user.plan} isAdmin=${user.isAdmin} verified=true reqId=${requestId}`,
      );
    }

    return { user, jwt: activeJwt, verified: true, reason: 'cloud_confirmed' };
  } catch (err) {
    // Network failure — do NOT downgrade premium
    if (isDebug) {
      console.warn(
        `[AuthTruth] network error — preserving cached state. reqId=${requestId} error=${(err as Error).message}`,
      );
    }
    return {
      user: storedUser,
      jwt: activeJwt,
      verified: false,
      reason: 'network_error',
    };
  }
}

// ── validateToken (legacy compat) ─────────────────────────────────────────────
/**
 * @deprecated Use resolveAuthState() instead. Kept for backward compat only.
 * Calls /api/me and returns the normalized user or null.
 */
export async function validateToken(_token: string): Promise<AuthUser | null> {
  const jwt = safeGetJwt();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

  try {
    const resp = await fetch(`${AUTH_DOMAIN}/api/me`, { headers, credentials: 'include' });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.loggedIn === false) return null;
    return normalizeApiMeUser(data, useAuthStore.getState().user);
  } catch {
    return null;
  }
}
