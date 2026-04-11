// ── Detection Orchestrator ────────────────────────────────────────────────────
//
// Runs all supported detectors in parallel and merges results via the normalizer.
// Each detector is isolated — a failure in one does NOT abort the others.

import { runSteamDetector } from "./steamDetector";
import { runEpicDetector }  from "./epicDetector";
import { runXboxDetector }  from "./xboxDetector";
import { normalize }        from "./normalizer";
import type { ScanReport }  from "./types";

export async function runAllDetectors(): Promise<ScanReport> {
  const scannedAt = new Date().toISOString();

  console.log("[GameDetection] Starting multi-launcher detection pipeline…");

  const [steamResult, epicResult, xboxResult] = await Promise.allSettled([
    runSteamDetector(),
    runEpicDetector(),
    runXboxDetector(),
  ]);

  const results = [steamResult, epicResult, xboxResult]
    .map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { launcher: "unknown" as const, games: [], error: String((r as PromiseRejectedResult).reason), scanDurationMs: 0 }
    );

  const steamR = results[0];
  const epicR  = results[1];
  const xboxR  = results[2];

  console.log(
    `[GameDetection] Steam detector found ${steamR.games.length} game(s)` +
    (steamR.error ? ` [error: ${steamR.error}]` : "")
  );
  console.log(
    `[GameDetection] Epic detector found ${epicR.games.length} game(s)` +
    (epicR.error ? ` [error: ${epicR.error}]` : "")
  );
  console.log(
    `[GameDetection] Xbox detector found ${xboxR.games.length} game(s)` +
    (xboxR.error ? ` [error: ${xboxR.error}]` : "")
  );

  const normalized = normalize(results);
  const platformSupported = process.platform === "win32";

  console.log(`[GameDetection] UI rendering ${normalized.length} installed game(s) | platform: ${process.platform}`);

  return { results, totalInstalled: normalized.length, normalized, scannedAt, platformSupported };
}

export { runSteamDetector, runEpicDetector, runXboxDetector };
export type { ScanReport, DetectedGame, DetectorResult } from "./types";
