// ── Normalizer ────────────────────────────────────────────────────────────────
//
// Merges results from multiple detectors into a deduplicated list of installed
// games. Resolution priority:
//   1. steam_manifest  (highest confidence)
//   2. epic_manifest
//   3. xbox_appx
//   4. filesystem (lowest, do not override the above)
//
// Deduplication: keyed by normalizedName — if the same game appears in two
// launchers we keep the HIGHER confidence entry and note the duplicate source.

import type { DetectedGame, DetectorResult } from "./types";

const SOURCE_PRIORITY: Record<string, number> = {
  steam_manifest: 4,
  epic_manifest:  3,
  xbox_appx:      3,
  battlenet_db:   2,
  filesystem:     1,
  manual:         5,
};

export function normalize(results: DetectorResult[]): DetectedGame[] {
  // Collect all detected games from all launchers
  const all: DetectedGame[] = results.flatMap((r) => r.games);

  // Dedup by normalizedName, keeping the highest-priority source
  const byName = new Map<string, DetectedGame>();

  for (const game of all) {
    const existing = byName.get(game.normalizedName);
    if (!existing) {
      byName.set(game.normalizedName, game);
      continue;
    }
    const existPri   = SOURCE_PRIORITY[existing.source]  ?? 0;
    const incomingPri = SOURCE_PRIORITY[game.source]     ?? 0;
    if (incomingPri > existPri) {
      byName.set(game.normalizedName, game);
    }
  }

  const normalized = [...byName.values()];

  // Logging
  const byLauncher: Record<string, number> = {};
  for (const r of results) byLauncher[r.launcher] = r.games.length;
  console.log("[Normalizer] Per-launcher counts:", JSON.stringify(byLauncher));
  console.log(`[Normalizer] Normalized installed list total = ${normalized.length}`);
  const brandedCount = normalized.filter((g) => g.logoUrl != null).length;
  console.log(`[Normalizer] Branding matched = ${brandedCount}, branding fallback = ${normalized.length - brandedCount}`);

  return normalized;
}
