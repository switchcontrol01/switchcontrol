/**
 * Slider Tweak Executor — numeric registry-backed tweaks with
 * read / apply / verify / revert lifecycle.
 *
 * Safety systems added in v1.0.2:
 *  1. Hard-blocked tweaks list — mouse-queue-size and kbd-queue-size are
 *     permanently disabled due to MOUSE_CLASS / KEYBOARD_CLASS driver instability.
 *  2. Safe-bounds enforcement — every apply is rejected outside the validated range.
 *  3. Original-value backup — the current registry value is captured before the
 *     first write so revert restores the real previous value, not a hard-coded default.
 *  4. Crash sentinel — a marker file is written before elevated registry writes that
 *     require reboot.  If the app starts and finds the marker, the auto-revert flow
 *     runs and the user is notified.
 *  5. Full audit log — every action records tweakId, previousValue, newValue,
 *     success/failure, and timestamp.
 */
const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const {
  SLIDER_STATE_FILE,
  SLIDER_LOG_FILE,
  SLIDER_CRASH_SENTINEL_FILE,
  APPDATA_DIR,
} = require('./user-data-paths');

// ─── File helpers ─────────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(APPDATA_DIR)) fs.mkdirSync(APPDATA_DIR, { recursive: true });
}

function loadSliderState() {
  try {
    ensureDir();
    if (!fs.existsSync(SLIDER_STATE_FILE)) return { originalValues: {} };
    const raw = fs.readFileSync(SLIDER_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { originalValues: {} };
    if (!parsed.originalValues || typeof parsed.originalValues !== 'object') parsed.originalValues = {};
    return parsed;
  } catch {
    return { originalValues: {} };
  }
}

function saveSliderState(state) {
  try {
    ensureDir();
    fs.writeFileSync(SLIDER_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[SliderExecutor] saveSliderState failed:', e.message);
  }
}

function logSliderEntry(entry) {
  try {
    ensureDir();
    let logs = [];
    if (fs.existsSync(SLIDER_LOG_FILE)) {
      try { logs = JSON.parse(fs.readFileSync(SLIDER_LOG_FILE, 'utf8')); } catch {}
    }
    if (!Array.isArray(logs)) logs = [];
    logs.unshift({ ...entry, timestamp: new Date().toISOString() });
    if (logs.length > 500) logs.length = 500;
    fs.writeFileSync(SLIDER_LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (e) {
    console.error('[SliderExecutor] logSliderEntry failed:', e.message);
  }
}

function writeCrashSentinel(tweakId, previousValue) {
  try {
    ensureDir();
    fs.writeFileSync(SLIDER_CRASH_SENTINEL_FILE, JSON.stringify({
      tweakId,
      previousValue,
      startedAt: new Date().toISOString(),
      requiresReboot: true,
    }, null, 2));
  } catch (e) {
    console.error('[SliderExecutor] writeCrashSentinel failed:', e.message);
  }
}

function clearCrashSentinel() {
  try {
    if (fs.existsSync(SLIDER_CRASH_SENTINEL_FILE)) fs.unlinkSync(SLIDER_CRASH_SENTINEL_FILE);
  } catch {}
}

// ─── PowerShell helpers ────────────────────────────────────────────────────────

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

// One-shot admin check — result cached for the process lifetime.
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
  const scriptId   = `sc_slider_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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

  // -WindowStyle Hidden on Start-Process itself sets SW_HIDE at ShellExecuteEx / process
  // creation time so conhost.exe never shows the window, not just after powershell starts.
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

// ─── Slider tweak definitions ─────────────────────────────────────────────────
//
// Each definition may include:
//   disabled: true          — hard-blocked; applySliderValue returns blocked error
//   disabledReason: string  — user-facing explanation shown in the UI
//   safeMin / safeMax       — values outside this range are rejected before write
//
// SAFETY RULE: any tweak that modifies a kernel input driver (mouclass, kbdclass)
// is permanently disabled.  These drivers cannot be safely hot-reloaded; a bad
// value requires Safe Mode recovery.

const SLIDER_TWEAKS = {
  /**
   * Win32PrioritySeparation — controls foreground/background scheduling quanta.
   * Real 6-bit DWORD at HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl.
   * Only stepped presets are exposed — no fake freeform 0–100 scale.
   */
  'win32-priority-sep': {
    name:          'Foreground / Background Priority Balance',
    requiresAdmin: true,
    requiresReboot: false,
    regPath:       'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl',
    regName:       'Win32PrioritySeparation',
    regType:       'DWord',
    defaultValue:  2,
    safeMin:       0,
    safeMax:       38,
    readCommand:   () => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -EA SilentlyContinue).Win32PrioritySeparation`,
    writeCommand:  (v) => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -Value ${v} -Type DWord -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -EA SilentlyContinue).Win32PrioritySeparation -eq ${v}`,
  },

  /**
   * MouseDataQueueSize — PERMANENTLY DISABLED.
   *
   * Modifying mouclass kernel driver parameters can leave the system with no
   * mouse input, requiring Safe Mode or registry recovery.  A bad value is not
   * recoverable via the UI because the mouse stops working before the user can
   * click Revert.  The benefit (minor buffering reduction) does not justify the
   * risk of bricking user input.
   */
  'mouse-queue-size': {
    name:          'Mouse Input Queue Depth',
    disabled:      true,
    disabledReason: 'Disabled for safety: modifying the mouclass kernel driver queue (MouseDataQueueSize) can leave the system with no mouse input, requiring Safe Mode recovery. The latency benefit is negligible and does not justify the risk.',
    requiresAdmin: true,
    requiresReboot: true,
    regPath:       'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters',
    regName:       'MouseDataQueueSize',
    regType:       'DWord',
    defaultValue:  16,
    safeMin:       4,
    safeMax:       16,
    readCommand:   () => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters' -Name 'MouseDataQueueSize' -EA SilentlyContinue).MouseDataQueueSize`,
    writeCommand:  (v) => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters' -Name 'MouseDataQueueSize' -Value ${v} -Type DWord -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters' -Name 'MouseDataQueueSize' -EA SilentlyContinue).MouseDataQueueSize -eq ${v}`,
  },

  /**
   * KeyboardDataQueueSize — PERMANENTLY DISABLED.
   *
   * Same reasoning as MouseDataQueueSize above.  A bad value leaves the system
   * with no keyboard input, unrecoverable without Safe Mode.
   */
  'kbd-queue-size': {
    name:          'Keyboard Input Queue Depth',
    disabled:      true,
    disabledReason: 'Disabled for safety: modifying the kbdclass kernel driver queue (KeyboardDataQueueSize) can leave the system with no keyboard input, requiring Safe Mode recovery. This is not reversible through the UI if input stops working.',
    requiresAdmin: true,
    requiresReboot: true,
    regPath:       'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters',
    regName:       'KeyboardDataQueueSize',
    regType:       'DWord',
    defaultValue:  16,
    safeMin:       4,
    safeMax:       16,
    readCommand:   () => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters' -Name 'KeyboardDataQueueSize' -EA SilentlyContinue).KeyboardDataQueueSize`,
    writeCommand:  (v) => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters' -Name 'KeyboardDataQueueSize' -Value ${v} -Type DWord -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters' -Name 'KeyboardDataQueueSize' -EA SilentlyContinue).KeyboardDataQueueSize -eq ${v}`,
  },

  /**
   * SystemResponsiveness — MMCSS percentage of CPU time reserved for background tasks.
   * 0 = all CPU for foreground audio/gaming. 20 = Windows default.
   * Does NOT require restart; takes effect on next MMCSS client connection.
   */
  'sys-responsiveness': {
    name:          'MMCSS System Responsiveness',
    requiresAdmin: true,
    requiresReboot: false,
    regPath:       'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
    regName:       'SystemResponsiveness',
    regType:       'DWord',
    defaultValue:  20,
    safeMin:       0,
    safeMax:       100,
    readCommand:   () => `(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'SystemResponsiveness' -EA SilentlyContinue).SystemResponsiveness`,
    writeCommand:  (v) => `New-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'SystemResponsiveness' -Value ${v} -Type DWord -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'SystemResponsiveness' -EA SilentlyContinue).SystemResponsiveness -eq ${v}`,
  },

  /**
   * NetworkThrottlingIndex — multimedia network throttling via MMCSS.
   * 0xFFFFFFFF (4294967295) = disabled. 10 = Windows default.
   */
  'net-throttle-index': {
    name:          'Network Throttling Index',
    requiresAdmin: true,
    requiresReboot: false,
    regPath:       'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
    regName:       'NetworkThrottlingIndex',
    regType:       'DWord',
    defaultValue:  10,
    safeMin:       1,
    safeMax:       4294967295,
    readCommand:   () => `(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'NetworkThrottlingIndex' -EA SilentlyContinue).NetworkThrottlingIndex`,
    writeCommand:  (v) => `New-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'NetworkThrottlingIndex' -Value ${v} -Type DWord -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'NetworkThrottlingIndex' -EA SilentlyContinue).NetworkThrottlingIndex -eq ${v}`,
  },

  /**
   * MenuShowDelay — milliseconds Windows waits before showing a cascading menu.
   * Stored as REG_SZ string in HKCU. No admin required.
   * 0 = instant. 400 = Windows default.
   */
  'menu-show-delay': {
    name:          'Menu Show Delay',
    requiresAdmin: false,
    requiresReboot: false,
    regPath:       'HKCU:\\Control Panel\\Desktop',
    regName:       'MenuShowDelay',
    regType:       'String',
    defaultValue:  400,
    safeMin:       0,
    safeMax:       4000,
    readCommand:   () => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -EA SilentlyContinue).MenuShowDelay`,
    writeCommand:  (v) => `Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -Value '${v}' -Type String -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -EA SilentlyContinue).MenuShowDelay -eq '${v}'`,
  },

  /**
   * HungAppTimeout — ms before Windows declares an app "Not Responding".
   * REG_SZ in HKCU. No admin needed.
   * Default 5000ms.
   */
  'hung-app-timeout': {
    name:          'Hung App Timeout',
    requiresAdmin: false,
    requiresReboot: false,
    regPath:       'HKCU:\\Control Panel\\Desktop',
    regName:       'HungAppTimeout',
    regType:       'String',
    defaultValue:  5000,
    safeMin:       1000,
    safeMax:       30000,
    readCommand:   () => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'HungAppTimeout' -EA SilentlyContinue).HungAppTimeout`,
    writeCommand:  (v) => `Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'HungAppTimeout' -Value '${v}' -Type String -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'HungAppTimeout' -EA SilentlyContinue).HungAppTimeout -eq '${v}'`,
  },

  /**
   * LowLevelHooksTimeout — milliseconds Windows waits for a low-level keyboard or
   * mouse hook to process an input event. Default 5000ms on Win10/11.
   * REG_SZ in HKCU, no admin required.
   * Safe range: 200ms–10000ms. Below 200ms risks misfiring legitimate hooks.
   */
  'low-level-hooks-timeout': {
    name:          'Low-Level Hook Timeout',
    requiresAdmin: false,
    requiresReboot: false,
    regPath:       'HKCU:\\Control Panel\\Desktop',
    regName:       'LowLevelHooksTimeout',
    regType:       'String',
    defaultValue:  5000,
    safeMin:       200,
    safeMax:       10000,
    readCommand:   () => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'LowLevelHooksTimeout' -EA SilentlyContinue).LowLevelHooksTimeout`,
    writeCommand:  (v) => `Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'LowLevelHooksTimeout' -Value '${v}' -Type String -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'LowLevelHooksTimeout' -EA SilentlyContinue).LowLevelHooksTimeout -eq '${v}'`,
  },

  /**
   * WaitToKillAppTimeout — milliseconds Windows waits for an app to respond to
   * WM_QUERYENDSESSION during shutdown. Default 20000ms.
   * Safe range: 2000ms–30000ms. Below 2000ms risks data loss on shutdown.
   */
  'wait-to-kill-app': {
    name:          'Wait to Kill App on Shutdown',
    requiresAdmin: false,
    requiresReboot: false,
    regPath:       'HKCU:\\Control Panel\\Desktop',
    regName:       'WaitToKillAppTimeout',
    regType:       'String',
    defaultValue:  20000,
    safeMin:       2000,
    safeMax:       30000,
    readCommand:   () => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'WaitToKillAppTimeout' -EA SilentlyContinue).WaitToKillAppTimeout`,
    writeCommand:  (v) => `Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'WaitToKillAppTimeout' -Value '${v}' -Type String -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'WaitToKillAppTimeout' -EA SilentlyContinue).WaitToKillAppTimeout -eq '${v}'`,
  },
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Read the current numeric value from the registry.
 * Returns { value: number|null, raw: string|null, error: string|null }
 */
async function readSliderValue(tweakId) {
  const def = SLIDER_TWEAKS[tweakId];
  if (!def) return { value: null, raw: null, error: `Unknown slider tweak: ${tweakId}` };

  try {
    const raw = await queryPS(def.readCommand());
    if (raw === null || raw === '' || raw.toLowerCase() === 'false') {
      return { value: def.defaultValue, raw: String(def.defaultValue), missing: true, error: null };
    }
    const num = parseInt(raw, 10);
    if (isNaN(num)) {
      return { value: def.defaultValue, raw, missing: false, error: null };
    }
    return { value: num, raw, missing: false, error: null };
  } catch (err) {
    return { value: null, raw: null, missing: false, error: err.message };
  }
}

/**
 * Apply a new numeric value to the registry.
 *
 * Safety pipeline (in order):
 *  1. Blocked tweak check  — hard-disabled tweaks are rejected immediately.
 *  2. Safe-bounds check    — value must be within def.safeMin / def.safeMax.
 *  3. Original-value backup — captures current registry value before the first
 *     write, so revert can restore the real previous value.
 *  4. Crash sentinel       — written before elevated writes that require reboot;
 *     cleared only after verified success.
 *  5. Write + verify       — runs the write command and reads back the result.
 *  6. Full audit log       — records tweakId, previousValue, newValue, outcome.
 *
 * Returns { ok, verified, actualValue, error, blocked, previousValue }
 */
async function applySliderValue(tweakId, value) {
  const def = SLIDER_TWEAKS[tweakId];
  if (!def) {
    logSliderEntry({ tweakId, action: 'apply', value, blocked: true, success: false, error: 'Unknown slider tweak' });
    return { ok: false, verified: false, actualValue: null, error: `Unknown slider tweak: ${tweakId}` };
  }

  // 1. Hard-blocked check
  if (def.disabled) {
    const reason = def.disabledReason || 'This tweak has been disabled for safety reasons.';
    console.warn(`[SliderExecutor] BLOCKED apply for disabled tweak: ${tweakId}`);
    logSliderEntry({ tweakId, action: 'apply', value, blocked: true, success: false, error: reason });
    return { ok: false, verified: false, blocked: true, actualValue: null, error: reason };
  }

  const numValue = parseInt(String(value), 10);
  if (isNaN(numValue)) {
    logSliderEntry({ tweakId, action: 'apply', value, blocked: true, success: false, error: 'Value must be a number' });
    return { ok: false, verified: false, actualValue: null, error: 'Value must be a number.' };
  }

  // 2. Safe-bounds validation
  if (def.safeMin !== undefined && numValue < def.safeMin) {
    const msg = `Value ${numValue} is below the safe minimum of ${def.safeMin} for ${def.name}.`;
    logSliderEntry({ tweakId, action: 'apply', value: numValue, blocked: true, success: false, error: msg });
    return { ok: false, verified: false, blocked: true, actualValue: null, error: msg };
  }
  if (def.safeMax !== undefined && numValue > def.safeMax) {
    const msg = `Value ${numValue} exceeds the safe maximum of ${def.safeMax} for ${def.name}.`;
    logSliderEntry({ tweakId, action: 'apply', value: numValue, blocked: true, success: false, error: msg });
    return { ok: false, verified: false, blocked: true, actualValue: null, error: msg };
  }

  // 3. Capture original value (only once — before the first write ever)
  const state = loadSliderState();
  let previousValue = null;
  if (!state.originalValues[tweakId]) {
    const current = await readSliderValue(tweakId);
    previousValue = current.value;
    state.originalValues[tweakId] = {
      value:       current.value,
      capturedAt:  new Date().toISOString(),
      missing:     current.missing || false,
    };
    saveSliderState(state);
    console.log(`[SliderExecutor] Original value captured for ${tweakId}: ${current.value}`);
  } else {
    previousValue = state.originalValues[tweakId].value;
  }

  try {
    // 4. Write crash sentinel before any reboot-required elevated write
    if (def.requiresReboot && def.requiresAdmin) {
      writeCrashSentinel(tweakId, previousValue);
    }

    // 5. Execute write
    // When already admin, use runPS() directly — avoids spawning an elevated child
    // via Start-Process which can briefly flash a console window even with -WindowStyle Hidden.
    if (def.requiresAdmin) {
      const alreadyAdmin = await checkIsAdmin();
      if (alreadyAdmin) {
        console.log(`[SliderExecutor] ${tweakId}: already admin — using runPS (no UAC spawn)`);
        await runPS(def.writeCommand(numValue));
      } else {
        const result = await runElevated(def.writeCommand(numValue));
        if (!result.ok) {
          clearCrashSentinel();
          logSliderEntry({ tweakId, action: 'apply', previousValue, newValue: numValue, success: false, error: result.error });
          return { ok: false, verified: false, actualValue: null, previousValue, error: result.error || 'Elevation failed.' };
        }
      }
    } else {
      await runPS(def.writeCommand(numValue));
    }

    // 6. Verify
    const verification = await verifySliderValue(tweakId, numValue);
    clearCrashSentinel();

    logSliderEntry({
      tweakId,
      action: 'apply',
      previousValue,
      newValue: numValue,
      success: verification.ok,
      actualValue: verification.actualValue,
      error: verification.ok ? null : (verification.error || 'Verification failed'),
    });

    return {
      ok:            verification.ok,
      verified:      verification.ok,
      actualValue:   verification.actualValue,
      previousValue,
      error:         verification.ok ? null : (verification.error || 'Verification failed — value did not persist.'),
    };

  } catch (err) {
    clearCrashSentinel();
    logSliderEntry({ tweakId, action: 'apply', previousValue, newValue: numValue, success: false, error: err.message });
    return { ok: false, verified: false, actualValue: null, previousValue, error: err.message };
  }
}

/**
 * Read back the value and compare it to expectedValue.
 * Returns { ok: boolean, actualValue: number|null, error: string|null }
 */
async function verifySliderValue(tweakId, expectedValue) {
  const def = SLIDER_TWEAKS[tweakId];
  if (!def) return { ok: false, actualValue: null, error: `Unknown slider tweak: ${tweakId}` };

  try {
    const raw = await queryPS(def.readCommand());
    if (raw === null || raw === '') {
      return { ok: false, actualValue: null, error: 'Registry key not found after write.' };
    }
    const actual = parseInt(raw, 10);
    if (isNaN(actual)) return { ok: false, actualValue: null, error: `Non-numeric value read back: "${raw}"` };
    return { ok: actual === parseInt(String(expectedValue), 10), actualValue: actual, error: null };
  } catch (err) {
    return { ok: false, actualValue: null, error: err.message };
  }
}

/**
 * Revert a slider tweak.
 *
 * Restore priority:
 *  1. Stored original value (captured before the first write) — exact restore.
 *  2. Tweak's defaultValue — fallback if no backup exists.
 *
 * Returns { ok, verified, actualValue, restoredTo, error }
 */
async function resetSliderValue(tweakId) {
  const def = SLIDER_TWEAKS[tweakId];
  if (!def) return { ok: false, error: `Unknown slider tweak: ${tweakId}` };

  // Blocked tweaks: still allow revert so users who applied before the block can recover
  const state = loadSliderState();
  const backup = state.originalValues[tweakId];
  const restoredTo = (backup && backup.value !== null && backup.value !== undefined)
    ? backup.value
    : def.defaultValue;

  console.log(`[SliderExecutor] Reverting ${tweakId} to ${restoredTo} (${backup ? 'original backup' : 'default'})`);

  // Write directly without bounds check — restoring original is always safe
  let writeOk = true;
  let writeErr = null;

  // Write crash sentinel for reboot-required reverts
  if (def.requiresReboot && def.requiresAdmin) {
    writeCrashSentinel(tweakId, restoredTo);
  }

  try {
    if (def.requiresAdmin) {
      const alreadyAdmin = await checkIsAdmin();
      if (alreadyAdmin) {
        console.log(`[SliderExecutor] revert ${tweakId}: already admin — using runPS (no UAC spawn)`);
        await runPS(def.writeCommand(restoredTo));
      } else {
        const result = await runElevated(def.writeCommand(restoredTo));
        if (!result.ok) { writeOk = false; writeErr = result.error || 'Elevation failed.'; }
      }
    } else {
      await runPS(def.writeCommand(restoredTo));
    }
  } catch (err) {
    writeOk = false;
    writeErr = err.message;
  }

  clearCrashSentinel();

  if (!writeOk) {
    logSliderEntry({ tweakId, action: 'revert', restoredTo, success: false, error: writeErr });
    return { ok: false, verified: false, actualValue: null, restoredTo, error: writeErr };
  }

  const verification = await verifySliderValue(tweakId, restoredTo);

  // Clear the backup on successful revert so next apply re-captures fresh original
  if (verification.ok) {
    delete state.originalValues[tweakId];
    saveSliderState(state);
  }

  logSliderEntry({
    tweakId,
    action: 'revert',
    restoredTo,
    usedBackup: !!backup,
    success: verification.ok,
    actualValue: verification.actualValue,
    error: verification.ok ? null : (verification.error || 'Verification failed after revert'),
  });

  return {
    ok:          verification.ok,
    verified:    verification.ok,
    actualValue: verification.actualValue,
    restoredTo,
    error:       verification.ok ? null : (verification.error || 'Revert verification failed.'),
  };
}

/**
 * Startup crash-sentinel check.
 *
 * Call this once on app launch before any UI is shown.
 * If a sentinel exists, the previous session may have crashed during an
 * elevated reboot-risk write.  Returns the sentinel data so the caller can
 * prompt the user and optionally call resetSliderValue() to restore.
 *
 * Returns null if no sentinel exists, or { tweakId, previousValue, startedAt }.
 */
function checkCrashSentinel() {
  try {
    if (!fs.existsSync(SLIDER_CRASH_SENTINEL_FILE)) return null;
    const raw = fs.readFileSync(SLIDER_CRASH_SENTINEL_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !data.tweakId) return null;
    console.warn(`[SliderExecutor] Crash sentinel found for tweak: ${data.tweakId} — may need auto-revert`);
    return data;
  } catch {
    return null;
  }
}

/**
 * Return static metadata about a slider tweak.
 */
function getSliderTweakMeta(tweakId) {
  const def = SLIDER_TWEAKS[tweakId];
  if (!def) return null;
  return {
    tweakId,
    name:           def.name,
    disabled:       def.disabled || false,
    disabledReason: def.disabledReason || null,
    requiresAdmin:  def.requiresAdmin,
    requiresReboot: def.requiresReboot,
    defaultValue:   def.defaultValue,
    safeMin:        def.safeMin,
    safeMax:        def.safeMax,
    regPath:        def.regPath,
    regName:        def.regName,
    regType:        def.regType,
  };
}

const SLIDER_TWEAK_IDS = Object.keys(SLIDER_TWEAKS);
const DISABLED_SLIDER_TWEAKS = Object.fromEntries(
  Object.entries(SLIDER_TWEAKS)
    .filter(([, def]) => def.disabled)
    .map(([id, def]) => [id, def.disabledReason])
);

module.exports = {
  readSliderValue,
  applySliderValue,
  verifySliderValue,
  resetSliderValue,
  checkCrashSentinel,
  getSliderTweakMeta,
  SLIDER_TWEAKS,
  SLIDER_TWEAK_IDS,
  DISABLED_SLIDER_TWEAKS,
};
