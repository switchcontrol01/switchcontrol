const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { TWEAK_STATE_FILE, TWEAK_LOG_FILE } = require('./user-data-paths');

// ─── file helpers ──────────────────────────────────────────────────────────────
function ensureStateDir() {
  const dir = path.dirname(TWEAK_STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadState() {
  const defaultState = { meta: { windowsBuild: os.release(), lastVerified: null }, tweaks: {} };
  try {
    ensureStateDir();
    if (!fs.existsSync(TWEAK_STATE_FILE)) return defaultState;
    const raw  = fs.readFileSync(TWEAK_STATE_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Must be a plain object — reject arrays, primitives, null
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      console.warn('[TweakExecutor] tweak-state.json has unexpected shape — resetting');
      return defaultState;
    }
    // Validate tweaks map: every value must be a boolean
    const rawTweaks = data.tweaks;
    let tweaks = {};
    if (rawTweaks && typeof rawTweaks === 'object' && !Array.isArray(rawTweaks)) {
      for (const [k, v] of Object.entries(rawTweaks)) {
        if (typeof v === 'boolean') tweaks[k] = v;
        // Non-boolean values are silently dropped to prevent stale/corrupt entries
      }
    }
    const meta = (data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta))
      ? { windowsBuild: String(data.meta.windowsBuild || os.release()), lastVerified: data.meta.lastVerified || null }
      : { windowsBuild: os.release(), lastVerified: null };
    return { meta, tweaks };
  } catch (e) {
    console.error('[TweakExecutor] loadState failed — using default empty state:', e.message);
    return defaultState;
  }
}

function saveState(state) {
  try {
    ensureStateDir();
    state.meta.windowsBuild = os.release();
    state.meta.lastVerified  = new Date().toISOString();
    // Atomic write: tmp → rename so a crash mid-write never corrupts the file.
    const tmp = TWEAK_STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, TWEAK_STATE_FILE);
  } catch (e) {
    console.error('[TweakExecutor] saveState failed:', e.message);
    try { fs.unlinkSync(TWEAK_STATE_FILE + '.tmp'); } catch {}
  }
}

function logEntry(entry) {
  try {
    ensureStateDir();
    let logs = [];
    if (fs.existsSync(TWEAK_LOG_FILE)) {
      try { logs = JSON.parse(fs.readFileSync(TWEAK_LOG_FILE, 'utf8')); } catch {}
    }
    logs.unshift({ ...entry, timestamp: new Date().toISOString() });
    if (logs.length > 200) logs = logs.slice(0, 200);
    fs.writeFileSync(TWEAK_LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (e) { console.error('[TweakExecutor] logEntry failed:', e.message); }
}

function getExecutionLog() {
  try {
    if (fs.existsSync(TWEAK_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(TWEAK_LOG_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

// ─── PowerShell concurrency semaphore ─────────────────────────────────────────
// Hard cap: never allow more than MAX_PS_CONCURRENT powershell.exe processes
// from this module at once. Callers that arrive when slots are full queue up
// (await) rather than spawning a new process immediately. This prevents
// verification bursts (e.g. syncAll + individual verify calls arriving
// simultaneously) from flooding the process list with powershell.exe children.
//
// The global ps-limiter in main.js provides per-operation single-flight;
// this semaphore is belt-and-suspenders at the spawn level.

const MAX_PS_CONCURRENT = 2;
let _psActive = 0;
const _psQueue = [];

function _withPsSemaphore(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      _psActive++;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          _psActive--;
          if (_psQueue.length > 0) {
            const next = _psQueue.shift();
            next();
          }
        });
    };
    if (_psActive < MAX_PS_CONCURRENT) {
      run();
    } else {
      console.log(`[PS-Semaphore] queued — ${_psActive}/${MAX_PS_CONCURRENT} slots active, queue=${_psQueue.length + 1}`);
      _psQueue.push(run);
    }
  });
}

// ─── PowerShell helpers ────────────────────────────────────────────────────────
// Diagnostic counter — every powershell.exe spawn increments this.
// At idle this number must never climb. Log lines appear in the Electron console.
let _tweak_psCount = 0;

function runPowerShell(command) {
  // Acquire semaphore slot before spawning — queues if MAX_PS_CONCURRENT is full.
  // This prevents apply/revert bursts from spawning unlimited powershell.exe children.
  return _withPsSemaphore(() => {
    const id = ++_tweak_psCount;
    const t0 = Date.now();
    console.log(`[PS:tweak-executor] #${id} runPowerShell SPAWN ts=${t0} active=${_psActive}`);
    return new Promise((resolve, reject) => {
      const wrapped = `try { ${command}; exit 0 } catch { Write-Error $_.Exception.Message; exit 1 }`;
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', wrapped],
        { timeout: 30000, windowsHide: true },
        (error, stdout, stderr) => {
          const dur = Date.now() - t0;
          if (error) {
            const msg = stderr?.trim() || stdout?.trim() || error.message;
            console.log(`[PS:tweak-executor] #${id} runPowerShell FAIL ${dur}ms`);
            reject(new Error(msg));
          } else {
            console.log(`[PS:tweak-executor] #${id} runPowerShell OK ${dur}ms`);
            resolve(stdout.trim());
          }
        }
      );
    });
  });
}

function queryPowerShell(command) {
  // Acquire semaphore slot before spawning — queues if MAX_PS_CONCURRENT is full
  return _withPsSemaphore(() => {
    const id = ++_tweak_psCount;
    const t0 = Date.now();
    console.log(`[PS:tweak-executor] #${id} queryPowerShell SPAWN ts=${t0} active=${_psActive}`);
    return new Promise((resolve) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { timeout: 12000, windowsHide: true },
        (error, stdout) => {
          console.log(`[PS:tweak-executor] #${id} queryPowerShell ${error ? 'FAIL' : 'OK'} ${Date.now() - t0}ms`);
          resolve(error ? null : stdout.trim());
        }
      );
    });
  });
}

function checkPowerShell(command) {
  return queryPowerShell(command).then(out => {
    if (out === null) return false;
    return out.toLowerCase() === 'true';
  });
}

// ─── AudioGuard ──────────────────────────────────────────────────────────────────
// Tweaks touching audio/mic services are blocked from bulk "Apply Recommended"
// to prevent breaking Bluetooth headsets, microphones, or audio endpoints.
//
// Guarded services: bthserv, BthA2dp, Audiosrv, AudioEndpointBuilder
// Guarded tweak IDs: bluetooth (bthserv + BthA2dp)
//
// Usage: call audioGuardCheck(tweakId, context) before applying in bulk mode.

const AUDIO_SERVICE_NAMES = ['bthserv', 'BthA2dp', 'Audiosrv', 'AudioEndpointBuilder'];
const AUDIO_GUARDED_TWEAKS = ['bluetooth'];

async function audioGuardCheck(tweakId, context) {
  if (!AUDIO_GUARDED_TWEAKS.includes(tweakId)) return { ok: true };
  let activeDevices = null;
  try {
    activeDevices = await queryPowerShell(
      "Get-PnpDevice | Where-Object { $_.FriendlyName -match 'Bluetooth|Audio|Headset|Microphone|Speaker' -and $_.Status -eq 'OK' } | Select-Object -ExpandProperty FriendlyName"
    );
  } catch (e) {
    console.log(`[AudioGuard] ${tweakId} — device query failed, allowing with warning: ${e.message}`);
    return { ok: true, warning: 'Could not enumerate active audio devices.' };
  }
  const hasActiveAudio = activeDevices && activeDevices.trim().length > 0;
  console.log(`[AudioGuard] ${tweakId} — active audio devices detected: ${hasActiveAudio}`);
  if (hasActiveAudio && context === 'bulk') {
    return {
      ok: false,
      blocked: true,
      reason: `AudioGuard blocked ${tweakId}: active Bluetooth/audio devices detected. Apply this tweak individually if you are sure.`,
      devices: activeDevices.split('\n').map(s => s.trim()).filter(Boolean),
    };
  }
  return { ok: true, warning: hasActiveAudio ? 'Active audio devices present — verify before applying.' : null };
}

// ─── NetworkGuard ───────────────────────────────────────────────────────────────
// Pre/post ping check for network tweaks. Auto-rollback if gateway latency worsens.
//
// Usage: call networkGuardPre(tweakId) before applying to capture baseline ping.
//        call networkGuardPost(tweakId, baselineMs) after applying to check for regression.

const NETWORK_GUARDED_TWEAKS = [
  'tcp-nagle', 'tcp-congestion', 'tcp-task-offload', 'tcp-timestamps',
  'tcp-window-heuristics', 'udp-offloads', 'tcp-rto-increase', 'tcp-connection-timeout',
  'wifi', 'bluetooth'
];

