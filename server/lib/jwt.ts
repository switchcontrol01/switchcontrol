import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Get the current JWT secret at call time (truly lazy).
 *
 * IMPORTANT: We read process.env at every call — NOT at module load time.
 * This allows desktop-secrets.ts to inject JWT_SECRET / SESSION_SECRET into
 * process.env before the first JWT operation, regardless of module import order.
 *
 * The old pattern `const JWT_SECRET = process.env.JWT_SECRET` (module-level
 * constant) caused "invalid signature" errors when jwt.ts was imported by any
 * transitive dependency before desktop-secrets.ts had run.
 */
function getSecret(): string {
  const jwtSecret     = (process.env.JWT_SECRET     || "").trim();
  const sessionSecret = (process.env.SESSION_SECRET || "").trim();
  const secret = jwtSecret || sessionSecret;

  // Fail-closed: enforce secret requirements for every environment EXCEPT
  // explicit local development.  Using !== "development" (denylist) rather than
  // === "production" (allowlist) so staging, CI, prod, and any deployment where
  // NODE_ENV is unset/misspelled/set to "prod"/"Production"/"staging" all
  // fail securely instead of silently signing tokens with the hardcoded fallback.
  // The old allowlist meant anyone who had seen the fallback string (now public)
  // could forge valid 30-day admin-equivalent JWTs in any non-strictly-"production"
  // environment — a real credential-forgery risk in staging deployments.
  if (process.env.NODE_ENV !== "development") {
    if (!secret) {
      throw new Error("[FATAL] JWT secret not configured — set JWT_SECRET or SESSION_SECRET");
    }
    if (secret.length < 32) {
      throw new Error(`[FATAL] JWT secret too short (${secret.length} chars, minimum 32 required)`);
    }
  }
  // This fallback is only reachable when NODE_ENV === "development".
  return secret || "sc-jwt-insecure-dev-only";
}

/**
 * First 8 hex chars of SHA-256(secret) — 32-bit, enough for log readability.
 * Safe to log — does not expose any usable secret material.
 * Used to detect secret drift across restarts (both values must match).
 *
 * Intentionally shorter than tokenRevocationFp (128-bit / 32 hex chars).
 * tokenRevocationFp needs collision resistance to prevent fingerprint squatting
 * on the revocation list. secretFp / jwtFp are debug-only identifiers where a
 * false log correlation is merely confusing, not a security failure — 8 chars
 * (32-bit) is sufficient for that purpose and keeps log lines readable.
 */
function secretFingerprint(): string {
  try {
    const s = getSecret();
    return crypto.createHash("sha256").update(s).digest("hex").substring(0, 8);
  } catch {
    return "no-secret";
  }
}

/**
 * Short token fingerprint — first 8 chars of header + first 8 chars of payload.
 * Enough to identify a specific token in logs without exposing any secret.
 */
export function jwtFingerprint(token: string): string {
  try {
    const parts = token.split(".");
    return (parts[0] ?? "").substring(0, 8) + "." + (parts[1] ?? "").substring(0, 8);
  } catch {
    return "malformed";
  }
}

/**
 * Decode the token WITHOUT verifying the signature — used only to check
 * structural validity and expiry so we can produce a more precise error reason.
 */
export function peekJwtExpiry(token: string): "expired" | "not_expired" | "malformed" {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return "malformed";
    const raw = Buffer.from(parts[1], "base64").toString("utf-8");
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const exp = typeof payload.exp === "number" ? payload.exp : null;
    if (exp !== null && Math.floor(Date.now() / 1000) > exp) return "expired";
    return "not_expired";
  } catch {
    return "malformed";
  }
}

// Pre-flight validation (used by startup self-test and health checks)
export function validateJwtConfig(): { ok: boolean; secretLength: number; message: string } {
  const jwtSecret     = (process.env.JWT_SECRET     || "").trim();
  const sessionSecret = (process.env.SESSION_SECRET || "").trim();
  const secret = jwtSecret || sessionSecret;

  if (!secret) {
    return { ok: false, secretLength: 0, message: "JWT_SECRET and SESSION_SECRET are both missing" };
  }
  if (secret.length < 32) {
    return { ok: false, secretLength: secret.length, message: `JWT secret too short (${secret.length} chars, min 32)` };
  }
  return { ok: true, secretLength: secret.length, message: `JWT secret configured (secretFp=${secretFingerprint()})` };
}

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
  iss?: string;
}

