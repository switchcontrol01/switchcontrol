// ── Steam Detector ────────────────────────────────────────────────────────────
//
// Reads Steam's libraryfolders.vdf to find all library roots, then scans every
// appmanifest_*.acf file in each library to discover installed games.
// Works on Windows and Linux (for Linux Steam installs).
// Gracefully returns empty results when Steam is not installed.

import fs from "fs";
import path from "path";
import type { DetectedGame, DetectorResult } from "./types";
import { getCatalogBySteamId, matchByNormalizedName, normalizeName } from "./catalog";

function steamRoot(): string[] {
  const candidates: string[] = [];
  const pf   = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const pf64 = process.env["ProgramFiles"]      ?? "C:\\Program Files";
  candidates.push(path.join(pf,   "Steam"));
  candidates.push(path.join(pf64, "Steam"));
  candidates.push("D:\\Steam");
  candidates.push("E:\\Steam");
  // Linux
  const home = process.env.HOME ?? "/root";
  candidates.push(path.join(home, ".steam", "steam"));
  candidates.push(path.join(home, ".local", "share", "Steam"));
  return candidates.filter((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });
}

function parseVdfLibraries(vdfPath: string): string[] {
  // Extract path entries from libraryfolders.vdf using simple regex
  // (avoids pulling in a VDF parser dep).
  try {
    const text = fs.readFileSync(vdfPath, "utf8");
    const paths: string[] = [];
    // Modern format: "path"\t\t"C:\\SteamLibrary"
    const re = /"path"\s+"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const p = m[1].replace(/\\\\/g, "\\");
      if (p) paths.push(p);
    }
    return paths;
  } catch {
    return [];
  }
}

function parseAcf(acfPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const text = fs.readFileSync(acfPath, "utf8");
    const re = /"(\w+)"\s+"([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      result[m[1]] = m[2];
    }
  } catch {}
  return result;
}

export async function runSteamDetector(): Promise<DetectorResult> {
  const t0 = Date.now();
  const games: DetectedGame[] = [];

  console.log("[SteamDetector] Starting scan…");

  const roots = steamRoot();
  if (roots.length === 0) {
    console.log("[SteamDetector] Steam not found on this system");
    return { launcher: "steam", games: [], error: "Steam not installed", scanDurationMs: Date.now() - t0 };
  }

  const libraryPaths = new Set<string>();
  for (const root of roots) {
    libraryPaths.add(path.join(root, "steamapps"));
    const vdf = path.join(root, "steamapps", "libraryfolders.vdf");
    for (const p of parseVdfLibraries(vdf)) {
      libraryPaths.add(path.join(p, "steamapps"));
    }
  }

  console.log(`[SteamDetector] Library paths: ${[...libraryPaths].join(", ")}`);

  for (const libPath of libraryPaths) {
    let entries: string[];
    try {
      entries = fs.readdirSync(libPath);
    } catch { continue; }

    const manifests = entries.filter((f) => f.startsWith("appmanifest_") && f.endsWith(".acf"));
    for (const mf of manifests) {
      try {
        const acf = parseAcf(path.join(libPath, mf));
        const appId = parseInt(acf.appid ?? acf.AppID ?? "0", 10);
        if (!appId) continue;

        const name = acf.name ?? acf.Name ?? `Steam App ${appId}`;
        const installDir = acf.installdir ?? acf.InstallDir ?? "";
        const installPath = installDir
          ? path.join(libPath, "common", installDir)
          : path.join(libPath, "common", name);

        const catalog = getCatalogBySteamId(appId) ?? matchByNormalizedName(name);

        games.push({
          id: `steam_${appId}`,
          name: catalog?.name ?? name,
          normalizedName: normalizeName(catalog?.name ?? name),
          launcher: "steam",
          installPath,
          executablePath: catalog
            ? path.join(installPath, catalog.executable)
            : null,
          launchId: String(appId),
          isInstalled: true,
          source: "steam_manifest",
          logoUrl: catalog?.logoUrl ?? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
          coverUrl: catalog?.coverUrl ?? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
          iconUrl: null,
          detectedAt: new Date().toISOString(),
          confidence: "confirmed",
          rawMeta: { appId, name, installDir },
        });
      } catch {}
    }
  }

  console.log(`[SteamDetector] Found ${games.length} installed Steam game(s)`);
  return { launcher: "steam", games, error: null, scanDurationMs: Date.now() - t0 };
}
