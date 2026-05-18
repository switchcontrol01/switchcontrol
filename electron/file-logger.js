/**
 * file-logger.js
 *
 * Writes console.log/warn/error to on-disk log files so packaged builds
 * leave a trace even when no terminal is attached.
 *
 * Production log files (written to %APPDATA%\SwitchControl\logs):
 *   latest.log   — rolling log for the current run (rotated at 5 MB, 3 rolled files kept)
 *   backend.log  — written by backend-launcher; also rotated
 *
 * Debug / dev log files (only when DEBUG_MODE=true or LOG_VERBOSE=true or in dev build):
 *   startup-YYYY-MM-DD_HH-MM-SS.log — verbose per-launch file for debugging
 *
 * On every startup:
 *   - Rotates latest.log and backend.log if they exceed MAX_FILE_BYTES
 *   - Deletes log files older than MAX_AGE_DAYS
 *   - Enforces MAX_TOTAL_BYTES cap on the entire logs folder (oldest deleted first)
 *
 * MUST be require()d before any other code that calls console.log.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// Lazy reference — critical-logger is required after this module is ready
// to avoid a circular-require chain.
let _criticalLogger = null;
function getCriticalLogger() {
  if (!_criticalLogger) {
    try { _criticalLogger = require('./critical-logger'); } catch (e) {}
  }
  return _criticalLogger;
}

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES  = 5 * 1024 * 1024;   // 5 MB per log file before rotation
const MAX_ROLLED      = 3;                  // keep latest.log.1, .2, .3
const MAX_AGE_MS      = 14 * 24 * 60 * 60 * 1000; // delete files older than 14 days
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;  // 20 MB cap for entire logs folder

// ── Paths ─────────────────────────────────────────────────────────────────────

const APPDATA_BASE = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'SwitchControl')
  : path.join(os.homedir(), 'AppData', 'Roaming', 'SwitchControl');

const LOG_DIR   = path.join(APPDATA_BASE, 'logs');
const CRASH_DIR = path.join(LOG_DIR, 'crashes');

// ── Debug flag (shared with main.js / updater.js) ────────────────────────────

const isDebug = process.env.DEBUG_MODE === 'true' || process.env.LOG_VERBOSE === 'true';

// ── State ─────────────────────────────────────────────────────────────────────

let _stream       = null;  // stream to timestamped startup file (debug only)
let _logFilePath  = null;  // timestamped startup file path (debug only)
let _latestPath   = null;
let _backendPath  = null;
let _initialized  = false;

// ── Utilities ─────────────────────────────────────────────────────────────────

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function isoMs() {
  return new Date().toISOString();
}

function ensureDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (e) {}
}

function ensureCrashDir() {
  try {
    if (!fs.existsSync(CRASH_DIR)) fs.mkdirSync(CRASH_DIR, { recursive: true });
  } catch (e) {}
}

// ── Rotation ──────────────────────────────────────────────────────────────────

/**
 * Rotates `filePath` if it exceeds MAX_FILE_BYTES.
 * Shifts .1 → .2 → .3, deletes beyond MAX_ROLLED.
 */
function rotateIfNeeded(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < MAX_FILE_BYTES) return;

    // Shift rolled files up: .2→.3, .1→.2
    for (let i = MAX_ROLLED - 1; i >= 1; i--) {
      const src  = `${filePath}.${i}`;
      const dest = `${filePath}.${i + 1}`;
      if (fs.existsSync(src)) {
        // If dest already exists at the cap, delete it first
        if (i + 1 > MAX_ROLLED && fs.existsSync(dest)) {
          try { fs.unlinkSync(dest); } catch (e) {}
        }
        try { fs.renameSync(src, dest); } catch (e) {}
      }
    }
    // Rotate current file → .1
    try { fs.renameSync(filePath, `${filePath}.1`); } catch (e) {}
    // Clean up anything beyond MAX_ROLLED
    for (let i = MAX_ROLLED + 1; i <= MAX_ROLLED + 3; i++) {
      const stale = `${filePath}.${i}`;
      if (fs.existsSync(stale)) try { fs.unlinkSync(stale); } catch (e) {}
    }
  } catch (e) {}
}

