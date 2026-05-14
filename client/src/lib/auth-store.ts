import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// In the packaged Electron app, window.location.protocol is "file:" so all auth
// requests must target the production server explicitly. In any other context
// (web browser, dev Electron via HTTP) the calls should hit the same-origin local
// server so that local admin grants and local JWT secrets line up correctly.
const _isPackagedElectron =
  typeof window !== 'undefined' &&
  !!(window as any).electronAPI?.isElectron &&
  window.location.protocol === 'file:';

const AUTH_DOMAIN = _isPackagedElectron ? "https://switchcontrol.org" : "";

const isDebug = import.meta.env.DEV;

if (typeof window !== 'undefined') {
  if (isDebug) { console.log(`[Entitlements] AUTH_DOMAIN resolved — packaged=${_isPackagedElectron} domain="${AUTH_DOMAIN || '(same-origin)'}"`); }
}

const TOKEN_KEY = "sc_auth_token_v2";
const JWT_KEY = "sc_jwt";

if (typeof window !== 'undefined') {
  localStorage.removeItem('sc_auth_token_v1');
  localStorage.removeItem('sc_premium_tour_completed');
}

export interface AuthUser {
  id: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  plan: string;
  isPremium: boolean;
  trialEndsAt: string | null;
  isAdmin: boolean;
  hasSeenPremiumUnlock: boolean;
  hasSeenPremiumTour: boolean;
  hasSeenTrialActivation: boolean;
  hasSeenTrialTour: boolean;
  loggedIn: boolean;
}

export type ElectronAuthState =
  | 'idle'
  | 'opening_browser'
  | 'waiting_for_callback'
  | 'callback_received'
  | 'exchanging'
  | 'authenticated'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

const TERMINAL_STATES: ElectronAuthState[] = ['callback_received', 'exchanging', 'authenticated'];

interface AuthState {
  token: string | null;
  jwt: string | null;
  user: AuthUser | null;
  isValidating: boolean;
  electronAuthState: ElectronAuthState;
  oauthError: string | null;
  /** Incremented by triggerFlowReset() to signal App.tsx to clear all session guards */
  flowResetTs: number;
  setToken: (token: string) => void;
  setJwt: (jwt: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  setValidating: (v: boolean) => void;
  setElectronAuthState: (state: ElectronAuthState) => void;
  setOauthError: (err: string | null) => void;
  logout: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      jwt: null,
      user: null,
      isValidating: false,
      electronAuthState: 'idle' as ElectronAuthState,
      oauthError: null,
      flowResetTs: 0,
      setToken: (token) => set({ token }),
      setJwt: (jwt) => set({ jwt }),
      setUser: (user) => set({ user }),
      setValidating: (isValidating) => set({ isValidating }),
      setElectronAuthState: (newState: ElectronAuthState) => {
        const current = get().electronAuthState;
        if (
          (newState === 'timed_out' || newState === 'cancelled') &&
          TERMINAL_STATES.includes(current)
        ) {
          if (isDebug) { console.log(`[AuthState] Blocked ${current} → ${newState} (success cannot be overwritten)`); }
          return;
        }
        if (isDebug) { console.log(`[AuthState] ${current} → ${newState}`); }
        set({ electronAuthState: newState });
      },
      setOauthError: (oauthError) => set({ oauthError }),
      logout: () => {
        set({ token: null, jwt: null, user: null, electronAuthState: 'idle' });
      },
      clear: () => {
        set({ token: null, jwt: null, user: null, isValidating: false, electronAuthState: 'idle', oauthError: null });
      },
    }),
    {
      name: TOKEN_KEY,
      partialize: (state) => ({ user: state.user, jwt: state.jwt, token: state.token }),
    }
  )
);

if (typeof window !== 'undefined') {
  const _bootState = useAuthStore.getState();
  if (isDebug) { console.log("[AUTH BOOT] persisted jwt length:", _bootState.jwt?.length, "token present:", !!_bootState.token, "user present:", !!_bootState.user); }
}

/**
 * Called by Admin.tsx after granting/revoking premium or trial for the current user.
 * Increments flowResetTs which App.tsx watches to clear all in-session animation guards,
 * so the flow re-evals without being blocked by stale session refs.
 */