async function networkGuardPre(tweakId) {
  if (!NETWORK_GUARDED_TWEAKS.includes(tweakId)) return { ok: true };
  let baseline = null;
  try {
    const raw = await queryPowerShell(
      "Test-Connection -ComputerName (Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select-Object -First 1).NextHop -Count 4 -ErrorAction SilentlyContinue | Measure-Object ResponseTime -Average | Select-Object -ExpandProperty Average"
    );
    baseline = raw ? parseFloat(raw.trim()) : null;
  } catch (e) {
    console.log(`[NetworkGuard] ${tweakId} — baseline ping failed: ${e.message}`);
  }
  console.log(`[NetworkGuard] ${tweakId} — baseline ping: ${baseline ?? 'unavailable'} ms`);
  return { ok: true, baselineMs: baseline };
}

async function networkGuardPost(tweakId, baselineMs) {
  if (!NETWORK_GUARDED_TWEAKS.includes(tweakId)) return { ok: true };
  if (typeof baselineMs !== 'number' || isNaN(baselineMs)) {
    console.log(`[NetworkGuard] ${tweakId} — no valid baseline, skipping post-check`);
    return { ok: true, warning: 'No baseline ping available — verify network manually.' };
  }
  let postMs = null;
  try {
    const raw = await queryPowerShell(
      "Test-Connection -ComputerName (Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select-Object -First 1).NextHop -Count 4 -ErrorAction SilentlyContinue | Measure-Object ResponseTime -Average | Select-Object -ExpandProperty Average"
    );
    postMs = raw ? parseFloat(raw.trim()) : null;
  } catch (e) {
    console.log(`[NetworkGuard] ${tweakId} — post ping failed: ${e.message}`);
    return { ok: true, warning: 'Post-check ping failed — verify network manually.' };
  }
  console.log(`[NetworkGuard] ${tweakId} — post ping: ${postMs ?? 'unavailable'} ms (baseline ${baselineMs} ms)`);
  if (postMs === null) {
    return { ok: true, warning: 'Could not measure post-apply ping — verify network manually.' };
  }
  const delta = postMs - baselineMs;
  const pct = baselineMs > 0 ? (delta / baselineMs) * 100 : 0;
  if (delta > 20 || pct > 25) {
    console.warn(`[NetworkGuard] ${tweakId} — PING REGRESSION DETECTED: ${postMs}ms vs baseline ${baselineMs}ms (+${delta.toFixed(1)}ms / +${pct.toFixed(0)}%). Auto-rollback required.`);
    return {
      ok: false,
      rollbackRequired: true,
      reason: `NetworkGuard: ping increased from ${baselineMs.toFixed(1)}ms to ${postMs.toFixed(1)}ms (+${delta.toFixed(1)}ms). Auto-rolling back ${tweakId}.`,
      baselineMs,
      postMs,
      deltaMs: delta,
      pctIncrease: pct,
    };
  }
  return { ok: true, postMs, deltaMs: delta, pctIncrease: pct };
}

// ─── Admin detection (cached) ──────────────────────────────────────────────────
let _isAdmin = null;
async function checkIsAdmin() {
  if (_isAdmin !== null) return _isAdmin;
  try {
    _isAdmin = await checkPowerShell(
      "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
    );
  } catch { _isAdmin = false; }
  return _isAdmin;
}

