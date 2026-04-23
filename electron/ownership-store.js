/**
 * ownership-store.js
 *
 * Shared ownership / baseline model for all premium-controlled system changes.
 *
 * PURPOSE
 * -------
 * When a user's trial expires or their premium subscription downgrades, SwitchControl
 * must revert ONLY what it applied — never a setting the user already had before they
 * installed the app.  To do this safely it needs to know:
 *
 *   1. WHAT the system state was BEFORE SwitchControl changed it (the "baseline").
 *   2. WHAT SwitchControl set it to (the "applied value").
 *   3. WHETHER SwitchControl is the entity that last changed it.
 *
 * IMMUTABLE FIRST-CAPTURE RULE
 * ----------------------------
 * captureBaseline() is idempotent for a given scopeKey: it stores the baseline
 * ONCE and never overwrites it on repeated toggles.  The baseline represents the
 * user's state before SwitchControl first touched that item.
 *
 * FAIL-SAFE RULE
 * --------------
 * The revert pipeline MUST skip any item whose baselineCaptured === false.
 * Without a confirmed baseline, restoring an "original" value is guesswork.
 *
 * SCHEMA per record
 * -----------------
 * {
 *   itemType:          "tweak" | "network_tweak" | "power_plan" | "nic"
 *   itemId:            string     — tweak ID / NIC property key / "active-scheme"
 *   scopeKey:          string     — canonical unique identifier for this record
 *   appliedByApp:      boolean    — true only after executor confirms success
 *   baselineCaptured:  boolean    — true once previousValue has been read + stored
 *   previousValue:     any        — exact raw value before SwitchControl changed it
 *   appliedValue:      any        — exact value SwitchControl set
 *   adapterName:       string|null — NIC adapter name (NIC type only)
 *   registryKeyword:   string|null — driver RegistryKeyword (NIC type only)
 *   previousPlanGuid:  string|null — active GUID before power plan change
 *   appliedPlanGuid:   string|null — GUID SwitchControl activated
 *   verificationState: "verified" | "unverified" | "failed"
 *   lastAppliedAt:     ISO string | null
 *   lastVerifiedAt:    ISO string | null
 * }
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { OWNERSHIP_FILE, APPDATA_DIR } = require('./user-data-paths');

const STORE_VERSION = 1;

// ── disk I/O ──────────────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(APPDATA_DIR)) fs.mkdirSync(APPDATA_DIR, { recursive: true });
}

/**
 * Load ownership records from disk.
 * Returns { version, items: { [scopeKey]: record } }
 */
function loadOwnership() {
  try {
    ensureDir();
    if (!fs.existsSync(OWNERSHIP_FILE)) return { version: STORE_VERSION, items: {} };
    const raw = fs.readFileSync(OWNERSHIP_FILE, 'utf8').replace(/^\uFEFF/, '').trim();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      console.warn('[OwnershipStore] corrupt store — resetting');
      return { version: STORE_VERSION, items: {} };
    }
    return {
      version: data.version || STORE_VERSION,
      items:   (data.items && typeof data.items === 'object' && !Array.isArray(data.items))
                 ? data.items
                 : {},
    };
  } catch (e) {
    console.error('[OwnershipStore] loadOwnership failed:', e.message);
    return { version: STORE_VERSION, items: {} };
  }
}

function saveOwnership(data) {
  try {
    ensureDir();
    // Atomic write: write to a temp file then rename.
    // fs.renameSync is atomic on NTFS (same volume) — if the process crashes
    // mid-write the original file is intact; only a fully-written tmp is
    // swapped in.  This prevents a corrupt ownership store on unexpected exit.
    const tmp = OWNERSHIP_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, OWNERSHIP_FILE);
  } catch (e) {
    console.error('[OwnershipStore] saveOwnership failed:', e.message);
    // Attempt to clean up orphaned tmp file on failure
    try { fs.unlinkSync(OWNERSHIP_FILE + '.tmp'); } catch {}
  }
}

// ── scope key ─────────────────────────────────────────────────────────────────

/**
 * Build the canonical scope key for an ownership record.
 *
 * Examples:
 *   buildScopeKey('tweak',         'tcp-timestamps')                     → "tweak:tcp-timestamps"
 *   buildScopeKey('network_tweak', 'tcp-rss')                            → "network_tweak:tcp-rss"
 *   buildScopeKey('nic',           '*FlowControl', 'Realtek 2.5GbE USB') → "nic:Realtek 2.5GbE USB:*FlowControl"
 *   buildScopeKey('power_plan',    'active-scheme')                      → "power_plan:active-scheme"
 */
function buildScopeKey(itemType, itemId, adapterName) {
  if (itemType === 'nic' && adapterName) {
    return `nic:${adapterName}:${itemId}`;
  }
  return `${itemType}:${itemId}`;
}

