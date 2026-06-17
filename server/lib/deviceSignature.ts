import crypto from "crypto";

/**
 * Server-side HMAC helper for cryptographically binding device IDs to users.
 *
 * The device signature is an HMAC-SHA256(userId + deviceId, JWT_SECRET) truncated
 * to 32 hex chars.  It proves that the server itself issued the device binding,
 * and prevents header spoofing (any attacker who tampers with the deviceId would
 * need to re-sign the value with the server's JWT secret, which they do not have).
 *
 * Used on both first-bind (generated) and every subsequent request (verified).
 *
 * The secret is read at call time (lazy), matching the pattern in jwt.ts.
 */
function getSecret(): string {
  const jwtSecret = (process.env.JWT_SECRET || "").trim();
  const sessionSecret = (process.env.SESSION_SECRET || "").trim();
  const secret = jwtSecret || sessionSecret;
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret.length < 32) {
      throw new Error("[FATAL] JWT secret not configured or too short for device signing");
    }
  }
  return secret || "sc-dev-insecure-only";
}

export function generateDeviceSignature(userId: string, deviceId: string): string {
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(`${userId}:${deviceId}`);
  return hmac.digest("hex").slice(0, 32);
}

export function verifyDeviceSignature(
  userId: string,
  deviceId: string,
  signature: string
): boolean {
  if (!signature || signature.length !== 32) return false;
  const expected = generateDeviceSignature(userId, deviceId);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}