// ── Folder pruning ────────────────────────────────────────────────────────────

/**
 * Runs on startup. Deletes log files older than MAX_AGE_MS, then enforces
 * the MAX_TOTAL_BYTES cap by removing the oldest files first.
 */
function pruneLogDir() {
  try {
    const names = fs.readdirSync(LOG_DIR);
    const now   = Date.now();

    let entries = [];
    for (const name of names) {
      const fp = path.join(LOG_DIR, name);
      try {
        const stat = fs.statSync(fp);
        if (stat.isFile()) entries.push({ fp, mtime: stat.mtimeMs, size: stat.size });
      } catch (e) {}
    }

    // 1. Delete files older than MAX_AGE_MS
    entries = entries.filter(e => {
      if (now - e.mtime > MAX_AGE_MS) {
        try { fs.unlinkSync(e.fp); } catch (err) {}
        return false;
      }
      return true;
    });

    // 2. Enforce total size cap — delete oldest first
    entries.sort((a, b) => a.mtime - b.mtime);
    let total = entries.reduce((s, e) => s + e.size, 0);
    for (const e of entries) {
      if (total <= MAX_TOTAL_BYTES) break;
      try { fs.unlinkSync(e.fp); total -= e.size; } catch (err) {}
    }
  } catch (e) {}
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  if (_initialized) return;
  _initialized = true;

  ensureDir();

  _latestPath  = path.join(LOG_DIR, 'latest.log');
  _backendPath = path.join(LOG_DIR, 'backend.log');

  // Rotate persistent logs before opening them for this run
  rotateIfNeeded(_latestPath);
  rotateIfNeeded(_backendPath);

  // Prune old/excess log files
  pruneLogDir();

  // Truncate latest.log at start of each run so it reflects only the current session
  try { fs.writeFileSync(_latestPath, '', 'utf-8'); } catch (e) {}

  // Truncate backend.log at start of each run
  try { fs.writeFileSync(_backendPath, '', 'utf-8'); } catch (e) {}

  // In debug/dev mode only: also open a timestamped per-launch log file
  if (isDebug) {
    _logFilePath = path.join(LOG_DIR, `startup-${ts()}.log`);
    try {
      _stream = fs.createWriteStream(_logFilePath, { flags: 'a' });
    } catch (e) {
      _stream = null;
    }
  }

  hookConsole();

  // Initialise critical-logger with the same log directory
  try {
    const cl = getCriticalLogger();
    if (cl) cl.init(LOG_DIR);
  } catch (e) {}

  // Minimal startup header (always)
  const header = [
    '',
    `[${isoMs()}] [INFO] SwitchControl started — PID:${process.pid} platform:${process.platform}/${process.arch} node:${process.versions.node}`,
    '',
  ].join('\n');
  writeRaw(header);

  // Verbose startup header (debug only)
  if (isDebug && _stream) {
    const verboseHeader = [
      '================================================================',
      `  SwitchControl startup log (DEBUG MODE)`,
      `  Started: ${isoMs()}`,
      `  Log file: ${_logFilePath}`,
      `  Latest copy: ${_latestPath}`,
      `  Backend log: ${_backendPath}`,
      `  Process: ${process.execPath}`,
      `  PID: ${process.pid}`,
      `  Platform: ${process.platform} ${process.arch}`,
      `  Node: ${process.versions.node}  Electron: ${process.versions.electron || '(none)'}`,
      '================================================================',
      '',
    ].join('\n');
    try { _stream.write(verboseHeader); } catch (e) {}
  }
}

// ── Write helpers ─────────────────────────────────────────────────────────────

function writeRaw(line) {
  // Always write to latest.log
  if (_latestPath) {
    try { fs.appendFileSync(_latestPath, line, 'utf-8'); } catch (e) {}
  }
  // Debug-only: also write to the per-launch timestamped file
  if (_stream) {
    try { _stream.write(line); } catch (e) {}
  }
}

