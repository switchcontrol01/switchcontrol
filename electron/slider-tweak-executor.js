/**
 * Slider Tweak Executor — numeric registry-backed tweaks with
 * read / apply / verify / revert lifecycle.
 *
 * Every tweak here maps 1-to-1 to a real Windows registry value.
 * No placebo sliders. No fake percentages.
 */
const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ─── PowerShell helpers (copied pattern from tweak-executor.js) ───────────────

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

  const launchCmd = `Start-Process powershell -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File','${safeScript}') -Verb RunAs -Wait`;

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

const SLIDER_TWEAKS = {
  /**
   * Win32PrioritySeparation — controls foreground/background scheduling quanta.
   * Real 6-bit DWORD at HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl.
   * Only stepped presets are exposed — no fake freeform 0-100 scale.
   */
  'win32-priority-sep': {
    name:          'Foreground / Background Priority Balance',
    requiresAdmin: true,
    requiresReboot: false,
    regPath:       'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl',
    regName:       'Win32PrioritySeparation',
    regType:       'DWord',
    defaultValue:  2,
    readCommand:   () => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -EA SilentlyContinue).Win32PrioritySeparation`,
    writeCommand:  (v) => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -Value ${v} -Type DWord -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -EA SilentlyContinue).Win32PrioritySeparation -eq ${v}`,
  },

  /**
   * MouseDataQueueSize — depth of the mouse input queue in kbdclass.
   * Lower = less buffering, lower effective latency.
   * Default 16. Gaming recommendation: 8.
   * Restart required to take effect.
   */
  'mouse-queue-size': {
    name:          'Mouse Input Queue Depth',
    requiresAdmin: true,
    requiresReboot: true,
    regPath:       'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters',
    regName:       'MouseDataQueueSize',
    regType:       'DWord',
    defaultValue:  16,
    readCommand:   () => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters' -Name 'MouseDataQueueSize' -EA SilentlyContinue).MouseDataQueueSize`,
    writeCommand:  (v) => `New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters' -Name 'MouseDataQueueSize' -Value ${v} -Type DWord -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters' -Name 'MouseDataQueueSize' -EA SilentlyContinue).MouseDataQueueSize -eq ${v}`,
  },

  /**
   * KeyboardDataQueueSize — depth of the keyboard input queue in kbdclass.
   * Default 16. Gaming recommendation: 8.
   * Restart required.
   */
  'kbd-queue-size': {
    name:          'Keyboard Input Queue Depth',
    requiresAdmin: true,
    requiresReboot: true,
    regPath:       'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters',
    regName:       'KeyboardDataQueueSize',
    regType:       'DWord',
    defaultValue:  16,
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
    readCommand:   () => `(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'SystemResponsiveness' -EA SilentlyContinue).SystemResponsiveness`,
    writeCommand:  (v) => `New-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'SystemResponsiveness' -Value ${v} -Type DWord -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'SystemResponsiveness' -EA SilentlyContinue).SystemResponsiveness -eq ${v}`,
  },

  /**
   * NetworkThrottlingIndex — multimedia network throttling via MMCSS.
   * 0xFFFFFFFF (4294967295) = disabled. 10 = Windows default.
   * Disable for gaming/low-latency. Keep default for multimedia production.
   */
  'net-throttle-index': {
    name:          'Network Throttling Index',
    requiresAdmin: true,
    requiresReboot: false,
    regPath:       'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
    regName:       'NetworkThrottlingIndex',
    regType:       'DWord',
    defaultValue:  10,
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
    readCommand:   () => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -EA SilentlyContinue).MenuShowDelay`,
    writeCommand:  (v) => `Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -Value '${v}' -Type String -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -EA SilentlyContinue).MenuShowDelay -eq '${v}'`,
  },

  /**
   * HungAppTimeout — ms before Windows declares an app "Not Responding".
   * REG_SZ in HKCU. No admin needed. Logout may be needed for full effect.
   * Default 5000ms. Faster values make the "Not Responding" dialog appear sooner.
   */
  'hung-app-timeout': {
    name:          'Hung App Timeout',
    requiresAdmin: false,
    requiresReboot: false,
    regPath:       'HKCU:\\Control Panel\\Desktop',
    regName:       'HungAppTimeout',
    regType:       'String',
    defaultValue:  5000,
    readCommand:   () => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'HungAppTimeout' -EA SilentlyContinue).HungAppTimeout`,
    writeCommand:  (v) => `Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'HungAppTimeout' -Value '${v}' -Type String -Force`,
    verifyCommand: (v) => `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'HungAppTimeout' -EA SilentlyContinue).HungAppTimeout -eq '${v}'`,
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
      // Key doesn't exist — return the system default
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
 * Admin-required tweaks use runElevated().
 * Returns { ok: boolean, verified: boolean, actualValue: number|null, error: string|null }
 */
async function applySliderValue(tweakId, value) {
  const def = SLIDER_TWEAKS[tweakId];
  if (!def) return { ok: false, verified: false, actualValue: null, error: `Unknown slider tweak: ${tweakId}` };

  const numValue = parseInt(String(value), 10);
  if (isNaN(numValue)) return { ok: false, verified: false, actualValue: null, error: 'Value must be a number.' };

  try {
    if (def.requiresAdmin) {
      const result = await runElevated(def.writeCommand(numValue));
      if (!result.ok) {
        return { ok: false, verified: false, actualValue: null, error: result.error || 'Elevation failed.' };
      }
    } else {
      await runPS(def.writeCommand(numValue));
    }

    // Verify immediately
    const verification = await verifySliderValue(tweakId, numValue);
    return {
      ok:          verification.ok,
      verified:    verification.ok,
      actualValue: verification.actualValue,
      error:       verification.ok ? null : (verification.error || 'Verification failed — value did not persist.'),
    };

  } catch (err) {
    return { ok: false, verified: false, actualValue: null, error: err.message };
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
 * Reset a tweak to its system default value.
 */
async function resetSliderValue(tweakId) {
  const def = SLIDER_TWEAKS[tweakId];
  if (!def) return { ok: false, error: `Unknown slider tweak: ${tweakId}` };
  return applySliderValue(tweakId, def.defaultValue);
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
    requiresAdmin:  def.requiresAdmin,
    requiresReboot: def.requiresReboot,
    defaultValue:   def.defaultValue,
    regPath:        def.regPath,
    regName:        def.regName,
    regType:        def.regType,
  };
}

const SLIDER_TWEAK_IDS = Object.keys(SLIDER_TWEAKS);

module.exports = {
  readSliderValue,
  applySliderValue,
  verifySliderValue,
  resetSliderValue,
  getSliderTweakMeta,
  SLIDER_TWEAKS,
  SLIDER_TWEAK_IDS,
};
