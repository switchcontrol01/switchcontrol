/**
 * Preset Tweak Executor — preset-profile registry-backed tweaks with
 * read / apply / revert lifecycle.
 *
 * Unlike slider tweaks (a single numeric registry value), a preset tweak
 * writes a coordinated set of one or more real registry values per selected
 * option. Options are identified by string id (e.g. "gaming", "balanced"),
 * never a synthetic index.
 *
 * Mirrors the safety systems in slider-tweak-executor.js:
 *  1. Safe option validation — only known option ids for a given tweak may be applied.
 *  2. Original-value backup — the current registry value(s) are captured before
 *     the first write so revert restores the real previous state.
 *  3. Crash sentinel — written before elevated reboot-required writes.
 *  4. Full audit log — every action records tweakId, previousOptionId, newOptionId,
 *     success/failure, and timestamp.
 */
const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const {
  PRESET_STATE_FILE,
  PRESET_LOG_FILE,
  PRESET_CRASH_SENTINEL_FILE,
  APPDATA_DIR,
} = require('./user-data-paths');

// ─── File helpers ─────────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(APPDATA_DIR)) fs.mkdirSync(APPDATA_DIR, { recursive: true });
}

function loadPresetState() {
  try {
    ensureDir();
    if (!fs.existsSync(PRESET_STATE_FILE)) return { originalValues: {} };
    const raw = fs.readFileSync(PRESET_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { originalValues: {} };
    if (!parsed.originalValues || typeof parsed.originalValues !== 'object') parsed.originalValues = {};
    return parsed;
  } catch {
    return { originalValues: {} };
  }
}

function savePresetState(state) {
  try {
    ensureDir();
    fs.writeFileSync(PRESET_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[PresetExecutor] savePresetState failed:', e.message);
  }
}

function logPresetEntry(entry) {
  try {
    ensureDir();
    let logs = [];
    if (fs.existsSync(PRESET_LOG_FILE)) {
      try { logs = JSON.parse(fs.readFileSync(PRESET_LOG_FILE, 'utf8')); } catch {}
    }
    if (!Array.isArray(logs)) logs = [];
    logs.unshift({ ...entry, timestamp: new Date().toISOString() });
    if (logs.length > 500) logs.length = 500;
    fs.writeFileSync(PRESET_LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (e) {
    console.error('[PresetExecutor] logPresetEntry failed:', e.message);
  }
}

function writeCrashSentinel(tweakId, previousOptionId) {
  try {
    ensureDir();
    fs.writeFileSync(PRESET_CRASH_SENTINEL_FILE, JSON.stringify({
      tweakId,
      previousOptionId,
      startedAt: new Date().toISOString(),
      requiresReboot: true,
    }, null, 2));
  } catch (e) {
    console.error('[PresetExecutor] writeCrashSentinel failed:', e.message);
  }
}

function clearCrashSentinel() {
  try {
    if (fs.existsSync(PRESET_CRASH_SENTINEL_FILE)) fs.unlinkSync(PRESET_CRASH_SENTINEL_FILE);
  } catch {}
}

// ─── PowerShell helpers (same pattern as slider-tweak-executor.js) ────────────

function runPS(command) {
  return new Promise((resolve, reject) => {
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
  });
}

function queryPS(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 12000, windowsHide: true },
      (error, stdout) => resolve(error ? null : stdout.trim())
    );
  });
}

let _isAdminCache = null;
async function checkIsAdmin() {
  if (_isAdminCache !== null) return _isAdminCache;
  try {
    _isAdminCache = await new Promise(resolve => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command',
          '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],
        { windowsHide: true, timeout: 6000 },
        (err, stdout) => resolve(!err && stdout.trim().toLowerCase() === 'true')
      );
    });
  } catch { _isAdminCache = false; }
  return _isAdminCache;
}