function format(level, args) {
  const parts = args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch (e) { return String(a); }
    }
    return String(a);
  });
  return `[${isoMs()}] [${level}] ${parts.join(' ')}\n`;
}

// ── TLS / network error helpers ────────────────────────────────────────────────

/**
 * Returns true when an error code or message string indicates a TLS /
 * certificate / network-layer failure.  These are non-fatal — the network
 * request simply fails and the calling code should handle it gracefully.
 * Keeping them separate avoids polluting the crash-dump directory with
 * routine connectivity noise.
 *
 * @param {string} code  err.code  (may be empty string)
 * @param {string} msg   err.message or String(reason)
 * @returns {boolean}
 */
function _isTlsError(code, msg) {
  if (!code && !msg) return false;
  const codeStr = String(code || '').toUpperCase();
  const msgStr  = String(msg  || '').toLowerCase();

  // Chromium net error codes
  if (codeStr.startsWith('ERR_CERT'))                          return true;
  if (codeStr === 'ERR_SSL_PROTOCOL_ERROR')                    return true;
  if (codeStr === 'ERR_SSL_VERSION_OR_CIPHER_MISMATCH')        return true;
  if (codeStr === 'ERR_FAILED')                                {
    // ERR_FAILED alone is too broad — only treat as TLS if the message says so
  }
  // Node.js TLS codes
  if (codeStr === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE')           return true;
  if (codeStr === 'CERT_HAS_EXPIRED')                          return true;
  if (codeStr === 'SELF_SIGNED_CERT_IN_CHAIN')                 return true;
  if (codeStr === 'DEPTH_ZERO_SELF_SIGNED_CERT')               return true;
  if (codeStr === 'CERT_UNTRUSTED')                            return true;
  if (codeStr === 'EPROTO')                                    return true;

  // Message-based heuristics (catch electron-updater error strings)
  if (msgStr.includes('certificate'))                          return true;
  if (msgStr.includes('err_cert'))                             return true;
  if (msgStr.includes('ssl'))                                  return true;
  if (msgStr.includes('tls'))                                  return true;

  return false;
}

/**
 * Extract extra diagnostic context from a TLS/network error object.
 * Returns a compact one-line string (or empty string if nothing useful found).
 *
 * @param {unknown} err
 * @returns {string}
 */
function _tlsExtraInfo(err) {
  if (!err || typeof err !== 'object') return '';
  const parts = [];

  // Attempt to extract hostname from common error properties
  const url = err.url || err.requestUrl || '';
  if (url) {
    try {
      const { hostname } = new URL(url);
      parts.push('hostname=' + hostname);
    } catch (_) {
      parts.push('url=' + String(url).substring(0, 80));
    }
  }
  if (err.code)    parts.push('code='    + err.code);
  if (err.host)    parts.push('host='    + err.host);
  if (err.address) parts.push('address=' + err.address);

  return parts.length ? '[' + parts.join(' ') + ']' : '';
}

// ── Console hook ──────────────────────────────────────────────────────────────

let _origLog, _origWarn, _origError, _origInfo;

function hookConsole() {
  _origLog   = console.log.bind(console);
  _origWarn  = console.warn.bind(console);
  _origError = console.error.bind(console);
  _origInfo  = console.info.bind(console);

  console.log = (...args) => {
    writeRaw(format('LOG', args));
    _origLog(...args);
  };
  console.warn = (...args) => {
    writeRaw(format('WARN', args));
    _origWarn(...args);
  };
  console.error = (...args) => {
    writeRaw(format('ERROR', args));
    _origError(...args);
  };
  console.info = (...args) => {
    writeRaw(format('INFO', args));
    _origInfo(...args);
  };

  process.on('uncaughtException', (err) => {
    try {
      const code      = err && err.code ? String(err.code) : '';
      const isTls     = _isTlsError(code, err && err.message ? err.message : '');
      const prefix    = isTls ? 'uncaughtException [TLS]' : 'uncaughtException';
      const extraInfo = isTls ? _tlsExtraInfo(err) : '';
      writeRaw(format('FATAL', [prefix + ':', err.stack || err.message, extraInfo].filter(Boolean)));
      writeCrashDump(prefix, err.stack || err.message + (extraInfo ? '\n' + extraInfo : ''));
      try {
        const cl = getCriticalLogger();
        if (cl) cl.writeCritical({
          category: 'backend_failure',
          severity: isTls ? 'error' : 'fatal',
          source:   prefix,
          message:  (isTls ? '[TLS] ' : '') + (err.message || String(err)),
          stack:    err.stack,
        });
      } catch (e) {}
    } catch (_e) {}
  });

  process.on('unhandledRejection', (reason) => {
    try {
      const err       = reason instanceof Error ? reason : null;
      const code      = err && err.code ? String(err.code) : '';
      const rawMsg    = err ? err.message : String(reason);
      const isTls     = _isTlsError(code, rawMsg);
      const prefix    = isTls ? 'unhandledRejection [TLS]' : 'unhandledRejection';
      const extraInfo = isTls ? _tlsExtraInfo(err || reason) : '';
      const fullMsg   = err && err.stack ? err.stack : rawMsg;

      // TLS errors are logged as WARN (non-fatal, handled by network layer).
      // Other unhandled rejections are FATAL.
      const level = isTls ? 'WARN' : 'FATAL';
      writeRaw(format(level, [prefix + ':', fullMsg, extraInfo].filter(Boolean)));

      // Only write a crash dump for genuinely unexpected rejections, not TLS noise.
      if (!isTls) {
        writeCrashDump(prefix, fullMsg);
      }
      try {
        const cl = getCriticalLogger();
        if (cl) cl.writeCritical({
          category: 'backend_failure',
          severity: isTls ? 'warning' : 'fatal',
          source:   prefix,
          message:  (isTls ? '[TLS] ' : '') + rawMsg,
          stack:    err ? err.stack : undefined,
        });
      } catch (e) {}
    } catch (_e) {}
  });
}

/**
 * Write a dedicated crash dump file to logs/crashes/.
 * Named crash-YYYY-MM-DD_HH-MM-SS.log so they are easy to sort/find.
 * Keeps the last 20 crash files — oldest are pruned automatically.
 */
function writeCrashDump(type, message) {
  try {
    ensureCrashDir();
    const crashPath = path.join(CRASH_DIR, `crash-${ts()}.log`);
    const content = [
      `SwitchControl crash dump`,
      `Time: ${isoMs()}`,
      `Type: ${type}`,
      `PID: ${process.pid}`,
      `Platform: ${process.platform} ${process.arch}`,
      `Node: ${process.versions.node}`,
      ``,
      message,
    ].join('\n');
    fs.writeFileSync(crashPath, content, 'utf-8');

    // Prune oldest crash files — keep last 20
    try {
      const files = fs.readdirSync(CRASH_DIR)
        .filter(f => f.startsWith('crash-'))
        .sort();
      while (files.length > 20) {
        const oldest = files.shift();
        try { fs.unlinkSync(path.join(CRASH_DIR, oldest)); } catch (_e) {}
      }
    } catch (_e) {}
  } catch (e) {}
}

// ── Backend log helper ────────────────────────────────────────────────────────

function appendBackend(line) {
  if (!_backendPath) return;
  try {
    fs.appendFileSync(_backendPath, `[${isoMs()}] ${line}\n`, 'utf-8');
  } catch (e) {}
}

// ── Path accessor ─────────────────────────────────────────────────────────────

function getPaths() {
  let criticalLog = null;
  try {
    const cl = getCriticalLogger();
    if (cl) criticalLog = cl.getPath();
  } catch (e) {}
  return {
    logDir:      LOG_DIR,
    crashDir:    CRASH_DIR,
    startupLog:  _logFilePath,
    latestLog:   _latestPath,
    backendLog:  _backendPath,
    criticalLog,
  };
}

function getCrashDir() {
  return CRASH_DIR;
}

module.exports = {
  init,
  appendBackend,
  getPaths,
  getCrashDir,
  isDebug,
};
