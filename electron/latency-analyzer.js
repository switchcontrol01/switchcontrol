'use strict';
/**
 * latency-analyzer.js
 *
 * SwitchControl Latency Analyzer — Windows user-mode backend.
 *
 * Collects system-wide DPC CPU-time %, interrupt CPU-time %, and total page faults/sec using
 * Windows' locale-independent raw processor and formatted memory CIM classes.
 * Also scans installed drivers (driverquery) and audio devices (WMI).
 *
 * Per-driver execution timing, scheduler delay, audio dropout risk, and input
 * latency are not collected by this analyzer.
 *
 * Security:
 *  - All PowerShell commands use fixed argument arrays; no renderer input is
 *    interpolated into shell commands.
 *  - No shell: true used.
 *  - The analysis loop is stopped and child processes are killed on stop/reset.
 */

const { execFile } = require('child_process');
const path = require('path');

// ── Constants ──────────────────────────────────────────────────────────────────

const SAMPLE_INTERVAL_MS = 2000;
const PS_TIMEOUT_MS      = 8000;  // per-sample PowerShell timeout
// Note: concurrent-poll prevention is done by the `if (_sampleProcess)` guard
// in poll() — there is no semaphore; the guard is the correct single-flight mechanism.

// ── Module state ───────────────────────────────────────────────────────────────

let _sessionActive    = false;
let _intervalHandle   = null;
let _sampleProcess    = null;     // active child_process for sample collection only
let _sampleCallback   = null;     // (sample) => void — set by caller
let _startedAt        = 0;
let _sampleCount      = 0;
let _lastError        = null;
let _consecutiveFailures = 0;
let _generation = 0;
const _lifecycleLog = (event, fields = {}) => console.info('[LatencyAnalyzer]', JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));

// ── PowerShell runner ──────────────────────────────────────────────────────────

/**
 * Run a PowerShell command and return stdout as a string.
 * Uses execFile (not spawn/shell) for security; no user input is interpolated.
 * @param {object} [opts] - optional: { trackAs: 'sample' | 'scan' } to set the right process ref
 */
function runPS(script, timeoutMs = PS_TIMEOUT_MS, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command', script,
      ],
      { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (opts.trackAs === 'sample' && _sampleProcess === child) _sampleProcess = null;
        if (err) return reject(err);
        resolve((stdout || '').trim());
      }
    );
    if (opts.trackAs === 'sample') _sampleProcess = child;
  });
}

// ── Proper CSV line parser ─────────────────────────────────────────────────────
// Handles quoted fields containing commas and escaped double-quotes ("").

function parseCSVLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

// ── Performance counter poll ───────────────────────────────────────────────────

function parseCounterOutput(output, now = Date.now()) {
  const value = JSON.parse(output);
  const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if (!value || value.source !== 'Windows PerfOS' ||
      !finite(value.sampledAt, 1, now + 5000) || now - value.sampledAt > 10000 ||
      !finite(value.dpcPct, 0, 100) || !finite(value.interruptPct, 0, 100) ||
      !finite(value.pageFaultsPerSec, 0, 10000000)) {
    throw new Error('Windows returned missing, stale, or out-of-range performance counters.');
  }
  return {
    sampledAt: value.sampledAt,
    source: value.source,
    dpcPct: value.dpcPct,
    interruptPct: value.interruptPct,
    pageFaultsPerSec: value.pageFaultsPerSec,
  };
}

function parseRawCounterOutput(output, previous = null, now = Date.now()) {
  const value = JSON.parse(output);
  if (!value || value.source !== 'Windows PerfOS' ||
      !Number.isFinite(value.sampledAt) || value.sampledAt <= 0 ||
      value.sampledAt > now + 5000 || now - value.sampledAt > 10000 ||
      !Number.isFinite(value.pageFaultsPerSec) || value.pageFaultsPerSec < 0 ||
      value.pageFaultsPerSec > 10000000) {
    throw new Error('Windows returned invalid or stale raw performance data.');
  }
  const counter = key => {
    // Preserve 64-bit counters and timestamps across the JSON boundary.
    if (typeof value[key] !== 'string' || !/^\d{1,20}$/.test(value[key])) {
      throw new Error(`Windows returned a missing or invalid ${key} counter.`);
    }
    const parsed = BigInt(value[key]);
    if (parsed > 18446744073709551615n) throw new Error('Windows counter exceeded uint64.');
    return parsed;
  };
  const current = {
    timestamp100ns: counter('timestamp100ns'),
    dpc100ns: counter('dpc100ns'),
    interrupt100ns: counter('interrupt100ns'),
    sampledAt: value.sampledAt,
  };
  if (current.timestamp100ns === 0n) throw new Error('Windows returned no counter timestamp.');
  const baseline = { current, sample: null };
  if (!previous) return baseline;
  const elapsed = current.timestamp100ns - previous.timestamp100ns;
  const dpc = current.dpc100ns - previous.dpc100ns;
  const interrupt = current.interrupt100ns - previous.interrupt100ns;
  // First reads, provider resets, duplicate ticks and long gaps are baselines,
  // never synthetic zero activity. PERF_100NSEC_TIMER uses Sys100NS deltas.
  if (elapsed <= 0n || elapsed > 300000000n || dpc < 0n || interrupt < 0n ||
      current.sampledAt <= previous.sampledAt) return baseline;
  return {
    current,
    sample: parseCounterOutput(JSON.stringify({
      source: value.source,
      sampledAt: value.sampledAt,
      dpcPct: Number(dpc) / Number(elapsed) * 100,
      interruptPct: Number(interrupt) / Number(elapsed) * 100,
      pageFaultsPerSec: value.pageFaultsPerSec,
    }), now),
  };
}

