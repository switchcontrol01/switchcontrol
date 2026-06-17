const GLOW_COLORS: Record<string, string> = {
  orange:  "rgba(245,158,11,",
  purple:  "rgba(168,85,247,",
  cyan:    "rgba(0,212,255,",
  blue:    "rgba(59,130,246,",
  emerald: "rgba(16,185,129,",
  pink:    "rgba(236,72,153,",
};

const GLOW_KEYS = Object.keys(GLOW_COLORS);

const SESSION_COLOR_KEY = "sc_glow_color";
const SESSION_PLAYED_KEY = "sc_glow_played";

function pickAndSaveColor(): string {
  const key = GLOW_KEYS[Math.floor(Math.random() * GLOW_KEYS.length)];
  try { sessionStorage.setItem(SESSION_COLOR_KEY, key); } catch (_) {}
  return GLOW_COLORS[key];
}

export function getSessionGlowColor(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_COLOR_KEY);
    if (stored && GLOW_COLORS[stored]) return GLOW_COLORS[stored];
  } catch (_) {}
  return pickAndSaveColor();
}

export function hasGlowPlayed(): boolean {
  try { return sessionStorage.getItem(SESSION_PLAYED_KEY) === "true"; } catch (_) { return false; }
}

export function markGlowPlayed(): void {
  try { sessionStorage.setItem(SESSION_PLAYED_KEY, "true"); } catch (_) {}
}
