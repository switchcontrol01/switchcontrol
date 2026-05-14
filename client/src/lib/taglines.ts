/**
 * Dashboard live-status helper.
 *
 * Previously showed rotating fake marketing phrases ("Memory pressure assessed",
 * "Performance pipeline active", etc.). Now replaced with honest telemetry-based
 * status strings generated directly from useLiveStatus() in Home.tsx.
 *
 * Splash screen keeps a static honest tagline instead of random phrases.
 */

export function getHonestTagline(): string {
  return "System optimization dashboard";
}
