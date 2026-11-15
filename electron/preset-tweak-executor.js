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
const fs = require('fs');
const path = require('path');
const { runPS, queryPS, checkIsAdmin, runElevated } = require('./ps-shared');
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
    if (!fs.existsSync(PRESET_STATE_FILE)) return { originalValues: {}, appliedOptions: {} };
    const raw = fs.readFileSync(PRESET_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { originalValues: {}, appliedOptions: {} };
    }
    if (!parsed.originalValues || typeof parsed.originalValues !== 'object' || Array.isArray(parsed.originalValues)) {
      parsed.originalValues = {};
    }
    if (!parsed.appliedOptions || typeof parsed.appliedOptions !== 'object' || Array.isArray(parsed.appliedOptions)) {
      parsed.appliedOptions = {};
    }
    parsed.appliedOptions = Object.fromEntries(
      Object.entries(parsed.appliedOptions).filter(([, optionId]) => typeof optionId === 'string'),
    );
    return parsed;
  } catch {
    return { originalValues: {}, appliedOptions: {} };
  }
}

function savePresetState(state) {
  let tempFile = null;
  try {
    ensureDir();
    tempFile = `${PRESET_STATE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tempFile, PRESET_STATE_FILE);
    return true;
  } catch (e) {
    if (tempFile) {
      try { fs.unlinkSync(tempFile); } catch {}
    }
    console.error('[PresetExecutor] savePresetState failed:', e.message);
    return false;
  }
}

function migrateLegacyAppliedPresetTargets(state) {
  if (state.appliedOptionsMigrationVersion === 1) return state;

  const seen = new Set();
  try {
    if (fs.existsSync(PRESET_LOG_FILE)) {
      const entries = JSON.parse(fs.readFileSync(PRESET_LOG_FILE, 'utf8'));
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (!entry || typeof entry.tweakId !== 'string' || seen.has(entry.tweakId)) continue;
          if (entry.success !== true || !['apply', 'revert'].includes(entry.action)) continue;
          seen.add(entry.tweakId);
          if (
            entry.action === 'apply' &&
            state.originalValues[entry.tweakId] &&
            typeof entry.newOptionId === 'string' &&
            !Object.prototype.hasOwnProperty.call(state.appliedOptions, entry.tweakId)
          ) {
            state.appliedOptions[entry.tweakId] = entry.newOptionId;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[PresetExecutor] legacy applied-option migration could not read audit log:', err.message);
  }

  state.appliedOptionsMigrationVersion = 1;
  savePresetState(state);
  return state;
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

// runPS / queryPS / checkIsAdmin / runElevated are imported from ps-shared.js.

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
   * Fortnite Priority Booster — IFEO-based CPU priority for Fortnite client.
   * normal = 2 (NORMAL_PRIORITY_CLASS), above-normal = 6 (ABOVE_NORMAL_PRIORITY_CLASS),
   * high = 3 (HIGH_PRIORITY_CLASS — recommended for gaming).
   */
  'fortnite-high-priority': {
    name: 'Fortnite Priority Booster',
    premium: true,
    requiresAdmin: true,
    requiresReboot: false,
    regPath: 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FortniteClient-Win64-Shipping.exe\\PerfOptions',
    regName: 'CpuPriorityClass',
    defaultOptionId: 'normal',
    options: {
      normal: {
        value: null, // key is removed entirely — readPresetValue's null-match path correctly identifies this as the "key absent" / Windows-default state
        writeCommand: () => `Remove-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FortniteClient-Win64-Shipping.exe\\PerfOptions' -Recurse -Force -EA SilentlyContinue`,
      },
      'above-normal': {
        value: 6,
        writeCommand: () => `New-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FortniteClient-Win64-Shipping.exe' -Force -EA SilentlyContinue | Out-Null; New-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FortniteClient-Win64-Shipping.exe\\PerfOptions' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FortniteClient-Win64-Shipping.exe\\PerfOptions' -Name 'CpuPriorityClass' -Value 6 -Type DWord -Force`,
      },
      high: {
        value: 3,
        writeCommand: () => `New-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FortniteClient-Win64-Shipping.exe' -Force -EA SilentlyContinue | Out-Null; New-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FortniteClient-Win64-Shipping.exe\\PerfOptions' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FortniteClient-Win64-Shipping.exe\\PerfOptions' -Name 'CpuPriorityClass' -Value 3 -Type DWord -Force`,
      },
    },
    readCommand: () => `(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FortniteClient-Win64-Shipping.exe\\PerfOptions' -Name 'CpuPriorityClass' -EA SilentlyContinue).CpuPriorityClass`,
  },

  /**
   * IRQ8Priority — legacy system-wide Windows priority value.
   * balanced = key removed (Windows default scheme).
   * gaming = 1, streaming = 2. This does not configure per-device IRQ affinity.
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
      const result = { optionId: null, raw: null, error: 'Registry read failed (PowerShell timeout or access denied)' };
      console.warn(`[PresetExecutor] read failed ${tweakId}: ${result.error}`);
      return result;
    }
    const rawValue = String(raw).trim();

    // Empty/false means the value is absent — match against the option whose value is null.
    if (rawValue === '' || rawValue.toLowerCase() === 'false') {
      const defaultEntry = Object.entries(def.options).find(([, o]) => o.value === null);
      const result = { optionId: defaultEntry ? defaultEntry[0] : def.defaultOptionId, raw: null, error: null };
      console.info(`[PresetExecutor] read ${tweakId}: raw=<absent> option=${result.optionId}`);
      return result;
    }

    const num = parseInt(rawValue, 10);
    const match = Object.entries(def.options).find(([, o]) => o.value === num);
    if (!match) {
      const result = { optionId: null, raw: rawValue, error: `Unrecognized registry value: ${rawValue}` };
      console.warn(`[PresetExecutor] read ${tweakId}: raw=${JSON.stringify(rawValue)} option=<unrecognized>`);
      return result;
    }
    console.info(`[PresetExecutor] read ${tweakId}: raw=${JSON.stringify(rawValue)} option=${match[0]}`);
    return { optionId: match[0], raw: rawValue, error: null };
  } catch (err) {
    const error = err.message || String(err);
    console.warn(`[PresetExecutor] read failed ${tweakId}: ${error}`);
    return { optionId: null, raw: null, error };
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
        const result = await runElevated(option.writeCommand(), { tempFilePrefix: 'sc_preset_' });
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
    let persisted = false;
    if (verified) {
      const persistedState = loadPresetState();
      if (!persistedState.originalValues[tweakId]) {
        persistedState.originalValues[tweakId] = {
          optionId: previousOptionId || def.defaultOptionId,
          capturedAt: new Date().toISOString(),
        };
      }
      persistedState.appliedOptions[tweakId] = optionId;
      persisted = savePresetState(persistedState);
      if (!persisted) {
        console.warn(`[PresetExecutor] ${tweakId}: applied value verified but could not be saved for startup restore`);
      }
    }

    logPresetEntry({
      tweakId,
      action: 'apply',
      previousOptionId,
      newOptionId: optionId,
      success: verified,
      persisted,
      actualOptionId: verification.optionId,
      error: verified ? null : (verification.error || 'Verification mismatch after write.'),
    });

    return {
      ok: verified,
      verified,
      actualOptionId: verification.optionId,
      previousOptionId,
      persisted,
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
        const result = await runElevated(option.writeCommand(), { tempFilePrefix: 'sc_preset_' });
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
    delete state.appliedOptions[tweakId];
  }
  const persisted = verified ? savePresetState(state) : false;

  logPresetEntry({
    tweakId,
    action: 'revert',
    restoredTo,
    success: verified,
    persisted,
    actualOptionId: verification.optionId,
    error: verified ? null : (verification.error || 'Verification mismatch after revert.'),
  });

  return {
    ok: verified,
    verified,
    actualOptionId: verification.optionId,
    restoredTo,
    persisted,
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
 * Force-revert a single preset tweak to its **static defaultOptionId** from the
 * tweak definition, bypassing the user-data backup. Same rationale as
 * forceRevertSliderToDefault — the preset-state.json backup may be corrupted.
 *
 * Returns { ok, verified, actualOptionId, restoredTo, error }
 */