export function triggerFlowReset() {
  useAuthStore.setState(s => ({ flowResetTs: s.flowResetTs + 1 }));
}

// Module-level set: track short fingerprints of tokens we've already warned about
// so the same bad token does not spam the console on every API call.
const _badJwtFingerprints = new Set<string>();

/** First 8 chars of base64url header + first 8 chars of payload — enough to
 *  uniquely identify a token without exposing any secret data. */
function _jwtFingerprint(jwt: string): string {
  try {
    const p = jwt.split('.');
    return (p[0] ?? '').substring(0, 8) + '.' + (p[1] ?? '').substring(0, 8);
  } catch {
    return 'malformed';
  }
}

/** @internal — keep the private accessor pointing to safeGetJwt so all
 *  inline callers in this file get validation automatically. */
function getStoredJwt(): string | null {
  return safeGetJwt();
}

/**
 * Returns the stored JWT only if it is well-formed and not expired.
 * Clears and returns null if the token is malformed or expired.
 * Each distinct bad token produces exactly one console warning (deduped by fingerprint).
 */
export function safeGetJwt(): string | null {
  const jwt = useAuthStore.getState().jwt;
  if (!jwt) return null;
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      const fp = _jwtFingerprint(jwt);
      if (!_badJwtFingerprints.has(fp)) {
        _badJwtFingerprints.add(fp);
        if (isDebug) { console.warn('[Auth] JWT has invalid format (not 3 parts) — cleared. tokenId:', fp); }
      }
      useAuthStore.getState().setJwt(null);
      return null;
    }
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) {
      const fp = _jwtFingerprint(jwt);
      if (!_badJwtFingerprints.has(fp)) {
        _badJwtFingerprints.add(fp);
        if (isDebug) { console.warn('[Auth] JWT is expired — cleared. tokenId:', fp); }
      }
      useAuthStore.getState().setJwt(null);
      return null;
    }
    return jwt;
  } catch {
    const fp = _jwtFingerprint(jwt);
    if (!_badJwtFingerprints.has(fp)) {
      _badJwtFingerprints.add(fp);
      if (isDebug) { console.warn('[Auth] JWT is malformed (parse error) — cleared. tokenId:', fp); }
    }
    useAuthStore.getState().setJwt(null);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Auth-truth hardening: startup sequence, expiry checks, reissue, and cloud resolution.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface JwtCheckResult {
  jwt: string | null;
  expired: boolean;
  malformed: boolean;
  exp: number | null;
}

/** Check JWT expiry WITHOUT deleting it. Returns detailed result for orchestration. */
export function checkJwtExpiry(): JwtCheckResult {
  const jwt = useAuthStore.getState().jwt;
  if (!jwt) return { jwt: null, expired: false, malformed: false, exp: null };
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      return { jwt, expired: false, malformed: true, exp: null };
    }
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const exp = payload.exp ? Number(payload.exp) : null;
    const isExpired = exp !== null && Math.floor(Date.now() / 1000) >= exp;
    return { jwt, expired: isExpired, malformed: false, exp };
  } catch {
    return { jwt, expired: false, malformed: true, exp: null };
  }
}

// Deduplicates concurrent reissue requests across the app.
let _jwtReissuePromise: Promise<string | null> | null = null;

/** Attempts a JWT reissue from the cloud server using the session cookie.
 *  Returns the new JWT, or null if the session is expired/gone. */
async function reissueJwtFromSession(): Promise<string | null> {
  if (_jwtReissuePromise) return _jwtReissuePromise;
  _jwtReissuePromise = (async () => {
    try {
      const response = await fetch(`${AUTH_DOMAIN}/api/auth/reissue-jwt`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        if (isDebug) { console.warn(`[AuthTruth] JWT reissue HTTP ${response.status}`); }
        return null;
      }
      const data = await response.json();
      if (data?.jwt) {
        useAuthStore.getState().setJwt(data.jwt);
        if (isDebug) { console.log(`[AuthTruth] JWT reissued — length=${data.jwt.length}`); }
        return data.jwt as string;
      }
      return null;
    } catch (err) {
      if (isDebug) { console.warn('[AuthTruth] JWT reissue network error:', (err as Error).message); }
      return null;
    } finally {
      _jwtReissuePromise = null;
    }
  })();
  return _jwtReissuePromise;
}

