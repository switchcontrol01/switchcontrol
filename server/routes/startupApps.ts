import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, isNoDbMode } from "../db";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

export type StartupPhase = "immediate" | "delayed-30s" | "delayed-60s" | "delayed-idle" | "disabled";
export type StartupCategory = "system" | "drivers" | "gaming" | "communication" | "cloud" | "launchers" | "updaters" | "security" | "unknown";
export type StartupImpact = "critical" | "high" | "medium" | "low";

interface StartupSeedItem {
  id: string;
  name: string;
  publisher: string;
  category: StartupCategory;
  defaultPhase: StartupPhase;
  estimatedRamMb: number;
  estimatedCpuSpike: number;
  estimatedBootSec: number;
  impact: StartupImpact;
  safeToDisable: boolean;
  systemCritical: boolean;
  description: string;
  registryKey?: string;
  executable?: string;
}

interface StartupAppState extends StartupSeedItem {
  phase: StartupPhase;
  overridden: boolean;
  source: "registry-hkcu" | "registry-hklm" | "startup-folder" | "task-scheduler" | "electron-scan" | "seed";
  verificationStatus: "verified" | "pending" | "failed" | "unsupported" | "unknown";
  lastChanged?: string;
}

// ── Known-apps registry ────────────────────────────────────────────────────────
// Conservative, grounded estimates. RAM/CPU from typical measurements.
// Boot seconds = rough WMI startup time contribution.

