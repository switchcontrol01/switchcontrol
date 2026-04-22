import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("[FATAL] Neither JWT_SECRET nor SESSION_SECRET is set. Exiting.");
    process.exit(1);
  } else {
    console.warn("[AUTH] JWT_SECRET not set — using insecure dev fallback. DO NOT use in production.");
  }
}

if (!process.env.JWT_SECRET && process.env.SESSION_SECRET) {
  console.log("[AUTH] JWT_SECRET not set — using SESSION_SECRET for JWT signing.");
}

function getSecret(): string {
  if (process.env.NODE_ENV === "production") {
    if (!JWT_SECRET) {
      throw new Error("[FATAL] JWT secret not configured in production");
    }
    if (JWT_SECRET.length < 32) {
      throw new Error("[FATAL] JWT secret too short (minimum 32 characters required)");
    }
  }
  return JWT_SECRET || "sc-jwt-insecure-dev-only";
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

  const algNoneToken = jwt.sign({ sub: testUserId }, "", { algorithm: "none" as any });
  const algNoneResult = verifyJwt(algNoneToken, true);
  if (algNoneResult === null) {
    console.log("[JWT] PASS: alg=none token → null (rejected)");
  } else {
    console.error("[JWT] FAIL: alg=none token was NOT rejected");
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