async function collectSample(counterState) {
  // The CIM classes expose stable property names regardless of the
  // display language. Get-Counter paths such as "% DPC Time" are localized on
  // some Windows installations, which previously made the analyzer fail before
  // it could produce its first sample.
  const script = `
try {
  $p = Get-CimInstance -ClassName Win32_PerfRawData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction Stop
  $m = Get-CimInstance -ClassName Win32_PerfFormattedData_PerfOS_Memory -ErrorAction Stop
  if ($null -eq $p -or $null -eq $m) { throw 'Windows returned no performance data.' }
   if ($null -eq $p.PercentDPCTime -or $null -eq $p.PercentInterruptTime -or $null -eq $p.Timestamp_Sys100NS -or $null -eq $m.PageFaultsPerSec) {
     throw 'One or more Windows performance counter properties are missing.'
   }
  $faults = [double]$m.PageFaultsPerSec
   if ([double]::IsNaN($faults) -or [double]::IsInfinity($faults) -or $faults -lt 0) {
     throw 'Windows returned out-of-range performance data.'
  }
   [PSCustomObject]@{
     source = 'Windows PerfOS'
     sampledAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
     timestamp100ns = [string]$p.Timestamp_Sys100NS
     dpc100ns = [string]$p.PercentDPCTime
     interrupt100ns = [string]$p.PercentInterruptTime
     pageFaultsPerSec = $faults
   } | ConvertTo-Json -Compress
} catch {
   Write-Output ('ERROR:' + $_.Exception.Message)
}
`.trim();

  try {
    const out = await runPS(script, PS_TIMEOUT_MS, { trackAs: 'sample' });
    if (!out) throw new Error('Performance counter query returned no output.');
    if (out.startsWith('ERROR')) {
      throw new Error(out.slice('ERROR:'.length).trim() || 'Performance counter query failed.');
    }
    const result = parseRawCounterOutput(out, counterState.previous);
    counterState.previous = result.current;
    return result.sample;
  } catch (err) {
    const detail = err && err.message ? err.message : String(err);
    const wrapped = new Error(`Unable to collect Windows performance counters: ${detail}`);
    wrapped.code = err && err.code;
    throw wrapped;
  }
}

// ── Driver scan ────────────────────────────────────────────────────────────────

/**
 * Scan installed drivers using driverquery (no admin required).
 * Returns an array of DriverRow objects.
 */
async function scanDrivers() {
  _lifecycleLog('driver_scan_started');
  // Previously used `driverquery /fo csv` but that command:
  //   1. Can take 30-120 s with /v and 10-25 s without on systems with WMI pressure.
  //   2. Uses OEM code-page output that can confuse Node's UTF-8 reader on non-English Windows.
  //   3. Must go through a PowerShell host which adds its own overhead.
  //
  // Replacement: Get-CimInstance Win32_SystemDriver reads from the kernel SCM object
  // directly (no WMI polling loop), returns consistent UTF-16 data, and typically
  // completes in 1-4 s even on heavy systems.  We also widen the timeout to 30 s
  // as a safety margin and fall back to an empty array on any failure.
  const script = `
try {
  $d = Get-CimInstance Win32_SystemDriver -EA SilentlyContinue |
    Select-Object Name, DisplayName, State, StartMode, @{N='DriverType';E={'Kernel'}};
  if ($d) { ConvertTo-Json -Compress -Depth 2 @($d) } else { '[]' }
} catch { '[]' }
`.trim();

  try {
    const out = await runPS(script, 30000);
    if (!out || out === '[]') {
      _lifecycleLog('driver_scan_completed', { count: 0, partial: true, reason: 'no_rows' });
      return [];
    }

    let raw;
    try { raw = JSON.parse(out); } catch {
      _lifecycleLog('driver_scan_completed', { count: 0, partial: true, reason: 'malformed_response' });
      return [];
    }
    if (!Array.isArray(raw)) raw = [raw];

    const rows = [];
    for (const item of raw) {
      const name  = (item.Name || '').trim();
      const desc  = (item.DisplayName || '').trim();
      const type  = (item.DriverType || 'Kernel').trim();
      const state = (item.State || '').trim();
      if (!name) continue;

      rows.push({
        name,
        description: desc || 'System driver',
        type,
        state,
      });
    }

    // Accept any non-empty state string — Win32_SystemDriver returns English
    // state values ("Running"/"Stopped") but guard against empty/null anyway.
    const result = rows
      .filter(r => r.state.length > 0)
      .slice(0, 60);   // raised cap: CIM returns data quickly so more rows is fine
    _lifecycleLog('driver_scan_completed', { count: result.length, partial: false });
    return result;
  } catch {
    _lifecycleLog('driver_scan_failed', { partial: true, error: 'driver inventory query failed' });
    return [];
  }
}

