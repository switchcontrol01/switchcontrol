import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const AUTH_DOMAIN = "https://switchcontrol.org";
const TOKEN_KEY = "sc_auth_token_v2";

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
  user: AuthUser | null;
  isValidating: boolean;
  setToken: (token: string) => void;
  setUser: (user: AuthUser | null) => void;
  setValidating: (v: boolean) => void;
  logout: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isValidating: false,
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      setValidating: (isValidating) => set({ isValidating }),
      logout: () => set({ token: null, user: null }),
      clear: () => set({ token: null, user: null, isValidating: false }),
    }),
    {
      name: TOKEN_KEY,
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);

// Full logout that invalidates backend session + clears all local state
export async function performFullLogout(): Promise<void> {
  console.log('[Auth] performFullLogout started');
  
  try {
    // 1. Call backend to invalidate session and expire cookie
    console.log('[Auth] Calling backend /auth/logout');
    const response = await fetch(`${AUTH_DOMAIN}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    console.log('[Auth] Backend logout response:', response.status);
  } catch (err) {
    console.error('[Auth] Backend logout failed:', err);
  }
  
  // 2. Clear Zustand store and persisted localStorage
  const store = useAuthStore.getState();
  store.clear();
  
  // 3. Clear the persisted storage key
  localStorage.removeItem(TOKEN_KEY);
  
  // 4. Reset lastKnownIsPremium
  lastKnownIsPremium = null;
  
  // 5. Clear Electron cookies if available
  const api = (window as any).electronAPI;
  if (api?.clearAuthCookies) {
    console.log('[Auth] Clearing Electron cookies');
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

    return {
      id: data.user.id || '',
      email: data.user.email || null,
      username: data.user.name || data.user.firstName || null,
      avatarUrl: data.user.avatar || null,
      plan: data.user.isPremium ? 'premium' : 'free',
      isPremium: data.user.isPremium || false,
      loggedIn: true,
    };
  } catch (err) {
    console.error('[Auth] Token exchange error:', err);
    return null;
  }
}

export async function validateToken(token: string): Promise<AuthUser | null> {
  try {
    console.log('[Auth] Validating session with /api/me');
    const response = await fetch(`${AUTH_DOMAIN}/api/me`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('[Auth] Session validation failed:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[Auth] Session status:', data);
    
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

// Track last known premium state separately to avoid stale store issues
let lastKnownIsPremium: boolean | null = null;

export async function refreshEntitlements(): Promise<{ upgraded: boolean; user: AuthUser | null }> {
  const store = useAuthStore.getState();
  const previousPlan = store.user?.plan || 'free';
  const wasPremium = lastKnownIsPremium !== null ? lastKnownIsPremium : (store.user?.isPremium || false);
  
  console.log('[PremiumFlow] refreshEntitlements start - wasPremium:', wasPremium, 'lastKnownIsPremium:', lastKnownIsPremium);
  
  try {
    const response = await fetch(`${AUTH_DOMAIN}/api/me`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('[PremiumFlow] refreshEntitlements failed:', response.status);
      return { upgraded: false, user: null };
    }

    const data = await response.json();
    console.log('[PremiumFlow] refreshEntitlements response:', { isPremium: data.isPremium, loggedIn: data.loggedIn });
    
    if (data.loggedIn === false) {
      console.log('[PremiumFlow] refreshEntitlements end - not logged in');
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
    
    // Update lastKnownIsPremium AFTER computing upgraded
    lastKnownIsPremium = newUser.isPremium;
    
    store.setUser(newUser);
    console.log(`[PremiumFlow] refreshEntitlements end upgraded=${upgraded} premium=${newUser.isPremium} wasPremium=${wasPremium}`);
    
    return { upgraded, user: newUser };
  } catch (err) {
    console.error('[PremiumFlow] refreshEntitlements error:', err);
    return { upgraded: false, user: null };
  }
}
