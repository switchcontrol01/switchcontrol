// ── Xbox / Microsoft Store Detector ──────────────────────────────────────────
//
// Xbox Game Pass and Microsoft Store games are installed as APPX packages.
// They DO NOT behave like normal Win32 executables — they have no public .exe
// in a predictable path. The only reliable way to detect them is:
//   1. PowerShell: Get-AppxPackage (requires Windows)
//   2. Parse the AppxManifest.xml inside WindowsApps folders
//   3. Query the shell Apps folder registry
//
// This detector uses PowerShell (option 1) when running on Windows.
// On Linux/Replit it returns an empty result with a clear explanation.
//
// Microsoft Flight Simulator 2024 is always detected here if installed via
// Xbox Game Pass or Microsoft Store.

import { execSync } from "child_process";
import type { DetectedGame, DetectorResult } from "./types";
import { getCatalogByXboxPackage, matchByNormalizedName, normalizeName } from "./catalog";

const isWindows = process.platform === "win32";

const POWERSHELL_CMD = `
  Get-AppxPackage |
  Where-Object { $_.SignatureKind -ne 'System' -and $_.NonRemovable -ne $true } |
  Select-Object Name, PackageFamilyName, InstallLocation, DisplayName, Version |
  ConvertTo-Json -Depth 2 -Compress
`.trim().replace(/\n/g, " ");

interface AppxEntry {
  Name: string;
  PackageFamilyName?: string;
  InstallLocation?: string;
  DisplayName?: string;
  Version?: string;
}

function runPowerShell(): AppxEntry[] {
  try {
    const raw = execSync(`powershell -NonInteractive -NoProfile -Command "${POWERSHELL_CMD}"`, {
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    }).toString("utf8");

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err: any) {
    console.warn("[XboxDetector] PowerShell failed:", err.message ?? "unknown");
    throw err;
  }
}

// Game-like package names that are not actual games (filters system/store apps)
const EXCLUDE_PREFIXES = [
  "Microsoft.WindowsStore",
  "Microsoft.Xbox.TCUI",
  "Microsoft.XboxGamingOverlay",
  "Microsoft.XboxGameOverlay",
  "Microsoft.XboxIdentityProvider",
  "Microsoft.XboxSpeechToTextOverlay",
  "Microsoft.GamingApp",
  "Microsoft.GamingServices",
  "Microsoft.DesktopAppInstaller",
  "Microsoft.WindowsTerminal",
  "Microsoft.Edge",
  "Microsoft.Office",
  "Microsoft.OneDrive",
  "MicrosoftCorporationII.QuickAssist",
  "Microsoft.549981C3F5F10",
];

function looksLikeGame(entry: AppxEntry): boolean {
  const name = entry.Name ?? "";
  if (EXCLUDE_PREFIXES.some((p) => name.startsWith(p))) return false;
  // Games published by Microsoft or 3rd parties on Game Pass
  const gaming = ["Microsoft.FlightSimulator", "Ubisoft", "EA.", "Xbox", "Game"];
  if (gaming.some((k) => name.includes(k))) return true;
  // Fall through: match against our catalog
  return !!(getCatalogByXboxPackage(name) ?? matchByNormalizedName(entry.DisplayName ?? name));
}

export async function runXboxDetector(): Promise<DetectorResult> {
  const t0 = Date.now();

  console.log("[XboxDetector] Starting scan…");

  if (!isWindows) {
    console.log("[XboxDetector] Not Windows — Xbox/Appx detection unavailable");
    return {
      launcher: "xbox",
      games: [],
      error: "Xbox/Appx detection requires Windows (PowerShell Get-AppxPackage)",
      scanDurationMs: Date.now() - t0,
    };
  }

  let appxEntries: AppxEntry[];
  try {
    appxEntries = runPowerShell();
  } catch (err: any) {
    return {
      launcher: "xbox",
      games: [],
      error: `PowerShell error: ${err.message ?? "unknown"}`,
      scanDurationMs: Date.now() - t0,
    };
  }

  console.log(`[XboxDetector] AppxPackage returned ${appxEntries.length} package(s) — filtering for games…`);

  const games: DetectedGame[] = [];

  for (const entry of appxEntries) {
    if (!looksLikeGame(entry)) continue;

    const displayName = entry.DisplayName?.trim() || entry.Name;
    const installPath = entry.InstallLocation?.trim() || "";

    const catalog = getCatalogByXboxPackage(entry.Name) ?? matchByNormalizedName(displayName);

    games.push({
      id: `xbox_${entry.PackageFamilyName ?? entry.Name}`,
      name: catalog?.name ?? displayName,
      normalizedName: normalizeName(catalog?.name ?? displayName),
      launcher: "xbox",
      installPath,
      executablePath: null,
      launchId: entry.PackageFamilyName ?? entry.Name,
      isInstalled: true,
      source: "xbox_appx",
      logoUrl: catalog?.logoUrl ?? null,
      coverUrl: catalog?.coverUrl ?? null,
      iconUrl: null,
      detectedAt: new Date().toISOString(),
      confidence: "confirmed",
      rawMeta: {
        packageName: entry.Name,
        packageFamilyName: entry.PackageFamilyName,
        version: entry.Version,
        installLocation: entry.InstallLocation,
      },
    });
  }

  console.log(`[XboxDetector] Found ${games.length} installed Xbox/MS-Store game(s)`);
  return { launcher: "xbox", games, error: null, scanDurationMs: Date.now() - t0 };
}
