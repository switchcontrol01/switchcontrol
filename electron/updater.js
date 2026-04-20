'use strict';

/**
 * SwitchControl Auto-Updater Service
 * ------------------------------------
 * Owns the entire update lifecycle inside the main process.
 * Renderer consumes state via IPC only — it never drives update logic.
 *
 * ── Trust model ──────────────────────────────────────────────────────────────
 * - Renderer never owns updater logic. It reads state and sends commands via
 *   IPC. Main process is the sole authority on all state transitions.
 * - Updater trusts ONLY the configured generic provider host.
 * - Metadata and installer MUST live on the same backend (R2 generic provider).
 *   Never split them across providers.
 * - Stable track resolves through latest.yml. The user-facing 'stable' track
 *   maps internally to electron-updater channel 'latest', which reads latest.yml.
 * - Metadata (latest.yml) is published LAST in the release flow, after the
 *   installer and blockmap are already live. A live latest.yml therefore always
 *   points at an already-present binary. This ordering is intentional.
 * - Downgrade is intentionally disabled — autoUpdater.allowDowngrade = false.
 * - Packages are cryptographically signed by electron-builder; electron-updater
 *   verifies the SHA-512 hash from latest.yml before applying any update.
 *
 * ── Channel model ────────────────────────────────────────────────────────────
 * User-facing release track : 'stable'  (default)
 *                           : 'beta'    (future; not active)
 * electron-updater channel  : 'latest'  → reads latest.yml  (stable)
 *                           : 'beta'    → reads beta.yml     (beta)
 *
 * getMetadataFileForChannel() is the single place that owns the mapping.
 * autoUpdater.channel is always set from getElectronChannel(), never hardcoded.
 *
 * ── State guards ─────────────────────────────────────────────────────────────
 * checkForUpdates  : allowed from idle | not-available | error | available
 * downloadUpdate   : allowed from available only
 * quitAndInstall   : allowed from downloaded only
 *
 * ── Publish config ───────────────────────────────────────────────────────────
 * See electron/package.json → build.publish
 * Provider: generic
 * URL:      https://releases.switchcontrol.org
 */

const { app, BrowserWindow } = require('electron');

// ── Provider constants ────────────────────────────────────────────────────────
// Single source of truth — never hardcode these strings elsewhere in this file.

const UPDATE_PROVIDER = 'generic';
const UPDATE_BASE_URL = 'https://releases.switchcontrol.org';

// ── Release track configuration ───────────────────────────────────────────────

/**
 * Maps the user-facing release track to the metadata filename that
 * electron-updater's generic provider will request.
 *
 * @param {string} track - User-facing release track ('stable' | 'beta')
 * @returns {string} Metadata filename (e.g. 'latest.yml')
 */
function getMetadataFileForChannel(track) {
  if (track === 'beta') return 'beta.yml';
  return 'latest.yml';
}

/**
 * Maps the user-facing release track to the electron-updater channel string.
 * electron-updater constructs the metadata URL as:
 *   <baseUrl>/<channel>.yml   (where channel is what autoUpdater.channel is set to)
 *
 * For the stable track, we use 'latest' so that electron-updater reads latest.yml.
 * This keeps our release host clean (latest.yml is the canonical stable file).
 *
 * @param {string} track - User-facing release track
 * @returns {string} electron-updater channel string
 */
function getElectronChannel(track) {
  if (track === 'beta') return 'beta';
  return 'latest';
}

// Active release track.  Change here to activate beta; all downstream code
// reads RELEASE_TRACK through the helpers above.
const RELEASE_TRACK = 'stable';

// ── State ────────────────────────────────────────────────────────────────────

/** @type {UpdaterState} */
let state = {
  status: 'idle',
  currentVersion: null,
  availableVersion: null,
  downloadPercent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
  releaseNotes: null,
  releaseDate: null,
  errorMessage: null,
  checkedAt: null,
  urgency: 'normal',
  channel: RELEASE_TRACK,
};

// Consecutive failure counter — tracks repeated check/download failures.
// Reset to 0 on any successful outcome.
let _consecutiveFailures = 0;

