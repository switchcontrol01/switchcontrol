/**
 * debloat-helper.js
 * Real Windows debloat IPC handlers.
 * All actions use PowerShell. Registry, AppX, and Service methods only.
 * Windows-only. Returns { ok: false } on non-Windows.
 */

const { ipcMain } = require('electron');
const { execFile } = require('child_process');

// ── PowerShell runner ─────────────────────────────────────────────────────────
function runPS(cmd, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('Windows only'));
    execFile(
      'powershell.exe',
      ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
      { timeout: timeoutMs, maxBuffer: 1024 * 256 },
      (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve(stdout?.trim() ?? '');
      }
    );
  });
}

// ── Safety denylist — IDs we will never touch ─────────────────────────────────
const DENYLIST_PACKAGES = new Set([
  'Microsoft.Windows.Photos',     // needed by many apps
  'Microsoft.WindowsCalculator',
  'Microsoft.WindowsAlarms',
  'Microsoft.WindowsNotepad',
  'Microsoft.Paint',
  'Microsoft.WindowsTerminal',
]);

const DENYLIST_SERVICES = new Set([
  'Windefend', 'mpssvc', 'BFE', 'WSC',  // defender + firewall
  'AudioSrv', 'AudioEndpointBuilder',    // audio
  'Dhcp', 'Dnscache', 'NlaSvc',          // networking
  'wuauserv', 'UsoSvc', 'WaaSMedicSvc',  // Windows Update
  'CryptSvc', 'TrkWks', 'BITS',          // core OS
  'PlugPlay', 'RpcSs', 'DcomLaunch',     // fundamental
]);

// ── IPC: debloat:scan ─────────────────────────────────────────────────────────
// Checks the current state of all known debloat items.
// Returns map: { [itemId]: { present: bool, error?: string } }

ipcMain.handle('debloat:scan', async (event, items) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows', results: {} };
  if (!Array.isArray(items)) return { ok: false, reason: 'bad-input', results: {} };

  const results = {};

  for (const item of items) {
    try {
      if (item.type === 'appx') {
        const out = await runPS(
          `$p = Get-AppxPackage -Name '${item.packageName}' -ErrorAction SilentlyContinue; ` +
          `If ($p) { Write-Output 'present' } Else { Write-Output 'absent' }`,
          8000
        );
        results[item.id] = { present: out.includes('present') };

      } else if (item.type === 'registry') {
        const out = await runPS(
          `Try { $v = (Get-ItemProperty -Path '${item.regPath}' -Name '${item.regName}' -ErrorAction Stop).'${item.regName}'; Write-Output $v } Catch { Write-Output '__missing__' }`,
          6000
        );
        const val = out.replace(/\r?\n/g, '').trim();
        const expectedDisabled = String(item.expectedDisabledValue ?? '');
        // present = not yet disabled (i.e., value !== expected disabled)
        results[item.id] = { present: val !== expectedDisabled && val !== '__missing__' };

      } else if (item.type === 'service') {
        const out = await runPS(
          `Try { $s = Get-Service -Name '${item.serviceName}' -ErrorAction Stop; Write-Output $s.StartType } Catch { Write-Output '__missing__' }`,
          6000
        );
        const startType = out.trim().toLowerCase();
        results[item.id] = { present: startType !== 'disabled' && startType !== '__missing__' };

      } else {
        results[item.id] = { present: true, error: 'unsupported-type' };
      }
    } catch (err) {
      results[item.id] = { present: true, error: err.message };
    }
  }

  return { ok: true, results };
});

// ── IPC: debloat:removeItem ───────────────────────────────────────────────────
// Removes a single debloat item. Returns { ok, status, error? }

