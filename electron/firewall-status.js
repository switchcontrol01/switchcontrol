'use strict';

function asBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'enabled', 'on'].includes(normalized)) return true;
  if (['false', '0', 'disabled', 'off'].includes(normalized)) return false;
  return null;
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
  const activeCategories = (Array.isArray(probe?.activeCategories)
    ? probe.activeCategories
    : probe?.activeCategories ? [probe.activeCategories] : [])
    .map(normalizedProfileName)
    .filter(Boolean);

  const relevant = activeCategories.length
    ? profiles.filter(profile => activeCategories.includes(normalizedProfileName(profile?.Name)))
    : profiles;

  const activeProfileUnavailable = activeCategories.length > 0 &&
    activeCategories.some(category => !profiles.some(profile => normalizedProfileName(profile?.Name) === category));

  if (relevant.length === 0 || activeProfileUnavailable) {
    return { enabled: null, profiles, activeCategories };
  }

  const states = relevant.map(profile => asBoolean(profile?.Enabled));
  if (states.some(state => state === null)) {
    return { enabled: null, profiles, activeCategories };
  }

  return {
    enabled: states.every(Boolean),
    profiles,
    activeCategories,
  };
}

module.exports = { normalizeFirewallProbe };