import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("[FATAL] JWT_SECRET environment variable is required in production. Exiting.");
    process.exit(1);
  } else {
    console.warn("[AUTH] JWT_SECRET not set — using insecure dev fallback. DO NOT use in production.");
  }
}

function getSecret(): string {
  return JWT_SECRET || "sc-jwt-insecure-dev-only";
}

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

export function signJwt(userId: string): string {
  const token = jwt.sign({ sub: userId }, getSecret(), {
    algorithm: "HS256",
    expiresIn: "7d",
  });
  return token;
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret(), {
      algorithms: ["HS256"],
    }) as JwtPayload;
    return decoded;
  } catch (err: any) {
    console.error("[AUTH] JWT verification failed:", err.message);
    return null;
  }
}

export function runJwtSelfTest(): void {
  console.log("[JWT] ===== SELF-TEST START =====");

  const testUserId = "self-test-user-000";
  const validToken = signJwt(testUserId);
  const validResult = verifyJwt(validToken);
  if (validResult && validResult.sub === testUserId) {
    console.log(`[JWT] PASS: valid token → sub=${validResult.sub} exp=${validResult.exp}`);
  } else {
    console.error("[JWT] FAIL: valid token did not verify correctly");
  }

  const invalidResult = verifyJwt("this.is.not.a.jwt");
  if (invalidResult === null) {
    console.log("[JWT] PASS: invalid token → null (rejected)");
  } else {
    console.error("[JWT] FAIL: invalid token was NOT rejected");
  }

  const expiredToken = jwt.sign({ sub: testUserId }, getSecret(), {
    algorithm: "HS256",
    expiresIn: "-1s",
  });
  const expiredResult = verifyJwt(expiredToken);
  if (expiredResult === null) {
    console.log("[JWT] PASS: expired token → null (rejected)");
  } else {
    console.error("[JWT] FAIL: expired token was NOT rejected");
  }

  const noAuthResult = verifyJwt("");
  if (noAuthResult === null) {
    console.log("[JWT] PASS: empty token → null (fallback to cookie path)");
  } else {
    console.error("[JWT] FAIL: empty token was NOT rejected");
  }

  console.log("[JWT] ===== SELF-TEST END =====");
}