// ─── Per-action UAC elevation ──────────────────────────────────────────────────
// Writes a temp PowerShell script, launches it via Start-Process -Verb RunAs,
// then polls for the result file (Start-Process -Wait has a known race where it
// can return before the child finishes writing the file on some Windows versions).
async function runElevated(command) {
  const tmpDir   = os.tmpdir();
  const scriptId = `sc_tweak_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const scriptPath = path.join(tmpDir, `${scriptId}.ps1`);
  const resultPath = path.join(tmpDir, `${scriptId}_result.json`);

  console.log(`[runElevated] scriptPath: "${scriptPath}"`);
  console.log(`[runElevated] resultPath: "${resultPath}"`);

  // PowerShell single-quoted strings treat backslash as literal — only ' needs doubling.
  const safeResultPath = resultPath.replace(/'/g, "''");
  const safeScriptPath = scriptPath.replace(/'/g, "''");

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

  // ArgumentList as PS array — avoids nested quoting inside -Command strings.
  // -Wait is passed so the host process waits for the elevated child.
  // -WindowStyle Hidden suppresses the console popup in the elevated child.
  // -WindowStyle Hidden is passed to Start-Process itself (not only inside -ArgumentList)
  // so that ShellExecuteEx sets wShowWindow=SW_HIDE at process creation time.
  // Without it, conhost.exe briefly creates a visible console window before
  // powershell.exe has a chance to hide itself via its own -WindowStyle flag.
  const launchCmd = `Start-Process powershell -WindowStyle Hidden -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', '${safeScriptPath}') -Verb RunAs -Wait`;

  try {
    await new Promise((resolve, reject) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', launchCmd],
        { timeout: 120_000, windowsHide: true },
        (err) => {
          if (err) {
            const msg = err.message || '';
            console.error(`[runElevated] execFile error: ${msg}`);
            reject(err);
          } else {
            console.log('[runElevated] execFile completed — checking for result file');
            resolve();
          }
        }
      );
    });

    // Poll for the result file for up to 5 seconds.
    // Start-Process -Wait has a race on some Windows versions where it returns
    // before the child's I/O is fully flushed to disk.
    const pollDeadline = Date.now() + 5000;
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
        // Treat { ok: true, error: null } as clean success
        if (parsed.ok === true) return { ok: true, error: null };
        return parsed;
      } catch {
        return { ok: false, error: `Elevated script ran but result file could not be parsed (raw: ${raw.slice(0, 200)})` };
      }
    }

    return { ok: false, error: 'Result file not found after 5s wait. The elevated script may have crashed before writing — check that PowerShell scripts can run in your temp folder.' };

  } catch (err) {
    const msg = (err && err.message) || String(err);
    // execFile exits non-zero when UAC is declined — detect it by keyword
    if (/cancel|denied|elevat|access|uac/i.test(msg) || (err && err.code === 1)) {
      return { ok: false, cancelled: true, error: 'Admin permission was canceled. No system changes were made.' };
    }
    return { ok: false, error: `Elevation failed: ${msg}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(resultPath); } catch {}
  }
}

// ─── Failure classification helpers ───────────────────────────────────────────

// Known Group Policy registry paths that can block specific tweaks.
// Keyed by tweakId; value is a PS expression returning $true when a policy lock is active.
const POLICY_CHECKS = {
  'telemetry':      `$null -ne (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' -Name 'AllowTelemetry' -EA SilentlyContinue)`,
  'gaming-mode':    `(Get-ItemProperty 'HKCU:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR' -Name 'AllowGameDVR' -EA SilentlyContinue).AllowGameDVR -eq 0`,
  'cortana':        `$null -ne (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search' -Name 'AllowCortana' -EA SilentlyContinue)`,
  'notifications':  `Test-Path 'HKCU:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer'`,
  'core-isolation': `$null -ne (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeviceGuard' -Name 'HypervisorEnforcedCodeIntegrity' -EA SilentlyContinue)`,
  'vbs':            `$null -ne (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeviceGuard' -Name 'EnableVirtualizationBasedSecurity' -EA SilentlyContinue)`,
  'fast-startup':   `$null -ne (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Name 'HiberbootEnabled' -EA SilentlyContinue)`,
  'xbox-bar':       `(Get-ItemProperty 'HKCU:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR' -Name 'AllowGameDVR' -EA SilentlyContinue).AllowGameDVR -eq 0`,
  'xbox-services':  `Test-Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR'`,
  'bluetooth':      `$null -ne (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Bluetooth' -EA SilentlyContinue -Name '*')`,
};

async function checkPolicyLock(tweakId) {
  const check = POLICY_CHECKS[tweakId];
  if (!check) return false;
  try { return await checkPowerShell(check); } catch { return false; }
}

function classifyErrorMessage(msg) {
  if (!msg) return 'unknown';
  if (/cancel|deny|denied|declined|uac/i.test(msg))           return 'uac_cancelled';
  if (/access.?denied|unauthorized|not.?allowed|forbidden/i.test(msg)) return 'access_denied';
  if (/not found|does not exist|cannot find|path does not/i.test(msg)) return 'not_found';
  if (/policy|gpo|group.?policy|mdm/i.test(msg))             return 'blocked_by_policy';
  if (/privilege|administrator|elevation|elevat/i.test(msg))  return 'requires_admin';
  return 'unknown';
}

const FAILURE_META = {
  requires_admin:      { userMessage: 'Requires Administrator Mode',     hint: 'Right-click SwitchControl and choose "Run as administrator", then try again.' },
  blocked_by_policy:   { userMessage: 'Blocked by Windows Policy',       hint: 'A Group Policy or MDM rule is preventing this change. Open gpedit.msc to review policies, or contact your administrator.' },
  uac_cancelled:       { userMessage: 'UAC Prompt Declined',             hint: 'Click "Yes" on the User Account Control prompt that appears to allow the change.' },
  access_denied:       { userMessage: 'Access Denied',                   hint: 'Windows is blocking access to this system resource. Try running SwitchControl as administrator.' },
  verification_failed: { userMessage: 'Setting Could Not Be Verified',   hint: 'The command ran but the system state did not change. An antivirus or security tool may be reverting it immediately.' },
  not_found:           { userMessage: 'Not Supported on This System',    hint: 'This registry key, service, or feature does not exist on your Windows version.' },
  unsupported:         { userMessage: 'Tweak Not Supported',             hint: '' },
  unknown:             { userMessage: 'Tweak Could Not Be Applied',      hint: 'An unexpected error occurred. Check SwitchControl logs for details.' },
};

function enrichFailure(baseResult, failureType) {
  const meta = FAILURE_META[failureType] || FAILURE_META.unknown;
  return { ...baseResult, failureType, userMessage: meta.userMessage, hint: meta.hint };
}

// ─── UNSUPPORTED tweaks ────────────────────────────────────────────────────────
// These tweaks cannot be implemented with persistent registry/command changes.
// They are kept visible and honestly marked, toggle is disabled in UI.
// Reason format follows the [TweakSupport] audit standard:
//   "Unsupported on Windows 10/11" | "Helper not bundled" | "Requires driver/service not installed" | "Power setting not found"
const UNSUPPORTED_TWEAKS = {
  'p-states':         "Requires driver/service not installed — CPU P-state control needs a kernel-mode agent calling ACPI driver interfaces. Cannot be applied persistently via registry.",
  'irq-priority':     "Requires driver/service not installed — interrupt affinity control is not accessible from user-mode. Needs a signed kernel driver or MSR write access.",
  'timer-res':        "Helper not bundled — timer resolution requires a persistent agent calling timeBeginPeriod(). The effect resets when the process exits. No agent is shipped in this build.",
  'desktop-comp':     "Unsupported on Windows 10/11 — Desktop Window Manager (DWM) is an integral system compositor and cannot be disabled. Disabling DWM was only possible on Windows XP/Vista.",
  'hdcp':             "Requires driver/service not installed — HDCP enforcement is controlled at the GPU hardware/display-driver level and cannot be reliably toggled via software or registry.",
  // Disabled in v1.0.2 — kernel input driver parameters can cause unrecoverable
  // mouse/keyboard loss if set incorrectly.  These are handled by slider-tweak-executor
  // with a hard block; this entry prevents any accidental toggle-path execution.
  'mouse-queue-size': "Requires driver/service not installed — MouseDataQueueSize (mouclass kernel driver) modification can cause complete mouse failure requiring Safe Mode recovery. Disabled for safety.",
  'kbd-queue-size':   "Requires driver/service not installed — KeyboardDataQueueSize (kbdclass kernel driver) modification can cause complete keyboard failure requiring Safe Mode recovery. Disabled for safety.",
  // WinHTTP autotuning is a netsh command, not a persistent registry tweak.
  // The effect resets when the network adapter restarts. Marked unsupported
  // because the app does not ship a persistent agent to maintain it.
  'tcp-winhttp':      "Helper not bundled — WinHTTP autotuning is applied via netsh and resets when the network adapter restarts. No persistent agent is shipped in this build.",
};

// ─── TweakSupport audit logger ────────────────────────────────────────────────
// Emits structured [TweakSupport] lines so log analysis can quickly identify
// every support decision made at runtime.  Call this whenever a tweak's support
// status is evaluated — both on positive (supported) and negative (unsupported)
// paths.
//
// Format: [TweakSupport] id=<id>, supported=<bool>, reason=<reason>, os=<os>, helperFound=<bool|n/a>
function logTweakSupport(tweakId, supported, reason, extras = {}) {
  const os = require('os');
  const helperFound = extras.helperFound !== undefined ? String(extras.helperFound) : 'n/a';
  const osRelease   = extras.osRelease   || os.release();
  const extra = Object.entries(extras)
    .filter(([k]) => k !== 'helperFound' && k !== 'osRelease')
    .map(([k, v]) => `, ${k}=${v}`)
    .join('');
  console.log(`[TweakSupport] id=${tweakId}, supported=${supported}, reason="${reason}", os=${osRelease}, helperFound=${helperFound}${extra}`);
}

// ─── HKCU tweaks (no admin required) ──────────────────────────────────────────
const HKCU_TWEAKS = {
  'gaming-mode': {
    name: 'Enable Game Mode',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `New-Item -Path "HKCU:\\Software\\Microsoft\\GameBar" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -Value 1 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -Value 0 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -EA SilentlyContinue).AutoGameModeEnabled -eq 1`,
  },
  'notifications': {
    name: 'Disable Notifications',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" -Name "ToastEnabled" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" -Name "ToastEnabled" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" -Name "ToastEnabled" -EA SilentlyContinue).ToastEnabled -eq 0`,
  },
  'copilot': {
    name: 'Disable Copilot',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `New-Item -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Name "TurnOffWindowsCopilot" -Value 1 -Type DWord -Force`,
    revert: `Remove-ItemProperty -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Name "TurnOffWindowsCopilot" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Name "TurnOffWindowsCopilot" -EA SilentlyContinue).TurnOffWindowsCopilot -eq 1`,
  },
  'cortana': {
    name: 'Disable Cortana',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search" -Name "CortanaConsent" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search" -Name "CortanaConsent" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search" -Name "CortanaConsent" -EA SilentlyContinue).CortanaConsent -eq 0`,
  },
  'search-highlights': {
    name: 'Disable Search Highlights',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings" -Name "IsDynamicSearchBoxEnabled" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings" -Name "IsDynamicSearchBoxEnabled" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings" -Name "IsDynamicSearchBoxEnabled" -EA SilentlyContinue).IsDynamicSearchBoxEnabled -eq 0`,
  },
  'storage-sense': {
    name: 'Disable Storage Sense',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy" -Name "01" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy" -Name "01" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy" -Name "01" -EA SilentlyContinue)."01" -eq 0`,
  },
  'compact-explorer': {
    name: 'Compact Explorer View',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "UseCompactMode" -Value 1 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "UseCompactMode" -Value 0 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "UseCompactMode" -EA SilentlyContinue).UseCompactMode -eq 1`,
  },
  'recent-files': {
    name: 'Disable Recent Files',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "Start_TrackDocs" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "Start_TrackDocs" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "Start_TrackDocs" -EA SilentlyContinue).Start_TrackDocs -eq 0`,
  },
  'xbox-bar': {
    name: 'Disable Xbox Game Bar',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 0 -Type DWord -Force; New-Item -Path "HKCU:\\System\\GameConfigStore" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 1 -Type DWord -Force; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -EA SilentlyContinue).AppCaptureEnabled -eq 0`,
  },
  'bg-apps': {
    name: 'Disable Background Apps',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" -Name "GlobalUserDisabled" -Value 1 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" -Name "GlobalUserDisabled" -Value 0 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" -Name "GlobalUserDisabled" -EA SilentlyContinue).GlobalUserDisabled -eq 1`,
  },
  'disable-fso': {
    name: 'Disable Fullscreen Optimizations',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `New-Item -Path "HKCU:\\System\\GameConfigStore" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorMode" -Value 2 -Type DWord -Force; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehavior" -Value 2 -Type DWord -Force; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_DXGIHonorFSEWindowsCompatible" -Value 1 -Type DWord -Force; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_HonorUserFSEBehaviorMode" -Value 0 -Type DWord -Force`,
    revert: `Remove-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorMode" -EA SilentlyContinue; Remove-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehavior" -EA SilentlyContinue; Remove-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_DXGIHonorFSEWindowsCompatible" -EA SilentlyContinue; Remove-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_HonorUserFSEBehaviorMode" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorMode" -EA SilentlyContinue).GameDVR_FSEBehaviorMode -eq 2`,
  },
  'disable-pointer-precision': {
    name: 'Disable Enhanced Pointer Precision',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `New-Item -Path "HKCU:\\Control Panel\\Mouse" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseSpeed" -Value "0" -Type String -Force; Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold1" -Value "0" -Type String -Force; Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold2" -Value "0" -Type String -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseSpeed" -Value "1" -Type String -Force; Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold1" -Value "6" -Type String -Force; Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold2" -Value "10" -Type String -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseSpeed" -EA SilentlyContinue).MouseSpeed -eq "0"`,
  },
  'disable-transparency': {
    name: 'Disable Transparency Effects',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" -Name "EnableTransparency" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" -Name "EnableTransparency" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" -Name "EnableTransparency" -EA SilentlyContinue).EnableTransparency -eq 0`,
  },
  'disable-animations': {
    name: 'Disable Window Animations',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" -Name "VisualFXSetting" -Value 3 -Type DWord -Force; New-Item -Path "HKCU:\\Control Panel\\Desktop\\WindowMetrics" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop\\WindowMetrics" -Name "MinAnimate" -Value "0" -Type String -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" -Name "VisualFXSetting" -Value 0 -Type DWord -Force; Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop\\WindowMetrics" -Name "MinAnimate" -Value "1" -Type String -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" -Name "VisualFXSetting" -EA SilentlyContinue).VisualFXSetting -eq 3`,
  },
  // ── New Pass 2 HKCU toggles ───────────────────────────────────────────────────
  'show-file-extensions': {
    // HideFileExt = 0 means extensions ARE shown (inverse of the key name)
    name: 'Show File Extensions',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "HideFileExt" -Value 0 -Type DWord -Force; & Stop-Process -Name explorer -Force -EA SilentlyContinue; Start-Sleep -Milliseconds 800; Start-Process explorer`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "HideFileExt" -Value 1 -Type DWord -Force; & Stop-Process -Name explorer -Force -EA SilentlyContinue; Start-Sleep -Milliseconds 800; Start-Process explorer`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "HideFileExt" -EA SilentlyContinue).HideFileExt -eq 0`,
  },
  'explorer-separate-process': {
    // SeparateProcess = 1 means each Explorer window runs in its own process
    name: 'Explorer — Separate Process per Window',
    requiresAdmin:  false,
    requiresReboot: false,
    apply:  `New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "SeparateProcess" -Value 1 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "SeparateProcess" -Value 0 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "SeparateProcess" -EA SilentlyContinue).SeparateProcess -eq 1`,
  },
  'disable-wallpaper-compression': {
    name: 'Disable Wallpaper Compression',
    requiresAdmin: false,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "JPEGImportQuality" -Value 100 -Type DWord -Force`,
    revert: `Remove-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "JPEGImportQuality" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "JPEGImportQuality" -EA SilentlyContinue).JPEGImportQuality -eq 100`,
  },
};

