'use strict';

/**
 * critical-logger.js
 *
 * Structured critical-event pipeline for SwitchControl.
 *
 * Design goals (strictly enforced):
 *  - ZERO hot-path overhead — writeCritical() is called only when a real failure occurs
 *  - ZERO synchronous disk writes in normal operation — all writes are async (appendFile)
 *  - The sole exception is startup_failure where the process may die before an async
 *    write completes; those use a synchronous write guarded by a try/catch.
 *  - Dedup within a 60 s window per fingerprint so repeated failures produce one entry
 *    rather than unbounded spam.
 *  - In-memory ring buffer keeps the last 100 events for summary generation without
 *    touching disk at all until writeCritical() is explicitly called.
 *
 * Output files (written to the same logs/ directory as file-logger.js):
 *   critical.log  — one JSON object per line, critical events only
 *
 * Public API:
 *   writeCritical(event)          — record a critical event
 *   getCriticalSummary()          — human-readable string for export/display
 *   getRecentEvents(n)            — last n events as plain objects
 *   getPath()                     — path to critical.log (may be null before init)
 *   exportDiagnostics(destDir, notes, logPaths, meta)
 *                                 — copy all logs + write diagnostics.json + summary.txt
 *
 * Categories (machine-readable):
 *   startup_failure | backend_failure | auth_failure | updater_failure |
 *   tweak_failure   | renderer_failure | performance_warning
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set([
  'startup_failure',
  'backend_failure',
  'auth_failure',
  'updater_failure',
  'tweak_failure',
  'renderer_failure',
  'performance_warning',
]);

const VALID_SEVERITIES = new Set(['error', 'fatal', 'warning']);

const RING_BUFFER_SIZE  = 100;  // max events kept in-memory
const DEDUP_WINDOW_MS   = 60_000; // collapse duplicate events within 60 s
const WRITE_DEBOUNCE_MS = 100;    // batch async disk writes into 100 ms windows

// ── State ─────────────────────────────────────────────────────────────────────

let _criticalPath = null;
let _initialized  = false;
let _appMeta      = {};       // { appVersion, platform, isPackaged } — set at init

/** In-memory ring buffer of last RING_BUFFER_SIZE events */
const _ring = [];

/**
 * Dedup map: fingerprint → { count, firstSeen, lastSeen, event }
 * Fingerprint = category:source:message_prefix (first 80 chars)
 */
const _dedup = new Map();

/** Pending events waiting for the next debounced disk write */
let _pending       = [];
let _writeTimer    = null;

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Called once by file-logger.js or main.js after the log directory is known.
 * @param {string}  logDir
 * @param {object}  appMeta  — { appVersion, platform, isPackaged }
 */
function init(logDir, appMeta = {}) {
  if (_initialized) return;
  _initialized = true;
  _appMeta = {
    appVersion: appMeta.appVersion || 'unknown',
    platform:   appMeta.platform   || process.platform,
    isPackaged: typeof appMeta.isPackaged === 'boolean' ? appMeta.isPackaged : false,
  };
  _criticalPath = path.join(logDir, 'critical.log');

  // Truncate at session start so critical.log only reflects the current run.
  try { fs.writeFileSync(_criticalPath, '', 'utf-8'); } catch (e) {}
}

// ── Fingerprint / dedup ───────────────────────────────────────────────────────

function fingerprint(event) {
  const cat    = event.category || 'unknown';
  const src    = event.source   || '';
  const msgPfx = String(event.message || '').substring(0, 80);
  return `${cat}:${src}:${msgPfx}`;
}

/**
 * Returns true if this event should be written as a new entry, or false if it
 * was collapsed into an existing dedup group.  Either way, the ring buffer and
 * dedup map are updated.
 */