export function signJwt(userId: string): string {
  const secret = getSecret();
  const token = jwt.sign({ sub: userId }, secret, {
    algorithm: "HS256",
    expiresIn: "30d",
    issuer: "switchcontrol",
  });
  // userId is a stable internal ID, but omit it from production logs as a
  // defence-in-depth measure — tokenFp is sufficient for tracing in prod.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[JWT] signed — userId=${userId} secretFp=${secretFingerprint()} tokenFp=${jwtFingerprint(token)}`);
  } else {
    console.log(`[JWT] signed — secretFp=${secretFingerprint()} tokenFp=${jwtFingerprint(token)}`);
  }
  return token;
}

// ── Verified-token cache ──────────────────────────────────────────────────────
// jwt.verify performs an HMAC-SHA256 on every call. At scale (1000+ concurrent
// users hitting authed endpoints), re-verifying the same long-lived tokens is
// wasted CPU. Cache successful verifications keyed by the token string.
//
// Safety notes:
//  - Token expiry (exp) is always honored — an expired cache hit is discarded.
//  - A short re-verify TTL bounds the window for secret rotation to take effect.
//  - This does NOT cache entitlements/bans/premium: those are read live from the
//    DB by the auth middleware using the userId, so revocation is unaffected.
const JWT_CACHE_MAX = 5000;
const JWT_CACHE_TTL_MS = 60_000; // re-run jwt.verify at most once/min per token
const verifiedCache = new Map<string, { payload: JwtPayload; cachedAt: number }>();

// ── Token revocation list ─────────────────────────────────────────────────────
// Tracks tokens explicitly revoked via invalidateJwt() (e.g. on logout).
// Without this, a logged-out 30-day token stays cryptographically valid for its
// full lifetime and re-verifies successfully on any call to verifyJwt() — even
// on the same process that issued the logout — because jwt.verify() only checks
// the HMAC and exp claim, not whether the token was deliberately invalidated.
//
// Storage: SHA-256(token)[0:32 hex] → exp timestamp (Unix seconds).
// A 32-char hex fingerprint (128-bit) is collision-resistant for any practical
// revocation list size. Each entry TTLs out at the token's own exp, so the Map
// stays bounded without a separate sweep.
//
// Multi-instance note: this Map is per-process. In a horizontally-scaled
// deployment, revocation is enforced only on the instance that handled the
// logout request. A shared store (Redis, DB table with TTL) would be needed for
// full cross-instance coverage. The current deployment is single-instance so
// this provides complete protection.
const revokedFingerprints = new Map<string, number>(); // fingerprint → exp (seconds)

function tokenRevocationFp(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/** Remove revocation entries whose token exp has already passed (auto-cleanup). */
function pruneRevokedTokens(): void {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const [fp, exp] of revokedFingerprints) {
    if (nowSec >= exp) revokedFingerprints.delete(fp);
  }
}

// Periodic sweep — ensures revokedFingerprints stays trimmed even during quiet
// periods with no logout activity.  pruneRevokedTokens() is also called on each
// invalidateJwt() call, but at scale a 30-day token window means thousands of
// entries can accumulate between logouts.  15-minute sweeps bound worst-case growth.
// .unref() prevents this timer from keeping the Node process alive if nothing
// else is running (relevant for test environments and graceful shutdown).
const REVOKED_PRUNE_INTERVAL_MS = 15 * 60_000;
setInterval(pruneRevokedTokens, REVOKED_PRUNE_INTERVAL_MS).unref();

// Hard size cap mirroring JWT_CACHE_MAX — safety valve for burst logout events
// that arrive before a prune cycle runs.  verifiedCache has the same limit.
const REVOKED_MAX = JWT_CACHE_MAX;

function jwtCacheGet(token: string): JwtPayload | null {
  const hit = verifiedCache.get(token);
  if (!hit) return null;
  const now = Date.now();
  // Respect token expiry (exp is seconds since epoch).
  if (hit.payload.exp && now >= hit.payload.exp * 1000) {
    verifiedCache.delete(token);
    return null;
  }
  // Bounded freshness so secret rotation / re-issue takes effect promptly.
  if (now - hit.cachedAt > JWT_CACHE_TTL_MS) {
    verifiedCache.delete(token);
    return null;
  }
  // LRU touch — move to most-recently-used position.
  verifiedCache.delete(token);
  verifiedCache.set(token, hit);
  return hit.payload;
}

function jwtCacheSet(token: string, payload: JwtPayload): void {
  if (verifiedCache.size >= JWT_CACHE_MAX) {
    const oldest = verifiedCache.keys().next().value;
    if (oldest !== undefined) verifiedCache.delete(oldest);
  }
  verifiedCache.set(token, { payload, cachedAt: Date.now() });
}

