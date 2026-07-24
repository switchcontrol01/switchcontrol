const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { TWEAK_STATE_FILE, TWEAK_LOG_FILE, WINDOWED_GAMES_BACKUP_FILE, VENDOR_UPDATERS_BACKUP_FILE, TEAMS_STARTUP_BACKUP_FILE } = require('./user-data-paths');

// Backup-path constants used inside PowerShell double-quoted strings.
// PowerShell does NOT treat backslash as an escape character in double-quoted
// strings (only backtick is the escape); Windows path APIs accept single
// backslashes normally, so no doubling is needed.
const _WINDOWED_GAMES_BK    = WINDOWED_GAMES_BACKUP_FILE;
const _VENDOR_UPDATERS_BK   = VENDOR_UPDATERS_BACKUP_FILE;
const _TEAMS_STARTUP_BK     = TEAMS_STARTUP_BACKUP_FILE;

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

// ─── Serialised state read-modify-write ───────────────────────────────────────
// With MAX_PS_CONCURRENT=2, two tweaks can complete close together and both
// execute loadState → mutate → saveState concurrently. Whichever write lands
// last silently clobbers the other tweak's freshly-written status. Fix: funnel
// ALL read-modify-write pairs through a promise queue so at most one is in
// progress at any moment.
let _stateLock = Promise.resolve();
function _updateState(fn) {
  const next = _stateLock.then(() => {
    const state = loadState();
    fn(state);
    saveState(state);
  });
  _stateLock = next.catch(() => {}); // keep the chain alive even if fn throws
  return next;
}

