'use strict';

/**
 * SwitchControl Auto-Updater Service
 * ------------------------------------
 * Owns the entire update lifecycle inside the main process.
 * Renderer only consumes state via IPC — it never drives updates itself.
 *
 * Update channel: stable (beta-ready structure in place)
 * Update host:    Generic provider → https://pub-c4010f9528c14cbd9848f2c9c7c2306d.r2.dev
 *                 (temporary — will switch to https://releases.switchcontrol.org once
 *                  domain DNS control is available; change build.publish.url in package.json)
 * Publish config: electron/package.json  build.publish
 */

const { app, BrowserWindow } = require('electron');

// ── State ────────────────────────────────────────────────────────────────────

/** @type {UpdaterState} */
let state = {
  status: 'idle',            // idle | checking | available | not-available | downloading | downloaded | error
  currentVersion: null,      // filled in initUpdater after app is ready
  availableVersion: null,
  downloadPercent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
  releaseNotes: null,
  releaseDate: null,
  errorMessage: null,
  checkedAt: null,
  urgency: 'normal',         // normal | recommended | critical
  channel: 'stable',
};

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

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * initUpdater — wire all autoUpdater events.
 * Must be called once the Electron app is ready.
 * In dev mode (isDev=true) this is a no-op so we never crash in Replit.
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
    console.warn('[Updater] electron-updater not available:', err.message);
    state.status = 'idle';
    return;
  }

  autoUpdater.autoDownload = false;         // user must trigger download
  autoUpdater.autoInstallOnAppQuit = true;  // install silently on next quit if downloaded
  autoUpdater.allowDowngrade = false;
  autoUpdater.channel = state.channel;

  // Disable forced dev-update-config fallback
  autoUpdater.forceDevUpdateConfig = false;

  console.log('[Updater] Initialized. Version:', state.currentVersion, '| Channel:', state.channel);

  // ── Events ───────────────────────────────────────────────────────────────

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update...');
    state = { ...state, status: 'checking', checkedAt: new Date().toISOString() };
    broadcast('checking-for-update');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version, '| Date:', info.releaseDate);
    const urgency = parseUrgency(info.releaseNotes);
    state = {
      ...state,
      status: 'available',
      availableVersion: info.version,
      releaseNotes: info.releaseNotes || null,
      releaseDate: info.releaseDate || null,
      urgency,
    };
    broadcast('update-available');
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] No update available. Current version is latest.');
    state = { ...state, status: 'not-available', checkedAt: new Date().toISOString() };
    broadcast('update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent ?? 0);
    console.log(`[Updater] Downloading: ${pct}% @ ${Math.round((progress.bytesPerSecond ?? 0) / 1024)} KB/s`);
    state = {
      ...state,
      status: 'downloading',
      downloadPercent: pct,
      bytesPerSecond: progress.bytesPerSecond ?? 0,
      transferred: progress.transferred ?? 0,
      total: progress.total ?? 0,
    };
    broadcast('download-progress');
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Download complete. Ready to install:', info.version);
    state = {
      ...state,
      status: 'downloaded',
      downloadPercent: 100,
      availableVersion: info.version,
      releaseNotes: info.releaseNotes || state.releaseNotes,
      releaseDate: info.releaseDate || state.releaseDate,
    };
    broadcast('update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    const msg = err?.message || 'Unknown updater error';
    console.error('[Updater] Error:', msg);
    state = { ...state, status: 'error', errorMessage: msg };
    broadcast('error');
  });

  // Store reference so checkForUpdates / downloadUpdate can use it
  _autoUpdater = autoUpdater;
}

// Internal reference set after init
let _autoUpdater = null;

function checkForUpdates() {
  if (!_autoUpdater) {
    console.warn('[Updater] checkForUpdates called before init or in dev mode.');
    return;
  }
  try {
    _autoUpdater.checkForUpdates();
  } catch (err) {
    const msg = err?.message || 'checkForUpdates failed';
    console.error('[Updater]', msg);
    state = { ...state, status: 'error', errorMessage: msg };
    broadcast('error');
  }
}

function downloadUpdate() {
  if (!_autoUpdater) {
    console.warn('[Updater] downloadUpdate called before init or in dev mode.');
    return;
  }
  try {
    console.log('[Updater] Starting download...');
    _autoUpdater.downloadUpdate();
  } catch (err) {
    const msg = err?.message || 'downloadUpdate failed';
    console.error('[Updater]', msg);
    state = { ...state, status: 'error', errorMessage: msg };
    broadcast('error');
  }
}

function quitAndInstall() {
  if (!_autoUpdater) {
    console.warn('[Updater] quitAndInstall called before init or in dev mode.');
    return;
  }
  console.log('[Updater] Triggering quit-and-install...');
  _autoUpdater.quitAndInstall(false, true);
}

function getState() {
  return { ...state };
}

module.exports = { initUpdater, checkForUpdates, downloadUpdate, quitAndInstall, getState };