/**
 * Revoke a specific JWT: drop it from the verify cache AND add it to the
 * revocation list so it cannot re-verify until its natural exp.
 *
 * Previously this only removed the cache entry — a pure performance optimization.
 * The token remained cryptographically valid (HMAC still checks out) for its full
 * 30-day lifetime, so "logout" provided no real protection against a stolen token.
 * The revocation list closes that gap for single-instance deployments.
 */
export function invalidateJwt(token: string): void {
  verifiedCache.delete(token);
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const raw = Buffer.from(parts[1], "base64").toString("utf-8");
      const peek = JSON.parse(raw) as Record<string, unknown>;
      // Use the token's own exp as the revocation entry TTL.
      // Fall back to 30 days if exp is absent — the maximum token lifetime.
      const exp = typeof peek.exp === "number"
        ? peek.exp
        : Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
      pruneRevokedTokens(); // trim naturally-expired entries on every logout
      // Safety valve: if still over the cap after pruning (burst logout event),
      // evict the oldest entries — they have the earliest exp and are least
      // likely to receive a re-present attempt.
      if (revokedFingerprints.size >= REVOKED_MAX) {
        const evict = revokedFingerprints.size - REVOKED_MAX + 1;
        // Array.from avoids the Map-iterator downlevelIteration tsc requirement.
        Array.from(revokedFingerprints.keys()).slice(0, evict).forEach(k => revokedFingerprints.delete(k));
      }
      const fp = tokenRevocationFp(token);
      revokedFingerprints.set(fp, exp);
      console.log(`[JWT] token revoked — fp=${fp} exp=${exp} revokedListSize=${revokedFingerprints.size}`);
    }
  } catch {
    // Malformed token — cannot verify anyway, no revocation entry needed.
  }
}

/** Clear the entire verified-token cache (e.g. on secret rotation). */
export function clearJwtCache(): void {
  verifiedCache.clear();
}

export function verifyJwt(token: string, silent = false): JwtPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }
  // Revocation check comes first — before the cache — so a revoked token is
  // always rejected even if it was re-added to the cache after invalidation
  // (e.g. the same token presented to a different code path before the cache
  // entry was evicted by the LRU). One SHA-256 per call is negligible.
  const fp = tokenRevocationFp(token);
  if (revokedFingerprints.has(fp)) {
    if (!silent) console.log(`[JWT] rejected — token is on revocation list fp=${fp}`);
    return null;
  }
  const cached = jwtCacheGet(token);
  if (cached) return cached;
  try {
    const decoded = jwt.verify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: "switchcontrol",
    }) as JwtPayload;
    jwtCacheSet(token, decoded);
    return decoded;
  } catch (err: any) {
    if (!silent) {
      const tokenFp  = jwtFingerprint(token);
      const secretFp = secretFingerprint();

      // Decode payload WITHOUT signature verification to pull diagnostics from
      // the token that just failed — never log raw payload values (privacy).
      let iss = "(missing)";
      let tokenAge = "(no iat)";
      let expStatus = "(no exp)";
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const raw = Buffer.from(parts[1], "base64").toString("utf-8");
          const peek = JSON.parse(raw) as Record<string, unknown>;
          const nowSec = Math.floor(Date.now() / 1000);
          iss = typeof peek.iss === "string" ? peek.iss : "(missing)";
          if (typeof peek.iat === "number") {
            tokenAge = `${nowSec - peek.iat}s`;
          }
          if (typeof peek.exp === "number") {
            expStatus = peek.exp > nowSec
              ? `valid (exp in ${peek.exp - nowSec}s)`
              : `expired (${nowSec - peek.exp}s ago)`;
          }
        }
      } catch {}

      console.error(
        `[AUTH] JWT verification failed: ${err.message} | ` +
        `tokenFp=${tokenFp} secretFp=${secretFp} ` +
        `iss=${iss} age=${tokenAge} exp=${expStatus} authMode=jwt`,
      );
    }
    return null;
  }
}

