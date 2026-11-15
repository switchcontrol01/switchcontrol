function parseTamperProtectionRegistryValue(value) {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric)) return null;

  // Windows Defender uses both the simple 0/1 representation and the
  // Features key's 4 (off) / 5 (on) representation.
  if (numeric === 0 || numeric === 4) return false;
  if (numeric === 1 || numeric === 5) return true;
  return null;
}

module.exports = { parseTamperProtectionRegistryValue };
