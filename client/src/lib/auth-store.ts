import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const AUTH_DOMAIN = "https://switchcontrol.org";
const TOKEN_KEY = "sc_auth_token_v2";
const JWT_KEY = "sc_jwt";

export interface AuthUser {
  id: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  plan: string;
  isPremium: boolean;
  loggedIn: boolean;
}

interface AuthState {
  token: string | null;
  jwt: string | null;
  user: AuthUser | null;
  isValidating: boolean;
  setToken: (token: string) => void;
  setJwt: (jwt: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  setValidating: (v: boolean) => void;
  logout: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      jwt: null,
      user: null,
      isValidating: false,
      setToken: (token) => set({ token }),
      setJwt: (jwt) => {
        if (jwt) {
          localStorage.setItem(JWT_KEY, jwt);
        } else {
          localStorage.removeItem(JWT_KEY);
        }
        set({ jwt });
      },
      setUser: (user) => set({ user }),
      setValidating: (isValidating) => set({ isValidating }),
      logout: () => {
        localStorage.removeItem(JWT_KEY);
        set({ token: null, jwt: null, user: null });
      },
      clear: () => {
        localStorage.removeItem(JWT_KEY);
        set({ token: null, jwt: null, user: null, isValidating: false });
      },
    }),
    {
      name: TOKEN_KEY,
      partialize: (state) => ({ token: state.token, user: state.user, jwt: state.jwt }),
    }
  )
);

function getStoredJwt(): string | null {
  return useAuthStore.getState().jwt || localStorage.getItem(JWT_KEY);
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
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(JWT_KEY);
  lastKnownIsPremium = null;

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
      console.log(`[Auth] saved jwt length=${data.jwt.length}`);
    }

    const user: AuthUser = {
      id: data.user.id || '',
      email: data.user.email || null,
      username: data.user.name || data.user.firstName || null,
      avatarUrl: data.user.avatar || null,
      plan: data.user.isPremium ? 'premium' : 'free',
      isPremium: data.user.isPremium || false,
      loggedIn: true,
    };

    console.log(`[Auth] exchangeToken success, user=${user.id} isPremium=${user.isPremium} ts=${Date.now()}`);
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
    console.log(`[Auth] Validating session with /api/me (useJwt=${useJwt})`);

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
      plan: data.isPremium ? 'premium' : 'free',
      isPremium: data.isPremium || false,
      loggedIn: true,
    };
  } catch (err) {
    console.error('[Auth] Session validation error:', err);
    return null;
  }
}

let lastKnownIsPremium: boolean | null = null;

export function resetLastKnownPremium() {
  lastKnownIsPremium = null;
}

export async function refreshEntitlements(): Promise<{ upgraded: boolean; user: AuthUser | null }> {
  const store = useAuthStore.getState();
  const wasPremium = lastKnownIsPremium !== null ? lastKnownIsPremium : (store.user?.isPremium || false);

  const jwt = getStoredJwt();
  const useJwt = !!jwt;
  console.log(`[PremiumFlow] refreshEntitlements start - wasPremium=${wasPremium} lastKnownIsPremium=${lastKnownIsPremium} useJwt=${useJwt}`);

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
      return { upgraded: false, user: null };
    }

    const authMode = response.headers.get('X-Auth-Mode');
    const data = await response.json();
    console.log(`[PremiumFlow] /api/me status=${response.status} authMode=${authMode} loggedIn=${data.loggedIn} isPremium=${data.isPremium}`);

    if (data.loggedIn === false) {
      return { upgraded: false, user: null };
    }

    const newUser: AuthUser = {
      id: data.id || store.user?.id || '',
      email: data.email || null,
      username: data.name || data.firstName || null,
      avatarUrl: data.avatar || null,
      plan: data.isPremium ? 'premium' : 'free',
      isPremium: data.isPremium || false,
      loggedIn: true,
    };

    const upgraded = !wasPremium && newUser.isPremium;
    lastKnownIsPremium = newUser.isPremium;

    store.setUser(newUser);
    console.log(`[PremiumFlow] refreshEntitlements end upgraded=${upgraded} premium=${newUser.isPremium} wasPremium=${wasPremium} authMode=${authMode}`);

    return { upgraded, user: newUser };
  } catch (err) {
    console.error('[PremiumFlow] refreshEntitlements error:', err);
    return { upgraded: false, user: null };
  }
}

export async function retryRefreshEntitlements(opts?: {
  attempts?: number;
  delayMs?: number;
  initialDelayMs?: number;
}): Promise<{ ok: boolean; upgraded: boolean; user: AuthUser | null; reason?: string }> {
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
      console.log(`[PremiumFlow] /api/me attempt ${i + 1}/${attempts} — loggedIn=true isPremium=${result.user.isPremium} upgraded=${result.upgraded}`);
      return { ok: true, upgraded: result.upgraded, user: result.user };
    }

    console.log(`[PremiumFlow] /api/me attempt ${i + 1}/${attempts} — loggedIn=false, retrying...`);
  }

  console.warn(`[PremiumFlow] /api/me still loggedIn=false after ${attempts} attempts`);
  return { ok: false, upgraded: false, user: null, reason: 'not_logged_in_after_retries' };
}
