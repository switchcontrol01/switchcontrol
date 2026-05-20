/**
 * Network Tweaks backend — state persistence and execution log.
 * Uses Drizzle's sql template literals — does NOT modify shared/schema.ts.
 */

import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, isNoDbMode } from "../db";
import { requireJwt } from "../middleware/requireCloudAuth";
import rateLimit from "express-rate-limit";

const router = Router();

// Rate limiter for network tweak mutation endpoints
// Max 30 report submissions per user per 15 minutes.
const networkTweakRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req: any) => req.cloudUser?.id || req.ip || 'unknown',
  message: { ok: false, error: "Rate limit reached. Please try again later." },
});

// ── Allowlist of valid network tweak IDs ─────────────────────────────────────
// Derived from client/src/lib/network-tweaks-data.ts — must stay in sync.

const VALID_TWEAK_IDS = new Set<string>([
  "smb-non-best-effort", "smb-v2v3", "smb-live-migration", "smb-congruent-ops",
  "smb-max-requests", "smb-irp-stack", "smb-incoming-requests", "smb-pipe-data",
  "smb-request-buffer", "smb-preallocate",
  "tcp-wait-time", "tcp-bufferlist", "tcp-nagle", "tcp-non-sack-rto",
  "tcp-task-offload", "tcp-timestamps", "tcp-window-heuristics", "tcp-dca",
  "tcp-throttling-index", "tcp-pmtu", "tcp-rss", "tcp-chimney", "tcp-sack",
  "tcp-weak-host", "tcp-winhttp", "tcp-rto-increase", "tcp-connection-timeout",
  "tcp-congestion", "tcp-ttl", "tcp-connection-limit", "tcp-port-range",
  "udp-offloads", "udp-fast-send",
  "sec-llmnr", "sec-mpp", "sec-netbios",
  "dns-doh", "dns-optimize",
]);

// ── table init ───────────────────────────────────────────────────────────────

async function initTables(): Promise<void> {
  if (isNoDbMode || !db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS network_tweak_state (
      user_id     TEXT NOT NULL DEFAULT '__legacy__',
      tweak_id    TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'idle',
      last_result JSONB,
      applied_at  TIMESTAMPTZ,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, tweak_id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS network_tweak_log (
      id         SERIAL PRIMARY KEY,
      user_id    TEXT NOT NULL DEFAULT '__legacy__',
      tweak_id   TEXT NOT NULL,
      action     TEXT NOT NULL,
      success    BOOLEAN NOT NULL DEFAULT FALSE,
      verified   BOOLEAN NOT NULL DEFAULT FALSE,
      message    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Migrate pre-existing tables that lack user_id
  await db.execute(sql`ALTER TABLE network_tweak_state ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '__legacy__'`);
  await db.execute(sql`ALTER TABLE network_tweak_log    ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '__legacy__'`);
  // Migrate old single-column PK to composite (user_id, tweak_id)
  // The old PK was just tweak_id; backfilled user_id='__legacy__' keeps rows unique.
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'network_tweak_state'
          AND constraint_name = 'network_tweak_state_pkey'
          AND constraint_type = 'PRIMARY KEY'
      ) THEN
        BEGIN
          ALTER TABLE network_tweak_state DROP CONSTRAINT network_tweak_state_pkey;
          ALTER TABLE network_tweak_state ADD PRIMARY KEY (user_id, tweak_id);
        EXCEPTION WHEN others THEN NULL;
        END;
      END IF;
    END $$
  `);
}

initTables().catch(err => console.error("[NetworkTweaks] table init error:", err));

// ── GET /api/network-tweaks/state ─────────────────────────────────────────────

router.get("/state", requireJwt, async (req: any, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, state: {} });
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  try {
    const result = await db.execute(sql`
      SELECT tweak_id, status, last_result, applied_at, updated_at
      FROM network_tweak_state
      WHERE user_id = ${userId}
      ORDER BY tweak_id
    `);
    const stateMap: Record<string, { status: string; lastResult: unknown; appliedAt: string | null }> = {};
    for (const row of result.rows) {
      stateMap[row.tweak_id as string] = {
        status: row.status as string,
        lastResult: row.last_result,
        appliedAt: row.applied_at as string | null,
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

router.post("/:tweakId/report", requireJwt, networkTweakRateLimit, async (req: any, res) => {
  const { tweakId } = req.params;
  const userId: string = req.cloudUser?.id ?? '__legacy__';

  if (!VALID_TWEAK_IDS.has(tweakId)) {
    return res.status(400).json({ ok: false, error: `Unknown tweak ID: ${tweakId}` });
  }

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
  } else if (action === "apply") {
    status = verified ? "enabled" : "enabled_unverified";
  } else {
    status = "idle";
  }

  if (isNoDbMode || !db) {
    return res.json({ ok: true, tweakId, status });
  }

  try {
    const resultJson = JSON.stringify({ action, success, verified, message });
    const appliedAt = success && action === "apply" ? new Date() : null;

    await db.execute(sql`
      INSERT INTO network_tweak_state (user_id, tweak_id, status, last_result, applied_at, updated_at)
      VALUES (${userId}, ${tweakId}, ${status}, ${resultJson}::jsonb, ${appliedAt}, NOW())
      ON CONFLICT (user_id, tweak_id) DO UPDATE
        SET status      = EXCLUDED.status,
            last_result = EXCLUDED.last_result,
            applied_at  = EXCLUDED.applied_at,
            updated_at  = NOW()
    `);

    await db.execute(sql`
      INSERT INTO network_tweak_log (user_id, tweak_id, action, success, verified, message)
      VALUES (${userId}, ${tweakId}, ${action}, ${success}, ${verified}, ${message ?? null})
    `);

    return res.json({ ok: true, tweakId, status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[NetworkTweaks] POST /report error:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
});

// ── GET /api/network-tweaks/log ───────────────────────────────────────────────

router.get("/log", requireJwt, async (req: any, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, log: [] });
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  try {
    const result = await db.execute(sql`
      SELECT id, tweak_id, action, success, verified, message, created_at
      FROM network_tweak_log
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 200
    `);
    return res.json({ ok: true, log: result.rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