/** Full auth-truth resolution with the mandated startup order:
 *  1. Load stored user/JWT
 *  2. Check JWT expiry WITHOUT deleting it
 *  3. Try JWT reissue if expired
 *  4. Call cloud /api/me
 *  5. Resolve premium/trial from cloud response
 *  6. Return verified state (device validation should happen AFTER this)
 *
 *  Premium is NEVER downgraded on network/server failure.
 *  Only downgrade when cloud explicitly says loggedIn=false or plan=free.
 */
export async function resolveAuthState(): Promise<{
  user: AuthUser | null;
  jwt: string | null;
  verified: boolean;
  reason: string;
}> {
  if (isDebug) { console.log('[AuthTruth] resolveAuthState START'); }
  const store = useAuthStore.getState();
  const storedUser = store.user;
  const storedJwt = store.jwt;

  // Step 1: load stored
  if (isDebug) { console.log(`[AuthTruth] step 1 loadStored user=${storedUser ? 'yes' : 'no'} jwt=${storedJwt ? 'yes' : 'no'}`); }

  // Step 2: check JWT expiry (no delete)
  const jwtCheck = checkJwtExpiry();
  if (isDebug) { console.log(`[AuthTruth] step 2 checkExpiry malformed=${jwtCheck.malformed} expired=${jwtCheck.expired}`); }

  let activeJwt = jwtCheck.jwt;

  if (jwtCheck.malformed && activeJwt) {
    const fp = _jwtFingerprint(activeJwt);
    if (isDebug) { console.warn(`[AuthTruth] JWT malformed — clearing. tokenId: ${fp}`); }
    store.setJwt(null);
    activeJwt = null;
  }

  // Step 3: try reissue if expired
  if (jwtCheck.expired && activeJwt) {
    if (isDebug) { console.log('[AuthTruth] step 3 reissueAttempt'); }
    const reissued = await reissueJwtFromSession();
    if (reissued) {
      if (isDebug) { console.log('[AuthTruth] step 3 reissue=SUCCESS'); }
      activeJwt = reissued;
    } else {
      if (isDebug) { console.warn('[AuthTruth] step 3 reissue=FAILED — keeping expired JWT for one /api.me attempt'); }
      // Do NOT clear — the cloud server may still honor the session cookie
    }
  } else {
    if (isDebug) { console.log('[AuthTruth] step 3 reissue=SKIP'); }
  }

  // Step 4: call cloud /api/me
  if (isDebug) { console.log('[AuthTruth] step 4 callCloud /api.me'); }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (activeJwt) headers['Authorization'] = `Bearer ${activeJwt}`;

    const response = await fetch(`${AUTH_DOMAIN}/api/me`, { headers, credentials: 'include' });

    if (!response.ok) {
      const status = response.status;
      if (isDebug) { console.warn(`[AuthTruth] step 4 /api.me HTTP ${status}`); }
      if (status === 401) {
        // Cloud says the JWT (and any session cookie) is invalid — truly logged out
        if (isDebug) { console.log('[AuthTruth] step 4 401=LOGGED_OUT'); }
        store.logout();
        return { user: null, jwt: null, verified: true, reason: 'logged_out_by_cloud' };
      }
      // Server error or network hiccup — preserve cached state, do NOT downgrade
      if (isDebug) { console.log(`[AuthTruth] step 4 HTTP ${status}=PRESERVE_CACHED`); }
      return {
        user: storedUser,
        jwt: activeJwt,
        verified: false,
        reason: `cloud_unavailable_${status}`,
      };
    }

    const data = await response.json();
    if (isDebug) { console.log(`[AuthTruth] step 4 /api.me success loggedIn=${data.loggedIn}`); }

    if (data.loggedIn === false) {
      if (isDebug) { console.log(`[AuthTruth] source=cloud userId=${data.id} isPremium=false plan=free verified=true reason=logged-out`); }
      store.logout();
      return { user: null, jwt: null, verified: true, reason: 'logged_out_by_cloud' };
    }

    // Step 5: resolve premium/trial from cloud truth
    const resolvedPlan: string = data.plan || (data.isPremium ? 'premium' : 'free');
    const resolvedIsPremium: boolean = !!(
      data.isPremium ||
      data.plan === 'premium' ||
      (data.plan === 'trial' && !!data.trialEndsAt && new Date() < new Date(data.trialEndsAt))
    );

    const user: AuthUser = {
      id: data.id || storedUser?.id || '',
      email: data.email || null,
      username: data.name || data.firstName || null,
      avatarUrl: data.avatar || null,
      plan: resolvedPlan,
      isPremium: resolvedIsPremium,
      trialEndsAt: data.trialEndsAt || null,
      isAdmin: data.isAdmin || false,
      hasSeenPremiumUnlock: !!data.hasSeenPremiumUnlock,
      hasSeenPremiumTour: !!data.hasSeenPremiumTour,
      hasSeenTrialActivation: !!data.hasSeenTrialActivation,
      hasSeenTrialTour: !!data.hasSeenTrialTour,
      loggedIn: true,
    };

    store.setUser(user);
    if (isDebug) { console.log(`[AuthTruth] step 5 resolved isPremium=${user.isPremium} plan=${user.plan}`); }
    if (isDebug) { console.log(`[AuthTruth] source=cloud userId=${user.id} isPremium=${user.isPremium} plan=${user.plan} verified=true`); }

    return { user, jwt: activeJwt, verified: true, reason: 'cloud_confirmed' };
  } catch (err) {
    // Network failure — preserve cached state, do NOT downgrade
    if (isDebug) { console.warn(`[AuthTruth] step 4 network error: ${(err as Error).message}`); }
    if (isDebug) { console.log(`[AuthTruth] source=cache userId=${storedUser?.id ?? 'none'} isPremium=${storedUser?.isPremium ?? false} plan=${storedUser?.plan ?? 'none'} verified=false reason=cloud-unavailable`); }
    return {
      user: storedUser,
      jwt: activeJwt,
      verified: false,
      reason: 'network_error',
    };
  }
}