function shouldWrite(event, fp) {
  const now = Date.now();
  const existing = _dedup.get(fp);

  if (existing && (now - existing.firstSeen) < DEDUP_WINDOW_MS) {
    // Collapse: just bump the count and lastSeen
    existing.count   += 1;
    existing.lastSeen = new Date(now).toISOString();

    // Update the in-ring entry to reflect the new count
    const ringIdx = _ring.findIndex(e => e._fp === fp);
    if (ringIdx !== -1) {
      _ring[ringIdx].count    = existing.count;
      _ring[ringIdx].lastSeen = existing.lastSeen;
    }
    return false; // do not write a new disk line
  }

  // New event (or dedup window expired) — store and write
  _dedup.set(fp, { count: 1, firstSeen: now, lastSeen: new Date(now).toISOString(), event });
  return true;
}

// ── Ring buffer ───────────────────────────────────────────────────────────────

function pushRing(enriched) {
  if (_ring.length >= RING_BUFFER_SIZE) _ring.shift();
  _ring.push(enriched);
}

// ── Enrich ────────────────────────────────────────────────────────────────────

function enrich(raw) {
  return {
    ts:         new Date().toISOString(),
    category:   raw.category   || 'backend_failure',
    severity:   raw.severity   || 'error',
    source:     raw.source     || 'unknown',
    message:    raw.message    || '',
    stack:      raw.stack      || undefined,
    count:      1,
    firstSeen:  new Date().toISOString(),
    lastSeen:   new Date().toISOString(),
    appVersion: raw.appVersion || _appMeta.appVersion,
    platform:   raw.platform   || _appMeta.platform,
    isPackaged: typeof raw.isPackaged === 'boolean' ? raw.isPackaged : _appMeta.isPackaged,
    userId:     raw.userId     || undefined,
    route:      raw.route      || undefined,
    backendPort: raw.backendPort || undefined,
    _fp:        undefined, // filled in below
  };
}

// ── Async disk write (debounced batch) ────────────────────────────────────────

function flushPending() {
  _writeTimer = null;
  if (!_pending.length || !_criticalPath) return;
  const lines = _pending.splice(0).map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.appendFile(_criticalPath, lines, 'utf-8', () => {}); // fire-and-forget
}

