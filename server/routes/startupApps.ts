import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, isNoDbMode } from "../db";
import rateLimit from "express-rate-limit";
import { requireJwt } from "../middleware/requireCloudAuth";

const router = Router();
router.use(requireJwt);
const startupMutationLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many startup changes. Please try again shortly." },
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type StartupSource =
  | "registry-hkcu"
  | "registry-hklm"
  | "startup-folder-user"
  | "startup-folder-common"
  | "task-scheduler";

// ── DB init ───────────────────────────────────────────────────────────────────

async function initTables() {
  if (isNoDbMode || !db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_toggle_history (
      id         SERIAL PRIMARY KEY,
      user_id    TEXT,
      entry_id   TEXT NOT NULL,
      entry_name TEXT NOT NULL,
      source     TEXT NOT NULL,
      enabled    BOOLEAN NOT NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    ALTER TABLE startup_toggle_history
      ADD COLUMN IF NOT EXISTS user_id TEXT
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS startup_toggle_history_user_id_idx
      ON startup_toggle_history (user_id)
  `);
}

initTables().catch((e) =>
  console.error("[StartupApps] table init failed:", e.message)
);

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/startup/apps
// On the web (non-Electron) we cannot scan Windows registry.
// Clients that have window.electronAPI must scan via IPC directly.
router.get("/apps", (_req, res) => {
  res.json({ ok: true, requiresElectron: true, entries: [] });
});

// POST /api/startup/apps/:id/toggle
// Logs an enable/disable change to DB for the history panel.
router.post("/apps/:id/toggle", startupMutationLimit, async (req, res) => {
  const { id } = req.params;
  const { name, source, enabled } = req.body as {
    name?: string;
    source?: string;
    enabled?: boolean;
  };

  const validSources: StartupSource[] = [
    "registry-hkcu", "registry-hklm", "startup-folder-user",
    "startup-folder-common", "task-scheduler",
  ];
  if (!id || id.length > 512 || typeof name !== "string" || name.length === 0 || name.length > 256 ||
      typeof source !== "string" || !validSources.includes(source as StartupSource) ||
      typeof enabled !== "boolean") {
    return res
      .status(400)
      .json({ ok: false, error: "id, name, source and enabled are invalid" });
  }

  try {
    if (!isNoDbMode && db) {
      await db.execute(sql`
        INSERT INTO startup_toggle_history (user_id, entry_id, entry_name, source, enabled)
        VALUES (${req.cloudUser!.id}, ${id}, ${name}, ${source}, ${enabled})
      `);
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[StartupApps] toggle log error:", e?.message ?? "unknown database error");
    res.status(500).json({ ok: false, error: "Failed to record startup change" });
  }
});

// GET /api/startup/history
router.get("/history", async (req, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, history: [] });
  try {
    const rows = await db.execute<{
      id: number;
      entry_id: string;
      user_id: string | null;
      entry_name: string;
      source: string;
      enabled: boolean;
      changed_at: string;
    }>(
      sql`
        SELECT *
        FROM startup_toggle_history
        WHERE user_id = ${req.cloudUser!.id}
        ORDER BY changed_at DESC
        LIMIT 50
      `
    );
    res.json({ ok: true, history: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