function buildAuthHeaders(): HeadersInit {
  const jwt = safeGetJwt();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }
  return headers;
}

export async function performFullLogout(reason: string): Promise<void> {
  if (isDebug) { console.log(`[Auth] performFullLogout started — reason: ${reason}`); }
  console.trace('[Auth] logout trace');

  try {
    if (isDebug) { console.log('[Auth] Calling backend /auth/logout'); }
    const response = await fetch(`${AUTH_DOMAIN}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    if (isDebug) { console.log('[Auth] Backend logout response:', response.status); }
  } catch (err) {
    console.error('[Auth] Backend logout failed:', err);
  }

  const store = useAuthStore.getState();
  store.clear();

  const api = (window as any).electronAPI;
  if (api?.clearAuthCookies) {
    if (isDebug) { console.log('[Auth] Clearing Electron cookies (explicit sign-out)'); }
    await api.clearAuthCookies();
  }

  if (isDebug) { console.log('[Auth] performFullLogout completed'); }
}

export async function exchangeToken(token: string): Promise<AuthUser | null> {
  try {
    if (isDebug) { console.log('[Auth] Exchanging token for session'); }
    const response = await fetch(`${AUTH_DOMAIN}/api/auth/exchange`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[Auth] Token exchange failed:', response.status, err);
      return null;
    }

    const data = await response.json();
    if (isDebug) { console.log('[Auth] Token exchange result:', data); }

    if (!data.success || !data.user) {
      return null;
    }

    if (data.jwt) {
      useAuthStore.getState().setJwt(data.jwt);
      if (isDebug) { console.log(`[JWT] saved to memory — length=${data.jwt.length}`); }
      fetch(`${AUTH_DOMAIN}/api/activity/app-active`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${data.jwt}`, 'Content-Type': 'application/json' },
        credentials: 'include',
      }).then(r => console.log(`[Activity] app-active reported, status=${r.status}`))
        .catch(e => console.warn('[Activity] app-active fire-and-forget failed:', e));
    } else {
      if (isDebug) { console.warn('[JWT] exchange response did NOT contain jwt field'); }
    }

    const user: AuthUser = {
      id: data.user.id || '',
      email: data.user.email || null,
      username: data.user.name || data.user.firstName || null,
      avatarUrl: data.user.avatar || null,
      plan: data.user.plan || (data.user.isPremium ? 'premium' : 'free'),
      isPremium: data.user.isPremium || false,
      trialEndsAt: data.user.trialEndsAt || null,
      isAdmin: data.user.isAdmin || false,
      hasSeenPremiumUnlock: !!data.user.hasSeenPremiumUnlock,
      hasSeenPremiumTour: !!data.user.hasSeenPremiumTour,
      hasSeenTrialActivation: !!data.user.hasSeenTrialActivation,
      hasSeenTrialTour: !!data.user.hasSeenTrialTour,
      loggedIn: true,
    };

    if (isDebug) { console.log(`[Auth] exchangeToken success, user=${user.id} isPremium=${user.isPremium} hasSeenPremiumUnlock=${user.hasSeenPremiumUnlock} hasSeenPremiumTour=${user.hasSeenPremiumTour} ts=${Date.now()}`); }
    return user;
  } catch (err) {
    console.error('[Auth] Token exchange error:', err);
    return null;
  }
}