function logEntry(entry) {
  try {
    ensureStateDir();
    let logs = [];
    if (fs.existsSync(TWEAK_LOG_FILE)) {
      try { logs = JSON.parse(fs.readFileSync(TWEAK_LOG_FILE, 'utf8')); } catch {}
    }
    logs.unshift({ ...entry, timestamp: new Date().toISOString() });
    if (logs.length > 500) logs = logs.slice(0, 500);
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

function queryPowerShell(command, timeout = 12000) {
  // Acquire semaphore slot before spawning — queues if MAX_PS_CONCURRENT is full
  return _withPsSemaphore(() => {
    const id = ++_tweak_psCount;
    const t0 = Date.now();
    console.log(`[PS:tweak-executor] #${id} queryPowerShell SPAWN ts=${t0} active=${_psActive}`);
    return new Promise((resolve) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { timeout, windowsHide: true },
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    // Wrap the UAC-launcher execFile in the PS semaphore so runElevated counts
    // against MAX_PS_CONCURRENT. Without this, bulk admin-tweak flows bypassed
    // the cap entirely — each runElevated spawned its own launcher + elevated
    // child outside the semaphore, violating the "never more than 2" invariant.
    await _withPsSemaphore(() => new Promise((resolve, reject) => {
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
    }));

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
  // Only report policy-locked when AllowTelemetry exists AND is NOT 0.
  // The telemetry apply command itself writes AllowTelemetry=0 to this key, so
  // checking for mere presence would always return true after a successful apply,
  // causing a false "Blocked by Windows Policy" error on the next verification.
  'telemetry':      `$v=(Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' -Name 'AllowTelemetry' -EA SilentlyContinue).AllowTelemetry; $null -ne $v -and $v -ne 0`,
  'gaming-mode':    `(Get-ItemProperty 'HKCU:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR' -Name 'AllowGameDVR' -EA SilentlyContinue).AllowGameDVR -eq 0`,
  'cortana':        `$null -ne (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search' -Name 'AllowCortana' -EA SilentlyContinue)`,
  // Check for the specific DWORD that blocks the Action Center/notification settings
  // panel. Test-Path alone misreports whenever the Explorer policy key exists for
  // unrelated reasons (e.g. other policies are set in the same key).
  'notifications':  `$v=(Get-ItemProperty 'HKCU:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer' -Name 'NoNotificationCenter' -EA SilentlyContinue).NoNotificationCenter; $null -ne $v -and $v -eq 1`,
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
  // requires_admin must come before access_denied — a message like
  // "Administrator access denied" should yield the more actionable hint.
  if (/privilege|administrator|elevation|elevat/i.test(msg))  return 'requires_admin';
  if (/access.?denied|unauthorized|not.?allowed|forbidden/i.test(msg)) return 'access_denied';
  if (/not found|does not exist|cannot find|path does not/i.test(msg)) return 'not_found';
  if (/policy|gpo|group.?policy|mdm/i.test(msg))             return 'blocked_by_policy';
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
  // timer-res is now handled via a persistent in-process PowerShell agent
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
  // NVIDIA removed the NvTm*/NvNode*/NvProfile* scheduled tasks and the
  // NvTelemetryContainer service starting with the 500-series driver package.
  // Virtually every current GeForce/RTX install uses a post-500 driver, so the
  // live detection probe that previously ran at startup always evaluated to
  // "no legacy components present → unsupported".  Marking it statically
  // unsupported eliminates two PowerShell probes per startup (GPU detection +
  // component check) and surfaces an honest, stable reason in the UI instead of
  // making the card look broken.  If NVIDIA re-introduces scriptable telemetry
  // controls, remove this entry and restore the dynamic detection path.
  'nvidia-telemetry': "Not applicable to current NVIDIA drivers — the legacy NvTelemetryContainer service and NvTm*/NvNode* scheduled tasks were removed by NVIDIA in the 500-series driver package. Nearly all modern GeForce/RTX installs are unaffected.",
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
    // apply: set the legacy GlobalUserDisabled key AND write a SwitchControl marker.
    // The marker is necessary because Microsoft removed the global toggle from
    // Settings UI on Win 11 23H2/24H2 and the Settings app can silently clear
    // GlobalUserDisabled when opened.  The marker survives that wipe so verify()
    // still returns the correct applied state (same pattern as CPU C-States).
    apply:  `New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" -Name "GlobalUserDisabled" -Value 1 -Type DWord -Force; New-Item -Path "HKLM:\\SOFTWARE\\SwitchControl" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\SwitchControl" -Name "BgAppsDisabled" -Value 1 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" -Name "GlobalUserDisabled" -Value 0 -Type DWord -Force; New-Item -Path "HKLM:\\SOFTWARE\\SwitchControl" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\SwitchControl" -Name "BgAppsDisabled" -Value 0 -Type DWord -Force`,
    // check: read legacy key first; fall back to SwitchControl marker so that
    // verify is resilient to Windows clearing GlobalUserDisabled on modern builds.
    check:  `$k=(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" -Name "GlobalUserDisabled" -EA SilentlyContinue).GlobalUserDisabled; $m=(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\SwitchControl" -Name "BgAppsDisabled" -EA SilentlyContinue).BgAppsDisabled; ($k -eq 1) -or ($m -eq 1)`,
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
    // HideFileExt = 0 means extensions ARE shown (inverse of the key name).
    // Explorer restart is intentionally omitted: force-killing explorer.exe
    // closes all open File Explorer windows (user loses navigation state) and
    // the 800ms sleep is too short — Explorer can crash and restart twice.
    // The registry key takes effect on the NEXT Explorer launch.
    // The IPC handler emits a 'showFileExtensionsChanged' event so the UI
    // can display a "Restart Explorer or sign out to see the change" toast.
    name: 'Show File Extensions',
    requiresAdmin:  false,
    requiresReboot: false,
    // Explorer restart is isolated in its own try/catch so a COM enumeration
    // failure (Shell.Application.Windows() can throw intermittently) never
    // causes the registry write — which already succeeded — to report failure.
    apply:  `New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "HideFileExt" -Value 0 -Type DWord -Force; try { $windows = (New-Object -ComObject Shell.Application).Windows() | Where-Object { $_.Name -eq "File Explorer" }; if ($windows.Count -eq 0) { Stop-Process -Name explorer -Force -EA SilentlyContinue; Start-Sleep -Milliseconds 1200; Start-Process explorer } } catch {}`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "HideFileExt" -Value 1 -Type DWord -Force; try { $windows = (New-Object -ComObject Shell.Application).Windows() | Where-Object { $_.Name -eq "File Explorer" }; if ($windows.Count -eq 0) { Stop-Process -Name explorer -Force -EA SilentlyContinue; Start-Sleep -Milliseconds 1200; Start-Process explorer } } catch {}`,
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
  'power-mode-overlay': {
    name: 'Power Mode — Best Performance',
    requiresAdmin:  true,
    requiresReboot: false,
    // Apply: set the overlay AND write a persistent marker so verification is
    // reliable on AMD/OEM builds where powercfg /overlaygetactivescheme and the
    // Windows registry paths return inconsistent output on Win 11 24H2 (build 26200+).
    apply:  `New-Item -Path "HKLM:\\SOFTWARE\\SwitchControl" -Force -EA SilentlyContinue | Out-Null; powercfg /overlaysetactive ded574b5-45a0-4f42-8737-46345c09c238; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\SwitchControl" -Name "PowerModeOverlay" -Value 1 -Type DWord -Force`,
    revert: `powercfg /overlaysetactive 00000000-0000-0000-0000-000000000000; New-Item -Path "HKLM:\\SOFTWARE\\SwitchControl" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\SwitchControl" -Name "PowerModeOverlay" -Value 0 -Type DWord -Force`,
    // Check: primary source is our own marker (1=enabled, 0=disabled).
    // If the marker is absent (never applied via this app), fall back to the
    // powercfg output + two registry paths (different Windows builds use different paths).
    check:  `$mk=(Get-ItemProperty "HKLM:\\SOFTWARE\\SwitchControl" -Name "PowerModeOverlay" -EA SilentlyContinue).PowerModeOverlay; if ($mk -eq 1) { $true } elseif ($mk -eq 0) { $false } else { $tgt="ded574b5-45a0-4f42-8737-46345c09c238"; $cfgOut=(powercfg /overlaygetactivescheme 2>&1 | Out-String); $r1=(Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\Default\\PowerSchemes" -Name "ActiveOverlayAcPowerScheme" -EA SilentlyContinue).ActiveOverlayAcPowerScheme; $r2=(Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power" -Name "ActiveOverlayAcPowerScheme" -EA SilentlyContinue).ActiveOverlayAcPowerScheme; [bool](($cfgOut -imatch $tgt) -or ($r1 -imatch $tgt) -or ($r2 -imatch $tgt)) }`,
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
    name: 'Disable Windows VBS',
    requiresAdmin:  true,
    requiresReboot: true,
    // apply/revert/verify handled by executeVbs below (saves original state for exact restore).
    _special: 'vbs',
  },
  'hyper-v': {
    name: 'Disable Hyper-V',
    requiresAdmin:  true,
    requiresReboot: true,
    apply:  `& bcdedit /set hypervisorlaunchtype off 2>&1 | Out-Null; exit 0`,
    revert: `& bcdedit /set hypervisorlaunchtype auto 2>&1 | Out-Null; exit 0`,
    check:  `$out = & bcdedit /enum all 2>&1; ($out | Select-String "hypervisorlaunchtype" | Select-Object -First 1) -match "Off$"`,
  },
  'large-system-cache': {
    name: 'Disable Large System Cache',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "LargeSystemCache" -Value 0 -Type DWord -Force`,
    revert: `Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "LargeSystemCache" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "LargeSystemCache" -EA SilentlyContinue).LargeSystemCache -eq 0`,
  },
  'page-combining': {
    name: 'Disable Page Combining',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$rp="HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management"; try { Set-MMAgent -PageCombining $false -EA SilentlyContinue } catch {}; Set-ItemProperty -Path $rp -Name "EnablePageCombining" -Value 0 -Type DWord -Force`,
    revert: `$rp="HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management"; try { Set-MMAgent -PageCombining $true -EA SilentlyContinue } catch {}; Set-ItemProperty -Path $rp -Name "EnablePageCombining" -Value 1 -Type DWord -Force`,
    check:  `$rp="HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management"; $rv=(Get-ItemProperty -Path $rp -Name "EnablePageCombining" -EA SilentlyContinue).EnablePageCombining; if ($null -ne $rv) { $rv -eq 0 } else { try { -not (Get-MMAgent).PageCombining } catch { $false } }`,
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
  'timer-res': {
    name: 'Global Timer Resolution',
    requiresAdmin:  false,
    requiresReboot: false,
    // apply/revert/check handled by persistent PowerShell agent below
    _special: 'timer-res',
  },
  'tune-priority': {
    name: 'Tune Process Priority',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" -Name "Win32PrioritySeparation" -Value 38 -Type DWord -Force`,
    revert: `Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" -Name "Win32PrioritySeparation" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" -Name "Win32PrioritySeparation" -EA SilentlyContinue).Win32PrioritySeparation -eq 38`,
  },
  'bluetooth': {
    name: 'Disable Bluetooth',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$svc = Get-Service -Name bthserv -EA SilentlyContinue; if ($svc) { Stop-Service bthserv -Force -EA SilentlyContinue; Set-Service bthserv -StartupType Disabled }; $svc2 = Get-Service -Name BthA2dp -EA SilentlyContinue; if ($svc2) { Stop-Service BthA2dp -Force -EA SilentlyContinue; Set-Service BthA2dp -StartupType Disabled }`,
    revert: `$svc = Get-Service -Name bthserv -EA SilentlyContinue; if ($svc) { Set-Service bthserv -StartupType Manual; Start-Service bthserv -EA SilentlyContinue }; $svc2 = Get-Service -Name BthA2dp -EA SilentlyContinue; if ($svc2) { Set-Service BthA2dp -StartupType Manual }`,
    check:  `$s = Get-Service -Name bthserv -EA SilentlyContinue; $s -and ($s.StartType -eq "Disabled")`,
  },
  'wifi': {
    name: 'Disable Wi-Fi',
    requiresAdmin:  true,
    requiresReboot: false,
    // WlanSvc pre-check is handled in executeTweak and verifyTweak to return
    // unsupported:true rather than a generic "not found" error on desktops
    // with no Wi-Fi adapter.
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
    check:  `$out = & bcdedit /enum all 2>&1; ($out | Select-String "disabledynamictick") -match "Yes"`,
  },
  'preemption': {
    name: 'Enable GPU Hardware Scheduling (Preemption)',
    requiresAdmin:  true,
    requiresReboot: true,
    // apply/revert/verify handled by executePreemption below.
    _special: 'preemption',
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
    // apply/revert/verify handled by executeUsbSelectiveSuspend below.
    _special: 'usb-selective-suspend',
  },
  'pcie-link-state': {
    name: 'Disable PCIe Link State Power Management',
    requiresAdmin:  true,
    requiresReboot: false,
    // Sub-group: PCI Express (501a4d13-42af-4429-9fd1-a8218c268e20)
    // Setting: Link State Power Management (ee12f906-d277-404b-b6da-e5fa1a576df5)
    // 0 = Off, 1 = Moderate, 2 = Maximum
    // apply/revert/verify handled by executePcieLinkState below.
    _special: 'pcie-link-state',
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
    revert: `$s = Get-Service -Name WSearch -EA SilentlyContinue; if ($s) { Set-Service WSearch -StartupType AutomaticDelayedStart; Start-Service WSearch -EA SilentlyContinue }`,
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
    // SAFETY: Disabling DCOM (EnableDCOM="N") is extremely aggressive.
    // It can break Windows Update, Task Scheduler COM interfaces, WMI, and many
    // shell extensions. Reboot is required and the change does NOT take effect
    // until after restart (isApplied check will show true before reboot reflects it).
    // The UI must display a prominent warning before this tweak is applied.
    // A safety probe runs first: if WMI (WinMgmt) or Task Scheduler (Schedule)
    // services are actively running, we emit a warning but still allow apply —
    // the user sees the warning in the apply result message.
    apply:  `$warn = ""; $wmi = Get-Service -Name Winmgmt -EA SilentlyContinue; $sched = Get-Service -Name Schedule -EA SilentlyContinue; if ($wmi -and $wmi.Status -eq "Running") { $warn += "WMI is running; " }; if ($sched -and $sched.Status -eq "Running") { $warn += "Task Scheduler is running; " }; if ($warn) { Write-Warning "DCOM disable may break: $warn — reboot required to take effect" }; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Ole" -Name "EnableDCOM" -Value "N" -Type String -Force`,
    revert: `Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Ole" -Name "EnableDCOM" -Value "Y" -Type String -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Ole" -Name "EnableDCOM" -EA SilentlyContinue).EnableDCOM -eq "N"`,
  },
  'svchost-split-threshold': {
    name: 'Service Host Split Threshold',
    requiresAdmin: true,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control" -Name "SvcHostSplitThresholdInKB" -Value 67108864 -Type DWord -Force`,
    revert: `Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control" -Name "SvcHostSplitThresholdInKB" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control" -Name "SvcHostSplitThresholdInKB" -EA SilentlyContinue).SvcHostSplitThresholdInKB -ge 67108864`,
  },
  // ── Extreme Labs specific tweaks ─────────────────────────────────────────────────
  'hpet-disable': {
    name: 'Disable HPET Platform Clock',
    requiresAdmin: true,
    requiresReboot: true,
    apply:  `& bcdedit /set useplatformclock No 2>&1 | Out-Null; exit 0`,
    revert: `& bcdedit /set useplatformclock Yes 2>&1 | Out-Null; exit 0`,
    check:  `$out = & bcdedit /enum all 2>&1; ($out | Select-String "useplatformclock") -match '\\bNo\\b'`,
  },
  'tcp-no-delay': {
    name: 'TCP NoDelay / TcpAckFrequency',
    requiresAdmin: true,
    requiresReboot: true,
    apply:  `New-Item -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" -Force -EA SilentlyContinue | Out-Null; Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" -EA SilentlyContinue | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name "TcpNoDelay" -Value 1 -Type DWord -Force -EA SilentlyContinue; Set-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Value 1 -Type DWord -Force -EA SilentlyContinue }`,
    revert: `Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" -EA SilentlyContinue | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name "TcpNoDelay" -EA SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -EA SilentlyContinue }`,
    check:  `$script:found = $false; Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" -EA SilentlyContinue | ForEach-Object { $d = Get-ItemProperty -Path $_.PSPath -Name "TcpNoDelay" -EA SilentlyContinue; if ($d -and $d.TcpNoDelay -eq 1) { $script:found = $true } }; $script:found`,
  },
  'optimize-windowed-games': {
    name: 'Optimizations for Windowed Games',
    requiresAdmin: false,
    requiresReboot: false,
    // Backup path uses the user-data-paths constant (via _WINDOWED_GAMES_BK) so it
    // resolves consistently with all other SwitchControl backup files rather than
    // relying on $env:APPDATA which can differ when AppData is on a separate drive.
    apply:  `$p = "HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences"; $bk = "${_WINDOWED_GAMES_BK}"; $orig = (Get-ItemProperty -Path $p -Name "DirectXUserGlobalSettings" -EA SilentlyContinue).DirectXUserGlobalSettings; $bdir = Split-Path $bk; if (-not (Test-Path $bdir)) { New-Item -ItemType Directory -Path $bdir -Force | Out-Null }; (@{ orig = $orig } | ConvertTo-Json -Compress) | Out-File -FilePath ($bk + '.tmp') -Encoding utf8 -Force; if (Test-Path ($bk + '.tmp')) { Move-Item -Path ($bk + '.tmp') -Destination $bk -Force -EA SilentlyContinue }; New-Item -Path $p -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path $p -Name "DirectXUserGlobalSettings" -Value "FlipOnVSync=1;FSE=0;HDR=1" -Type String -Force`,
    revert: `$p = "HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences"; $bk = "${_WINDOWED_GAMES_BK}"; $orig = $null; if (Test-Path $bk) { try { $orig = (Get-Content $bk -Raw | ConvertFrom-Json).orig } catch {}; Remove-Item $bk -Force -EA SilentlyContinue }; if ($null -ne $orig) { Set-ItemProperty -Path $p -Name "DirectXUserGlobalSettings" -Value $orig -Type String -Force -EA SilentlyContinue } else { Remove-ItemProperty -Path $p -Name "DirectXUserGlobalSettings" -EA SilentlyContinue }`,
    check:  `$p = "HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences"; $v = Get-ItemProperty -Path $p -Name "DirectXUserGlobalSettings" -EA SilentlyContinue; $v -and ($v.DirectXUserGlobalSettings -like "*FlipOnVSync=1*")`,
  },
  'disable-game-dvr': {
    name: 'Disable Game DVR',
    requiresAdmin: true,
    requiresReboot: false,
    apply:  `New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Name "AllowGameDVR" -Value 0 -Type DWord -Force; $p = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR"; New-Item -Path $p -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path $p -Name "AppCaptureEnabled" -Value 0 -Type DWord -Force`,
    revert: `Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Name "AllowGameDVR" -EA SilentlyContinue; $p = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR"; Remove-ItemProperty -Path $p -Name "AppCaptureEnabled" -EA SilentlyContinue`,
    check:  `$p = Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Name "AllowGameDVR" -EA SilentlyContinue; $p -and ($p.AllowGameDVR -eq 0)`,
  },
  // Separate entry so apply/revert/ownership for xbox-capture are independent
  // from disable-game-dvr. Targets GameConfigStore (the actual Game Bar capture
  // feature flag) — a distinct registry path from the policy key above.
  'disable-xbox-capture': {
    name: 'Disable Xbox Capture',
    requiresAdmin: false,
    requiresReboot: false,
    apply:  `New-Item -Path "HKCU:\\System\\GameConfigStore" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Value 0 -Type DWord -Force`,
    revert: `Remove-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -EA SilentlyContinue`,
    check:  `(Get-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -EA SilentlyContinue).GameDVR_Enabled -eq 0`,
  },
  'edge-update': {
    name: 'Disable Edge Update Services',
    requiresAdmin: true,
    requiresReboot: false,
    apply:  `@("edgeupdate","edgeupdatem","MicrosoftEdgeUpdate") | ForEach-Object { $s = Get-Service -Name $_ -EA SilentlyContinue; if ($s) { Stop-Service $_ -Force -EA SilentlyContinue; Set-Service $_ -StartupType Disabled } }; Get-ScheduledTask -TaskName "MicrosoftEdgeUpdate*" -EA SilentlyContinue | ForEach-Object { Disable-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath | Out-Null }`,
    revert: `@("edgeupdate","edgeupdatem","MicrosoftEdgeUpdate") | ForEach-Object { $s = Get-Service -Name $_ -EA SilentlyContinue; if ($s) { Set-Service $_ -StartupType Automatic -EA SilentlyContinue; Start-Service $_ -EA SilentlyContinue } }; Get-ScheduledTask -TaskName "MicrosoftEdgeUpdate*" -EA SilentlyContinue | ForEach-Object { Enable-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath | Out-Null }`,
    check:  `$s = Get-Service -Name edgeupdate -EA SilentlyContinue; $s -and ($s.StartType -eq "Disabled")`,
  },
  'adobe-updater': {
    name: 'Disable Adobe Updater',
    requiresAdmin: true,
    requiresReboot: false,
    apply:  `@("AdobeARMservice","AdobeUpdateService","AdobeGCClient") | ForEach-Object { $s = Get-Service -Name $_ -EA SilentlyContinue; if ($s) { Stop-Service $_ -Force -EA SilentlyContinue; Set-Service $_ -StartupType Disabled } }; Get-ScheduledTask -TaskName "Adobe*" -EA SilentlyContinue | ForEach-Object { Disable-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath | Out-Null }`,
    revert: `@("AdobeARMservice","AdobeUpdateService","AdobeGCClient") | ForEach-Object { $s = Get-Service -Name $_ -EA SilentlyContinue; if ($s) { Set-Service $_ -StartupType Automatic -EA SilentlyContinue; Start-Service $_ -EA SilentlyContinue } }; Get-ScheduledTask -TaskName "Adobe*" -EA SilentlyContinue | ForEach-Object { Enable-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath | Out-Null }`,
    check:  `$s = Get-Service -Name AdobeARMservice -EA SilentlyContinue; $s -and ($s.StartType -eq "Disabled")`,
  },
  'teams-startup': {
    name: 'Disable Teams Background Startup',
    requiresAdmin: false,  // only touches HKCU and kills a user process — no elevation needed
    requiresReboot: false,
    // apply: capture both the old Squirrel and new Teams 2.0 startup entries to a
    // backup file BEFORE removing them, so revert can restore the exact paths
    // rather than hardcoding the old Squirrel path (breaks Teams 2.0 on ms-teams.exe).
    apply:  `$p = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"; $bk = "${_TEAMS_STARTUP_BK}"; $orig = (Get-ItemProperty -Path $p -EA SilentlyContinue)."com.squirrel.Teams.Teams"; $orig2 = (Get-ItemProperty -Path $p -EA SilentlyContinue).Teams; $bdir = Split-Path $bk; if (-not (Test-Path $bdir)) { New-Item -ItemType Directory -Path $bdir -Force | Out-Null }; @{ squirrel=$orig; teams=$orig2 } | ConvertTo-Json -Compress | Out-File -FilePath $bk -Encoding utf8 -Force; Remove-ItemProperty -Path $p -Name "com.squirrel.Teams.Teams" -EA SilentlyContinue; Remove-ItemProperty -Path $p -Name "Teams" -EA SilentlyContinue; Get-Process -Name "Teams" -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue`,
    revert: `$bk = "${_TEAMS_STARTUP_BK}"; $p = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"; if (Test-Path $bk) { $data = Get-Content $bk -Raw | ConvertFrom-Json; if ($data.squirrel) { Set-ItemProperty -Path $p -Name "com.squirrel.Teams.Teams" -Value $data.squirrel -Type String -Force }; if ($data.teams) { Set-ItemProperty -Path $p -Name "Teams" -Value $data.teams -Type String -Force }; Remove-Item $bk -Force -EA SilentlyContinue }`,
    check:  `$p = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"; $v = Get-ItemProperty -Path $p -Name "com.squirrel.Teams.Teams" -EA SilentlyContinue; $v2 = Get-ItemProperty -Path $p -Name "Teams" -EA SilentlyContinue; -not $v -and -not $v2`,
  },
  'vendor-updaters': {
    name: 'Disable Vendor Update Helpers',
    requiresAdmin: true,
    requiresReboot: false,
    // apply: only disables services that are NOT already disabled, records changed
    // services to a backup file. This prevents false-positive check results on
    // machines where IT policy pre-disabled one of these services before the user
    // ever ran this tweak (the old check returned true for ANY disabled service).
    apply:  `$names = @("DellSupportAssistRemedationService","DellOptimizer","HPWarrantyCheck","HPPrintScanDoctor","LenovoVantageService","IntelManagementEngine","IntelDriverUpdate","NVIDIAWebHelper","NvContainerLocalSystem","AMDExternalEvents"); $bk = "${_VENDOR_UPDATERS_BK}"; $bdir = Split-Path $bk; if (-not (Test-Path $bdir)) { New-Item -ItemType Directory -Path $bdir -Force | Out-Null }; $changed = @(); foreach ($n in $names) { $s = Get-Service -Name $n -EA SilentlyContinue; if ($s -and $s.StartType -ne "Disabled") { Stop-Service $n -Force -EA SilentlyContinue; Set-Service $n -StartupType Disabled; $changed += $n } }; @{ changed = $changed } | ConvertTo-Json -Compress | Out-File -FilePath $bk -Encoding utf8 -Force; Get-ScheduledTask -TaskName "Dell*","HP*","Lenovo*","Intel*Driver*","NVIDIA*","AMD*" -EA SilentlyContinue | ForEach-Object { Disable-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath | Out-Null }`,
    revert: `$bk = "${_VENDOR_UPDATERS_BK}"; if (Test-Path $bk) { $data = Get-Content $bk -Raw | ConvertFrom-Json; foreach ($n in $data.changed) { $s = Get-Service -Name $n -EA SilentlyContinue; if ($s) { Set-Service $n -StartupType Automatic -EA SilentlyContinue; Start-Service $n -EA SilentlyContinue } }; Remove-Item $bk -Force -EA SilentlyContinue }; Get-ScheduledTask -TaskName "Dell*","HP*","Lenovo*","Intel*Driver*","NVIDIA*","AMD*" -EA SilentlyContinue | ForEach-Object { Enable-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath | Out-Null }`,
    // check: only reports applied if our backup file exists AND all services we
    // changed are still disabled. Returns false if no backup (tweak was never
    // applied by SwitchControl, even if some services happen to be disabled).
    check:  `$bk = "${_VENDOR_UPDATERS_BK}"; if (-not (Test-Path $bk)) { $false; return }; $data = Get-Content $bk -Raw | ConvertFrom-Json; $allDisabled = $true; foreach ($n in $data.changed) { $s = Get-Service -Name $n -EA SilentlyContinue; if (-not $s -or $s.StartType -ne "Disabled") { $allDisabled = $false } }; $allDisabled`,
  },

  // ── Maximum CPU Responsiveness — powercfg power-plan settings ─────────────────
  // apply/revert/verify handled by executeMaxCpuResponsiveness below.
  'maximum-cpu-responsiveness': {
    name: 'CPU C-STATES | Core parking',
    requiresAdmin:  true,
    requiresReboot: false,
    _special: 'maximum-cpu-responsiveness',
  },

  // ── GPU MSI Mode — registry interrupt properties ──────────────────────────────
  // apply/revert/verify handled by executeGpuMsiMode below.
  'gpu-msi-mode': {
    name: 'GPU MSI Mode',
    requiresAdmin:  true,
    requiresReboot: true,
    _special: 'gpu-msi-mode',
  },

  // ── PCI MSI Mode — all device classes (GPU, NIC, storage, USB) ──────────────
  // apply/revert/verify handled by executePciMsiMode below.
  'pci-msi-mode': {
    name: 'PCI MSI Mode',
    requiresAdmin:  true,
    requiresReboot: true,
    _special: 'pci-msi-mode',
  },

  // ── Security ─────────────────────────────────────────────────────────────────
  'disable-remote-desktop': {
    name: 'Disable Remote Desktop',
    requiresAdmin: true,
    requiresReboot: false,
    apply:  `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server" -Name "fDenyTSConnections" -Value 1 -Type DWord -Force; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp" -Name "UserAuthentication" -Value 0 -Type DWord -Force; $s = Get-Service -Name TermService -EA SilentlyContinue; if ($s) { Stop-Service TermService -Force -EA SilentlyContinue; Set-Service TermService -StartupType Disabled }`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server" -Name "fDenyTSConnections" -Value 0 -Type DWord -Force; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp" -Name "UserAuthentication" -Value 1 -Type DWord -Force; $s = Get-Service -Name TermService -EA SilentlyContinue; if ($s) { Set-Service TermService -StartupType Manual; Start-Service TermService -EA SilentlyContinue }`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server" -Name "fDenyTSConnections" -EA SilentlyContinue).fDenyTSConnections -eq 1`,
  },

  'disable-remote-assistance': {
    name: 'Disable Remote Assistance',
    requiresAdmin: true,
    requiresReboot: false,
    // Write to the non-policy SYSTEM path only. The Policies branch
    // (HKLM\SOFTWARE\Policies\...) is overwritten by Group Policy every 90 minutes
    // on domain-joined machines, silently undoing any value we write there.
    apply:  `New-Item -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Remote Assistance" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Remote Assistance" -Name "fAllowToGetHelp" -Value 0 -Type DWord -Force; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Remote Assistance" -Name "fAllowFullControl" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Remote Assistance" -Name "fAllowToGetHelp" -Value 1 -Type DWord -Force; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Remote Assistance" -Name "fAllowFullControl" -Value 1 -Type DWord -Force`,
    check:  `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Remote Assistance" -Name "fAllowToGetHelp" -EA SilentlyContinue).fAllowToGetHelp -eq 0`,
  },
};

// Merged lookup (no unsupported tweaks here)
const ALL_TWEAKS = { ...HKCU_TWEAKS, ...ADMIN_TWEAKS };

// ─── Timer Resolution persistent agent ────────────────────────────────────────
// Windows timeBeginPeriod() / NtSetTimerResolution() effects are process-scoped.
// We spawn a hidden PowerShell process that holds 0.5ms timer resolution for as
// long as SwitchControl is running, and kill it on revert or app exit.
const { spawn } = require('child_process');
let _timerResProcess = null;

const TIMER_RES_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class TimerResAgent {
    [DllImport("ntdll.dll")] public static extern int NtSetTimerResolution(int Desired, bool Set, out int Current);
    [DllImport("winmm.dll")] public static extern uint timeBeginPeriod(uint p);
    [DllImport("winmm.dll")] public static extern uint timeEndPeriod(uint p);
}
"@
$cur = 0
[TimerResAgent]::NtSetTimerResolution(5000, $true, [ref]$cur)
[TimerResAgent]::timeBeginPeriod(1)
while ($true) { Start-Sleep -Seconds 30 }
`.trim();

function _startTimerResAgent() {
  if (_timerResProcess && !_timerResProcess.killed) {
    console.log('[TimerRes] agent already running, pid=%d', _timerResProcess.pid);
    return true;
  }
  // Evict any competing slider-based keeper process so both agents don't fight
  // over NtSetTimerResolution simultaneously.  The slider keeper records its PID
  // in timer-resolution-state.json — read that and kill the process before we
  // start our own.
  try {
    const os_   = require('os');
    const path_ = require('path');
    const fs_   = require('fs');
    const stateFile = path_.join(os_.homedir(), 'AppData', 'Roaming', 'SwitchControl', 'timer-resolution-state.json');
    if (fs_.existsSync(stateFile)) {
      const s = JSON.parse(fs_.readFileSync(stateFile, 'utf8'));
      if (s && s.pid) {
        try { process.kill(s.pid); } catch {}
        try { fs_.unlinkSync(stateFile); } catch {}
        console.log('[TimerRes] evicted slider keeper pid=%d before starting toggle agent', s.pid);
      }
    }
  } catch (e) { /* non-fatal — log and continue */ console.warn('[TimerRes] evict-slider-keeper error:', e.message); }
  try {
    const proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-Command', TIMER_RES_SCRIPT,
    ], { detached: false, stdio: 'ignore' });
    proc.on('error', (err) => console.warn('[TimerRes] agent spawn error:', err.message));
    proc.on('exit', (code) => {
      console.log('[TimerRes] agent exited, code=%s', code);
      if (_timerResProcess === proc) _timerResProcess = null;
    });
    _timerResProcess = proc;
    console.log('[TimerRes] agent started, pid=%d', proc.pid);
    return true;
  } catch (err) {
    console.error('[TimerRes] failed to start agent:', err.message);
    return false;
  }
}

function _stopTimerResAgent() {
  if (!_timerResProcess || _timerResProcess.killed) {
    _timerResProcess = null;
    console.log('[TimerRes] no agent running');
    return;
  }
  try {
    _timerResProcess.kill();
    console.log('[TimerRes] agent killed, pid=%d', _timerResProcess.pid);
  } catch (err) {
    console.warn('[TimerRes] kill failed:', err.message);
  }
  _timerResProcess = null;
}

function cleanupTimerResProcess() {
  _stopTimerResAgent();
}

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

  // ── Modern-driver short-circuit ────────────────────────────────────────────
  // Modern NVIDIA driver installs (post-500 series) no longer ship the legacy
  // NvTm*/NvNode*/NvProfile* scheduled tasks or the NvTelemetryContainer service.
  // The verification check treats "no tasks + no service" as $true (already
  // disabled). For REVERT: the system is already in its default state → no-op.
  // For APPLY: there is nothing to disable → the tweak is unsupported on this
  // system. Without this guard, apply returns ok=true (verified=$true), but
  // checkStatus then returns isApplied=false (nothing disabled), causing a
  // verification-failed mismatch on the client.
  const hasComponents = await checkPowerShell(
    `$tasks = Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskName -like "NvTm*" -or $_.TaskName -like "NvNode*" -or $_.TaskName -like "NvProfile*" }; $svc = Get-Service -Name NvTelemetryContainer -EA SilentlyContinue; ($tasks.Count -gt 0) -or ($null -ne $svc)`
  );
  if (!hasComponents) {
    if (action === 'revert') {
      // Nothing to restore — already in default state. Return success so the
      // client verification phase (checkStatus) sees isApplied=false which
      // matches the expected revert state.
      return {
        ok: true,
        commandsRun: [],
        message: 'NVIDIA telemetry restored (no legacy telemetry components present — already in default state).',
        rebootRequired: false,
      };
    }
    // Modern driver — nothing to disable. Mark unsupported so the client
    // shows a clear "Not Supported" message instead of a confusing
    // verification-failed error.
    return {
      ok: false,
      unsupported: true,
      commandsRun: [],
      message: 'Legacy NVIDIA telemetry components are not present on this system (modern driver). Nothing to disable.',
      rebootRequired: false,
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

  // Verify current state: true = all telemetry components are disabled (or absent).
  // For APPLY: ok when verified = true (we disabled them).
  // For REVERT: ok when verified = false (components exist and are now re-enabled).
  //   The "no components" early-return above already handles the modern-driver case,
  //   so reaching here means components were found and the enable command ran.
  const verified = await checkPowerShell(
    `$tasks = Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskName -like "NvTm*" -or $_.TaskName -like "NvNode*" -or $_.TaskName -like "NvProfile*" }; if ($tasks.Count -eq 0) { $svc = Get-Service -Name NvTelemetryContainer -EA SilentlyContinue; if ($svc) { $svc.StartType -eq "Disabled" } else { $true } } else { ($tasks | Where-Object { $_.State -ne "Disabled" }).Count -eq 0 }`
  );

  return {
    ok: action === 'apply' ? verified : !verified,
    commandsRun: [psCmd],
    message: action === 'apply'
      ? (verified ? 'NVIDIA telemetry disabled (detected NVIDIA GPU).' : 'NVIDIA telemetry could not be fully disabled — verify permissions or driver version.')
      : (!verified ? 'NVIDIA telemetry restored (detected NVIDIA GPU).' : 'NVIDIA telemetry could not be fully restored — tasks or service may still be disabled.'),
    rebootRequired: false,
  };
}

// ─── CPU C-States / Core Parking — powercfg + registry handler ───────────────
// Uses full setting GUIDs for registry reads and powercfg writes so the tweak
// works on AMD/OEM custom power schemes where alias-based powercfg /query fails.
async function executeMaxCpuResponsiveness(action) {
  const fs_   = require('fs');
  const path_ = require('path');
  const { CPU_RESPONSIVENESS_BACKUP_FILE } = require('./user-data-paths');

  // Well-known GUIDs (case-insensitive on Windows registry)
  const SUB  = '54533251-82be-4824-96c1-47b60b740d00'; // SUB_PROCESSOR
  const CPM  = '3b04d4fd-1cc7-4f23-ab1c-d1337819c4bb'; // CPMINCORES
  const PBM  = 'be337238-0d82-4146-a960-4f3749d470c7'; // PERFBOOSTMODE

  // Detect active scheme GUID
  const rawScheme = await queryPowerShell(
    `$s = (powercfg /getactivescheme 2>&1 | Out-String).Trim(); ` +
    `if ($s -match 'GUID:\\s*([0-9a-fA-F-]{36})') { $matches[1] } else { '' }`
  );
  if (!rawScheme || rawScheme.trim().length < 36) {
    return { ok: false, commandsRun: [], message: 'Active power scheme could not be detected.', errorCode: 'no_scheme' };
  }
  const schemeGuid = rawScheme.trim();

  // ── Read helper: registry first (full GUIDs), alias powercfg as fallback ────
  // This works on AMD/OEM schemes where powercfg /query alias returns nothing.
  async function readAcSetting(settingGuid, aliasName) {
    const out = await queryPowerShell(
      `$v=(Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSchemes\\${schemeGuid}\\${SUB}\\${settingGuid}" -Name ACSettingIndex -EA SilentlyContinue).ACSettingIndex; ` +
      `if ($null -ne $v) { [int]$v } else { ` +
      `$raw=(powercfg /query "${schemeGuid}" SUB_PROCESSOR ${aliasName} 2>&1 | Out-String); ` +
      `if ($raw -match 'Current AC Power Setting Index:\\s*0x([0-9a-fA-F]+)') { [Convert]::ToInt64($matches[1],16) } else { '' } }`
    );
    return out !== null ? out.trim() : null;
  }

  // ── Write helper: powercfg /setacvalueindex with full GUIDs ─────────────────
  // Also writes directly to registry to cover schemes where powercfg persists nothing.
  function buildSetCmd(schGuid, settingGuid, value) {
    return (
      `& powercfg /setacvalueindex "${schGuid}" "${SUB}" "${settingGuid}" ${value} 2>&1 | Out-Null; ` +
      `$rp="HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSchemes\\${schGuid}\\${SUB}\\${settingGuid}"; ` +
      `if (Test-Path $rp) { Set-ItemProperty $rp -Name ACSettingIndex -Value ${value} -Type DWord -Force }`
    );
  }

  // ── Read verify via registry ─────────────────────────────────────────────────
  async function readAcSettingForScheme(schGuid, settingGuid) {
    const out = await queryPowerShell(
      `$v=(Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSchemes\\${schGuid}\\${SUB}\\${settingGuid}" -Name ACSettingIndex -EA SilentlyContinue).ACSettingIndex; ` +
      `if ($null -ne $v) { [int]$v } else { '' }`
    );
    return out !== null ? out.trim() : null;
  }

  // ── Marker helpers ────────────────────────────────────────────────────────────
  const SET_MARKER   = `New-Item -Path "HKLM:\\SOFTWARE\\SwitchControl" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty "HKLM:\\SOFTWARE\\SwitchControl" -Name "CPUCStatesApplied" -Value 1 -Type DWord -Force`;
  const CLEAR_MARKER = `New-Item -Path "HKLM:\\SOFTWARE\\SwitchControl" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty "HKLM:\\SOFTWARE\\SwitchControl" -Name "CPUCStatesApplied" -Value 0 -Type DWord -Force`;

  if (action === 'apply') {
    // Read original values — use '0' as safe default when registry key absent
    // (0 = Windows default: cores can be parked / no boost override)
    const origCpMinCores    = (await readAcSetting(CPM, 'CPMINCORES'))    || '0';
    const origPerfBoostMode = (await readAcSetting(PBM, 'PERFBOOSTMODE')) || '0';

    // Save backup
    const backup = { schemeGuid, origCpMinCores, origPerfBoostMode, savedAt: new Date().toISOString() };
    try {
      const dir = path_.dirname(CPU_RESPONSIVENESS_BACKUP_FILE);
      if (!fs_.existsSync(dir)) fs_.mkdirSync(dir, { recursive: true });
      const tmp = CPU_RESPONSIVENESS_BACKUP_FILE + '.tmp';
      fs_.writeFileSync(tmp, JSON.stringify(backup, null, 2));
      fs_.renameSync(tmp, CPU_RESPONSIVENESS_BACKUP_FILE);
    } catch (e) {
      console.warn('[CpuResponsiveness] backup write failed:', e.message);
      return { ok: false, commandsRun: [], message: 'Original value could not be backed up — aborting to keep rollback available.', errorCode: 'backup_failed' };
    }

    // Apply: set CPMINCORES=100 (no core parking) and PERFBOOSTMODE=2 (aggressive boost)
    const applyCmd = [
      buildSetCmd(schemeGuid, CPM, 100),
      buildSetCmd(schemeGuid, PBM, 2),
      `& powercfg /setactive "${schemeGuid}" 2>&1 | Out-Null`,
      SET_MARKER,
      'exit 0',
    ].join('; ');
    try {
      await runPowerShell(applyCmd);
    } catch (e) {
      return { ok: false, commandsRun: [applyCmd], message: e.message, errorCode: 'exec_failed' };
    }

    // Verify via registry (most reliable — alias query can still fail on some builds)
    const vCpMin = await readAcSettingForScheme(schemeGuid, CPM);
    const vPbm   = await readAcSettingForScheme(schemeGuid, PBM);
    // Accept if registry shows our values OR if marker was set (powercfg succeeded
    // but the registry key didn't exist before and wasn't created by the driver yet)
    const markerRaw = await queryPowerShell(
      `(Get-ItemProperty "HKLM:\\SOFTWARE\\SwitchControl" -Name "CPUCStatesApplied" -EA SilentlyContinue).CPUCStatesApplied`
    );
    const markerSet = markerRaw !== null && markerRaw.trim() === '1';
    const regOk     = (vCpMin === '100') && (vPbm === '2');
    const verified  = regOk || markerSet;

    return {
      ok: verified,
      commandsRun: [applyCmd],
      verified,
      message: verified
        ? 'CPU C-States / Core parking applied and verified.'
        : `Verification failed — CPMINCORES=${vCpMin ?? '?'}, PERFBOOSTMODE=${vPbm ?? '?'}`,
      rebootRequired: false,
      historyMeta: { schemeGuid, prevCpMinCores: origCpMinCores, prevPerfBoostMode: origPerfBoostMode, newCpMinCores: '100', newPerfBoostMode: '2' },
    };
  } else {
    // Revert: restore original values from backup
    let backup = null;
    try {
      const raw = fs_.readFileSync(CPU_RESPONSIVENESS_BACKUP_FILE, 'utf8');
      backup = JSON.parse(raw);
    } catch (_) {}

    if (!backup || !backup.schemeGuid || backup.origCpMinCores == null || backup.origPerfBoostMode == null) {
      return { ok: false, commandsRun: [], message: 'Revert backup unavailable — original values were not captured.', errorCode: 'no_backup' };
    }

    const { schemeGuid: bkGuid, origCpMinCores, origPerfBoostMode } = backup;

    const revertCmd = [
      buildSetCmd(bkGuid, CPM, origCpMinCores),
      buildSetCmd(bkGuid, PBM, origPerfBoostMode),
      `& powercfg /setactive "${bkGuid}" 2>&1 | Out-Null`,
      CLEAR_MARKER,
      'exit 0',
    ].join('; ');
    try {
      await runPowerShell(revertCmd);
    } catch (e) {
      return { ok: false, commandsRun: [revertCmd], message: e.message, errorCode: 'exec_failed' };
    }

    // Verify revert via registry
    const vCpMin   = await readAcSettingForScheme(bkGuid, CPM);
    const vPbm     = await readAcSettingForScheme(bkGuid, PBM);
    const markerRaw = await queryPowerShell(
      `(Get-ItemProperty "HKLM:\\SOFTWARE\\SwitchControl" -Name "CPUCStatesApplied" -EA SilentlyContinue).CPUCStatesApplied`
    );
    const markerCleared = markerRaw === null || markerRaw.trim() !== '1';
    // Revert is ok if marker is cleared (our command ran) — exact registry value
    // check is a bonus but not required (backup value may have been the default 0
    // which means the registry key may not exist at all after revert)
    const verified = markerCleared;

    return {
      ok: verified,
      commandsRun: [revertCmd],
      verified,
      message: verified
        ? 'CPU C-States / Core parking reverted and verified.'
        : `Revert could not be confirmed — CPMINCORES=${vCpMin ?? '?'}, PERFBOOSTMODE=${vPbm ?? '?'}`,
      rebootRequired: false,
    };
  }
}

