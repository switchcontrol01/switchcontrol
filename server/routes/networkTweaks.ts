/**
 * Network Tweaks backend — state persistence and execution log.
 * Uses Drizzle's sql template literals — does NOT modify shared/schema.ts
 * for runtime mutations, but schema.ts defines the canonical table shape.
 */

import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, isNoDbMode } from "../db";
import { storage } from "../storage";
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

// ── Startup migration: per-user schema upgrade ───────────────────────────────
// Adds user_id columns if missing, then upgrades the network_tweak_state PK
// from the old single-column (tweak_id) to composite (user_id, tweak_id) so
// every user owns their own row and can never overwrite another user's state.

async function migrateNetworkTweakState() {
  if (isNoDbMode || !db) return;
  try {
    // Step 1: add user_id columns if missing (idempotent)
    await db.execute(sql`
      ALTER TABLE network_tweak_state
        ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '__legacy__'
    `);
    await db.execute(sql`
      ALTER TABLE network_tweak_log
        ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '__legacy__'
    `);

    // Step 2: upgrade network_tweak_state PK from single-column tweak_id
    // to composite (user_id, tweak_id) so each user owns their own row.
    // Check whether the old single-column PK still exists by inspecting
    // the number of columns in the current PK constraint.
    const pkInfo = await db.execute(sql`
      SELECT COUNT(*) AS col_count
      FROM information_schema.key_column_usage
      WHERE table_name = 'network_tweak_state'
        AND constraint_name = (
          SELECT constraint_name
          FROM information_schema.table_constraints
          WHERE table_name = 'network_tweak_state'
            AND constraint_type = 'PRIMARY KEY'
          LIMIT 1
        )
    `);
    const colCount = Number((pkInfo.rows[0] as any)?.col_count ?? 0);
    if (colCount === 1) {
      // Old single-column PK: drop and replace with composite.
      await db.execute(sql`
        ALTER TABLE network_tweak_state
          DROP CONSTRAINT IF EXISTS network_tweak_state_pkey
      `);
      await db.execute(sql`
        ALTER TABLE network_tweak_state
          ADD PRIMARY KEY (user_id, tweak_id)
      `);
      console.log('[NetworkTweaks] upgraded network_tweak_state PK to composite (user_id, tweak_id)');
    }

    console.log('[NetworkTweaks] schema OK — user_id columns and composite PK present');
  } catch (e: any) {
    console.warn('[NetworkTweaks] migrateNetworkTweakState non-fatal error:', e.message);
  }
}

migrateNetworkTweakState();

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

  const friendlyName = tweakId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const historyNote = `${action === "apply" ? "Enabled" : "Disabled"} — ${verified ? "verified" : "unverified"}${message ? `: ${message}` : ""}`;

  if (isNoDbMode || !db) {
    storage.getOrCreateSettings(userId).then(s => storage.addHistory({
      settingsId: s.id,
      action: `Network Tweak: ${friendlyName}`,
      page: "Network Tweaks",
      result: success ? (action === "apply" ? "Enabled" : "Disabled") : "Failed",
      notes: historyNote,
    })).catch(() => {});
    return res.json({ ok: true, tweakId, status });
  }

  try {
    const resultJson = JSON.stringify({ action, success, verified, message });
    const appliedAt = success && action === "apply" ? new Date() : null;

    // ON CONFLICT targets the composite PK (user_id, tweak_id) so each user
    // owns their own row and can never overwrite another user's state.
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

    storage.getOrCreateSettings(userId).then(s => storage.addHistory({
      settingsId: s.id,
      action: `Network Tweak: ${friendlyName}`,
      page: "Network Tweaks",
      result: success ? (action === "apply" ? "Enabled" : "Disabled") : "Failed",
      notes: historyNote,
    })).catch(() => {});

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
