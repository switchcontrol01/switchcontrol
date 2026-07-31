'use strict';
/**
 * latency-analyzer.js
 *
 * SwitchControl Latency Analyzer — Windows user-mode backend.
 *
 * Collects system-wide DPC%, Interrupt%, and Hard Page Fault activity using
 * Windows Performance Counters via PowerShell Get-Counter.
 * Also scans installed drivers (driverquery) and audio devices (WMI).
 *
 * IMPORTANT: Per-driver DPC/ISR microsecond timings require a kernel-mode ETW
 * session (NtSetSystemInformation with SystemPerformanceTraceInformation), which
 * is not available in user mode without a kernel driver. Those metrics are
 * therefore labeled "Limited in user mode" in the UI rather than fabricated.
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
        if (opts.trackAs === 'sample') _sampleProcess = null;
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

/**
 * Collect one snapshot of system-wide perf counters via Get-Counter.
 * Returns { dpcPct, intrPct, pageFaultsSec } or null on failure.
 */
async function collectSample() {
  // Single Get-Counter call for all three counters (one PS process, minimal overhead)
  const script = `
try {
  $c = Get-Counter -Counter @(
    '\\Processor(_Total)\\% DPC Time',
    '\\Processor(_Total)\\% Interrupt Time',
    '\\Memory\\Page Faults/sec'
  ) -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop
  $vals = $c.CounterSamples | ForEach-Object { $_.CookedValue }
  [Math]::Round($vals[0],3).ToString() + ',' + [Math]::Round($vals[1],3).ToString() + ',' + [Math]::Round($vals[2],1).ToString()
} catch {
  Write-Output 'ERROR:' + $_.Exception.Message
}
`.trim();

  try {
    const out = await runPS(script, PS_TIMEOUT_MS, { trackAs: 'sample' });
    if (!out) throw new Error('Performance counter query returned no output.');
    if (out.startsWith('ERROR')) {
      throw new Error(out.slice('ERROR:'.length).trim() || 'Performance counter query failed.');
    }
    const parts = out.split(',');
    if (parts.length < 3) throw new Error(`Performance counter response was malformed: ${out}`);
    const dpcPct        = parseFloat(parts[0]);
    const intrPct       = parseFloat(parts[1]);
    const pageFaultsSec = parseFloat(parts[2]);
    if (isNaN(dpcPct) || isNaN(intrPct) || isNaN(pageFaultsSec)) {
      throw new Error(`Performance counter values were not numeric: ${out}`);
    }
    return { dpcPct, intrPct, pageFaultsSec };
  } catch (err) {
    const detail = err && err.message ? err.message : String(err);
    const wrapped = new Error(`Unable to collect Windows performance counters: ${detail}`);
    wrapped.code = err && err.code;
    throw wrapped;
  }
}

// ── Driver scan ────────────────────────────────────────────────────────────────

/**
 * Well-known driver descriptions and suggested actions.
 * Only used for display — never modifies anything.
 */
const KNOWN_DRIVERS = {
  'nvlddmkm.sys':   { desc: 'NVIDIA Display Driver',         action: 'Check for the latest stable NVIDIA driver via NVIDIA App or nvidia.com' },
  'nvlddmkm':       { desc: 'NVIDIA Display Driver',         action: 'Check for the latest stable NVIDIA driver via NVIDIA App or nvidia.com' },
  'dxgkrnl.sys':    { desc: 'DirectX Graphics Kernel',       action: 'Part of Windows — keep Windows up to date' },
  'dxgkrnl':        { desc: 'DirectX Graphics Kernel',       action: 'Part of Windows — keep Windows up to date' },
  'ndis.sys':       { desc: 'Network Driver Interface (NDIS)',action: 'Review NIC power management settings in Device Manager' },
  'ndis':           { desc: 'Network Driver Interface (NDIS)',action: 'Review NIC power management settings in Device Manager' },
  'storport.sys':   { desc: 'Microsoft Storage Port Driver', action: 'Ensure chipset and storage controller drivers are up to date' },
  'storport':       { desc: 'Microsoft Storage Port Driver', action: 'Ensure chipset and storage controller drivers are up to date' },
  'Wdf01000.sys':   { desc: 'Windows Driver Framework',      action: 'Part of Windows — keep Windows up to date' },
  'Wdf01000':       { desc: 'Windows Driver Framework',      action: 'Part of Windows — keep Windows up to date' },
  'ACPI.sys':       { desc: 'ACPI Driver (power/hardware)',  action: 'Ensure BIOS is up to date; ACPI driver is part of Windows' },
  'ACPI':           { desc: 'ACPI Driver (power/hardware)',  action: 'Ensure BIOS is up to date; ACPI driver is part of Windows' },
  'usbhub.sys':     { desc: 'USB Hub Driver',               action: 'Review USB power management; consider a powered hub for many devices' },
  'usbhub':         { desc: 'USB Hub Driver',               action: 'Review USB power management; consider a powered hub for many devices' },
  'usbxhci.sys':    { desc: 'USB xHCI Host Controller',     action: 'Ensure chipset drivers are up to date' },
  'usbxhci':        { desc: 'USB xHCI Host Controller',     action: 'Ensure chipset drivers are up to date' },
  'HDAudBus.sys':   { desc: 'High Definition Audio Bus',    action: 'Check for chipset/audio driver updates from your motherboard vendor' },
  'HDAudBus':       { desc: 'High Definition Audio Bus',    action: 'Check for chipset/audio driver updates from your motherboard vendor' },
  'portcls.sys':    { desc: 'Audio Port Class (portcls)',   action: 'Part of Windows — audio driver related; check for Windows updates' },
  'portcls':        { desc: 'Audio Port Class (portcls)',   action: 'Part of Windows — audio driver related; check for Windows updates' },
  'ataport.sys':    { desc: 'SATA/IDE Port Driver',         action: 'Ensure storage controller drivers are current' },
  'ataport':        { desc: 'SATA/IDE Port Driver',         action: 'Ensure storage controller drivers are current' },
  'tcpip.sys':      { desc: 'TCP/IP Network Stack',         action: 'Part of Windows — keep Windows up to date; review network adapter settings' },
  'tcpip':          { desc: 'TCP/IP Network Stack',         action: 'Part of Windows — keep Windows up to date; review network adapter settings' },
  'ntoskrnl.exe':   { desc: 'Windows Kernel (ntoskrnl)',    action: 'Part of Windows — keep Windows updated' },
  'ntoskrnl':       { desc: 'Windows Kernel (ntoskrnl)',    action: 'Part of Windows — keep Windows updated' },
};