// Internal reference to autoUpdater — set once in initUpdater.
let _autoUpdater = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function broadcast(eventName, extra = {}) {
  const payload = { event: eventName, state: { ...state, ...extra } };
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send('updater:event', payload);
    }
  }
}

function parseUrgency(releaseNotes) {
  if (!releaseNotes) return 'normal';
  const lower = String(releaseNotes).toLowerCase();
  if (lower.includes('[critical]')) return 'critical';
  if (lower.includes('[recommended]')) return 'recommended';
  return 'normal';
}

/**
 * Returns a clean slate for all transient update fields.
 * Call before every new check so the UI never shows leftovers
 * from a previous check cycle.
 */
function resetTransientState() {
  return {
    availableVersion: null,
    downloadPercent: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: 0,
    releaseNotes: null,
    releaseDate: null,
    errorMessage: null,
    urgency: 'normal',
  };
}

// ── State guards ──────────────────────────────────────────────────────────────

function canCheck(status) {
  return ['idle', 'not-available', 'error', 'available'].includes(status);
}

function canDownload(status) {
  return status === 'available';
}

function canInstall(status) {
  return status === 'downloaded';
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * initUpdater — wire all autoUpdater events.
 * Must be called once the Electron app is ready.
 * In dev mode this is a no-op so we never crash on the dev server.
 *
 * @param {boolean} isDev
 */
function initUpdater(isDev = false) {
  state.currentVersion = app.getVersion();

  if (isDev) {
    console.log('[Updater] Dev mode — updater disabled (no packaged binary).');
    state.status = 'idle';
    return;
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    console.error('[Updater] FATAL: electron-updater not available:', err.message);
    state.status = 'idle';
    return;
  }

  // ── Channel validation ────────────────────────────────────────────────────
  // Guard against unexpected values so the updater always operates on a known
  // track. Any unsupported value falls back to stable.
  if (!['stable', 'beta'].includes(state.channel)) {
    console.warn('[Updater] Unsupported channel "' + state.channel + '" — falling back to stable.');
    state.channel = 'stable';
  }

  const electronChannel = getElectronChannel(state.channel);
  const metadataFile    = getMetadataFileForChannel(state.channel);

  if (!app.isPackaged) {
    // This branch should never be reached in a packaged build since we guard
    // at the top of initUpdater, but double-check anyway.
    console.warn('[Updater] WARNING: initUpdater reached non-dev path in unpackaged build.');
  }

  autoUpdater.autoDownload          = false;
  autoUpdater.autoInstallOnAppQuit  = true;
  autoUpdater.allowDowngrade        = false;
  autoUpdater.forceDevUpdateConfig  = false;
  autoUpdater.channel               = electronChannel;

  // ── Runtime proof log ─────────────────────────────────────────────────────
  // Printed on every packaged startup so future debugging is never guesswork.
  console.log('[Updater] ========== UPDATER INIT ==========');
  console.log('[Updater] Provider     :', UPDATE_PROVIDER);
  console.log('[Updater] Base URL     :', UPDATE_BASE_URL);
  console.log('[Updater] Channel      :', state.channel, '(user-facing)');
  console.log('[Updater] Metadata     :', metadataFile);
  console.log('[Updater] Feed URL     :', UPDATE_BASE_URL + '/' + metadataFile);
  console.log('[Updater] Electron ch  :', electronChannel, '(internal, passed to autoUpdater)');
  console.log('[Updater] Current ver  :', state.currentVersion);
  console.log('[Updater] autoDownload : false (user-initiated only)');
  console.log('[Updater] allowDowngr  : false');
  console.log('[Updater] =====================================');

  // ── Events ───────────────────────────────────────────────────────────────

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update...');
    state = {
      ...state,
      ...resetTransientState(),
      status: 'checking',
      checkedAt: new Date().toISOString(),
    };
    broadcast('checking-for-update');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version, '| Date:', info.releaseDate);
    _consecutiveFailures = 0;
    const urgency = parseUrgency(info.releaseNotes);
    state = {
      ...state,
      status: 'available',
      availableVersion: info.version || null,
      releaseNotes: info.releaseNotes || null,
      releaseDate: info.releaseDate || null,
      urgency,
      errorMessage: null,
    };
    broadcast('update-available');
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] No update available — current version is latest.');
    _consecutiveFailures = 0;
    state = {
      ...state,
      ...resetTransientState(),
      status: 'not-available',
      checkedAt: new Date().toISOString(),
    };
    broadcast('update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent ?? 0);
    console.log('[Updater] Downloading: ' + pct + '% @ ' + Math.round((progress.bytesPerSecond ?? 0) / 1024) + ' KB/s');
    state = {
      ...state,
      status: 'downloading',
      downloadPercent: pct,
      bytesPerSecond: progress.bytesPerSecond ?? 0,
      transferred: progress.transferred ?? 0,
      total: progress.total ?? 0,
      errorMessage: null,
    };
    broadcast('download-progress');
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Download complete. Ready to install:', info.version);
    _consecutiveFailures = 0;
    state = {
      ...state,
      status: 'downloaded',
      downloadPercent: 100,
      availableVersion: info.version || state.availableVersion,
      releaseNotes: info.releaseNotes || state.releaseNotes,
      releaseDate: info.releaseDate || state.releaseDate,
      errorMessage: null,
    };
    broadcast('update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    const msg = err?.message || 'Unknown updater error';
    _consecutiveFailures += 1;
    console.error('[Updater] Error (consecutive failures: ' + _consecutiveFailures + '):', msg);
    state = {
      ...state,
      status: 'error',
      errorMessage: msg,
    };
    broadcast('error');
  });

  _autoUpdater = autoUpdater;
}

