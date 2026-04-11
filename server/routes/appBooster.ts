import { Router } from "express";
import { pool, isNoDbMode } from "../db";
import { SUPPORTED_GAMES, buildActionsForGame, getGameBySlug, PROFILES } from "../lib/appBoosterProfiles";

const router = Router();

// ── DB init ──────────────────────────────────────────────────────────────────

async function initTables() {
  if (isNoDbMode || !pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_booster_games (
      slug        TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      executable  TEXT NOT NULL,
      install_path TEXT,
      detected    BOOLEAN NOT NULL DEFAULT FALSE,
      added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_booster_state (
      game_slug   TEXT PRIMARY KEY,
      status      TEXT NOT NULL DEFAULT 'idle',
      profile_id  TEXT,
      applied_at  TIMESTAMPTZ,
      reverted_at TIMESTAMPTZ,
      actions_result JSONB NOT NULL DEFAULT '[]',
      install_path TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_booster_history (
      id          SERIAL PRIMARY KEY,
      game_slug   TEXT NOT NULL,
      operation   TEXT NOT NULL,
      status      TEXT NOT NULL,
      details     JSONB NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

initTables().catch((e) => console.error("[AppBooster] table init failed:", e.message));

// ── helpers ──────────────────────────────────────────────────────────────────

interface GameState {
  slug: string;
  name: string;
  executable: string;
  installPath: string | null;
  detected: boolean;
  status: "idle" | "applied" | "staged" | "partial" | "failed" | "reverted";
  profileId: string | null;
  appliedAt: string | null;
  revertedAt: string | null;
  actionsResult: ActionResult[];
  addedAt: string;
}

interface ActionResult {
  id: string;
  label: string;
  status: "success" | "failed" | "skipped" | "admin-required";
  message: string;
  verified: boolean;
}

async function getState(slug: string): Promise<GameState | null> {
  const game = getGameBySlug(slug);
  if (!game) return null;

  const defaultState: GameState = {
    slug: game.slug,
    name: game.name,
    executable: game.executable,
    installPath: null,
    detected: false,
    status: "idle",
    profileId: null,
    appliedAt: null,
    revertedAt: null,
    actionsResult: [],
    addedAt: new Date().toISOString(),
  };

  if (isNoDbMode || !pool) return defaultState;

  const { rows } = await pool.query(
    `SELECT s.status, s.profile_id, s.applied_at, s.reverted_at, s.actions_result, s.install_path,
            g.detected, g.added_at, g.install_path as g_install_path
     FROM app_booster_state s
     LEFT JOIN app_booster_games g ON g.slug = s.game_slug
     WHERE s.game_slug = $1`,
    [slug]
  );

  if (rows.length === 0) {
    const gameRow = await pool.query(
      `SELECT detected, added_at, install_path FROM app_booster_games WHERE slug = $1`,
      [slug]
    );
    if (gameRow.rows.length > 0) {
      return {
        ...defaultState,
        detected: gameRow.rows[0].detected,
        installPath: gameRow.rows[0].install_path ?? null,
        addedAt: gameRow.rows[0].added_at,
      };
    }
    return defaultState;
  }

  const r = rows[0];
  return {
    slug: game.slug,
    name: game.name,
    executable: game.executable,
    installPath: r.install_path ?? r.g_install_path ?? null,
    detected: r.detected ?? false,
    status: r.status ?? "idle",
    profileId: r.profile_id ?? null,
    appliedAt: r.applied_at ?? null,
    revertedAt: r.reverted_at ?? null,
    actionsResult: r.actions_result ?? [],
    addedAt: r.added_at ?? new Date().toISOString(),
  };
}

async function upsertGameRow(slug: string, name: string, executable: string, detected: boolean, installPath: string | null) {
  if (isNoDbMode || !pool) return;
  await pool.query(
    `INSERT INTO app_booster_games (slug, name, executable, detected, install_path)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slug) DO UPDATE SET
       detected = EXCLUDED.detected,
       install_path = COALESCE(EXCLUDED.install_path, app_booster_games.install_path)`,
    [slug, name, executable, detected, installPath]
  );
}

async function upsertStateRow(
  slug: string,
  status: string,
  profileId: string | null,
  actionsResult: ActionResult[],
  installPath: string | null,
  operation: "apply" | "revert" | "none" = "none"
) {
  if (isNoDbMode || !pool) return;
  const now = new Date();
  const json = JSON.stringify(actionsResult);

  if (operation === "apply") {
    await pool.query(
      `INSERT INTO app_booster_state
         (game_slug, status, profile_id, actions_result, install_path, applied_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $6)
       ON CONFLICT (game_slug) DO UPDATE SET
         status       = EXCLUDED.status,
         profile_id   = COALESCE(EXCLUDED.profile_id, app_booster_state.profile_id),
         actions_result = EXCLUDED.actions_result,
         install_path = COALESCE(EXCLUDED.install_path, app_booster_state.install_path),
         applied_at   = EXCLUDED.applied_at,
         updated_at   = EXCLUDED.updated_at`,
      [slug, status, profileId, json, installPath, now]
    );
  } else if (operation === "revert") {
    await pool.query(
      `INSERT INTO app_booster_state
         (game_slug, status, profile_id, actions_result, install_path, reverted_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $6)
       ON CONFLICT (game_slug) DO UPDATE SET
         status         = EXCLUDED.status,
         actions_result = EXCLUDED.actions_result,
         install_path   = COALESCE(EXCLUDED.install_path, app_booster_state.install_path),
         reverted_at    = EXCLUDED.reverted_at,
         updated_at     = EXCLUDED.updated_at`,
      [slug, status, profileId, json, installPath, now]
    );
  } else {
    await pool.query(
      `INSERT INTO app_booster_state
         (game_slug, status, profile_id, actions_result, install_path, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (game_slug) DO UPDATE SET
         status         = EXCLUDED.status,
         profile_id     = COALESCE(EXCLUDED.profile_id, app_booster_state.profile_id),
         actions_result = EXCLUDED.actions_result,
         install_path   = COALESCE(EXCLUDED.install_path, app_booster_state.install_path),
         updated_at     = EXCLUDED.updated_at`,
      [slug, status, profileId, json, installPath, now]
    );
  }
}

async function addHistory(slug: string, operation: string, status: string, details: object) {
  if (isNoDbMode || !pool) return;
  await pool.query(
    `INSERT INTO app_booster_history (game_slug, operation, status, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [slug, operation, status, JSON.stringify(details)]
  );
}

// ── routes ────────────────────────────────────────────────────────────────────

// GET /api/app-booster/games — list all supported games with current state
router.get("/games", async (_req, res) => {
  try {
    const stateMap: Record<string, { status: string; profileId: string | null; detected: boolean; installPath: string | null }> = {};

    if (!isNoDbMode && pool) {
      const { rows } = await pool.query(`
        SELECT g.slug, g.detected, g.install_path,
               s.status, s.profile_id
        FROM app_booster_games g
        LEFT JOIN app_booster_state s ON s.game_slug = g.slug
      `);
      for (const r of rows) {
        stateMap[r.slug] = {
          status: r.status ?? "idle",
          profileId: r.profile_id ?? null,
          detected: r.detected ?? false,
          installPath: r.install_path ?? null,
        };
      }
    }

    const result = SUPPORTED_GAMES.map((g) => {
      const s = stateMap[g.slug];
      return {
        slug: g.slug,
        name: g.name,
        publisher: g.publisher,
        executable: g.executable,
        genre: g.genre,
        profileId: g.profileId,
        profile: PROFILES[g.profileId] ?? null,
        status: s?.status ?? "idle",
        detected: s?.detected ?? false,
        installPath: s?.installPath ?? null,
        actionCount: buildActionsForGame(g, null).length,
        knownPaths: g.knownPaths,
      };
    });

    res.json({ games: result });
  } catch (e: any) {
    console.error("[AppBooster] GET /games error:", e.message);
    res.status(500).json({ error: "Failed to load game library" });
  }
});

// POST /api/app-booster/games/scan — receive scan results from Electron client
router.post("/games/scan", async (req, res) => {
  try {
    const { results } = req.body as {
      results: Array<{ slug: string; detected: boolean; installPath: string | null }>;
    };

    if (!Array.isArray(results)) {
      return res.status(400).json({ error: "results array required" });
    }

    for (const r of results) {
      const game = getGameBySlug(r.slug);
      if (!game) continue;
      await upsertGameRow(game.slug, game.name, game.executable, r.detected, r.installPath);
    }

    await addHistory("system", "scan", "success", {
      scanned: results.length,
      detected: results.filter((r) => r.detected).length,
    });

    const detected = results.filter((r) => r.detected).length;
    res.json({ ok: true, scanned: results.length, detected });
  } catch (e: any) {
    console.error("[AppBooster] POST /games/scan error:", e.message);
    res.status(500).json({ error: "Scan record failed" });
  }
});

// GET /api/app-booster/games/:slug/status — full state for one game
router.get("/games/:slug/status", async (req, res) => {
  try {
    const { slug } = req.params;
    const state = await getState(slug);
    if (!state) return res.status(404).json({ error: "Game not found" });

    const game = getGameBySlug(slug)!;
    const profile = PROFILES[game.profileId] ?? null;
    const actions = buildActionsForGame(game, state.installPath);

    res.json({ ...state, profile, actions });
  } catch (e: any) {
    console.error("[AppBooster] GET /status error:", e.message);
    res.status(500).json({ error: "Failed to load game status" });
  }
});

// POST /api/app-booster/games/:slug/apply — get profile + record apply intent
router.post("/games/:slug/apply", async (req, res) => {
  try {
    const { slug } = req.params;
    const game = getGameBySlug(slug);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const installPath: string | null = req.body?.installPath ?? null;
    await upsertGameRow(game.slug, game.name, game.executable, !!installPath, installPath);

    const actions = buildActionsForGame(game, installPath);
    const profile = PROFILES[game.profileId];

    res.json({
      ok: true,
      slug,
      profileId: game.profileId,
      profile,
      actions,
      installPath,
    });
  } catch (e: any) {
    console.error("[AppBooster] POST /apply error:", e.message);
    res.status(500).json({ error: "Failed to prepare profile" });
  }
});

// POST /api/app-booster/games/:slug/revert — get revert actions
router.post("/games/:slug/revert", async (req, res) => {
  try {
    const { slug } = req.params;
    const game = getGameBySlug(slug);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const state = await getState(slug);
    const installPath = req.body?.installPath ?? state?.installPath ?? null;
    const actions = buildActionsForGame(game, installPath);

    res.json({ ok: true, slug, actions, installPath });
  } catch (e: any) {
    console.error("[AppBooster] POST /revert error:", e.message);
    res.status(500).json({ error: "Failed to prepare revert" });
  }
});

// POST /api/app-booster/games/:slug/report-result — frontend reports IPC execution outcome
router.post("/games/:slug/report-result", async (req, res) => {
  try {
    const { slug } = req.params;
    const game = getGameBySlug(slug);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const {
      operation,
      actionResults,
      installPath,
      isElectron,
    }: {
      operation: "apply" | "revert";
      actionResults: ActionResult[];
      installPath: string | null;
      isElectron: boolean;
    } = req.body;

    if (!operation || !Array.isArray(actionResults)) {
      return res.status(400).json({ error: "operation and actionResults required" });
    }

    const succeeded = actionResults.filter((a) => a.status === "success").length;
    const failed = actionResults.filter((a) => a.status === "failed").length;

    let status: string;
    if (!isElectron) {
      status = "staged";
    } else if (failed === 0) {
      status = operation === "apply" ? "applied" : "reverted";
    } else if (succeeded > 0) {
      status = "partial";
    } else {
      status = "failed";
    }

    await upsertGameRow(game.slug, game.name, game.executable, !!installPath, installPath);
    await upsertStateRow(slug, status, game.profileId, actionResults, installPath, operation);
    await addHistory(slug, operation, status, {
      actionResults,
      succeeded,
      failed,
      isElectron,
    });

    res.json({ ok: true, status, succeeded, failed });
  } catch (e: any) {
    console.error("[AppBooster] POST /report-result error:", e.message);
    res.status(500).json({ error: "Failed to record result" });
  }
});

// GET /api/app-booster/history — operation history
router.get("/history", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 50);

    if (isNoDbMode || !pool) {
      return res.json({ history: [] });
    }

    const { rows } = await pool.query(
      `SELECT h.id, h.game_slug, h.operation, h.status, h.details, h.created_at,
              g.name as game_name
       FROM app_booster_history h
       LEFT JOIN app_booster_games g ON g.slug = h.game_slug
       ORDER BY h.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      history: rows.map((r) => ({
        id: r.id,
        gameSlug: r.game_slug,
        gameName: r.game_name ?? r.game_slug,
        operation: r.operation,
        status: r.status,
        details: r.details,
        createdAt: r.created_at,
      })),
    });
  } catch (e: any) {
    console.error("[AppBooster] GET /history error:", e.message);
    res.status(500).json({ error: "Failed to load history" });
  }
});

export default router;
