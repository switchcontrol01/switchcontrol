'use strict';

// ─── Central PowerShell Execution Limiter ─────────────────────────────────────
//
// All PowerShell-backed operations MUST acquire a named slot through this module
// before spawning powershell.exe. This provides:
//
//   1. Per-function single-flight — same function cannot run concurrently with itself.
//   2. Global concurrency ceiling — absolute maximum powershell.exe count across all modules.
//   3. One auditable log stream — "[PS-Limiter]" prefix, readable from Electron console.
//   4. 60-second rolling call counter — proves idle = 0 PS calls per minute.
//
// Slot key format: "filename::functionName"
// Usage:
//   const token = limiter.tryAcquire({ file: 'main.js', fn: 'pollTelemetry', reason: 'telemetry-poll' });
//   if (!token) return limiter.skippedResult({ ... });
//   try { ... } finally { limiter.release(token); }

const MAX_CONCURRENT_PS = 6;

const _slots = new Map(); // key -> token
let _seq = 0;

// ── 60-second rolling call log ─────────────────────────────────────────────────
// Each entry: { ts: Date.now(), file, fn, durationMs }
// Entries older than 60s are pruned on every acquire/release.
const _callLog = [];    // rolling window
let _lastCallTs = null; // timestamp of most recent completed call

// Periodic background prune: if the app is idle for a long time with no PS
// calls, _callLog is never pruned until the next acquire/release. Entries are
// small but this keeps memory predictable on long-running sessions.
setInterval(() => _pruneCallLog(), 60_000).unref?.();

function _pruneCallLog() {
  const cutoff = Date.now() - 60_000;
  while (_callLog.length > 0 && _callLog[0].ts < cutoff) _callLog.shift();
}

function tryAcquire({ file, fn, reason }) {
  _pruneCallLog();
  const key = `${file}::${fn}`;

  if (_slots.has(key)) {
    const owner = _slots.get(key);
    console.log(
      `[PS-Limiter] acquire SKIPPED (already_running) file=${file} fn=${fn} reason=${reason}` +
      ` activeOwner=${owner.file}::${owner.fn}` +
      ` activeSince=${new Date(owner.since).toISOString()}`
    );
    return null;
  }

  if (_slots.size >= MAX_CONCURRENT_PS) {
    const owners = [..._slots.keys()].join(', ');
    console.log(
      `[PS-Limiter] acquire SKIPPED (global_cap_reached cap=${MAX_CONCURRENT_PS})` +
      ` file=${file} fn=${fn} reason=${reason} active=[${owners}]`
    );
    return null;
  }

  const id = ++_seq;
  const since = Date.now();
  const token = { key, id, file, fn, reason, since };
  _slots.set(key, token);

  console.log(`[PS] start file=${file} fn=${fn} reason=${reason} id=${id} active=${_slots.size}`);
  return token;
}

function release(token) {
  if (!token) return;
  // Guard against double-release: a second call with the same token would
  // delete a slot that may now belong to a different acquire, and would write
  // a misleading log entry with a near-zero or negative duration.
  if (!_slots.has(token.key)) return;
  _pruneCallLog();
  _slots.delete(token.key);
  const durationMs = Date.now() - token.since;
  _lastCallTs = Date.now();
  _callLog.push({ ts: _lastCallTs, file: token.file, fn: token.fn, durationMs });
  console.log(
    `[PS] end file=${token.file} fn=${token.fn}` +
    ` id=${token.id} duration=${durationMs}ms active=${_slots.size} calls60s=${_callLog.length}`
  );
}

function skippedResult({ file, fn, reason }) {
  const key = `${file}::${fn}`;
  const isSelfBlocked = _slots.has(key);
  // For the global-cap case the specific key isn't in the map, so we fall back
  // to any active slot — it's informative but not the specific blocking owner.
  const owner = _slots.get(key) || [..._slots.values()][0] || null;
  return {
    ok: false,
    skipped: true,
    // Distinguish why the acquire was skipped so callers can log the right reason.
    reason: isSelfBlocked ? 'already_running' : 'global_cap_reached',
    file,
    fn,
    activeOwner: owner ? `${owner.file}::${owner.fn}` : null,
    activeSince: owner ? owner.since : null,
    _skipReason: reason,
  };
}

/**
 * Diagnostic snapshot.
 * Returns everything needed for the debug:getPerformanceInfo IPC handler.
 */
function getState() {
  _pruneCallLog();
  return {
    active:            _slots.size,
    cap:               MAX_CONCURRENT_PS,
    slots:             [..._slots.values()].map(s => ({ ...s })),
    callsLast60s:      _callLog.length,
    lastCallTimestamp: _lastCallTs,
    recentCalls:       _callLog.slice(-10).map(e => ({ ...e })), // last 10 calls
  };
}

module.exports = { tryAcquire, release, skippedResult, getState };
