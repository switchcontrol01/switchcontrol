import rateLimit, { ipKeyGenerator, type Store } from "express-rate-limit";
import type { Express } from "express";

/** Fixed-window IP state, capped even during a flood of distinct addresses.
 * At capacity, new addresses share an overflow budget, never an unlimited bypass.
 * No per-key timers and no eviction of live counters. */
export class BoundedAuthStore implements Store {
  localKeys = true;
  private windowMs = 60_000;
  private entries = new Map<string, { totalHits: number; resetTime: Date }>();
  private overflow = { totalHits: 0, resetTime: new Date(0) };
  constructor(private capacity = 10_000) {}
  init(options: { windowMs: number }) { this.windowMs = options.windowMs; }
  async increment(key: string) {
    const now = Date.now();
    let entry = this.entries.get(key);
    if (entry && entry.resetTime.getTime() <= now) {
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      if (this.entries.size >= this.capacity) {
        for (const [k, value] of this.entries) {
          if (value.resetTime.getTime() <= now) this.entries.delete(k);
        }
      }
      if (this.entries.size < this.capacity) {
        entry = { totalHits: 0, resetTime: new Date(now + this.windowMs) };
        this.entries.set(key, entry);
      } else {
        if (this.overflow.resetTime.getTime() <= now) {
          this.overflow = { totalHits: 0, resetTime: new Date(now + this.windowMs) };
        }
        entry = this.overflow;
      }
    }
    entry.totalHits++;
    return { ...entry };
  }
  async decrement(key: string) {
    const entry = this.entries.get(key);
    if (entry) entry.totalHits = Math.max(0, entry.totalHits - 1);
  }
  async resetKey(key: string) { this.entries.delete(key); }
}

export const AUTH_BUDGETS = {
  poll: { windowMs: 60_000, limit: 600 }, // 20 simultaneous 2s pollers per NAT
  start: { windowMs: 60_000, limit: 30 },
  callback: { windowMs: 15 * 60_000, limit: 120 },
  exchange: { windowMs: 15 * 60_000, limit: 120 },
  other: { windowMs: 15 * 60_000, limit: 40 },
} as const;

export function mountAuthRateLimits(app: Express) {
  const make = (budget: keyof typeof AUTH_BUDGETS) => rateLimit({
    ...AUTH_BUDGETS[budget],
    store: new BoundedAuthStore(),
    standardHeaders: true,
    legacyHeaders: false,
    // Keep the existing trust-proxy topology. Never trust device/identity headers.
    keyGenerator: req => ipKeyGenerator(req.ip || req.socket.remoteAddress || "unknown"),
    validate: { xForwardedForHeader: false },
    handler: (_req, res) => {
      const retryAfter = Math.max(1, Math.ceil(Number(res.getHeader("Retry-After") || 60)));
      res.status(429).json({ success: false, error: "Rate limit exceeded", retryAfter });
    },
  });
  const poll = make("poll");
  const callback = make("callback");
  const exchange = make("exchange");
  const other = make("other");
  app.use("/api/auth", (req, res, next) => {
    const path = req.path.toLowerCase().replace(/\/+$/, "");
    if (path === "/desktop-poll") return poll(req, res, next);
    if (path === "/google/callback" || path === "/discord/callback") return callback(req, res, next);
    if (path === "/exchange") return exchange(req, res, next);
    return other(req, res, next);
  });
  app.use(["/auth/google", "/auth/discord"], make("start"));
}
