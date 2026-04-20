/**
 * gameIconResolver.ts
 * ───────────────────
 * Single source of truth for:
 *  • Canonical slug resolution (detection-time names → catalog slug)
 *  • Vite-bundled icon overrides (works in dev AND packaged Electron)
 *
 * All UI and detection code must call `canonicalSlug()` before any icon
 * lookup so that process/exe names from Windows detectors map to catalog keys.
 *
 * Import strategy:
 *  - Server-provided logoUrl strings use /games/*.png absolute paths which
 *    fail in packaged Electron (file:// context resolves them to filesystem root).
 *  - Vite static imports embed the asset with a correct relative path in the
 *    build output, making them reliable in both dev and packaged Electron.
 *  - ICON_OVERRIDES (Vite-imported) take priority over server-provided URLs.
 */

import fortniteIconUrl  from "@/assets/games/fortnite.png";
import minecraftIconUrl from "@/assets/games/minecraft.png";

// ── Vite-bundled icon overrides keyed by canonical slug ──────────────────────
// Add an entry here whenever a game has a local asset (not a Steam CDN URL).
export const ICON_OVERRIDES: Record<string, string> = {
  fortnite:  fortniteIconUrl,
  minecraft: minecraftIconUrl,
};

// ── Alias map — raw names/exe names → canonical catalog slug ─────────────────
// Keys are normalised (lowercase, no spaces → hyphens, no punctuation).
const SLUG_ALIASES: Record<string, string> = {
  // ── Fortnite ───────────────────────────────────────────────────────────────
  "fortniteclient-win64-shipping":      "fortnite",
  "fortniteclient-win64-shipping-exe":  "fortnite",
  "fortnitelauncher":                   "fortnite",
  "fortnitelauncher-exe":               "fortnite",
  "fn":                                 "fortnite",
  "fortnite-battle-royale":             "fortnite",
  "epic-fortnite":                      "fortnite",
  "epicfortnite":                       "fortnite",
  "epicgames-fortnite":                 "fortnite",

  // ── Minecraft ──────────────────────────────────────────────────────────────
  "minecraftlauncher":                  "minecraft",
  "minecraftlauncher-exe":              "minecraft",
  "minecraft-launcher":                 "minecraft",
  "minecraft-launcher-exe":             "minecraft",
  "minecraftwindows":                   "minecraft",
  "minecraft-for-windows":              "minecraft",
  "minecraft-windows-10":               "minecraft",
  "minecraft-bedrock":                  "minecraft",
  "minecraft-java":                     "minecraft",
  "mc":                                 "minecraft",
  "javaw":                              "minecraft", // common Minecraft Java detection
  "microsoft-minecraftuwp":             "minecraft",
  "microsoft-minecraftuwp-8wekyb3d8bbwe": "minecraft",
  "minecraft-windows-exe":              "minecraft",
};

/**
 * Normalise an arbitrary game name/exe/slug to a safe lookup key:
 *   • lowercase
 *   • leading/trailing whitespace removed
 *   • punctuation and spaces → hyphens
 *   • collapse consecutive hyphens
 *   • strip trailing .exe
 */
export function normaliseKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\.exe$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolve any raw game name, executable basename, or existing slug to its
 * canonical catalog slug.  Falls back to the normalised form of the input
 * if no alias match is found.
 */
export function canonicalSlug(input: string): string {
  const key = normaliseKey(input);
  return SLUG_ALIASES[key] ?? key;
}

/**
 * Resolve the best icon URL for a game, given its canonical slug and an
 * optional server-provided URL.
 *
 * Priority:
 *  1. Vite-bundled local asset (ICON_OVERRIDES) — always works in packaged Electron
 *  2. Server-provided logoUrl (Steam CDN or other remote image)
 *  3. null → GameLogo renders the gradient-badge fallback
 */
export function resolveGameIcon(slug: string, serverLogoUrl: string | null): string | null {
  const canon = canonicalSlug(slug);

  // Prefer the Vite-bundled asset when available
  if (ICON_OVERRIDES[canon]) {
    if (canon === "fortnite" || canon === "minecraft") {
      console.log(
        `[GameIcon] slug="${slug}" → canon="${canon}" source=vite-bundle url="${ICON_OVERRIDES[canon]}"`
      );
    }
    return ICON_OVERRIDES[canon];
  }

  // For all other games, use the server-provided URL (Steam CDN etc.)
  if (serverLogoUrl) {
    return serverLogoUrl;
  }

  return null;
}
