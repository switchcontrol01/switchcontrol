import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, isNoDbMode } from "../db";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

export type SystemRole = "gaming" | "streaming" | "workstation" | "laptop" | "minimal";
export type DebloatLevel = "safe" | "balanced" | "aggressive" | "extreme";
export type SafetyTier = "safe" | "medium" | "high";
export type ItemType = "appx" | "registry" | "service";
export type DebloatCategory = "consumer-apps" | "telemetry" | "gaming" | "cloud" | "system-services" | "shell-features";

export type ResultStatus =
  | "removed" | "restored" | "already-absent" | "already-present"
  | "failed" | "verification-failed" | "unsupported" | "partial";

interface RemovalDef {
  method: "appx" | "registry" | "service";
  packageName?: string;       // appx
  serviceName?: string;       // service
  regPath?: string;           // registry
  regName?: string;
  regValueDisabled?: number | string;
  requiresAdmin: boolean;
  requiresRestart: boolean;
  requiresSignOut: boolean;
}

interface RestoreDef {
  supported: boolean;
  method?: "appx-store" | "appx-provisioned" | "registry" | "service";
  packageName?: string;
  regValueDefault?: number | string;
  serviceName?: string;
  defaultStartType?: string;
  notes?: string;
}

interface VerificationDef {
  method: "appx-query" | "registry-read" | "service-query";
  packageName?: string;
  regPath?: string;
  regName?: string;
  expectedDisabledValue?: number | string;
  serviceName?: string;
  expectedDisabledState?: string;
}

interface DebloatItemDef {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  category: DebloatCategory;
  minLevel: DebloatLevel;           // minimum mode this appears in
  safety: SafetyTier;
  defaultForRoles: SystemRole[];   // which roles pre-select this
  removal: RemovalDef;
  restore: RestoreDef;
  verification: VerificationDef;
  estimatedRamMb: number;
  estimatedDiskMb: number;
  affectedFeatures: string[];
}

// ── Canonical item registry ────────────────────────────────────────────────────
// Conservative, honest estimates. RAM = typical working set reduction.
// Disk = rough install size. Both labeled as estimates in UI.