const STARTUP_SEED: StartupSeedItem[] = [
  {
    id: "windows_security",
    name: "Windows Security",
    publisher: "Microsoft Corporation",
    category: "security",
    defaultPhase: "immediate",
    estimatedRamMb: 60,
    estimatedCpuSpike: 2,
    estimatedBootSec: 0.9,
    impact: "low",
    safeToDisable: false,
    systemCritical: true,
    description: "Windows Defender and system protection notifications",
    registryKey: "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
    executable: "SecurityHealthSystray.exe",
  },
  {
    id: "realtek_audio",
    name: "Realtek Audio Console",
    publisher: "Realtek Semiconductor",
    category: "drivers",
    defaultPhase: "immediate",
    estimatedRamMb: 42,
    estimatedCpuSpike: 3,
    estimatedBootSec: 1.2,
    impact: "low",
    safeToDisable: false,
    systemCritical: false,
    description: "Audio driver management interface. Disabling removes the tray icon; audio still works.",
    registryKey: "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
    executable: "RtkAudUService64.exe",
  },
  {
    id: "nvidia_share",
    name: "NVIDIA Share",
    publisher: "NVIDIA Corporation",
    category: "drivers",
    defaultPhase: "immediate",
    estimatedRamMb: 120,
    estimatedCpuSpike: 8,
    estimatedBootSec: 2.1,
    impact: "medium",
    safeToDisable: true,
    systemCritical: false,
    description: "ShadowPlay overlay and screen recording. Delaying saves ~120MB at boot.",
    registryKey: "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
    executable: "nvsphelper64.exe",
  },
  {
    id: "corsair_icue",
    name: "Corsair iCUE",
    publisher: "Corsair Gaming",
    category: "drivers",
    defaultPhase: "immediate",
    estimatedRamMb: 200,
    estimatedCpuSpike: 12,
    estimatedBootSec: 2.5,
    impact: "high",
    safeToDisable: true,
    systemCritical: false,
    description: "Peripheral RGB and profile management. High RAM footprint; delay recommended.",
    executable: "iCUE.exe",
  },
  {
    id: "rgb_lighting",
    name: "RGB Lighting Control",
    publisher: "Various",
    category: "drivers",
    defaultPhase: "immediate",
    estimatedRamMb: 80,
    estimatedCpuSpike: 5,
    estimatedBootSec: 1.5,
    impact: "low",
    safeToDisable: true,
    systemCritical: false,
    description: "Keyboard/mouse lighting effects. Non-essential at boot.",
  },
  {
    id: "discord",
    name: "Discord",
    publisher: "Discord Inc.",
    category: "communication",
    defaultPhase: "immediate",
    estimatedRamMb: 280,
    estimatedCpuSpike: 15,
    estimatedBootSec: 3.2,
    impact: "high",
    safeToDisable: true,
    systemCritical: false,
    description: "Chat, voice, and overlay. One of the heaviest startup items.",
    registryKey: "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
    executable: "Discord.exe",
  },
  {
    id: "spotify",
    name: "Spotify",
    publisher: "Spotify AB",
    category: "communication",
    defaultPhase: "immediate",
    estimatedRamMb: 200,
    estimatedCpuSpike: 10,
    estimatedBootSec: 2.8,
    impact: "medium",
    safeToDisable: true,
    systemCritical: false,
    description: "Music streaming. Not needed at boot for most users.",
    registryKey: "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
    executable: "Spotify.exe",
  },
  {
    id: "steam",
    name: "Steam Client",
    publisher: "Valve Corporation",
    category: "launchers",
    defaultPhase: "immediate",
    estimatedRamMb: 180,
    estimatedCpuSpike: 12,
    estimatedBootSec: 4.5,
    impact: "high",
    safeToDisable: true,
    systemCritical: false,
    description: "Game launcher and store. Open only when gaming.",
    registryKey: "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
    executable: "steam.exe",
  },
  {
    id: "epic_games",
    name: "Epic Games Launcher",
    publisher: "Epic Games",
    category: "launchers",
    defaultPhase: "immediate",
    estimatedRamMb: 160,
    estimatedCpuSpike: 10,
    estimatedBootSec: 3.8,
    impact: "high",
    safeToDisable: true,
    systemCritical: false,
    description: "Game launcher with aggressive background activity. Delay or disable.",
    executable: "EpicGamesLauncher.exe",
  },
  {
    id: "battle_net",
    name: "Battle.net",
    publisher: "Blizzard Entertainment",
    category: "launchers",
    defaultPhase: "disabled",
    estimatedRamMb: 140,
    estimatedCpuSpike: 8,
    estimatedBootSec: 3.0,
    impact: "medium",
    safeToDisable: true,
    systemCritical: false,
    description: "Blizzard game launcher. Open manually when playing Blizzard titles.",
    executable: "Battle.net.exe",
  },
  {
    id: "onedrive",
    name: "Microsoft OneDrive",
    publisher: "Microsoft Corporation",
    category: "cloud",
    defaultPhase: "delayed-30s",
    estimatedRamMb: 150,
    estimatedCpuSpike: 8,
    estimatedBootSec: 3.0,
    impact: "medium",
    safeToDisable: true,
    systemCritical: false,
    description: "Cloud file sync. Delaying avoids boot-time disk I/O contention.",
    registryKey: "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
    executable: "OneDrive.exe",
  },
  {
    id: "chrome_updater",
    name: "Google Chrome Updater",
    publisher: "Google LLC",
    category: "updaters",
    defaultPhase: "delayed-idle",
    estimatedRamMb: 30,
    estimatedCpuSpike: 3,
    estimatedBootSec: 0.5,
    impact: "low",
    safeToDisable: true,
    systemCritical: false,
    description: "Browser update service. Runs fine on idle — no need for immediate boot.",
    executable: "GoogleUpdate.exe",
  },
  {
    id: "java_updater",
    name: "Java Update Scheduler",
    publisher: "Oracle Corporation",
    category: "updaters",
    defaultPhase: "disabled",
    estimatedRamMb: 50,
    estimatedCpuSpike: 5,
    estimatedBootSec: 0.8,
    impact: "low",
    safeToDisable: true,
    systemCritical: false,
    description: "Java runtime updater. Usually safe to disable; Java still works.",
    executable: "jusched.exe",
  },
  {
    id: "unknown_app",
    name: "UnknownHelper.exe",
    publisher: "Unknown",
    category: "unknown",
    defaultPhase: "immediate",
    estimatedRamMb: 60,
    estimatedCpuSpike: 4,
    estimatedBootSec: 1.0,
    impact: "medium",
    safeToDisable: true,
    systemCritical: false,
    description: "Unknown startup program. Verify publisher before disabling.",
    source: "seed" as any,
  },
];

// ── Startup Profiles ──────────────────────────────────────────────────────────

