'use strict';

// ─── Central PowerShell Execution Limiter ─────────────────────────────────────
//
// All PowerShell-backed operations MUST acquire a named slot through this module
// before spawning powershell.exe. This provides:
//
//   1. Per-function single-flight — same function cannot run concurrently with itself.
//   2. Global concurrency ceiling — absolute maximum powershell.exe count across all modules.
//   3. One auditable log stream — "[PS-Limiter]" prefix, readable from Electron console.
//
// Slot key format: "filename::functionName"
// Example:  "main.js::pollTelemetry",  "focus-helper.js::pollTriggers"
//
// Usage:
//   const limiter = require('./powershell-limiter');
//   const token = limiter.tryAcquire({ file: 'main.js', fn: 'pollTelemetry', reason: 'telemetry-poll' });
//   if (!token) return limiter.skippedResult({ file: 'main.js', fn: 'pollTelemetry', reason: 'telemetry-poll' });
//   try { ... await execFile('powershell', ...) ... }
//   finally { limiter.release(token); }

const MAX_CONCURRENT_PS = 6; // absolute ceiling across all modules combined

const _slots = new Map(); // key -> token
let _seq = 0;

/**
 * Try to acquire a named execution slot.
 * Returns a token (opaque object) on success, or null if refused.
 *
 * @param {{ file: string, fn: string, reason: string }} opts
 * @returns {object|null} token on success, null when skipped
 */
function tryAcquire({ file, fn, reason }) {
  const key = `${file}::${fn}`;

  // Rule 1 — per-function single-flight
  if (_slots.has(key)) {
    const owner = _slots.get(key);
    console.log(
      `[PS-Limiter] acquire SKIPPED file=${file} fn=${fn} reason=${reason}` +
      ` activeOwner=${owner.file}::${owner.fn}` +
      ` activeSince=${new Date(owner.since).toISOString()}`
    );
    return null;
  }

  // Rule 2 — global concurrency ceiling
  if (_slots.size >= MAX_CONCURRENT_PS) {
    const owners = [..._slots.keys()].join(', ');
    console.log(
      `[PS-Limiter] acquire SKIPPED (global cap ${MAX_CONCURRENT_PS})` +
      ` file=${file} fn=${fn} reason=${reason} active=[${owners}]`
    );
    return null;
  }

  const id = ++_seq;
  const since = Date.now();
  const token = { key, id, file, fn, reason, since };
  _slots.set(key, token);

  console.log(
    `[PS-Limiter] acquire OK file=${file} fn=${fn} reason=${reason}` +
    ` id=${id} active=${_slots.size}`
  );
  return token;
}

/**
 * Release a previously acquired slot.
 * Safe to call with null/undefined (no-op).
 *
 * @param {object|null} token
 */
function release(token) {
  if (!token) return;
  _slots.delete(token.key);
  const dur = Date.now() - token.since;
  console.log(
    `[PS-Limiter] release file=${token.file} fn=${token.fn}` +
    ` id=${token.id} ms=${dur} active=${_slots.size}`
  );
}

/**
 * Build a structured "skipped" result object.
 * Callers must return this (not null) when tryAcquire fails, so the
 * frontend/caller knows the operation was explicitly skipped — not silently
 * dropped, and not faked as a success.
 *
 * @param {{ file: string, fn: string, reason: string }} opts
 * @returns {{ ok: false, skipped: true, reason: string, activeOwner: string|null, activeSince: number|null }}
 */
function skippedResult({ file, fn, reason }) {
  const key = `${file}::${fn}`;
  const owner = _slots.get(key) || [..._slots.values()][0] || null;
  return {
    ok: false,
    skipped: true,
    reason: 'already_running',
    file,
    fn,
    activeOwner: owner ? `${owner.file}::${owner.fn}` : null,
    activeSince: owner ? owner.since : null,
    _skipReason: reason,
  };
}

/**
 * Diagnostic snapshot of the current limiter state.
 * Call from any IPC handler or log dump to prove idle state.
 *
 * @returns {{ active: number, cap: number, slots: object[] }}
 */
function getState() {
  return {
    active: _slots.size,
    cap: MAX_CONCURRENT_PS,
    slots: [..._slots.values()].map(s => ({ ...s })),
  };
}

module.exports = { tryAcquire, release, skippedResult, getState };
