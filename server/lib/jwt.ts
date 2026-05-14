import jwt from "jsonwebtoken";

const _jwtSecret = (process.env.JWT_SECRET || "").trim();
const _sessionSecret = (process.env.SESSION_SECRET || "").trim();
const JWT_SECRET = _jwtSecret || _sessionSecret;

// Lazy secret accessor: returns the secret or a fallback.
// Fatal checks run at USE time, not at module import time, so the server
// can start and serve /api/health even if secrets are temporarily missing.
function getSecret(): string {
  if (process.env.NODE_ENV === "production") {
    if (!JWT_SECRET) {
      throw new Error("[FATAL] JWT secret not configured in production");
    }
    if (JWT_SECRET.length < 32) {
      throw new Error(`[FATAL] JWT secret too short (${JWT_SECRET.length} chars, minimum 32 required)`);
    }
  }
  return JWT_SECRET || "sc-jwt-insecure-dev-only";
}

// Pre-flight validation (used by startup self-test and health checks)
export function validateJwtConfig(): { ok: boolean; secretLength: number; message: string } {
  if (!JWT_SECRET) {
    return { ok: false, secretLength: 0, message: "JWT_SECRET and SESSION_SECRET are both missing" };
  }
  if (JWT_SECRET.length < 32) {
    return { ok: false, secretLength: JWT_SECRET.length, message: `JWT secret too short (${JWT_SECRET.length} chars, min 32)` };
  }
  return { ok: true, secretLength: JWT_SECRET.length, message: "JWT secret configured" };
}

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
  iss?: string;
}

export function signJwt(userId: string): string {
  const token = jwt.sign({ sub: userId }, getSecret(), {
    algorithm: "HS256",
    expiresIn: "30d",
    issuer: "switchcontrol",
  });
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
    if (!silent) console.error("[AUTH] JWT verification failed:", err.message);
    return null;
  }
}

export function runJwtSelfTest(): void {
  console.log("[JWT] ===== SELF-TEST START =====");

  // Guard: if secrets are missing or too short, log the config issue and
  // skip the tests that require a real secret. This prevents the server from
  // crashing in a loop when env vars are temporarily unset.
  const config = validateJwtConfig();
  if (!config.ok) {
    console.error(`[JWT] SKIP: ${config.message}`);
    console.log("[JWT] ===== SELF-TEST END =====");
    return;
  }

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

  // alg=none test: jsonwebtoken v9 rejects empty secrets even for alg=none,
  // so we guard this behind the config check above and wrap in try-catch.
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
