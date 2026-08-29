/**
 * debloat-helper.js
 * Real Windows debloat IPC handlers.
 * All actions use PowerShell. Registry, AppX, and Service methods only.
 * Windows-only. Returns { ok: false } on non-Windows.
 *
 * v1.0.2 — Uninstall pipeline hardened:
 *  - Proper uninstall string parsing (handles unquoted paths with spaces)
 *  - Direct spawn() instead of PS Start-Process (eliminates quoting issues)
 *  - Post-uninstall registry verification
 *  - WindowsInstaller flag captured in scan for reliable MSI detection
 *  - Rich structured result with methodUsed, executable, exitCode, errorDetail
 *
 * v1.0.3 — Icon resolution fixed:
 *  - resolveIconPath's InstallLocation scan is now recursive (bounded depth
 *    and file count). Previously only the top-level folder was scanned, so
 *    any app whose real exe lives in a subfolder (bin\, app-1.2.3\, etc. —
 *    common for Inno Setup / NSIS / Electron installs) silently fell through
 *    to the uninstall-string-derived exe, which is usually a generic
 *    uninstaller stub with no custom icon resource — producing Windows'
 *    default exe icon instead of the real app logo.
 */
const { ipcMain, shell, app: electronApp } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const psLimiter = require('./powershell-limiter');
const { runElevated } = require('./ps-shared');
// ── Icon utilities (single source in file-icon.js) ────────────────────────────
// resolveIconPath, collectExeFilesRecursive, expandEnvVars, and the EXE_SCAN_*
// constants now live in file-icon.js so they can be reused by any future caller
// without pulling in debloat-helper.js's full scan/uninstall pipeline.
// getAppIconDataUrl (below) continues to own its own appId-keyed cache and is
// the only path through which Installed Apps resolves icons — unchanged.
const {
  expandEnvVars,
  EXE_SCAN_MAX_DEPTH, EXE_SCAN_MAX_FILES, EXE_SCAN_SKIP_DIRS,
  collectExeFilesRecursive,
  resolveIconPath,
} = require('./file-icon');
// ── Icon cache ────────────────────────────────────────────────────────────────
// Persistent cache in userData (survives app restarts, unlike os.tmpdir).
// Falls back to tmpdir if userData isn't available (very early startup).
// Keyed by appId (not sha1-of-path like file-icon.js uses) — no collision.
function getIconCacheDir() {
  try {
    return path.join(electronApp.getPath('userData'), 'icon-cache');
  } catch {
    return path.join(os.tmpdir(), 'switchcontrol-icon-cache');
  }
}
let _lastScanApps = new Map(); // id -> app (for lazy icon resolution)
async function getAppIconDataUrl(appId, app) {
  const cacheDir = getIconCacheDir();
  if (!fs.existsSync(cacheDir)) {
    try { fs.mkdirSync(cacheDir, { recursive: true }); } catch {}
  }
  const cacheFile = path.join(cacheDir, `${appId}.png`);
  if (fs.existsSync(cacheFile)) {
    return `data:image/png;base64,${fs.readFileSync(cacheFile).toString('base64')}`;
  }
  const iconPath = resolveIconPath(app);
  if (!iconPath) return null;
  try {
    // 'large' gives 32×32 on most systems; use it for crispier icons
    const img = await shell.getFileIcon(iconPath, { size: 'large' });
    if (!img || img.isEmpty()) return null;
    const buf = img.toPNG();
    try { fs.writeFileSync(cacheFile, buf); } catch {}
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch (e) {
    console.warn('[InstalledApps] getFileIcon failed for', iconPath, e.message);
    return null;
  }
}
// ── Input validation helpers ─────────────────────────────────────────────────
function psEscape(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/'/g, "''");
}
const SAFE_REG_PATH_RE   = /^HK(CU|LM):\\[A-Za-z0-9\s._-]+(\\[A-Za-z0-9\s._-]+)*$/;
const SAFE_REG_NAME_RE   = /^[A-Za-z0-9\s._-]{1,64}$/;
const SAFE_PACKAGE_RE    = /^[A-Za-z0-9._-]{1,128}$/;
const SAFE_SERVICE_RE    = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_TASK_PATH_RE  = /^(\\[A-Za-z0-9\s._-]+)+$/;
const MAX_STR_LEN        = 512;
function isSafeRegPath(v)     { return typeof v === 'string' && v.length <= MAX_STR_LEN && SAFE_REG_PATH_RE.test(v); }
function isSafeRegName(v)     { return typeof v === 'string' && v.length <= MAX_STR_LEN && SAFE_REG_NAME_RE.test(v); }
function isSafePackageName(v) { return typeof v === 'string' && v.length <= MAX_STR_LEN && SAFE_PACKAGE_RE.test(v); }
function isSafeServiceName(v) { return typeof v === 'string' && v.length <= MAX_STR_LEN && SAFE_SERVICE_RE.test(v); }
function isSafeTaskPath(v)    { return typeof v === 'string' && v.length <= MAX_STR_LEN && SAFE_TASK_PATH_RE.test(v); }
// ── PowerShell runners ────────────────────────────────────────────────────────
function runPS(cmd, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('Windows only'));
    execFile(
      'powershell.exe',
      ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
       '-WindowStyle', 'Hidden', '-Command', cmd],
      { timeout: timeoutMs, maxBuffer: 1024 * 512, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          const detail = String(stderr || stdout || '').trim();
          return reject(new Error(detail || err.message));
        }
        resolve(stdout?.trim() ?? '');
      }
    );
  });
}
// Tolerant query — never rejects, returns null on error
function queryPS(cmd, timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    execFile(
      'powershell.exe',
      ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
       '-WindowStyle', 'Hidden', '-Command', cmd],
      { timeout: timeoutMs, maxBuffer: 1024 * 256, windowsHide: true },
      (err, stdout) => resolve(err ? null : stdout?.trim() ?? '')
    );
  });
}
// ── Safety denylist ───────────────────────────────────────────────────────────
const DENYLIST_PACKAGES = new Set([
  'Microsoft.Windows.Photos',
  'Microsoft.WindowsCalculator',
  'Microsoft.WindowsAlarms',
  'Microsoft.WindowsNotepad',
  'Microsoft.Paint',
  'Microsoft.WindowsTerminal',
]);
const DENYLIST_SERVICES = new Set([
  'Windefend', 'mpssvc', 'BFE', 'WSC',
  'AudioSrv', 'AudioEndpointBuilder',
  'Dhcp', 'Dnscache', 'NlaSvc',
  'wuauserv', 'UsoSvc', 'WaaSMedicSvc',
  'CryptSvc', 'TrkWks', 'BITS',
  'PlugPlay', 'RpcSs', 'DcomLaunch',
]);
// ── IPC: debloat:scan ─────────────────────────────────────────────────────────
ipcMain.handle('debloat:scan', async (event, items) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows', results: {} };
  if (!Array.isArray(items)) return { ok: false, reason: 'bad-input', results: {} };
  const token = psLimiter.tryAcquire({ file: 'debloat-helper.js', fn: 'debloat:scan', reason: 'debloat-scan' });
  if (!token) return { ok: false, reason: 'busy', results: {} };
  try {
  const results = {};
  for (const item of items) {
    try {
      if (item.type === 'appx') {
        if (!isSafePackageName(item.packageName)) {
          results[item.id] = { present: true, error: 'invalid-package-name' };
          continue;
        }
        const out = await runPS(
          `$p = Get-AppxPackage -Name '${psEscape(item.packageName)}' -ErrorAction SilentlyContinue; ` +
          `If ($p) { Write-Output 'present' } Else { Write-Output 'absent' }`,
          8000
        );
        results[item.id] = { present: out.includes('present') };
      } else if (item.type === 'registry') {
        if (!isSafeRegPath(item.regPath) || !isSafeRegName(item.regName)) {
          results[item.id] = { present: true, error: 'invalid-registry-key' };
          continue;
        }
        const out = await runPS(
          `Try { $v = (Get-ItemProperty -Path '${psEscape(item.regPath)}' -Name '${psEscape(item.regName)}' -ErrorAction Stop).'${psEscape(item.regName)}'; Write-Output $v } Catch { Write-Output '__missing__' }`,
          6000
        );
        const val = out.replace(/\r?\n/g, '').trim();
        const expectedDisabled = String(item.expectedDisabledValue ?? '');
        results[item.id] = { present: val !== expectedDisabled && val !== '__missing__' };
      } else if (item.type === 'service') {
        if (!isSafeServiceName(item.serviceName)) {
          results[item.id] = { present: true, error: 'invalid-service-name' };
          continue;
        }
        const out = await runPS(
          `Try { $s = Get-Service -Name '${psEscape(item.serviceName)}' -ErrorAction Stop; Write-Output $s.StartType } Catch { Write-Output '__missing__' }`,
          6000
        );
        const startType = out.trim().toLowerCase();
        results[item.id] = { present: startType !== 'disabled' && startType !== '__missing__' };
      } else if (item.type === 'task') {
        if (!Array.isArray(item.taskPaths) || item.taskPaths.length === 0 || !item.taskPaths.every(isSafeTaskPath)) {
          results[item.id] = { present: true, error: 'invalid-task-paths' };
          continue;
        }
        const pathArr = item.taskPaths.map(p => `'${psEscape(p)}'`).join(', ');
        const out = await runPS(
          `$tasks = @(${pathArr})
           $allDisabled = $true
           foreach ($t in $tasks) {
             $parent = (Split-Path $t -Parent) + '\\'
             $leaf = Split-Path $t -Leaf
             $s = Get-ScheduledTask -TaskPath $parent -TaskName $leaf -ErrorAction SilentlyContinue
             if ($s -and $s.State -ne 'Disabled') { $allDisabled = $false; break }
           }
           if ($allDisabled) { Write-Output 'absent' } else { Write-Output 'present' }`,
          15000
        );
        results[item.id] = { present: out.includes('present') };
      } else {
        results[item.id] = { present: true, error: 'unsupported-type' };
      }
    } catch (err) {
      results[item.id] = { present: true, error: err.message };
    }
  }
    return { ok: true, results };
  } finally {
    psLimiter.release(token);
  }
});
// ── IPC: debloat:removeItem ───────────────────────────────────────────────────
ipcMain.handle('debloat:removeItem', async (event, item) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows', status: 'unsupported' };
  const token = psLimiter.tryAcquire({ file: 'debloat-helper.js', fn: 'debloat:removeItem', reason: 'debloat-remove' });
  if (!token) return { ok: false, reason: 'busy', status: 'unavailable' };
  if (item.type === 'appx' && DENYLIST_PACKAGES.has(item.packageName)) {
    psLimiter.release(token);
    return { ok: false, status: 'unsupported', error: 'Item is on the protected denylist.' };
  }
  if (item.type === 'service' && DENYLIST_SERVICES.has(item.serviceName)) {
    psLimiter.release(token);
    return { ok: false, status: 'unsupported', error: 'Service is protected and cannot be disabled.' };
  }
  try {
    let cmd = '';
    if (item.type === 'appx') {
      if (!isSafePackageName(item.packageName)) {
        return { ok: false, status: 'unsupported', error: 'Invalid package name' };
      }
      cmd = `
        $pkg = Get-AppxPackage -Name '${psEscape(item.packageName)}' -ErrorAction SilentlyContinue
        If ($pkg) {
          $pkg | Remove-AppxPackage -ErrorAction Stop
          Write-Output 'removed'
        } Else {
          Write-Output 'already-absent'
        }
      `;
    } else if (item.type === 'registry') {
      if (!isSafeRegPath(item.regPath) || !isSafeRegName(item.regName)) {
        return { ok: false, status: 'unsupported', error: 'Invalid registry key' };
      }
      const val = item.regValueDisabled;
      const valType = typeof val === 'number' ? 'DWord' : 'String';
      const valLiteral = valType === 'DWord' ? parseInt(val, 10) || 0 : `'${psEscape(String(val))}'`;
      cmd = `
        If (!(Test-Path '${psEscape(item.regPath)}')) { New-Item -Path '${psEscape(item.regPath)}' -Force | Out-Null }
        Set-ItemProperty -Path '${psEscape(item.regPath)}' -Name '${psEscape(item.regName)}' -Value ${valLiteral} -Type ${valType} -Force
        Write-Output 'removed'
      `;
    } else if (item.type === 'service') {
      if (!isSafeServiceName(item.serviceName)) {
        return { ok: false, status: 'unsupported', error: 'Invalid service name' };
      }
      cmd = `
        $svc = Get-CimInstance Win32_Service -Filter "Name='${psEscape(item.serviceName)}'" -ErrorAction SilentlyContinue
        If (!$svc) {
          Write-Output 'already-absent'
        } Else {
          Stop-Service -Name '${psEscape(item.serviceName)}' -Force -ErrorAction SilentlyContinue
          & sc.exe config '${psEscape(item.serviceName)}' start= disabled | Out-Null
          If ($LASTEXITCODE -ne 0) { throw "Windows could not disable service ${psEscape(item.serviceName)} (sc.exe exit $LASTEXITCODE)" }
          Write-Output 'removed'
        }
      `;
    } else if (item.type === 'task') {
      if (!Array.isArray(item.taskPaths) || item.taskPaths.length === 0 || !item.taskPaths.every(isSafeTaskPath)) {
        return { ok: false, status: 'unsupported', error: 'Invalid task paths' };
      }
      const pathArr = item.taskPaths.map(p => `'${psEscape(p)}'`).join(', ');
      cmd = `
        $tasks = @(${pathArr})
        foreach ($t in $tasks) {
          $parent = (Split-Path $t -Parent) + '\\'
          $leaf = Split-Path $t -Leaf
          Disable-ScheduledTask -TaskPath $parent -TaskName $leaf -ErrorAction SilentlyContinue
        }
        Write-Output 'removed'
      `;
    } else {
      return { ok: false, status: 'unsupported', error: 'Unknown item type' };
    }
    // Service configuration is protected by Windows even when the current
    // PowerShell process can query the service. Use the existing hidden UAC
    // path so Delivery Optimization and similar services do not fail with
    // sc.exe exit code 5 (access denied).
    let out = '';
    if (item.type === 'service') {
      const elevated = await runElevated(cmd, { tempFilePrefix: 'sc_debloat_' });
      if (!elevated.ok) throw new Error(elevated.error || 'Administrator permission was required.');
    } else {
      out = await runPS(cmd, 15000);
    }
    // runElevated intentionally returns only its structured status, not the
    // PowerShell stdout. Service commands are therefore known to have
    // completed successfully once elevation reports ok; verification below
    // supplies the authoritative post-write state.
    const result = item.type !== 'service' && out.includes('already-absent')
      ? 'already-absent'
      : 'removed';
    let verified = false;
    let verificationError = null;
    try {
      verified = await verifyItem(item);
    } catch (err) {
      verificationError = err?.message || String(err);
    }
    return {
      ok: true,
      status: verified ? result : 'verification-failed',
      verified,
      ...(verificationError ? { errorDetail: verificationError } : {}),
    };
  } catch (err) {
    console.warn(`[Debloat] removeItem ${item.id} ERROR: ${err.message}`);
    return { ok: false, status: 'failed', error: err.message, errorDetail: err.message };
  } finally {
    psLimiter.release(token);
  }
});
// ── IPC: debloat:restoreItem ──────────────────────────────────────────────────
ipcMain.handle('debloat:restoreItem', async (event, item) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows', status: 'unsupported' };
  const token = psLimiter.tryAcquire({ file: 'debloat-helper.js', fn: 'debloat:restoreItem', reason: 'debloat-restore' });
  if (!token) return { ok: false, reason: 'busy', status: 'unavailable' };
  if (!item.restoreSupported) { psLimiter.release(token); return { ok: false, status: 'unsupported', error: 'Item does not support restore.' }; }
  try {
    let cmd = '';
    if (item.type === 'appx') {
      if (!isSafePackageName(item.packageName)) {
        return { ok: false, status: 'unsupported', error: 'Invalid package name' };
      }
      cmd = `
        $prov = Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue |
          Where-Object { $_.DisplayName -like '*${psEscape(item.packageName.replace('Microsoft.', ''))}*' } |
          Select-Object -First 1
        If ($prov) {
          Add-AppxPackage -DisableDevelopmentMode -Register "$($prov.InstallLocation)\\AppXManifest.xml" -ErrorAction Stop
          Write-Output 'restored'
        } Else {
          Write-Output 'store-required'
        }
      `;
    } else if (item.type === 'registry') {
      if (!isSafeRegPath(item.regPath) || !isSafeRegName(item.regName)) {
        return { ok: false, status: 'unsupported', error: 'Invalid registry key' };
      }
      const val = item.regValueDefault;
      const valType = typeof val === 'number' ? 'DWord' : 'String';
      const valLiteral = valType === 'DWord' ? parseInt(val, 10) || 0 : `'${psEscape(String(val))}'`;
      cmd = `
        If (!(Test-Path '${psEscape(item.regPath)}')) { New-Item -Path '${psEscape(item.regPath)}' -Force | Out-Null }
        Set-ItemProperty -Path '${psEscape(item.regPath)}' -Name '${psEscape(item.regName)}' -Value ${valLiteral} -Type ${valType} -Force
        Write-Output 'restored'
      `;
    } else if (item.type === 'service') {
      if (!isSafeServiceName(item.serviceName)) {
        return { ok: false, status: 'unsupported', error: 'Invalid service name' };
      }
      const startType = item.defaultStartType ?? 'Automatic';
      cmd = `
        $svc = Get-Service -Name '${psEscape(item.serviceName)}' -ErrorAction SilentlyContinue
        If (!$svc) { Write-Output 'not-found'; Exit }
        Set-Service -Name '${psEscape(item.serviceName)}' -StartupType ${startType} -ErrorAction Stop
        Start-Service -Name '${psEscape(item.serviceName)}' -ErrorAction SilentlyContinue
        Write-Output 'restored'
      `;
    } else if (item.type === 'task') {
      if (!Array.isArray(item.taskPaths) || item.taskPaths.length === 0 || !item.taskPaths.every(isSafeTaskPath)) {
        return { ok: false, status: 'unsupported', error: 'Invalid task paths' };
      }
      const pathArr = item.taskPaths.map(p => `'${psEscape(p)}'`).join(', ');
      cmd = `
        $tasks = @(${pathArr})
        foreach ($t in $tasks) {
          $parent = (Split-Path $t -Parent) + '\\'
          $leaf = Split-Path $t -Leaf
          Enable-ScheduledTask -TaskPath $parent -TaskName $leaf -ErrorAction SilentlyContinue
        }
        Write-Output 'restored'
      `;
    } else {
      return { ok: false, status: 'unsupported' };
    }
    const out = await runPS(cmd, 15000);
    const status = out.includes('restored') ? 'restored'
      : out.includes('store-required') ? 'partial'
      : 'failed';
    return { ok: status !== 'failed', status, storeRequired: out.includes('store-required') };
  } catch (err) {
    console.warn(`[Debloat] restoreItem ${item.id} ERROR: ${err.message}`);
    return { ok: false, status: 'failed', error: err.message };
  } finally {
    psLimiter.release(token);
  }
});
// ── IPC: debloat:verifyItem ───────────────────────────────────────────────────
ipcMain.handle('debloat:verifyItem', async (event, item) => {
  if (process.platform !== 'win32') return { ok: false };
  const token = psLimiter.tryAcquire({ file: 'debloat-helper.js', fn: 'debloat:verifyItem', reason: 'debloat-verify' });
  if (!token) return { ok: false, reason: 'busy' };
  try {
    const absent = await verifyItem(item);
    return { ok: true, absent };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    psLimiter.release(token);
  }
});
// ── Internal verify helper (debloat items) ────────────────────────────────────
async function verifyItem(item) {
  if (item.type === 'appx') {
    if (!isSafePackageName(item.packageName)) return false;
    const out = await runPS(
      `$p = Get-AppxPackage -Name '${psEscape(item.packageName)}' -ErrorAction SilentlyContinue; ` +
      `If ($p) { Write-Output 'present' } Else { Write-Output 'absent' }`,
      8000
    );
    return out.includes('absent');
  } else if (item.type === 'registry') {
    if (!isSafeRegPath(item.regPath) || !isSafeRegName(item.regName)) return false;
    const out = await runPS(
      `Try { $v = (Get-ItemProperty -Path '${psEscape(item.regPath)}' -Name '${psEscape(item.regName)}' -ErrorAction Stop).'${psEscape(item.regName)}'; Write-Output $v } Catch { Write-Output '__missing__' }`,
      6000
    );
    const val = out.trim();
    return val === String(item.regValueDisabled) || val === '__missing__';
  } else if (item.type === 'service') {
    if (!isSafeServiceName(item.serviceName)) return false;
    const out = await runPS(
      `$svc = Get-CimInstance Win32_Service -Filter "Name='${psEscape(item.serviceName)}'" -ErrorAction SilentlyContinue; ` +
      `If (!$svc -or $svc.StartMode -eq 'Disabled') { Write-Output 'absent' } Else { Write-Output 'present' }`,
      6000
    );
    return out.trim().toLowerCase() === 'absent';
  } else if (item.type === 'task') {
    if (!Array.isArray(item.taskPaths) || !item.taskPaths.every(isSafeTaskPath)) return false;
    const pathArr = item.taskPaths.map(p => `'${psEscape(p)}'`).join(', ');
    const out = await runPS(
      `$tasks = @(${pathArr})
       $allDisabled = $true
       foreach ($t in $tasks) {
         $parent = (Split-Path $t -Parent) + '\\'
         $leaf = Split-Path $t -Leaf
         $s = Get-ScheduledTask -TaskPath $parent -TaskName $leaf -ErrorAction SilentlyContinue
         if ($s -and $s.State -ne 'Disabled') { $allDisabled = $false; break }
       }
       Write-Output $(if ($allDisabled) { 'absent' } else { 'present' })`,
      15000
    );
    return out.includes('absent');
  }
  return false;
}
// ── Protected app name patterns ───────────────────────────────────────────────
const PROTECTED_APP_PATTERNS = [
  /windows defender/i,
  /microsoft defender/i,
  /windows security/i,
  /windows firewall/i,
  /malicious software removal tool/i,
  /^microsoft windows$/i,
  /windows update/i,
  /windows subsystem for linux/i,
];
function isAppProtected(name) {
  if (!name) return true;
  for (const pat of PROTECTED_APP_PATTERNS) {
    if (pat.test(String(name))) return true;
  }
  return false;
}