ipcMain.handle('debloat:removeItem', async (event, item) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows', status: 'unsupported' };

  // Safety denylist checks
  if (item.type === 'appx' && DENYLIST_PACKAGES.has(item.packageName)) {
    return { ok: false, status: 'unsupported', error: 'Item is on the protected denylist.' };
  }
  if (item.type === 'service' && DENYLIST_SERVICES.has(item.serviceName)) {
    return { ok: false, status: 'unsupported', error: 'Service is protected and cannot be disabled.' };
  }

  try {
    let cmd = '';

    if (item.type === 'appx') {
      // Remove AppX for current user. Does NOT remove provisioned (system-wide) package.
      cmd = `
        $pkg = Get-AppxPackage -Name '${item.packageName}' -ErrorAction SilentlyContinue
        If ($pkg) {
          $pkg | Remove-AppxPackage -ErrorAction Stop
          Write-Output 'removed'
        } Else {
          Write-Output 'already-absent'
        }
      `;

    } else if (item.type === 'registry') {
      const val = item.regValueDisabled;
      const valType = typeof val === 'number' ? 'DWord' : 'String';
      cmd = `
        If (!(Test-Path '${item.regPath}')) { New-Item -Path '${item.regPath}' -Force | Out-Null }
        Set-ItemProperty -Path '${item.regPath}' -Name '${item.regName}' -Value ${val} -Type ${valType} -Force
        Write-Output 'removed'
      `;

    } else if (item.type === 'service') {
      cmd = `
        $svc = Get-Service -Name '${item.serviceName}' -ErrorAction SilentlyContinue
        If (!$svc) { Write-Output 'already-absent'; Exit }
        Stop-Service -Name '${item.serviceName}' -Force -ErrorAction SilentlyContinue
        Set-Service -Name '${item.serviceName}' -StartupType Disabled -ErrorAction Stop
        Write-Output 'removed'
      `;
    } else {
      return { ok: false, status: 'unsupported', error: 'Unknown item type' };
    }

    const out = await runPS(cmd, 15000);
    const result = out.includes('already-absent') ? 'already-absent' : 'removed';

    // Verify
    let verified = false;
    try {
      verified = await verifyItem(item);
    } catch {}

    return {
      ok: true,
      status: verified ? result : 'verification-failed',
      verified,
    };

  } catch (err) {
    console.warn(`[Debloat] removeItem ${item.id} ERROR: ${err.message}`);
    return { ok: false, status: 'failed', error: err.message };
  }
});

// ── IPC: debloat:restoreItem ──────────────────────────────────────────────────
// Restores a single debloat item. Returns { ok, status, error? }

