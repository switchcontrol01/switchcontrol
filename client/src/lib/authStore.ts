/**
 * authStore.ts
 * Pure Zustand store — state shape + primitive actions only.
 * No fetch logic lives here. For API calls use authClient.ts / entitlementService.ts.
 *
 * Persistence: only { user, jwt, token } written to localStorage.
 * Transient flags (isValidating, electronAuthState, oauthError) are never persisted.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { checkJwtExpiry, validateAndClearJwt, jwtFingerprint } from './jwt';

const isDebug = import.meta.env.DEV;

// ── Storage key ───────────────────────────────────────────────────────────────
// v3 bump: old v2 key is cleaned up on boot so stale hydration can't occur.
const TOKEN_KEY = 'sc_auth_token_v3';

if (typeof window !== 'undefined') {
  // Clean up legacy keys so they can never hydrate stale premium flags.
  ['sc_auth_token_v1', 'sc_auth_token_v2', 'sc_premium_tour_completed'].forEach(k =>
    localStorage.removeItem(k),
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

// States that represent a successful (or in-progress) auth — cannot be overwritten
// by timeout/cancel to prevent late IPC messages from clobbering a good auth.
const TERMINAL_STATES: ElectronAuthState[] = ['callback_received', 'exchanging', 'authenticated'];

// ── Persisted user shape validator ────────────────────────────────────────────
// Prevents corrupted or tampered localStorage from hydrating into the store.
function isValidUserShape(u: unknown): u is AuthUser {
  if (!u || typeof u !== 'object') return false;
  const o = u as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.loggedIn === 'boolean' &&
    typeof o.plan === 'string' &&
    typeof o.isPremium === 'boolean' &&
    typeof o.isAdmin === 'boolean'
  );
}

// ── Store interface ───────────────────────────────────────────────────────────

interface AuthState {
  token: string | null;
  jwt: string | null;
  user: AuthUser | null;
  isValidating: boolean;
  electronAuthState: ElectronAuthState;
  oauthError: string | null;
  /** Incremented by triggerFlowReset() to signal App.tsx to clear all session guards. */
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

// ── Store ─────────────────────────────────────────────────────────────────────

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
          // Always log blocked transitions — helps diagnose race conditions
          console.log(`[AuthState] transition BLOCKED ${current} → ${newState} (terminal state protected)`);
          return;
        }
        // Always log auth state transitions — critical for Electron auth lifecycle tracing
        console.log(`[AuthState] transition ${current} → ${newState}`);
        set({ electronAuthState: newState });
      },

      setOauthError: (oauthError) => set({ oauthError }),

      logout: () => {
        if (isDebug) console.log('[AuthStore] logout — clearing state + persisted storage');
        set({ token: null, jwt: null, user: null, electronAuthState: 'idle', oauthError: null });
        // Also wipe the persisted localStorage entry so it cannot re-hydrate.
        try {
          useAuthStore.persist.clearStorage();
        } catch {
          // Fallback: manually remove the key
          localStorage.removeItem(TOKEN_KEY);
        }
      },

      clear: () => {
        if (isDebug) console.log('[AuthStore] clear — full reset');
        set({
          token: null,
          jwt: null,
          user: null,
          isValidating: false,
          electronAuthState: 'idle',
          oauthError: null,
        });
        try {
          useAuthStore.persist.clearStorage();
        } catch {
          localStorage.removeItem(TOKEN_KEY);
        }
      },
    }),
    {
      name: TOKEN_KEY,
      // Only persist the minimum needed to resume a session.
      // isValidating, electronAuthState, oauthError are transient and must never persist.
      partialize: (state) => ({ user: state.user, jwt: state.jwt, token: state.token }),
      // Validate the rehydrated shape before it enters the store.
      merge: (persisted: unknown, current: AuthState): AuthState => {
        const p = persisted as Partial<AuthState> | null;
        if (!p) return current;

        // Reject a persisted user that doesn't match the expected shape.
        const safeUser = isValidUserShape(p.user) ? p.user : null;
        if (p.user && !safeUser && isDebug) {
          console.warn('[AuthStore] Persisted user failed shape validation — discarded');
        }

        // Validate the persisted JWT structure (not expiry — that is checked lazily).
        let safeJwt: string | null = null;
        if (typeof p.jwt === 'string' && p.jwt.length > 0) {
          const check = checkJwtExpiry(p.jwt);
          if (!check.malformed) {
            safeJwt = p.jwt; // may be expired — reissue will handle it
          } else {
            if (isDebug) {
              console.warn('[AuthStore] Persisted JWT failed structure check — discarded. tokenId:', jwtFingerprint(p.jwt));
            }
          }
        }

        return {
          ...current,
          user: safeUser,
          jwt: safeJwt,
          token: typeof p.token === 'string' ? p.token : null,
        };
      },
    },
  ),
);

// ── Boot-time diagnostic ──────────────────────────────────────────────────────
if (typeof window !== 'undefined' && isDebug) {
  const _boot = useAuthStore.getState();
  console.log(
    '[AuthStore] boot — jwt:', _boot.jwt ? `${_boot.jwt.length}ch` : 'none',
    '| token:', !!_boot.token,
    '| user:', _boot.user?.id ?? 'none',
  );
}

// ── triggerFlowReset ──────────────────────────────────────────────────────────
/**
 * Called by Admin.tsx after granting/revoking premium or trial for the current user.
 * Increments flowResetTs which App.tsx watches to clear all in-session animation guards,
 * so the flow re-evals without being blocked by stale session refs.
 */
export function triggerFlowReset(): void {
  useAuthStore.setState(s => ({ flowResetTs: s.flowResetTs + 1 }));
}

// ── safeGetJwt ───────────────────────────────────────────────────────────────
/**
 * Returns the stored JWT only if it is well-formed and not expired.
 * Clears and returns null if the token is malformed or expired.
 * Each distinct bad token produces exactly one console warning (deduped by fingerprint).
 */
export function safeGetJwt(): string | null {
  const store = useAuthStore.getState();
  return validateAndClearJwt(store.jwt, () => store.setJwt(null));
}

// ── Request generation counter ────────────────────────────────────────────────
// Incremented on logout/clear so in-flight /api/me responses from before the
// logout cannot overwrite the freshly-cleared state.
let _meGeneration = 0;

export function currentMeGeneration(): number {
  return _meGeneration;
}

export function bumpMeGeneration(): number {
  return ++_meGeneration;
}
