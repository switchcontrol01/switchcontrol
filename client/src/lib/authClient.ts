/**
 * authClient.ts
 * All auth-related fetch logic. No React/Zustand imports beyond authStore.
 * Fetch logic is separated here so authStore.ts stays pure.
 *
 * Bug fixes applied here vs the old monolith:
 *  - performFullLogout uses correct endpoint /auth/logout
 *  - console.trace removed from production path
 *  - exchangeToken validates JWT before persisting
 *  - exchangeToken debug log redacts the raw JWT
 *  - retryRefreshEntitlements: exponential backoff + stop on 401
 *  - All /api/me → AuthUser mapping delegated to normalizeApiMeUser (entitlementService)
 *  - In-flight dedup on refreshEntitlements
 */

import { useAuthStore, safeGetJwt, currentMeGeneration, bumpMeGeneration, AuthUser } from './authStore';
import { AUTH_DOMAIN, clearElectronAuthCookies } from './electronAuth';
import { checkJwtExpiry, reissueJwtFromSession } from './jwt';
import { normalizeApiMeUser } from './entitlementService';

const isDebug = import.meta.env.DEV;

// ── Shared header builder ─────────────────────────────────────────────────────

export function buildAuthHeaders(): Record<string, string> {
  const jwt = safeGetJwt();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  return headers;
}

// ── Device header injector ────────────────────────────────────────────────────
// authClient calls fetch() with ABSOLUTE URLs (https://switchcontrol.org/api/me)
// which bypass the global fetch interceptor in api.ts. This helper adds
// x-device-id / x-app-version / x-platform so the cloud server can permanently
// record the device ID on every /api/me call.

async function getDeviceHeaders(): Promise<Record<string, string>> {
  const extra: Record<string, string> = {};
  try {
    const eApi = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;
    if (eApi?.getDeviceId) {
      const deviceId = await eApi.getDeviceId();
      if (deviceId) {
        extra['x-device-id'] = deviceId;
        const ver  = await eApi.getVersion?.().catch(() => null);
        if (ver)  extra['x-app-version'] = String(ver);
        const plat = await eApi.getPlatform?.().catch(() => null);
        if (plat) extra['x-platform'] = String(plat);
      }
    }
  } catch { /* non-Electron or unavailable — safe to ignore */ }
  return extra;
}

// ── refreshEntitlements ───────────────────────────────────────────────────────
// Deduplicates concurrent calls — only one /api/me can be in flight at a time.

let _refreshInFlight: Promise<{ user: AuthUser | null }> | null = null;

export async function refreshEntitlements(): Promise<{ user: AuthUser | null }> {
  if (_refreshInFlight) {
    if (isDebug) console.log('[AuthClient] refreshEntitlements deduped — returning in-flight');
    return _refreshInFlight;
  }

  const generationAtStart = currentMeGeneration();
  const cachedUser = useAuthStore.getState().user;
  const jwt = safeGetJwt();

  _refreshInFlight = (async () => {
    try {
      const headers = { ...buildAuthHeaders(), ...await getDeviceHeaders() };
      if (isDebug) {
        console.log(`[AuthClient] refreshEntitlements → /api/me jwt=${jwt ? 'present' : 'missing'} deviceId=${headers['x-device-id'] ?? 'none'}`);
      }

      const resp = await fetch(`${AUTH_DOMAIN}/api/me`, { headers, credentials: 'include' });

      // Stale-response guard: if a logout happened while this was in-flight, discard.
      if (currentMeGeneration() !== generationAtStart) {
        if (isDebug) console.log('[AuthClient] refreshEntitlements: stale — generation changed, discarding');
        return { user: null };
      }

      if (!resp.ok) {
        if (resp.status === 401) {
          // Cloud explicitly rejected — deterministic logged-out state
          if (isDebug) console.log('[AuthClient] refreshEntitlements: 401 → logout');
          useAuthStore.getState().logout();
          return { user: null };
        }
        if (isDebug) {
          console.warn(`[AuthClient] refreshEntitlements: HTTP ${resp.status} — preserving cached`);
        }
        return { user: cachedUser };
      }

      const data = await resp.json();
      if (isDebug) {
        console.log(
          `[AuthClient] /api/me OK loggedIn=${data.loggedIn} isPremium=${data.isPremium} plan=${data.plan}`,
        );
      }

      if (data.loggedIn === false) {
        if (isDebug) console.log('[AuthClient] /api/me loggedIn=false → logout');
        useAuthStore.getState().logout();
        return { user: null };
      }

      const user = normalizeApiMeUser(data, cachedUser);
      useAuthStore.getState().setUser(user);
      if (isDebug) {
        console.log(
          `[AuthTruth] source=cloud userId=${user.id} isPremium=${user.isPremium} plan=${user.plan} verified=true`,
        );
      }
      return { user };
    } catch (err) {
      if (isDebug) {
        console.warn('[AuthClient] refreshEntitlements network error — preserving cached:', (err as Error).message);
      }
      return { user: cachedUser };
    }
  })();

  try {
    return await _refreshInFlight;
  } finally {
    _refreshInFlight = null;
  }
}

