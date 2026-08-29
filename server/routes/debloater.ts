import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, isNoDbMode } from "../db";
import { appendLocalHistoryEntry, getLocalHistory } from "../lib/localDebloatHistory";
import { debloatLimiter } from "../middleware/rateLimiter";
import { requireJwt } from "../middleware/requireCloudAuth";

const router = Router();

// Each debloat request can spawn powershell.exe — cap throughput to prevent
// sustained WMI load from a single user hammering the endpoint.
router.use(debloatLimiter);

// ── Types ─────────────────────────────────────────────────────────────────────

export type SystemRole = "gaming" | "streaming" | "workstation" | "laptop" | "minimal";
export type DebloatLevel = "safe" | "balanced" | "aggressive" | "extreme";
export type SafetyTier = "safe" | "medium" | "high";
export type ItemType = "appx" | "registry" | "service" | "task";
export type DebloatCategory = "consumer-apps" | "telemetry" | "gaming" | "cloud" | "system-services" | "shell-features";

export type ResultStatus =
  | "removed" | "restored" | "already-absent" | "already-present"
  | "failed" | "verification-failed" | "verification-inconclusive"
  | "pending-restart" | "unsupported" | "partial";

const VALID_ROLES = new Set<SystemRole>(["gaming", "streaming", "workstation", "laptop", "minimal"]);
const VALID_LEVELS = new Set<DebloatLevel>(["safe", "balanced", "aggressive", "extreme"]);
const VALID_RESULT_STATUSES = new Set<ResultStatus>([
  "removed", "restored", "already-absent", "already-present", "failed",
  "verification-failed", "verification-inconclusive", "pending-restart",
  "unsupported", "partial",
]);
const MAX_DEBLOAT_ITEMS = 100;

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validRole(value: unknown): value is SystemRole {
  return typeof value === "string" && VALID_ROLES.has(value as SystemRole);
}

function validLevel(value: unknown): value is DebloatLevel {
  return typeof value === "string" && VALID_LEVELS.has(value as DebloatLevel);
}

function boundedText(value: unknown, max = 1000): string | undefined {
  return typeof value === "string" && value.trim() ? value.slice(0, max) : undefined;
}

function resultFromElectron(raw: unknown, action: "remove" | "restore") {
  if (!isPlainObject(raw) || typeof raw.ok !== "boolean") {
    return { status: "failed" as ResultStatus, verification: "failed", error: "Native execution returned no valid result." };
  }
  const rawStatus = typeof raw.status === "string" && VALID_RESULT_STATUSES.has(raw.status as ResultStatus)
    ? raw.status as ResultStatus
    : undefined;
  const successStatuses = action === "remove"
    ? new Set<ResultStatus>(["removed", "already-absent", "pending-restart"])
    : new Set<ResultStatus>(["restored", "already-present", "partial"]);
  const failureStatuses = new Set<ResultStatus>([
    "failed", "verification-failed", "verification-inconclusive", "unsupported", "partial",
  ]);
  const status = raw.ok && rawStatus && successStatuses.has(rawStatus)
    ? rawStatus
    : !raw.ok && rawStatus && failureStatuses.has(rawStatus) ? rawStatus
    : "failed";
  // Keep the detailed native message authoritative (the old route used:
  // error = eResult.errorDetail ?? eResult.error).
  return {
    status,
    verification: raw.ok && status === "partial"
      ? "partial"
      : raw.ok && successStatuses.has(status) ? "verified" : "failed",
    error: boundedText(raw.errorDetail ?? raw.error),
  };
}

interface RemovalDef {
  method: "appx" | "registry" | "service" | "task";
  packageName?: string;       // appx
  serviceName?: string;       // service
  regPath?: string;           // registry
  regName?: string;
  regValueDisabled?: number | string;
  taskPaths?: string[];       // task — array of "\Path\TaskName" strings
  requiresAdmin: boolean;
  requiresRestart: boolean;
  requiresSignOut: boolean;
}

interface RestoreDef {
  supported: boolean;
  method?: "appx-store" | "appx-provisioned" | "registry" | "service" | "task";
  packageName?: string;
  regValueDefault?: number | string;
  serviceName?: string;
  defaultStartType?: string;
  taskPaths?: string[];
  notes?: string;
}