async function forceRevertPresetToDefault(tweakId) {
  const def = PRESET_TWEAKS[tweakId];
  if (!def) return { ok: false, error: `Unknown preset tweak: ${tweakId}` };

  const restoredTo = def.defaultOptionId;
  const option = def.options[restoredTo];
  if (!option) return { ok: false, error: `Default option "${restoredTo}" missing for ${tweakId}` };

  console.log(`[PresetExecutor] Force-reverting ${tweakId} to DEFAULT "${restoredTo}"`);

  let writeOk = true;
  let writeError = null;
  try {
    if (def.requiresAdmin) {
      const alreadyAdmin = await checkIsAdmin();
      if (alreadyAdmin) {
        console.log(`[PresetExecutor] force-revert ${tweakId}: already admin — using runPS`);
        await runPS(option.writeCommand());
      } else {
        const result = await runElevated(option.writeCommand(), { tempFilePrefix: 'sc_preset_' });
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

  const state = loadPresetState();
  if (verified) {
    delete state.originalValues[tweakId];
    delete state.appliedOptions[tweakId];
  }
  const persisted = verified ? savePresetState(state) : false;

  logPresetEntry({
    tweakId,
    action: 'revert',
    restoredTo,
    success: verified,
    persisted,
    actualOptionId: verification.optionId,
    error: verified ? null : (verification.error || 'Verification mismatch after revert.'),
  });

  return {
    ok: verified,
    verified,
    actualOptionId: verification.optionId,
    restoredTo,
    persisted,
    error: verified ? null : (verification.error || `Revert verification failed — expected "${restoredTo}", read back "${verification.optionId}".`),
  };
}

/**
 * Revert every premium preset tweak to its static defaultOptionId.
 * Invoked by the premium-revert pipeline on trial expiry / downgrade.
 *
 * Returns { reverted: string[], failed: { tweakId, error }[] }
 */
async function revertAllPremiumPresets() {
  // Iterate ALL premium presets from PRESET_TWEAKS — not just ones with a backup
  // entry in preset-state.json. This guarantees coverage even when the state file
  // is missing, empty, or stale (reinstall, migration, first run on an already-
  // tweaked system). Mirrors the fix already applied to revertAllPremiumSliders().
  const premiumIds = Object.entries(PRESET_TWEAKS)
    .filter(([, def]) => def.premium)
    .map(([id]) => id);

  const reverted = [];
  const failed = [];

  console.log(`[PresetExecutor] revertAllPremiumPresets starting — ${premiumIds.length} premium presets to process`);

  for (const tweakId of premiumIds) {
    try {
      const result = await forceRevertPresetToDefault(tweakId);
      if (result.ok) {
        reverted.push(tweakId);
        console.log(`[PresetExecutor] ✓ reverted ${tweakId} → ${result.restoredTo}`);
      } else {
        failed.push({ tweakId, error: result.error || 'Unknown revert failure' });
        console.warn(`[PresetExecutor] ✗ failed ${tweakId}: ${result.error}`);
      }
    } catch (err) {
      failed.push({ tweakId, error: err.message });
      console.error(`[PresetExecutor] ✗ exception ${tweakId}:`, err.message);
    }
  }

  console.log(`[PresetExecutor] revertAllPremiumPresets complete — total=${premiumIds.length} reverted=${reverted.length} failed=${failed.length}`);
  return { success: true, reverted, failed };
}

/**
 * Restore only preset options that SwitchControl previously applied and
 * verified. Current Windows state alone is never treated as ownership.
 */
async function reapplyAppliedPresetValues(premiumActive = false) {
  const state = migrateLegacyAppliedPresetTargets(loadPresetState());
  const reapplied = [];
  const unchanged = [];
  const skipped = [];
  const failed = [];
  const candidates = [];
  let stateChanged = false;

  for (const [tweakId, optionId] of Object.entries(state.appliedOptions)) {
    const def = PRESET_TWEAKS[tweakId];
    if (!def || !def.options[optionId]) {
      delete state.appliedOptions[tweakId];
      stateChanged = true;
      skipped.push({ tweakId, reason: def ? 'invalid_saved_option' : 'unknown_preset' });
      continue;
    }
    if (def.premium && premiumActive !== true) {
      skipped.push({ tweakId, reason: 'premium_not_verified_active' });
      continue;
    }
    candidates.push({ tweakId, optionId, def });
  }

  if (stateChanged) savePresetState(state);
  const needsAdmin = candidates.some(({ def }) => def.requiresAdmin);
  let isAdmin = false;
  if (needsAdmin) {
    try { isAdmin = await checkIsAdmin(); } catch {}
  }

  console.info(`[PresetExecutor] Startup restore checking ${candidates.length} explicitly applied preset values`);
  for (const { tweakId, optionId, def } of candidates) {
    if (def.requiresAdmin && !isAdmin) {
      skipped.push({ tweakId, reason: 'administrator_required' });
      continue;
    }
    try {
      const current = await readPresetValue(tweakId);
      if (current.error || current.optionId === null) {
        failed.push({ tweakId, error: current.error || 'Current profile could not be read.' });
        continue;
      }
      if (current.optionId === optionId) {
        unchanged.push({ tweakId, optionId });
        continue;
      }

      console.info(`[PresetExecutor] Startup restore ${tweakId}: restoring saved option ${optionId}`);
      const result = await applyPresetValue(tweakId, optionId);
      if (result.ok && result.verified && result.actualOptionId === optionId && result.persisted !== false) {
        reapplied.push({ tweakId, optionId, requiresReboot: def.requiresReboot });
      } else {
        failed.push({
          tweakId,
          error: result.error || (result.persisted === false
            ? 'Profile was restored but its recovery target could not be saved.'
            : `Windows did not retain option "${optionId}".`),
        });
      }
    } catch (err) {
      failed.push({ tweakId, error: err.message || 'Unexpected preset startup-restore error.' });
    }
  }

  console.info(`[PresetExecutor] Startup restore complete — reapplied=${reapplied.length} unchanged=${unchanged.length} skipped=${skipped.length} failed=${failed.length}`);
  return { ok: failed.length === 0, reapplied, unchanged, skipped, failed };
}

module.exports = {
  readPresetValue,
  applyPresetValue,
  resetPresetValue,
  reapplyAppliedPresetValues,
  revertAllPremiumPresets,
  checkCrashSentinel,
  getPresetTweakMeta,
  PRESET_TWEAKS,
  PRESET_TWEAK_IDS,
};