// ── Audio device scan ──────────────────────────────────────────────────────────

async function scanAudioDevices() {
  _lifecycleLog('audio_scan_started');
  // Use Get-PnpDevice instead of Win32_SoundDevice — WMI can hang on AMD systems.
  const script = `
Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue |
  Select-Object FriendlyName, Manufacturer, Status |
  ConvertTo-Csv -NoTypeInformation
`.trim();

  try {
    const out = await runPS(script, 8000);
    if (!out) {
      _lifecycleLog('audio_scan_completed', { count: 0, partial: true, reason: 'no_rows' });
      return [];
    }
    const lines = out.split('\n').filter(Boolean);
    if (lines.length < 2) {
      _lifecycleLog('audio_scan_completed', { count: 0, partial: true, reason: 'no_rows' });
      return [];
    }
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = parseCSVLine(line);
      const name = cols[0] || '';
      const mfr  = cols[1] || '';
      const stat = cols[2] || '';
      if (name) rows.push({ name, manufacturer: mfr, status: stat });
    }
    _lifecycleLog('audio_scan_completed', { count: rows.length, partial: false });
    return rows;
  } catch {
    _lifecycleLog('audio_scan_failed', { partial: true, error: 'audio inventory query failed' });
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Start a new analysis session.
 * @param {function} onSample  - called with each { dpcPct, intrPct, pageFaultsSec } sample
 * @param {function} onError   - called with error message string
 */
async function startAnalysis(onSample, onError) {
  if (_sessionActive) {
    _lifecycleLog('start_rejected', { reason: 'already_running' });
    throw new Error('An analysis session is already running.');
  }
  _sessionActive  = true;
  _sampleCallback = onSample;
  _startedAt      = Date.now();
  _sampleCount    = 0;
  _lastError      = null;
  _consecutiveFailures = 0;
  const generation = ++_generation;
  const counterState = { previous: null };
  _lifecycleLog('analysis_started', { sampleIntervalMs: SAMPLE_INTERVAL_MS });

  async function poll() {
    if (!_sessionActive || generation !== _generation) return;
    // Guard: previous PS process still running — skip this tick to avoid overlap
    if (_sampleProcess) {
      _intervalHandle = setTimeout(poll, SAMPLE_INTERVAL_MS);
      return;
    }
    try {
      const sample = await collectSample(counterState);
      if (_sessionActive && generation === _generation && sample) {
        _sampleCount++;
        _lastError = null;
        _consecutiveFailures = 0;
        _lifecycleLog('sample_collected', { sampleCount: _sampleCount });
        if (_sampleCallback) _sampleCallback(sample);
      }
    } catch (err) {
      if (!_sessionActive || generation !== _generation) return;
      _lastError = err.message || String(err);
      _consecutiveFailures++;
      _lifecycleLog('counter_failure', { sampleCount: _sampleCount, error: _lastError });
      if (_sessionActive && onError) onError(_lastError);
      // Do not leave a dead session running forever when Windows cannot expose
      // the requested counters. The renderer can now retry cleanly instead of
      // getting "analysis already running" from the visible Start button.
      if (_consecutiveFailures >= 3) {
        _sessionActive = false;
        _sampleCallback = null;
        _intervalHandle = null;
        _lifecycleLog('analysis_halted', {
          reason: 'repeated_counter_failures',
          failures: _consecutiveFailures,
        });
      }
    }
    if (_sessionActive && generation === _generation) {
      _intervalHandle = setTimeout(poll, SAMPLE_INTERVAL_MS);
    }
  }

  // Start first poll immediately
  _intervalHandle = setTimeout(poll, 0);
}

/**
 * Stop the current analysis session. Cleans up timers and any active child process.
 */
function stopAnalysis() {
  if (_sessionActive) _lifecycleLog('analysis_stopped', { sampleCount: _sampleCount });
  _sessionActive = false;
  _generation++;
  _sampleCallback = null;
  _lastError = null;
  if (_intervalHandle) {
    clearTimeout(_intervalHandle);
    _intervalHandle = null;
  }
  if (_sampleProcess) {
    try { _sampleProcess.kill(); } catch {}
    _sampleProcess = null;
  }
}

/**
 * Check whether a session is currently active.
 */
function isActive() {
  return _sessionActive;
}

/**
 * Return a snapshot of the current session state.
 */
function getStatus() {
  return {
    active: _sessionActive,
    startedAt: _startedAt,
    sampleCount: _sampleCount,
    lastError: _lastError,
  };
}

module.exports = {
  startAnalysis,
  stopAnalysis,
  scanDrivers,
  scanAudioDevices,
  isActive,
  getStatus,
  parseCounterOutput,
  parseRawCounterOutput,
};