// ─── ADMIN tweaks (HKLM / services / bcdedit – require elevation) ──────────────
const ADMIN_TWEAKS = {
  'hibernation': {
    name: 'Disable Hibernation',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power" -Name "HibernateEnabled" -Value 0 -Type DWord -Force; & powercfg /h off 2>$null; exit 0`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power" -Name "HibernateEnabled" -Value 1 -Type DWord -Force; & powercfg /h on 2>$null; exit 0`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power" -Name "HibernateEnabled" -EA SilentlyContinue).HibernateEnabled -eq 0`,
  },
  'fast-startup': {
    name: 'Disable Fast Startup',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power" -Name "HiberbootEnabled" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power" -Name "HiberbootEnabled" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power" -Name "HiberbootEnabled" -EA SilentlyContinue).HiberbootEnabled -eq 0`,
  },
  'energy-logging': {
    name: 'Disable Energy Logging',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$tn = "AnalyzeSystem"; $t = Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Power Efficiency Diagnostics\\" -TaskName $tn -EA SilentlyContinue; if (-not $t) { $t = Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Power Efficiency Diagnostics" -TaskName $tn -EA SilentlyContinue }; if ($t) { Disable-ScheduledTask -TaskPath $t.TaskPath -TaskName $tn | Out-Null }`,
    revert: `$tn = "AnalyzeSystem"; $t = Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Power Efficiency Diagnostics\\" -TaskName $tn -EA SilentlyContinue; if (-not $t) { $t = Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Power Efficiency Diagnostics" -TaskName $tn -EA SilentlyContinue }; if ($t) { Enable-ScheduledTask -TaskPath $t.TaskPath -TaskName $tn | Out-Null }`,
    check:  `$tn = "AnalyzeSystem"; $t = Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Power Efficiency Diagnostics\\" -TaskName $tn -EA SilentlyContinue; if (-not $t) { $t = Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Power Efficiency Diagnostics" -TaskName $tn -EA SilentlyContinue }; if (-not $t) { $true } else { $t.State -eq "Disabled" }`,
  },
  'maintenance': {
    // The scheduled-task path for "Regular Maintenance" varies across Windows builds
    // and Disable-ScheduledTask can silently fail or get re-enabled by the Task Scheduler
    // service.  The authoritative, version-stable approach is the MaintenanceDisabled
    // registry key — this is what Task Scheduler and the Action Center both honour.
    name: 'Disable Maintenance Tasks',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$p = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Schedule\\Maintenance"; New-Item -Path $p -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path $p -Name "MaintenanceDisabled" -Value 1 -Type DWord -Force`,
    revert: `$p = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Schedule\\Maintenance"; Remove-ItemProperty -Path $p -Name "MaintenanceDisabled" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Schedule\\Maintenance" -Name "MaintenanceDisabled" -EA SilentlyContinue).MaintenanceDisabled -eq 1`,
  },
  'core-isolation': {
    name: 'Disable Core Isolation (HVCI)',
    requiresAdmin:  true,
    requiresReboot: true,
    apply:  `$p = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity"; New-Item -Path $p -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path $p -Name "Enabled" -Value 0 -Type DWord -Force`,
    revert: `$p = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity"; New-Item -Path $p -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path $p -Name "Enabled" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity" -Name "Enabled" -EA SilentlyContinue).Enabled -eq 0`,
  },
  'vbs': {
    name: 'Disable Virtualization Based Security',
    requiresAdmin:  true,
    requiresReboot: true,
    apply:  `New-Item -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard" -Name "EnableVirtualizationBasedSecurity" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard" -Name "EnableVirtualizationBasedSecurity" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard" -Name "EnableVirtualizationBasedSecurity" -EA SilentlyContinue).EnableVirtualizationBasedSecurity -eq 0`,
  },
  'hyper-v': {
    name: 'Disable Hyper-V',
    requiresAdmin:  true,
    requiresReboot: true,
    apply:  `& bcdedit /set hypervisorlaunchtype off 2>&1 | Out-Null; exit 0`,
    revert: `& bcdedit /set hypervisorlaunchtype auto 2>&1 | Out-Null; exit 0`,
    check:  `$out = & bcdedit /enum 2>&1; ($out | Select-String "hypervisorlaunchtype" | Select-Object -First 1) -match "Off$"`,
  },
  'large-system-cache': {
    name: 'Disable Large System Cache',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "LargeSystemCache" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "LargeSystemCache" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "LargeSystemCache" -EA SilentlyContinue).LargeSystemCache -eq 0`,
  },
  'page-combining': {
    name: 'Disable Page Combining',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `try { Set-MMAgent -PageCombining $false } catch { New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "EnablePageCombining" -Value 0 -Type DWord -Force -EA SilentlyContinue | Out-Null }`,
    revert: `try { Set-MMAgent -PageCombining $true } catch { Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "EnablePageCombining" -EA SilentlyContinue }`,
    check:  `try { -not (Get-MMAgent).PageCombining } catch { (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "EnablePageCombining" -EA SilentlyContinue).EnablePageCombining -eq 0 }`,
  },
  'prefetch': {
    name: 'Disable Prefetch',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters" -Name "EnablePrefetcher" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters" -Name "EnablePrefetcher" -Value 3 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters" -Name "EnablePrefetcher" -EA SilentlyContinue).EnablePrefetcher -eq 0`,
  },
  'superfetch': {
    name: 'Disable SysMain/Superfetch',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$svc = Get-Service -Name SysMain -EA SilentlyContinue; if ($svc) { Stop-Service SysMain -Force -EA SilentlyContinue; Set-Service SysMain -StartupType Disabled }`,
    revert: `$svc = Get-Service -Name SysMain -EA SilentlyContinue; if ($svc) { Set-Service SysMain -StartupType Automatic; Start-Service SysMain -EA SilentlyContinue }`,
    check:  `$s = Get-Service -Name SysMain -EA SilentlyContinue; $s -and ($s.StartType -eq "Disabled")`,
  },
  'mem-opt': {
    name: 'Optimize Memory Settings',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$mm = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management"; Set-ItemProperty -Path $mm -Name "DisablePagingExecutive" -Value 1 -Type DWord -Force; Set-ItemProperty -Path $mm -Name "LargeSystemCache" -Value 0 -Type DWord -Force; Set-ItemProperty -Path $mm -Name "ClearPageFileAtShutdown" -Value 0 -Type DWord -Force`,
    revert: `$mm = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management"; Set-ItemProperty -Path $mm -Name "DisablePagingExecutive" -Value 0 -Type DWord -Force; Remove-ItemProperty -Path $mm -Name "LargeSystemCache" -EA SilentlyContinue; Remove-ItemProperty -Path $mm -Name "ClearPageFileAtShutdown" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "DisablePagingExecutive" -EA SilentlyContinue).DisablePagingExecutive -eq 1`,
  },
  'telemetry': {
    name: 'Disable Telemetry',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" -Name "AllowTelemetry" -Value 0 -Type DWord -Force; $tasks = @("\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser","\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater","\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator","\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip"); foreach ($t in $tasks) { $parts = $t.Split("\\"); $name = $parts[-1]; $path = ($parts[0..($parts.Length-2)] -join "\\") + "\\"; $task = Get-ScheduledTask -TaskPath $path -TaskName $name -EA SilentlyContinue; if ($task) { Disable-ScheduledTask -TaskPath $path -TaskName $name | Out-Null } }`,
    revert: `Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" -Name "AllowTelemetry" -EA SilentlyContinue; $tasks = @("\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser","\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater","\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator","\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip"); foreach ($t in $tasks) { $parts = $t.Split("\\"); $name = $parts[-1]; $path = ($parts[0..($parts.Length-2)] -join "\\") + "\\"; $task = Get-ScheduledTask -TaskPath $path -TaskName $name -EA SilentlyContinue; if ($task) { Enable-ScheduledTask -TaskPath $path -TaskName $name | Out-Null } }`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" -Name "AllowTelemetry" -EA SilentlyContinue).AllowTelemetry -eq 0`,
  },
  'nvidia-telemetry': {
    name: 'Disable NVIDIA Telemetry',
    requiresAdmin:  true,
    requiresReboot: false,
    // apply/revert/check are handled specially below (requires NVIDIA detection)
    _special: 'nvidia-telemetry',
  },
  'tune-priority': {
    name: 'Tune Process Priority',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" -Name "Win32PrioritySeparation" -Value 38 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" -Name "Win32PrioritySeparation" -Value 2 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" -Name "Win32PrioritySeparation" -EA SilentlyContinue).Win32PrioritySeparation -eq 38`,
  },
  'bluetooth': {
    name: 'Disable Bluetooth',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$svc = Get-Service -Name bthserv -EA SilentlyContinue; if ($svc) { Stop-Service bthserv -Force -EA SilentlyContinue; Set-Service bthserv -StartupType Disabled }; $svc2 = Get-Service -Name BthA2dp -EA SilentlyContinue; if ($svc2) { Stop-Service BthA2dp -Force -EA SilentlyContinue; Set-Service BthA2dp -StartupType Disabled }`,
    revert: `$svc = Get-Service -Name bthserv -EA SilentlyContinue; if ($svc) { Set-Service bthserv -StartupType Automatic; Start-Service bthserv -EA SilentlyContinue }; $svc2 = Get-Service -Name BthA2dp -EA SilentlyContinue; if ($svc2) { Set-Service BthA2dp -StartupType Automatic; Start-Service BthA2dp -EA SilentlyContinue }`,
    check:  `$s = Get-Service -Name bthserv -EA SilentlyContinue; $s -and ($s.StartType -eq "Disabled")`,
  },
  'wifi': {
    name: 'Disable Wi-Fi',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$svc = Get-Service -Name WlanSvc -EA SilentlyContinue; if ($svc) { Stop-Service WlanSvc -Force -EA SilentlyContinue; Set-Service WlanSvc -StartupType Disabled } else { Write-Error "WlanSvc not found" }`,
    revert: `$svc = Get-Service -Name WlanSvc -EA SilentlyContinue; if ($svc) { Set-Service WlanSvc -StartupType Automatic; Start-Service WlanSvc -EA SilentlyContinue }`,
    check:  `$s = Get-Service -Name WlanSvc -EA SilentlyContinue; $s -and ($s.StartType -eq "Disabled")`,
  },
  'xbox-services': {
    name: 'Disable Xbox Services',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `@("XblAuthManager","XblGameSave","XboxGipSvc","XboxNetApiSvc") | ForEach-Object { $s = Get-Service -Name $_ -EA SilentlyContinue; if ($s) { Stop-Service $_ -Force -EA SilentlyContinue; Set-Service $_ -StartupType Disabled } }`,
    revert: `@("XblAuthManager","XblGameSave","XboxGipSvc","XboxNetApiSvc") | ForEach-Object { $s = Get-Service -Name $_ -EA SilentlyContinue; if ($s) { Set-Service $_ -StartupType Manual } }`,
    check:  `$s = Get-Service -Name XblAuthManager -EA SilentlyContinue; $s -and ($s.StartType -eq "Disabled")`,
  },
  'fax-printer': {
    name: 'Disable Print Spooler',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$sp = Get-Service -Name Spooler -EA SilentlyContinue; if ($sp) { Stop-Service Spooler -Force -EA SilentlyContinue; Set-Service Spooler -StartupType Disabled }; $fx = Get-Service -Name Fax -EA SilentlyContinue; if ($fx) { Stop-Service Fax -Force -EA SilentlyContinue; Set-Service Fax -StartupType Disabled }`,
    revert: `$sp = Get-Service -Name Spooler -EA SilentlyContinue; if ($sp) { Set-Service Spooler -StartupType Automatic; Start-Service Spooler -EA SilentlyContinue }; $fx = Get-Service -Name Fax -EA SilentlyContinue; if ($fx) { Set-Service Fax -StartupType Manual }`,
    check:  `$s = Get-Service -Name Spooler -EA SilentlyContinue; $s -and ($s.StartType -eq "Disabled")`,
  },
  'synth-timers': {
    name: 'Disable Synthetic Timers',
    requiresAdmin:  true,
    requiresReboot: true,
    apply:  `& bcdedit /set disabledynamictick yes 2>&1 | Out-Null; exit 0`,
    revert: `& bcdedit /deletevalue disabledynamictick 2>&1 | Out-Null; exit 0`,
    check:  `$out = & bcdedit /enum 2>&1; ($out | Select-String "disabledynamictick") -match "Yes"`,
  },
  'preemption': {
    name: 'Enable GPU Hardware Scheduling (Preemption)',
    requiresAdmin:  true,
    requiresReboot: true,
    apply:  `New-Item -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" -Name "HwSchMode" -Value 2 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" -Name "HwSchMode" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" -Name "HwSchMode" -EA SilentlyContinue).HwSchMode -eq 2`,
  },
  'disable-mpo': {
    name: 'Disable Multi-Plane Overlay',
    requiresAdmin:  true,
    requiresReboot: true,
    apply:  `New-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\Dwm" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\Dwm" -Name "OverlayTestMode" -Value 5 -Type DWord -Force`,
    revert: `Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\Dwm" -Name "OverlayTestMode" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\Dwm" -Name "OverlayTestMode" -EA SilentlyContinue).OverlayTestMode -eq 5`,
  },
  'usb-selective-suspend': {
    name: 'Disable USB Selective Suspend',
    requiresAdmin:  true,
    requiresReboot: false,
    // Sub-group: USB (2a737441-1930-4402-8d77-b2bebba308a3)
    // Setting: USB selective suspend (48e6b7a6-50f5-4782-a5d4-53bb8f07e226)
    // 0 = Disabled, 1 = Enabled
    apply:  `& powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 2>&1 | Out-Null; & powercfg /setdcvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 2>&1 | Out-Null; & powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null; exit 0`,
    revert: `& powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 1 2>&1 | Out-Null; & powercfg /setdcvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 1 2>&1 | Out-Null; & powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null; exit 0`,
    check:  `$out = (& powercfg /query SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 2>&1 | Out-String); [bool]($out -match "Current AC Power Setting Index: 0x00000000")`,
  },
  'pcie-link-state': {
    name: 'Disable PCIe Link State Power Management',
    requiresAdmin:  true,
    requiresReboot: false,
    // Sub-group: PCI Express (501a4d13-42af-4429-9fd1-a8218c268e20)
    // Setting: Link State Power Management (ee12f906-d277-404b-b6da-e5fa1a576df5)
    // 0 = Off, 1 = Moderate, 2 = Maximum
    apply:  `& powercfg /setacvalueindex SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 0 2>&1 | Out-Null; & powercfg /setdcvalueindex SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 0 2>&1 | Out-Null; & powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null; exit 0`,
    revert: `& powercfg /setacvalueindex SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 2 2>&1 | Out-Null; & powercfg /setdcvalueindex SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 2 2>&1 | Out-Null; & powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null; exit 0`,
    check:  `$out = (& powercfg /query SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 2>&1 | Out-String); [bool]($out -match "Current AC Power Setting Index: 0x00000000")`,
  },
  'mmcss-gaming': {
    name: 'Optimize MMCSS for Gaming',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$p = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile"; Set-ItemProperty -Path $p -Name "SystemResponsiveness" -Value 0 -Type DWord -Force; $g = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games"; New-Item -Path $g -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path $g -Name "Scheduling Category" -Value "High" -Force; Set-ItemProperty -Path $g -Name "SFIO Rate" -Value "High" -Force; Set-ItemProperty -Path $g -Name "Background Only" -Value "False" -Force; Set-ItemProperty -Path $g -Name "Priority" -Value 6 -Type DWord -Force; Set-ItemProperty -Path $g -Name "GPU Priority" -Value 8 -Type DWord -Force; Set-ItemProperty -Path $g -Name "Clock Rate" -Value 10000 -Type DWord -Force`,
    revert: `$p = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile"; Set-ItemProperty -Path $p -Name "SystemResponsiveness" -Value 20 -Type DWord -Force; $g = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games"; Set-ItemProperty -Path $g -Name "Scheduling Category" -Value "Medium" -EA SilentlyContinue; Set-ItemProperty -Path $g -Name "SFIO Rate" -Value "Medium" -EA SilentlyContinue; Set-ItemProperty -Path $g -Name "Priority" -Value 2 -Type DWord -EA SilentlyContinue; Set-ItemProperty -Path $g -Name "GPU Priority" -Value 8 -Type DWord -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Name "SystemResponsiveness" -EA SilentlyContinue).SystemResponsiveness -eq 0`,
  },
  'disable-delivery-opt': {
    name: 'Disable Delivery Optimization',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization" -Name "DODownloadMode" -Value 0 -Type DWord -Force; $s = Get-Service -Name DoSvc -EA SilentlyContinue; if ($s) { Stop-Service DoSvc -Force -EA SilentlyContinue }`,
    revert: `Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization" -Name "DODownloadMode" -EA SilentlyContinue; $s = Get-Service -Name DoSvc -EA SilentlyContinue; if ($s) { Start-Service DoSvc -EA SilentlyContinue }`,
    check:  `($p = Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization" -Name "DODownloadMode" -EA SilentlyContinue) -ne $null -and $p.DODownloadMode -eq 0`,
  },
  'disable-wer': {
    name: 'Disable Windows Error Reporting',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$s = Get-Service -Name WerSvc -EA SilentlyContinue; if ($s) { Stop-Service WerSvc -Force -EA SilentlyContinue; Set-Service WerSvc -StartupType Disabled }; New-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting" -Name "Disabled" -Value 1 -Type DWord -Force`,
    revert: `$s = Get-Service -Name WerSvc -EA SilentlyContinue; if ($s) { Set-Service WerSvc -StartupType Manual }; Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting" -Name "Disabled" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting" -Name "Disabled" -EA SilentlyContinue).Disabled -eq 1`,
  },
  'win-search-index': {
    name: 'Disable Windows Search Indexing',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$s = Get-Service -Name WSearch -EA SilentlyContinue; if ($s) { Stop-Service WSearch -Force -EA SilentlyContinue; Set-Service WSearch -StartupType Disabled }`,
    revert: `$s = Get-Service -Name WSearch -EA SilentlyContinue; if ($s) { Set-Service WSearch -StartupType Automatic; Start-Service WSearch -EA SilentlyContinue }`,
    check:  `$s = Get-Service -Name WSearch -EA SilentlyContinue; $s -and ($s.StartType -eq "Disabled")`,
  },
  'disable-activity-history': {
    name: 'Disable Activity History',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$p = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System"; New-Item -Path $p -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path $p -Name "EnableActivityFeed" -Value 0 -Type DWord -Force; Set-ItemProperty -Path $p -Name "PublishUserActivities" -Value 0 -Type DWord -Force; Set-ItemProperty -Path $p -Name "UploadUserActivities" -Value 0 -Type DWord -Force`,
    revert: `$p = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System"; Remove-ItemProperty -Path $p -Name "EnableActivityFeed" -EA SilentlyContinue; Remove-ItemProperty -Path $p -Name "PublishUserActivities" -EA SilentlyContinue; Remove-ItemProperty -Path $p -Name "UploadUserActivities" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System" -Name "EnableActivityFeed" -EA SilentlyContinue).EnableActivityFeed -eq 0`,
  },
  'power-throttling': {
    name: 'Disable Power Throttling',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$p = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling"; New-Item -Path $p -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path $p -Name "PowerThrottlingOff" -Value 1 -Type DWord -Force`,
    revert: `$p = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling"; Remove-ItemProperty -Path $p -Name "PowerThrottlingOff" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling" -Name "PowerThrottlingOff" -EA SilentlyContinue).PowerThrottlingOff -eq 1`,
  },
  'ntfs-last-access': {
    name: 'Disable NTFS Last Access Updates',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$p = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem"; New-Item -Path $p -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path $p -Name "NtfsDisableLastAccessUpdate" -Value 1 -Type DWord -Force`,
    revert: `$p = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem"; Set-ItemProperty -Path $p -Name "NtfsDisableLastAccessUpdate" -Value 0 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem" -Name "NtfsDisableLastAccessUpdate" -EA SilentlyContinue).NtfsDisableLastAccessUpdate -eq 1`,
  },
  // ── New Pass 2 ADMIN toggles ──────────────────────────────────────────────────
  'disable-auto-restart-apps': {
    // RestartApps = 0 prevents Windows from silently restarting Store apps after sign-in.
    // Keeps startup cleaner for gaming and performance-focused systems.
    name: 'Disable Auto-Restart Apps After Sign-In',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$p = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon"; New-Item -Path $p -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path $p -Name "RestartApps" -Value 0 -Type DWord -Force`,
    revert: `$p = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon"; Remove-ItemProperty -Path $p -Name "RestartApps" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" -Name "RestartApps" -EA SilentlyContinue).RestartApps -eq 0`,
  },
  'mmcss-nolazymode': {
    name: 'Disable MMCSS Lazy Mode',
    requiresAdmin: true,
    requiresReboot: false,
    apply:  `New-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Name "NoLazyMode" -Value 1 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Name "NoLazyMode" -Value 0 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Name "NoLazyMode" -EA SilentlyContinue).NoLazyMode -eq 1`,
  },
  'disable-lock-screen': {
    name: 'Disable Lock Screen',
    requiresAdmin: true,
    requiresReboot: false,
    apply:  `New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization" -Name "NoLockScreen" -Value 1 -Type DWord -Force`,
    revert: `Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization" -Name "NoLockScreen" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization" -Name "NoLockScreen" -EA SilentlyContinue).NoLockScreen -eq 1`,
  },
  'disable-dcom': {
    name: 'Disable DCOM',
    requiresAdmin: true,
    requiresReboot: true,
    apply:  `Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Ole" -Name "EnableDCOM" -Value "N" -Type String -Force`,
    revert: `Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Ole" -Name "EnableDCOM" -Value "Y" -Type String -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Ole" -Name "EnableDCOM" -EA SilentlyContinue).EnableDCOM -eq "N"`,
  },
  'svchost-split-threshold': {
    name: 'Service Host Split Threshold',
    requiresAdmin: true,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control" -Name "SvcHostSplitThresholdInKB" -Value 67108864 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control" -Name "SvcHostSplitThresholdInKB" -Value 380000 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control" -Name "SvcHostSplitThresholdInKB" -EA SilentlyContinue).SvcHostSplitThresholdInKB -ge 67108864`,
  },
};