const STARTUP_PROFILES: Record<string, {
  name: string;
  description: string;
  overrides: Record<string, StartupPhase>;
}> = {
  gaming: {
    name: "Gaming Startup",
    description: "Maximises system resources at boot. Delays communication and cloud apps by 30s.",
    overrides: {
      windows_security: "immediate",
      realtek_audio: "immediate",
      nvidia_share: "immediate",
      corsair_icue: "delayed-30s",
      rgb_lighting: "immediate",
      discord: "delayed-30s",
      spotify: "delayed-60s",
      steam: "immediate",
      epic_games: "delayed-30s",
      battle_net: "disabled",
      onedrive: "delayed-60s",
      chrome_updater: "delayed-idle",
      java_updater: "disabled",
      unknown_app: "disabled",
    },
  },
  minimal: {
    name: "Minimal Boot",
    description: "Fastest possible boot. Only drivers and security run at startup.",
    overrides: {
      windows_security: "immediate",
      realtek_audio: "immediate",
      nvidia_share: "disabled",
      corsair_icue: "disabled",
      rgb_lighting: "disabled",
      discord: "disabled",
      spotify: "disabled",
      steam: "disabled",
      epic_games: "disabled",
      battle_net: "disabled",
      onedrive: "delayed-idle",
      chrome_updater: "disabled",
      java_updater: "disabled",
      unknown_app: "disabled",
    },
  },
  creator: {
    name: "Creator Boot",
    description: "Optimised for streaming and content creation. Keeps audio and communication apps ready.",
    overrides: {
      windows_security: "immediate",
      realtek_audio: "immediate",
      nvidia_share: "immediate",
      corsair_icue: "delayed-30s",
      rgb_lighting: "delayed-30s",
      discord: "delayed-30s",
      spotify: "immediate",
      steam: "disabled",
      epic_games: "disabled",
      battle_net: "disabled",
      onedrive: "delayed-30s",
      chrome_updater: "delayed-idle",
      java_updater: "disabled",
      unknown_app: "disabled",
    },
  },
  laptop: {
    name: "Laptop / Battery",
    description: "Reduces background CPU and disk activity to preserve battery life.",
    overrides: {
      windows_security: "immediate",
      realtek_audio: "immediate",
      nvidia_share: "disabled",
      corsair_icue: "disabled",
      rgb_lighting: "disabled",
      discord: "delayed-60s",
      spotify: "disabled",
      steam: "disabled",
      epic_games: "disabled",
      battle_net: "disabled",
      onedrive: "delayed-idle",
      chrome_updater: "delayed-idle",
      java_updater: "disabled",
      unknown_app: "disabled",
    },
  },
  default: {
    name: "Default Windows",
    description: "Restores all apps to their default startup state.",
    overrides: {},
  },
};

// ── DB init ───────────────────────────────────────────────────────────────────

