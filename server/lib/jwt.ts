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

  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      throw new Error("[FATAL] JWT secret not configured in production");
    }
    if (secret.length < 32) {
      throw new Error(`[FATAL] JWT secret too short (${secret.length} chars, minimum 32 required)`);
    }
  }
  return secret || "sc-jwt-insecure-dev-only";
}

/**
 * First 8 hex chars of the SHA-256 of the secret.
 * Safe to log — does not expose any usable secret material.
 * Used to detect secret drift across restarts (both values must match).
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
  console.log(`[JWT] signed — userId=${userId} secretFp=${secretFingerprint()} tokenFp=${jwtFingerprint(token)}`);
  return token;
}

export function verifyJwt(token: string, silent = false): JwtPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }
  try {
    const decoded = jwt.verify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: "switchcontrol",
    }) as JwtPayload;
    return decoded;
  } catch (err: any) {
    if (!silent) {
      const tokenFp  = jwtFingerprint(token);
      const secretFp = secretFingerprint();
      console.error(`[AUTH] JWT verification failed: ${err.message} | tokenFp=${tokenFp} secretFp=${secretFp}`);
    }
    return null;
  }
}

export function runJwtSelfTest(): void {
  console.log("[JWT] ===== SELF-TEST START =====");

  const config = validateJwtConfig();
  if (!config.ok) {
    console.error(`[JWT] SKIP: ${config.message}`);
    console.log("[JWT] ===== SELF-TEST END =====");
    return;
  }

  console.log(`[JWT] config OK — ${config.message}`);

  const secret = getSecret();
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
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

  console.log("[JWT] ===== SELF-TEST END =====");
}
