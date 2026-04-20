/**
 * file-logger.js
 *
 * Writes every console.log/warn/error to a real on-disk log file so we can
 * see exactly what the packaged app did, even when no terminal is attached.
 *
 * Log location on Windows:
 *   %APPDATA%\SwitchControl\logs\startup-YYYY-MM-DD_HH-MM-SS.log
 *   (e.g. C:\Users\<you>\AppData\Roaming\SwitchControl\logs\startup-2026-04-20_14-22-05.log)
 *
 * Also writes:
 *   %APPDATA%\SwitchControl\logs\latest.log   <- always the most recent run
 *   %APPDATA%\SwitchControl\logs\backend.log  <- written by backend-launcher
 *
 * MUST be require()d before any other code that calls console.log.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const APPDATA_BASE = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'SwitchControl')
  : path.join(os.homedir(), 'AppData', 'Roaming', 'SwitchControl');

const LOG_DIR = path.join(APPDATA_BASE, 'logs');

let _stream = null;
let _logFilePath = null;
let _latestPath = null;
let _backendPath = null;
let _initialized = false;

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function isoMs() {
  return new Date().toISOString();
}

function ensureDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (e) {
    // Best-effort; we'll fall back to console-only.
  }
}

function init() {
  if (_initialized) return;
  _initialized = true;

  ensureDir();

  _logFilePath = path.join(LOG_DIR, `startup-${ts()}.log`);
  _latestPath = path.join(LOG_DIR, 'latest.log');
  _backendPath = path.join(LOG_DIR, 'backend.log');

  try {
    _stream = fs.createWriteStream(_logFilePath, { flags: 'a' });
  } catch (e) {
    _stream = null;
  }

  // Truncate latest.log at the start of each run so it always reflects the
  // most recent launch.
  try {
    fs.writeFileSync(_latestPath, '', 'utf-8');
  } catch (e) {}

  // Truncate backend.log at the start of each run too.
  try {
    fs.writeFileSync(_backendPath, '', 'utf-8');
  } catch (e) {}

  hookConsole();

  // Header so each log file is self-describing.
  const header = [
    '',
    '================================================================',
    `  SwitchControl startup log`,
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
  writeRaw(header);
}

function writeRaw(line) {
  if (_stream) {
    try { _stream.write(line); } catch (e) {}
  }
  if (_latestPath) {
    try { fs.appendFileSync(_latestPath, line, 'utf-8'); } catch (e) {}
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

let _origLog, _origWarn, _origError, _origInfo;

function hookConsole() {
  _origLog = console.log.bind(console);
  _origWarn = console.warn.bind(console);
  _origError = console.error.bind(console);
  _origInfo = console.info.bind(console);

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
    writeRaw(format('FATAL', ['uncaughtException:', err.stack || err.message]));
  });
  process.on('unhandledRejection', (reason) => {
    writeRaw(format('FATAL', ['unhandledRejection:', reason && reason.stack ? reason.stack : String(reason)]));
  });
}

function appendBackend(line) {
  if (!_backendPath) return;
  try {
    fs.appendFileSync(_backendPath, `[${isoMs()}] ${line}\n`, 'utf-8');
  } catch (e) {}
}

function getPaths() {
  return {
    logDir: LOG_DIR,
    startupLog: _logFilePath,
    latestLog: _latestPath,
    backendLog: _backendPath,
  };
}

module.exports = {
  init,
  appendBackend,
  getPaths,
};