// ── default record shape ──────────────────────────────────────────────────────

function defaultRecord(scopeKey, itemType, itemId, adapterName) {
  return {
    itemType,
    itemId,
    scopeKey,
    appliedByApp:      false,
    baselineCaptured:  false,
    previousValue:     null,
    appliedValue:      null,
    adapterName:       adapterName || null,
    registryKeyword:   null,
    previousPlanGuid:  null,
    appliedPlanGuid:   null,
    verificationState: 'unverified',
    lastAppliedAt:     null,
    lastVerifiedAt:    null,
  };
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Get the ownership record for a scope key.
 * Returns null if no record exists yet.
 */
function getOwnershipRecord(scopeKey) {
  const data = loadOwnership();
  return data.items[scopeKey] || null;
}

/**
 * Capture the baseline for a scope key.
 *
 * IMMUTABLE FIRST-CAPTURE: if a baseline is already stored for this scope key
 * this function is a no-op.  Repeated applies/reverts must NOT overwrite the
 * original baseline — it must always represent the user's state before
 * SwitchControl first touched this item.
 *
 * @param {string} scopeKey
 * @param {object} fields — { itemType, itemId, previousValue, adapterName?,
 *                            registryKeyword?, previousPlanGuid? }
 */
function captureBaseline(scopeKey, fields) {
  const data = loadOwnership();
  const existing = data.items[scopeKey];

  // Immutable first-capture rule — never overwrite an already-captured baseline
  if (existing && existing.baselineCaptured) {
    return;
  }

  const record = existing || defaultRecord(scopeKey, fields.itemType, fields.itemId, fields.adapterName);

  record.baselineCaptured = true;
  record.previousValue    = fields.previousValue ?? null;
  record.adapterName      = fields.adapterName      || record.adapterName  || null;
  record.registryKeyword  = fields.registryKeyword  || null;
  record.previousPlanGuid = fields.previousPlanGuid || null;

  data.items[scopeKey] = record;
  saveOwnership(data);
  console.log(`[OwnershipStore] baseline captured: ${scopeKey} → previousValue=${JSON.stringify(record.previousValue)}`);
}

/**
 * Record a successful apply operation.
 * Sets appliedByApp=true and stores the applied value.
 * Only call this AFTER the executor confirms the command succeeded.
 *
 * @param {string} scopeKey
 * @param {object} fields — { appliedValue, verificationState?, appliedPlanGuid? }
 */
function recordApply(scopeKey, fields) {
  const data = loadOwnership();
  const record = data.items[scopeKey];

  if (!record) {
    console.warn(`[OwnershipStore] recordApply called for unknown scopeKey: ${scopeKey}`);
    return;
  }

  record.appliedByApp      = true;
  record.appliedValue      = fields.appliedValue      ?? record.appliedValue;
  record.verificationState = fields.verificationState || 'unverified';
  record.lastAppliedAt     = new Date().toISOString();
  record.appliedPlanGuid   = fields.appliedPlanGuid   || record.appliedPlanGuid || null;

  if (fields.verificationState === 'verified') {
    record.lastVerifiedAt = new Date().toISOString();
  }

  data.items[scopeKey] = record;
  saveOwnership(data);
  console.log(`[OwnershipStore] apply recorded: ${scopeKey} appliedValue=${JSON.stringify(record.appliedValue)}`);
}

/**
 * Record a successful revert operation.
 * Sets appliedByApp=false.  The baseline is NOT cleared — it persists so that
 * future re-applies can capture the same original baseline.
 */
function recordRevert(scopeKey) {
  const data = loadOwnership();
  const record = data.items[scopeKey];

  if (!record) {
    console.warn(`[OwnershipStore] recordRevert called for unknown scopeKey: ${scopeKey}`);
    return;
  }

  record.appliedByApp      = false;
  record.verificationState = 'verified';
  record.lastVerifiedAt    = new Date().toISOString();

  data.items[scopeKey] = record;
  saveOwnership(data);
  console.log(`[OwnershipStore] revert recorded: ${scopeKey}`);
}

/**
 * Return all records where appliedByApp === true.
 * These are the items the premium-expiry pipeline must revert.
 */
function getAllAppOwned() {
  const data = loadOwnership();
  return Object.values(data.items).filter(r => r.appliedByApp === true);
}

/**
 * Return ALL records (for display / debugging).
 */
function getAllRecords() {
  const data = loadOwnership();
  return Object.values(data.items);
}

module.exports = {
  buildScopeKey,
  captureBaseline,
  recordApply,
  recordRevert,
  getOwnershipRecord,
  getAllAppOwned,
  getAllRecords,
};