async function initTables() {
  if (isNoDbMode || !db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_app_overrides (
      app_id        TEXT PRIMARY KEY,
      phase         TEXT NOT NULL DEFAULT 'immediate',
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_history (
      id            SERIAL PRIMARY KEY,
      app_id        TEXT NOT NULL,
      app_name      TEXT NOT NULL,
      old_phase     TEXT NOT NULL,
      new_phase     TEXT NOT NULL,
      profile_id    TEXT,
      source        TEXT NOT NULL DEFAULT 'user',
      verification  TEXT NOT NULL DEFAULT 'pending',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

initTables().catch((e) => console.error("[StartupApps] table init failed:", e.message));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOverrides(): Promise<Record<string, StartupPhase>> {
  if (isNoDbMode || !db) return {};
  try {
    const rows = await db.execute<{ app_id: string; phase: string }>(
      sql`SELECT app_id, phase FROM startup_app_overrides`
    );
    const result: Record<string, StartupPhase> = {};
    for (const r of rows.rows) result[r.app_id] = r.phase as StartupPhase;
    return result;
  } catch { return {}; }
}

async function persistOverride(appId: string, phase: StartupPhase): Promise<void> {
  if (isNoDbMode || !db) return;
  await db.execute(sql`
    INSERT INTO startup_app_overrides (app_id, phase, updated_at)
    VALUES (${appId}, ${phase}, NOW())
    ON CONFLICT (app_id) DO UPDATE
    SET phase = EXCLUDED.phase, updated_at = NOW()
  `);
}

async function logHistory(
  appId: string,
  appName: string,
  oldPhase: StartupPhase,
  newPhase: StartupPhase,
  profileId?: string,
  verification = "pending"
): Promise<void> {
  if (isNoDbMode || !db) return;
  await db.execute(sql`
    INSERT INTO startup_history (app_id, app_name, old_phase, new_phase, profile_id, source, verification)
    VALUES (${appId}, ${appName}, ${oldPhase}, ${newPhase},
            ${profileId ?? null}, ${profileId ? "profile" : "user"}, ${verification})
  `);
}

function mergeApps(overrides: Record<string, StartupPhase>): StartupAppState[] {
  return STARTUP_SEED.map((seed) => {
    const phase = overrides[seed.id] !== undefined ? overrides[seed.id] : seed.defaultPhase;
    return {
      ...seed,
      phase,
      overridden: overrides[seed.id] !== undefined,
      source: seed.registryKey
        ? (seed.registryKey.startsWith("HKCU") ? "registry-hkcu" : "registry-hklm")
        : "seed",
      verificationStatus: "unknown",
    };
  });
}

function computeTimeline(apps: StartupAppState[]) {
  const immediate = apps.filter(a => a.phase === "immediate").sort((a, b) => a.estimatedBootSec - b.estimatedBootSec);
  const delayed30 = apps.filter(a => a.phase === "delayed-30s").sort((a, b) => a.estimatedBootSec - b.estimatedBootSec);
  const delayed60 = apps.filter(a => a.phase === "delayed-60s").sort((a, b) => a.estimatedBootSec - b.estimatedBootSec);
  const delayedIdle = apps.filter(a => a.phase === "delayed-idle");
  const disabled = apps.filter(a => a.phase === "disabled");

  const immediateBootTotal = immediate.reduce((s, a) => s + a.estimatedBootSec, 0);
  const totalRamImmediate = immediate.reduce((s, a) => s + a.estimatedRamMb, 0);
  const totalRamDelayed = [...delayed30, ...delayed60, ...delayedIdle].reduce((s, a) => s + a.estimatedRamMb, 0);
  const savedRam = disabled.reduce((s, a) => s + a.estimatedRamMb, 0);

  return {
    immediate,
    delayed30,
    delayed60,
    delayedIdle,
    disabled,
    metrics: {
      immediateBootSec: Math.round(immediateBootTotal * 10) / 10,
      immediateCount: immediate.length,
      delayedCount: delayed30.length + delayed60.length + delayedIdle.length,
      disabledCount: disabled.length,
      totalRamImmediateMb: totalRamImmediate,
      totalRamDelayedMb: totalRamDelayed,
      savedRamMb: savedRam,
    },
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/startup/apps
router.get("/apps", async (req, res) => {
  try {
    const overrides = await getOverrides();
    const apps = mergeApps(overrides);
    const timeline = computeTimeline(apps);
    res.json({ ok: true, apps, timeline, profiles: Object.keys(STARTUP_PROFILES).map(id => ({
      id,
      name: STARTUP_PROFILES[id].name,
      description: STARTUP_PROFILES[id].description,
    })) });
  } catch (e: any) {
    console.error("[StartupApps] GET /apps error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/startup/apps/:id/configure
router.post("/apps/:id/configure", async (req, res) => {
  const { id } = req.params;
  const app = STARTUP_SEED.find(a => a.id === id);
  if (!app) return res.status(404).json({ ok: false, error: "App not found" });
  if (app.systemCritical) return res.status(403).json({ ok: false, error: "System-critical app cannot be modified" });

  const phase = req.body?.phase as StartupPhase;
  const validPhases: StartupPhase[] = ["immediate", "delayed-30s", "delayed-60s", "delayed-idle", "disabled"];
  if (!validPhases.includes(phase)) {
    return res.status(400).json({ ok: false, error: "Invalid phase" });
  }

  try {
    const overrides = await getOverrides();
    const oldPhase: StartupPhase = overrides[id] ?? app.defaultPhase;

    await persistOverride(id, phase);
    await logHistory(id, app.name, oldPhase, phase, undefined, "pending");

    const newOverrides = await getOverrides();
    const apps = mergeApps(newOverrides);
    const timeline = computeTimeline(apps);

    res.json({ ok: true, appId: id, phase, oldPhase, timeline });
  } catch (e: any) {
    console.error("[StartupApps] configure error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/startup/apps/bulk
router.post("/apps/bulk", async (req, res) => {
  const { action, appIds } = req.body as { action: string; appIds?: string[] };
  const overrides = await getOverrides();

  let changes: Array<{ id: string; phase: StartupPhase }> = [];

  if (action === "delay-non-essential") {
    const targets = STARTUP_SEED.filter(a => !a.systemCritical && a.safeToDisable && a.phase !== "delayed-30s");
    changes = targets.map(a => ({ id: a.id, phase: "delayed-30s" as StartupPhase }));
  } else if (action === "disable-safe") {
    const ids = appIds ?? [];
    const targets = STARTUP_SEED.filter(a => ids.includes(a.id) && !a.systemCritical);
    changes = targets.map(a => ({ id: a.id, phase: "disabled" as StartupPhase }));
  } else if (action === "restore-defaults") {
    // Clear all overrides
    if (!isNoDbMode && db) {
      await db.execute(sql`DELETE FROM startup_app_overrides`);
      await db.execute(sql`
        INSERT INTO startup_history (app_id, app_name, old_phase, new_phase, source, verification)
        SELECT app_id, app_id, phase, 'default', 'bulk-restore', 'pending'
        FROM startup_app_overrides
      `);
    }
    const apps = mergeApps({});
    const timeline = computeTimeline(apps);
    return res.json({ ok: true, action, timeline, changed: 0 });
  } else {
    return res.status(400).json({ ok: false, error: "Unknown bulk action" });
  }

  for (const { id, phase } of changes) {
    const app = STARTUP_SEED.find(a => a.id === id);
    if (!app) continue;
    const old: StartupPhase = overrides[id] ?? app.defaultPhase;
    await persistOverride(id, phase);
    await logHistory(id, app.name, old, phase, undefined, "pending");
  }

  const newOverrides = await getOverrides();
  const apps = mergeApps(newOverrides);
  const timeline = computeTimeline(apps);

  res.json({ ok: true, action, changed: changes.length, timeline });
});

// POST /api/startup/profiles/apply
router.post("/profiles/apply", async (req, res) => {
  const { profileId } = req.body as { profileId: string };
  const profile = STARTUP_PROFILES[profileId];
  if (!profile) return res.status(404).json({ ok: false, error: "Profile not found" });

  const overrides = await getOverrides();
  let changed = 0;

  if (profileId === "default") {
    if (!isNoDbMode && db) {
      await db.execute(sql`DELETE FROM startup_app_overrides`);
    }
    changed = STARTUP_SEED.length;
  } else {
    for (const [appId, phase] of Object.entries(profile.overrides)) {
      const app = STARTUP_SEED.find(a => a.id === appId);
      if (!app || app.systemCritical) continue;
      const oldPhase: StartupPhase = overrides[appId] ?? app.defaultPhase;
      if (oldPhase !== phase) {
        await persistOverride(appId, phase as StartupPhase);
        await logHistory(appId, app.name, oldPhase, phase as StartupPhase, profileId, "pending");
        changed++;
      }
    }
  }

  const newOverrides = await getOverrides();
  const apps = mergeApps(newOverrides);
  const timeline = computeTimeline(apps);

  res.json({ ok: true, profileId, profileName: profile.name, changed, timeline });
});

// GET /api/startup/history
router.get("/history", async (req, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, history: [] });
  try {
    const rows = await db.execute<{
      id: number; app_id: string; app_name: string;
      old_phase: string; new_phase: string;
      profile_id: string | null; source: string;
      verification: string; created_at: string;
    }>(sql`SELECT * FROM startup_history ORDER BY created_at DESC LIMIT 50`);
    res.json({ ok: true, history: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
