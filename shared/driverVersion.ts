/**
 * Conservative comparison for vendor driver version strings.
 *
 * Driver versions are not all semver: NVIDIA commonly uses 3-part or
 * 4-part numbers, Intel uses 4-part numbers, and vendor tools may prefix a
 * numeric version with words such as "Driver" or "v". Firmware/BIOS strings
 * such as "7E12v1H" and "P9CR40A" must remain unknown rather than being
 * ordered by whichever digits happen to be embedded in them.
 */

export type DriverVersionComparison = "older" | "same" | "newer" | "unknown";

function numericParts(value: string): number[] | null {
  const input = value.trim().toLowerCase();
  if (!input || !/\d/.test(input)) return null;

  // A version needs at least two numeric components. This deliberately keeps
  // model/firmware identifiers like "P9CR40A" and "FFFFFFFF" out of ordering.
  const parts = [...input.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (parts.length < 2 || parts.some((part) => !Number.isSafeInteger(part))) {
    return null;
  }

  // Allow a short prefix ("v1.2.3", "Driver 31.2.2", "WHQL 32.0..."),
  // but reject alphanumeric firmware tokens where letters touch digits. A
  // trailing release marker separated by punctuation/space is safe.
  const compact = input.replace(/\s+/g, " ");
  const startsWithVersionPrefix = /^(?:v|ver|version)\s*\d/.test(compact);
  const hasAttachedLetters = /[a-z]\d|\d[a-z]/.test(compact);
  if (hasAttachedLetters && !startsWithVersionPrefix) return null;

  // Numeric groups must be separated as a version, not just scattered through
  // prose. Spaces are allowed around a prefixed version; punctuation is the
  // normal separator between components.
  const withoutPrefix = compact
    .replace(/^(?:driver|version|ver|release|rev|build|whql|adrenalin|edition)\s+/i, "")
    .replace(/^v(?=\d)/i, "");
  if (!/^\d+(?:[\s._/-]+\d+)+(?:[\s._/-]+[a-z]+)?$/i.test(withoutPrefix)) {
    return null;
  }

  return parts;
}

export function compareDriverVersions(
  installed: string | null | undefined,
  latest: string | null | undefined,
): DriverVersionComparison {
  if (!installed || !latest) return "unknown";
  const installedParts = numericParts(installed);
  const latestParts = numericParts(latest);
  if (!installedParts || !latestParts) return "unknown";

  const length = Math.max(installedParts.length, latestParts.length);
  for (let index = 0; index < length; index += 1) {
    const installedPart = installedParts[index] ?? 0;
    const latestPart = latestParts[index] ?? 0;
    if (installedPart < latestPart) return "older";
    if (installedPart > latestPart) return "newer";
  }
  return "same";
}