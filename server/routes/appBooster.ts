import { Router, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db, isNoDbMode } from "../db";
import {
  SUPPORTED_GAMES,
  buildActionsForGame,
  getGameBySlug,
  PROFILES,
} from "../lib/appBoosterProfiles";
import { runAllDetectors } from "../lib/gameDetection/index";

const router = Router();

// ── In-memory state cache (fallback when DB is unavailable) ───────────────────
// Keys are `${userId}:${slug}` to ensure per-user isolation.

interface MemGameRow {
  slug: string;
  name: string;
  executable: string;
  detected: boolean;
  installPath: string | null;
  launcher: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  confidence: string | null;
  addedAt: string;
}

interface MemStateRow {
  status: string;
  profileId: string | null;
  actionsResult: ActionResult[];
  installPath: string | null;
  appliedAt: string | null;
  revertedAt: string | null;
  updatedAt: string;
}

const memGames  = new Map<string, MemGameRow>();   // key: `${userId}:${slug}`
const memStates = new Map<string, MemStateRow>();  // key: `${userId}:${slug}`

function memKey(userId: string, slug: string) { return `${userId}:${slug}`; }

function getUserId(req: Request): string {
  return (req as any).cloudUser?.id ?? '__legacy__';
}

// ── DB init and safe migration ────────────────────────────────────────────────
//
// Designed to be safe on both fresh and existing production databases.
// Each step is idempotent; individual step failures are logged but do not
// abort the rest of the migration.

