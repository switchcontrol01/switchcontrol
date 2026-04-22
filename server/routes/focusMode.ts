/**
 * Focus Mode Engine — backend state tracking, DB persistence, action orchestration.
 * State is scoped per authenticated user (userId from requireJwt middleware).
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

// ── DB table auto-creation ─────────────────────────────────────────────────────

async function initFocusTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS focus_sessions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '__legacy__',
        profile_id TEXT NOT NULL,
        settings JSONB NOT NULL,
        applied_state JSONB,
        electron_results JSONB,
        verification JSONB,
        status TEXT NOT NULL DEFAULT 'active',
        activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deactivated_at TIMESTAMPTZ,
        duration_seconds INTEGER,
        bytes_before INTEGER DEFAULT 0,
        trigger_source TEXT DEFAULT 'manual'
      )
    `);
    // Add user_id column to any existing tables that predate this migration
    await db.execute(sql`ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '__legacy__'`);
    console.log('[FocusMode] focus_sessions table ready');
  } catch (e: any) {
    console.error('[FocusMode] table init error:', e.message);
  }
}

initFocusTable();

// ── Per-user in-memory active state ───────────────────────────────────────────
// Keyed by userId to prevent one user from affecting another's session.

interface FocusSettings {
  notifications: boolean;
  overlays: boolean;
  backgroundApps: boolean;
  networkPriority: boolean;
  inputLockdown: boolean;
  powerLock: boolean;
}

interface ActionResult {
  ok: boolean;
  action?: string;
  enabled?: boolean;
  killed?: string[];
  deprioritized?: string[];
  plan?: string;
  error?: string;
  result?: any;
}

interface VerificationResult {
  ok: boolean;
  verified: {
    notificationsOff: boolean | null;
    powerHighPerf: boolean | null;
    inputLocked: boolean | null;
    overlaysRunning: boolean | null;
  };
  raw?: string;
}

interface FocusState {
  sessionId: number | null;
  active: boolean;
  profileId: string;
  settings: FocusSettings;
  appliedState: Record<string, any>;
  electronResults: Record<string, ActionResult>;
  verification: VerificationResult | null;
  activatedAt: Date;
  expiresAt: Date | null;
  triggerSource: string;
}

const activeStates = new Map<string, FocusState>();

function getUserId(req: Request): string | null {
  return (req as any).cloudUser?.id ?? null;
}

// ── Action descriptors ─────────────────────────────────────────────────────────

const ACTION_DESCRIPTIONS: Record<keyof FocusSettings, {
  label: string;
  mechanism: string;
  revertsTo: string;
  safe: boolean;
  requiresAdmin: boolean;
}> = {
  notifications: {
    label: "Disable Notifications",
    mechanism: "Registry: HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PushNotifications\\ToastEnabled = 0",
    revertsTo: "Previous ToastEnabled value restored",
    safe: true,
    requiresAdmin: false,
  },
  overlays: {
    label: "Kill Overlay Processes",
    mechanism: "Stop-Process on DiscordOverlayHelper, GameOverlayUI, GameBar. Auto-restart on next app launch.",
    revertsTo: "Overlays restart automatically when apps relaunch",
    safe: true,
    requiresAdmin: false,
  },
  backgroundApps: {
    label: "Lower Background App Priority",
    mechanism: "PriorityClass = BelowNormal on known non-essential processes",
    revertsTo: "PriorityClass = Normal (no process killed)",
    safe: true,
    requiresAdmin: false,
  },
  networkPriority: {
    label: "Network Priority",
    mechanism: "Marking only — combined with powerLock ensures system is at peak state",
    revertsTo: "No change to make (no registry/API modification)",
    safe: true,
    requiresAdmin: false,
  },
  inputLockdown: {
    label: "Win Key Suppression",
    mechanism: "Registry: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer\\NoWinKeys = 1. Ctrl+Shift+Esc always works.",
    revertsTo: "NoWinKeys = 0",
    safe: true,
    requiresAdmin: false,
  },
  powerLock: {
    label: "High Performance Power Plan",
    mechanism: "powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
    revertsTo: "Previous power plan GUID restored",
    safe: true,
    requiresAdmin: false,
  },
};

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET /api/focus/state
router.get("/state", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const activeState = activeStates.get(userId) ?? null;
  if (!activeState) {
    return res.json({ ok: true, active: false, state: null });
  }

  const now = Date.now();
  const remainingMs = activeState.expiresAt
    ? Math.max(0, activeState.expiresAt.getTime() - now)
    : null;

  res.json({
    ok: true,
    active: true,
    state: {
      profileId: activeState.profileId,
      settings: activeState.settings,
      activatedAt: activeState.activatedAt.toISOString(),
      expiresAt: activeState.expiresAt?.toISOString() ?? null,
      remainingMs,
      triggerSource: activeState.triggerSource,
      electronResults: activeState.electronResults,
      verification: activeState.verification,
    },
  });
});

// GET /api/focus/actions
router.get("/actions", (req: Request, res: Response) => {
  res.json({ ok: true, actions: ACTION_DESCRIPTIONS });
});

// POST /api/focus/enable
router.post("/enable", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const { profileId, settings, durationMinutes, electronResults, appliedState, verification, triggerSource } = req.body;

  if (!profileId || !settings) {
    return res.status(400).json({ ok: false, error: "profileId and settings required" });
  }

  const currentState = activeStates.get(userId);
  if (currentState?.active) {
    return res.status(409).json({ ok: false, error: "Focus Mode already active. Disable first." });
  }

  const activatedAt = new Date();
  const expiresAt = durationMinutes > 0
    ? new Date(activatedAt.getTime() + durationMinutes * 60 * 1000)
    : null;

  const successCount = Object.values(electronResults ?? {}).filter((r: any) => r?.ok).length;
  const totalActions = Object.keys(settings).filter(k => settings[k as keyof FocusSettings]).length;
  const status = electronResults
    ? successCount >= totalActions ? 'active' : successCount > 0 ? 'partial' : 'failed'
    : 'active';

  let sessionId: number | null = null;
  try {
    const row = await db.execute(sql`
      INSERT INTO focus_sessions (
        user_id, profile_id, settings, applied_state, electron_results, verification,
        status, activated_at, duration_seconds, trigger_source
      ) VALUES (
        ${userId},
        ${profileId},
        ${JSON.stringify(settings)}::jsonb,
        ${JSON.stringify(appliedState ?? {})}::jsonb,
        ${JSON.stringify(electronResults ?? {})}::jsonb,
        ${JSON.stringify(verification ?? {})}::jsonb,
        ${status},
        ${activatedAt.toISOString()},
        ${durationMinutes ? durationMinutes * 60 : null},
        ${triggerSource ?? 'manual'}
      )
      RETURNING id
    `);
    sessionId = (row.rows[0] as any)?.id ?? null;
  } catch (e: any) {
    console.error('[FocusMode] DB insert error:', e.message);
  }

  activeStates.set(userId, {
    sessionId,
    active: true,
    profileId,
    settings,
    appliedState: appliedState ?? {},
    electronResults: electronResults ?? {},
    verification: verification ?? null,
    activatedAt,
    expiresAt,
    triggerSource: triggerSource ?? 'manual',
  });

  res.json({
    ok: true,
    sessionId,
    status,
    activatedAt: activatedAt.toISOString(),
    expiresAt: expiresAt?.toISOString() ?? null,
    successCount,
    totalActions,
  });
});

// POST /api/focus/disable
router.post("/disable", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const activeState = activeStates.get(userId);
  const { electronRevertResults, verificationAfterRevert } = req.body;

  if (!activeState?.active) {
    return res.json({ ok: true, message: "Focus Mode was not active" });
  }

  const deactivatedAt = new Date();
  const sessionId = activeState.sessionId;

  const successCount = Object.values(electronRevertResults ?? {}).filter((r: any) => r?.ok).length;
  const revertStatus = electronRevertResults
    ? successCount > 0 ? 'reverted' : 'revert_failed'
    : 'reverted';

  if (sessionId) {
    try {
      await db.execute(sql`
        UPDATE focus_sessions SET
          status = ${revertStatus},
          deactivated_at = ${deactivatedAt.toISOString()},
          duration_seconds = ${Math.round((deactivatedAt.getTime() - activeState.activatedAt.getTime()) / 1000)}
        WHERE id = ${sessionId} AND user_id = ${userId}
      `);
    } catch (e: any) {
      console.error('[FocusMode] DB update error:', e.message);
    }
  }

  const previousSettings = activeState.settings;
  activeStates.delete(userId);

  res.json({
    ok: true,
    status: revertStatus,
    deactivatedAt: deactivatedAt.toISOString(),
    previousSettings,
  });
});

// GET /api/focus/history
router.get("/history", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

  try {
    const rows = await db.execute(sql`
      SELECT id, profile_id, settings, status, activated_at, deactivated_at,
             duration_seconds, trigger_source, electron_results
      FROM focus_sessions
      WHERE user_id = ${userId}
      ORDER BY activated_at DESC
      LIMIT 20
    `);
    res.json({ ok: true, history: rows.rows });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, history: [] });
  }
});

// POST /api/focus/verify
router.post("/verify", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const { electronVerification } = req.body;
  const state = activeStates.get(userId) ?? null;
  if (!state) return res.json({ ok: true, active: false });

  res.json({
    ok: true,
    active: true,
    verification: electronVerification ?? state.verification,
    settings: state.settings,
  });
});

// POST /api/focus/trigger-fired
router.post("/trigger-fired", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const { triggerId, meta } = req.body;
  console.log(`[FocusMode] Trigger fired: ${triggerId} userId=${userId}`, meta);
  res.json({ ok: true, triggerId, meta });
});

export default router;