// Merged lookup (no unsupported tweaks here)
const ALL_TWEAKS = { ...HKCU_TWEAKS, ...ADMIN_TWEAKS };

// ─── Special handlers ──────────────────────────────────────────────────────────
async function executeNvidiaTelemetry(action) {
  // Detect NVIDIA GPU
  const hasNvidia = await checkPowerShell(
    "(Get-CimInstance Win32_VideoController -EA SilentlyContinue | Where-Object { $_.Name -like '*NVIDIA*' }) -ne $null"
  );
  if (!hasNvidia) {
    return {
      ok: false,
      unsupported: true,
      commandsRun: [],
      message: 'No NVIDIA GPU detected on this system.',
    };
  }

  const enableOrDisable = action === 'apply' ? 'Disable' : 'Enable';
  const psCmd = `
    $tasks = Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskName -like "NvTm*" -or $_.TaskName -like "NvNode*" -or $_.TaskName -like "NvProfile*" };
    foreach ($t in $tasks) { ${enableOrDisable}-ScheduledTask -TaskPath $t.TaskPath -TaskName $t.TaskName | Out-Null };
    $svc = Get-Service -Name NvTelemetryContainer -EA SilentlyContinue;
    if ($svc) { ${action === 'apply' ? 'Stop-Service NvTelemetryContainer -Force -EA SilentlyContinue; Set-Service NvTelemetryContainer -StartupType Disabled' : 'Set-Service NvTelemetryContainer -StartupType Automatic'} }
  `.trim();

  await runPowerShell(psCmd);

  // Verify: check if NvTelemetryContainer is disabled OR tasks are all disabled
  const verified = await checkPowerShell(
    `$tasks = Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskName -like "NvTm*" -or $_.TaskName -like "NvNode*" }; if ($tasks.Count -eq 0) { $svc = Get-Service -Name NvTelemetryContainer -EA SilentlyContinue; $svc -and ($svc.StartType -eq "Disabled") } else { ($tasks | Where-Object { $_.State -ne "Disabled" }).Count -eq 0 }`
  );

  return {
    ok: action === 'apply' ? verified : !verified,
    commandsRun: [psCmd],
    message: `NVIDIA telemetry ${action === 'apply' ? 'disabled' : 'restored'} (detected NVIDIA GPU).`,
    rebootRequired: false,
  };
}