async function runStep(label: string, query: string): Promise<boolean> {
  try {
    await db.execute(sql.raw(query));
    return true;
  } catch (e: any) {
    console.warn(`[AppBooster] migration step "${label}" skipped: ${e.message}`);
    return false;
  }
}

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const { rows } = await db.execute(sql.raw(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = '${table}' AND column_name = '${column}'
    `));
    return rows.length > 0;
  } catch { return false; }
}

async function constraintExists(name: string): Promise<boolean> {
  try {
    const { rows } = await db.execute(sql.raw(`
      SELECT 1 FROM pg_constraint WHERE conname = '${name}' AND contype = 'p'
    `));
    return rows.length > 0;
  } catch { return false; }
}

async function initTables() {
  if (isNoDbMode || !db) return;

  // ── Create tables (new deployments get the correct schema immediately) ──────

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_booster_games (
      user_id       TEXT NOT NULL DEFAULT '__legacy__',
      slug          TEXT NOT NULL,
      name          TEXT NOT NULL,
      executable    TEXT NOT NULL,
      install_path  TEXT,
      detected      BOOLEAN NOT NULL DEFAULT FALSE,
      launcher      TEXT,
      logo_url      TEXT,
      cover_url     TEXT,
      confidence    TEXT,
      added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, slug)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_booster_state (
      user_id        TEXT NOT NULL DEFAULT '__legacy__',
      game_slug      TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'idle',
      profile_id     TEXT,
      applied_at     TIMESTAMPTZ,
      reverted_at    TIMESTAMPTZ,
      actions_result JSONB NOT NULL DEFAULT '[]',
      install_path   TEXT,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, game_slug)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_booster_history (
      id          SERIAL PRIMARY KEY,
      user_id     TEXT NOT NULL DEFAULT '__legacy__',
      game_slug   TEXT NOT NULL,
      operation   TEXT NOT NULL,
      status      TEXT NOT NULL,
      details     JSONB NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── Optional columns added in later releases ────────────────────────────────

  for (const col of ['launcher', 'logo_url', 'cover_url', 'confidence']) {
    await runStep(`add ${col} to app_booster_games`,
      `ALTER TABLE app_booster_games ADD COLUMN IF NOT EXISTS ${col} TEXT`);
  }

  // ── Per-user migration: app_booster_games ───────────────────────────────────
  // Step 1: add nullable column (safe on tables with existing rows)
  if (!(await columnExists('app_booster_games', 'user_id'))) {
    await runStep('app_booster_games: add nullable user_id',
      `ALTER TABLE app_booster_games ADD COLUMN user_id TEXT`);
    // Step 2: backfill existing rows
    await runStep('app_booster_games: backfill user_id',
      `UPDATE app_booster_games SET user_id = '__legacy__' WHERE user_id IS NULL`);
    // Step 3: enforce NOT NULL
    await runStep('app_booster_games: set user_id NOT NULL',
      `ALTER TABLE app_booster_games ALTER COLUMN user_id SET NOT NULL`);
  }
  // Step 4: migrate PK from (slug) → (user_id, slug) when old single-col PK still exists
  if (await constraintExists('app_booster_games_pkey')) {
    await runStep('app_booster_games: drop old PK',
      `ALTER TABLE app_booster_games DROP CONSTRAINT app_booster_games_pkey`);
    await runStep('app_booster_games: add composite PK',
      `ALTER TABLE app_booster_games ADD PRIMARY KEY (user_id, slug)`);
  }

  // ── Per-user migration: app_booster_state ───────────────────────────────────
  // Step 1: add nullable column (safe on tables with existing rows)
  if (!(await columnExists('app_booster_state', 'user_id'))) {
    await runStep('app_booster_state: add nullable user_id',
      `ALTER TABLE app_booster_state ADD COLUMN user_id TEXT`);
    // Step 2: backfill existing rows
    await runStep('app_booster_state: backfill user_id',
      `UPDATE app_booster_state SET user_id = '__legacy__' WHERE user_id IS NULL`);
    // Step 3: enforce NOT NULL
    await runStep('app_booster_state: set user_id NOT NULL',
      `ALTER TABLE app_booster_state ALTER COLUMN user_id SET NOT NULL`);
  }
  // Step 4: migrate PK from (game_slug) → (user_id, game_slug)
  if (await constraintExists('app_booster_state_pkey')) {
    await runStep('app_booster_state: drop old PK',
      `ALTER TABLE app_booster_state DROP CONSTRAINT app_booster_state_pkey`);
    await runStep('app_booster_state: add composite PK',
      `ALTER TABLE app_booster_state ADD PRIMARY KEY (user_id, game_slug)`);
  }

  // ── Per-user migration: app_booster_history ─────────────────────────────────
  if (!(await columnExists('app_booster_history', 'user_id'))) {
    await runStep('app_booster_history: add nullable user_id',
      `ALTER TABLE app_booster_history ADD COLUMN user_id TEXT`);
    await runStep('app_booster_history: backfill user_id',
      `UPDATE app_booster_history SET user_id = '__legacy__' WHERE user_id IS NULL`);
    await runStep('app_booster_history: set user_id NOT NULL',
      `ALTER TABLE app_booster_history ALTER COLUMN user_id SET NOT NULL`);
  }

  console.log('[AppBooster] tables ready');
}

initTables().catch((e) =>
  console.error("[AppBooster] table init failed:", e.message)
);

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getState(userId: string, slug: string): Promise<GameState | null> {
  const game = getGameBySlug(slug);
  if (!game) return null;

  const key = memKey(userId, slug);
  const memGame  = memGames.get(key);
  const memState = memStates.get(key);

  const defaultState: GameState = {
    slug: game.slug,
    name: game.name,
    executable: game.executable,
    installPath: memGame?.installPath ?? null,
    detected: memGame?.detected ?? false,
    status: (memState?.status as GameState["status"]) ?? "idle",
    profileId: memState?.profileId ?? null,
    appliedAt: memState?.appliedAt ?? null,
    revertedAt: memState?.revertedAt ?? null,
    actionsResult: memState?.actionsResult ?? [],
    addedAt: memGame?.addedAt ?? new Date().toISOString(),
  };

  if (isNoDbMode || !db) return defaultState;

  try {
    const { rows } = await db.execute(
      sql`SELECT s.status, s.profile_id, s.applied_at, s.reverted_at, s.actions_result, s.install_path,
                 g.detected, g.added_at, g.install_path as g_install_path
          FROM app_booster_state s
          LEFT JOIN app_booster_games g ON g.slug = s.game_slug AND g.user_id = s.user_id
          WHERE s.game_slug = ${slug} AND s.user_id = ${userId}`
    );

    if (rows.length === 0) {
      const gameRow = await db.execute(
        sql`SELECT detected, added_at, install_path FROM app_booster_games WHERE slug = ${slug} AND user_id = ${userId}`
      );
      if (gameRow.rows.length > 0) {
        return {
          ...defaultState,
          detected: (gameRow.rows[0].detected as boolean) || defaultState.detected,
          installPath: (gameRow.rows[0].install_path as string | null) ?? defaultState.installPath,
          addedAt: (gameRow.rows[0].added_at as string) ?? defaultState.addedAt,
        };
      }
      return defaultState;
    }

    const r = rows[0];
    return {
      slug: game.slug,
      name: game.name,
      executable: game.executable,
      installPath: (r.install_path as string | null) ?? (r.g_install_path as string | null) ?? defaultState.installPath,
      detected: ((r.detected as boolean) ?? false) || defaultState.detected,
      status: (r.status as GameState["status"]) ?? defaultState.status,
      profileId: (r.profile_id as string | null) ?? defaultState.profileId,
      appliedAt: (r.applied_at as string | null) ?? defaultState.appliedAt,
      revertedAt: (r.reverted_at as string | null) ?? defaultState.revertedAt,
      actionsResult: (r.actions_result as ActionResult[]) ?? defaultState.actionsResult,
      addedAt: (r.added_at as string) ?? defaultState.addedAt,
    };
  } catch (dbErr: any) {
    console.error(`[AppBooster] getState DB error for ${slug}:`, dbErr.message);
    return defaultState;
  }
}

async function upsertGameRow(
  userId: string,
  slug: string,
  name: string,
  executable: string,
  detected: boolean,
  installPath: string | null,
  extra: { launcher?: string; logoUrl?: string | null; coverUrl?: string | null; confidence?: string } = {}
) {
  const key = memKey(userId, slug);
  const existing = memGames.get(key);
  memGames.set(key, {
    slug,
    name,
    executable,
    detected: detected || (existing?.detected ?? false),
    installPath: installPath ?? existing?.installPath ?? null,
    launcher: extra.launcher ?? existing?.launcher ?? null,
    logoUrl: extra.logoUrl ?? existing?.logoUrl ?? null,
    coverUrl: extra.coverUrl ?? existing?.coverUrl ?? null,
    confidence: extra.confidence ?? existing?.confidence ?? null,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
  });

  if (isNoDbMode || !db) return;
  await db.execute(
    sql`INSERT INTO app_booster_games (user_id, slug, name, executable, detected, install_path, launcher, logo_url, cover_url, confidence)
        VALUES (${userId}, ${slug}, ${name}, ${executable}, ${detected}, ${installPath},
                ${extra.launcher ?? null}, ${extra.logoUrl ?? null}, ${extra.coverUrl ?? null}, ${extra.confidence ?? null})
        ON CONFLICT (user_id, slug) DO UPDATE SET
          detected     = CASE WHEN EXCLUDED.detected THEN EXCLUDED.detected ELSE app_booster_games.detected END,
          install_path = COALESCE(EXCLUDED.install_path, app_booster_games.install_path),
          launcher     = COALESCE(EXCLUDED.launcher, app_booster_games.launcher),
          logo_url     = COALESCE(EXCLUDED.logo_url, app_booster_games.logo_url),
          cover_url    = COALESCE(EXCLUDED.cover_url, app_booster_games.cover_url),
          confidence   = COALESCE(EXCLUDED.confidence, app_booster_games.confidence)`
  );
}

async function upsertStateRow(
  userId: string,
  slug: string,
  status: string,
  profileId: string | null,
  actionsResult: ActionResult[],
  installPath: string | null,
  operation: "apply" | "revert" | "none" = "none"
) {
  const now = new Date();
  const key = memKey(userId, slug);
  const existing = memStates.get(key);
  memStates.set(key, {
    status,
    profileId: profileId ?? existing?.profileId ?? null,
    actionsResult,
    installPath: installPath ?? existing?.installPath ?? null,
    appliedAt:   operation === "apply"  ? now.toISOString() : existing?.appliedAt ?? null,
    revertedAt:  operation === "revert" ? now.toISOString() : existing?.revertedAt ?? null,
    updatedAt:   now.toISOString(),
  });
  console.log(`[AppBooster] memStates.set(${userId}:${slug}, status=${status}, op=${operation})`);

  if (isNoDbMode || !db) return;
  const json = JSON.stringify(actionsResult);

  if (operation === "apply") {
    await db.execute(
      sql`INSERT INTO app_booster_state
            (user_id, game_slug, status, profile_id, actions_result, install_path, applied_at, updated_at)
          VALUES (${userId}, ${slug}, ${status}, ${profileId}, cast(${json} as jsonb), ${installPath}, ${now}, ${now})
          ON CONFLICT (user_id, game_slug) DO UPDATE SET
            status         = EXCLUDED.status,
            profile_id     = COALESCE(EXCLUDED.profile_id, app_booster_state.profile_id),
            actions_result = EXCLUDED.actions_result,
            install_path   = COALESCE(EXCLUDED.install_path, app_booster_state.install_path),
            applied_at     = EXCLUDED.applied_at,
            updated_at     = EXCLUDED.updated_at`
    );
  } else if (operation === "revert") {
    await db.execute(
      sql`INSERT INTO app_booster_state
            (user_id, game_slug, status, profile_id, actions_result, install_path, reverted_at, updated_at)
          VALUES (${userId}, ${slug}, ${status}, ${profileId}, cast(${json} as jsonb), ${installPath}, ${now}, ${now})
          ON CONFLICT (user_id, game_slug) DO UPDATE SET
            status         = EXCLUDED.status,
            actions_result = EXCLUDED.actions_result,
            install_path   = COALESCE(EXCLUDED.install_path, app_booster_state.install_path),
            reverted_at    = EXCLUDED.reverted_at,
            updated_at     = EXCLUDED.updated_at`
    );
  } else {
    await db.execute(
      sql`INSERT INTO app_booster_state
            (user_id, game_slug, status, profile_id, actions_result, install_path, updated_at)
          VALUES (${userId}, ${slug}, ${status}, ${profileId}, cast(${json} as jsonb), ${installPath}, ${now})
          ON CONFLICT (user_id, game_slug) DO UPDATE SET
            status         = EXCLUDED.status,
            profile_id     = COALESCE(EXCLUDED.profile_id, app_booster_state.profile_id),
            actions_result = EXCLUDED.actions_result,
            install_path   = COALESCE(EXCLUDED.install_path, app_booster_state.install_path),
            updated_at     = EXCLUDED.updated_at`
    );
  }
}

async function addHistory(userId: string, slug: string, operation: string, status: string, details: object) {
  if (isNoDbMode || !db) return;
  const json = JSON.stringify(details);
  await db.execute(
    sql`INSERT INTO app_booster_history (user_id, game_slug, operation, status, details)
        VALUES (${userId}, ${slug}, ${operation}, ${status}, cast(${json} as jsonb))`
  );
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/app-booster/games — full catalog with per-game install state
router.get("/games", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const stateMap: Record<
    string,
    {
      status: string;
      profileId: string | null;
      detected: boolean;
      installPath: string | null;
      launcher: string | null;
      logoUrl: string | null;
      coverUrl: string | null;
    }
  > = {};

  // Seed from per-user in-memory cache
  for (const [key, memGame] of memGames.entries()) {
    if (!key.startsWith(`${userId}:`)) continue;
    const slug = key.slice(userId.length + 1);
    const memState = memStates.get(memKey(userId, slug));
    stateMap[slug] = {
      status: memState?.status ?? "idle",
      profileId: memState?.profileId ?? null,
      detected: memGame.detected,
      installPath: memState?.installPath ?? memGame.installPath ?? null,
      launcher: memGame.launcher ?? null,
      logoUrl: memGame.logoUrl ?? null,
      coverUrl: memGame.coverUrl ?? null,
    };
  }

  if (!isNoDbMode && db) {
    try {
      const { rows } = await db.execute(sql`
        SELECT g.slug, g.detected, g.install_path, g.launcher, g.logo_url, g.cover_url,
               s.status, s.profile_id
        FROM app_booster_games g
        LEFT JOIN app_booster_state s ON s.game_slug = g.slug AND s.user_id = g.user_id
        WHERE g.user_id = ${userId}
      `);
      for (const r of rows) {
        const existing = stateMap[r.slug as string];
        stateMap[r.slug as string] = {
          status: (r.status as string) ?? existing?.status ?? "idle",
          profileId: (r.profile_id as string | null) ?? existing?.profileId ?? null,
          detected: ((r.detected as boolean) ?? false) || (existing?.detected ?? false),
          installPath: (r.install_path as string | null) ?? existing?.installPath ?? null,
          launcher: (r.launcher as string | null) ?? existing?.launcher ?? null,
          logoUrl: (r.logo_url as string | null) ?? existing?.logoUrl ?? null,
          coverUrl: (r.cover_url as string | null) ?? existing?.coverUrl ?? null,
        };
      }
    } catch (dbErr: any) {
      console.error("[AppBooster] DB state query failed:", dbErr.message);
    }
  }

  try {
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
        launcher: s?.launcher ?? null,
        logoUrl: g.logoUrl ?? s?.logoUrl ?? null,
        coverUrl: g.coverUrl ?? s?.coverUrl ?? null,
        actionCount: buildActionsForGame(g, null).length,
        knownPaths: g.knownPaths,
      };
    });

    const installedCount = result.filter((g) => g.detected).length;
    console.log(`[AppBooster] GET /games userId=${userId} — catalog: ${result.length}, installed: ${installedCount}`);
    res.json({ games: result });
  } catch (e: any) {
    console.error("[AppBooster] GET /games mapping error:", e.message);
    res.status(500).json({ error: "Failed to build game list" });
  }
});

// POST /api/app-booster/games/scan — receive scan results from Electron client
router.post("/games/scan", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  try {
    const { results } = req.body as {
      results: Array<{
        slug: string;
        detected: boolean;
        installPath: string | null;
        launcher?: string;
        logoUrl?: string | null;
        coverUrl?: string | null;
        confidence?: string;
        source?: string;
      }>;
    };

    if (!Array.isArray(results)) {
      return res.status(400).json({ error: "results array required" });
    }

    console.log(`[AppBooster] POST /games/scan userId=${userId} — ${results.length} result(s), ${results.filter((r) => r.detected).length} detected`);

    for (const r of results) {
      const game = getGameBySlug(r.slug);
      if (!game) continue;
      await upsertGameRow(userId, game.slug, game.name, game.executable, r.detected, r.installPath, {
        launcher: r.launcher,
        logoUrl: r.logoUrl,
        coverUrl: r.coverUrl,
        confidence: r.confidence,
      });
    }

    await addHistory(userId, "system", "scan", "success", {
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

// POST /api/app-booster/detect — run the server-side multi-launcher detection pipeline
router.post("/detect", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  console.log(`[AppBooster] POST /detect userId=${userId} — starting server-side detection pipeline`);
  try {
    const report = await runAllDetectors();

    for (const game of report.normalized) {
      const catalog = getGameBySlug(game.normalizedName) ?? getGameBySlug(game.id.replace(/^(steam|epic|xbox)_/, ""));
      if (!catalog) continue;

      await upsertGameRow(
        userId,
        catalog.slug,
        catalog.name,
        catalog.executable,
        true,
        game.installPath,
        {
          launcher: game.launcher,
          logoUrl: game.logoUrl ?? catalog.logoUrl ?? null,
          coverUrl: game.coverUrl ?? catalog.coverUrl ?? null,
          confidence: game.confidence,
        }
      );
    }

    await addHistory(userId, "system", "detect", "success", {
      platform: process.platform,
      totalInstalled: report.totalInstalled,
      steamCount: report.results.find((r) => r.launcher === "steam")?.games.length ?? 0,
      epicCount:  report.results.find((r) => r.launcher === "epic")?.games.length ?? 0,
      xboxCount:  report.results.find((r) => r.launcher === "xbox")?.games.length ?? 0,
    });

    res.json({
      ok: true,
      platformSupported: report.platformSupported,
      scannedAt: report.scannedAt,
      totalInstalled: report.totalInstalled,
      perLauncher: report.results.map((r) => ({
        launcher: r.launcher,
        count: r.games.length,
        error: r.error,
        durationMs: r.scanDurationMs,
      })),
      games: report.normalized,
    });
  } catch (e: any) {
    console.error("[AppBooster] POST /detect error:", e.message);
    res.status(500).json({ error: "Detection pipeline failed", detail: e.message });
  }
});

// GET /api/app-booster/installed — only installed (detected) games, enriched
router.get("/installed", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  try {
    if (isNoDbMode || !db) return res.json({ games: [], total: 0 });

    const { rows } = await db.execute(sql`
      SELECT g.slug, g.name, g.detected, g.install_path, g.launcher, g.logo_url, g.cover_url, g.confidence,
             s.status, s.profile_id, s.applied_at, s.updated_at
      FROM app_booster_games g
      LEFT JOIN app_booster_state s ON s.game_slug = g.slug AND s.user_id = g.user_id
      WHERE g.detected = TRUE AND g.user_id = ${userId}
      ORDER BY s.updated_at DESC NULLS LAST
    `);

    const games = rows.map((r) => {
      const meta = getGameBySlug(r.slug as string);
      return {
        slug: r.slug,
        name: r.name ?? meta?.name,
        launcher: r.launcher ?? "unknown",
        installPath: r.install_path,
        logoUrl: r.logo_url ?? meta?.logoUrl ?? null,
        coverUrl: r.cover_url ?? meta?.coverUrl ?? null,
        confidence: r.confidence ?? "probable",
        status: r.status ?? "idle",
        profileId: r.profile_id,
        appliedAt: r.applied_at,
        profileName: meta ? (PROFILES[meta.profileId]?.name ?? null) : null,
        genre: meta?.genre ?? null,
        publisher: meta?.publisher ?? null,
      };
    });

    console.log(`[AppBooster] GET /installed userId=${userId} — ${games.length} installed game(s)`);
    res.json({ games, total: games.length });
  } catch (e: any) {
    console.error("[AppBooster] GET /installed error:", e.message);
    res.status(500).json({ error: "Failed to load installed games" });
  }
});

// GET /api/app-booster/games/:slug/status — full state for one game
router.get("/games/:slug/status", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  try {
    const { slug } = req.params;
    const state = await getState(userId, slug);
    if (!state) return res.status(404).json({ error: "Game not found" });

    const game = getGameBySlug(slug)!;
    const profile = PROFILES[game.profileId] ?? null;
    const actions = buildActionsForGame(game, state.installPath);

    res.json({
      ...state,
      profile,
      actions,
      logoUrl:   game.logoUrl   ?? null,
      coverUrl:  game.coverUrl  ?? null,
      publisher: game.publisher ?? null,
      genre:     game.genre     ?? null,
    });
  } catch (e: any) {
    console.error("[AppBooster] GET /status error:", e.message);
    res.status(500).json({ error: "Failed to load game status" });
  }
});

// POST /api/app-booster/games/:slug/apply
router.post("/games/:slug/apply", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  try {
    const { slug } = req.params;
    const game = getGameBySlug(slug);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const installPath: string | null = req.body?.installPath ?? null;
    await upsertGameRow(userId, game.slug, game.name, game.executable, !!installPath, installPath);

    const actions = buildActionsForGame(game, installPath);
    const profile = PROFILES[game.profileId];

    res.json({ ok: true, slug, profileId: game.profileId, profile, actions, installPath });
  } catch (e: any) {
    console.error("[AppBooster] POST /apply error:", e.message);
    res.status(500).json({ error: "Failed to prepare profile" });
  }
});

// POST /api/app-booster/games/:slug/revert
router.post("/games/:slug/revert", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  try {
    const { slug } = req.params;
    const game = getGameBySlug(slug);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const state = await getState(userId, slug);
    const installPath = req.body?.installPath ?? state?.installPath ?? null;
    const actions = buildActionsForGame(game, installPath);

    res.json({ ok: true, slug, actions, installPath });
  } catch (e: any) {
    console.error("[AppBooster] POST /revert error:", e.message);
    res.status(500).json({ error: "Failed to prepare revert" });
  }
});

// POST /api/app-booster/games/:slug/report-result
router.post("/games/:slug/report-result", async (req: Request, res: Response) => {
  const userId = getUserId(req);
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
    const failed    = actionResults.filter((a) => a.status === "failed").length;

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

    await upsertGameRow(userId, game.slug, game.name, game.executable, !!installPath, installPath);
    await upsertStateRow(userId, slug, status, game.profileId, actionResults, installPath, operation);
    await addHistory(userId, slug, operation, status, { actionResults, succeeded, failed, isElectron });

    res.json({ ok: true, status, succeeded, failed });
  } catch (e: any) {
    console.error("[AppBooster] POST /report-result error:", e.message);
    res.status(500).json({ error: "Failed to record result" });
  }
});

// GET /api/app-booster/history
router.get("/history", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 50);

    if (isNoDbMode || !db) return res.json({ history: [] });

    const { rows } = await db.execute(
      sql`SELECT h.id, h.game_slug, h.operation, h.status, h.details, h.created_at,
               g.name as game_name
          FROM app_booster_history h
          LEFT JOIN app_booster_games g ON g.slug = h.game_slug AND g.user_id = h.user_id
          WHERE h.user_id = ${userId}
          ORDER BY h.created_at DESC
          LIMIT ${limit}`
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