// ── retryRefreshEntitlements ──────────────────────────────────────────────────
// Exponential backoff, stops on deterministic 401, singleton in-flight guard.

let _retryRefreshInFlight: Promise<{ ok: boolean; user: AuthUser | null; reason?: string }> | null = null;

export async function retryRefreshEntitlements(opts?: {
  attempts?: number;
  initialDelayMs?: number;
  baseDelayMs?: number;
}): Promise<{ ok: boolean; user: AuthUser | null; reason?: string }> {
  if (_retryRefreshInFlight) {
    if (isDebug) console.log('[AuthClient] retryRefreshEntitlements deduped — returning in-flight');
    return _retryRefreshInFlight;
  }

  const { attempts = 6, initialDelayMs = 300, baseDelayMs = 400 } = opts ?? {};

  if (isDebug) {
    console.log(
      `[AuthClient] retryRefreshEntitlements start — attempts=${attempts} ` +
      `initialDelay=${initialDelayMs}ms baseDelay=${baseDelayMs}ms`,
    );
  }

  if (initialDelayMs > 0) {
    await new Promise(r => setTimeout(r, initialDelayMs));
  }

  _retryRefreshInFlight = (async () => {
    for (let i = 0; i < attempts; i++) {
      if (i > 0) {
        // Exponential backoff: baseDelay * 2^(i-1), capped at 8s
        const delay = Math.min(baseDelayMs * Math.pow(2, i - 1), 8000);
        if (isDebug) console.log(`[AuthClient] /api/me retry ${i + 1}/${attempts} — waiting ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }

      if (isDebug) console.log(`[AuthClient] /api/me attempt ${i + 1}/${attempts}`);

      // Use direct fetch (not refreshEntitlements) so we can inspect the raw status
      const jwt = safeGetJwt();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
      const deviceHeaders = await getDeviceHeaders();
      Object.assign(headers, deviceHeaders);

      try {
        const resp = await fetch(`${AUTH_DOMAIN}/api/me`, { headers, credentials: 'include' });

        if (resp.status === 401) {
          // Deterministic failure — stop retrying immediately
          if (isDebug) console.log('[AuthClient] retryRefreshEntitlements: 401 — stopping');
          useAuthStore.getState().logout();
          return { ok: false, user: null, reason: 'unauthorized' };
        }

        if (!resp.ok) {
          // Server error — may be transient, keep retrying
          if (isDebug) console.warn(`[AuthClient] /api/me HTTP ${resp.status} — retrying`);
          continue;
        }

        const data = await resp.json();
        if (data.loggedIn === false) {
          if (isDebug) console.log(`[AuthClient] /api/me attempt ${i + 1}: loggedIn=false — retrying`);
          continue;
        }

        const cachedUser = useAuthStore.getState().user;
        const user = normalizeApiMeUser(data, cachedUser);
        useAuthStore.getState().setUser(user);

        if (isDebug) {
          console.log(
            `[AuthClient] retryRefreshEntitlements OK on attempt ${i + 1} — ` +
            `isPremium=${user.isPremium} plan=${user.plan}`,
          );
        }
        return { ok: true, user };
      } catch (err) {
        if (isDebug) console.warn(`[AuthClient] /api/me attempt ${i + 1} network error:`, (err as Error).message);
        // Network error — continue retrying
      }
    }

    if (isDebug) console.warn(`[AuthClient] retryRefreshEntitlements: still not logged-in after ${attempts} attempts`);
    return { ok: false, user: null, reason: 'not_logged_in_after_retries' };
  })();

  try {
    return await _retryRefreshInFlight;
  } finally {
    _retryRefreshInFlight = null;
  }
}

// ── exchangeToken ─────────────────────────────────────────────────────────────

export async function exchangeToken(token: string): Promise<AuthUser | null> {
  try {
    if (isDebug) console.log('[AuthClient] exchangeToken — starting OAuth code exchange');

    const resp = await fetch(`${AUTH_DOMAIN}/api/auth/exchange`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (isDebug) console.error('[AuthClient] exchangeToken failed:', resp.status, err);
      return null;
    }

    const data = await resp.json();

    if (!data.success || !data.user) {
      if (isDebug) console.warn('[AuthClient] exchangeToken: no success/user in response');
      return null;
    }

    // Validate and persist the JWT before trusting it
    if (data.jwt && typeof data.jwt === 'string') {
      const check = checkJwtExpiry(data.jwt);
      if (check.malformed || check.expired) {
        if (isDebug) console.warn('[AuthClient] exchangeToken: received invalid JWT — discarded');
        // Don't store it, but auth can still proceed via session cookie
      } else {
        useAuthStore.getState().setJwt(data.jwt);
        // Fire-and-forget activity ping (non-critical)
        fetch(`${AUTH_DOMAIN}/api/activity/app-active`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${data.jwt}`, 'Content-Type': 'application/json' },
          credentials: 'include',
        }).catch(() => {});
      }
    } else {
      if (isDebug) console.warn('[AuthClient] exchangeToken: no JWT in exchange response');
    }

    const user = normalizeApiMeUser(data.user, null);

    if (isDebug) {
      // Redact: log identity info only — never log the raw jwt or token
      console.log(
        `[AuthClient] exchangeToken success — userId=${user.id} isPremium=${user.isPremium} ` +
        `hasSeenPremiumUnlock=${user.hasSeenPremiumUnlock}`,
      );
    }

    return user;
  } catch (err) {
    console.error('[AuthClient] exchangeToken error:', (err as Error).message);
    return null;
  }
}