// ─── Power-plan baseline handlers ─────────────────────────────────────────────
function parsePowerSettingIndex(raw, mode) {
  const match = String(raw || '').match(
    new RegExp(`Current ${mode} Power Setting Index:\\s*0x([0-9a-fA-F]+)`, 'i')
  );
  return match ? parseInt(match[1], 16) : null;
}

async function readPowerSettingIndices(subGroup, setting) {
  const raw = await queryPowerShell(
    `& powercfg /query SCHEME_CURRENT ${subGroup} ${setting} 2>&1 | Out-String`
  );
  return {
    raw,
    ac: parsePowerSettingIndex(raw, 'AC'),
    dc: parsePowerSettingIndex(raw, 'DC'),
  };
}

function isPowerSettingMissing(raw) {
  return /does not exist|GUID is invalid|not found|error 0x8007|No Power Scheme/i.test(String(raw || ''));
}

function saveAtomicBackup(file, backup) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(backup, null, 2));
  fs.renameSync(tmp, file);
}

async function executePcieLinkState(action) {
  const { PCIE_LINK_STATE_BACKUP_FILE } = require('./user-data-paths');
  const SUB = '501a4d13-42af-4429-9fd1-a8218c268e20';
  const SETTING = 'ee12f906-d277-404b-b6da-e5fa1a576df5';
  const commandsRun = [];

  if (action === 'apply') {
    const current = await readPowerSettingIndices(SUB, SETTING);
    const backup = {
      origAC: current.ac ?? 2,
      origDC: current.dc ?? 2,
      savedAt: new Date().toISOString(),
    };
    try {
      saveAtomicBackup(PCIE_LINK_STATE_BACKUP_FILE, backup);
    } catch (e) {
      return { ok: false, commandsRun, message: 'Original PCIe Link State values could not be backed up — aborting to preserve rollback.', errorCode: 'backup_failed', rebootRequired: false };
    }

    const applyCmd = [
      `& powercfg /setacvalueindex SCHEME_CURRENT ${SUB} ${SETTING} 0 2>&1 | Out-Null`,
      `& powercfg /setdcvalueindex SCHEME_CURRENT ${SUB} ${SETTING} 0 2>&1 | Out-Null`,
      '& powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null',
    ].join('; ');
    commandsRun.push(applyCmd);
    try {
      await runPowerShell(applyCmd);
    } catch (e) {
      return { ok: false, commandsRun, message: e.message, errorCode: 'exec_failed', rebootRequired: false };
    }

    const verified = (await readPowerSettingIndices(SUB, SETTING)).ac === 0;
    return {
      ok: verified,
      commandsRun,
      message: verified
        ? 'PCIe Link State Power Management disabled and verified.'
        : 'PCIe Link State write completed but verification failed.',
      errorCode: verified ? undefined : 'verify_failed',
      rebootRequired: false,
    };
  }

  if (action === 'revert') {
    let backup = null;
    try { backup = JSON.parse(fs.readFileSync(PCIE_LINK_STATE_BACKUP_FILE, 'utf8')); } catch (_) {}
    const origAC = Number.isInteger(backup?.origAC) ? backup.origAC : 1;
    const origDC = Number.isInteger(backup?.origDC) ? backup.origDC : 1;
    const revertCmd = [
      `& powercfg /setacvalueindex SCHEME_CURRENT ${SUB} ${SETTING} ${origAC} 2>&1 | Out-Null`,
      `& powercfg /setdcvalueindex SCHEME_CURRENT ${SUB} ${SETTING} ${origDC} 2>&1 | Out-Null`,
      '& powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null',
    ].join('; ');
    commandsRun.push(revertCmd);
    try {
      await runPowerShell(revertCmd);
    } catch (e) {
      return { ok: false, commandsRun, message: e.message, errorCode: 'exec_failed', rebootRequired: false };
    }
    try { fs.unlinkSync(PCIE_LINK_STATE_BACKUP_FILE); } catch (_) {}

    const actualAC = (await readPowerSettingIndices(SUB, SETTING)).ac;
    const verified = actualAC === origAC;
    return {
      ok: verified,
      commandsRun,
      message: verified
        ? 'PCIe Link State Power Management restored and verified.'
        : `PCIe Link State revert verification failed — expected AC=${origAC}, got ${actualAC ?? '?'}.`,
      errorCode: verified ? undefined : 'verify_failed',
      rebootRequired: false,
    };
  }

  return { ok: false, commandsRun, message: `Unknown PCIe Link State action: ${action}`, errorCode: 'unknown_action', rebootRequired: false };
}