export async function validateToken(token: string): Promise<AuthUser | null> {
  try {
    const jwt = getStoredJwt();
    const useJwt = !!jwt;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    const response = await fetch(`${AUTH_DOMAIN}/api/me`, {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('[Auth] Session validation failed:', response.status);
      return null;
    }

    const authMode = response.headers.get('X-Auth-Mode');
    const data = await response.json();
    if (isDebug) { console.log(`[Auth] Session status: authMode=${authMode}`, data); }

    if (data.loggedIn === false) {
      return null;
    }

    return {
      id: data.id || '',
      email: data.email || null,
      username: data.name || data.firstName || null,
      avatarUrl: data.avatar || null,
      plan: data.plan || (data.isPremium ? 'premium' : 'free'),
      isPremium: data.isPremium || false,
      trialEndsAt: data.trialEndsAt || null,
      isAdmin: data.isAdmin || false,
      hasSeenPremiumUnlock: !!data.hasSeenPremiumUnlock,
      hasSeenPremiumTour: !!data.hasSeenPremiumTour,
      hasSeenTrialActivation: !!data.hasSeenTrialActivation,
      hasSeenTrialTour: !!data.hasSeenTrialTour,
      loggedIn: true,
    };
  } catch (err) {
    console.error('[Auth] Session validation error:', err);
    return null;
  }
}

export async function refreshEntitlements(): Promise<{ user: AuthUser | null }> {
  const store = useAuthStore.getState();
  const cachedUser = store.user;
  const jwt = getStoredJwt();

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    const url = `${AUTH_DOMAIN}/api/me`;
    if (isDebug) { console.log(`[AuthTruth] refreshEntitlements → ${url || '(same-origin)/api/me'} jwt=${jwt ? 'present' : 'missing'}`); }
    const response = await fetch(url, {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      if (isDebug) { console.warn(`[AuthTruth] /api/me status=${response.status} (HTTP error). Preserving cached state, not downgrading.`); }
      if (isDebug) { console.log(`[AuthTruth] source=cache userId=${cachedUser?.id ?? 'none'} isPremium=${cachedUser?.isPremium ?? false} plan=${cachedUser?.plan ?? 'none'} verified=false reason=cloud-unavailable`); }
      return { user: cachedUser };
    }

    const authMode = response.headers.get('X-Auth-Mode');
    const data = await response.json();
    if (isDebug) { console.log(`[AuthTruth] /api/me status=${response.status} authMode=${authMode} loggedIn=${data.loggedIn} isPremium=${data.isPremium} plan=${data.plan}`); }

    if (data.loggedIn === false) {
      if (isDebug) { console.log(`[AuthTruth] source=cloud userId=${data.id} isPremium=false plan=free verified=true reason=logged-out`); }
      store.logout();
      return { user: null };
    }

    const resolvedPlan: string = data.plan || (data.isPremium ? 'premium' : 'free');
    const resolvedIsPremium: boolean = !!(
      data.isPremium ||
      data.plan === 'premium' ||
      (data.plan === 'trial' && !!data.trialEndsAt && new Date() < new Date(data.trialEndsAt))
    );

    const newUser: AuthUser = {
      id: data.id || cachedUser?.id || '',
      email: data.email || null,
      username: data.name || data.firstName || null,
      avatarUrl: data.avatar || null,
      plan: resolvedPlan,
      isPremium: resolvedIsPremium,
      trialEndsAt: data.trialEndsAt || null,
      isAdmin: data.isAdmin || false,
      hasSeenPremiumUnlock: !!data.hasSeenPremiumUnlock,
      hasSeenPremiumTour: !!data.hasSeenPremiumTour,
      hasSeenTrialActivation: !!data.hasSeenTrialActivation,
      hasSeenTrialTour: !!data.hasSeenTrialTour,
      loggedIn: true,
    };

    store.setUser(newUser);
    if (isDebug) { console.log(`[AuthTruth] source=cloud userId=${newUser.id} isPremium=${newUser.isPremium} plan=${newUser.plan} verified=true`); }

    return { user: newUser };
  } catch (err) {
    // Network or other error — do NOT clear cached user. Stale truth is better
    // than falsely downgrading a premium user who just lost connectivity.
    if (isDebug) { console.warn(`[AuthTruth] refreshEntitlements network/error — preserving cached state. Error:`, (err as Error)?.message); }
    if (isDebug) { console.log(`[AuthTruth] source=cache userId=${cachedUser?.id ?? 'none'} isPremium=${cachedUser?.isPremium ?? false} plan=${cachedUser?.plan ?? 'none'} verified=false reason=cloud-unavailable`); }
    return { user: cachedUser };
  }
}

// Singleton guard: prevents multiple components/deep-link handlers from stacking /api/me calls
let _retryRefreshInFlight: Promise<{ ok: boolean; user: AuthUser | null; reason?: string }> | null = null;

export async function retryRefreshEntitlements(opts?: {
  attempts?: number;
  delayMs?: number;
  initialDelayMs?: number;
}): Promise<{ ok: boolean; user: AuthUser | null; reason?: string }> {
  if (_retryRefreshInFlight) {
    if (isDebug) { console.log('[Entitlements] retry_deduped — returning in-flight promise'); }
    return _retryRefreshInFlight;
  }

  const { attempts = 6, delayMs = 500, initialDelayMs = 300 } = opts || {};

  if (isDebug) { console.log(`[PremiumFlow] retryRefreshEntitlements starting — initialDelay=${initialDelayMs}ms, attempts=${attempts}, delay=${delayMs}ms`); }

  if (initialDelayMs > 0) {
    await new Promise(r => setTimeout(r, initialDelayMs));
  }

  _retryRefreshInFlight = (async () => {
    for (let i = 0; i < attempts; i++) {
      if (i > 0) {
        if (isDebug) { console.log(`[PremiumFlow] /api/me retry wait ${delayMs}ms...`); }
        await new Promise(r => setTimeout(r, delayMs));
      }

      if (isDebug) { console.log(`[PremiumFlow] /api/me attempt ${i + 1}/${attempts}`); }
      const result = await refreshEntitlements();

      if (result.user && result.user.loggedIn) {
        if (isDebug) { console.log(`[PremiumFlow] /api/me attempt ${i + 1}/${attempts} — loggedIn=true isPremium=${result.user.isPremium} hasSeenPremiumUnlock=${result.user.hasSeenPremiumUnlock}`); }
        return { ok: true, user: result.user };
      }

      if (isDebug) { console.log(`[PremiumFlow] /api/me attempt ${i + 1}/${attempts} — loggedIn=false, retrying...`); }
    }

    if (isDebug) { console.warn(`[PremiumFlow] /api/me still loggedIn=false after ${attempts} attempts`); }
    return { ok: false, user: null, reason: 'not_logged_in_after_retries' };
  })();

  try {
    return await _retryRefreshInFlight;
  } finally {
    _retryRefreshInFlight = null;
  }
}

export async function postUnlockSeen(): Promise<boolean> {
  try {
    const jwt = getStoredJwt();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    if (isDebug) { console.log('[PremiumUnlock] posting unlock-seen...'); }
    const response = await fetch(`${AUTH_DOMAIN}/api/premium/unlock-seen`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(`[PremiumUnlock] unlock-seen failed status=${response.status}`);
      return false;
    }

    if (isDebug) { console.log('[PremiumUnlock] unlock-seen success'); }

    const store = useAuthStore.getState();
    if (store.user) {
      store.setUser({ ...store.user, hasSeenPremiumUnlock: true });
    }

    return true;
  } catch (err) {
    console.error('[PremiumUnlock] unlock-seen error:', err);
    return false;
  }
}

export async function postResetTourFlags(): Promise<boolean> {
  try {
    const jwt = getStoredJwt();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    if (isDebug) { console.log('[FactoryReset] posting reset-tour-flags...'); }
    const response = await fetch(`${AUTH_DOMAIN}/api/premium/reset-tour-flags`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      if (isDebug) { console.warn(`[FactoryReset] reset-tour-flags failed status=${response.status} (non-fatal)`); }
      return false;
    }

    if (isDebug) { console.log('[FactoryReset] reset-tour-flags success'); }

    const store = useAuthStore.getState();
    if (store.user) {
      store.setUser({ ...store.user, hasSeenPremiumTour: false, hasSeenPremiumUnlock: false });
    }

    return true;
  } catch (err) {
    if (isDebug) { console.warn('[FactoryReset] reset-tour-flags error (non-fatal):', err); }
    return false;
  }
}

export async function postTourSeen(): Promise<boolean> {
  try {
    const jwt = getStoredJwt();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    if (isDebug) { console.log('[PremiumTour] posting tour-seen...'); }
    const response = await fetch(`${AUTH_DOMAIN}/api/premium/tour-seen`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(`[PremiumTour] tour-seen failed status=${response.status}`);
      return false;
    }

    if (isDebug) { console.log('[PremiumTour] tour-seen success'); }

    const store = useAuthStore.getState();
    if (store.user) {
      store.setUser({ ...store.user, hasSeenPremiumTour: true });
    }

    return true;
  } catch (err) {
    console.error('[PremiumTour] tour-seen error:', err);
    return false;
  }
}

export async function postTrialActivationSeen(): Promise<boolean> {
  try {
    const jwt = getStoredJwt();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

    if (isDebug) { console.log('[TrialActivation] posting trial-activation-seen...'); }
    const response = await fetch(`${AUTH_DOMAIN}/api/premium/trial-activation-seen`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(`[TrialActivation] trial-activation-seen failed status=${response.status}`);
      return false;
    }

    if (isDebug) { console.log('[TrialActivation] trial-activation-seen success'); }
    const store = useAuthStore.getState();
    if (store.user) {
      store.setUser({ ...store.user, hasSeenTrialActivation: true });
    }
    return true;
  } catch (err) {
    console.error('[TrialActivation] trial-activation-seen error:', err);
    return false;
  }
}

export async function postTrialTourSeen(): Promise<boolean> {
  try {
    const jwt = getStoredJwt();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

    if (isDebug) { console.log('[TrialTour] posting trial-tour-seen...'); }
    const response = await fetch(`${AUTH_DOMAIN}/api/premium/trial-tour-seen`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(`[TrialTour] trial-tour-seen failed status=${response.status}`);
      return false;
    }

    if (isDebug) { console.log('[TrialTour] trial-tour-seen success'); }
    const store = useAuthStore.getState();
    if (store.user) {
      store.setUser({ ...store.user, hasSeenTrialTour: true });
    }
    return true;
  } catch (err) {
    console.error('[TrialTour] trial-tour-seen error:', err);
    return false;
  }
}