// ── performFullLogout ─────────────────────────────────────────────────────────

export async function performFullLogout(reason: string): Promise<void> {
  const requestId = Math.random().toString(36).slice(2, 8);
  if (isDebug) console.log(`[AuthClient] logout start — reason="${reason}" reqId=${requestId}`);

  // Bump generation FIRST so any in-flight /api/me responses are discarded
  bumpMeGeneration();

  // Invalidate in-flight refresh dedup so next call starts fresh
  _refreshInFlight = null;
  _retryRefreshInFlight = null;

  try {
    const resp = await fetch(`${AUTH_DOMAIN}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    if (isDebug) console.log(`[AuthClient] logout backend HTTP ${resp.status} reqId=${requestId}`);
  } catch (err) {
    // Non-fatal — local state is cleared regardless
    if (isDebug) console.warn('[AuthClient] logout backend call failed:', (err as Error).message);
  }

  // Clear Zustand store + wipe persisted localStorage
  useAuthStore.getState().logout();

  // Clear Electron session cookies (explicit sign-out only)
  await clearElectronAuthCookies();

  if (isDebug) console.log(`[AuthClient] logout complete reqId=${requestId}`);
}

// ── Flag-posting helpers ──────────────────────────────────────────────────────
// These fire-and-update: they hit the server and optimistically patch the store.

async function _postFlagEndpoint(endpoint: string, tag: string): Promise<boolean> {
  try {
    const resp = await fetch(`${AUTH_DOMAIN}${endpoint}`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      credentials: 'include',
    });
    if (!resp.ok) {
      if (isDebug) console.error(`[AuthClient] ${tag} failed status=${resp.status}`);
      return false;
    }
    if (isDebug) console.log(`[AuthClient] ${tag} OK`);
    return true;
  } catch (err) {
    if (isDebug) console.warn(`[AuthClient] ${tag} error:`, (err as Error).message);
    return false;
  }
}

export async function postUnlockSeen(): Promise<boolean> {
  const ok = await _postFlagEndpoint('/api/premium/unlock-seen', 'postUnlockSeen');
  if (ok) {
    const s = useAuthStore.getState();
    if (s.user) s.setUser({ ...s.user, hasSeenPremiumUnlock: true });
  }
  return ok;
}

export async function postTourSeen(): Promise<boolean> {
  const ok = await _postFlagEndpoint('/api/premium/tour-seen', 'postTourSeen');
  if (ok) {
    const s = useAuthStore.getState();
    if (s.user) s.setUser({ ...s.user, hasSeenPremiumTour: true });
  }
  return ok;
}

export async function postResetTourFlags(): Promise<boolean> {
  const ok = await _postFlagEndpoint('/api/premium/reset-tour-flags', 'postResetTourFlags');
  if (ok) {
    const s = useAuthStore.getState();
    if (s.user) s.setUser({ ...s.user, hasSeenPremiumTour: false, hasSeenPremiumUnlock: false });
  }
  return ok;
}

export async function postTrialActivationSeen(): Promise<boolean> {
  const ok = await _postFlagEndpoint('/api/premium/trial-activation-seen', 'postTrialActivationSeen');
  if (ok) {
    const s = useAuthStore.getState();
    if (s.user) s.setUser({ ...s.user, hasSeenTrialActivation: true });
  }
  return ok;
}

export async function postTrialTourSeen(): Promise<boolean> {
  const ok = await _postFlagEndpoint('/api/premium/trial-tour-seen', 'postTrialTourSeen');
  if (ok) {
    const s = useAuthStore.getState();
    if (s.user) s.setUser({ ...s.user, hasSeenTrialTour: true });
  }
  return ok;
}