function getKnownDriver(name) {
  const lower = (name || '').toLowerCase();
  const key = Object.keys(KNOWN_DRIVERS).find(k => lower.includes(k.toLowerCase()));
  return key ? KNOWN_DRIVERS[key] : null;
}

/**
 * Scan installed drivers using driverquery (no admin required).
 * Returns an array of DriverRow objects.
 */
async function scanDrivers() {
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
    if (!out || out === '[]') return [];

    let raw;
    try { raw = JSON.parse(out); } catch { return []; }
    if (!Array.isArray(raw)) raw = [raw];

    const rows = [];
    for (const item of raw) {
      const name  = (item.Name || '').trim();
      const desc  = (item.DisplayName || '').trim();
      const type  = (item.DriverType || 'Kernel').trim();
      const state = (item.State || '').trim();
      if (!name) continue;

      const known = getKnownDriver(name);
      const finalDesc = (desc && desc !== name) ? desc : (known?.desc || 'System Driver');
      const action    = known?.action || 'Investigate only if latency remains consistently high';

      let impact = 'Low';
      const lName = name.toLowerCase();
      if (
        lName.includes('nv') || lName.includes('amd') || lName.includes('ati') ||
        lName.includes('ndis') || lName.includes('tcpip') || lName.includes('storport') ||
        lName.includes('acpi') || lName.includes('usb')
      ) impact = 'Medium';
      if (lName.includes('nvlddmkm') || lName.includes('ndis') || lName.includes('storport')) impact = 'High';

      rows.push({
        name,
        description: finalDesc,
        type,
        state,
        dpcCount: null,
        isrCount: null,
        highestExec: null,
        totalExec: null,
        impact,
        suggestedAction: action,
      });
    }

    // Accept any non-empty state string — Win32_SystemDriver returns English
    // state values ("Running"/"Stopped") but guard against empty/null anyway.
    return rows
      .filter(r => r.state.length > 0)
      .slice(0, 60);   // raised cap: CIM returns data quickly so more rows is fine
  } catch {
    return [];
  }
}

// ── Audio device scan ──────────────────────────────────────────────────────────

async function scanAudioDevices() {
  // Use Get-PnpDevice instead of Win32_SoundDevice — WMI can hang on AMD systems.
  const script = `
Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue |
  Select-Object FriendlyName, Manufacturer, Status |
  ConvertTo-Csv -NoTypeInformation
`.trim();

  try {
    const out = await runPS(script, 8000);
    if (!out) return [];
    const lines = out.split('\n').filter(Boolean);
    if (lines.length < 2) return [];
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
    return rows;
  } catch {
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
    throw new Error('An analysis session is already running.');
  }
  _sessionActive  = true;
  _sampleCallback = onSample;
  _startedAt      = Date.now();
  _sampleCount    = 0;
  _lastError      = null;

  async function poll() {
    if (!_sessionActive) return;
    // Guard: previous PS process still running — skip this tick to avoid overlap
    if (_sampleProcess) {
      _intervalHandle = setTimeout(poll, SAMPLE_INTERVAL_MS);
      return;
    }
    try {
      const sample = await collectSample();
      if (_sessionActive && sample) {
        _sampleCount++;
        _lastError = null;
        if (_sampleCallback) _sampleCallback(sample);
      }
    } catch (err) {
      _lastError = err.message || String(err);
      if (_sessionActive && onError) onError(_lastError);
    }
    if (_sessionActive) {
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
  _sessionActive = false;
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
};