// SwitchControl cannot remove its own running executable. Treat its registry
// entry as visible but non-actionable so the UI can explain the safe handoff
// instead of launching the app's own EXE as an uninstaller.
function isCurrentSwitchControlInstall(name, installLocation, uninstallString) {
  if (/^switchcontrol(?:\.exe)?$/i.test(String(name || '').trim())) return true;
  const currentDir = path.dirname(process.execPath).replace(/[\\/]+$/, '').toLowerCase();
  const location = String(installLocation || '').replace(/[\\/]+$/, '').toLowerCase();
  if (location && (currentDir === location || currentDir.startsWith(`${location}\\`))) return true;
  return /switchcontrol\.exe/i.test(String(uninstallString || '')) &&
    /switchcontrol/i.test(String(name || ''));
}
// ── Uninstall string parser ───────────────────────────────────────────────────
//
// Windows uninstall strings are notoriously inconsistent:
//   "C:\Program Files\App\uninstall.exe"
//   "C:\Program Files\App\uninstall.exe" /S
//   C:\Program Files\App\uninstall.exe /S       ← unquoted with spaces!
//   MsiExec.exe /X{GUID}
//   C:\Windows\system32\msiexec.exe /x {GUID}
//
// Returns { exe, args, guid? } or null if str is empty.
function parseUninstallString(str) {
  str = (str || '').trim();
  if (!str) return null;
  // Case 1: Quoted executable path  →  "C:\path\exe.exe" [optional args]
  const quotedMatch = str.match(/^"([^"]+)"(.*)/s);
  if (quotedMatch) {
    const exe = quotedMatch[1].trim();
    const args = quotedMatch[2].trim();
    const guid = (args.match(/\{[A-F0-9\-]+\}/i) || [])[0] || null;
    return { exe, args, guid };
  }
  // Case 2: Unquoted msiexec at the start
  if (/^msiexec(?:\.exe)?\s/i.test(str)) {
    const args = str.replace(/^msiexec(?:\.exe)?\s+/i, '').trim();
    const guid = (args.match(/\{[A-F0-9\-]+\}/i) || [])[0] || null;
    return { exe: 'msiexec.exe', args, guid, isMsiExec: true };
  }
  // Case 3: Unquoted path — find the .exe boundary
  // Handles: C:\Program Files\App\uninstall.exe /S
  const exeMatch = str.match(/^(.*?\.exe)\b(.*)/i);
  if (exeMatch) {
    const exe = exeMatch[1].trim();
    const args = exeMatch[2].trim();
    const guid = (args.match(/\{[A-F0-9\-]+\}/i) || [])[0] || null;
    return { exe, args, guid };
  }
  // Case 4: Fallback — split on first space
  const spIdx = str.indexOf(' ');
  if (spIdx > 0) {
    return { exe: str.slice(0, spIdx), args: str.slice(spIdx + 1).trim(), guid: null };
  }
  return { exe: str, args: '', guid: null };
}
// ── Argument tokenizer ────────────────────────────────────────────────────────
//
// Splits a Windows argument string into an array of tokens, respecting
// quoted strings (both " and ').  Quotes are stripped.
function tokenizeArgs(argStr) {
  if (!argStr) return [];
  const tokens = [];
  let cur = '';
  let inQ = false;
  let qChar = '';
  for (const c of argStr) {
    if (inQ) {
      if (c === qChar) { inQ = false; }
      else { cur += c; }
    } else if (c === '"' || c === "'") {
      inQ = true; qChar = c;
    } else if (c === ' ' || c === '\t') {
      if (cur.length > 0) { tokens.push(cur); cur = ''; }
    } else {
      cur += c;
    }
  }
  if (cur.length > 0) tokens.push(cur);
  return tokens;
}
// ── Process runner for EXE uninstallers ──────────────────────────────────────
//
// Runs an executable directly via Node's spawn().  No PowerShell wrapper —
// this eliminates all the quoting/escaping issues with inline PS commands.
//
// Since SwitchControl runs as Administrator (requireAdministrator manifest),
// all child processes also inherit elevated rights automatically.
async function runExeProcess(exe, argsArray, timeoutMs = 120000) {
  return new Promise((resolve) => {
    let errMsg = null;
    let proc;
    try {
      proc = spawn(exe, argsArray, { windowsHide: true, detached: false });
    } catch (err) {
      return resolve({ exitCode: -1, timedOut: false, error: err.message });
    }
    const timer = setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve({ exitCode: -2, timedOut: true, error: 'Uninstall timed out after 120 seconds' });
    }, timeoutMs);
    proc.on('error', (err) => { errMsg = err.message; });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, timedOut: false, error: errMsg });
    });
  });
}
// ── Post-uninstall verification ───────────────────────────────────────────────
//
// Returns true  → app is confirmed gone (registry key absent)
// Returns false → app still detected
// Returns null  → verification inconclusive (PS error)
async function verifyAppRemoved(appName, registryKeyPath) {
  // Primary: check if the specific registry subkey is gone
  if (registryKeyPath) {
    try {
      // Convert raw key path: HKEY_LOCAL_MACHINE\... → HKLM:\...
      const normalized = registryKeyPath
        .replace(/^HKEY_LOCAL_MACHINE\\/i, 'HKLM:\\')
        .replace(/^HKEY_CURRENT_USER\\/i, 'HKCU:\\');
      const safePath = normalized.replace(/'/g, "''");
      const out = await queryPS(`(Test-Path '${safePath}') -eq $false`);
      if (out !== null) {
        const gone = out.trim().toLowerCase() === 'true';
        if (gone) return true;
        // Key still there — app still registered
        return false;
      }
    } catch {}
  }
  // Fallback: scan all uninstall hives by display name
  try {
    const safeName = (appName || '').replace(/'/g, "''");
    const out = await queryPS(`
$found = $false
foreach ($p in @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)) {
  $m = Get-ItemProperty -Path $p -EA SilentlyContinue | Where-Object { $_.DisplayName -eq '${safeName}' } | Select-Object -First 1
  if ($m) { $found = $true; break }
}
if ($found) { 'present' } else { 'absent' }
`, 15000);
    if (out === null) return null;
    return out.trim().toLowerCase() === 'absent';
  } catch {
    return null;
  }
}
// ── Classify exit code ────────────────────────────────────────────────────────
function classifyExitCode(code, method) {
  if (code === 0)    return { ok: true, label: null };
  if (code === 3010) return { ok: true, label: 'restart-required' };
  if (method === 'msi') {
    if (code === 1605) return { ok: true,  label: 'already-removed' }; // product not registered
    if (code === 1614) return { ok: true,  label: 'already-removed' }; // product uninstalled
    if (code === 1602) return { ok: false, label: 'user-cancelled' };
    if (code === 1603) return { ok: false, label: 'fatal-error' };
  }
  if (code === -1)   return { ok: false, label: 'process-error' };
  if (code === -2)   return { ok: false, label: 'timed-out' };
  return { ok: false, label: `exit-${code}` };
}
// ── IPC: installedApps:scan ───────────────────────────────────────────────────
//
// Returns { ok, apps, scannedAt }
// apps = array of { id, name, publisher, version, sizeMb, installDate,
//                   installLocation, uninstallString, quietUninstall,
//                   windowsInstaller, registryKeyPath, source,
//                   isProtected, canUninstall, uninstallMethod, trustLabel }
ipcMain.handle('installedApps:scan', async () => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows', apps: [] };
  const token = psLimiter.tryAcquire({ file: 'debloat-helper.js', fn: 'installedApps:scan', reason: 'apps-scan' });
  if (!token) return { ok: false, reason: 'busy', apps: [] };
  // Use Get-ChildItem per hive so we can capture the real registry subkey path
  // for post-uninstall verification.
  const cmd = `
$ErrorActionPreference = 'SilentlyContinue'
$hives = @(
  @{ Path = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'; Src = 'HKLM' },
  @{ Path = 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'; Src = 'HKLM_WOW' },
  @{ Path = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'; Src = 'HKCU' }
)
$seen  = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$apps  = [System.Collections.ArrayList]::new()
foreach ($hive in $hives) {
  $keys = Get-ChildItem -Path $hive.Path -ErrorAction SilentlyContinue
  foreach ($key in $keys) {
    $p = Get-ItemProperty -Path $key.PSPath -ErrorAction SilentlyContinue
    if (!$p -or !$p.DisplayName -or $p.DisplayName.Trim() -eq '' -or $p.SystemComponent -eq 1) { continue }
    $nm = $p.DisplayName.Trim()
    if (!$seen.Add($nm)) { continue }
    [void]$apps.Add([PSCustomObject]@{
      N  = $nm
      Pb = $p.Publisher
      V  = $p.DisplayVersion
      Sz = $p.EstimatedSize
      D  = $p.InstallDate
      IL = $p.InstallLocation
      US = $p.UninstallString
      QS = $p.QuietUninstallString
      WI = $p.WindowsInstaller
      KP = $key.Name
      SR = $hive.Src
      DI = $p.DisplayIcon
    })
  }
}
$apps | ConvertTo-Json -Compress -Depth 1
  `;
  try {
    const raw = await runPS(cmd, 60000);
    if (!raw || raw.trim() === '' || raw.trim() === 'null') {
      return { ok: true, apps: [], scannedAt: new Date().toISOString() };
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch {
      return { ok: false, error: 'json-parse-failed', apps: [] };
    }
    if (!Array.isArray(parsed)) parsed = [parsed];
    const crypto = require('crypto');
    const apps = parsed
      .filter(a => a && a.N)
      .map(a => {
        const name           = String(a.N  || '').trim();
        const publisher      = String(a.Pb || '').trim();
        const unStr          = String(a.US || '').trim();
        const quietStr       = String(a.QS || '').trim();
        const windowsInstaller = a.WI === 1 || a.WI === '1';
        const registryKeyPath  = String(a.KP || '').trim();
        const source           = String(a.SR || 'HKLM').trim();
         const protected_       = isAppProtected(name);
         const isSelf           = isCurrentSwitchControlInstall(name, a.IL, unStr || quietStr);
        // Reliable method detection:
        // WindowsInstaller=1 with any GUID → MSI
        // msiexec in uninstall string with GUID → MSI
        // Otherwise → EXE
        const hasGuid = /\{[A-F0-9\-]+\}/i.test(unStr) || /\{[A-F0-9\-]+\}/i.test(quietStr);
        let method = 'none';
        let canUninstall = false;
         if (!protected_ && !isSelf) {
          if ((windowsInstaller && hasGuid) || (/msiexec/i.test(unStr) && hasGuid)) {
            method = 'msi'; canUninstall = true;
          } else if (quietStr.length > 3) {
            method = 'exe'; canUninstall = true;
          } else if (unStr.length > 3) {
            method = 'exe'; canUninstall = true;
          }
        }
        let trustLabel = 'user-installed';
        if (protected_)                        trustLabel = 'protected';
        else if (/microsoft/i.test(publisher)) trustLabel = 'microsoft';
        else if (!publisher)                   trustLabel = 'unknown';
        const sizeMb = a.Sz ? Math.round(Number(a.Sz) / 1024) : 0;
        const id = crypto.createHash('md5').update(name + publisher).digest('hex').slice(0, 16);
        return {
          id, name, publisher,
          version:         String(a.V  || '').trim(),
          sizeMb,
          installDate:     String(a.D  || '').trim(),
          installLocation: String(a.IL || '').trim(),
          uninstallString: unStr,
          quietUninstall:  quietStr,
          windowsInstaller,
          registryKeyPath,
          source,
           isProtected:     protected_,
           isSelf,
          canUninstall,
          uninstallMethod: method,
          trustLabel,
          displayIcon:     String(a.DI || '').trim(),
        };
      });
    // Store for lazy icon resolution
    _lastScanApps = new Map(apps.map(a => [a.id, a]));
    return { ok: true, apps, scannedAt: new Date().toISOString() };
  } catch (err) {
    console.warn('[InstalledApps] scan error:', err.message);
    return { ok: false, error: err.message, apps: [] };
  } finally {
    psLimiter.release(token);
  }
});
ipcMain.handle('installedApps:icon', async (_event, appId) => {
  if (process.platform !== 'win32') return null;
  const app = _lastScanApps.get(appId);
  if (!app) return null;
  return await getAppIconDataUrl(appId, app);
});
// ── IPC: installedApps:uninstall ──────────────────────────────────────────────
//
// Full pipeline:
//  1. Guard checks (protected, canUninstall)
//  2. Parse uninstall string properly (handles unquoted paths with spaces)
//  3. Execute via Node spawn() for EXE or execFile for MSI — no PS quoting issues
//  4. Classify exit code (0, 3010, MSI 1605/1614 = success)
//  5. Post-uninstall registry verification
//  6. Return structured result { ok, status, methodUsed, executable, args,
//                                exitCode, requiresRestart, verifiedRemoved,
//                                errorDetail }
ipcMain.handle('installedApps:uninstall', async (event, app) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows' };
  const token = psLimiter.tryAcquire({ file: 'debloat-helper.js', fn: 'installedApps:uninstall', reason: 'apps-uninstall' });
  if (!token) return { ok: false, reason: 'busy' };
  try {
  if (!app || typeof app !== 'object' || !app.name) {
    return { ok: false, status: 'blocked', errorDetail: 'Invalid input.' };
  }
  if (isAppProtected(app.name)) {
    return { ok: false, status: 'blocked', errorDetail: 'App is protected and cannot be removed.' };
  }
  if (isCurrentSwitchControlInstall(app.name, app.installLocation, app.uninstallString || app.quietUninstall)) {
    return {
      ok: false,
      status: 'self-uninstall-blocked',
      selfUninstall: true,
      errorDetail: 'SwitchControl cannot uninstall itself while it is open. Close SwitchControl first, then remove it from Windows Settings > Apps > Installed apps.',
    };
  }
  if (!app.canUninstall) {
    return {
      ok: false, status: 'no-uninstall-path',
      errorDetail: app.uninstallString
        ? 'Uninstall string exists but could not be parsed into a supported method.'
        : 'No uninstall string found in the registry.',
    };
  }
  const unStr    = String(app.uninstallString  || '').trim();
  const quietStr = String(app.quietUninstall   || '').trim();
  // ── MSI path ─────────────────────────────────────────────────────────────
  if (app.uninstallMethod === 'msi') {
    // Extract GUID — check both strings
    const guidMatch = (unStr + ' ' + quietStr).match(/\{[A-F0-9\-]+\}/i);
    if (!guidMatch) {
      return { ok: false, status: 'parse-error', errorDetail: 'Could not extract MSI product GUID from uninstall string.' };
    }
    const guid = guidMatch[0];
    const args = ['/x', guid, '/qn', '/norestart'];
    console.log(`[InstalledApps] MSI uninstall: msiexec.exe ${args.join(' ')} — ${app.name}`);
    const proc = await runExeProcess('msiexec.exe', args, 120000);
    const { ok: codeOk, label: codeLabel } = classifyExitCode(proc.exitCode, 'msi');
    let verifiedRemoved = null;
    if (codeOk) {
      verifiedRemoved = await verifyAppRemoved(app.name, app.registryKeyPath);
    }
    const success = codeOk && verifiedRemoved !== false;
    return {
      ok:             success,
      status:         success ? (proc.exitCode === 3010 ? 'restart-required' : 'removed') : 'failed',
      methodUsed:     'msi',
      executable:     'msiexec.exe',
      args:           args.join(' '),
      exitCode:       proc.exitCode,
      requiresRestart: proc.exitCode === 3010,
      verifiedRemoved,
      errorDetail:    success ? null
        : proc.error     ? `Process error: ${proc.error}`
        : proc.timedOut  ? 'Uninstall timed out'
        : verifiedRemoved === false ? `Process exited ${proc.exitCode} but app still detected in registry`
        : `MSI exited with code ${proc.exitCode} (${codeLabel ?? 'unknown'})`,
    };
  }
  // ── EXE path ──────────────────────────────────────────────────────────────
  // Prefer QuietUninstallString when available; fall back to UninstallString
  const rawStr = quietStr.length > 3 ? quietStr : unStr;
  const parsed = parseUninstallString(rawStr);
  if (!parsed || !parsed.exe) {
    return { ok: false, status: 'parse-error', errorDetail: 'Could not parse the uninstall command. Uninstall string: ' + rawStr.slice(0, 200) };
  }
  // Verify the exe exists before attempting to launch (catches bad path parses quickly)
  const exeExists = fs.existsSync(parsed.exe);
  if (!exeExists) {
    // Try the other string before giving up
    const altStr = (rawStr === quietStr && unStr.length > 3) ? unStr : null;
    let altParsed = altStr ? parseUninstallString(altStr) : null;
    if (altParsed && altParsed.exe && fs.existsSync(altParsed.exe)) {
      // Use the alternate string
      Object.assign(parsed, altParsed);
    } else {
      return {
        ok: false, status: 'exe-not-found',
        errorDetail: `Uninstaller not found at: ${parsed.exe}`,
      };
    }
  }
  const argsArray = tokenizeArgs(parsed.args);
  console.log(`[InstalledApps] EXE uninstall: "${parsed.exe}" [${argsArray.join(', ')}] — ${app.name}`);
  const proc = await runExeProcess(parsed.exe, argsArray, 180000);
  const { ok: codeOk, label: codeLabel } = classifyExitCode(proc.exitCode, 'exe');
  let verifiedRemoved = null;
  if (codeOk) {
    verifiedRemoved = await verifyAppRemoved(app.name, app.registryKeyPath);
  }
  const success = codeOk && verifiedRemoved !== false;
  return {
    ok:             success,
    status:         success ? (proc.exitCode === 3010 ? 'restart-required' : 'removed') : 'failed',
    methodUsed:     'exe',
    executable:     parsed.exe,
    args:           parsed.args,
    exitCode:       proc.exitCode,
    requiresRestart: proc.exitCode === 3010,
    verifiedRemoved,
    errorDetail:    success ? null
      : proc.error     ? `Process error: ${proc.error}`
      : proc.timedOut  ? 'Uninstall timed out'
      : verifiedRemoved === false ? `Uninstaller ran (exit ${proc.exitCode}) but app still detected in registry`
      : `Uninstaller exited with code ${proc.exitCode} (${codeLabel ?? 'unknown'})`,
  };
  } finally {
    psLimiter.release(token);
  }
});
console.log('[Debloat] IPC handlers registered');
