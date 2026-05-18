/**
 * auth-store.ts  ← Backward-compatibility barrel re-export
 *
 * All existing import sites (`import { X } from "@/lib/auth-store"`) continue
 * to work unchanged. The implementation is now split across:
 *
 *   electronAuth.ts   — packaged-Electron detection + AUTH_DOMAIN
 *   jwt.ts            — pure JWT decode / validate / reissue utilities
 *   authStore.ts      — pure Zustand store (state + primitive setters only)
 *   authClient.ts     — all fetch logic (refreshEntitlements, exchange, logout, …)
 *   entitlementService.ts — resolveAuthState + normalizeApiMeUser
 *   authGuards.ts     — buildAuthHeaders, isUnauthorizedError, redirectToLogin
 *
 * Do NOT add new logic here. Add it to the appropriate module above.
 */

// ── electronAuth ──────────────────────────────────────────────────────────────
export { AUTH_DOMAIN, isPackagedElectron, isElectronEnv, clearElectronAuthCookies } from './electronAuth';

// ── jwt ───────────────────────────────────────────────────────────────────────
export {
  decodeJwtPayload,
  checkJwtExpiry,
  validateAndClearJwt,
  reissueJwtFromSession,
  jwtFingerprint,
} from './jwt';
export type { JwtPayload, JwtCheckResult } from './jwt';

// ── authStore ─────────────────────────────────────────────────────────────────
export {
  useAuthStore,
  triggerFlowReset,
  safeGetJwt,
  currentMeGeneration,
  bumpMeGeneration,
} from './authStore';
export type { AuthUser, ElectronAuthState } from './authStore';

// ── authClient ────────────────────────────────────────────────────────────────
export {
  refreshEntitlements,
  retryRefreshEntitlements,
  exchangeToken,
  performFullLogout,
  postUnlockSeen,
  postTourSeen,
  postResetTourFlags,
  postTrialActivationSeen,
  postTrialTourSeen,
} from './authClient';

// ── entitlementService ────────────────────────────────────────────────────────
export {
  normalizeApiMeUser,
  resolveAuthState,
  validateToken,
} from './entitlementService';
export type { AuthStateResolution } from './entitlementService';

// ── authGuards ────────────────────────────────────────────────────────────────
export {
  buildAuthHeaders,
  isUnauthorizedError,
  redirectToLogin,
  isSessionValid,
  getVerifiedUser,
} from './authGuards';
