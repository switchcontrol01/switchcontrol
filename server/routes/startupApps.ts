import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, isNoDbMode } from "../db";

const router = Router();

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
      entry_id   TEXT NOT NULL,
      entry_name TEXT NOT NULL,
      source     TEXT NOT NULL,
      enabled    BOOLEAN NOT NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
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
router.post("/apps/:id/toggle", async (req, res) => {
  const { id } = req.params;
  const { name, source, enabled } = req.body as {
    name?: string;
    source?: string;
    enabled?: boolean;
  };

  if (!name || !source || typeof enabled !== "boolean") {
    return res
      .status(400)
      .json({ ok: false, error: "name, source and enabled are required" });
  }

  try {
    if (!isNoDbMode && db) {
      await db.execute(sql`
        INSERT INTO startup_toggle_history (entry_id, entry_name, source, enabled)
        VALUES (${id}, ${name}, ${source}, ${enabled})
      `);
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[StartupApps] toggle log error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/startup/history
router.get("/history", async (_req, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, history: [] });
  try {
    const rows = await db.execute<{
      id: number;
      entry_id: string;
      entry_name: string;
      source: string;
      enabled: boolean;
      changed_at: string;
    }>(
      sql`SELECT * FROM startup_toggle_history ORDER BY changed_at DESC LIMIT 50`
    );
    res.json({ ok: true, history: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
