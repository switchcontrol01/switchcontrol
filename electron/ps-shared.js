'use strict';

/**
 * ps-shared.js — Shared PowerShell execution primitives for all three executors.
 *
 * Previously tweak-executor.js, slider-tweak-executor.js, and
 * preset-tweak-executor.js each maintained their own byte-for-byte copies of
 * runPS / queryPS / checkIsAdmin / runElevated, with slider and preset having
 * ZERO concurrency gating (direct execFile calls, invisible to psLimiter and
 * tweak-executor's semaphore). This module centralises all four primitives and
 * routes every PS spawn through ONE shared semaphore that respects the same
 * combined ceiling as main.js's psLimiter.
 *
 * Architecture:
 *   psLimiter (main.js, reject-on-busy, cap=6)
 *       ↕  onRelease hook wakes _drainQueue
 *   _withPsSemaphore (this module, queues-never-rejects)
 *       used by tweak-executor.js, slider-tweak-executor.js, preset-tweak-executor.js
 *
 * Combined invariant: _psActive + psLimiter.getState().active < MAX_CONCURRENT_PS (6)
 * at all times — the three executors together can never exceed the shared ceiling.
 */

const { execFile } = require('child_process');
const os   = require('os');
const fs   = require('fs');
const path = require('path');
const psLimiter = require('./powershell-limiter');

// ── Shared PS semaphore (queues, never rejects) ────────────────────────────────
// Callers always eventually get a real result or throw — no "skipped" case.
// The combined check (_psActive + psLimiter active) ensures the combined
// powershell.exe count across all three executors + main.js never exceeds the
// single shared ceiling.

let _psActive = 0;
const _psQueue = [];

function _drainQueue() {
  while (
    _psQueue.length > 0 &&
    _psActive + psLimiter.getState().active < psLimiter.MAX_CONCURRENT_PS
  ) {
    const next = _psQueue.shift();
    next(); // synchronously increments _psActive before the next iteration's check
  }
}

// Wake our queue whenever main.js releases a psLimiter slot.
psLimiter.onRelease(_drainQueue);

function _withPsSemaphore(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      _psActive++;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          _psActive--;
          _drainQueue();
        });
    };
    if (_psActive + psLimiter.getState().active < psLimiter.MAX_CONCURRENT_PS) {
      run();
    } else {
      console.log(
        `[PS-Semaphore] queued — executor=${_psActive} main=${psLimiter.getState().active}` +
        ` cap=${psLimiter.MAX_CONCURRENT_PS} queue=${_psQueue.length + 1}`
      );
      _psQueue.push(run);
    }
  });
}

// ── Shared admin-check cache ──────────────────────────────────────────────────
// Single module-level variable — one PowerShell spawn determines admin status
// for the entire process lifetime, regardless of which executor asks first.
let _isAdminCache = null;

async function checkIsAdmin() {
  if (_isAdminCache !== null) return _isAdminCache;
  try {
    _isAdminCache = await new Promise(resolve => {
      execFile(
        'powershell',
        [
          '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
          '-ExecutionPolicy', 'Bypass', '-Command',
          '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
        ],
        { windowsHide: true, timeout: 6000 },
        (err, stdout) => resolve(!err && stdout.trim().toLowerCase() === 'true')
      );
    });
  } catch { _isAdminCache = false; }
  return _isAdminCache;
}

// ── runPS ─────────────────────────────────────────────────────────────────────
// Wraps command in try/catch exit-code block; rejects on PowerShell error.
// Gated by the shared semaphore.
function runPS(command) {
  return _withPsSemaphore(() => new Promise((resolve, reject) => {
    const wrapped = `try { ${command}; exit 0 } catch { Write-Error $_.Exception.Message; exit 1 }`;
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', wrapped],
      { timeout: 30000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || stdout?.trim() || error.message));
        } else {
          resolve(stdout.trim());
        }
      }
    );
  }));
}

// ── queryPS ───────────────────────────────────────────────────────────────────
// Resolves null on error (never rejects) — safe for optional registry reads.
// Gated by the shared semaphore.
function queryPS(command) {
  return _withPsSemaphore(() => new Promise(resolve => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 12000, windowsHide: true },
      (error, stdout) => resolve(error ? null : stdout.trim())
    );
  }));
}

