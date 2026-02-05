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

export async function refreshEntitlements(): Promise<{ upgraded: boolean; user: AuthUser | null }> {
  const store = useAuthStore.getState();
  const previousPlan = store.user?.plan || 'free';
  
  try {
    console.log('[Auth] Refreshing entitlements...');
    const response = await fetch(`${AUTH_DOMAIN}/api/me`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('[Auth] Entitlement refresh failed:', response.status);
      return { upgraded: false, user: null };
    }

    const data = await response.json();
    
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

    const upgraded = previousPlan === 'free' && newUser.plan === 'premium';
    
    store.setUser(newUser);
    console.log('[Auth] Entitlements refreshed. Upgraded:', upgraded);
    
    return { upgraded, user: newUser };
  } catch (err) {
    console.error('[Auth] Entitlement refresh error:', err);
    return { upgraded: false, user: null };
  }
}