interface VerificationDef {
  method: "appx-query" | "registry-read" | "service-query" | "task-query";
  packageName?: string;
  regPath?: string;
  regName?: string;
  expectedDisabledValue?: number | string;
  serviceName?: string;
  expectedDisabledState?: string;
  taskPaths?: string[];
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

  // ── Consumer apps — extended ──────────────────────────────────────────────

  {
    id: "bing_news",
    name: "Microsoft News",
    description: "Microsoft news feed app. Replaced by browser-based news for most users.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.BingNews", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store." },
    verification: { method: "appx-query", packageName: "Microsoft.BingNews" },
    estimatedRamMb: 40,
    estimatedDiskMb: 80,
    affectedFeatures: ["News tile in Start", "MSN news feed"],
  },

  {
    id: "ms_todo",
    name: "Microsoft To Do",
    description: "Microsoft task manager app. Optional if you use other task managers.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.Todos", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store." },
    verification: { method: "appx-query", packageName: "Microsoft.Todos" },
    estimatedRamMb: 0,
    estimatedDiskMb: 35,
    affectedFeatures: ["Microsoft To Do app"],
  },

  {
    id: "clipchamp",
    name: "Clipchamp",
    description: "Microsoft video editor. Safe to remove if you use other video software.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: { method: "appx", packageName: "Clipchamp.Clipchamp", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store." },
    verification: { method: "appx-query", packageName: "Clipchamp.Clipchamp" },
    estimatedRamMb: 0,
    estimatedDiskMb: 150,
    affectedFeatures: ["Clipchamp video editor"],
  },

  {
    id: "ms_family",
    name: "Microsoft Family Safety",
    description: "Parental controls app. Safe to remove for single-user adult systems.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "minimal"],
    removal: { method: "appx", packageName: "MicrosoftCorporationII.MicrosoftFamily", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store." },
    verification: { method: "appx-query", packageName: "MicrosoftCorporationII.MicrosoftFamily" },
    estimatedRamMb: 0,
    estimatedDiskMb: 45,
    affectedFeatures: ["Family safety features"],
  },

  {
    id: "ms_whiteboard",
    name: "Microsoft Whiteboard",
    description: "Digital whiteboard app. Not needed for most gaming systems.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.Whiteboard", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store." },
    verification: { method: "appx-query", packageName: "Microsoft.Whiteboard" },
    estimatedRamMb: 0,
    estimatedDiskMb: 120,
    affectedFeatures: ["Microsoft Whiteboard"],
  },

  {
    id: "power_automate",
    name: "Microsoft Power Automate",
    description: "Desktop automation tool. Not needed for most users.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.PowerAutomateDesktop", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store." },
    verification: { method: "appx-query", packageName: "Microsoft.PowerAutomateDesktop" },
    estimatedRamMb: 0,
    estimatedDiskMb: 200,
    affectedFeatures: ["Power Automate Desktop"],
  },

  {
    id: "voice_recorder",
    name: "Windows Voice Recorder",
    description: "Built-in voice recorder. Safe to remove if not used.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.WindowsSoundRecorder", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store." },
    verification: { method: "appx-query", packageName: "Microsoft.WindowsSoundRecorder" },
    estimatedRamMb: 0,
    estimatedDiskMb: 15,
    affectedFeatures: ["Voice Recorder app"],
  },

  {
    id: "xbox_identity_provider",
    name: "Xbox Identity Provider",
    description: "Xbox identity service app. Can be removed if not using Xbox features.",
    type: "appx",
    category: "gaming",
    minLevel: "balanced",
    safety: "medium",
    defaultForRoles: ["streaming", "workstation", "laptop", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.XboxIdentityProvider", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store. Required for Xbox Live sign-in." },
    verification: { method: "appx-query", packageName: "Microsoft.XboxIdentityProvider" },
    estimatedRamMb: 20,
    estimatedDiskMb: 25,
    affectedFeatures: ["Xbox sign-in features"],
  },

  {
    id: "xbox_game_speech",
    name: "Xbox Game Speech Window",
    description: "Xbox speech recognition overlay. Rarely used on desktop PCs.",
    type: "appx",
    category: "gaming",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["streaming", "workstation", "laptop", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.XboxGameSpeech", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store" },
    verification: { method: "appx-query", packageName: "Microsoft.XboxGameSpeech" },
    estimatedRamMb: 0,
    estimatedDiskMb: 10,
    affectedFeatures: ["Xbox game speech features"],
  },

  {
    id: "xbox_tcui",
    name: "Xbox TCUI",
    description: "Xbox title-callable UI. Required only for some Xbox Live features.",
    type: "appx",
    category: "gaming",
    minLevel: "balanced",
    safety: "medium",
    defaultForRoles: ["streaming", "workstation", "laptop", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.Xbox.TCUI", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store. Required for some Xbox Live UI." },
    verification: { method: "appx-query", packageName: "Microsoft.Xbox.TCUI" },
    estimatedRamMb: 0,
    estimatedDiskMb: 15,
    affectedFeatures: ["Xbox Live UI overlays"],
  },

  {
    id: "phone_link",
    name: "Phone Link (Your Phone)",
    description: "Links an Android phone to your PC. Safe to remove if not used.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.YourPhone", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store." },
    verification: { method: "appx-query", packageName: "Microsoft.YourPhone" },
    estimatedRamMb: 60,
    estimatedDiskMb: 90,
    affectedFeatures: ["Phone Link", "cross-device features"],
  },

  {
    id: "paint_3d",
    name: "Paint 3D",
    description: "3D painting app. Classic Paint is separate and completely unaffected.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.MSPaint", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store. Classic Paint (mspaint.exe) is unaffected." },
    verification: { method: "appx-query", packageName: "Microsoft.MSPaint" },
    estimatedRamMb: 0,
    estimatedDiskMb: 120,
    affectedFeatures: ["Paint 3D only — classic Paint is preserved"],
  },

  {
    id: "ms_3d_viewer",
    name: "3D Viewer",
    description: "3D model viewer app. Not needed for most users.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.Microsoft3DViewer", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store" },
    verification: { method: "appx-query", packageName: "Microsoft.Microsoft3DViewer" },
    estimatedRamMb: 0,
    estimatedDiskMb: 50,
    affectedFeatures: ["3D Viewer app"],
  },

  {
    id: "skype",
    name: "Skype",
    description: "Pre-installed Skype app. Safe to remove if you use Discord or other apps.",
    type: "appx",
    category: "consumer-apps",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: { method: "appx", packageName: "Microsoft.SkypeApp", requiresAdmin: false, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "appx-store", notes: "Reinstallable from Microsoft Store." },
    verification: { method: "appx-query", packageName: "Microsoft.SkypeApp" },
    estimatedRamMb: 80,
    estimatedDiskMb: 120,
    affectedFeatures: ["Skype app"],
  },

  // ── Shell & UI — extended ─────────────────────────────────────────────────

  {
    id: "chat_icon",
    name: "Chat Icon (Teams in Taskbar)",
    description: "Removes the Teams chat icon from the taskbar. Teams itself is unaffected.",
    type: "registry",
    category: "shell-features",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "registry",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
      regName: "TaskbarMn",
      regValueDisabled: 0,
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "registry", regValueDefault: 1 },
    verification: {
      method: "registry-read",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
      regName: "TaskbarMn",
      expectedDisabledValue: 0,
    },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Taskbar Teams chat icon only"],
  },

  {
    id: "start_recommendations",
    name: "Start Menu Recommendations",
    description: "Removes the Recommended section from the Start menu.",
    type: "registry",
    category: "shell-features",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "registry",
      regPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer",
      regName: "HideRecommendedSection",
      regValueDisabled: 1,
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "registry", regValueDefault: 0 },
    verification: {
      method: "registry-read",
      regPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer",
      regName: "HideRecommendedSection",
      expectedDisabledValue: 1,
    },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Start menu recommended items"],
  },

  {
    id: "tips_notifications",
    name: "Tips Notifications",
    description: "Disables Windows tips and tricks notification popups.",
    type: "registry",
    category: "shell-features",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "registry",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager",
      regName: "SoftLandingEnabled",
      regValueDisabled: 0,
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "registry", regValueDefault: 1 },
    verification: {
      method: "registry-read",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager",
      regName: "SoftLandingEnabled",
      expectedDisabledValue: 0,
    },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Windows tips notifications"],
  },

  {
    id: "get_more_windows",
    name: "Get More Out of Windows Prompts",
    description: "Disables the annoying setup completion prompts after Windows updates.",
    type: "registry",
    category: "shell-features",
    minLevel: "balanced",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "registry",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\UserProfileEngagement",
      regName: "ScoobeSystemSettingEnabled",
      regValueDisabled: 0,
      requiresAdmin: false,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "registry", regValueDefault: 1 },
    verification: {
      method: "registry-read",
      regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\UserProfileEngagement",
      regName: "ScoobeSystemSettingEnabled",
      expectedDisabledValue: 0,
    },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Post-update setup prompts"],
  },

  // ── System Services — extended ────────────────────────────────────────────

  {
    id: "delivery_optimization",
    name: "Delivery Optimization",
    description: "Stops peer-to-peer Windows Update delivery. Windows Update itself continues to work, but devices will no longer share update files with other PCs.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: { method: "service", serviceName: "DoSvc", requiresAdmin: true, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "service", serviceName: "DoSvc", defaultStartType: "Automatic" },
    verification: { method: "service-query", serviceName: "DoSvc", expectedDisabledState: "Disabled" },
    estimatedRamMb: 10,
    estimatedDiskMb: 0,
    affectedFeatures: ["Peer-to-peer Windows Update delivery"],
  },

  {
    id: "fax_service",
    name: "Windows Fax Service",
    description: "Disables the legacy fax service. Not needed unless this PC sends or receives faxes.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: { method: "service", serviceName: "Fax", requiresAdmin: true, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "service", serviceName: "Fax", defaultStartType: "Manual" },
    verification: { method: "service-query", serviceName: "Fax", expectedDisabledState: "Disabled" },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Windows Fax and Scan faxing"],
  },

  {
    id: "geolocation_service",
    name: "Windows Geolocation",
    description: "Disables the Windows location service. Maps, weather, and other apps may lose automatic location detection.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "medium",
    defaultForRoles: ["gaming", "streaming", "minimal"],
    removal: { method: "service", serviceName: "lfsvc", requiresAdmin: true, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "service", serviceName: "lfsvc", defaultStartType: "Manual" },
    verification: { method: "service-query", serviceName: "lfsvc", expectedDisabledState: "Disabled" },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Automatic location detection", "Location-aware apps"],
  },

  {
    id: "error_reporting",
    name: "Windows Error Reporting",
    description: "Stops automatic crash-report collection. Useful for privacy, but Windows will no longer automatically submit application failure reports.",
    type: "service",
    category: "telemetry",
    minLevel: "aggressive",
    safety: "medium",
    defaultForRoles: ["gaming", "streaming", "minimal"],
    removal: { method: "service", serviceName: "WerSvc", requiresAdmin: true, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "service", serviceName: "WerSvc", defaultStartType: "Manual" },
    verification: { method: "service-query", serviceName: "WerSvc", expectedDisabledState: "Disabled" },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Automatic Windows and application crash reports"],
  },

  {
    id: "maps_broker",
    name: "Downloaded Maps Manager",
    description: "Disables background management for offline maps. Leave enabled if you use downloaded maps.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "minimal"],
    removal: { method: "service", serviceName: "MapsBroker", requiresAdmin: true, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "service", serviceName: "MapsBroker", defaultStartType: "Automatic" },
    verification: { method: "service-query", serviceName: "MapsBroker", expectedDisabledState: "Disabled" },
    estimatedRamMb: 5,
    estimatedDiskMb: 0,
    affectedFeatures: ["Offline Windows Maps"],
  },

  {
    id: "windows_search",
    name: "Windows Search Indexing",
    description: "Stops the Windows Search indexer for maximum background-I/O reduction. Start-menu, File Explorer, and Outlook searches become slower or incomplete.",
    type: "service",
    category: "system-services",
    minLevel: "extreme",
    safety: "high",
    defaultForRoles: ["gaming", "minimal"],
    removal: { method: "service", serviceName: "WSearch", requiresAdmin: true, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "service", serviceName: "WSearch", defaultStartType: "DelayedAuto" },
    verification: { method: "service-query", serviceName: "WSearch", expectedDisabledState: "Disabled" },
    estimatedRamMb: 35,
    estimatedDiskMb: 0,
    affectedFeatures: ["Fast File Explorer search", "Start-menu search indexing", "Outlook search indexing"],
  },

  {
    id: "connected_devices_platform",
    name: "Connected Devices Platform",
    description: "Disables cross-device and nearby-device background features. Phone Link, Nearby Sharing, and some device discovery features may stop working.",
    type: "service",
    category: "system-services",
    minLevel: "extreme",
    safety: "high",
    defaultForRoles: ["gaming", "minimal"],
    removal: { method: "service", serviceName: "CDPSvc", requiresAdmin: true, requiresRestart: false, requiresSignOut: false },
    restore: { supported: true, method: "service", serviceName: "CDPSvc", defaultStartType: "Automatic" },
    verification: { method: "service-query", serviceName: "CDPSvc", expectedDisabledState: "Disabled" },
    estimatedRamMb: 10,
    estimatedDiskMb: 0,
    affectedFeatures: ["Phone Link", "Nearby Sharing", "Cross-device experiences"],
  },

  {
    id: "print_spooler",
    name: "Print Spooler",
    description: "Manages print jobs. Safe to disable if no printer is connected.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "medium",
    defaultForRoles: ["gaming", "streaming", "minimal"],
    removal: {
      method: "service",
      serviceName: "Spooler",
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "service", serviceName: "Spooler", defaultStartType: "Automatic" },
    verification: { method: "service-query", serviceName: "Spooler", expectedDisabledState: "Disabled" },
    estimatedRamMb: 20,
    estimatedDiskMb: 0,
    affectedFeatures: ["All printing functionality"],
  },

  {
    id: "remote_registry",
    name: "Remote Registry",
    description: "Allows remote registry editing. Disabling improves security on personal PCs.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "service",
      serviceName: "RemoteRegistry",
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "service", serviceName: "RemoteRegistry", defaultStartType: "Manual" },
    verification: { method: "service-query", serviceName: "RemoteRegistry", expectedDisabledState: "Disabled" },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Remote registry access"],
  },

  {
    id: "win_remote_mgmt",
    name: "Windows Remote Management",
    description: "Remote management protocol. Not needed on personal gaming PCs.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "service",
      serviceName: "WinRM",
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "service", serviceName: "WinRM", defaultStartType: "Manual" },
    verification: { method: "service-query", serviceName: "WinRM", expectedDisabledState: "Disabled" },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Remote management tools", "some IT admin tools"],
  },

  {
    id: "xbox_live_auth",
    name: "Xbox Live Auth Manager",
    description: "Xbox Live authentication service. Disable if not using Xbox Live or Game Pass.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "medium",
    defaultForRoles: ["streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "service",
      serviceName: "XblAuthManager",
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "service", serviceName: "XblAuthManager", defaultStartType: "Manual" },
    verification: { method: "service-query", serviceName: "XblAuthManager", expectedDisabledState: "Disabled" },
    estimatedRamMb: 15,
    estimatedDiskMb: 0,
    affectedFeatures: ["Xbox Live sign-in", "Game Pass authentication"],
  },

  {
    id: "xbox_live_gamesave",
    name: "Xbox Live Game Save",
    description: "Xbox Live cloud save sync. Disable if not using Xbox cloud saves.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "medium",
    defaultForRoles: ["streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "service",
      serviceName: "XblGameSave",
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "service", serviceName: "XblGameSave", defaultStartType: "Manual" },
    verification: { method: "service-query", serviceName: "XblGameSave", expectedDisabledState: "Disabled" },
    estimatedRamMb: 10,
    estimatedDiskMb: 0,
    affectedFeatures: ["Xbox Live cloud game saves"],
  },

  {
    id: "xbox_live_network",
    name: "Xbox Live Networking",
    description: "Xbox Live networking service. Disable if not using Xbox Live features.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "medium",
    defaultForRoles: ["streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "service",
      serviceName: "XboxNetApiSvc",
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "service", serviceName: "XboxNetApiSvc", defaultStartType: "Manual" },
    verification: { method: "service-query", serviceName: "XboxNetApiSvc", expectedDisabledState: "Disabled" },
    estimatedRamMb: 10,
    estimatedDiskMb: 0,
    affectedFeatures: ["Xbox Live multiplayer networking"],
  },

  {
    id: "windows_insider_svc",
    name: "Windows Insider Service",
    description: "Windows Insider preview update service. Safe to disable on stable builds.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "service",
      serviceName: "wisvc",
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "service", serviceName: "wisvc", defaultStartType: "Manual" },
    verification: { method: "service-query", serviceName: "wisvc", expectedDisabledState: "Disabled" },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Windows Insider updates only"],
  },

  {
    id: "retail_demo",
    name: "Retail Demo Service",
    description: "Demo mode service for retail store displays. Not needed on personal PCs.",
    type: "service",
    category: "system-services",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "service",
      serviceName: "RetailDemo",
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "service", serviceName: "RetailDemo", defaultStartType: "Manual" },
    verification: { method: "service-query", serviceName: "RetailDemo", expectedDisabledState: "Disabled" },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Windows retail demo mode only"],
  },

  // ── Privacy & Telemetry — extended ───────────────────────────────────────

  {
    id: "telemetry_tasks",
    name: "Microsoft Compatibility Telemetry Tasks",
    description: "Disables 7 Microsoft telemetry scheduled tasks that collect compatibility and usage data in the background.",
    type: "task",
    category: "telemetry",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "task",
      taskPaths: [
        "\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser",
        "\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater",
        "\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator",
        "\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip",
        "\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector",
        "\\Microsoft\\Windows\\Feedback\\Siuf\\DmClient",
        "\\Microsoft\\Windows\\Feedback\\Siuf\\DmClientOnScenarioDownload",
      ],
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: {
      supported: true,
      method: "task",
      taskPaths: [
        "\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser",
        "\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater",
        "\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator",
        "\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip",
        "\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector",
        "\\Microsoft\\Windows\\Feedback\\Siuf\\DmClient",
        "\\Microsoft\\Windows\\Feedback\\Siuf\\DmClientOnScenarioDownload",
      ],
    },
    verification: {
      method: "task-query",
      taskPaths: [
        "\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser",
        "\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater",
        "\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator",
        "\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip",
        "\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector",
        "\\Microsoft\\Windows\\Feedback\\Siuf\\DmClient",
        "\\Microsoft\\Windows\\Feedback\\Siuf\\DmClientOnScenarioDownload",
      ],
    },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Telemetry data collection tasks"],
  },

  {
    id: "ceip_registry",
    name: "Customer Experience Improvement Program",
    description: "Disables the Windows Customer Experience Improvement Program data collection via policy.",
    type: "registry",
    category: "telemetry",
    minLevel: "aggressive",
    safety: "safe",
    defaultForRoles: ["gaming", "streaming", "workstation", "laptop", "minimal"],
    removal: {
      method: "registry",
      regPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\SQMClient\\Windows",
      regName: "CEIPEnable",
      regValueDisabled: 0,
      requiresAdmin: true,
      requiresRestart: false,
      requiresSignOut: false,
    },
    restore: { supported: true, method: "registry", regValueDefault: 1 },
    verification: {
      method: "registry-read",
      regPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\SQMClient\\Windows",
      regName: "CEIPEnable",
      expectedDisabledValue: 0,
    },
    estimatedRamMb: 0,
    estimatedDiskMb: 0,
    affectedFeatures: ["Background usage data collection"],
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
      user_id       TEXT,
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
  await db.execute(sql`
    ALTER TABLE debloat_applied_items
      ADD COLUMN IF NOT EXISTS user_id TEXT
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS debloat_applied_items_user_id_idx
      ON debloat_applied_items (user_id)
  `);
}

