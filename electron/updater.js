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
 * URL:      https://pub-c4010f9528c14cbd9848f2c9c7c2306d.r2.dev
 */

const { app, BrowserWindow } = require('electron');
const { isDebug } = require('./file-logger');

let _cl = null;
function cl() {
  if (!_cl) { try { _cl = require('./critical-logger'); } catch (e) {} }
  return _cl;
}

// ── Provider constants ────────────────────────────────────────────────────────
// Single source of truth — never hardcode these strings elsewhere in this file.

const UPDATE_PROVIDER = 'generic';
const UPDATE_BASE_URL = 'https://pub-c4010f9528c14cbd9848f2c9c7c2306d.r2.dev';

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

// Cached reference to the main BrowserWindow.
// We hold this so download-progress (which fires every ~100 ms during a download)
// does not call BrowserWindow.getAllWindows() on every tick.
let _mainWindow = null;

/** Call once after the main window is created so broadcast can target it directly. */
function setMainWindow(win) {
  _mainWindow = win;
}

/**
 * Returns true when an error message indicates that the update metadata file
 * (latest.yml) simply hasn't been published yet — not a real failure.
 */
function isUpdateNotFound(msg) {
  if (!msg) return false;
  return (
    msg.includes('404') ||
    msg.toLowerCase().includes('not found') ||
    msg.includes('latest.yml')
  );
}

