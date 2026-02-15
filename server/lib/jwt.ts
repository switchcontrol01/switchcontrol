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