initTables().catch(e => console.error("[Debloater] table init failed:", e.message));

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/debloat/items?role=gaming&level=balanced
router.get("/items", (req, res) => {
  const role = (req.query.role as SystemRole) ?? "gaming";
  const level = (req.query.level as DebloatLevel) ?? "safe";
  if (!validRole(role) || !validLevel(level)) {
    return res.status(400).json({ ok: false, error: "Invalid Debloater role or level." });
  }

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
// Body: { role, level, itemIds: string[], electronResults?: Record<string, { ok, status, error, errorDetail }> }
router.post("/apply", async (req, res) => {
  const body = isPlainObject(req.body) ? req.body : {};
  const { role, level, itemIds, electronResults } = body as {
    role: SystemRole;
    level: DebloatLevel;
    itemIds: string[];
    electronResults?: Record<string, { ok: boolean; status?: string; error?: string; errorDetail?: string }>;
  };

  if (!isPlainObject(req.body) || !validRole(role) || !validLevel(level) ||
      !Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > MAX_DEBLOAT_ITEMS ||
      itemIds.some(id => typeof id !== "string" || !id.trim())) {
    return res.status(400).json({ ok: false, error: "No items specified" });
  }
  if (new Set(itemIds).size !== itemIds.length) {
    return res.status(400).json({ ok: false, error: "Duplicate Debloater items are not allowed." });
  }
  const definitions = itemIds.map(itemId => DEBLOAT_REGISTRY.find(i => i.id === itemId));
  if (definitions.some(def => !def)) {
    return res.status(400).json({ ok: false, error: "Unknown Debloater item." });
  }
  if (!isPlainObject(electronResults)) {
    return res.status(409).json({ ok: false, error: "Native execution results are required. Run this action in the desktop app." });
  }

  const results: Array<{
    id: string; name: string; status: ResultStatus;
    requiresRestart: boolean; requiresSignOut: boolean;
    error?: string; verification?: string;
  }> = [];

  for (const itemId of itemIds) {
    const def = definitions[itemIds.indexOf(itemId)]!;

    // A server response is never allowed to invent a successful native action.
    const eResult = electronResults?.[itemId];
    const native = resultFromElectron(eResult, "remove");
    const status = native.status;
    const verification = native.verification;
    const error = native.error;

    // Persist to DB, or a local JSON file when there is no reachable
    // database (packaged Electron desktop app).
    if (!isNoDbMode && db) {
      await db.execute(sql`
        INSERT INTO debloat_applied_items
          (user_id, item_id, item_name, action, status, role, level, verification, restart_req, signout_req)
        VALUES
          (${req.cloudUser!.id}, ${itemId}, ${def.name}, 'remove', ${status}, ${role ?? null}, ${level ?? null},
           ${verification}, ${def.removal.requiresRestart}, ${def.removal.requiresSignOut})
      `).catch(e => console.error("[Debloater] log insert failed:", e.message));
    } else {
      appendLocalHistoryEntry({
        user_id: req.cloudUser?.id ?? null,
        item_id: itemId,
        item_name: def.name,
        action: "remove",
        status,
        role: role ?? null,
        level: level ?? null,
        verification,
        restart_req: def.removal.requiresRestart,
        signout_req: def.removal.requiresSignOut,
      });
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

  const anyRestart = results.some(r => r.requiresRestart && (r.status === "removed" || r.status === "pending-restart"));
  const anySignOut = results.some(r => r.requiresSignOut && (r.status === "removed" || r.status === "pending-restart"));
  const successCount = results.filter(r => r.status === "removed" || r.status === "already-absent" || r.status === "pending-restart").length;
  const failCount = results.filter(r => r.status === "failed" || r.status === "verification-failed" || r.status === "verification-inconclusive").length;

  res.json({ ok: true, results, successCount, failCount, requiresRestart: anyRestart, requiresSignOut: anySignOut });
});

// POST /api/debloat/restore
// Body: { itemIds: string[], electronResults?: ... }
router.post("/restore", async (req, res) => {
  const body = isPlainObject(req.body) ? req.body : {};
  const { itemIds, electronResults } = body as {
    itemIds: string[];
    electronResults?: Record<string, { ok: boolean; status?: string; error?: string; errorDetail?: string }>;
  };

  if (!isPlainObject(req.body) || !Array.isArray(itemIds) || itemIds.length === 0 ||
      itemIds.length > MAX_DEBLOAT_ITEMS || itemIds.some(id => typeof id !== "string" || !id.trim())) {
    return res.status(400).json({ ok: false, error: "No items specified" });
  }
  if (new Set(itemIds).size !== itemIds.length) {
    return res.status(400).json({ ok: false, error: "Duplicate Debloater items are not allowed." });
  }
  if (!isPlainObject(electronResults)) {
    return res.status(409).json({ ok: false, error: "Native execution results are required. Run this action in the desktop app." });
  }

  const results: Array<{
    id: string; name: string; status: ResultStatus; error?: string; verification?: string;
  }> = [];

  for (const itemId of itemIds) {
    const def = DEBLOAT_REGISTRY.find(i => i.id === itemId);
    if (!def) {
      results.push({ id: itemId, name: itemId, status: "unsupported" });
      return res.status(400).json({ ok: false, error: "Unknown Debloater item." });
    }
    if (!def.restore.supported) {
      results.push({ id: itemId, name: def.name, status: "unsupported" });
      continue;
    }

    const eResult = electronResults[itemId];
    const native = resultFromElectron(eResult, "restore");
    const status = native.status;
    const error = native.error;

    if (!isNoDbMode && db) {
        await db.execute(sql`
        INSERT INTO debloat_applied_items (user_id, item_id, item_name, action, status, verification)
        VALUES (${req.cloudUser!.id}, ${itemId}, ${def.name}, 'restore', ${status}, ${native.verification})
      `).catch(() => {});
    } else {
      appendLocalHistoryEntry({
        user_id: req.cloudUser?.id ?? null,
        item_id: itemId,
        item_name: def.name,
        action: "restore",
        status,
        role: null,
        level: null,
        verification: native.verification,
        restart_req: false,
        signout_req: false,
      });
    }

    results.push({ id: itemId, name: def.name, status, error, verification: native.verification });
  }

  res.json({ ok: true, results });
});

// POST /api/debloat/scan
// Body: { electronResults: Record<string, { present: boolean }> }
router.post("/scan", (req, res) => {
  const body = isPlainObject(req.body) ? req.body : {};
  const { electronResults } = body as {
    electronResults?: Record<string, { present: boolean; error?: string }>;
  };

  if (!isPlainObject(req.body) || !isPlainObject(electronResults)) {
    return res.status(400).json({ ok: false, error: "Native scan results are required." });
  }
  const stateMap: Record<string, "present" | "absent" | "unknown"> = {};

  for (const item of DEBLOAT_REGISTRY) {
    const result = electronResults[item.id];
    if (isPlainObject(result) && !result.error && typeof result.present === "boolean") {
      stateMap[item.id] = result.present ? "present" : "absent";
    } else {
      stateMap[item.id] = "unknown";
    }
  }

  res.json({ ok: true, state: stateMap });
});

// POST /api/debloat/apps/log
// Body: { appName, publisher?, version?, method?, status, source? }
router.post("/apps/log", async (req, res) => {
  const { appName, publisher, version, method, status, source } = req.body as {
    appName: string; publisher?: string; version?: string;
    method?: string; status?: string; source?: string;
  };
  const validAppStatuses = new Set([
    "removed", "restart-required", "pending-restart", "failed", "blocked", "stale-record",
    "no-uninstall-path", "parse-error", "exe-not-found", "user-cancelled",
    "verification-inconclusive", "verification-failed",
  ]);
  const validMethods = new Set(["msi", "exe", "none", ""]);
  if (!appName || typeof appName !== "string" || appName.trim().length > 160 ||
      (status !== undefined && (!validAppStatuses.has(status) || status.length > 64)) ||
      (method !== undefined && (!validMethods.has(method) || method.length > 32))) {
    return res.status(400).json({ ok: false, error: "appName required" });
  }
  const itemId = `installed-app:${appName.slice(0, 80)}`;
  const finalStatus = status ?? "removed";
  const notes = [publisher && `pub:${publisher}`, version && `v${version}`, method && `method:${method}`, source && `src:${source}`].filter(Boolean).join(" ");

  if (!isNoDbMode && db) {
    await db.execute(sql`
      INSERT INTO debloat_applied_items
        (user_id, item_id, item_name, action, status, role, level, verification, restart_req, signout_req)
      VALUES
        (${req.cloudUser!.id}, ${itemId}, ${appName}, 'uninstall-installed', ${finalStatus},
         null, null, 'electron', false, false)
    `).catch(e => console.warn("[Debloater/AppsLog] insert failed:", e.message));
  } else {
    appendLocalHistoryEntry({
      user_id: req.cloudUser?.id ?? null,
      item_id: itemId,
      item_name: appName,
      action: "uninstall-installed",
      status: finalStatus,
      role: null,
      level: null,
      verification: "electron",
      restart_req: false,
      signout_req: false,
    });
  }

  res.json({ ok: true, notes });
});

// GET /api/debloat/history
router.get("/history", requireJwt, async (req, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, history: getLocalHistory(100, req.cloudUser?.id) });
  try {
    const rows = await db.execute<{
      id: number; user_id: string | null; item_id: string; item_name: string; action: string;
      status: string; role: string|null; level: string|null;
      verification: string; restart_req: boolean; applied_at: string;
    }>(sql`
      SELECT *
      FROM debloat_applied_items
      WHERE user_id = ${req.cloudUser!.id}
      ORDER BY applied_at DESC
      LIMIT 100
    `);
    res.json({ ok: true, history: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