function broadcast(eventName, extra = {}) {
  const payload = { event: eventName, state: { ...state, ...extra } };
  // Prefer the cached main window to avoid enumerating all windows on every
  // download-progress tick (fires every ~100 ms during a download).
  const targets = _mainWindow && !_mainWindow.isDestroyed()
    ? [_mainWindow]
    : BrowserWindow.getAllWindows();
  for (const win of targets) {
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

  // ── Code signing verification guard ─────────────────────────────────────
  // electron-updater verifies SHA-512 in latest.yml by default when publisher
  // name is configured. Windows requires a code-signing certificate (EV or
  // OV) via WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD environment variables at
  // build time. Without it, SmartScreen will flag the installer and auto-
  // update hashes won't be verifiable. Log a startup warning if unsigned.
  const isSigned = process.env.WIN_CSC_LINK || (app.isPackaged && process.platform === 'win32');
  if (!isSigned) {
    console.warn('[Updater] WARNING: no code-signing certificate detected. Installers will trigger SmartScreen warnings and update verification may fail.');
  }

  // ── Explicit feed URL override ─────────────────────────────────────────────
  // setFeedURL overrides the app-update.yml baked into the installer at build
  // time. This guarantees the correct R2 host is used regardless of which
  // package.json was in effect when the installer was produced.
  autoUpdater.setFeedURL({
    provider: UPDATE_PROVIDER,
    url:      UPDATE_BASE_URL,
    channel:  electronChannel,
  });

  // ── Runtime proof log ─────────────────────────────────────────────────────
  if (isDebug) {
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
  } else {
    console.log(`[Updater] init — v${state.currentVersion} | channel:${state.channel} | ${UPDATE_BASE_URL}`);
  }

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
    if (isDebug) {
      console.log('[Updater] Downloading: ' + pct + '% @ ' + Math.round((progress.bytesPerSecond ?? 0) / 1024) + ' KB/s');
    }
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

    // A 404 on latest.yml simply means no update has been published yet.
    // Treat it as "not-available" — not a failure — so it doesn't pollute
    // critical.log and doesn't increment the consecutive-failure counter.
    if (isUpdateNotFound(msg)) {
      console.warn('[Updater] No update file found (404) — treating as not-available');
      _consecutiveFailures = 0;
      state = { ...state, ...resetTransientState(), status: 'not-available', checkedAt: new Date().toISOString() };
      broadcast('update-not-available');
      return;
    }

    _consecutiveFailures += 1;
    console.error('[Updater] Error (consecutive failures: ' + _consecutiveFailures + '):', msg);
    state = {
      ...state,
      status: 'error',
      errorMessage: msg,
    };
    broadcast('error');
    try {
      cl()?.writeCritical({
        category: 'updater_failure',
        severity: 'error',
        source:   'autoUpdater',
        message:  `Updater error (failure #${_consecutiveFailures}): ${msg}`,
        stack:    err?.stack,
      });
    } catch (e) {}
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
    // checkForUpdates() returns a Promise. The try-catch only catches
    // synchronous throws — we MUST attach .catch() to the returned Promise
    // to prevent TLS/network rejections from becoming unhandled rejections
    // that crash the process via the global unhandledRejection handler.
    const checkPromise = _autoUpdater.checkForUpdates();
    if (checkPromise && typeof checkPromise.catch === 'function') {
      checkPromise.catch((err) => {
        const msg = err?.message || 'checkForUpdates promise rejected';
        const code = err?.code || '';

        // 404 = no update published yet — treat as not-available, not an error.
        if (isUpdateNotFound(msg)) {
          console.warn('[Updater] No update file found (404) — treating as not-available');
          _consecutiveFailures = 0;
          state = { ...state, ...resetTransientState(), status: 'not-available', checkedAt: new Date().toISOString() };
          broadcast('update-not-available');
          return;
        }

        const isTlsError = code.startsWith('ERR_CERT') ||
          code === 'ERR_SSL_PROTOCOL_ERROR' ||
          code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
          (msg.includes('certificate') || msg.includes('CERT') || msg.includes('TLS') || msg.includes('SSL'));

        if (isTlsError) {
          console.warn(`[Updater] TLS/certificate failure (non-fatal) — code=${code} msg=${msg}`);
        } else {
          console.error(`[Updater] checkForUpdates promise rejected — code=${code} msg=${msg}`);
        }
        _consecutiveFailures += 1;
        state = { ...state, status: 'error', errorMessage: msg };
        broadcast('error');
        try {
          cl()?.writeCritical({
            category: 'updater_failure',
            severity: isTlsError ? 'warning' : 'error',
            source: 'checkForUpdates:promise',
            message: `${isTlsError ? '[TLS] ' : ''}Updater check rejected: ${msg}`,
            stack: err?.stack,
          });
        } catch (e) {}
      });
    }
    return { ok: true };
  } catch (err) {
    const msg = err?.message || 'checkForUpdates failed';
    _consecutiveFailures += 1;
    console.error('[Updater] checkForUpdates threw (soft fail):', msg);
    // SOFT FAIL: do NOT hard-crash the app. Set state to error so UI can
    // show "Check failed" but the process continues running normally.
    state = { ...state, status: 'error', errorMessage: msg };
    broadcast('error');
    try { cl()?.writeCritical({ category: 'updater_failure', severity: 'error', source: 'checkForUpdates', message: msg, stack: err?.stack }); } catch (e) {}
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
    const dlPromise = _autoUpdater.downloadUpdate();
    // downloadUpdate() returns a Promise — attach .catch() so that any TLS or
    // network rejection during the download is handled as a structured error
    // rather than an unhandled rejection that pollutes the crash-dump directory.
    if (dlPromise && typeof dlPromise.catch === 'function') {
      dlPromise.catch((err) => {
        const msg = err?.message || 'downloadUpdate promise rejected';
        const code = err?.code || '';
        const isTls = code.startsWith('ERR_CERT') ||
          code === 'ERR_SSL_PROTOCOL_ERROR' ||
          code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
          msg.toLowerCase().includes('certificate') ||
          msg.toLowerCase().includes('cert') ||
          msg.toLowerCase().includes('tls') ||
          msg.toLowerCase().includes('ssl');

        if (isTls) {
          console.warn(`[Updater] TLS/certificate failure during download (non-fatal) — code=${code} msg=${msg}`);
        } else {
          console.error(`[Updater] downloadUpdate promise rejected — code=${code} msg=${msg}`);
        }
        _consecutiveFailures += 1;
        state = { ...state, status: 'error', errorMessage: msg };
        broadcast('error');
        try {
          cl()?.writeCritical({
            category: 'updater_failure',
            severity: isTls ? 'warning' : 'error',
            source: 'downloadUpdate:promise',
            message: `${isTls ? '[TLS] ' : ''}Download rejected: ${msg}`,
            stack: err?.stack,
          });
        } catch (e) {}
      });
    }
    return { ok: true };
  } catch (err) {
    const msg = err?.message || 'downloadUpdate failed';
    _consecutiveFailures += 1;
    console.error('[Updater] downloadUpdate threw (soft fail):', msg);
    state = { ...state, status: 'error', errorMessage: msg };
    broadcast('error');
    try { cl()?.writeCritical({ category: 'updater_failure', severity: 'error', source: 'downloadUpdate', message: msg, stack: err?.stack }); } catch (e) {}
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
  setMainWindow,
  // Exported for testing / diagnostics only:
  canCheck,
  canDownload,
  canInstall,
};
