// ── Epic Games Launcher Detector ──────────────────────────────────────────────
//
// Epic stores one .item JSON file per installed game in:
//   C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\
//
// Each .item file contains InstallLocation, DisplayName, AppName, etc.
// This is the authoritative source — far more reliable than exe-path scanning.
// Fortnite is always detected here if installed through Epic.

import fs from "fs";
import path from "path";
import type { DetectedGame, DetectorResult } from "./types";
import { getCatalogByEpicName, matchByNormalizedName, normalizeName } from "./catalog";

const EPIC_MANIFEST_ROOTS: string[] = [
  "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests",
  "D:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests",
];

function findManifestDir(): string | null {
  for (const p of EPIC_MANIFEST_ROOTS) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

interface EpicManifest {
  DisplayName?: string;
  AppName?: string;
  InstallLocation?: string;
  LaunchExecutable?: string;
  CatalogItemId?: string;
  AppCategories?: string[];
  bIsIncompleteInstall?: boolean;
  bIsApplication?: boolean;
  MainGameCatalogItemId?: string;
}

export async function runEpicDetector(): Promise<DetectorResult> {
  const t0 = Date.now();
  const games: DetectedGame[] = [];

  console.log("[EpicDetector] Starting scan…");

  const manifestDir = findManifestDir();
  if (!manifestDir) {
    console.log("[EpicDetector] Epic launcher not found — Manifests directory missing");
    return { launcher: "epic", games: [], error: "Epic Games Launcher not installed", scanDurationMs: Date.now() - t0 };
  }

  console.log(`[EpicDetector] Scanning manifests at: ${manifestDir}`);

  let entries: string[];
  try {
    entries = fs.readdirSync(manifestDir);
  } catch (err: any) {
    return { launcher: "epic", games: [], error: `Cannot read manifests: ${err.message}`, scanDurationMs: Date.now() - t0 };
  }

  const items = entries.filter((f) => f.endsWith(".item"));
  console.log(`[EpicDetector] Found ${items.length} .item manifest file(s)`);

  for (const item of items) {
    try {
      const raw = fs.readFileSync(path.join(manifestDir, item), "utf8");
      const m: EpicManifest = JSON.parse(raw);

      const displayName = m.DisplayName?.trim();
      const appName     = m.AppName?.trim();
      const installLoc  = m.InstallLocation?.trim();

      if (!displayName || !appName || !installLoc) continue;

      // Skip unfinished installs
      if (m.bIsIncompleteInstall) continue;

      // Skip DLC / addons — their AppCategories usually don't include "games"
      // but we also check for the presence of MainGameCatalogItemId as a DLC signal
      if (m.MainGameCatalogItemId && m.CatalogItemId !== m.MainGameCatalogItemId) continue;

      const catalog = getCatalogByEpicName(appName) ?? matchByNormalizedName(displayName);

      const execFile = m.LaunchExecutable?.trim() ?? (catalog?.executable ?? null);
      const execPath = execFile ? path.join(installLoc, execFile) : null;

      games.push({
        id: `epic_${appName}`,
        name: catalog?.name ?? displayName,
        normalizedName: normalizeName(catalog?.name ?? displayName),
        launcher: "epic",
        installPath: installLoc,
        executablePath: execPath,
        launchId: appName,
        isInstalled: true,
        source: "epic_manifest",
        logoUrl: catalog?.logoUrl ?? null,
        coverUrl: catalog?.coverUrl ?? null,
        iconUrl: null,
        detectedAt: new Date().toISOString(),
        confidence: "confirmed",
        rawMeta: { appName, displayName, installLoc, catalogItemId: m.CatalogItemId },
      });
    } catch {}
  }

  console.log(`[EpicDetector] Found ${games.length} installed Epic game(s)`);
  return { launcher: "epic", games, error: null, scanDurationMs: Date.now() - t0 };
}