function checkForUpdates() {
  if (!_autoUpdater) {
    console.warn('[Updater] checkForUpdates called before init or in dev mode.');
    return { ok: false, reason: 'not-initialized' };
  }

  if (!canCheck(state.status)) {
    console.warn('[Updater] checkForUpdates blocked in state:', state.status);
    return { ok: false, reason: 'invalid-state', state: state.status };
  }

  state = {
    ...state,
    ...resetTransientState(),
    status: 'checking',
    checkedAt: new Date().toISOString(),
  };
  broadcast('checking-for-update');

  try {
    _autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    const msg = err?.message || 'checkForUpdates failed';
    _consecutiveFailures += 1;
    console.error('[Updater] checkForUpdates threw:', msg);
    state = { ...state, status: 'error', errorMessage: msg };
    broadcast('error');
    return { ok: false, reason: 'exception', error: msg };
  }
}

function downloadUpdate() {
  if (!_autoUpdater) {
    console.warn('[Updater] downloadUpdate called before init or in dev mode.');
    return { ok: false, reason: 'not-initialized' };
  }

  if (!canDownload(state.status)) {
    console.warn('[Updater] downloadUpdate blocked in state:', state.status);
    return { ok: false, reason: 'invalid-state', state: state.status };
  }

  try {
    console.log('[Updater] Starting download...');
    _autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    const msg = err?.message || 'downloadUpdate failed';
    _consecutiveFailures += 1;
    console.error('[Updater] downloadUpdate threw:', msg);
    state = { ...state, status: 'error', errorMessage: msg };
    broadcast('error');
    return { ok: false, reason: 'exception', error: msg };
  }
}

function quitAndInstall() {
  if (!_autoUpdater) {
    console.warn('[Updater] quitAndInstall called before init or in dev mode.');
    return { ok: false, reason: 'not-initialized' };
  }

  if (!canInstall(state.status)) {
    console.warn('[Updater] quitAndInstall blocked in state:', state.status);
    return { ok: false, reason: 'invalid-state', state: state.status };
  }

  console.log('[Updater] Triggering quit-and-install...');
  _autoUpdater.quitAndInstall(false, true);
  return { ok: true };
}

function getState() {
  return { ...state };
}

module.exports = {
  initUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  getState,
  // Exported for testing / diagnostics only:
  canCheck,
  canDownload,
  canInstall,
};