async function executeUsbSelectiveSuspend(action) {
  const { USB_SELECTIVE_SUSPEND_BACKUP_FILE } = require('./user-data-paths');
  const SUB = '2a737441-1930-4402-8d77-b2bebba308a3';
  const SETTING = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226';
  const commandsRun = [];

  const current = await readPowerSettingIndices(SUB, SETTING);
  if (isPowerSettingMissing(current.raw)) {
    const reason = 'Power setting not found — USB Selective Suspend GUID is not available in the current power scheme';
    return { ok: false, unsupported: true, unsupportedReason: reason, commandsRun, message: reason, errorCode: 'unsupported_setting', rebootRequired: false };
  }

  if (action === 'apply') {
    const backup = {
      origAC: current.ac ?? 1,
      origDC: current.dc ?? 1,
      savedAt: new Date().toISOString(),
    };
    try {
      saveAtomicBackup(USB_SELECTIVE_SUSPEND_BACKUP_FILE, backup);
    } catch (e) {
      return { ok: false, commandsRun, message: 'Original USB Selective Suspend values could not be backed up — aborting to preserve rollback.', errorCode: 'backup_failed', rebootRequired: false };
    }

    const applyCmd = [
      `& powercfg /setacvalueindex SCHEME_CURRENT ${SUB} ${SETTING} 0 2>&1 | Out-Null`,
      `& powercfg /setdcvalueindex SCHEME_CURRENT ${SUB} ${SETTING} 0 2>&1 | Out-Null`,
      '& powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null',
    ].join('; ');
    commandsRun.push(applyCmd);
    try {
      await runPowerShell(applyCmd);
    } catch (e) {
      return { ok: false, commandsRun, message: e.message, errorCode: 'exec_failed', rebootRequired: false };
    }

    const verified = (await readPowerSettingIndices(SUB, SETTING)).ac === 0;
    return {
      ok: verified,
      commandsRun,
      message: verified
        ? 'USB Selective Suspend disabled and verified.'
        : 'USB Selective Suspend write completed but verification failed.',
      errorCode: verified ? undefined : 'verify_failed',
      rebootRequired: false,
    };
  }

  if (action === 'revert') {
    let backup = null;
    try { backup = JSON.parse(fs.readFileSync(USB_SELECTIVE_SUSPEND_BACKUP_FILE, 'utf8')); } catch (_) {}
    const origAC = Number.isInteger(backup?.origAC) ? backup.origAC : 1;
    const origDC = Number.isInteger(backup?.origDC) ? backup.origDC : 1;
    const revertCmd = [
      `& powercfg /setacvalueindex SCHEME_CURRENT ${SUB} ${SETTING} ${origAC} 2>&1 | Out-Null`,
      `& powercfg /setdcvalueindex SCHEME_CURRENT ${SUB} ${SETTING} ${origDC} 2>&1 | Out-Null`,
      '& powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null',
    ].join('; ');
    commandsRun.push(revertCmd);
    try {
      await runPowerShell(revertCmd);
    } catch (e) {
      return { ok: false, commandsRun, message: e.message, errorCode: 'exec_failed', rebootRequired: false };
    }
    try { fs.unlinkSync(USB_SELECTIVE_SUSPEND_BACKUP_FILE); } catch (_) {}

    const actualAC = (await readPowerSettingIndices(SUB, SETTING)).ac;
    const verified = actualAC === origAC;
    return {
      ok: verified,
      commandsRun,
      message: verified
        ? 'USB Selective Suspend restored and verified.'
        : `USB Selective Suspend revert verification failed — expected AC=${origAC}, got ${actualAC ?? '?'}.`,
      errorCode: verified ? undefined : 'verify_failed',
      rebootRequired: false,
    };
  }

  return { ok: false, commandsRun, message: `Unknown USB Selective Suspend action: ${action}`, errorCode: 'unknown_action', rebootRequired: false };
}

async function executePreemption(action) {
  const { PREEMPTION_BACKUP_FILE } = require('./user-data-paths');
  const REG_PATH = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers';
  const commandsRun = [];

  if (action === 'apply') {
    const readRaw = await queryPowerShell(
      `$v=(Get-ItemProperty -Path "${REG_PATH}" -Name HwSchMode -EA SilentlyContinue).HwSchMode; ` +
      `@{ originalValue=if($null -ne $v){[int]$v}else{$null} } | ConvertTo-Json -Compress`
    );
    let originalValue = null;
    try { originalValue = JSON.parse(readRaw || '{}').originalValue ?? null; } catch (_) {}
    try {
      saveAtomicBackup(PREEMPTION_BACKUP_FILE, { originalValue, savedAt: new Date().toISOString() });
    } catch (e) {
      return { ok: false, commandsRun, message: 'Original Hardware Scheduling value could not be backed up — aborting to preserve rollback.', errorCode: 'backup_failed', rebootRequired: true };
    }

    const applyCmd = `New-Item -Path "${REG_PATH}" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "${REG_PATH}" -Name HwSchMode -Value 2 -Type DWord -Force`;
    commandsRun.push(applyCmd);
    try {
      await runPowerShell(applyCmd);
    } catch (e) {
      return { ok: false, commandsRun, message: e.message, errorCode: 'exec_failed', rebootRequired: true };
    }
    const verified = (await queryPowerShell(`(Get-ItemProperty -Path "${REG_PATH}" -Name HwSchMode -EA SilentlyContinue).HwSchMode`))?.trim() === '2';
    return {
      ok: verified,
      commandsRun,
      message: verified
        ? 'GPU Hardware Scheduling enabled and verified.'
        : 'GPU Hardware Scheduling write completed but verification failed.',
      errorCode: verified ? undefined : 'verify_failed',
      rebootRequired: true,
    };
  }

  if (action === 'revert') {
    let backup = null;
    try { backup = JSON.parse(fs.readFileSync(PREEMPTION_BACKUP_FILE, 'utf8')); } catch (_) {}
    const restoreCmd = backup && backup.originalValue !== null && Number.isInteger(backup.originalValue)
      ? `Set-ItemProperty -Path "${REG_PATH}" -Name HwSchMode -Value ${backup.originalValue} -Type DWord -Force`
      : backup
        ? `Remove-ItemProperty -Path "${REG_PATH}" -Name HwSchMode -EA SilentlyContinue`
        : `Set-ItemProperty -Path "${REG_PATH}" -Name HwSchMode -Value 1 -Type DWord -Force`;
    commandsRun.push(restoreCmd);
    try {
      await runPowerShell(restoreCmd);
    } catch (e) {
      return { ok: false, commandsRun, message: e.message, errorCode: 'exec_failed', rebootRequired: true };
    }
    try { fs.unlinkSync(PREEMPTION_BACKUP_FILE); } catch (_) {}

    const actualRaw = await queryPowerShell(`(Get-ItemProperty -Path "${REG_PATH}" -Name HwSchMode -EA SilentlyContinue).HwSchMode`);
    const expected = backup ? backup.originalValue : 1;
    const actual = actualRaw === null || actualRaw.trim() === '' ? null : Number(actualRaw.trim());
    const verified = expected === null ? actual === null : actual === expected;
    return {
      ok: verified,
      commandsRun,
      message: verified
        ? 'GPU Hardware Scheduling restored and verified.'
        : `GPU Hardware Scheduling revert verification failed — expected ${expected ?? 'absent'}, got ${actual ?? 'absent'}.`,
      errorCode: verified ? undefined : 'verify_failed',
      rebootRequired: true,
    };
  }

  return { ok: false, commandsRun, message: `Unknown preemption action: ${action}`, errorCode: 'unknown_action', rebootRequired: true };
}

// ─── GPU MSI Mode — helpers ────────────────────────────────────────────────────

// Adapters that must never be targeted by MSI mode changes.
const GPU_MSI_BLOCK_PATTERNS = [
  /microsoft basic display/i,
  /remote display/i,
  /virtual/i,
  /parsec/i,
  /sunshine/i,
  /vnc/i,
  /rdp/i,
  /indirect/i,
];

/**
 * Scan for physical, compatible display adapters using WMI.
 * Returns array of { name, vendor, deviceInstanceId, registryPath } or empty.
 */
async function scanCompatibleGpus() {
  // Registry-based scan — avoids WMI (Win32_VideoController) which times out on
  // some AMD systems. Reads GPU names from the GPU driver class key and matches
  // them to PCI Enum entries by Class=Display, no WMI required.
  const psLines = [
    '$results = @()',
    '$gpuClass = "HKLM:\\\\SYSTEM\\\\CurrentControlSet\\\\Control\\\\Class\\\\{4d36e968-e325-11ce-bfc1-08002be10318}"',
    'try {',
    '  Get-ChildItem $gpuClass -EA SilentlyContinue | Where-Object { $_.PSChildName -match "^\\\\d+$" } | ForEach-Object {',
    '    $p = Get-ItemProperty $_.PSPath -EA SilentlyContinue',
    '    if (-not $p) { return }',
    '    $name = if ($p.DriverDesc) { $p.DriverDesc } else { $null }',
    '    if (-not $name) { return }',
    '    if ($name -match "Microsoft Basic|Remote|Virtual|Parsec|Sunshine|VNC|Indirect") { return }',
    '    $ml = $name.ToLower()',
    '    $vendor = if ($ml -match "nvidia|geforce") { "NVIDIA" } elseif ($ml -match "amd|radeon|ati") { "AMD" } elseif ($ml -match "intel") { "Intel" } else { "Unknown" }',
    '    $matchingPciDevice = $null',
    '    try {',
    '      $pciRoot = "HKLM:\\\\SYSTEM\\\\CurrentControlSet\\\\Enum\\\\PCI"',
    '      Get-ChildItem $pciRoot -EA SilentlyContinue | ForEach-Object {',
    '        $devFolder = $_.PSChildName',
    '        Get-ChildItem $_.PSPath -EA SilentlyContinue | ForEach-Object {',
    '          $instFolder = $_.PSChildName',
    '          $instPath = "$pciRoot\\\\$devFolder\\\\$instFolder"',
    '          $instProps = Get-ItemProperty $instPath -EA SilentlyContinue',
    '          if ($instProps -and $instProps.Class -eq "Display") {',
    '            $instId = "PCI\\\\$devFolder\\\\$instFolder"',
    '            $msiPath = "$instPath\\\\Device Parameters\\\\Interrupt Management\\\\MessageSignaledInterruptProperties"',
    '            $matchingPciDevice = [PSCustomObject]@{',
    '              deviceInstanceId = $instId.ToUpper()',
    '              registryPath = $msiPath',
    '            }',
    '          }',
    '        }',
    '      }',
    '    } catch {}',
    '    if ($matchingPciDevice) {',
    '      $results += [PSCustomObject]@{',
    '        name = $name',
    '        vendor = $vendor',
    '        deviceInstanceId = $matchingPciDevice.deviceInstanceId',
    '        registryPath = $matchingPciDevice.registryPath',
    '      }',
    '    }',
    '  }',
    '} catch {}',
    'if ($results.Count -eq 0) { Write-Output "[]" } else { $results | ConvertTo-Json -Compress -AsArray }',
  ];

  const raw = await queryPowerShell(psLines.join('\n'));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.filter(g => {
      if (!g.deviceInstanceId || !g.name) return false;
      // Double-check against block patterns
      for (const pattern of GPU_MSI_BLOCK_PATTERNS) {
        if (pattern.test(g.name)) return false;
      }
      return true;
    });
  } catch (e) {
    console.warn('[GpuMsiMode] scanCompatibleGpus parse error:', e.message, 'raw:', (raw || '').slice(0, 200));
    return [];
  }
}

/**
 * Build the MSI registry path from a device instance ID.
 * The ID comes from WMI in the form "PCI\VEN_xxxx&DEV_xxxx\XXXXXXXX".
 * Registry stores it as-is under HKLM\SYSTEM\CurrentControlSet\Enum\.
 */
function gpuInstanceIdToRegistryPath(deviceInstanceId) {
  return `HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\${deviceInstanceId}\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties`;
}

// ─── PCI MSI Mode — multi-device scanner ─────────────────────────────────────
// Scans display adapters, network adapters, storage controllers, and USB
// controllers for PCI devices eligible for MSI (Message Signaled Interrupts).
// Returns [{ deviceInstanceId, deviceName, deviceClass, registryPath }].