export function runJwtSelfTest(): void {
  console.log("[JWT] ===== SELF-TEST START =====");

  const config = validateJwtConfig();
  if (!config.ok) {
    console.error(`[JWT] SKIP: ${config.message}`);
    // In any non-development environment a bad JWT config is critical — the app
    // will throw on the first getSecret() call outside dev.  Make this impossible
    // to miss in logs regardless of log level filtering.
    if (process.env.NODE_ENV !== "development") {
      console.error(
        `[JWT] CRITICAL: JWT secret misconfigured in non-development environment ` +
        `(NODE_ENV=${process.env.NODE_ENV ?? "unset"}). ` +
        `Every authenticated request will fail. Set JWT_SECRET immediately.`
      );
    }
    console.log("[JWT] ===== SELF-TEST END =====");
    return;
  }

  console.log(`[JWT] config OK — ${config.message}`);

  const secret = getSecret();
  // Align guard with getSecret() — use !== "development" so staging / unset
  // NODE_ENV also catches a too-short secret (was === "production" before).
  if (process.env.NODE_ENV !== "development" && secret.length < 32) {
    console.error("[JWT] FAIL: JWT secret is too short (minimum 32 bytes required)");
  }

  const testUserId = "self-test-user-000";
  const validToken = signJwt(testUserId);
  const validResult = verifyJwt(validToken);
  if (validResult && validResult.sub === testUserId) {
    console.log(`[JWT] PASS: valid token → sub=${validResult.sub} exp=${validResult.exp}`);
  } else {
    console.error("[JWT] FAIL: valid token did not verify correctly");
  }

  const invalidResult = verifyJwt("this.is.not.a.jwt", true);
  if (invalidResult === null) {
    console.log("[JWT] PASS: invalid token → null (rejected)");
  } else {
    console.error("[JWT] FAIL: invalid token was NOT rejected");
  }

  const expiredToken = jwt.sign({ sub: testUserId }, getSecret(), {
    algorithm: "HS256",
    expiresIn: "-1s",
    issuer: "switchcontrol",
  });
  const expiredResult = verifyJwt(expiredToken, true);
  if (expiredResult === null) {
    console.log("[JWT] PASS: expired token → null (rejected)");
  } else {
    console.error("[JWT] FAIL: expired token was NOT rejected");
  }

  const noAuthResult = verifyJwt("", true);
  if (noAuthResult === null) {
    console.log("[JWT] PASS: empty token → null (fallback to cookie path)");
  } else {
    console.error("[JWT] FAIL: empty token was NOT rejected");
  }

  // Note: this test verifies that the jsonwebtoken library's built-in
  // `algorithms: ["HS256"]` allowlist (set inside verifyJwt) rejects alg=none
  // tokens.  It is NOT exercising a custom defence written here — the library
  // does the work.  If the allowlist option were ever removed from verifyJwt,
  // this test would still pass because jwt.sign with alg=none and an empty
  // secret throws before verifyJwt is even called.  The real protection lives
  // in the `algorithms: ["HS256"]` option passed to jwt.verify in verifyJwt.
  try {
    const algNoneToken = jwt.sign({ sub: testUserId }, "", { algorithm: "none" as any });
    const algNoneResult = verifyJwt(algNoneToken, true);
    if (algNoneResult === null) {
      console.log("[JWT] PASS: alg=none token → null (rejected)");
    } else {
      console.error("[JWT] FAIL: alg=none token was NOT rejected");
    }
  } catch (e: any) {
    console.log("[JWT] PASS: alg=none token → rejected by library (" + e.message + ")");
  }

  const wrongIssuerToken = jwt.sign({ sub: testUserId }, getSecret(), {
    algorithm: "HS256",
    expiresIn: "7d",
    issuer: "malicious-issuer",
  });
  const wrongIssuerResult = verifyJwt(wrongIssuerToken, true);
  if (wrongIssuerResult === null) {
    console.log("[JWT] PASS: wrong issuer token → null (rejected)");
  } else {
    console.error("[JWT] FAIL: wrong issuer token was NOT rejected");
  }

  // Test: valid structure and issuer, but signed with a completely different secret
  // (simulates a stolen/forged token from a foreign service or a key-rotation gap).
  // jwt.verify's HMAC check must reject this — covers the tampered/foreign-secret
  // attack surface not exercised by the wrong-issuer or expired-token tests above.
  const foreignSecret = "foreign-secret-totally-different-32ch";
  const foreignToken = jwt.sign({ sub: testUserId }, foreignSecret, {
    algorithm: "HS256",
    expiresIn: "7d",
    issuer: "switchcontrol",
  });
  const foreignResult = verifyJwt(foreignToken, true);
  if (foreignResult === null) {
    console.log("[JWT] PASS: foreign-secret token → null (rejected)");
  } else {
    console.error("[JWT] FAIL: foreign-secret token was NOT rejected — HMAC check bypassed");
  }

  console.log("[JWT] ===== SELF-TEST END =====");
}
