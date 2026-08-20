/**
 * System Intelligence API routes.
 *
 * GET  /api/system-intelligence/profile  — returns full profile (cached 30 min)
 * POST /api/system-intelligence/refresh  — forces a fresh collection (rate-limited)
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireJwt } from "../middleware/requireCloudAuth";
import {
  getSystemIntelligence,
  getFastSystemIntelligence,
  triggerBackgroundCollection,
  invalidateSystemIntelligence,
} from "../lib/systemIntelligence";

// Per-user rate limit: 1 refresh per 5 minutes to prevent expensive
// re-collection from being spammed.
// NOTE: keyGenerator intentionally omitted to let express-rate-limit handle
// IPv6/IPv4 safely internally. User scoping is enforced by requireJwt on
// this route, so the per-IP fallback is an acceptable safety net.
const refreshRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[SysIntelligence] Rate limit hit for IP ${req.ip}`);
    res.status(429).json({
      error: "Rate limit exceeded",
      message: "System intelligence refresh is limited to once per 5 minutes. Use cached data or wait.",
    });
  },
});
const backgroundTriggerRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Background collection trigger rate limit exceeded." },
});

const router = Router();

/**
 * GET /fast — Phase A only: CPU brand, RAM total, GPU name, BIOS/baseboard.
 * Responds in <1s (7s worst-case on AMD cold-start, then cached forever).
 * Automatically schedules a background full collection after returning.
 */
router.get("/fast", async (_req, res) => {
  try {
    const profile = await getFastSystemIntelligence();
    res.json(profile);
  } catch (err: any) {
    console.error("[SysIntelligence] /fast error:", err?.message);
    res.status(500).json({ error: "Failed to collect fast system profile." });
  }
});

/**
 * POST /trigger-background — nudges a background deep collection.
 * Called by the dashboard after it's stable (no auth required — just a hint).
 */
router.post("/trigger-background", requireJwt, backgroundTriggerRateLimit, (_req, res) => {
  triggerBackgroundCollection();
  res.json({ ok: true });
});

router.get("/profile", async (_req, res) => {
  try {
    const profile = await getSystemIntelligence();
    res.json(profile);
  } catch (err: any) {
    console.error("[SysIntelligence] /profile error:", err?.message);
    res.status(500).json({ error: "Failed to collect system intelligence profile." });
  }
});

router.post("/refresh", refreshRateLimit, async (_req, res) => {
  try {
    invalidateSystemIntelligence();
    const profile = await getSystemIntelligence(true);
    res.json(profile);
  } catch (err: any) {
    console.error("[SysIntelligence] /refresh error:", err?.message);
    res.status(500).json({ error: "Failed to refresh system intelligence profile." });
  }
});

export { router as systemIntelligenceRouter };