function scheduleDiskWrite(event) {
  _pending.push(event);
  if (!_writeTimer) {
    _writeTimer = setTimeout(flushPending, WRITE_DEBOUNCE_MS);
    if (_writeTimer.unref) _writeTimer.unref(); // don't keep process alive
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a critical event.
 *
 * @param {object} raw
 *   Required: category (one of VALID_CATEGORIES), message
 *   Optional: severity, source, stack, userId, route, backendPort,
 *             appVersion, platform, isPackaged
 */
function writeCritical(raw) {
  if (!raw || typeof raw !== 'object') return;

  // Validate / normalise category
  const cat = VALID_CATEGORIES.has(raw.category) ? raw.category : 'backend_failure';
  const sev = VALID_SEVERITIES.has(raw.severity) ? raw.severity : 'error';
  const event = enrich({ ...raw, category: cat, severity: sev });
  const fp    = fingerprint(event);
  event._fp   = fp;

  if (!shouldWrite(event, fp)) return; // deduped — no disk write needed

  pushRing(event);

  // startup_failure: write synchronously so it survives a crash before event loop drains
  if (cat === 'startup_failure') {
    if (_criticalPath) {
      try { fs.appendFileSync(_criticalPath, JSON.stringify(event) + '\n', 'utf-8'); } catch (e) {}
    }
    return;
  }

  // All other categories: async debounced batch write
  scheduleDiskWrite(event);
}

/**
 * Returns a human-readable multi-line summary of recent critical events.
 * Used for the "Export Diagnostics" summary.txt and the in-app summary.
 */
function getCriticalSummary() {
  if (_ring.length === 0) return 'No critical events recorded this session.';

  const lines = ['=== Critical Event Summary ===', ''];
  const grouped = {};

  for (const e of _ring) {
    if (!grouped[e.category]) grouped[e.category] = [];
    grouped[e.category].push(e);
  }

  for (const [cat, events] of Object.entries(grouped)) {
    lines.push(`[${cat.toUpperCase().replace(/_/g, ' ')}]`);
    for (const e of events) {
      const countStr = e.count > 1 ? ` (×${e.count})` : '';
      const src = e.source ? ` [${e.source}]` : '';
      lines.push(`  • ${e.message}${countStr}${src}`);
      if (e.route) lines.push(`    route: ${e.route}`);
    }
    lines.push('');
  }

  lines.push(`Total unique critical events: ${_ring.length}`);
  return lines.join('\n');
}

/**
 * Returns the last `n` events as plain objects (newest first).
 */
function getRecentEvents(n = 20) {
  return [..._ring].reverse().slice(0, n);
}

/**
 * Returns the absolute path to critical.log (null if not yet initialised).
 */
function getPath() {
  return _criticalPath;
}

/**
 * Copy all log files into destDir and write diagnostics.json + summary.txt.
 * This is called from the IPC handler in main.js.
 *
 * @param {string}   destDir   — absolute path to destination folder
 * @param {string}   notes     — optional user-supplied text
 * @param {object}   logPaths  — { latestLog, backendLog, startupLog } from file-logger
 * @param {object}   extraMeta — { appVersion, osVersion, isPackaged, configFlags }
 * @returns {Promise<{ ok: boolean, path: string, files: string[] }>}
 */
async function exportDiagnostics(destDir, notes, logPaths, extraMeta) {
  // Flush any pending writes to disk first
  if (_writeTimer) { clearTimeout(_writeTimer); flushPending(); }
  // Give async IO a tick to settle
  await new Promise(r => setTimeout(r, 50));

  try {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  } catch (e) {
    return { ok: false, error: `Could not create export directory: ${e.message}` };
  }

  const copiedFiles = [];

  function safeCopy(src, destName) {
    if (!src) return;
    try {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(destDir, destName));
        copiedFiles.push(destName);
      }
    } catch (e) {}
  }

  safeCopy(logPaths.latestLog,  'latest.log');
  safeCopy(logPaths.backendLog, 'backend.log');
  safeCopy(logPaths.startupLog, 'startup.log');
  safeCopy(_criticalPath,       'critical.log');

  // diagnostics.json
  const diagJson = {
    exportedAt:     new Date().toISOString(),
    appVersion:     extraMeta.appVersion    || _appMeta.appVersion,
    osVersion:      extraMeta.osVersion     || `${os.platform()} ${os.release()}`,
    platform:       extraMeta.platform      || _appMeta.platform,
    isPackaged:     extraMeta.isPackaged    ?? _appMeta.isPackaged,
    configFlags:    extraMeta.configFlags   || {},
    criticalEvents: _ring.length,
    userNotes:      notes || '',
    recentCritical: getRecentEvents(10),
  };
  try {
    fs.writeFileSync(path.join(destDir, 'diagnostics.json'), JSON.stringify(diagJson, null, 2), 'utf-8');
    copiedFiles.push('diagnostics.json');
  } catch (e) {}

  // summary.txt
  const summaryLines = [
    `SwitchControl Diagnostic Export`,
    `Exported: ${diagJson.exportedAt}`,
    `App Version: ${diagJson.appVersion}`,
    `OS: ${diagJson.osVersion}`,
    `Platform: ${diagJson.platform}`,
    `Packaged Build: ${diagJson.isPackaged}`,
    '',
  ];
  if (notes) summaryLines.push(`User Notes:\n${notes}\n`);
  summaryLines.push(getCriticalSummary());

  try {
    fs.writeFileSync(path.join(destDir, 'summary.txt'), summaryLines.join('\n'), 'utf-8');
    copiedFiles.push('summary.txt');
  } catch (e) {}

  return { ok: true, path: destDir, files: copiedFiles };
}

module.exports = {
  init,
  writeCritical,
  getCriticalSummary,
  getRecentEvents,
  getPath,
  exportDiagnostics,
};