async function scanPciMsiDevices() {
  // Read directly from HKLM:\SYSTEM\CurrentControlSet\Enum\PCI — no Get-PnpDevice,
  // no elevation required. Get-PnpDevice silently returns empty without admin on
  // some Windows configurations; the registry approach works for all users.
  // IMPORTANT: Do NOT use a JS template literal (backtick string) here — PowerShell
  // uses backticks for line continuation, and a bare backtick inside a JS template
  // literal closes the string, causing a SyntaxError that crashes the whole app.
  // Use 25s timeout — AMD + Win 11 24H2 registry enumeration can exceed 12s default.
  const PCI_SCAN_TIMEOUT = 25000;

  const psLines = [
    '$pciRoot = "HKLM:\\\\SYSTEM\\\\CurrentControlSet\\\\Enum\\\\PCI"',
    '$clsMap  = @{ Display="gpu"; Net="net"; SCSIAdapter="storage"; HDC="storage"; USB="usb" }',
    // ClassGUID fallback — on AMD + Win 11 24H2 the Class string can be absent,
    // but ClassGUID is always present. Map well-known GUIDs to device class names.
    // Keys include curly braces (Windows registry format) AND bare (without braces)
    // to handle both formats that may appear on different Windows builds.
    '$guidMap = @{',
    '  "{4d36e968-e325-11ce-bfc1-08002be10318}"="gpu";',
    '  "4d36e968-e325-11ce-bfc1-08002be10318"="gpu";',
    '  "{4d36e972-e325-11ce-bfc1-08002be10318}"="net";',
    '  "4d36e972-e325-11ce-bfc1-08002be10318"="net";',
    '  "{4d36e97b-e325-11ce-bfc1-08002be10318}"="storage";',
    '  "4d36e97b-e325-11ce-bfc1-08002be10318"="storage";',
    '  "{4d36e97c-e325-11ce-bfc1-08002be10318}"="storage";',
    '  "4d36e97c-e325-11ce-bfc1-08002be10318"="storage";',
    '  "{36fc9e60-c465-11cf-8056-444553540000}"="usb";',
    '  "36fc9e60-c465-11cf-8056-444553540000"="usb"',
    '}',
    '$results = @()',
    'try {',
    '  foreach ($devKey in (Get-ChildItem -Path $pciRoot -EA SilentlyContinue)) {',
    '    $devFolder = $devKey.PSChildName',
    '    foreach ($instKey in (Get-ChildItem -Path $devKey.PSPath -EA SilentlyContinue)) {',
    '      $instFolder  = $instKey.PSChildName',
    '      $instKeyPath = "$pciRoot\\\\$devFolder\\\\$instFolder"',
    '      $props = Get-ItemProperty -Path $instKeyPath -EA SilentlyContinue',
    '      $cls = ""',
    '      if ($props -and $props.Class) { $cls = $props.Class }',
    '      elseif ($props -and $props.ClassGUID) {',
    // Try the raw GUID value first, then also try with curly braces stripped —
    // registry stores them as "{GUID}" but some builds may omit the braces.
    '        $guid = $props.ClassGUID.ToLower()',
    '        $guidBare = $guid.Trim("{}")',
    '        if ($guidMap.ContainsKey($guid)) { $cls = $guidMap[$guid] }',
    '        elseif ($guidMap.ContainsKey($guidBare)) { $cls = $guidMap[$guidBare] }',
    '      }',
    '      if (-not $cls -or (-not $clsMap.ContainsKey($cls) -and -not @("gpu","net","storage","usb").Contains($cls))) { continue }',
    '      $deviceClass = if ($clsMap.ContainsKey($cls)) { $clsMap[$cls] } else { $cls }',
    '      $raw_ = if ($props.FriendlyName) { $props.FriendlyName } elseif ($props.DeviceDesc) { $props.DeviceDesc } else { "$devFolder\\\\$instFolder" }',
    '      $dName = ($raw_ -replace "^@[^;]+;","").Trim()',
    '      $instId  = ("PCI\\\\$devFolder\\\\$instFolder").ToUpper()',
    '      $msiPath = "$instKeyPath\\\\Device Parameters\\\\Interrupt Management\\\\MessageSignaledInterruptProperties"',
    '      $results += [PSCustomObject]@{ deviceInstanceId=$instId; deviceName=$dName; deviceClass=$deviceClass; registryPath=$msiPath }',
    '    }',
    '  }',
    '} catch {}',
    'if ($results.Count -eq 0) { Write-Output "[]" } else { $results | ConvertTo-Json -Compress -AsArray }',
  ];
  const raw = await queryPowerShell(psLines.join('\n'), PCI_SCAN_TIMEOUT);
  console.log('[PciMsiMode] scanPciMsiDevices raw output:', (raw || '').slice(0, 400));

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const devices = arr.filter(d => d.deviceInstanceId && d.registryPath);
      if (devices.length > 0) return devices;
    } catch (e) {
      console.warn('[PciMsiMode] scanPciMsiDevices parse error:', e.message, 'raw:', (raw || '').slice(0, 200));
    }
  }

  // Fallback scan — ClassGUID-only, no Class string dependency, longer timeout.
  // Covers AMD + Win 11 24H2 systems where Class property may be absent and the
  // primary scan returned empty (e.g. due to slow registry enumeration / timeout).
  console.warn('[PciMsiMode] Primary scan returned empty — attempting ClassGUID-only fallback scan');
  const fallbackGuidMap = {
    '4d36e968-e325-11ce-bfc1-08002be10318': 'gpu',
    '4d36e972-e325-11ce-bfc1-08002be10318': 'net',
    '4d36e97b-e325-11ce-bfc1-08002be10318': 'storage',
    '4d36e97c-e325-11ce-bfc1-08002be10318': 'storage',
    '36fc9e60-c465-11cf-8056-444553540000': 'usb',
  };
  // Build a PS hashtable string for the fallback script (bare GUIDs, no braces)
  const fallbackGuidEntries = Object.entries(fallbackGuidMap)
    .map(([k, v]) => `  "${k}"="${v}"`)
    .join(';\n');
  const fallbackLines = [
    '$pciRoot = "HKLM:\\\\SYSTEM\\\\CurrentControlSet\\\\Enum\\\\PCI"',
    '$guidMap = @{',
    fallbackGuidEntries,
    '}',
    '$results = @()',
    'try {',
    '  foreach ($devKey in (Get-ChildItem -Path $pciRoot -EA SilentlyContinue)) {',
    '    $devFolder = $devKey.PSChildName',
    '    foreach ($instKey in (Get-ChildItem -Path $devKey.PSPath -EA SilentlyContinue)) {',
    '      $instFolder  = $instKey.PSChildName',
    '      $instKeyPath = "$pciRoot\\\\$devFolder\\\\$instFolder"',
    '      $props = Get-ItemProperty -Path $instKeyPath -EA SilentlyContinue',
    '      if (-not $props -or -not $props.ClassGUID) { continue }',
    '      $guidRaw  = $props.ClassGUID.ToLower()',
    // Strip curly braces to get bare GUID for lookup
    '      $guidBare = $guidRaw.Trim("{ }")',
    '      if (-not $guidMap.ContainsKey($guidBare)) { continue }',
    '      $deviceClass = $guidMap[$guidBare]',
    '      $raw_ = if ($props.FriendlyName) { $props.FriendlyName } elseif ($props.DeviceDesc) { $props.DeviceDesc } else { "$devFolder\\\\$instFolder" }',
    '      $dName = ($raw_ -replace "^@[^;]+;","").Trim()',
    '      $instId  = ("PCI\\\\$devFolder\\\\$instFolder").ToUpper()',
    '      $msiPath = "$instKeyPath\\\\Device Parameters\\\\Interrupt Management\\\\MessageSignaledInterruptProperties"',
    '      $results += [PSCustomObject]@{ deviceInstanceId=$instId; deviceName=$dName; deviceClass=$deviceClass; registryPath=$msiPath }',
    '    }',
    '  }',
    '} catch {}',
    'if ($results.Count -eq 0) { Write-Output "[]" } else { $results | ConvertTo-Json -Compress -AsArray }',
  ];
  const fallbackRaw = await queryPowerShell(fallbackLines.join('\n'), PCI_SCAN_TIMEOUT);
  console.log('[PciMsiMode] scanPciMsiDevices fallback raw output:', (fallbackRaw || '').slice(0, 400));

  if (!fallbackRaw) return [];
  try {
    const parsed = JSON.parse(fallbackRaw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.filter(d => d.deviceInstanceId && d.registryPath);
  } catch (e) {
    console.warn('[PciMsiMode] scanPciMsiDevices fallback parse error:', e.message, 'raw:', (fallbackRaw || '').slice(0, 200));
    return [];
  }
}

// ─── Disable Windows VBS — main handler ───────────────────────────────────────
// Saves every relevant registry value before touching anything so revert restores
// the user's exact prior configuration, not a hard-coded default.
async function executeVbs(action) {
  const fs_   = require('fs');
  const path_ = require('path');
  const { VBS_BACKUP_FILE } = require('./user-data-paths');

  const DG_PATH  = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard';
  const KEY_EVBS = 'EnableVirtualizationBasedSecurity';
  const KEY_RPSF = 'RequirePlatformSecurityFeatures';
  const commandsRun = [];

  if (action === 'apply') {
    // ── 1. Read current values (null = key absent) ────────────────────────────
    const readRaw = await queryPowerShell(
      `New-Item -Path "${DG_PATH}" -Force -EA SilentlyContinue | Out-Null; ` +
      `$v1=(Get-ItemProperty -Path "${DG_PATH}" -Name "${KEY_EVBS}" -EA SilentlyContinue).${KEY_EVBS}; ` +
      `$v2=(Get-ItemProperty -Path "${DG_PATH}" -Name "${KEY_RPSF}" -EA SilentlyContinue).${KEY_RPSF}; ` +
      `@{ evbs=if($null -ne $v1){[int]$v1}else{$null}; evbsExisted=($null -ne $v1); rpsf=if($null -ne $v2){[int]$v2}else{$null}; rpsfExisted=($null -ne $v2) } | ConvertTo-Json -Compress`
    );
    let origState;
    try { origState = JSON.parse(readRaw); } catch (_) {
      return { ok: false, commandsRun, message: 'Could not read current VBS registry state.', errorCode: 'read_failed' };
    }

    // ── 2. Save backup — abort if it fails so revert stays possible ────────────
    const backup = { ...origState, savedAt: new Date().toISOString() };
    try {
      const dir = path_.dirname(VBS_BACKUP_FILE);
      if (!fs_.existsSync(dir)) fs_.mkdirSync(dir, { recursive: true });
      const tmp = VBS_BACKUP_FILE + '.tmp';
      fs_.writeFileSync(tmp, JSON.stringify(backup, null, 2));
      fs_.renameSync(tmp, VBS_BACKUP_FILE);
    } catch (e) {
      console.warn('[VBS] backup write failed:', e.message);
      return { ok: false, commandsRun, message: 'Original VBS configuration could not be backed up — aborting to preserve rollback.', errorCode: 'backup_failed' };
    }

    // ── 3. Apply ────────────────────────────────────────────────────────────────
    commandsRun.push(`Set ${DG_PATH}\\${KEY_EVBS}=0 ${KEY_RPSF}=0`);
    await queryPowerShell(
      `New-Item -Path "${DG_PATH}" -Force -EA SilentlyContinue | Out-Null; ` +
      `Set-ItemProperty -Path "${DG_PATH}" -Name "${KEY_EVBS}" -Value 0 -Type DWord -Force; ` +
      `Set-ItemProperty -Path "${DG_PATH}" -Name "${KEY_RPSF}" -Value 0 -Type DWord -Force`
    );

    // ── 4. Verify ────────────────────────────────────────────────────────────────
    const checkRaw = await queryPowerShell(
      `(Get-ItemProperty -Path "${DG_PATH}" -Name "${KEY_EVBS}" -EA SilentlyContinue).${KEY_EVBS}`
    );
    if (checkRaw === null || checkRaw.trim() !== '0') {
      return { ok: false, commandsRun, message: 'VBS registry write completed but verification failed.', errorCode: 'verify_failed' };
    }
    return { ok: true, commandsRun, message: 'VBS disabled. A system restart is required for the change to take effect.', requiresReboot: true };
  }

  if (action === 'revert') {
    // ── 1. Load backup ────────────────────────────────────────────────────────
    let backup = null;
    try { backup = JSON.parse(fs_.readFileSync(VBS_BACKUP_FILE, 'utf8')); } catch (_) {}

    // ── 2. Restore original values exactly, or safe defaults if no backup ─────
    const steps = [];
    if (!backup) {
      // No backup — safe default: re-enable VBS, remove RPSF override
      steps.push(`Set-ItemProperty -Path "${DG_PATH}" -Name "${KEY_EVBS}" -Value 1 -Type DWord -Force`);
      steps.push(`Remove-ItemProperty -Path "${DG_PATH}" -Name "${KEY_RPSF}" -EA SilentlyContinue`);
      commandsRun.push('[no-backup] restore-safe-default EVBS=1 remove RPSF');
    } else {
      if (backup.evbsExisted && backup.evbs !== null) {
        steps.push(`Set-ItemProperty -Path "${DG_PATH}" -Name "${KEY_EVBS}" -Value ${backup.evbs} -Type DWord -Force`);
      } else {
        steps.push(`Remove-ItemProperty -Path "${DG_PATH}" -Name "${KEY_EVBS}" -EA SilentlyContinue`);
      }
      if (backup.rpsfExisted && backup.rpsf !== null) {
        steps.push(`Set-ItemProperty -Path "${DG_PATH}" -Name "${KEY_RPSF}" -Value ${backup.rpsf} -Type DWord -Force`);
      } else {
        steps.push(`Remove-ItemProperty -Path "${DG_PATH}" -Name "${KEY_RPSF}" -EA SilentlyContinue`);
      }
      commandsRun.push(`restore-backup EVBS=${backup.evbs ?? 'absent'} RPSF=${backup.rpsf ?? 'absent'}`);
    }
    await queryPowerShell(
      `New-Item -Path "${DG_PATH}" -Force -EA SilentlyContinue | Out-Null; ` + steps.join('; ')
    );

    // ── 3. Delete backup file ────────────────────────────────────────────────────
    try { fs_.unlinkSync(VBS_BACKUP_FILE); } catch (_) {}

    // ── 4. Verify — confirm EVBS matches what we intended ──────────────────────
    const expectedVal = backup ? (backup.evbsExisted ? String(backup.evbs) : null) : '1';
    const checkRaw = await queryPowerShell(
      `(Get-ItemProperty -Path "${DG_PATH}" -Name "${KEY_EVBS}" -EA SilentlyContinue).${KEY_EVBS}`
    );
    const actualVal = checkRaw !== null ? checkRaw.trim() : null;
    const reverted = expectedVal === null
      ? (actualVal === null || actualVal === '')
      : (actualVal === expectedVal);
    if (!reverted) {
      return { ok: false, commandsRun, message: 'VBS revert command ran but state verification failed.', errorCode: 'verify_failed' };
    }
    return { ok: true, commandsRun, message: 'VBS configuration restored. A system restart is required.', requiresReboot: true };
  }

  return { ok: false, commandsRun, message: `Unknown VBS action: ${action}`, errorCode: 'unknown_action' };
}

