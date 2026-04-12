/**
 * System Intelligence API routes.
 *
 * GET  /api/system-intelligence/profile  — returns full profile (cached 30 min)
 * POST /api/system-intelligence/refresh  — forces a fresh collection
 */

import { Router } from "express";
import { getSystemIntelligence, invalidateSystemIntelligence } from "../lib/systemIntelligence";

const router = Router();

router.get("/profile", async (_req, res) => {
  try {
    const profile = await getSystemIntelligence();
    res.json(profile);
  } catch (err: any) {
    console.error("[SysIntelligence] /profile error:", err?.message);
    res.status(500).json({ error: "Failed to collect system intelligence profile." });
  }
});

router.post("/refresh", async (_req, res) => {
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