async function runElevated(command) {
  const tmpDir     = os.tmpdir();
  const scriptId   = `sc_preset_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const scriptPath = path.join(tmpDir, `${scriptId}.ps1`);
  const resultPath = path.join(tmpDir, `${scriptId}_result.json`);
  const safeResult = resultPath.replace(/'/g, "''");
  const safeScript = scriptPath.replace(/'/g, "''");

  const scriptContent = [
    `$ErrorActionPreference = 'Stop'`,
    `try {`,
    `  ${command}`,
    `  $r = @{ ok = $true; error = $null }`,
    `} catch {`,
    `  $r = @{ ok = $false; error = $_.Exception.Message }`,
    `}`,
    `try { [System.IO.File]::WriteAllText('${safeResult}', ($r | ConvertTo-Json -Compress)) } catch { $r | ConvertTo-Json -Compress | Out-File -FilePath '${safeResult}' -Encoding ascii -Force }`,
  ].join('\r\n');

  fs.writeFileSync(scriptPath, scriptContent, 'utf8');

  const launchCmd = `Start-Process powershell -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File','${safeScript}') -Verb RunAs -Wait`;

  try {
    await new Promise((resolve, reject) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', launchCmd],
        { timeout: 120_000, windowsHide: true },
        (err) => err ? reject(err) : resolve()
      );
    });

    const deadline = Date.now() + 5000;
    while (!fs.existsSync(resultPath)) {
      if (Date.now() > deadline) break;
      await new Promise(r => setTimeout(r, 100));
    }

    if (fs.existsSync(resultPath)) {
      const raw = fs.readFileSync(resultPath, 'utf8').replace(/^\uFEFF/, '').trim();
      try {
        const parsed = JSON.parse(raw);
        return parsed.ok === true ? { ok: true, error: null } : parsed;
      } catch {
        return { ok: false, error: `Could not parse result (raw: ${raw.slice(0, 200)})` };
      }
    }
    return { ok: false, error: 'Result file not found after elevation.' };

  } catch (err) {
    const msg = (err && err.message) || String(err);
    if (/cancel|denied|elevat|access|uac/i.test(msg) || (err && err.code === 1)) {
      return { ok: false, error: 'UAC prompt was cancelled or access was denied.' };
    }
    return { ok: false, error: `Elevation failed: ${msg}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(resultPath); } catch {}
  }
}

// ─── Preset tweak definitions ─────────────────────────────────────────────────
//
// Each definition has:
//   premium: boolean               — whether trial-expiry auto-revert applies
//   requiresAdmin / requiresReboot — same semantics as slider tweaks
//   regPath / regName              — informational, primary registry location
//   options: { [optionId]: { value, readCommand, writeCommand } }
//   defaultOptionId                — option id considered the "off"/Windows-default state
//
// readCommand for an option returns a truthy PowerShell boolean expression that
// is TRUE only when the system's current state matches that option (used to
// determine which option is "currently active" without a synthetic index).

const PRESET_TWEAKS = {
  /**
   * IRQ8Priority — elevated PCI interrupt priority class.
   * balanced = key removed (Windows default scheme).
   * gaming = 1 (elevated), streaming = 2 (moderate elevated, shared w/ audio).
   */
  'irq-optimization-profile': {
    name: 'IRQ Priority Profile',
    premium: true,
    requiresAdmin: true,
    requiresReboot: true,
    regPath: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl',
    regName: 'IRQ8Priority',
    defaultOptionId: 'balanced',
    options: {
      balanced: {
        value: null,
        writeCommand: () => `Remove-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'IRQ8Priority' -EA SilentlyContinue`,
      },
      gaming: {
        value: 1,
        writeCommand: () => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'IRQ8Priority' -Value 1 -Type DWord -Force`,
      },
      streaming: {
        value: 2,
        writeCommand: () => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'IRQ8Priority' -Value 2 -Type DWord -Force`,
      },
    },
    readCommand: () => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'IRQ8Priority' -EA SilentlyContinue).IRQ8Priority`,
  },

  /**
   * NtfsMemoryUsage — NTFS metadata cache aggressiveness.
   * standard = 0 (default), gaming = 1 (moderate), extreme = 2 (maximum).
   */
  'io-optimization-profile': {
    name: 'NTFS I/O Optimization Profile',
    premium: true,
    requiresAdmin: true,
    requiresReboot: true,
    regPath: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem',
    regName: 'NtfsMemoryUsage',
    defaultOptionId: 'standard',
    options: {
      standard: {
        value: 0,
        writeCommand: () => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name 'NtfsMemoryUsage' -Value 0 -Type DWord -Force`,
      },
      gaming: {
        value: 1,
        writeCommand: () => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name 'NtfsMemoryUsage' -Value 1 -Type DWord -Force`,
      },
      extreme: {
        value: 2,
        writeCommand: () => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name 'NtfsMemoryUsage' -Value 2 -Type DWord -Force`,
      },
    },
    readCommand: () => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name 'NtfsMemoryUsage' -EA SilentlyContinue).NtfsMemoryUsage`,
  },

  /**
   * TdrLevel / TdrDelay — GPU driver Timeout Detection and Recovery policy.
   * standard = both keys removed (driver defaults: TdrLevel=3, TdrDelay=2 implicit).
   * extended = TdrLevel 3, TdrDelay 8. compute = TdrLevel 3, TdrDelay 15.
   */
  'directx-optimization-profile': {
    name: 'GPU Driver Timeout Profile',
    premium: true,
    requiresAdmin: true,
    requiresReboot: true,
    regPath: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
    regName: 'TdrLevel / TdrDelay',
    defaultOptionId: 'standard',
    options: {
      standard: {
        value: null,
        writeCommand: () => `Remove-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'TdrLevel' -EA SilentlyContinue; Remove-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'TdrDelay' -EA SilentlyContinue`,
      },
      extended: {
        value: 8,
        writeCommand: () => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'TdrLevel' -Value 3 -Type DWord -Force; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'TdrDelay' -Value 8 -Type DWord -Force`,
      },
      compute: {
        value: 15,
        writeCommand: () => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'TdrLevel' -Value 3 -Type DWord -Force; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'TdrDelay' -Value 15 -Type DWord -Force`,
      },
    },
    readCommand: () => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'TdrDelay' -EA SilentlyContinue).TdrDelay`,
  },
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Determine which option id is currently active by reading the underlying
 * registry value and matching it against each option's `value`.
 * Returns { optionId: string, raw: string|null, error: string|null }
 */
async function readPresetValue(tweakId) {
  const def = PRESET_TWEAKS[tweakId];
  if (!def) return { optionId: null, raw: null, error: `Unknown preset tweak: ${tweakId}` };

  try {
    const raw = await queryPS(def.readCommand());
    if (raw === null) {
      return { optionId: null, raw: null, error: 'Registry read failed (PowerShell timeout or access denied)' };
    }

    // Empty/false means the value is absent — match against the option whose value is null.
    if (raw === '' || raw.toLowerCase() === 'false') {
      const defaultEntry = Object.entries(def.options).find(([, o]) => o.value === null);
      return { optionId: defaultEntry ? defaultEntry[0] : def.defaultOptionId, raw: null, error: null };
    }

    const num = parseInt(raw, 10);
    const match = Object.entries(def.options).find(([, o]) => o.value === num);
    return { optionId: match ? match[0] : null, raw, error: null };
  } catch (err) {
    return { optionId: null, raw: null, error: err.message };
  }
}

/**
 * Apply a preset option by id.
 * Returns { ok, verified, actualOptionId, error, blocked, previousOptionId }
 */
async function applyPresetValue(tweakId, optionId) {
  const def = PRESET_TWEAKS[tweakId];
  if (!def) {
    logPresetEntry({ tweakId, action: 'apply', optionId, blocked: true, success: false, error: 'Unknown preset tweak' });
    return { ok: false, verified: false, actualOptionId: null, error: `Unknown preset tweak: ${tweakId}` };
  }

  const option = def.options[optionId];
  if (!option) {
    const msg = `Unknown option "${optionId}" for ${def.name}.`;
    logPresetEntry({ tweakId, action: 'apply', optionId, blocked: true, success: false, error: msg });
    return { ok: false, verified: false, blocked: true, actualOptionId: null, error: msg };
  }

  // Capture original option (only once — before the first write ever)
  const state = loadPresetState();
  let previousOptionId = null;
  if (!state.originalValues[tweakId]) {
    const current = await readPresetValue(tweakId);
    previousOptionId = current.optionId || def.defaultOptionId;
    state.originalValues[tweakId] = {
      optionId: previousOptionId,
      capturedAt: new Date().toISOString(),
    };
    savePresetState(state);
    console.log(`[PresetExecutor] Original option captured for ${tweakId}: ${previousOptionId}`);
  } else {
    previousOptionId = state.originalValues[tweakId].optionId;
  }

  try {
    if (def.requiresReboot && def.requiresAdmin) {
      writeCrashSentinel(tweakId, previousOptionId);
    }

    if (def.requiresAdmin) {
      const alreadyAdmin = await checkIsAdmin();
      if (alreadyAdmin) {
        console.log(`[PresetExecutor] ${tweakId}: already admin — using runPS (no UAC spawn)`);
        await runPS(option.writeCommand());
      } else {
        const result = await runElevated(option.writeCommand());
        if (!result.ok) {
          clearCrashSentinel();
          logPresetEntry({ tweakId, action: 'apply', previousOptionId, newOptionId: optionId, success: false, error: result.error });
          return { ok: false, verified: false, actualOptionId: null, previousOptionId, error: result.error || 'Elevation failed.' };
        }
      }
    } else {
      await runPS(option.writeCommand());
    }

    const verification = await readPresetValue(tweakId);
    clearCrashSentinel();
    const verified = verification.optionId === optionId;

    logPresetEntry({
      tweakId,
      action: 'apply',
      previousOptionId,
      newOptionId: optionId,
      success: verified,
      actualOptionId: verification.optionId,
      error: verified ? null : (verification.error || 'Verification mismatch after write.'),
    });

    return {
      ok: verified,
      verified,
      actualOptionId: verification.optionId,
      previousOptionId,
      error: verified ? null : (verification.error || `Verification failed — expected "${optionId}", read back "${verification.optionId}".`),
    };
  } catch (err) {
    clearCrashSentinel();
    logPresetEntry({ tweakId, action: 'apply', previousOptionId, newOptionId: optionId, success: false, error: err.message });
    return { ok: false, verified: false, actualOptionId: null, previousOptionId, error: err.message };
  }
}

/**
 * Revert a preset tweak to its backed-up original option (or defaultOptionId
 * if no backup exists). Returns { ok, verified, actualOptionId, restoredTo, error }
 */
async function resetPresetValue(tweakId) {
  const def = PRESET_TWEAKS[tweakId];
  if (!def) return { ok: false, error: `Unknown preset tweak: ${tweakId}` };

  const state = loadPresetState();
  const backup = state.originalValues[tweakId];
  const restoredTo = (backup && backup.optionId) ? backup.optionId : def.defaultOptionId;
  const option = def.options[restoredTo] || def.options[def.defaultOptionId];

  console.log(`[PresetExecutor] Reverting ${tweakId} to ${restoredTo} (${backup ? 'original backup' : 'default'})`);

  let writeOk = true;
  let writeError = null;
  try {
    if (def.requiresAdmin) {
      const alreadyAdmin = await checkIsAdmin();
      if (alreadyAdmin) {
        await runPS(option.writeCommand());
      } else {
        const result = await runElevated(option.writeCommand());
        writeOk = result.ok;
        writeError = result.error;
      }
    } else {
      await runPS(option.writeCommand());
    }
  } catch (err) {
    writeOk = false;
    writeError = err.message;
  }

  if (!writeOk) {
    logPresetEntry({ tweakId, action: 'revert', restoredTo, success: false, error: writeError });
    return { ok: false, verified: false, actualOptionId: null, restoredTo, error: writeError || 'Revert write failed.' };
  }

  const verification = await readPresetValue(tweakId);
  const verified = verification.optionId === restoredTo;

  if (verified) {
    delete state.originalValues[tweakId];
    savePresetState(state);
  }

  logPresetEntry({
    tweakId,
    action: 'revert',
    restoredTo,
    success: verified,
    actualOptionId: verification.optionId,
    error: verified ? null : (verification.error || 'Verification mismatch after revert.'),
  });

  return {
    ok: verified,
    verified,
    actualOptionId: verification.optionId,
    restoredTo,
    error: verified ? null : (verification.error || `Revert verification failed — expected "${restoredTo}", read back "${verification.optionId}".`),
  };
}

/**
 * Called once on app launch before any UI is shown.
 * Returns the sentinel data so the caller can prompt the user, or null.
 */
function checkCrashSentinel() {
  try {
    if (!fs.existsSync(PRESET_CRASH_SENTINEL_FILE)) return null;
    const raw = fs.readFileSync(PRESET_CRASH_SENTINEL_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !data.tweakId) return null;
    console.warn(`[PresetExecutor] Crash sentinel found for tweak: ${data.tweakId} — may need auto-revert`);
    return data;
  } catch {
    return null;
  }
}

/**
 * Return static metadata about a preset tweak, including its option list.
 */
function getPresetTweakMeta(tweakId) {
  const def = PRESET_TWEAKS[tweakId];
  if (!def) return null;
  return {
    tweakId,
    name: def.name,
    requiresAdmin: def.requiresAdmin,
    requiresReboot: def.requiresReboot,
    defaultOptionId: def.defaultOptionId,
    optionIds: Object.keys(def.options),
    regPath: def.regPath,
    regName: def.regName,
  };
}

const PRESET_TWEAK_IDS = Object.keys(PRESET_TWEAKS);

/**
 * Revert every premium preset tweak that currently has an applied backup.
 * Mirrors revertAllPremiumSliders() — invoked by the premium-revert pipeline
 * on trial expiry / downgrade.
 *
 * Returns { reverted: string[], failed: { tweakId, error }[] }
 */
async function revertAllPremiumPresets() {
  const state = loadPresetState();
  const appliedIds = Object.keys(state.originalValues || {});
  const reverted = [];
  const failed = [];

  for (const tweakId of appliedIds) {
    const def = PRESET_TWEAKS[tweakId];
    if (!def || !def.premium) continue;
    try {
      const result = await resetPresetValue(tweakId);
      if (result.ok) {
        reverted.push(tweakId);
      } else {
        failed.push({ tweakId, error: result.error || 'Unknown revert failure' });
      }
    } catch (err) {
      failed.push({ tweakId, error: err.message });
    }
  }

  console.log(`[PresetExecutor] revertAllPremiumPresets: reverted=${reverted.length} failed=${failed.length}`);
  return { reverted, failed };
}

module.exports = {
  readPresetValue,
  applyPresetValue,
  resetPresetValue,
  revertAllPremiumPresets,
  checkCrashSentinel,
  getPresetTweakMeta,
  PRESET_TWEAKS,
  PRESET_TWEAK_IDS,
};