// ── runElevated ───────────────────────────────────────────────────────────────
// Writes a temp PowerShell script and launches it elevated via a VBScript
// wrapper that calls Shell.Application.ShellExecute with nShowCmd=0 (SW_HIDE).
//
// Why VBScript instead of `Start-Process -Verb RunAs -WindowStyle Hidden`:
//   -WindowStyle Hidden is silently ignored by Windows whenever -Verb RunAs is
//   also present. That flag is handled by ShellExecuteEx (the UAC path), which
//   does its own window-visibility management and does NOT honour Start-Process's
//   -WindowStyle flag — causing a visible PowerShell console to flash on screen
//   for every admin-gated tweak. ShellExecute's own nShowCmd parameter IS
//   honoured through UAC elevation, so the VBScript path is the correct fix.
//
// ShellExecute does not block, so we rely on a poll-for-resultPath loop with a
// generous deadline (10 s). Gated by the shared semaphore.
//
// @param {string} command          — PowerShell command to run elevated
// @param {object} [opts]
// @param {string} [opts.tempFilePrefix='sc_ps_'] — prefix for temp file names
async function runElevated(command, { tempFilePrefix = 'sc_ps_' } = {}) {
  const tmpDir   = os.tmpdir();
  const scriptId = `${tempFilePrefix}${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const scriptPath = path.join(tmpDir, `${scriptId}.ps1`);
  const resultPath = path.join(tmpDir, `${scriptId}_result.json`);
  const vbsPath    = path.join(tmpDir, `${scriptId}_launch.vbs`);

  console.log(`[runElevated] scriptPath: "${scriptPath}"`);
  console.log(`[runElevated] resultPath: "${resultPath}"`);

  // PowerShell single-quoted strings treat backslash as literal — only ' needs doubling.
  const safeResultPath    = resultPath.replace(/'/g, "''");
  // VBScript double-quoted strings escape " as "" — use that convention for the .vbs file.
  const safeVbsScriptPath = scriptPath.replace(/"/g, '""');

  const scriptContent = [
    `$ErrorActionPreference = 'Stop'`,
    `try {`,
    `  ${command}`,
    `  $r = @{ ok = $true; error = $null }`,
    `} catch {`,
    `  $r = @{ ok = $false; error = $_.Exception.Message }`,
    `}`,
    // Use WriteAllText (2-arg overload) — writes UTF-8 without BOM on all PS versions.
    // Set-Content -Encoding UTF8 on PS 5.x adds a BOM that breaks JSON.parse.
    `try { [System.IO.File]::WriteAllText('${safeResultPath}', ($r | ConvertTo-Json -Compress)) } catch { $r | ConvertTo-Json -Compress | Out-File -FilePath '${safeResultPath}' -Encoding ascii -Force }`,
    `Write-Host "[elevated] wrote result to: ${safeResultPath}"`,
  ].join('\r\n');

  fs.writeFileSync(scriptPath, scriptContent, 'utf8');
  console.log(`[runElevated] script written (${scriptContent.length} bytes)`);

  // VBScript wrapper: ShellExecute with nShowCmd=0 (SW_HIDE) is reliably
  // honoured through the UAC elevation path, unlike Start-Process -WindowStyle Hidden.
  const vbsContent = [
    `Set objShell = CreateObject("Shell.Application")`,
    `objShell.ShellExecute "powershell.exe", "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""${safeVbsScriptPath}""", "", "runas", 0`,
  ].join('\r\n');
  fs.writeFileSync(vbsPath, vbsContent, 'utf8');
  console.log(`[runElevated] vbs launcher written`);

  try {
    // Gate the wscript launch through the shared semaphore so runElevated counts
    // against the combined PS ceiling — without this, every elevated call would
    // spawn wscript.exe + an elevated powershell.exe outside all concurrency control.
    await _withPsSemaphore(() => new Promise((resolve, reject) => {
      execFile(
        'wscript.exe',
        ['//B', vbsPath],
        { timeout: 120_000, windowsHide: true },
        (err) => {
          if (err) {
            console.error(`[runElevated] wscript launch error: ${err.message}`);
            reject(err);
          } else {
            console.log('[runElevated] wscript launch completed — checking for result file');
            resolve();
          }
        }
      );
    }));

    // Poll for the result file. ShellExecute does not block (unlike the old
    // Start-Process -Wait), so we need a generous deadline. 10 s covers even
    // heavy tweaks that touch services or scheduled tasks; the loop exits early
    // the moment the file appears so there is no unnecessary wait on fast tweaks.
    const pollDeadline = Date.now() + 10000;
    while (!fs.existsSync(resultPath)) {
      if (Date.now() > pollDeadline) break;
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[runElevated] resultPath exists: ${fs.existsSync(resultPath)}`);

    if (fs.existsSync(resultPath)) {
      // Strip UTF-8 BOM (\uFEFF) and trim whitespace — PS 5.x Set-Content adds BOM
      const raw = fs.readFileSync(resultPath, 'utf8').replace(/^\uFEFF/, '').trim();
      console.log(`[runElevated] result file contents: "${raw}"`);
      try {
        const parsed = JSON.parse(raw);
        if (parsed.ok === true) return { ok: true, error: null };
        return parsed;
      } catch {
        return { ok: false, error: `Elevated script ran but result file could not be parsed (raw: ${raw.slice(0, 200)})` };
      }
    }

    return {
      ok: false,
      error: 'Result file not found after 10s wait. The elevated script may have crashed before writing — check that PowerShell scripts can run in your temp folder.',
    };

  } catch (err) {
    const msg = (err && err.message) || String(err);
    // wscript exits non-zero when UAC is declined — detect it by keyword
    if (/cancel|denied|elevat|access|uac/i.test(msg) || (err && err.code === 1)) {
      return { ok: false, cancelled: true, error: 'Admin permission was canceled. No system changes were made.' };
    }
    return { ok: false, error: `Elevation failed: ${msg}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(resultPath); } catch {}
    try { fs.unlinkSync(vbsPath); } catch {}
  }
}

// ── runElevatedCommands ───────────────────────────────────────────────────────
// Batch version of runElevated for power-plan-manager.js and similar multi-command
// callers. Wraps each command in try/catch, collects failed command strings in
// a `failed` array, and always resolves { ok: true, failed: [] } on success.
// Uses the same VBScript/ShellExecute elevation pattern as runElevated.
async function runElevatedCommands(commands, { tempFilePrefix = 'sc_batch_' } = {}) {
  const tmpDir     = os.tmpdir();
  const scriptId   = `${tempFilePrefix}${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const scriptPath = path.join(tmpDir, `${scriptId}.ps1`);
  const resultPath = path.join(tmpDir, `${scriptId}_result.json`);
  const vbsPath    = path.join(tmpDir, `${scriptId}_launch.vbs`);

  const safeResultPath    = resultPath.replace(/'/g, "''");
  const safeVbsScriptPath = scriptPath.replace(/"/g, '""');

  const lines = [
    `$ErrorActionPreference = 'Continue'`,
    `$failed = @()`,
    ...commands.map(cmd =>
      `try { & ${cmd} 2>&1 | Out-Null } catch { $failed += '${cmd.replace(/'/g, "''")}' }`
    ),
    `$r = @{ ok = $true; failed = $failed }`,
    `try { [System.IO.File]::WriteAllText('${safeResultPath}', ($r | ConvertTo-Json -Compress)) } catch { $r | ConvertTo-Json -Compress | Out-File -FilePath '${safeResultPath}' -Encoding ascii -Force }`,
  ];
  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8');

  const vbsContent = [
    `Set objShell = CreateObject("Shell.Application")`,
    `objShell.ShellExecute "powershell.exe", "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""${safeVbsScriptPath}""", "", "runas", 0`,
  ].join('\r\n');
  fs.writeFileSync(vbsPath, vbsContent, 'utf8');

  try {
    await _withPsSemaphore(() => new Promise((resolve, reject) => {
      execFile('wscript.exe', ['//B', vbsPath], { timeout: 120_000, windowsHide: true },
        (err) => err ? reject(err) : resolve()
      );
    }));

    const pollDeadline = Date.now() + 10000;
    while (!fs.existsSync(resultPath)) {
      if (Date.now() > pollDeadline) break;
      await new Promise(r => setTimeout(r, 100));
    }

    if (fs.existsSync(resultPath)) {
      const raw = fs.readFileSync(resultPath, 'utf8').replace(/^\uFEFF/, '').trim();
      try { return JSON.parse(raw); }
      catch { return { ok: false, error: `Bad result JSON: ${raw.slice(0, 100)}` }; }
    }
    return { ok: false, error: 'Result file not produced after 10s.' };
  } catch (err) {
    const msg = err?.message || String(err);
    if (/cancel|denied|elevat|access|uac/i.test(msg) || err?.code === 1) {
      return { ok: false, cancelled: true, error: 'Admin permission was canceled.' };
    }
    return { ok: false, error: `Elevation failed: ${msg}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(resultPath); } catch {}
    try { fs.unlinkSync(vbsPath); } catch {}
  }
}

module.exports = { runPS, queryPS, checkIsAdmin, runElevated, runElevatedCommands, _withPsSemaphore };
