/**
 * Centralized rate limiting middleware for SwitchControl.
 *
 * All limiters use a composite key: userId > deviceId > IP (in priority order)
 * so a single user cannot bypass limits by reconnecting from a new IP.
 *
 * Logs every block as:
 *   [RateLimit] route:<path> identifier:<key> count:<n> blocked:true
 */

import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

function compositeKey(req: Request, prefix: string): string {
  const userId = (req as any).cloudUser?.id;
  if (userId) return `${prefix}:u:${userId}`;
  const raw = req.headers["x-device-id"] as string | undefined;
  if (raw && raw.length >= 16 && raw.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(raw)) {
    return `${prefix}:d:${raw}`;
  }
  return `${prefix}:ip:${req.ip || req.socket?.remoteAddress || "unknown"}`;
}

function blockHandler(label: string) {
  return (req: Request, res: Response) => {
    const key = compositeKey(req, label);
    const retryAfter = Math.ceil(Number(res.getHeader("Retry-After") ?? 60));
    console.warn(`[RateLimit] route:${req.path} identifier:${key} blocked:true retryAfter:${retryAfter}s`);
    res.status(429).json({
      success: false,
      error: "Rate limit exceeded",
      retryAfter,
    });
  };
}

// ── Auth routes — strict burst, protect login flows ───────────────────────────
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => compositeKey(req, "auth"),
  handler: blockHandler("auth"),
});

export const oauthStartLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => compositeKey(req, "oauth"),
  handler: blockHandler("oauth"),
});

export const meLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => compositeKey(req, "me"),
  handler: blockHandler("me"),
});

// ── AI routes — per-user limits keyed by userId/deviceId/IP ──────────────────
export const aiPerWindowLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => compositeKey(req, "ai5m"),
  handler: blockHandler("ai"),
});

export const aiHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => compositeKey(req, "ai1h"),
  handler: blockHandler("ai_hourly"),
});

// ── System / telemetry routes — moderate ──────────────────────────────────────
export const systemLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => compositeKey(req, "sys"),
  handler: blockHandler("system"),
});

export const telemetryRestLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => compositeKey(req, "tel"),
  handler: blockHandler("telemetry"),
});

// ── Stripe / billing — tight, protect payment flows ──────────────────────────
export const stripeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => compositeKey(req, "stripe"),
  handler: blockHandler("stripe"),
});