// ─── Core functions ────────────────────────────────────────────────────────────
async function verifyTweak(tweakId) {
  const osVer = require('os').release();

  if (UNSUPPORTED_TWEAKS[tweakId]) {
    logTweakSupport(tweakId, false, UNSUPPORTED_TWEAKS[tweakId], { osRelease: osVer });
    return { isApplied: false, unsupported: true, unsupportedReason: UNSUPPORTED_TWEAKS[tweakId] };
  }

  const tweak = ALL_TWEAKS[tweakId];
  if (!tweak) return { isApplied: false, verified: false };

  if (tweak._special === 'nvidia-telemetry') {
    const hasNv = await checkPowerShell("(Get-CimInstance Win32_VideoController -EA SilentlyContinue | Where-Object { $_.Name -like '*NVIDIA*' }) -ne $null");
    if (!hasNv) {
      logTweakSupport(tweakId, false, 'No NVIDIA GPU detected', { osRelease: osVer, helperFound: false });
      return { isApplied: false, unsupported: true, message: 'No NVIDIA GPU detected.' };
    }
    logTweakSupport(tweakId, true, 'NVIDIA GPU present', { osRelease: osVer, helperFound: true });
    const applied = await checkPowerShell(
      `$tasks = Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskName -like "NvTm*" -or $_.TaskName -like "NvNode*" }; if ($tasks.Count -eq 0) { $svc = Get-Service -Name NvTelemetryContainer -EA SilentlyContinue; $svc -and ($svc.StartType -eq "Disabled") } else { ($tasks | Where-Object { $_.State -ne "Disabled" }).Count -eq 0 }`
    );
    return { isApplied: applied, verified: true };
  }

  // USB Selective Suspend — runtime probe: verify the power setting GUID actually
  // exists in the current power scheme before trying the boolean check.
  // On VMs or headless builds powercfg may not expose the USB sub-group.
  if (tweakId === 'usb-selective-suspend') {
    const probeResult = await queryPowerShell(
      `$out = (& powercfg /query SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 2>&1 | Out-String).Trim(); ` +
      `if ($out -match "does not exist|GUID is invalid|not found|error 0x8007|No Power Scheme") { Write-Output "SETTING_MISSING" } ` +
      `elseif ($out -match "Current AC Power Setting Index: 0x00000000") { Write-Output "APPLIED" } ` +
      `else { Write-Output "NOT_APPLIED" }`
    );
    if (probeResult === 'SETTING_MISSING') {
      const reason = 'Power setting not found — USB Selective Suspend GUID is not available in the current power scheme';
      logTweakSupport(tweakId, false, reason, { osRelease: osVer, helperFound: false });
      return { isApplied: false, unsupported: true, unsupportedReason: reason };
    }
    logTweakSupport(tweakId, true, 'powercfg USB setting present', { osRelease: osVer, helperFound: true });
    return { isApplied: probeResult === 'APPLIED', verified: true };
  }

  try {
    const applied = await checkPowerShell(tweak.check);
    return { isApplied: applied, verified: true };
  } catch (e) {
    return { isApplied: false, verified: false, error: e.message };
  }
}

