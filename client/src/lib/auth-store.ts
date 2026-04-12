import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const AUTH_DOMAIN = "https://switchcontrol.org";
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
          console.log(`[AuthState] Blocked ${current} → ${newState} (success cannot be overwritten)`);
          return;
        }
        console.log(`[AuthState] ${current} → ${newState}`);
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
  console.log("[AUTH BOOT] persisted jwt length:", _bootState.jwt?.length, "token present:", !!_bootState.token, "user present:", !!_bootState.user);
}

/**
 * Called by Admin.tsx after granting/revoking premium or trial for the current user.
 * Increments flowResetTs which App.tsx watches to clear all in-session animation guards,
 * so the flow re-evals without being blocked by stale session refs.
 */
export function triggerFlowReset() {
  useAuthStore.setState(s => ({ flowResetTs: s.flowResetTs + 1 }));
}

function getStoredJwt(): string | null {
  return useAuthStore.getState().jwt;
}

function buildAuthHeaders(): HeadersInit {
  const jwt = getStoredJwt();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }
  return headers;
}

export async function performFullLogout(reason: string): Promise<void> {
  console.log(`[Auth] performFullLogout started — reason: ${reason}`);
  console.trace('[Auth] logout trace');

  try {
    console.log('[Auth] Calling backend /auth/logout');
    const response = await fetch(`${AUTH_DOMAIN}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    console.log('[Auth] Backend logout response:', response.status);
  } catch (err) {
    console.error('[Auth] Backend logout failed:', err);
  }

  const store = useAuthStore.getState();
  store.clear();

  const api = (window as any).electronAPI;
  if (api?.clearAuthCookies) {
    console.log('[Auth] Clearing Electron cookies (explicit sign-out)');
    await api.clearAuthCookies();
  }

  console.log('[Auth] performFullLogout completed');
}

export async function exchangeToken(token: string): Promise<AuthUser | null> {
  try {
    console.log('[Auth] Exchanging token for session');
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
    console.log('[Auth] Token exchange result:', data);

    if (!data.success || !data.user) {
      return null;
    }

    if (data.jwt) {
      useAuthStore.getState().setJwt(data.jwt);
      console.log(`[JWT] saved to memory — length=${data.jwt.length}`);
      fetch(`${AUTH_DOMAIN}/api/activity/app-active`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${data.jwt}`, 'Content-Type': 'application/json' },
        credentials: 'include',
      }).then(r => console.log(`[Activity] app-active reported, status=${r.status}`))
        .catch(e => console.warn('[Activity] app-active fire-and-forget failed:', e));
    } else {
      console.warn('[JWT] exchange response did NOT contain jwt field');
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

    console.log(`[Auth] exchangeToken success, user=${user.id} isPremium=${user.isPremium} hasSeenPremiumUnlock=${user.hasSeenPremiumUnlock} hasSeenPremiumTour=${user.hasSeenPremiumTour} ts=${Date.now()}`);
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
    console.log(`[Auth] Session status: authMode=${authMode}`, data);

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

  const jwt = getStoredJwt();

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    const response = await fetch(`${AUTH_DOMAIN}/api/me`, {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(`[PremiumFlow] /api/me status=${response.status} (HTTP error)`);
      return { user: null };
    }

    const authMode = response.headers.get('X-Auth-Mode');
    const data = await response.json();
    console.log(`[PremiumFlow] /api/me status=${response.status} authMode=${authMode} loggedIn=${data.loggedIn} isPremium=${data.isPremium} plan=${data.plan} trialEndsAt=${data.trialEndsAt} hasSeenTrialActivation=${data.hasSeenTrialActivation} hasSeenTrialTour=${data.hasSeenTrialTour} hasSeenPremiumUnlock=${data.hasSeenPremiumUnlock}`);

    if (data.loggedIn === false) {
      return { user: null };
    }

    // Derive isPremium defensively: trust both the boolean AND the plan field.
    // Guards against race-condition responses where the DB read on a different
    // connection hasn't seen the just-committed write yet, returning
    // isPremium:false while plan:'premium'. If either signals active premium,
    // treat the user as premium.
    const resolvedPlan: string = data.plan || (data.isPremium ? 'premium' : 'free');
    const resolvedIsPremium: boolean = !!(
      data.isPremium ||
      data.plan === 'premium' ||
      (data.plan === 'trial' && !!data.trialEndsAt && new Date() < new Date(data.trialEndsAt))
    );

    const newUser: AuthUser = {
      id: data.id || store.user?.id || '',
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
    console.log(`[PremiumFlow] refreshEntitlements end isPremium=${newUser.isPremium} plan=${newUser.plan} trialEndsAt=${newUser.trialEndsAt} hasSeenTrialActivation=${newUser.hasSeenTrialActivation} hasSeenTrialTour=${newUser.hasSeenTrialTour} hasSeenPremiumUnlock=${newUser.hasSeenPremiumUnlock} hasSeenPremiumTour=${newUser.hasSeenPremiumTour} authMode=${authMode}`);

    return { user: newUser };
  } catch (err) {
    console.error('[PremiumFlow] refreshEntitlements error:', err);
    return { user: null };
  }
}

export async function retryRefreshEntitlements(opts?: {
  attempts?: number;
  delayMs?: number;
  initialDelayMs?: number;
}): Promise<{ ok: boolean; user: AuthUser | null; reason?: string }> {
  const { attempts = 6, delayMs = 500, initialDelayMs = 300 } = opts || {};

  console.log(`[PremiumFlow] retryRefreshEntitlements starting — initialDelay=${initialDelayMs}ms, attempts=${attempts}, delay=${delayMs}ms`);

  if (initialDelayMs > 0) {
    await new Promise(r => setTimeout(r, initialDelayMs));
  }

  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      console.log(`[PremiumFlow] /api/me retry wait ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }

    console.log(`[PremiumFlow] /api/me attempt ${i + 1}/${attempts}`);
    const result = await refreshEntitlements();

    if (result.user && result.user.loggedIn) {
      console.log(`[PremiumFlow] /api/me attempt ${i + 1}/${attempts} — loggedIn=true isPremium=${result.user.isPremium} hasSeenPremiumUnlock=${result.user.hasSeenPremiumUnlock}`);
      return { ok: true, user: result.user };
    }

    console.log(`[PremiumFlow] /api/me attempt ${i + 1}/${attempts} — loggedIn=false, retrying...`);
  }

  console.warn(`[PremiumFlow] /api/me still loggedIn=false after ${attempts} attempts`);
  return { ok: false, user: null, reason: 'not_logged_in_after_retries' };
}

export async function postUnlockSeen(): Promise<boolean> {
  try {
    const jwt = getStoredJwt();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    console.log('[PremiumUnlock] posting unlock-seen...');
    const response = await fetch(`${AUTH_DOMAIN}/api/premium/unlock-seen`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(`[PremiumUnlock] unlock-seen failed status=${response.status}`);
      return false;
    }

    console.log('[PremiumUnlock] unlock-seen success');

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

    console.log('[FactoryReset] posting reset-tour-flags...');
    const response = await fetch(`${AUTH_DOMAIN}/api/premium/reset-tour-flags`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.warn(`[FactoryReset] reset-tour-flags failed status=${response.status} (non-fatal)`);
      return false;
    }

    console.log('[FactoryReset] reset-tour-flags success');

    const store = useAuthStore.getState();
    if (store.user) {
      store.setUser({ ...store.user, hasSeenPremiumTour: false, hasSeenPremiumUnlock: false });
    }

    return true;
  } catch (err) {
    console.warn('[FactoryReset] reset-tour-flags error (non-fatal):', err);
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

    console.log('[PremiumTour] posting tour-seen...');
    const response = await fetch(`${AUTH_DOMAIN}/api/premium/tour-seen`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(`[PremiumTour] tour-seen failed status=${response.status}`);
      return false;
    }

    console.log('[PremiumTour] tour-seen success');

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

    console.log('[TrialActivation] posting trial-activation-seen...');
    const response = await fetch(`${AUTH_DOMAIN}/api/premium/trial-activation-seen`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(`[TrialActivation] trial-activation-seen failed status=${response.status}`);
      return false;
    }

    console.log('[TrialActivation] trial-activation-seen success');
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

    console.log('[TrialTour] posting trial-tour-seen...');
    const response = await fetch(`${AUTH_DOMAIN}/api/premium/trial-tour-seen`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(`[TrialTour] trial-tour-seen failed status=${response.status}`);
      return false;
    }

    console.log('[TrialTour] trial-tour-seen success');
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