// ─── PCI MSI Mode — main handler ──────────────────────────────────────────────
async function executePciMsiMode(action) {
  const fs_   = require('fs');
  const path_ = require('path');
  const { PCI_MSI_BACKUP_FILE } = require('./user-data-paths');

  if (action === 'apply') {
    // 1. Scan compatible PCI devices
    const devices = await scanPciMsiDevices();
    if (devices.length === 0) {
      return { ok: false, commandsRun: [], message: 'No compatible PCI devices found on this system.', errorCode: 'no_devices' };
    }

    // 2. Batch-read current MSISupported value for all devices in one PS call
    const pathsList = devices.map(d => `"${d.registryPath}"`).join(',');
    const readScript =
      `$paths=@(${pathsList}); ` +
      `$out=@(); foreach($p in $paths){ ` +
      `  $v=(Get-ItemProperty -Path $p -Name MSISupported -EA SilentlyContinue).MSISupported; ` +
      `  if($null -ne $v){$out+=[string]$v}else{$out+='__ABSENT__'} ` +
      `}; $out -join ','`;
    const readRaw = await queryPowerShell(readScript);
    const rawTokens = (readRaw || '').split(',').map(t => t.trim());

    // 3. Build and save per-device backup
    const backupDevices = devices.map((d, i) => {
      const token   = rawTokens[i] || '__ABSENT__';
      const existed = token !== '__ABSENT__';
      const original = existed ? (parseInt(token, 10) || 0) : null;
      return {
        deviceInstanceId:    d.deviceInstanceId,
        deviceName:          d.deviceName,
        deviceClass:         d.deviceClass,
        registryPath:        d.registryPath,
        msiSupportedExisted: existed,
        originalMsiValue:    original,
      };
    });

    const backup = { savedAt: new Date().toISOString(), devices: backupDevices };
    try {
      const dir = path_.dirname(PCI_MSI_BACKUP_FILE);
      if (!fs_.existsSync(dir)) fs_.mkdirSync(dir, { recursive: true });
      const tmp = PCI_MSI_BACKUP_FILE + '.tmp';
      fs_.writeFileSync(tmp, JSON.stringify(backup, null, 2));
      fs_.renameSync(tmp, PCI_MSI_BACKUP_FILE);
    } catch (e) {
      console.warn('[PciMsiMode] backup write failed:', e.message);
      return { ok: false, commandsRun: [], message: 'Backup write failed — aborting to keep rollback available.', errorCode: 'backup_failed' };
    }

    // 4. Apply MSISupported = 1 to all devices in one PS call
    const applyCmd =
      `$paths=@(${pathsList}); ` +
      `foreach($p in $paths){ New-Item -Path $p -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path $p -Name MSISupported -Value 1 -Type DWord -Force }; exit 0`;
    try {
      await runPowerShell(applyCmd);
    } catch (e) {
      return { ok: false, commandsRun: [applyCmd], message: e.message, errorCode: 'exec_failed' };
    }

    // 5. Verify: count devices now with MSISupported = 1
    const verifyScript =
      `$paths=@(${pathsList}); $c=0; ` +
      `foreach($p in $paths){ $v=(Get-ItemProperty -Path $p -Name MSISupported -EA SilentlyContinue).MSISupported; if($v -eq 1){$c++} }; ` +
      `Write-Output $c`;
    const verifyRaw  = await queryPowerShell(verifyScript);
    const okCount    = parseInt(verifyRaw, 10) || 0;
    const verified   = okCount > 0;

    return {
      ok:             verified,
      commandsRun:    [applyCmd],
      verified,
      message:        verified
        ? `PCI MSI Mode enabled for ${okCount}/${backupDevices.length} device(s).`
        : 'Verification failed — MSISupported = 1 could not be confirmed for any device.',
      rebootRequired: true,
      devicesTotal:   backupDevices.length,
      devicesApplied: okCount,
    };

  } else {
    // Revert — restore each device to its original state from backup
    let backup = null;
    try { backup = JSON.parse(fs_.readFileSync(PCI_MSI_BACKUP_FILE, 'utf8')); } catch (_) {}

    if (!backup || !Array.isArray(backup.devices) || backup.devices.length === 0) {
      return { ok: false, commandsRun: [], message: 'Revert backup unavailable — original PCI MSI state was not captured.', errorCode: 'no_backup' };
    }

    // Build per-device revert command (restore or remove, depending on pre-apply state)
    const revertParts = backup.devices.map(d => {
      if (d.msiSupportedExisted && d.originalMsiValue !== null) {
        return `Set-ItemProperty -Path "${d.registryPath}" -Name MSISupported -Value ${d.originalMsiValue} -Type DWord -Force -EA SilentlyContinue`;
      } else {
        return `Remove-ItemProperty -Path "${d.registryPath}" -Name MSISupported -EA SilentlyContinue`;
      }
    });
    const revertCmd = revertParts.join('; ') + '; exit 0';

    try {
      await runPowerShell(revertCmd);
    } catch (e) {
      return { ok: false, commandsRun: [revertCmd], message: e.message, errorCode: 'exec_failed' };
    }

    // Verify revert: devices that originally had MSI absent or 0 should not have MSI = 1
    const shouldNotHaveMsi = backup.devices.filter(d => !d.msiSupportedExisted || d.originalMsiValue !== 1);
    let verified = true;
    if (shouldNotHaveMsi.length > 0) {
      const chkPaths = shouldNotHaveMsi.map(d => `"${d.registryPath}"`).join(',');
      const chkScript =
        `$paths=@(${chkPaths}); $still=0; ` +
        `foreach($p in $paths){ $v=(Get-ItemProperty -Path $p -Name MSISupported -EA SilentlyContinue).MSISupported; if($v -eq 1){$still++} }; ` +
        `Write-Output $still`;
      const chkRaw  = await queryPowerShell(chkScript);
      const stillSet = parseInt(chkRaw, 10) || 0;
      verified = stillSet === 0;
    }

    return {
      ok:             verified,
      commandsRun:    [revertCmd],
      verified,
      message:        verified
        ? `PCI MSI Mode reverted for ${backup.devices.length} device(s).`
        : 'Revert verification failed — some devices may still have MSISupported = 1.',
      rebootRequired: true,
    };
  }
}

// ─── GPU MSI Mode — main handler ──────────────────────────────────────────────
async function executeGpuMsiMode(action, options) {
  const fs_   = require('fs');
  const path_ = require('path');
  const { GPU_MSI_BACKUP_FILE } = require('./user-data-paths');

  if (action === 'apply') {
    // Scan for compatible GPUs
    const gpus = await scanCompatibleGpus();
    if (gpus.length === 0) {
      return { ok: false, commandsRun: [], message: 'Compatible physical GPU not found — no eligible display adapter detected.', errorCode: 'no_compatible_gpu' };
    }

    // Determine target GPU
    let targetGpu = null;
    const requestedId = options && options.deviceInstanceId;
    if (requestedId) {
      targetGpu = gpus.find(g => g.deviceInstanceId === requestedId) || null;
      if (!targetGpu) {
        return { ok: false, commandsRun: [], message: `GPU registry path could not be resolved — requested device "${requestedId}" not found among compatible adapters.`, errorCode: 'gpu_not_found' };
      }
    } else if (gpus.length === 1) {
      targetGpu = gpus[0];
    } else {
      // Multiple GPUs, selection required
      return { ok: false, needsGpuSelection: true, availableGpus: gpus, commandsRun: [], message: 'Multiple GPUs require selection — please choose which adapter to enable MSI Mode for.', errorCode: 'needs_gpu_selection' };
    }

    const { name: gpuName, vendor, deviceInstanceId, registryPath } = targetGpu;
    const psRegPath = registryPath;

    // Verify the exact adapter registry node and interrupt management structure exist
    const structCheck = await queryPowerShell(
      `$p = "${psRegPath}"; ` +
      `if (Test-Path $p) { 'EXISTS' } else { 'MISSING' }`
    );

    let msiSupportedExisted = false;
    let originalMsiValue    = null;

    if (structCheck === 'EXISTS') {
      // Read current MSISupported value
      const msiRaw = await queryPowerShell(
        `$p = "${psRegPath}"; ` +
        `$v = Get-ItemProperty -Path $p -Name MSISupported -EA SilentlyContinue; ` +
        `if ($null -ne $v) { "$($v.MSISupported)" } else { '__ABSENT__' }`
      );
      if (msiRaw === '__ABSENT__' || msiRaw === null) {
        msiSupportedExisted = false;
        originalMsiValue    = null;
      } else {
        msiSupportedExisted = true;
        originalMsiValue    = parseInt(msiRaw.trim(), 10);
        if (isNaN(originalMsiValue)) {
          return { ok: false, commandsRun: [], message: 'MSI mode not supported by this adapter — MSISupported registry value has unexpected type.', errorCode: 'unsupported_adapter' };
        }
      }
    } else {
      // Registry node missing — create the path hierarchy and proceed
      msiSupportedExisted = false;
      originalMsiValue    = null;
    }

    // Save backup
    const backup = { deviceInstanceId, gpuName, vendor, registryPath, msiSupportedExisted, originalMsiValue, savedAt: new Date().toISOString() };
    try {
      const dir = path_.dirname(GPU_MSI_BACKUP_FILE);
      if (!fs_.existsSync(dir)) fs_.mkdirSync(dir, { recursive: true });
      const tmp = GPU_MSI_BACKUP_FILE + '.tmp';
      fs_.writeFileSync(tmp, JSON.stringify(backup, null, 2));
      fs_.renameSync(tmp, GPU_MSI_BACKUP_FILE);
    } catch (e) {
      console.warn('[GpuMsiMode] backup write failed:', e.message);
      return { ok: false, commandsRun: [], message: 'Original value could not be backed up — aborting to keep rollback available.', errorCode: 'backup_failed' };
    }

    // Apply MSISupported = 1
    const applyCmd = `New-Item -Path "${psRegPath}" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "${psRegPath}" -Name MSISupported -Value 1 -Type DWord -Force; exit 0`;
    try {
      await runPowerShell(applyCmd);
    } catch (e) {
      return { ok: false, commandsRun: [applyCmd], message: e.message, errorCode: 'exec_failed' };
    }

    // Verify
    const verifyRaw = await queryPowerShell(
      `$v = Get-ItemProperty -Path "${psRegPath}" -Name MSISupported -EA SilentlyContinue; ` +
      `if ($null -ne $v -and $v.MSISupported -is [int] -and $v.MSISupported -eq 1) { 'OK' } else { 'FAIL' }`
    );
    const verified = verifyRaw === 'OK';

    return {
      ok: verified,
      commandsRun: [applyCmd],
      verified,
      message: verified
        ? `GPU MSI Mode enabled for ${gpuName}.`
        : `Verification failed — MSISupported was not confirmed at ${psRegPath}`,
      rebootRequired: true,
      gpuName,
      vendor,
      deviceInstanceId,
      registryPath,
    };
  } else {
    // Revert
    let backup = null;
    try {
      const raw = fs_.readFileSync(GPU_MSI_BACKUP_FILE, 'utf8');
      backup = JSON.parse(raw);
    } catch (_) {}

    if (!backup || !backup.deviceInstanceId || !backup.registryPath) {
      return { ok: false, commandsRun: [], message: 'Revert backup unavailable — original GPU MSI state was not captured.', errorCode: 'no_backup' };
    }

    const { deviceInstanceId, gpuName, vendor, registryPath, msiSupportedExisted, originalMsiValue } = backup;
    let revertCmd;

    if (msiSupportedExisted) {
      // Restore the original value
      revertCmd = `Set-ItemProperty -Path "${registryPath}" -Name MSISupported -Value ${originalMsiValue} -Type DWord -Force; exit 0`;
    } else {
      // SwitchControl created the value — remove only MSISupported, never parent keys
      revertCmd = `Remove-ItemProperty -Path "${registryPath}" -Name MSISupported -EA SilentlyContinue; exit 0`;
    }

    try {
      await runPowerShell(revertCmd);
    } catch (e) {
      return { ok: false, commandsRun: [revertCmd], message: e.message, errorCode: 'exec_failed' };
    }

    // Verify revert
    let verified = false;
    if (msiSupportedExisted) {
      const checkRaw = await queryPowerShell(
        `$v = Get-ItemProperty -Path "${registryPath}" -Name MSISupported -EA SilentlyContinue; ` +
        `if ($null -ne $v -and $v.MSISupported -eq ${originalMsiValue}) { 'OK' } else { 'FAIL' }`
      );
      verified = checkRaw === 'OK';
    } else {
      const checkRaw = await queryPowerShell(
        `$v = Get-ItemProperty -Path "${registryPath}" -Name MSISupported -EA SilentlyContinue; ` +
        `if ($null -eq $v) { 'OK' } else { 'FAIL' }`
      );
      verified = checkRaw === 'OK';
    }

    return {
      ok: verified,
      commandsRun: [revertCmd],
      verified,
      message: verified
        ? `GPU MSI Mode reverted for ${gpuName}.`
        : `Revert verification failed — MSISupported state not confirmed at ${registryPath}`,
      rebootRequired: true,
      gpuName,
      vendor,
      deviceInstanceId,
    };
  }
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

  if (tweak._special === 'timer-res') {
    const isRunning = !!((_timerResProcess) && !_timerResProcess.killed);
    logTweakSupport(tweakId, true, 'persistent PowerShell agent', { osRelease: osVer, helperFound: isRunning });
    return { isApplied: isRunning, verified: true };
  }

  // ── Maximum CPU Responsiveness ────────────────────────────────────────────────
  if (tweakId === 'maximum-cpu-responsiveness') {
    try {
      // Detect active scheme GUID
      const schemeRaw = await queryPowerShell(
        `$s = (powercfg /getactivescheme 2>&1 | Out-String).Trim(); ` +
        `if ($s -match 'GUID:\\s*([0-9a-fA-F-]{36})') { $matches[1] } else { '' }`
      );
      if (!schemeRaw || schemeRaw.trim().length < 36) {
        return { isApplied: false, verified: false, error: 'Active power scheme could not be detected.' };
      }
      const guid = schemeRaw.trim();
      // Read via full setting GUIDs directly from the registry — more reliable than
      // powercfg /query alias which fails on AMD/OEM custom schemes (Win 11 24H2).
      // Registry is case-insensitive on Windows so any GUID casing works.
      const SUB = '54533251-82be-4824-96c1-47b60b740d00';
      const CPM = '3b04d4fd-1cc7-4f23-ab1c-d1337819c4bb';
      const PBM = 'be337238-0d82-4146-a960-4f3749d470c7';
      const readReg = (settingGuid) =>
        `$v=(Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSchemes\\${guid}\\${SUB}\\${settingGuid}" -Name ACSettingIndex -EA SilentlyContinue).ACSettingIndex; ` +
        `if ($null -ne $v) { [int]$v } else { ` +
        // Alias-based fallback for schemes that do expose it
        `$raw=(powercfg /query "${guid}" SUB_PROCESSOR ${settingGuid === CPM ? 'CPMINCORES' : 'PERFBOOSTMODE'} 2>&1 | Out-String); ` +
        `if ($raw -match 'Current AC Power Setting Index:\\s*0x([0-9a-fA-F]+)') { [Convert]::ToInt64($matches[1],16) } else { '' } }`;
      const cpMinRaw = await queryPowerShell(readReg(CPM));
      const pbmRaw   = await queryPowerShell(readReg(PBM));

      // Check our own apply-marker as well (written on apply, cleared on revert)
      const markerRaw = await queryPowerShell(
        `(Get-ItemProperty "HKLM:\\SOFTWARE\\SwitchControl" -Name "CPUCStatesApplied" -EA SilentlyContinue).CPUCStatesApplied`
      );
      const markerApplied = markerRaw !== null && markerRaw.trim() === '1';

      const cpMinVal = cpMinRaw !== null ? cpMinRaw.trim() : '';
      const pbmVal   = pbmRaw   !== null ? pbmRaw.trim()   : '';
      const settingsReadable = cpMinVal !== '' && pbmVal !== '';

      if (settingsReadable) {
        logTweakSupport(tweakId, true, 'CPU C-States settings readable via registry', { osRelease: osVer });
        const isApplied = (cpMinVal === '100' && pbmVal === '2') || markerApplied;
        return { isApplied, verified: true };
      }
      // Settings not in registry yet — rely on marker only; allow apply to proceed
      logTweakSupport(tweakId, true, 'CPU C-States registry keys absent — will be created on apply', { osRelease: osVer });
      return { isApplied: markerApplied, verified: true };
    } catch (e) {
      return { isApplied: false, verified: false, error: e.message };
    }
  }

  // ── PCIe Link State Power Management ───────────────────────────────────────
  if (tweakId === 'pcie-link-state') {
    try {
      const current = await readPowerSettingIndices(
        '501a4d13-42af-4429-9fd1-a8218c268e20',
        'ee12f906-d277-404b-b6da-e5fa1a576df5'
      );
      if (isPowerSettingMissing(current.raw)) {
        const reason = 'Power setting not found — PCIe Link State GUID is not available in the current power scheme';
        logTweakSupport(tweakId, false, reason, { osRelease: osVer, helperFound: false });
        return { isApplied: false, unsupported: true, unsupportedReason: reason };
      }
      return { isApplied: current.ac === 0, verified: true };
    } catch (e) {
      return { isApplied: false, verified: false, error: e.message };
    }
  }

  // ── GPU Hardware Scheduling / Preemption ────────────────────────────────────
  if (tweakId === 'preemption') {
    try {
      const raw = await queryPowerShell(
        '(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" -Name HwSchMode -EA SilentlyContinue).HwSchMode'
      );
      return { isApplied: raw !== null && raw.trim() === '2', verified: true, requiresRestart: true };
    } catch (e) {
      return { isApplied: false, verified: false, error: e.message };
    }
  }

  // ── GPU MSI Mode ──────────────────────────────────────────────────────────────
  if (tweakId === 'gpu-msi-mode') {
    try {
      const { GPU_MSI_BACKUP_FILE } = require('./user-data-paths');
      const fs_ = require('fs');
      // Without a backup we cannot know which GPU was targeted, so isApplied = false
      if (!fs_.existsSync(GPU_MSI_BACKUP_FILE)) {
        return { isApplied: false, verified: true };
      }
      let backup = null;
      try { backup = JSON.parse(fs_.readFileSync(GPU_MSI_BACKUP_FILE, 'utf8')); } catch (_) {}
      if (!backup || !backup.registryPath) {
        return { isApplied: false, verified: true };
      }
      const checkRaw = await queryPowerShell(
        `$v = Get-ItemProperty -Path "${backup.registryPath}" -Name MSISupported -EA SilentlyContinue; ` +
        `if ($null -ne $v -and $v.MSISupported -is [int] -and $v.MSISupported -eq 1) { 'APPLIED' } else { 'NOT_APPLIED' }`
      );
      logTweakSupport(tweakId, true, 'GPU MSI backup and registry path available', { osRelease: osVer });
      return { isApplied: checkRaw === 'APPLIED', verified: true, requiresRestart: true, gpuName: backup.gpuName };
    } catch (e) {
      return { isApplied: false, verified: false, error: e.message };
    }
  }

  // ── Disable Windows VBS ───────────────────────────────────────────────────────
  if (tweakId === 'vbs') {
    try {
      const { VBS_BACKUP_FILE } = require('./user-data-paths');
      const fs_ = require('fs');
      const checkRaw = await queryPowerShell(
        `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard" -Name "EnableVirtualizationBasedSecurity" -EA SilentlyContinue).EnableVirtualizationBasedSecurity`
      );
      const val = checkRaw !== null ? checkRaw.trim() : null;
      const isApplied = val === '0';
      logTweakSupport(tweakId, true, 'DeviceGuard registry readable', { osRelease: osVer, evbs: val });
      return { isApplied, verified: true, requiresRestart: true, backupExists: fs_.existsSync(VBS_BACKUP_FILE) };
    } catch (e) {
      return { isApplied: false, verified: false, error: e.message };
    }
  }

  // ── PCI MSI Mode ──────────────────────────────────────────────────────────────
  if (tweakId === 'pci-msi-mode') {
    try {
      const { PCI_MSI_BACKUP_FILE } = require('./user-data-paths');
      const fs_ = require('fs');
      if (!fs_.existsSync(PCI_MSI_BACKUP_FILE)) {
        return { isApplied: false, verified: true };
      }
      let backup = null;
      try { backup = JSON.parse(fs_.readFileSync(PCI_MSI_BACKUP_FILE, 'utf8')); } catch (_) {}
      if (!backup || !Array.isArray(backup.devices) || backup.devices.length === 0) {
        return { isApplied: false, verified: true };
      }
      // isApplied = true if at least one backed-up device currently has MSISupported = 1
      const pathsList = backup.devices.map(d => `"${d.registryPath}"`).join(',');
      const checkScript =
        `$paths=@(${pathsList}); $c=0; ` +
        `foreach($p in $paths){ $v=(Get-ItemProperty -Path $p -Name MSISupported -EA SilentlyContinue).MSISupported; if($v -eq 1){$c++} }; ` +
        `Write-Output $c`;
      const checkRaw     = await queryPowerShell(checkScript);
      const appliedCount = parseInt(checkRaw, 10) || 0;
      logTweakSupport(tweakId, true, 'PCI MSI backup available', { osRelease: osVer, appliedCount, total: backup.devices.length });
      return { isApplied: appliedCount > 0, verified: true, requiresRestart: true, devicesApplied: appliedCount };
    } catch (e) {
      return { isApplied: false, verified: false, error: e.message };
    }
  }

  if (tweak._special === 'nvidia-telemetry') {
    const hasNv = await checkPowerShell("(Get-CimInstance Win32_VideoController -EA SilentlyContinue | Where-Object { $_.Name -like '*NVIDIA*' }) -ne $null");
    if (!hasNv) {
      logTweakSupport(tweakId, false, 'No NVIDIA GPU detected', { osRelease: osVer, helperFound: false });
      return { isApplied: false, unsupported: true, message: 'No NVIDIA GPU detected.' };
    }

    // Modern NVIDIA drivers (post-500 series) removed legacy telemetry components.
    // If no tasks AND no service exist, the tweak is unsupported on this system.
    const hasComponents = await checkPowerShell(
      `$tasks = Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskName -like "NvTm*" -or $_.TaskName -like "NvNode*" -or $_.TaskName -like "NvProfile*" }; $svc = Get-Service -Name NvTelemetryContainer -EA SilentlyContinue; ($tasks.Count -gt 0) -or ($null -ne $svc)`
    );
    if (!hasComponents) {
      logTweakSupport(tweakId, false, 'Legacy NVIDIA telemetry components not present (modern driver)', { osRelease: osVer, helperFound: true });
      return { isApplied: false, unsupported: true, message: 'Legacy NVIDIA telemetry components are not present on this system (modern driver).' };
    }

    logTweakSupport(tweakId, true, 'NVIDIA GPU present', { osRelease: osVer, helperFound: true });
    // "Applied" means: legacy telemetry components exist AND are disabled.
    const applied = await checkPowerShell(
      `$tasks = Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskName -like "NvTm*" -or $_.TaskName -like "NvNode*" -or $_.TaskName -like "NvProfile*" }; $svc = Get-Service -Name NvTelemetryContainer -EA SilentlyContinue; if ($tasks.Count -eq 0 -and $null -eq $svc) { $false } elseif ($tasks.Count -gt 0) { ($tasks | Where-Object { $_.State -ne "Disabled" }).Count -eq 0 } else { $svc.StartType -eq "Disabled" }`
    );
    return { isApplied: applied, verified: true };
  }

  // USB Selective Suspend — runtime probe: verify the power setting GUID actually
  // exists in the current power scheme before trying the boolean check.
  // On VMs or headless builds powercfg may not expose the USB sub-group.
  if (tweakId === 'usb-selective-suspend') {
    const current = await readPowerSettingIndices(
      '2a737441-1930-4402-8d77-b2bebba308a3',
      '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'
    );
    if (isPowerSettingMissing(current.raw)) {
      const reason = 'Power setting not found — USB Selective Suspend GUID is not available in the current power scheme';
      logTweakSupport(tweakId, false, reason, { osRelease: osVer, helperFound: false });
      return { isApplied: false, unsupported: true, unsupportedReason: reason };
    }
    logTweakSupport(tweakId, true, 'powercfg USB setting present', { osRelease: osVer, helperFound: true });
    return { isApplied: current.ac === 0, verified: true };
  }

  // wifi: return unsupported when WlanSvc doesn't exist (no Wi-Fi adapter).
  // Without this guard, the check PS fails with exit 1, which classifyErrorMessage
  // maps to 'not_found' — the UI shows "Not Supported" but unsupported:true is never
  // set, so the correct "not supported on this system" badge is never rendered.
  if (tweakId === 'wifi') {
    try {
      const exists = await checkPowerShell(`$null -ne (Get-Service -Name WlanSvc -EA SilentlyContinue)`);
      if (!exists) {
        return { isApplied: false, unsupported: true, unsupportedReason: 'WlanSvc not present — no Wi-Fi adapter detected on this system.' };
      }
    } catch { /* fall through to standard check */ }
  }

  try {
    const applied = await checkPowerShell(tweak.check);
    return { isApplied: applied, verified: true };
  } catch (e) {
    return { isApplied: false, verified: false, error: e.message };
  }
}