async function executeTweak(tweakId, action) {
  const startTime = Date.now();
  const commandsRun = [];

  // 1. Unsupported?
  if (UNSUPPORTED_TWEAKS[tweakId]) {
    const reason = UNSUPPORTED_TWEAKS[tweakId];
    logTweakSupport(tweakId, false, reason, { osRelease: require('os').release() });
    const result = enrichFailure({
      success: false,
      unsupported: true,
      message: reason,
      unsupportedReason: reason,
      commandsRun: [],
      requiresReboot: false,
      requiresAdmin:  false,
      error: null,
      hint: reason,
    }, 'unsupported');
    logEntry({ tweakId, action, result, ms: 0 });
    return result;
  }

  const tweak = ALL_TWEAKS[tweakId];

  // 2. Unknown tweak
  if (!tweak) {
    const result = enrichFailure({
      success: false,
      message: 'Tweak not found in registry.',
      commandsRun: [],
      requiresReboot: false,
      requiresAdmin:  false,
      error: `No implementation for "${tweakId}"`,
    }, 'not_found');
    logEntry({ tweakId, action, result, ms: 0 });
    return result;
  }

  // 3. Admin check — elevate per-action when possible
  if (tweak.requiresAdmin) {
    const isAdmin = await checkIsAdmin();
    if (!isAdmin) {
      // Special-case tweaks use custom handlers that can't be lifted into a temp script
      if (tweak._special) {
        const result = enrichFailure({
          success:        false,
          requiresAdmin:  true,
          requiresReboot: tweak.requiresReboot || false,
          commandsRun:    [],
          message:        null,
          error:          'This tweak requires elevated permissions. Please right-click SwitchControl and choose "Run as administrator".',
        }, 'requires_admin');
        logEntry({ tweakId, action, result, ms: Date.now() - startTime });
        return result;
      }

      // Standard tweak — attempt per-action UAC elevation
      const command = action === 'apply' ? tweak.apply : tweak.revert;
      commandsRun.push(`[elevated] ${command}`);
      console.log(`[TweakExecutor] Requesting UAC elevation for ${tweakId}`);

      let elevResult;
      try {
        elevResult = await runElevated(command);
      } catch (elevErr) {
        const isCancelled = /cancel|deny|denied|access.?denied|declined|abort/i.test(elevErr.message);
        const result = enrichFailure({
          success:        false,
          requiresAdmin:  true,
          requiresReboot: tweak.requiresReboot || false,
          commandsRun,
          message:        null,
          error: isCancelled
            ? 'Elevation cancelled. Accept the UAC prompt to apply this tweak.'
            : `Elevation failed: ${elevErr.message}`,
        }, isCancelled ? 'uac_cancelled' : 'requires_admin');
        logEntry({ tweakId, action, result, ms: Date.now() - startTime });
        return result;
      }

      if (!elevResult.ok) {
        const errMsg   = elevResult.error || 'Elevated command failed.';
        const isCancelledMsg = /cancel|deny|denied|access.?denied|declined|uac/i.test(errMsg);
        const fType    = isCancelledMsg ? 'uac_cancelled' : classifyErrorMessage(errMsg);
        const result = enrichFailure({
          success:        false,
          requiresAdmin:  true,
          requiresReboot: tweak.requiresReboot || false,
          commandsRun,
          message:        null,
          error:          errMsg,
        }, fType);
        logEntry({ tweakId, action, result, ms: Date.now() - startTime });
        return result;
      }

      // Elevated command succeeded — verify state
      const verification = await verifyTweak(tweakId);
      const expectedApplied = action === 'apply';

      if (verification.isApplied === expectedApplied) {
        const state = loadState();
        state.tweaks[tweakId] = expectedApplied;
        saveState(state);
        console.log(`[TweakExecutor:PERSIST] ${tweakId} → ${expectedApplied} (elevated, verified) written`);
        const result = {
          success:        true,
          verified:       true,
          failureType:    null,
          userMessage:    null,
          hint:           null,
          requiresReboot: tweak.requiresReboot || false,
          requiresAdmin:  true,
          commandsRun,
          message:        `${tweak.name} ${expectedApplied ? 'applied' : 'reverted'} and verified (elevated).`,
          error:          null,
        };
        logEntry({ tweakId, action, verificationResult: verification, result, ms: Date.now() - startTime });
        return result;
      } else {
        const policyLocked = await checkPolicyLock(tweakId);
        const fType = policyLocked ? 'blocked_by_policy' : 'verification_failed';
        const result = enrichFailure({
          success:        false,
          verified:       true,
          requiresReboot: tweak.requiresReboot || false,
          requiresAdmin:  true,
          commandsRun,
          message:        null,
          error:          policyLocked
            ? 'System state unchanged — a Windows Group Policy is blocking this change.'
            : 'Elevated command ran but system state did not change.',
        }, fType);
        logEntry({ tweakId, action, verificationResult: verification, policyLocked, result, ms: Date.now() - startTime });
        return result;
      }
    }
  }

  // 4. Special-case handlers
  if (tweak._special === 'nvidia-telemetry') {
    try {
      const res = await executeNvidiaTelemetry(action);
      const result = {
        success:        res.ok,
        unsupported:    res.unsupported || false,
        requiresReboot: res.rebootRequired || false,
        requiresAdmin:  true,
        commandsRun:    res.commandsRun || [],
        message:        res.message || null,
        error:          res.ok ? null : (res.message || 'NVIDIA telemetry operation failed'),
      };
      logEntry({ tweakId, action, result, ms: Date.now() - startTime });
      return result;
    } catch (err) {
      const result = {
        success: false, unsupported: false, requiresReboot: false, requiresAdmin: true,
        commandsRun: [], message: null, error: err.message,
      };
      logEntry({ tweakId, action, result, ms: Date.now() - startTime });
      return result;
    }
  }

  // 5. Standard apply/revert
  const command = action === 'apply' ? tweak.apply : tweak.revert;
  commandsRun.push(command);

  try {
    console.log(`[TweakExecutor] ${action.toUpperCase()} ${tweakId}`);
    await runPowerShell(command);

    // 6. Verify
    const verification = await verifyTweak(tweakId);
    const expectedApplied = action === 'apply';

    if (verification.isApplied === expectedApplied) {
      // Update persisted state
      const state = loadState();
      state.tweaks[tweakId] = expectedApplied;
      saveState(state);
      console.log(`[TweakExecutor:PERSIST] ${tweakId} → ${expectedApplied} (hkcu, verified) written`);

      const result = {
        success:        true,
        verified:       true,
        failureType:    null,
        userMessage:    null,
        hint:           null,
        requiresReboot: tweak.requiresReboot || false,
        requiresAdmin:  tweak.requiresAdmin  || false,
        commandsRun,
        message:        `${tweak.name} ${expectedApplied ? 'applied' : 'reverted'} and verified on your system.`,
        error:          null,
      };
      logEntry({ tweakId, action, verificationResult: verification, result, ms: Date.now() - startTime });
      return result;
    } else {
      const policyLocked = await checkPolicyLock(tweakId);
      const fType = policyLocked ? 'blocked_by_policy' : 'verification_failed';
      const result = enrichFailure({
        success:        false,
        verified:       true,
        requiresReboot: tweak.requiresReboot || false,
        requiresAdmin:  tweak.requiresAdmin  || false,
        commandsRun,
        message:        null,
        error:          policyLocked
          ? 'System state unchanged — a Windows Group Policy is blocking this change.'
          : 'Command ran but system state did not change.',
      }, fType);
      logEntry({ tweakId, action, verificationResult: verification, policyLocked, result, ms: Date.now() - startTime });
      return result;
    }

  } catch (error) {
    console.error(`[TweakExecutor] Failed ${action} ${tweakId}:`, error.message);
    const rawMsg   = error.message || 'Execution failed';
    const fType    = classifyErrorMessage(rawMsg);
    const result   = enrichFailure({
      success:        false,
      verified:       false,
      requiresReboot: false,
      requiresAdmin:  fType === 'requires_admin' || fType === 'access_denied',
      commandsRun,
      message:        null,
      error:          rawMsg,
    }, fType);
    logEntry({ tweakId, action, result, ms: Date.now() - startTime });
    return result;
  }
}

