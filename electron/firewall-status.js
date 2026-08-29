'use strict';

function asBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;
  return ['true', '1', 'enabled', 'on'].includes(String(value).trim().toLowerCase());
}

function normalizedProfileName(value) {
  const name = String(value || '').trim().toLowerCase();
  return name === 'domainauthenticated' ? 'domain' : name;
}

/**
 * Resolve the firewall state from the profile probe without assuming that
 * PowerShell returned a single object or a native JSON boolean.
 *
 * If active categories are available, only those profiles determine the
 * protection state. With no active category, all returned profiles must be
 * enabled; this avoids claiming protection from an unrelated enabled profile.
 */
function normalizeFirewallProbe(probe) {
  const profiles = Array.isArray(probe?.profiles)
    ? probe.profiles
    : probe?.profiles ? [probe.profiles] : [];
  const activeCategories = Array.isArray(probe?.activeCategories)
    ? probe.activeCategories.map(normalizedProfileName).filter(Boolean)
    : [];

  const relevant = activeCategories.length
    ? profiles.filter(profile => activeCategories.includes(normalizedProfileName(profile?.Name)))
    : profiles;

  if (relevant.length === 0) {
    return { enabled: null, profiles, activeCategories };
  }

  return {
    enabled: relevant.every(profile => asBoolean(profile?.Enabled)),
    profiles,
    activeCategories,
  };
}

module.exports = { normalizeFirewallProbe };