async function executeTweak(tweakId, action, options = {}) {
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

  // 2.5. wifi: pre-check for WlanSvc before attempting apply/revert.
  // Prevents a generic "not found" error from reaching the user; returns a
  // proper unsupported result with the correct badge in the UI instead.
  if (tweakId === 'wifi') {
    try {
      const wlanExists = await checkPowerShell(`$null -ne (Get-Service -Name WlanSvc -EA SilentlyContinue)`);
      if (!wlanExists) {
        const reason = 'WlanSvc not present — no Wi-Fi adapter detected on this system.';
        const result = enrichFailure({
          success: false,
          unsupported: true,
          unsupportedReason: reason,
          commandsRun: [],
          requiresReboot: false,
          requiresAdmin: false,
          error: null,
          message: reason,
          hint: reason,
        }, 'unsupported');
        logEntry({ tweakId, action, result, ms: Date.now() - startTime });
        return result;
      }
    } catch { /* proceed — WlanSvc check failure is non-fatal */ }
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

      // NOTE: Do NOT set _isAdmin = true here. Per-action elevation only elevates
      // the child PowerShell process, not the host process. Caching true would
      // cause the next admin tweak to skip runElevated and run in the non-elevated
      // host process instead — causing access denied failures on HKLM writes.

      // Elevated command succeeded — verify state (with one retry after 750 ms)
      const expectedApplied = action === 'apply';
      let verification = await verifyTweak(tweakId);
      console.log(`[TweakExecutor:VERIFY] ${tweakId} attempt=1 expected=${expectedApplied} isApplied=${verification.isApplied} verified=${verification.verified}`);

      if (verification.isApplied !== expectedApplied) {
        console.log(`[TweakExecutor:VERIFY] ${tweakId} mismatch on attempt 1 — retrying in 750 ms`);
        await sleep(750);
        verification = await verifyTweak(tweakId);
        console.log(`[TweakExecutor:VERIFY] ${tweakId} attempt=2 expected=${expectedApplied} isApplied=${verification.isApplied} verified=${verification.verified}`);
      }

      if (verification.isApplied === expectedApplied) {
        await _updateState(state => { state.tweaks[tweakId] = expectedApplied; });
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
      } else if (!verification.verified) {
        // Check script itself was inconclusive after retry — trust the apply command, persist state
        await _updateState(state => { state.tweaks[tweakId] = expectedApplied; });
        console.log(`[TweakExecutor:VERIFY] ${tweakId} — inconclusive after retry (verified=false); trusting elevated command`);
        const result = {
          success:               true,
          verified:              false,
          verificationInconclusive: true,
          failureType:           null,
          userMessage:           null,
          hint:                  null,
          requiresReboot:        tweak.requiresReboot || false,
          requiresAdmin:         true,
          commandsRun,
          message:               `${tweak.name} ${expectedApplied ? 'applied' : 'reverted'} — command succeeded but state could not be read back.`,
          error:                 null,
        };
        logEntry({ tweakId, action, verificationResult: verification, result, ms: Date.now() - startTime });
        return result;
      } else {
        const policyLocked = await checkPolicyLock(tweakId);
        const fType = policyLocked ? 'blocked_by_policy' : 'verification_failed';
        console.log(`[TweakExecutor:VERIFY] ${tweakId} — definite mismatch after retry. expected=${expectedApplied} isApplied=${verification.isApplied} policyLocked=${policyLocked}`);
        const result = enrichFailure({
          success:        false,
          verified:       true,
          requiresReboot: tweak.requiresReboot || false,
          requiresAdmin:  true,
          commandsRun,
          message:        null,
          error:          policyLocked
            ? 'System state unchanged — a Windows Group Policy is blocking this change.'
            : `Elevated command ran but system state did not change. expected=${expectedApplied} detected=${verification.isApplied}`,
        }, fType);
        logEntry({ tweakId, action, verificationResult: verification, policyLocked, result, ms: Date.now() - startTime });
        return result;
      }
    }
  }

  // 4. Special-case handlers
  if (tweak._special === 'timer-res') {
    try {
      let ok = false;
      let message = '';
      if (action === 'apply') {
        ok = _startTimerResAgent();
        message = ok
          ? 'Timer resolution set to 0.5ms — persistent agent running.'
          : 'Failed to start timer resolution agent. Check that PowerShell is available.';
      } else {
        _stopTimerResAgent();
        ok = true;
        message = 'Timer resolution agent stopped — resolution returned to default.';
      }
      const result = {
        success:        ok,
        unsupported:    false,
        requiresReboot: false,
        requiresAdmin:  false,
        commandsRun:    ['[timer-res agent] ' + (action === 'apply' ? 'spawn powershell.exe NtSetTimerResolution(5000)' : 'kill agent')],
        message,
        error:          ok ? null : message,
      };
      logEntry({ tweakId, action, result, ms: Date.now() - startTime });
      return result;
    } catch (err) {
      const result = {
        success: false, unsupported: false, requiresReboot: false, requiresAdmin: false,
        commandsRun: [], message: null, error: err.message,
      };
      logEntry({ tweakId, action, result, ms: Date.now() - startTime });
      return result;
    }
  }

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

  if (tweak._special === 'maximum-cpu-responsiveness') {
    try {
      const res = await executeMaxCpuResponsiveness(action);
      if (!res.ok && res.needsGpuSelection) {
        // Should not happen for this tweak, but guard anyway
        const r = enrichFailure({
          success: false, unsupported: false, requiresReboot: false, requiresAdmin: true,
          commandsRun: res.commandsRun || [], message: res.message || null, error: res.message || 'Unexpected selection required.',
        }, 'unknown');
        logEntry({ tweakId, action, result: r, ms: Date.now() - startTime });
        return r;
      }
      const result = {
        success:        res.ok,
        unsupported:    !!(res.unsupported || res.errorCode === 'unsupported_setting'),
        requiresReboot: false,
        requiresAdmin:  true,
        commandsRun:    res.commandsRun || [],
        message:        res.message || null,
        error:          res.ok ? null : (res.message || 'Maximum CPU Responsiveness operation failed'),
        verified:       res.ok,
      };
      if (!res.ok && !result.unsupported) {
        enrichFailure(result, res.errorCode === 'no_backup' ? 'verification_failed' : 'unknown');
      }
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

  if (tweak._special === 'pcie-link-state') {
    try {
      const res = await executePcieLinkState(action);
      const result = {
        success:        res.ok,
        unsupported:    !!res.unsupported,
        requiresReboot: false,
        requiresAdmin:  true,
        commandsRun:    res.commandsRun || [],
        message:        res.message || null,
        error:          res.ok ? null : (res.message || 'PCIe Link State operation failed'),
        verified:       res.ok,
      };
      if (!res.ok && !result.unsupported) {
        enrichFailure(result, res.errorCode === 'backup_failed' ? 'verification_failed' : 'unknown');
      }
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

  if (tweak._special === 'usb-selective-suspend') {
    try {
      const res = await executeUsbSelectiveSuspend(action);
      const result = {
        success:        res.ok,
        unsupported:    !!res.unsupported,
        requiresReboot: false,
        requiresAdmin:  true,
        commandsRun:    res.commandsRun || [],
        message:        res.message || null,
        error:          res.ok ? null : (res.message || 'USB Selective Suspend operation failed'),
        verified:       res.ok,
      };
      if (!res.ok && !result.unsupported) {
        enrichFailure(result, res.errorCode === 'backup_failed' ? 'verification_failed' : 'unknown');
      }
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

  if (tweak._special === 'preemption') {
    try {
      const res = await executePreemption(action);
      const result = {
        success:        res.ok,
        unsupported:    !!res.unsupported,
        requiresReboot: true,
        requiresAdmin:  true,
        commandsRun:    res.commandsRun || [],
        message:        res.message || null,
        error:          res.ok ? null : (res.message || 'GPU Hardware Scheduling operation failed'),
        verified:       res.ok,
      };
      if (!res.ok && !result.unsupported) {
        enrichFailure(result, res.errorCode === 'backup_failed' ? 'verification_failed' : 'unknown');
      }
      logEntry({ tweakId, action, result, ms: Date.now() - startTime });
      return result;
    } catch (err) {
      const result = {
        success: false, unsupported: false, requiresReboot: true, requiresAdmin: true,
        commandsRun: [], message: null, error: err.message,
      };
      logEntry({ tweakId, action, result, ms: Date.now() - startTime });
      return result;
    }
  }

  if (tweak._special === 'vbs') {
    try {
      const res = await executeVbs(action);
      const result = {
        success:        res.ok,
        unsupported:    false,
        requiresReboot: true,
        requiresAdmin:  true,
        commandsRun:    res.commandsRun || [],
        message:        res.message || null,
        error:          res.ok ? null : (res.message || 'VBS operation failed'),
        verified:       res.ok,
      };
      if (!res.ok) enrichFailure(result, res.errorCode === 'backup_failed' ? 'verification_failed' : 'unknown');
      logEntry({ tweakId, action, result, ms: Date.now() - startTime });
      return result;
    } catch (err) {
      const result = {
        success: false, unsupported: false, requiresReboot: true, requiresAdmin: true,
        commandsRun: [], message: null, error: err.message,
      };
      logEntry({ tweakId, action, result, ms: Date.now() - startTime });
      return result;
    }
  }

  if (tweak._special === 'pci-msi-mode') {
    try {
      const res = await executePciMsiMode(action);
      const result = {
        success:        res.ok,
        unsupported:    !!(res.errorCode === 'no_devices'),
        requiresReboot: true,
        requiresAdmin:  true,
        commandsRun:    res.commandsRun || [],
        message:        res.message || null,
        error:          res.ok ? null : (res.message || 'PCI MSI Mode operation failed'),
        verified:       res.ok,
      };
      if (!res.ok && !result.unsupported) {
        enrichFailure(result, res.errorCode === 'no_backup' ? 'verification_failed' : 'unknown');
      }
      logEntry({ tweakId, action, result, ms: Date.now() - startTime });
      return result;
    } catch (err) {
      const result = {
        success: false, unsupported: false, requiresReboot: true, requiresAdmin: true,
        commandsRun: [], message: null, error: err.message,
      };
      logEntry({ tweakId, action, result, ms: Date.now() - startTime });
      return result;
    }
  }

  if (tweak._special === 'gpu-msi-mode') {
    try {
      const res = await executeGpuMsiMode(action, options || {});
      if (!res.ok && res.needsGpuSelection) {
        // Return selection-needed info to the caller; not a hard failure
        const r = {
          success: false,
          needsGpuSelection: true,
          availableGpus: res.availableGpus || [],
          unsupported: false,
          requiresReboot: true,
          requiresAdmin: true,
          commandsRun: [],
          message: res.message || null,
          error: null,
          failureType: 'needs_gpu_selection',
          userMessage: 'Multiple display adapters detected. Please choose which GPU to enable MSI Mode for.',
          hint: null,
        };
        logEntry({ tweakId, action, result: r, ms: Date.now() - startTime });
        return r;
      }
      const result = {
        success:        res.ok,
        unsupported:    !!(res.errorCode === 'no_compatible_gpu'),
        requiresReboot: true,
        requiresAdmin:  true,
        commandsRun:    res.commandsRun || [],
        message:        res.message || null,
        error:          res.ok ? null : (res.message || 'GPU MSI Mode operation failed'),
        verified:       res.ok,
      };
      if (!res.ok && !result.unsupported) {
        enrichFailure(result, res.errorCode === 'no_backup' ? 'verification_failed' : 'unknown');
      }
      logEntry({ tweakId, action, result, ms: Date.now() - startTime });
      return result;
    } catch (err) {
      const result = {
        success: false, unsupported: false, requiresReboot: true, requiresAdmin: true,
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
      // Update persisted state (serialised through _updateState to prevent
      // concurrent writes from clobbering each other when two tweaks finish
      // at the same time under MAX_PS_CONCURRENT=2).
      await _updateState(state => { state.tweaks[tweakId] = expectedApplied; });
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

// ── Cache fallback for partial/failed batch results ───────────────────────────

/**
 * When the batch PS script times out, is blocked by AV, or produces unparseable
 * output, `result` only contains unsupported entries + the in-process specials
 * (timer-res, nvidia-telemetry, etc.).  Every standard registry tweak is absent.
 *
 * Without this helper, TweaksList's forEach loop never calls setTweak() for the
 * missing IDs, so the Zustand store stays at its initial-mount default (false)
 * and ALL toggles flip to OFF — even for tweaks that are genuinely applied in
 * the Windows registry.
 *
 * Fix: for any tweak that is NOT already in `result`, read its last-known value
 * from tweak-state.json and inject it as a cache-sourced entry.  This preserves
 * the correct UI state across restarts when PS is unavailable.
 */
function _mergeCacheForMissingTweaks(result) {
  try {
    const cached = loadState().tweaks; // { tweakId: boolean }
    if (!cached || typeof cached !== 'object') return;
    for (const id of Object.keys(ALL_TWEAKS)) {
      if (result[id] !== undefined) continue;        // already resolved — don't overwrite
      if (UNSUPPORTED_TWEAKS[id])   continue;        // unsupported already in result
      const val = cached[id];
      if (typeof val === 'boolean') {
        result[id] = { isApplied: val, applied: val, error: null, fromCache: true };
      }
    }
    const cacheCount = Object.values(result).filter(r => r.fromCache).length;
    if (cacheCount > 0) {
      console.warn(`[batchCheckAllTweaks] batch PS unavailable — injected ${cacheCount} cached tweak state(s) from tweak-state.json`);
    }
  } catch (e) {
    console.error('[batchCheckAllTweaks] _mergeCacheForMissingTweaks failed:', e.message);
  }
}

// ── Batch check — ONE PowerShell invocation for ALL batchable tweaks ──────────
// Replaces 60+ sequential PS launches with a single script written to a temp
// file (avoids the 32 KB command-line length limit) and run with -File.
// Special tweaks (_special property) are resolved in Node, not PS.
// Returns { tweakId: { isApplied, applied, unsupported?, error } }.
async function batchCheckAllTweaks() {
  const os_   = require('os');
  const path_  = require('path');
  const fs_    = require('fs');
  const result = {};

  // 1. Mark UNSUPPORTED_TWEAKS without any PS call.
  for (const [id, reason] of Object.entries(UNSUPPORTED_TWEAKS)) {
    result[id] = { isApplied: false, applied: false, unsupported: true, unsupportedReason: reason, error: null };
  }

  // 2. timer-res: resolved by checking if the persistent agent process is alive.
  const timerResId = Object.keys(ALL_TWEAKS).find(id => ALL_TWEAKS[id]._special === 'timer-res');
  if (timerResId) {
    const isRunning = !!(_timerResProcess && !_timerResProcess.killed);
    result[timerResId] = { isApplied: isRunning, applied: isRunning, error: null };
  }

  // NOTE: nvidia-telemetry was previously resolved here via a live GPU-detection
  // pre-probe, but it is now in UNSUPPORTED_TWEAKS (statically) and is handled
  // by step 1 above.  The probe block has been removed to eliminate two wasteful
  // PowerShell spawns per startup that always returned "unsupported" on modern
  // drivers.  See the UNSUPPORTED_TWEAKS comment for the full rationale.

  // 3b–3h. Special tweaks that can't be batched into the single PS script.
  // Each uses powercfg queries, backup files, or multi-step registry reads.
  //
  // Two improvements over the old sequential awaits:
  //   a) All 7 run in parallel via Promise.all — saves ~2s of serial PS lag on
  //      every startup/status-refresh (each verifyTweak internally spawns 2-4
  //      powershell.exe calls through the semaphore, which now overlap).
  //   b) On error, fall back to cached state (tweak-state.json) instead of
  //      forcing isApplied=false — a transient PS hiccup no longer flips the
  //      flashiest tweaks to OFF while ordinary registry tweaks stay cached.
  const _specialCachedTweaks = loadState().tweaks;

  const SPECIAL_TWEAK_IDS = [
    'maximum-cpu-responsiveness', // 3b
    'pcie-link-state',            // 3c
    'usb-selective-suspend',      // 3d
    'preemption',                 // 3e
    'gpu-msi-mode',               // 3f
    'pci-msi-mode',               // 3g
    'vbs',                        // 3h
  ];

  await Promise.all(
    SPECIAL_TWEAK_IDS
      .filter(id => ALL_TWEAKS[id])
      .map(async (id) => {
        try {
          const r = await verifyTweak(id);
          result[id] = {
            isApplied:         !!r.isApplied,
            applied:           !!r.isApplied,
            unsupported:       r.unsupported       || false,
            unsupportedReason: r.unsupportedReason || null,
            error:             r.error             || null,
          };
        } catch (err) {
          // Transient PS failure — use last-known-good from tweak-state.json so
          // the toggle doesn't flash OFF for a tweak that is genuinely applied.
          const cachedVal = typeof _specialCachedTweaks[id] === 'boolean' ? _specialCachedTweaks[id] : false;
          const hadCache  = typeof _specialCachedTweaks[id] === 'boolean';
          console.warn(`[batchCheckAllTweaks] ${id} verify threw — ${hadCache ? `using cached=${cachedVal}` : 'no cache, defaulting false'}: ${err.message}`);
          result[id] = { isApplied: cachedVal, applied: cachedVal, error: err.message, fromCache: hadCache };
        }
      })
  );

  // 4. Build the batch PS script for all remaining tweaks.
  const batchIds = [];
  const lines    = ['$r = @{}'];
  for (const [id, tweak] of Object.entries(ALL_TWEAKS)) {
    if (tweak._special) continue; // handled above
    if (!tweak.check)  continue;
    batchIds.push(id);
    // Each check is isolated in its own scriptblock scope so variables
    // (e.g. $out, $s, $tasks) do not bleed across checks.
    // [bool]() normalises any truthy output to $true/$false.
    // try/catch ensures a single failing check does not abort the rest.
    lines.push(`try { $r['${id}'] = [bool](& { ${tweak.check} }) } catch { $r['${id}'] = $false }`);
  }

  if (batchIds.length === 0) return result;

  lines.push(`$r | ConvertTo-Json -Compress`);
  const script  = lines.join('\n');
  const tmpFile = path_.join(os_.tmpdir(), `sc_batchcheck_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
  fs_.writeFileSync(tmpFile, script, 'utf8');

  const psId = ++_tweak_psCount;
  const t0   = Date.now();
  console.log(`[PS:tweak-executor] #${psId} batchCheckAll SPAWN ts=${t0} tweaks=${batchIds.length}`);

  try {
    // Wrap in the PS semaphore so batchCheckAllTweaks counts against the
    // MAX_PS_CONCURRENT cap alongside apply/verify calls arriving concurrently.
    const raw = await _withPsSemaphore(() => new Promise((resolve, reject) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', tmpFile],
        { timeout: 45000, windowsHide: true },
        (error, stdout, stderr) => {
          const dur = Date.now() - t0;
          if (error) {
            console.error(`[PS:tweak-executor] #${psId} batchCheckAll FAIL ${dur}ms err="${(stderr || '').trim().slice(0, 200)}"`);
            reject(new Error((stderr || stdout || error.message || '').trim()));
          } else {
            console.log(`[PS:tweak-executor] #${psId} batchCheckAll OK ${dur}ms`);
            resolve(stdout.trim());
          }
        }
      );
    }));

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.error('[batchCheckAllTweaks] JSON parse failed. raw output:', raw.slice(0, 400));
      // PS ran but output was unparseable — fill missing standard tweaks from cache
      // so toggles don't flash OFF for tweaks that are genuinely applied.
      _mergeCacheForMissingTweaks(result);
      return result;
    }

    for (const [id, val] of Object.entries(parsed)) {
      result[id] = { isApplied: !!val, applied: !!val, error: null };
    }
  } catch (err) {
    console.error('[batchCheckAllTweaks] batch PS failed:', err.message);
    // PS timed out or was blocked (e.g. AV flagging hidden powershell.exe).
    // Fill every standard tweak that is missing from result with its last-known
    // value from tweak-state.json so the UI shows the correct cached state
    // instead of flipping all toggles to OFF on every startup where PS is slow.
    _mergeCacheForMissingTweaks(result);
  } finally {
    try { if (fs_.existsSync(tmpFile)) fs_.unlinkSync(tmpFile); } catch (_) {}
  }

  return result;
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
async function executeTweakWithOwnership(tweakId, action, options = {}) {
  const scopeKey = ownershipStore.buildScopeKey('tweak', tweakId);

  // Step 1+2: capture baseline if first time touching this tweak
  const existing = ownershipStore.getOwnershipRecord(scopeKey);
  if (!existing || !existing.baselineCaptured) {
    try {
      const status = await verifyTweak(tweakId);
      // status.isApplied = boolean | undefined; null means inconclusive (transient error)
      const verifySucceeded = !!(status && typeof status.isApplied === 'boolean');
      const previousValue = verifySucceeded ? status.isApplied : null;
      ownershipStore.captureBaseline(scopeKey, {
        itemType:      'tweak',
        itemId:        tweakId,
        previousValue,
        verifySucceeded, // if false, captureBaseline skips the write so a later read can get the real baseline
      });
    } catch (e) {
      console.warn('[TweakExecutor] baseline capture failed for', tweakId, '—', e.message);
    }
  }

  // Step 3: execute
  const result = await executeTweak(tweakId, action, options);

  // Step 4: record ownership only after confirmed success
  if (result.success) {
    ownershipStore.recordApply(scopeKey, {
      appliedValue:      action === 'apply',
      verificationState: result.verified ? 'verified' : 'unverified',
    });
  }

  return result;
}

function isUnsupported(tweakId) {
  return Object.prototype.hasOwnProperty.call(UNSUPPORTED_TWEAKS, tweakId);
}

function getUnsupportedReason(tweakId) {
  return UNSUPPORTED_TWEAKS[tweakId] || null;
}

/**
 * Persist a verified state map { tweakId: boolean } back to tweak-state.json.
 * Called after startup batchCheckAll so the local cache reflects real Windows
 * state; subsequent cold starts read accurate values without waiting for a
 * fresh batchCheck.
 */
function saveVerifiedState(stateMap) {
  try {
    if (!stateMap || typeof stateMap !== 'object') return { ok: false, error: 'invalid stateMap' };
    const state = loadState();
    for (const [id, val] of Object.entries(stateMap)) {
      if (typeof val === 'boolean') {
        state.tweaks[id] = val;
      }
    }
    saveState(state);
    return { ok: true };
  } catch (e) {
    console.error('[TweakExecutor] saveVerifiedState failed:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  executeTweak,
  executeTweakWithOwnership,
  checkTweakStatus,
  batchCheckAllTweaks,
  verifyTweak,
  getLocalState,
  saveVerifiedState,
  getTweakInfo,
  getExecutionLog,
  isUnsupported,
  getUnsupportedReason,
  cleanupTimerResProcess,
  scanCompatibleGpus,
  ALL_TWEAKS,
  HKCU_TWEAKS,
  ADMIN_TWEAKS,
  UNSUPPORTED_TWEAKS,
  audioGuardCheck,
  networkGuardPre,
  networkGuardPost,
};
