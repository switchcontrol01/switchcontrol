/**
 * Network Tweaks backend — state persistence and execution log.
 * Uses raw SQL (pool.query) — does NOT modify shared/schema.ts.
 */

import { Router } from "express";
import { pool, isNoDbMode } from "../db";

const router = Router();

// ── table init ───────────────────────────────────────────────────────────────

async function initTables(): Promise<void> {
  if (isNoDbMode || !pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS network_tweak_state (
      tweak_id    TEXT PRIMARY KEY,
      status      TEXT NOT NULL DEFAULT 'idle',
      last_result JSONB,
      applied_at  TIMESTAMPTZ,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS network_tweak_log (
      id         SERIAL PRIMARY KEY,
      tweak_id   TEXT NOT NULL,
      action     TEXT NOT NULL,
      success    BOOLEAN NOT NULL DEFAULT FALSE,
      verified   BOOLEAN NOT NULL DEFAULT FALSE,
      message    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

initTables().catch(err => console.error("[NetworkTweaks] table init error:", err));

// ── GET /api/network-tweaks/state ─────────────────────────────────────────────

router.get("/state", async (_req, res) => {
  if (isNoDbMode || !pool) return res.json({ ok: true, state: {} });
  try {
    const { rows } = await pool.query(
      "SELECT tweak_id, status, last_result, applied_at, updated_at FROM network_tweak_state ORDER BY tweak_id"
    );
    const stateMap: Record<string, { status: string; lastResult: unknown; appliedAt: string | null }> = {};
    for (const row of rows) {
      stateMap[row.tweak_id] = {
        status: row.status,
        lastResult: row.last_result,
        appliedAt: row.applied_at,
      };
    }
    return res.json({ ok: true, state: stateMap });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[NetworkTweaks] GET /state error:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
});

// ── POST /api/network-tweaks/:tweakId/report ──────────────────────────────────

router.post("/:tweakId/report", async (req, res) => {
  const { tweakId } = req.params;
  const { action, success, verified, message, disabled } = req.body as {
    action: string;
    success: boolean;
    verified: boolean;
    message?: string;
    disabled?: boolean;
  };

  if (!action || typeof success !== "boolean") {
    return res.status(400).json({ ok: false, error: "action and success are required" });
  }

  let status: string;
  if (disabled) {
    status = "unavailable";
  } else if (!success) {
    status = "failed";
  } else if (action === "enable") {
    status = verified ? "enabled" : "enabled_unverified";
  } else {
    status = "idle";
  }

  if (isNoDbMode || !pool) {
    return res.json({ ok: true, tweakId, status });
  }

  try {
    const resultJson = JSON.stringify({ action, success, verified, message });

    await pool.query(
      `INSERT INTO network_tweak_state (tweak_id, status, last_result, applied_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       ON CONFLICT (tweak_id) DO UPDATE
         SET status      = EXCLUDED.status,
             last_result = EXCLUDED.last_result,
             applied_at  = EXCLUDED.applied_at,
             updated_at  = NOW()`,
      [tweakId, status, resultJson, success && action === "enable" ? new Date() : null]
    );

    await pool.query(
      `INSERT INTO network_tweak_log (tweak_id, action, success, verified, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [tweakId, action, success, verified, message ?? null]
    );

    return res.json({ ok: true, tweakId, status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[NetworkTweaks] POST /report error:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
});

// ── GET /api/network-tweaks/log ───────────────────────────────────────────────

router.get("/log", async (_req, res) => {
  if (isNoDbMode || !pool) return res.json({ ok: true, log: [] });
  try {
    const { rows } = await pool.query(
      "SELECT id, tweak_id, action, success, verified, message, created_at FROM network_tweak_log ORDER BY created_at DESC LIMIT 200"
    );
    return res.json({ ok: true, log: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
