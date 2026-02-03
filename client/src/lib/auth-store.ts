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

export async function validateToken(token: string): Promise<AuthUser | null> {
  try {
    console.log('[Auth] Validating token with /api/me');
    const response = await fetch(`${AUTH_DOMAIN}/api/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[Auth] Token validation failed:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[Auth] User validated:', data);
    
    if (data.loggedIn === false) {
      return null;
    }

    return {
      id: data.id || '',
      email: data.email || null,
      username: data.username || data.name || null,
      avatarUrl: data.avatarUrl || data.avatar || null,
      plan: data.plan || 'free',
      isPremium: data.isPremium || false,
      loggedIn: true,
    };
  } catch (err) {
    console.error('[Auth] Token validation error:', err);
    return null;
  }
}
