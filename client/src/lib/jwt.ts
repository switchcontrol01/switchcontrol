/**
 * jwt.ts
 * Pure JWT utilities — no imports from our own code.
 * All JWT decode, validation, expiry, reissue, and fingerprinting lives here.
 * Import from here; never decode JWTs anywhere else in the codebase.
 */

import { AUTH_DOMAIN } from './electronAuth';

const isDebug = import.meta.env.DEV;

// ── Clock-skew tolerance ──────────────────────────────────────────────────────
// Accept tokens that expired within this window (handles minor clock drift).
const CLOCK_SKEW_TOLERANCE_S = 30;

// ── Bad-token dedup ───────────────────────────────────────────────────────────
// Track fingerprints we have already warned about so the same bad token never
// floods the console on every API call.
const _badJwtFingerprints = new Set<string>();

// ── Reissue dedup ────────────────────────────────────────────────────────────
let _jwtReissuePromise: Promise<string | null> | null = null;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  [k: string]: unknown;
}

export interface JwtCheckResult {
  jwt: string | null;
  payload: JwtPayload | null;
  expired: boolean;
  malformed: boolean;
  /** Raw exp claim value (unix seconds) or null if absent. */
  exp: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * First 8 chars of header + first 8 chars of payload.
 * Enough to uniquely identify a token without exposing any secret data.
 */
export function jwtFingerprint(jwt: string): string {
  try {
    const p = jwt.split('.');
    return (p[0] ?? '').substring(0, 8) + '.' + (p[1] ?? '').substring(0, 8);
  } catch {
    return 'malformed';
  }
}

/** Safe base64url → UTF-8 string (handles missing padding + URL-safe chars). */
function decodeBase64Url(s: string): string {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Decode the payload of a JWT without any side-effects or store access.
 * Returns null if the token is malformed.
 * NEVER log the returned payload — it may contain PII.
 */
export function decodeJwtPayload(jwt: string): JwtPayload | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(decodeBase64Url(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Check JWT structure and expiry WITHOUT mutating any state or logging.
 * Includes CLOCK_SKEW_TOLERANCE_S grace window on the expiry check.
 * Safe to call from any context including renders.
 */
export function checkJwtExpiry(jwt: string | null): JwtCheckResult {
  if (!jwt) return { jwt: null, payload: null, expired: false, malformed: false, exp: null };

  const parts = jwt.split('.');
  if (parts.length !== 3) {
    return { jwt, payload: null, expired: false, malformed: true, exp: null };
  }

  const payload = decodeJwtPayload(jwt);
  if (!payload) {
    return { jwt, payload: null, expired: false, malformed: true, exp: null };
  }

  const exp = payload.exp != null ? Number(payload.exp) : null;
  const nowSec = Math.floor(Date.now() / 1000);
  // Token is expired only if we are past (exp + tolerance)
  const isExpired = exp !== null && nowSec > exp + CLOCK_SKEW_TOLERANCE_S;

  return { jwt, payload, expired: isExpired, malformed: false, exp };
}

/**
 * Validate a JWT and clear it via the provided callback if invalid.
 * Each distinct bad token produces exactly one console warning (deduped by fingerprint).
 * Returns the JWT if valid, null if invalid/cleared.
 */
export function validateAndClearJwt(
  jwt: string | null,
  clearJwt: () => void,
): string | null {
  if (!jwt) return null;

  const result = checkJwtExpiry(jwt);

  if (result.malformed) {
    const fp = jwtFingerprint(jwt);
    if (!_badJwtFingerprints.has(fp)) {
      _badJwtFingerprints.add(fp);
      if (isDebug) console.warn('[JWT] malformed — cleared. tokenId:', fp);
    }
    clearJwt();
    return null;
  }

  if (result.expired) {
    const fp = jwtFingerprint(jwt);
    if (!_badJwtFingerprints.has(fp)) {
      _badJwtFingerprints.add(fp);
      if (isDebug) console.warn('[JWT] expired — cleared. tokenId:', fp);
    }
    clearJwt();
    return null;
  }

  return jwt;
}

/**
 * Attempts a JWT reissue from the cloud server using the session cookie.
 * Deduplicates concurrent calls globally — only one reissue runs at a time.
 * Validates the returned token before accepting it.
 * Returns the new JWT or null if the session is expired/gone.
 */
export async function reissueJwtFromSession(): Promise<string | null> {
  if (_jwtReissuePromise) {
    // Dedup is silent — the original call already has logging
    return _jwtReissuePromise;
  }

  // Always log token refresh start — critical event for auth lifecycle tracing
  console.log('[JWT:refresh] event=start source=session_cookie');

  _jwtReissuePromise = (async () => {
    try {
      const resp = await fetch(`${AUTH_DOMAIN}/api/auth/reissue-jwt`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!resp.ok) {
        // Always log token refresh failure
        console.warn(`[JWT:refresh] event=failed reason=http_${resp.status}`);
        return null;
      }

      const data = await resp.json();
      if (!data?.jwt || typeof data.jwt !== 'string') {
        console.warn('[JWT:refresh] event=failed reason=no_jwt_in_response');
        return null;
      }

      // Validate before accepting
      const check = checkJwtExpiry(data.jwt);
      if (check.malformed || check.expired) {
        console.warn(`[JWT:refresh] event=failed reason=invalid_token malformed=${check.malformed} expired=${check.expired}`);
        return null;
      }

      // Always log token refresh success
      const newFp = jwtFingerprint(data.jwt);
      console.log(`[JWT:refresh] event=success tokenFp=${newFp}`);
      return data.jwt as string;
    } catch (err) {
      // Always log network-level refresh failures
      console.warn('[JWT:refresh] event=failed reason=network error=' + (err as Error).message);
      return null;
    } finally {
      _jwtReissuePromise = null;
    }
  })();

  return _jwtReissuePromise;
}
