/**
 * Centralized rate limiting middleware for SwitchControl.
 *
 * All limiters use a composite key: userId > deviceId > IP (in priority order)
 * so a single user cannot bypass limits by reconnecting from a new IP.
 *
 * ⚠ Trust-proxy dependency: the IP fallback reads req.ip which is the proxy IP
 * in production unless `app.set("trust proxy", ...)` is configured in Express.
 * Without trust proxy, all unauthenticated users share one rate limit bucket.
 * The `validate: { xForwardedForHeader: false }` option suppresses the
 * express-rate-limit warning but does not fix the underlying issue.
 *
 * ⚠ In-memory storage: all limiters use the default in-memory store. In a
 * multi-process or horizontally-scaled deployment the effective limit is
 * max × processCount. Switch to a Redis store if the app scales beyond one
 * process.
 *
 * Logs every block as:
 *   [RateLimit] route:<path> identifier:<key> blocked:true retryAfter:<n>s
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
    // express-rate-limit with standardHeaders:true sets Retry-After as a
    // duration in seconds (not a Unix timestamp), so this is safe to use directly.
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

// ── Promo popup check — called once per app launch by design ─────────────────
// Anything faster than a couple of calls per window is a crash loop or abuse;
// the endpoint itself also has a 2-minute server-side debounce.
export const promoLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,
  max: 4,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => compositeKey(req, "promo"),
  handler: blockHandler("promo"),
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
// Two independent limiters work together:
//   aiPerWindowLimiter — 20 req / 5 min (burst guard)
//   aiHourlyLimiter    — 80 req / 1 hr  (sustained guard)
// A user who fills the 5-min window (20 req), waits for it to reset, and
// repeats could theoretically send 240 req/hr — but aiHourlyLimiter blocks at
// 80 regardless of how the 5-min windows fall, so the interaction is correct.
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

// ── Security advisor — OpenAI image analysis, independently killable ──────────
// Centralised here so composite-key logic stays in one place. The security
// router previously defined its own inline rateLimit instance which couldn't
// benefit from future changes to compositeKey or blockHandler.
export const securityLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => compositeKey(req, "sec"),
  handler: blockHandler("security"),
});

// ── Debloat — PowerShell-backed, rate-limit to cap WMI load ──────────────────
// Each request can spawn powershell.exe; without a limiter a single user could
// cause sustained WMI load. Tight window mirrors the AI per-window pattern.
export const debloatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => compositeKey(req, "debloat"),
  handler: blockHandler("debloat"),
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