async function checkTweakStatus(tweakId) {
  if (UNSUPPORTED_TWEAKS[tweakId]) {
    const reason = UNSUPPORTED_TWEAKS[tweakId];
    logTweakSupport(tweakId, false, reason, { osRelease: require('os').release() });
    return { tweakId, isApplied: false, applied: false, unsupported: true, unsupportedReason: reason, error: null };
  }

  const tweak = ALL_TWEAKS[tweakId];
  if (!tweak) return { tweakId, isApplied: false, applied: false, error: null };

  try {
    const result = await verifyTweak(tweakId);
    return {
      tweakId,
      isApplied:        result.isApplied,
      applied:          result.isApplied,
      unsupported:      result.unsupported || false,
      unsupportedReason: result.unsupportedReason || null,
      error:            result.error || null,
    };
  } catch (error) {
    return { tweakId, isApplied: false, applied: false, error: error.message };
  }
}

function getLocalState() {
  const state = loadState();
  return {
    appliedTweaks: state.tweaks,
    lastSync:      state.meta.lastVerified,
    windowsBuild:  state.meta.windowsBuild,
  };
}

function getTweakInfo() {
  const all = Object.entries(ALL_TWEAKS).map(([id, tweak]) => ({
    id,
    name:           tweak.name,
    tier:           HKCU_TWEAKS[id] ? 'A' : 'B',
    requiresAdmin:  tweak.requiresAdmin,
    requiresReboot: tweak.requiresReboot,
    unsupported:    false,
  }));
  const unsupported = Object.entries(UNSUPPORTED_TWEAKS).map(([id, reason]) => ({
    id,
    name:             id,
    tier:             'unsupported',
    requiresAdmin:    false,
    requiresReboot:   false,
    unsupported:      true,
    unsupportedReason: reason,
  }));
  return [...all, ...unsupported];
}

// ── Ownership-aware wrapper ────────────────────────────────────────────────────

const ownershipStore = require('./ownership-store');

/**
 * Execute a tweak AND maintain the ownership / baseline record.
 *
 * Order:
 *   1. Read current real system state via verifyTweak (baseline read)
 *   2. Store baseline ONLY if not already captured (immutable first-capture)
 *   3. Run the tweak command (existing executeTweak)
 *   4. Record appliedByApp=true ONLY after confirmed success
 *
 * The baseline stores a boolean: was the tweak applied BEFORE we touched it?
 * This lets the revert pipeline restore the exact prior state, not just toggle off.
 */
async function executeTweakWithOwnership(tweakId, action) {
  const scopeKey = ownershipStore.buildScopeKey('tweak', tweakId);

  // Step 1+2: capture baseline if first time touching this tweak
  const existing = ownershipStore.getOwnershipRecord(scopeKey);
  if (!existing || !existing.baselineCaptured) {
    try {
      const status = await verifyTweak(tweakId);
      // status.isApplied = boolean | undefined; null means inconclusive
      const previousValue = (status && typeof status.isApplied === 'boolean')
        ? status.isApplied
        : null;
      ownershipStore.captureBaseline(scopeKey, {
        itemType:      'tweak',
        itemId:        tweakId,
        previousValue,
      });
    } catch (e) {
      console.warn('[TweakExecutor] baseline capture failed for', tweakId, '—', e.message);
    }
  }

  // Step 3: execute
  const result = await executeTweak(tweakId, action);

  // Step 4: record ownership only after confirmed success
  if (result.success) {
    ownershipStore.recordApply(scopeKey, {
      appliedValue:      action === 'apply',
      verificationState: result.verified ? 'verified' : 'unverified',
    });
  }

  return result;
}

module.exports = {
  executeTweak,
  executeTweakWithOwnership,
  checkTweakStatus,
  verifyTweak,
  getLocalState,
  getTweakInfo,
  getExecutionLog,
  ALL_TWEAKS,
  HKCU_TWEAKS,
  ADMIN_TWEAKS,
  UNSUPPORTED_TWEAKS,
  audioGuardCheck,
  networkGuardPre,
  networkGuardPost,
};