const DEBLOAT_REGISTRY: DebloatItemDef[] = [
  // ── Safe level — registry/policy only, fully reversible ────────────────────

  {
    id: "advertising_id",
    name: "Advertising ID",
    description: "Per-device ad targeting identifier. Disabling stops personalized ad tracking across apps.",
    type: "registry",
    category: "telemetry",
    minLevel: "safe",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "registry",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo",
      regName: "Enabled",
      regValueDisabled: 0,
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: {
      supported: true,
      method: "registry",
      regValueDefault: 1,
      notes: "Re-enables personalized ad targeting.",
    },
    verification: {
      method: "registry-read",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo",
      regName: "Enabled",
      expectedDisabledValue: 0,
    },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Personalized ads in apps"],
  },

  {
    id: "activity_history",
    name: "Activity History",
    description: "Windows Timeline and activity syncing. Disabling stops activity upload to Microsoft.",
    type: "registry",
    category: "telemetry",
    minLevel: "safe",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "registry",
      regPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System",
      regName: "PublishUserActivities",
      regValueDisabled: 0,
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: {
      supported: true,
      method: "registry",
      regValueDefault: 1,
    },
    verification: {
      method: "registry-read",
      regPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System",
      regName: "PublishUserActivities",
      expectedDisabledValue: 0,
    },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Windows Timeline", "Activity sync"],
  },

  {
    id: "start_suggestions",
    name: "Start Menu Suggestions",
    description: "Promotional app suggestions and ads in the Start menu.",
    type: "registry",
    category: "shell-features",
    minLevel: "safe",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "registry",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager",
      regName: "SystemPaneSuggestionsEnabled",
      regValueDisabled: 0,
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: {
      supported: true,
      method: "registry",
      regValueDefault: 1,
    },
    verification: {
      method: "registry-read",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager",
      regName: "SystemPaneSuggestionsEnabled",
      expectedDisabledValue: 0,
    },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Start menu app suggestions"],
  },

  {
    id: "lock_screen_ads",
    name: "Lock Screen Spotlight / Ads",
    description: "Bing images and tips shown on the lock screen. Disabling removes promotional content.",
    type: "registry",
    category: "shell-features",
    minLevel: "safe",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "registry",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager",
      regName: "RotatingLockScreenOverlayEnabled",
      regValueDisabled: 0,
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: {
      supported: true,
      method: "registry",
      regValueDefault: 1,
    },
    verification: {
      method: "registry-read",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager",
      regName: "RotatingLockScreenOverlayEnabled",
      expectedDisabledValue: 0,
    },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Lock screen spotlight images", "Lock screen tips"],
  },

  // ── Balanced level — consumer app removal ─────────────────────────────────

  {
    id: "teams_consumer",
    name: "Microsoft Teams (Consumer)",
    description: "Pre-installed Teams chat app. Not the enterprise version — safe to remove for most users.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "laptop", "minimal"],
    removal: {
      method: "appx",
      packageName: "MicrosoftTeams",
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: {
      supported: true,
      method: "appx-store",
      notes: "Reinstallable from Microsoft Store.",
    },
    verification: { method: "appx-query", packageName: "MicrosoftTeams" },
    estimatedRamMb: 250,
    estimatedDiskMb: 180,
    affectedFeatures: ["Teams personal chat"],
  },

  {
    id: "feedback_hub",
    name: "Feedback Hub",
    description: "Microsoft feedback submission app. Not needed for most users.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "appx",
      packageName: "Microsoft.WindowsFeedbackHub",
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: {
      supported: true,
      method: "appx-store",
      notes: "Reinstallable from Microsoft Store.",
    },
    verification: { method: "appx-query", packageName: "Microsoft.WindowsFeedbackHub" },
    estimatedRamMb: 0,
    estimatedDiskMb: 30,
    affectedFeatures: ["Feedback submission"],
  },

  {
    id: "people_app",
    name: "People App",
    description: "Contact list app. Rarely used since contacts are managed by other apps.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "appx",
      packageName: "Microsoft.People",
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "appx-store" },
    verification: { method: "appx-query", packageName: "Microsoft.People" },
    estimatedRamMb: 0,
    estimatedDiskMb: 25,
    affectedFeatures: ["Contact management app"],
  },

  {
    id: "solitaire",
    name: "Microsoft Solitaire Collection",
    description: "Ad-supported card games. Optional — does not affect system function.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "appx",
      packageName: "Microsoft.MicrosoftSolitaireCollection",
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "appx-store" },
    verification: { method: "appx-query", packageName: "Microsoft.MicrosoftSolitaireCollection" },
    estimatedRamMb: 0,
    estimatedDiskMb: 130,
    affectedFeatures: ["Solitaire, Spider Solitaire, etc."],
  },

  {
    id: "tips_app",
    name: "Windows Tips (Get Started)",
    description: "Windows tips and onboarding app. Safe to remove after initial setup.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "appx",
      packageName: "Microsoft.Getstarted",
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "appx-store" },
    verification: { method: "appx-query", packageName: "Microsoft.Getstarted" },
    estimatedRamMb: 0,
    estimatedDiskMb: 20,
    affectedFeatures: ["Windows onboarding tips"],
  },

  {
    id: "bing_weather",
    name: "Weather (Bing)",
    description: "MSN Weather app. Removable if you use a browser or other weather source.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "minimal"],
    removal: {
      method: "appx",
      packageName: "Microsoft.BingWeather",
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "appx-store" },
    verification: { method: "appx-query", packageName: "Microsoft.BingWeather" },
    estimatedRamMb: 0,
    estimatedDiskMb: 45,
    affectedFeatures: ["Weather tile in Start", "Weather widget"],
  },

  {
    id: "maps_app",
    name: "Windows Maps",
    description: "Offline maps app. Most users use browser-based maps instead.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "minimal"],
    removal: {
      method: "appx",
      packageName: "Microsoft.WindowsMaps",
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "appx-store" },
    verification: { method: "appx-query", packageName: "Microsoft.WindowsMaps" },
    estimatedRamMb: 0,
    estimatedDiskMb: 60,
    affectedFeatures: ["Offline maps"],
  },

  // ── Aggressive level ───────────────────────────────────────────────────────

  {
    id: "cortana",
    name: "Cortana",
    description: "Microsoft's voice assistant. Largely replaced by Windows Search on Win11. Removal disables Cortana voice features.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "aggressive",
    safety: "medium",
    defaultForRoles: ["gaming", "laptop", "minimal"],
    removal: {
      method: "appx",
      packageName: "Microsoft.549981C3F5F10",
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: true,
    },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store. Requires sign-out to take effect." },
    verification: { method: "appx-query", packageName: "Microsoft.549981C3F5F10" },
    estimatedRamMb: 150,
    estimatedDiskMb: 80,
    affectedFeatures: ["Cortana voice commands", "Hey Cortana"],
  },

  {
    id: "copilot",
    name: "Windows Copilot",
    description: "AI assistant sidebar (Windows 11). Disabling removes the taskbar button and panel via policy.",
    type: "registry",
    category: "shell-features",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "laptop", "minimal"],
    removal: {
      method: "registry",
      regPath: "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot",
      regName: "TurnOffWindowsCopilot",
      regValueDisabled: 1,
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: true,
    },
    restore: {
      supported: true,
      method: "registry",
      regValueDefault: 0,
      notes: "Sign out and back in to restore Copilot.",
    },
    verification: {
      method: "registry-read",
      regPath: "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot",
      regName: "TurnOffWindowsCopilot",
      expectedDisabledValue: 1,
    },
    estimatedRamMb: 200,
    estimatedDiskMb: 0,
    affectedFeatures: ["Copilot sidebar", "AI assistant taskbar button"],
  },

  {
    id: "widgets",
    name: "Windows Widgets",
    description: "News, stocks, and weather panel on the taskbar. Removes the widget panel via policy.",
    type: "registry",
    category: "shell-features",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "registry",
      regPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Dsh",
      regName: "AllowNewsAndInterests",
      regValueDisabled: 0,
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: true,
    },
    restore: {
      supported: true,
      method: "registry",
      regValueDefault: 1,
    },
    verification: {
      method: "registry-read",
      regPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Dsh",
      regName: "AllowNewsAndInterests",
      expectedDisabledValue: 0,
    },
    estimatedRamMb: 180,
    estimatedDiskMb: 0,
    affectedFeatures: ["Widgets panel", "News and interests"],
  },

  {
    id: "xbox_gamebar",
    name: "Xbox Game Bar",
    description: "In-game overlay with performance stats and recording. Removing also removes the Win+G shortcut.",
    type: "appx",
    category: "gaming",
    minLevel: "aggressive",
    safety: "medium",
    defaultForRoles: ["workstation", "laptop", "minimal"],
    removal: {
      method: "appx",
      packageName: "Microsoft.XboxGamingOverlay",
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store." },
    verification: { method: "appx-query", packageName: "Microsoft.XboxGamingOverlay" },
    estimatedRamMb: 80,
    estimatedDiskMb: 100,
    affectedFeatures: ["Win+G overlay", "Game recording", "Performance monitor overlay"],
  },

  {
    id: "mixed_reality",
    name: "Mixed Reality Portal",
    description: "Windows Mixed Reality headset app. Only relevant if you own a compatible HMD.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "appx",
      packageName: "Microsoft.MixedReality.Portal",
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: {
      supported: false,
      notes: "Must be reinstalled via Windows Optional Features if a Mixed Reality headset is connected.",
    },
    verification: { method: "appx-query", packageName: "Microsoft.MixedReality.Portal" },
    estimatedRamMb: 0,
    estimatedDiskMb: 250,
    affectedFeatures: ["Windows Mixed Reality headset support"],
  },

  // ── Extreme level — services, higher risk ─────────────────────────────────

  {
    id: "diagtrack",
    name: "Connected User Experiences (DiagTrack)",
    description: "Primary Windows telemetry service. Disabling stops telemetry uploads. Startup type set to Disabled.",
    type: "service",
    category: "telemetry",
    minLevel: "extreme",
    safety: "medium",
    defaultForRoles: ["minimal"],
    removal: {
      method: "service",
      serviceName: "DiagTrack",
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: {
      supported: true,
      method: "service",
      serviceName: "DiagTrack",
      defaultStartType: "Automatic",
    },
    verification: {
      method: "service-query",
      serviceName: "DiagTrack",
      expectedDisabledState: "Disabled",
    },
    estimatedRamMb: 50,
    estimatedDiskMb: 0,
    affectedFeatures: ["Windows telemetry", "Diagnostic data upload"],
  },

  {
    id: "sysmain",
    name: "SysMain (Superfetch)",
    description: "Preloads frequently-used apps into RAM. On SSDs this service provides little benefit and may cause disk activity. Use with caution on HDDs.",
    type: "service",
    category: "system-services",
    minLevel: "extreme",
    safety: "medium",
    defaultForRoles: ["minimal"],
    removal: {
      method: "service",
      serviceName: "SysMain",
      requiresAdmin: true,
      requiresRestart: true,
      requiresSignOut: false,
    },
    restore: {
      supported: true,
      method: "service",
      serviceName: "SysMain",
      defaultStartType: "Automatic",
    },
    verification: {
      method: "service-query",
      serviceName: "SysMain",
      expectedDisabledState: "Disabled",
    },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["App preloading", "RAM pre-population"],
  },
];

// ── Level ordering ──────────────────────────────────────────────────────────────
const LEVEL_ORDER: DebloatLevel[] = ["safe", "balanced", "aggressive", "extreme"];

function levelIndex(l: DebloatLevel) { return LEVEL_ORDER.indexOf(l); }

// ── Profile role selection logic ───────────────────────────────────────────────
function getSelectedForRole(role: SystemRole, level: DebloatLevel): string[] {
  return DEBLOAT_REGISTRY
    .filter(item => {
      const levelOk = levelIndex(item.minLevel) <= levelIndex(level);
      const roleOk = item.defaultForRoles.includes(role);
      return levelOk && roleOk;
    })
    .map(item => item.id);
}

// ── DB init ───────────────────────────────────────────────────────────────────

async function initTables() {
  if (isNoDbMode || !db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS debloat_applied_items (
      id            SERIAL PRIMARY KEY,
      item_id       TEXT NOT NULL,
      item_name     TEXT NOT NULL,
      action        TEXT NOT NULL DEFAULT 'remove',
      status        TEXT NOT NULL DEFAULT 'removed',
      role          TEXT,
      level         TEXT,
      verification  TEXT NOT NULL DEFAULT 'pending',
      restart_req   BOOLEAN NOT NULL DEFAULT FALSE,
      signout_req   BOOLEAN NOT NULL DEFAULT FALSE,
      applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

initTables().catch(e => console.error("[Debloater] table init failed:", e.message));

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/debloat/items?role=gaming&level=balanced
router.get("/items", (req, res) => {
  const role = (req.query.role as SystemRole) ?? "gaming";
  const level = (req.query.level as DebloatLevel) ?? "safe";

  const visibleItems = DEBLOAT_REGISTRY.filter(
    item => levelIndex(item.minLevel) <= levelIndex(level)
  );

  const defaultSelected = new Set(getSelectedForRole(role, level));

  const payload = visibleItems.map(item => ({
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type,
    category: item.category,
    minLevel: item.minLevel,
    safety: item.safety,
    canRestore: item.restore.supported,
    restoreNotes: item.restore.notes ?? null,
    requiresAdmin: item.removal.requiresAdmin,
    requiresRestart: item.removal.requiresRestart,
    requiresSignOut: item.removal.requiresSignOut,
    estimatedRamMb: item.estimatedRamMb,
    estimatedDiskMb: item.estimatedDiskMb,
    affectedFeatures: item.affectedFeatures,
    defaultSelected: defaultSelected.has(item.id),
  }));

  res.json({ ok: true, items: payload, role, level });
});

// POST /api/debloat/apply
// Body: { role, level, itemIds: string[], electronResults?: Record<string, { ok, status, error }> }
router.post("/apply", async (req, res) => {
  const { role, level, itemIds, electronResults } = req.body as {
    role: SystemRole;
    level: DebloatLevel;
    itemIds: string[];
    electronResults?: Record<string, { ok: boolean; status?: string; error?: string }>;
  };

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ ok: false, error: "No items specified" });
  }

  const results: Array<{
    id: string; name: string; status: ResultStatus;
    requiresRestart: boolean; requiresSignOut: boolean;
    error?: string; verification?: string;
  }> = [];

  for (const itemId of itemIds) {
    const def = DEBLOAT_REGISTRY.find(i => i.id === itemId);
    if (!def) {
      results.push({ id: itemId, name: itemId, status: "unsupported", requiresRestart: false, requiresSignOut: false });
      continue;
    }

    // Use Electron IPC result if provided, otherwise "pending"
    const eResult = electronResults?.[itemId];
    let status: ResultStatus = "removed";
    let verification = "pending";
    let error: string | undefined;

    if (eResult) {
      if (!eResult.ok) {
        status = "failed";
        error = eResult.error;
        verification = "failed";
      } else {
        status = (eResult.status as ResultStatus) ?? "removed";
        verification = "verified";
      }
    }

    // Persist to DB
    if (!isNoDbMode && db) {
      await db.execute(sql`
        INSERT INTO debloat_applied_items
          (item_id, item_name, action, status, role, level, verification, restart_req, signout_req)
        VALUES
          (${itemId}, ${def.name}, 'remove', ${status}, ${role ?? null}, ${level ?? null},
           ${verification}, ${def.removal.requiresRestart}, ${def.removal.requiresSignOut})
      `).catch(e => console.error("[Debloater] log insert failed:", e.message));
    }

    results.push({
      id: itemId,
      name: def.name,
      status,
      requiresRestart: def.removal.requiresRestart,
      requiresSignOut: def.removal.requiresSignOut,
      error,
      verification,
    });
  }

  const anyRestart = results.some(r => r.requiresRestart && r.status === "removed");
  const anySignOut = results.some(r => r.requiresSignOut && r.status === "removed");
  const successCount = results.filter(r => r.status === "removed" || r.status === "already-absent").length;
  const failCount = results.filter(r => r.status === "failed" || r.status === "verification-failed").length;

  res.json({ ok: true, results, successCount, failCount, requiresRestart: anyRestart, requiresSignOut: anySignOut });
});

// POST /api/debloat/restore
// Body: { itemIds: string[], electronResults?: ... }
router.post("/restore", async (req, res) => {
  const { itemIds, electronResults } = req.body as {
    itemIds: string[];
    electronResults?: Record<string, { ok: boolean; status?: string; error?: string }>;
  };

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ ok: false, error: "No items specified" });
  }

  const results: Array<{
    id: string; name: string; status: ResultStatus; error?: string;
  }> = [];

  for (const itemId of itemIds) {
    const def = DEBLOAT_REGISTRY.find(i => i.id === itemId);
    if (!def) {
      results.push({ id: itemId, name: itemId, status: "unsupported" });
      continue;
    }
    if (!def.restore.supported) {
      results.push({ id: itemId, name: def.name, status: "unsupported" });
      continue;
    }

    const eResult = electronResults?.[itemId];
    let status: ResultStatus = "restored";
    let error: string | undefined;

    if (eResult) {
      if (!eResult.ok) { status = "failed"; error = eResult.error; }
      else { status = (eResult.status as ResultStatus) ?? "restored"; }
    }

    if (!isNoDbMode && db) {
      await db.execute(sql`
        INSERT INTO debloat_applied_items (item_id, item_name, action, status, verification)
        VALUES (${itemId}, ${def.name}, 'restore', ${status}, ${eResult ? 'verified' : 'pending'})
      `).catch(() => {});
    }

    results.push({ id: itemId, name: def.name, status, error });
  }

  res.json({ ok: true, results });
});

// POST /api/debloat/scan
// Body: { electronResults: Record<string, { present: boolean }> }
router.post("/scan", (req, res) => {
  const { electronResults } = req.body as {
    electronResults?: Record<string, { present: boolean; error?: string }>;
  };

  const stateMap: Record<string, "present" | "absent" | "unknown"> = {};

  for (const item of DEBLOAT_REGISTRY) {
    if (electronResults?.[item.id] !== undefined) {
      stateMap[item.id] = electronResults[item.id].present ? "present" : "absent";
    } else {
      stateMap[item.id] = "unknown";
    }
  }

  res.json({ ok: true, state: stateMap });
});

// GET /api/debloat/history
router.get("/history", async (req, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, history: [] });
  try {
    const rows = await db.execute<{
      id: number; item_id: string; item_name: string; action: string;
      status: string; role: string|null; level: string|null;
      verification: string; restart_req: boolean; applied_at: string;
    }>(sql`SELECT * FROM debloat_applied_items ORDER BY applied_at DESC LIMIT 100`);
    res.json({ ok: true, history: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