ipcMain.handle('debloat:restoreItem', async (event, item) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows', status: 'unsupported' };
  if (!item.restoreSupported) return { ok: false, status: 'unsupported', error: 'Item does not support restore.' };

  try {
    let cmd = '';

    if (item.type === 'appx') {
      // Try provisioned package first, then instruct user to use Store
      cmd = `
        $prov = Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue |
          Where-Object { $_.DisplayName -like '*${item.packageName.replace('Microsoft.', '')}*' } |
          Select-Object -First 1
        If ($prov) {
          Add-AppxPackage -DisableDevelopmentMode -Register "$($prov.InstallLocation)\\AppXManifest.xml" -ErrorAction Stop
          Write-Output 'restored'
        } Else {
          Write-Output 'store-required'
        }
      `;

    } else if (item.type === 'registry') {
      const val = item.regValueDefault;
      const valType = typeof val === 'number' ? 'DWord' : 'String';
      cmd = `
        If (!(Test-Path '${item.regPath}')) { New-Item -Path '${item.regPath}' -Force | Out-Null }
        Set-ItemProperty -Path '${item.regPath}' -Name '${item.regName}' -Value ${val} -Type ${valType} -Force
        Write-Output 'restored'
      `;

    } else if (item.type === 'service') {
      const startType = item.defaultStartType ?? 'Automatic';
      cmd = `
        $svc = Get-Service -Name '${item.serviceName}' -ErrorAction SilentlyContinue
        If (!$svc) { Write-Output 'not-found'; Exit }
        Set-Service -Name '${item.serviceName}' -StartupType ${startType} -ErrorAction Stop
        Start-Service -Name '${item.serviceName}' -ErrorAction SilentlyContinue
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
  }
});

// ── IPC: debloat:verifyItem ───────────────────────────────────────────────────
ipcMain.handle('debloat:verifyItem', async (event, item) => {
  if (process.platform !== 'win32') return { ok: false };
  try {
    const absent = await verifyItem(item);
    return { ok: true, absent };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Internal verify helper ────────────────────────────────────────────────────
async function verifyItem(item) {
  if (item.type === 'appx') {
    const out = await runPS(
      `$p = Get-AppxPackage -Name '${item.packageName}' -ErrorAction SilentlyContinue; ` +
      `If ($p) { Write-Output 'present' } Else { Write-Output 'absent' }`,
      8000
    );
    return out.includes('absent');

  } else if (item.type === 'registry') {
    const out = await runPS(
      `Try { $v = (Get-ItemProperty -Path '${item.regPath}' -Name '${item.regName}' -ErrorAction Stop).'${item.regName}'; Write-Output $v } Catch { Write-Output '__missing__' }`,
      6000
    );
    const val = out.trim();
    return val === String(item.regValueDisabled) || val === '__missing__';

  } else if (item.type === 'service') {
    const out = await runPS(
      `Try { (Get-Service -Name '${item.serviceName}' -ErrorAction Stop).StartType } Catch { Write-Output '__missing__' }`,
      6000
    );
    return out.trim().toLowerCase() === 'disabled';
  }
  return false;
}

// ── Installed Apps: protected name patterns ──────────────────────────────────
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

// ── IPC: installedApps:scan ───────────────────────────────────────────────────
// Returns { ok, apps, scannedAt }
// apps = array of { id, name, publisher, version, sizeMb, installDate,
//                   installLocation, uninstallString, source, isProtected,
//                   canUninstall, uninstallMethod, trustLabel }

ipcMain.handle('installedApps:scan', async (event) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows', apps: [] };

  const cmd = `
$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$apps = [System.Collections.ArrayList]::new()
foreach ($p in $paths) {
  $items = Get-ItemProperty $p -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -and ($_.DisplayName.Trim() -ne '') -and ($_.SystemComponent -ne 1) }
  foreach ($item in $items) {
    $key = $item.DisplayName.Trim()
    if ($seen.Add($key)) {
      [void]$apps.Add([PSCustomObject]@{
        N  = $item.DisplayName
        Pb = $item.Publisher
        V  = $item.DisplayVersion
        Sz = $item.EstimatedSize
        D  = $item.InstallDate
        IL = $item.InstallLocation
        US = $item.UninstallString
        QS = $item.QuietUninstallString
      })
    }
  }
}
$apps | ConvertTo-Json -Compress -Depth 1
  `;

  try {
    const raw = await runPS(cmd, 45000);
    if (!raw || raw.trim() === '' || raw.trim() === 'null') {
      return { ok: true, apps: [], scannedAt: new Date().toISOString() };
    }

    let parsed;
    try { parsed = JSON.parse(raw); } catch {
      return { ok: false, error: 'json-parse-failed', apps: [] };
    }
    if (!Array.isArray(parsed)) parsed = [parsed];

    const apps = parsed
      .filter(a => a && a.N)
      .map(a => {
        const name      = String(a.N  || '').trim();
        const publisher = String(a.Pb || '').trim();
        const unStr     = String(a.US || '').trim();
        const quietStr  = String(a.QS || '').trim();
        const protected_ = isAppProtected(name);

        let method = 'none';
        let canUninstall = false;
        if (!protected_) {
          if (/msiexec/i.test(unStr) && /\{[A-F0-9\-]+\}/i.test(unStr)) {
            method = 'msi'; canUninstall = true;
          } else if (quietStr.length > 3) {
            method = 'exe'; canUninstall = true;
          } else if (unStr.length > 3) {
            method = 'exe'; canUninstall = true;
          }
        }

        let trustLabel = 'user-installed';
        if (protected_)                                     trustLabel = 'protected';
        else if (/microsoft/i.test(publisher))              trustLabel = 'microsoft';
        else if (!publisher)                                trustLabel = 'unknown';

        const sizeMb = a.Sz ? Math.round(Number(a.Sz) / 1024) : 0;
        const crypto = require('crypto');
        const id = crypto.createHash('md5').update(name + publisher).digest('hex').slice(0, 16);

        return {
          id, name, publisher,
          version:         String(a.V  || '').trim(),
          sizeMb,
          installDate:     String(a.D  || '').trim(),
          installLocation: String(a.IL || '').trim(),
          uninstallString: unStr,
          quietUninstall:  quietStr,
          source:          'registry',
          isProtected:     protected_,
          canUninstall,
          uninstallMethod: method,
          trustLabel,
        };
      });

    return { ok: true, apps, scannedAt: new Date().toISOString() };
  } catch (err) {
    console.warn('[InstalledApps] scan error:', err.message);
    return { ok: false, error: err.message, apps: [] };
  }
});

// ── IPC: installedApps:uninstall ──────────────────────────────────────────────
// Returns { ok, status, exitCode?, requiresRestart?, error? }

ipcMain.handle('installedApps:uninstall', async (event, app) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows' };
  if (!app || typeof app !== 'object' || !app.name) return { ok: false, reason: 'invalid-input' };

  if (isAppProtected(app.name)) {
    return { ok: false, status: 'blocked', error: 'App is protected and cannot be removed.' };
  }
  if (!app.canUninstall) {
    return { ok: false, status: 'unsupported', error: 'No supported uninstall method.' };
  }

  const unStr   = String(app.uninstallString  || '');
  const quietStr = String(app.quietUninstall  || '');

  try {
    let cmd = '';

    if (app.uninstallMethod === 'msi') {
      const guidMatch = unStr.match(/\{[A-F0-9\-]+\}/i);
      if (!guidMatch) return { ok: false, status: 'unsupported', error: 'No product GUID.' };
      cmd = `
        $p = Start-Process 'msiexec.exe' -ArgumentList '/x ${guidMatch[0]} /qn /norestart' -Wait -PassThru -ErrorAction Stop
        Write-Output "exitcode:$($p.ExitCode)"
      `;
    } else {
      const exeStr = (quietStr.length > 3 ? quietStr : unStr).trim();
      if (exeStr.length < 3) return { ok: false, status: 'unsupported' };

      // Parse quoted executable path + args
      let exe = exeStr, argStr = '';
      const m = exeStr.match(/^"([^"]+)"\s*(.*)/s);
      if (m) { exe = m[1]; argStr = m[2]; }
      else {
        const sp = exeStr.indexOf(' ');
        if (sp > 0) { exe = exeStr.slice(0, sp); argStr = exeStr.slice(sp + 1); }
      }
      const safeExe  = exe.replace(/'/g, "''");
      const safeArgs = argStr.replace(/'/g, "''");
      cmd = `
        $p = Start-Process '${safeExe}' -ArgumentList '${safeArgs}' -Wait -PassThru -ErrorAction Stop
        Write-Output "exitcode:$($p.ExitCode)"
      `;
    }

    const out    = await runPS(cmd, 90000);
    const match  = out.match(/exitcode:(\d+)/);
    const code   = match ? parseInt(match[1], 10) : -1;
    const ok     = code === 0 || code === 3010;

    return { ok, status: ok ? 'removed' : 'failed', exitCode: code, requiresRestart: code === 3010 };
  } catch (err) {
    console.warn(`[InstalledApps] uninstall "${app.name}" error:`, err.message);
    return { ok: false, status: 'failed', error: err.message };
  }
});

console.log('[Debloat] IPC handlers registered');
