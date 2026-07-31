'use strict';

/**
 * hardware-fingerprint.js — permanent, hardware-anchored device identity.
 *
 * Derived from Windows' MachineGuid (HKLM:\SOFTWARE\Microsoft\Cryptography),
 * a value Windows itself assigns at OS install time. It lives in the registry
 * — not in any app's files — so it survives app uninstall/reinstall, full
 * %appdata% deletion, and the app's own Factory Reset.
 *
 * The fingerprint changes ONLY on a full Windows reinstall. That is the
 * accepted, industry-standard limit of this anti-abuse mechanism, not a bug.
 *
 * SECURITY: the raw MachineGuid is a real, semi-identifying Windows value and
 * is treated like a password — it is hashed (SHA-256) immediately after the
 * registry read and the raw value never leaves this module's scope, is never
 * logged, and is never transmitted. Only derived values are exported:
 *
 *   getDeviceFingerprint()  → 64-char lowercase hex SHA-256 (promo/anti-abuse,
 *                             sent to the cloud as x-device-fingerprint)
 *   getPermanentDeviceId()  → first 16 hex chars of the same hash, uppercased,
 *                             matching the app's existing DEVICE_ID_REGEX
 *                             (/^[A-F0-9]{16}$/) so nothing downstream breaks
 *                             on format assumptions.
 *
 * Both fail CLOSED (resolve null) when the registry read fails or returns a
 * malformed value — there is deliberately no random-ID fallback here, since a
 * silent fallback would reintroduce the resettable-identity bug this module
 * exists to fix.
 *
 * The hash is cached in-memory for the process lifetime (one PowerShell spawn
 * per launch at most) but is intentionally NEVER persisted to disk by this
 * module — it is deterministically re-derivable every launch, so there is
 * nothing for a user to delete.
 */

const crypto = require('crypto');
const { queryPS } = require('./ps-shared');

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _hashCache = null;   // 64-char lowercase hex SHA-256, process lifetime only
let _hashPromise = null; // in-flight dedup so concurrent callers share one PS spawn

async function _computeHash() {
  if (process.platform !== 'win32') return null;
  const raw = await queryPS(
    "(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid"
  );
  const guid = (raw || '').trim();
  if (!GUID_REGEX.test(guid)) {
    // Fail closed — never fall back to a weaker/random identifier.
    console.error('[HWFingerprint] MachineGuid read failed or returned a malformed value — failing closed');
    return null;
  }
  // Hash immediately; the raw GUID is discarded when this function returns.
  return crypto.createHash('sha256').update(guid.toLowerCase()).digest('hex');
}

/**
 * Full 64-char lowercase hex SHA-256 fingerprint, or null on failure.
 */
async function getDeviceFingerprint() {
  if (_hashCache) return _hashCache;
  if (_hashPromise) return _hashPromise;
  _hashPromise = _computeHash()
    .then((h) => {
      if (h) _hashCache = h;
      return h;
    })
    .catch((e) => {
      console.error('[HWFingerprint] Unexpected error computing fingerprint:', e?.message);
      return null;
    })
    .finally(() => {
      _hashPromise = null;
    });
  return _hashPromise;
}

/**
 * Permanent device ID — first 16 hex chars of the fingerprint, uppercased to
 * match DEVICE_ID_REGEX (/^[A-F0-9]{16}$/). Null on failure (fail closed).
 */
async function getPermanentDeviceId() {
  const hash = await getDeviceFingerprint();
  return hash ? hash.slice(0, 16).toUpperCase() : null;
}

module.exports = { getDeviceFingerprint, getPermanentDeviceId };
