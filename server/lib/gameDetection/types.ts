// ── Shared types for the multi-launcher game detection pipeline ────────────────

export type Launcher =
  | "steam"
  | "epic"
  | "xbox"
  | "battlenet"
  | "riot"
  | "ea"
  | "ubisoft"
  | "unknown";

export type DetectionSource =
  | "steam_manifest"
  | "epic_manifest"
  | "xbox_appx"
  | "battlenet_db"
  | "filesystem"
  | "manual";

export type Confidence = "confirmed" | "probable" | "guessed";

// One normalized installed game entry produced by any detector.
export interface DetectedGame {
  id: string;
  name: string;
  normalizedName: string;
  launcher: Launcher;
  installPath: string;
  executablePath: string | null;
  launchId: string;
  isInstalled: boolean;
  source: DetectionSource;
  logoUrl: string | null;
  coverUrl: string | null;
  iconUrl: string | null;
  detectedAt: string;
  confidence: Confidence;
  rawMeta?: Record<string, unknown>;
}

// What each detector returns.
export interface DetectorResult {
  launcher: Launcher;
  games: DetectedGame[];
  error: string | null;
  scanDurationMs: number;
}

// Full pipeline output.
export interface ScanReport {
  results: DetectorResult[];
  totalInstalled: number;
  normalized: DetectedGame[];
  scannedAt: string;
  platformSupported: boolean;
}

// Catalog entry — enriches raw detections with metadata, branding and profiles.
export interface CatalogEntry {
  slug: string;
  name: string;
  publisher: string;
  genre: "competitive" | "open-world" | "simulation" | "mmo" | "battle-royale" | "rpg" | "racing";
  profileId: string;
  executable: string;

  // Launcher-specific identifiers used by detectors.
  steamAppId?: number;
  epicAppName?: string;
  xboxPackageName?: string;
  battlenetUid?: string;
  riotClientId?: string;
  eaDesktopId?: string;
  ubisoftGameId?: string;

  // Known Windows install paths — SECONDARY fallback only (not primary detection).
  knownPaths: string[];

  // Official branding URLs.
  logoUrl: string | null;
  coverUrl: string | null;

  // Normalized name aliases for fuzzy matching.
  aliases: string[];
}

// Flatten knownPaths from CatalogEntry for backward-compat with legacy scan IPC.
export interface LegacyGameHint {
  slug: string;
  executable: string;
  knownPaths: string[];
}
