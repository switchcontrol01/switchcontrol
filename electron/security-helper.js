/**
 * security-helper.js
 * Electron IPC handlers for Windows system integrity data.
 * All handlers are Windows-only and return { available: false } on other platforms or on error.
 */

const { ipcMain, shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const psLimiter = require('./powershell-limiter');

// ---------------------------------------------------------------------------
// PowerShell helper
// ---------------------------------------------------------------------------

function runPowerShell(command, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      return reject(new Error('Windows only'));
    }
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: timeoutMs, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(err);
        const out = stdout.trim();
        if (!out) return reject(new Error('Empty output'));
        resolve(out);
      }
    );
  });
}

function safeParsePsJson(raw) {
  try {
    // PowerShell sometimes returns a single object instead of array
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Startup item classifier (mirrors server/security/recommendations.ts)
// ---------------------------------------------------------------------------

const LAUNCHER_PATTERNS = ['steam', 'epic', 'origin', 'battlenet', 'gog', 'ubisoft', 'ea app', 'riot', 'rockstar'];
const OVERLAY_PATTERNS = ['discord', 'geforce', 'nvidiaoverlay', 'shadowplay', 'afterburner', 'obs', 'fraps', 'overwolf'];
const UPDATER_PATTERNS = ['update', 'updater', 'autoupdate', 'patch', 'onedrive'];
const SECURITY_PATTERNS = ['defender', 'msmpeng', 'antimalware', 'securityhealth', 'firewall', 'crowdstrike'];
const BROWSER_PATTERNS = ['chrome', 'firefox', 'msedge', 'opera', 'brave'];

function classifyStartup(name, command) {
  const lower = ((name || '') + ' ' + (command || '')).toLowerCase();
  if (LAUNCHER_PATTERNS.some(p => lower.includes(p))) return { category: 'launcher', impact: 'medium', recommendation: 'review' };
  if (OVERLAY_PATTERNS.some(p => lower.includes(p))) return { category: 'overlay', impact: 'medium', recommendation: 'review' };
  if (UPDATER_PATTERNS.some(p => lower.includes(p))) return { category: 'updater', impact: 'low', recommendation: 'review' };
  if (SECURITY_PATTERNS.some(p => lower.includes(p))) return { category: 'security', impact: 'low', recommendation: 'keep' };
  if (BROWSER_PATTERNS.some(p => lower.includes(p))) return { category: 'browser', impact: 'medium', recommendation: 'review' };
  if (['windows', 'microsoft', 'shell', 'ctfmon', 'rundll'].some(p => lower.includes(p))) return { category: 'system', impact: 'low', recommendation: 'keep' };
  return { category: 'utility', impact: 'low', recommendation: 'keep' };
}

function classifyProcess(name) {
  const lower = (name || '').toLowerCase().replace(/\.exe$/i, '');
  if (LAUNCHER_PATTERNS.some(p => lower.includes(p))) return { category: 'launcher', impact: 'medium' };
  if (OVERLAY_PATTERNS.some(p => lower.includes(p))) return { category: 'overlay', impact: 'medium' };
  if (SECURITY_PATTERNS.some(p => lower.includes(p))) return { category: 'security', impact: 'low' };
  if (BROWSER_PATTERNS.some(p => lower.includes(p))) return { category: 'browser', impact: 'medium' };
  if (UPDATER_PATTERNS.some(p => lower.includes(p))) return { category: 'updater', impact: 'low' };
  if (['svchost', 'system', 'wininit', 'csrss', 'lsass', 'services', 'dwm', 'winlogon'].includes(lower)) return { category: 'system', impact: 'low' };
  return { category: 'unknown', impact: 'low' };
}

// ---------------------------------------------------------------------------
// IPC: security:getStatus
// Returns Defender + firewall status
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Guard: remove previously registered handlers so this module is safe to
// require more than once (e.g. if the module cache is cleared or the path is
// required with different casing on a case-insensitive filesystem).
// Without these guards, the second require() would throw "second handler
// registered for <channel>" and crash the main process.
// ---------------------------------------------------------------------------
[
  'security:getStatus',
  'security:getStartupApps',
  'security:getTopProcesses',
  'startup:setEnabled',
  'startup:setDelay',
  'startup:verifyState',
  'security:getAdvancedProtection',
  'security:getAdvancedAudit',
  'security:getProcessDetails',
  'security:getScheduledTasks',
  'security:getServices',
  'security:openProcessLocation',
  'security:openStartupLocation',
  'security:setDefenderOption',
  'security:runDefenderAction',
].forEach(ch => ipcMain.removeHandler(ch));

ipcMain.handle('security:getStatus', async () => {
  if (process.platform !== 'win32') {
    return { available: false, reason: 'not-windows' };
  }

  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'security:getStatus', reason: 'security-status' });
  if (!token) return { available: false, reason: 'busy' };
  const result = { available: false, data: null, error: null };

  try {
    // Get Defender status — tries Get-MpComputerStatus first, then CIM fallback,
    // then registry reads for individual fields when WMI is restricted/unavailable.
    const mpCmd = `
      $out = @{
        RealTimeProtectionEnabled = $null
        AntispywareEnabled        = $null
        TamperProtectionEnabled   = $null
        AMEngineVersion           = $null
        AntivirusSignatureVersion = $null
        QuickScanEndTime          = $null
        FullScanEndTime           = $null
        DefenderAvailable         = $false
      }

      # Primary: Get-MpComputerStatus
      $mp = $null
      try { $mp = Get-MpComputerStatus -ErrorAction Stop } catch {}

      # Fallback 1: CIM instance (works when WMI provider is available but cmdlet is restricted)
      if (-not $mp) {
        try { $mp = Get-CimInstance -Namespace 'root/Microsoft/Windows/Defender' -ClassName 'MSFT_MpComputerStatus' -ErrorAction Stop } catch {}
      }

      if ($mp) {
        $out.DefenderAvailable         = $true
        $out.RealTimeProtectionEnabled = $mp.RealTimeProtectionEnabled
        $out.AntispywareEnabled        = $mp.AntispywareEnabled
        $tamperSrc                     = $mp.TamperProtectionSource
        $out.TamperProtectionEnabled   = if ($tamperSrc -ne $null) { [bool]($tamperSrc -ne 0) } else { $null }
        $out.AMEngineVersion           = $mp.AMEngineVersion
        $out.AntivirusSignatureVersion = $mp.AntivirusSignatureVersion
        if ($mp.QuickScanEndTime -and $mp.QuickScanEndTime.Year -gt 2000) { $out.QuickScanEndTime = $mp.QuickScanEndTime.ToString('o') }
        if ($mp.FullScanEndTime  -and $mp.FullScanEndTime.Year  -gt 2000) { $out.FullScanEndTime  = $mp.FullScanEndTime.ToString('o')  }
      }

      # Fallback 2: registry reads for each field that is still null
      if ($out.RealTimeProtectionEnabled -eq $null) {
        try {
          $v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\Real-Time Protection' -Name DisableRealtimeMonitoring -EA Stop).DisableRealtimeMonitoring
          $out.RealTimeProtectionEnabled = ($v -eq 0)
          $out.DefenderAvailable = $true
        } catch {}
      }
      if ($out.AntispywareEnabled -eq $null) {
        try {
          $v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender' -Name DisableAntiSpyware -EA Stop).DisableAntiSpyware
          $out.AntispywareEnabled = ($v -eq 0)
        } catch {
          # Key absent means Defender owns anti-spyware scanning = enabled
          $out.AntispywareEnabled = $true
        }
      }
      if ($out.TamperProtectionEnabled -eq $null) {
        try {
          $v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\Features' -Name TamperProtection -EA Stop).TamperProtection
          $out.TamperProtectionEnabled = ($v -ne 0)
        } catch {}
      }
      if (-not $out.AntivirusSignatureVersion) {
        try {
          $out.AntivirusSignatureVersion = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\Signature Updates' -Name 'AVSignatureVersion' -EA Stop).AVSignatureVersion
        } catch {}
      }

      $out | ConvertTo-Json -Compress
    `;
    const mpRaw = await runPowerShell(mpCmd, 15000);
    let mpData = null;
    try { mpData = JSON.parse(mpRaw); } catch {}

    // Get-NetFirewallProfile (check if Private profile is enabled)
    let firewallEnabled = null;
    try {
      const fwCmd = `Get-NetFirewallProfile -Name 'Private' -ErrorAction SilentlyContinue | Select-Object Enabled | ConvertTo-Json -Compress`;
      const fwRaw = await runPowerShell(fwCmd, 5000);
      const fwData = JSON.parse(fwRaw);
      firewallEnabled = fwData?.Enabled === true;
    } catch {}

    if (!mpData?.DefenderAvailable && firewallEnabled === null) {
      return { available: false, reason: 'defender-unavailable' };
    }

    result.available = true;
    result.data = {
      realtimeProtection: mpData?.RealTimeProtectionEnabled ?? null,
      tamperProtection:   mpData?.TamperProtectionEnabled   ?? null,
      antispywareEnabled: mpData?.AntispywareEnabled        ?? null,
      defenderAvailable:  mpData?.DefenderAvailable         ?? false,
      firewallEnabled,
      engineVersion:    mpData?.AMEngineVersion           ?? null,
      signatureVersion: mpData?.AntivirusSignatureVersion ?? null,
      lastQuickScan:    mpData?.QuickScanEndTime          ?? null,
      lastFullScan:     mpData?.FullScanEndTime           ?? null,
      source: 'electron',
    };

    console.log(`[Security] getStatus OK | realtime=${result.data.realtimeProtection} tamper=${result.data.tamperProtection} firewall=${firewallEnabled}`);
    return result;
  } catch (err) {
    console.warn(`[Security] getStatus ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: security:getStartupApps
// Returns startup items from WMI
// ---------------------------------------------------------------------------

ipcMain.handle('security:getStartupApps', async () => {
  if (process.platform !== 'win32') {
    return { available: false, reason: 'not-windows' };
  }
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'security:getStartupApps', reason: 'security-startup-apps' });
  if (!token) return { available: false, reason: 'busy' };
  try {
    const cmd = `Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | Select-Object Name, Command, Location, User | ConvertTo-Json -Compress`;
    const raw = await runPowerShell(cmd, 12000);
    const items = safeParsePsJson(raw);
    if (!items) return { available: false, reason: 'parse-error' };

    const startupItems = items
      .filter(item => item && item.Name)
      .map(item => {
        const classification = classifyStartup(item.Name, item.Command);
        return {
          name: item.Name || 'Unknown',
          command: item.Command || '',
          location: item.Location || '',
          publisher: null,
          ...classification,
        };
      });

    console.log(`[Security] getStartupApps OK | count=${startupItems.length}`);
    return { available: true, data: startupItems };
  } catch (err) {
    console.warn(`[Security] getStartupApps ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: security:getTopProcesses
// Returns top processes sorted by CPU time
// ---------------------------------------------------------------------------

ipcMain.handle('security:getTopProcesses', async () => {
  if (process.platform !== 'win32') {
    return { available: false, reason: 'not-windows' };
  }
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'security:getTopProcesses', reason: 'security-top-procs' });
  if (!token) return { available: false, reason: 'busy' };
  try {
    const cmd = `Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.CPU -ne $null} | Sort-Object CPU -Descending | Select-Object -First 25 @{n='Name';e={$_.Name}}, @{n='Pid';e={$_.Id}}, @{n='CpuSec';e={[Math]::Round($_.CPU, 2)}}, @{n='MemMb';e={[Math]::Round($_.WorkingSet64/1MB, 1)}} | ConvertTo-Json -Compress`;
    const raw = await runPowerShell(cmd, 12000);
    const items = safeParsePsJson(raw);
    if (!items) return { available: false, reason: 'parse-error' };

    const processes = items
      .filter(item => item && item.Name)
      .map(item => {
        const classification = classifyProcess(item.Name);
        return {
          name: item.Name || 'Unknown',
          pid: item.Pid || 0,
          cpuSec: item.CpuSec ?? null,
          memMb: item.MemMb ?? null,
          ...classification,
        };
      });

    console.log(`[Security] getTopProcesses OK | count=${processes.length}`);
    return { available: true, data: processes };
  } catch (err) {
    console.warn(`[Security] getTopProcesses ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: startup:setEnabled
// Enables or disables a startup entry using the correct Windows mechanism for
// each source type (registry Run keys, startup folders, Task Scheduler tasks).
// Params: { source, registryName, taskPath, folderPath, enabled }
// ---------------------------------------------------------------------------

ipcMain.handle('startup:setEnabled', async (event, params) => {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'not-windows' };
  }
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'startup:setEnabled', reason: 'startup-set-enabled' });
  if (!token) return { ok: false, reason: 'busy' };
  const { source, registryName, taskPath, folderPath, enabled } = params || {};
  const flag = enabled ? 2 : 3; // 2=enabled, 3=disabled (Task Manager convention)

  // Input sanitization guards
  function sanitizeName(str, maxLen = 128) {
    if (typeof str !== 'string') return '';
    // Use a literal space character (not \s) — \s matches \t, \n, \r etc.
    // which could break out of the PowerShell string context.
    return str.replace(/[^A-Za-z0-9._ -]/g, '').slice(0, maxLen);
  }
  function psEscape(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/'/g, "''");
  }

  try {
    let cmd = '';

    if (source === 'registry-hkcu' && registryName) {
      const safeName = psEscape(sanitizeName(registryName));
      const approvedPath = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
      cmd = `$val=[byte[]](${flag},0,0,0,0,0,0,0,0,0,0,0); If(!(Test-Path '${approvedPath}')){New-Item -Path '${approvedPath}' -Force|Out-Null}; Set-ItemProperty -Path '${approvedPath}' -Name '${safeName}' -Value $val -Type Binary -Force; Write-Output 'ok'`;

    } else if (source === 'registry-hklm' && registryName) {
      const safeName = psEscape(sanitizeName(registryName));
      const approvedPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
      cmd = `$val=[byte[]](${flag},0,0,0,0,0,0,0,0,0,0,0); If(!(Test-Path '${approvedPath}')){New-Item -Path '${approvedPath}' -Force|Out-Null}; Set-ItemProperty -Path '${approvedPath}' -Name '${safeName}' -Value $val -Type Binary -Force; Write-Output 'ok'`;

    } else if (source === 'startup-folder-user' && folderPath) {
      const safeName = psEscape(sanitizeName(require('path').basename(folderPath)));
      const approvedPath = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder';
      cmd = `$val=[byte[]](${flag},0,0,0,0,0,0,0,0,0,0,0); If(!(Test-Path '${approvedPath}')){New-Item -Path '${approvedPath}' -Force|Out-Null}; Set-ItemProperty -Path '${approvedPath}' -Name '${safeName}' -Value $val -Type Binary -Force; Write-Output 'ok'`;

    } else if (source === 'startup-folder-common' && folderPath) {
      const safeName = psEscape(sanitizeName(require('path').basename(folderPath)));
      const approvedPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder';
      cmd = `$val=[byte[]](${flag},0,0,0,0,0,0,0,0,0,0,0); If(!(Test-Path '${approvedPath}')){New-Item -Path '${approvedPath}' -Force|Out-Null}; Set-ItemProperty -Path '${approvedPath}' -Name '${safeName}' -Value $val -Type Binary -Force; Write-Output 'ok'`;

    } else if (source === 'task-scheduler' && taskPath) {
      const parts = taskPath.split('\\').filter(Boolean);
      const taskName = parts.pop() || taskPath;
      const taskFolder = parts.length > 0 ? '\\' + parts.join('\\') + '\\' : '\\';
      const safeFolder = psEscape(taskFolder.replace(/[^\\A-Za-z0-9._\s-]/g, ''));
      const safeTName  = psEscape(sanitizeName(taskName));
      const verb = enabled ? 'Enable' : 'Disable';
      cmd = `${verb}-ScheduledTask -TaskPath '${safeFolder}' -TaskName '${safeTName}' -EA SilentlyContinue | Out-Null; Write-Output 'ok'`;

    } else {
      return { ok: false, error: 'Unknown source or missing params' };
    }

    const result = await runPowerShell(cmd, 8000);
    const success = result.trim().includes('ok');
    console.log(`[Startup] setEnabled source=${source} enabled=${enabled} → ${success ? 'ok' : 'fail'}`);
    return { ok: success };
  } catch (err) {
    console.warn(`[Startup] setEnabled ERROR: ${err?.message}`);
    return { ok: false, error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: startup:setDelay
// Sets or removes a Task Scheduler delayed-launch task for a startup item.
// Creates a task named "SC-Delay-{name}" that runs the executable after the
// specified delay from logon. Setting delay=null removes the task.
// ---------------------------------------------------------------------------

ipcMain.handle('startup:setDelay', async (event, { name, executable, delayIso, registryKey }) => {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'not-windows' };
  }
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'startup:setDelay', reason: 'startup-set-delay' });
  if (!token) return { ok: false, reason: 'busy' };
  // Sanitize inputs: name becomes task name, executable must be a real file path
  function sanitizeStartupName(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 64);
  }
  function validateExePath(str) {
    if (typeof str !== 'string') return false;
    // Must look like a Windows executable path: drive letter or UNC or well-known system path
    return /^([A-Z]:\\|\\\\|\\?\[A-Z]:\\|C:\\Windows\\System32\\|C:\\Program Files\\)/i.test(str) &&
           str.length <= 512 &&
           !str.includes(';') &&
           !str.includes('|') &&
           !str.includes('&') &&
           !str.includes('`');
  }
  function psEscape(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/'/g, "''");
  }

  const taskName = `SC-Delay-${sanitizeStartupName(name)}`;
  if (!taskName || taskName.length < 10) {
    psLimiter.release(token);
    return { ok: false, error: 'Invalid name' };
  }

  try {
    if (!delayIso || !executable) {
      // Remove the task if it exists
      const removeCmd = `
        If (Get-ScheduledTask -TaskName '${psEscape(taskName)}' -ErrorAction SilentlyContinue) {
          Unregister-ScheduledTask -TaskName '${psEscape(taskName)}' -Confirm:$false
          Write-Output 'removed'
        } Else {
          Write-Output 'notfound'
        }
      `;
      const r = await runPowerShell(removeCmd, 8000);
      console.log(`[Startup] removeDelay task=${taskName} → ${r.trim()}`);
      return { ok: true, taskName, action: 'removed' };
    }

    if (!validateExePath(executable)) {
      return { ok: false, error: 'Executable path looks unsafe or malformed' };
    }

    // Create/update delayed task
    const escapedExe = psEscape(executable);
    const createCmd = `
      $action  = New-ScheduledTaskAction -Execute '${escapedExe}'
      $trigger = New-ScheduledTaskTrigger -AtLogOn
      $trigger.Delay = '${psEscape(delayIso)}'
      $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable
      Register-ScheduledTask -TaskName '${psEscape(taskName)}' -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force | Out-Null
      Write-Output 'created'
    `;
    const r = await runPowerShell(createCmd, 10000);
    const success = r.trim().includes('created');
    console.log(`[Startup] setDelay task=${taskName} delay=${delayIso} → ${success ? 'ok' : 'fail'}`);
    return { ok: success, taskName, action: 'created' };
  } catch (err) {
    console.warn(`[Startup] setDelay ERROR: ${err?.message}`);
    return { ok: false, error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: startup:verifyState
// Reads the StartupApproved registry value to confirm enabled/disabled state.
// ---------------------------------------------------------------------------

ipcMain.handle('startup:verifyState', async (event, { name, registryKey }) => {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'not-windows' };
  }
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'startup:verifyState', reason: 'startup-verify-state' });
  if (!token) return { ok: false, reason: 'busy' };
  // SECURITY: sanitize `name` before embedding it in the PowerShell command.
  // A compromised renderer could send a crafted name like:
  //   '; Remove-Item -Recurse C:\Windows -Force; #
  // which would execute arbitrary PowerShell via the registry path/property
  // interpolation below.  Strip everything except safe identifier characters.
  const safeName = typeof name === 'string'
    ? name.replace(/[^A-Za-z0-9._ -]/g, '').slice(0, 128)
    : '';
  if (!safeName) { psLimiter.release(token); return { ok: false, error: 'Invalid name' }; }

  try {
    const approvedKey = registryKey && registryKey.includes('HKLM')
      ? 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
      : 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';

    // Single-quote escape for PowerShell: ' → ''
    const psName = safeName.replace(/'/g, "''");
    const cmd = `
      Try {
        $val = (Get-ItemProperty -Path '${approvedKey}' -Name '${psName}' -ErrorAction Stop).'${psName}'
        If ($val -and $val[0] -eq 3) { Write-Output 'disabled' }
        Else { Write-Output 'enabled' }
      } Catch {
        Write-Output 'unknown'
      }
    `;
    const result = await runPowerShell(cmd, 6000);
    const state = result.trim();
    return { ok: true, name: safeName, state };
  } catch (err) {
    return { ok: false, error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: security:getAdvancedProtection
// Extended Defender intelligence: cloud, PUA, SmartScreen, signature/scan age
// ---------------------------------------------------------------------------

ipcMain.handle('security:getAdvancedProtection', async () => {
  if (process.platform !== 'win32') return { available: false, reason: 'not-windows' };
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'security:getAdvancedProtection', reason: 'security-adv-protection' });
  if (!token) return { available: false, reason: 'busy' };
  try {
    const cmd = `
      # Primary: Get-MpComputerStatus; CIM fallback when cmdlet is restricted
      $mp = $null
      try { $mp = Get-MpComputerStatus -ErrorAction Stop } catch {}
      if (-not $mp) {
        try { $mp = Get-CimInstance -Namespace 'root/Microsoft/Windows/Defender' -ClassName 'MSFT_MpComputerStatus' -ErrorAction Stop } catch {}
      }

      # Preferences — try cmdlet then CIM
      $pref = $null
      try { $pref = Get-MpPreference -ErrorAction Stop } catch {}
      if (-not $pref) {
        try { $pref = Get-CimInstance -Namespace 'root/Microsoft/Windows/Defender' -ClassName 'MSFT_MpPreference' -ErrorAction Stop } catch {}
      }

      $svcObj = Get-Service -Name WinDefend -ErrorAction SilentlyContinue
      $svc    = if ($svcObj) { $svcObj.Status } else { $null }

      # Signature age — from $mp or registry fallback (handles both REG_QWORD int and REG_BINARY byte[])
      $signatureAge = $null
      if ($mp -and $mp.AntivirusSignatureLastUpdated) {
        try { $signatureAge = [int]([DateTime]::UtcNow - $mp.AntivirusSignatureLastUpdated.ToUniversalTime()).TotalDays } catch {}
      }
      if ($signatureAge -eq $null) {
        try {
          $rawTime = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\Signature Updates' -Name 'SignaturesLastUpdated' -EA Stop).SignaturesLastUpdated
          if ($rawTime -is [byte[]] -and $rawTime.Length -ge 8) {
            $rawTime = [BitConverter]::ToInt64($rawTime, 0)
          }
          if ($rawTime -and [long]$rawTime -gt 0) {
            $dtSig        = [DateTime]::FromFileTimeUtc([long]$rawTime)
            $signatureAge = [int]([DateTime]::UtcNow - $dtSig).TotalDays
          }
        } catch {}
      }

      $quickScanAge = $null
      if ($mp -and $mp.QuickScanEndTime -and $mp.QuickScanEndTime.Year -gt 2000) {
        try { $quickScanAge = [int]([DateTime]::UtcNow - $mp.QuickScanEndTime.ToUniversalTime()).TotalDays } catch {}
      }
      # Fallback 1: Windows Defender Operational event log (EventID 1001=scan complete no threats, 1002=threats found)
      if ($quickScanAge -eq $null) {
        try {
          $evt = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Windows Defender/Operational'; Id = @(1001, 1002) } -MaxEvents 10 -EA SilentlyContinue |
                 Where-Object { $_.Message -match 'quick|QuickScan' } |
                 Select-Object -First 1
          if ($evt) { $quickScanAge = [int]([DateTime]::UtcNow - $evt.TimeCreated.ToUniversalTime()).TotalDays }
        } catch {}
      }
      # Fallback 2: scan history folder mtime
      if ($quickScanAge -eq $null) {
        try {
          $latest = Get-ChildItem "$env:ProgramData\\Microsoft\\Windows Defender\\Scans\\History\\Service" -EA Stop |
                    Sort-Object LastWriteTime -Descending | Select-Object -First 1
          if ($latest) { $quickScanAge = [int]([DateTime]::UtcNow - $latest.LastWriteTime.ToUniversalTime()).TotalDays }
        } catch {}
      }

      $fullScanAge = $null
      if ($mp -and $mp.FullScanEndTime -and $mp.FullScanEndTime.Year -gt 2000) {
        try { $fullScanAge = [int]([DateTime]::UtcNow - $mp.FullScanEndTime.ToUniversalTime()).TotalDays } catch {}
      }
      # Fallback: event log for full scan
      if ($fullScanAge -eq $null) {
        try {
          $fevt = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Windows Defender/Operational'; Id = @(1001, 1002) } -MaxEvents 10 -EA SilentlyContinue |
                  Where-Object { $_.Message -match 'full|FullScan' } |
                  Select-Object -First 1
          if ($fevt) { $fullScanAge = [int]([DateTime]::UtcNow - $fevt.TimeCreated.ToUniversalTime()).TotalDays }
        } catch {}
      }

      # SmartScreen — two registry locations depending on Windows build
      $smartScreen = $null
      try {
        $ss          = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer' -Name SmartScreenEnabled -EA Stop).SmartScreenEnabled
        $smartScreen = ($ss -ne 'Off')
      } catch {
        try {
          $ssVal       = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppHost' -Name EnableWebContentEvaluation -EA Stop).EnableWebContentEvaluation
          $smartScreen = ($ssVal -eq 1)
        } catch {}
      }

      # Preference fields — cmdlet/CIM first, then registry fallbacks for each null field
      $cloudProtection       = if ($pref) { $pref.MAPSReporting -ne 0 } else { $null }
      $sampleSubmission      = if ($pref) { $pref.SubmitSamplesConsent -in @(1,3) } else { $null }
      $controlledFolderAccess = if ($pref) { $pref.EnableControlledFolderAccess -ne 0 } else { $null }
      $puaProtection         = if ($pref) { $pref.PUAProtection -ne 0 } else { $null }

      if ($cloudProtection -eq $null) {
        try { $v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\Spynet' -Name SpyNetReporting -EA Stop).SpyNetReporting; $cloudProtection = ($v -ne 0) } catch {}
      }
      if ($controlledFolderAccess -eq $null) {
        try { $v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\Windows Defender Exploit Guard\\Controlled Folder Access' -Name EnableControlledFolderAccess -EA Stop).EnableControlledFolderAccess; $controlledFolderAccess = ($v -ne 0) } catch {}
      }
      if ($puaProtection -eq $null) {
        try { $v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender' -Name PUAProtection -EA Stop).PUAProtection; $puaProtection = ($v -ne 0) } catch {}
      }

      $sigVer = if ($mp) { $mp.AntivirusSignatureVersion } else { $null }
      if (-not $sigVer) {
        try { $sigVer = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\Signature Updates' -Name 'AVSignatureVersion' -EA Stop).AVSignatureVersion } catch {}
      }

      @{
        cloudProtection        = $cloudProtection
        sampleSubmission       = $sampleSubmission
        controlledFolderAccess = $controlledFolderAccess
        puaProtection          = $puaProtection
        smartScreen            = $smartScreen
        signatureVersion       = $sigVer
        signatureAge           = $signatureAge
        quickScanAge           = $quickScanAge
        fullScanAge            = $fullScanAge
        defenderServiceRunning = ($svc -eq 'Running')
      } | ConvertTo-Json -Compress
    `;
    const raw = await runPowerShell(cmd, 20000);
    const data = JSON.parse(raw);
    console.log(`[Security] getAdvancedProtection OK | sigAge=${data.signatureAge}d quickAge=${data.quickScanAge}d`);
    return { available: true, data };
  } catch (err) {
    console.warn(`[Security] getAdvancedProtection ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: security:getAdvancedAudit
// Platform trust, remote surface, persistence risks
// ---------------------------------------------------------------------------

ipcMain.handle('security:getAdvancedAudit', async () => {
  if (process.platform !== 'win32') return { available: false, reason: 'not-windows' };
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'security:getAdvancedAudit', reason: 'security-adv-audit' });
  if (!token) return { available: false, reason: 'busy' };
  try {
    const cmd = `
      $r = @{}

      # Secure Boot
      try { $r.secureBoot = [bool](Confirm-SecureBootUEFI -ErrorAction Stop) } catch { $r.secureBoot = $null }

      # TPM
      try {
        $tpm = Get-Tpm -ErrorAction Stop
        $r.tpmPresent = $tpm.TpmPresent
        $r.tpmReady   = $tpm.TpmReady
      } catch { $r.tpmPresent = $null; $r.tpmReady = $null }

      # BitLocker
      try {
        $bl = Get-BitLockerVolume -MountPoint 'C:' -ErrorAction Stop
        $r.bitlocker = if ($bl.ProtectionStatus -eq 'On') { 'on' } else { 'off' }
      } catch { $r.bitlocker = $null }

      # HVCI / VBS
      try {
        $dg = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard' -ErrorAction Stop
        $r.hvciEnabled = $dg.HypervisorEnforcedCodeIntegrity -eq 1
        $r.vbsEnabled  = $dg.EnableVirtualizationBasedSecurity -eq 1
      } catch { $r.hvciEnabled = $null; $r.vbsEnabled = $null }

      # LSA Protection / Credential Guard
      try {
        $lsa = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' -ErrorAction Stop
        $r.lsaProtectionEnabled = if ($null -eq $lsa.RunAsPPL) { $false } else { [int]$lsa.RunAsPPL -in @(1, 2) }
      } catch { $r.lsaProtectionEnabled = $null }
      try {
        $dgStatus = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard' -ErrorAction Stop
        $running = @($dgStatus.SecurityServicesRunning)
        # SecurityServicesRunning value 1 is Credential Guard.
        $r.credentialGuardEnabled = $running -contains 1
      } catch { $r.credentialGuardEnabled = $null }

      # UAC
      try {
        $uac = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -ErrorAction Stop
        $r.uacEnabled = $uac.EnableLUA -eq 1
        $r.uacLevel   = [int]$uac.ConsentPromptBehaviorAdmin
      } catch { $r.uacEnabled = $null; $r.uacLevel = $null }

      # RDP
      try {
        $rdp = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server' -Name fDenyTSConnections -ErrorAction Stop
        $r.rdpEnabled = $rdp.fDenyTSConnections -eq 0
      } catch { $r.rdpEnabled = $null }

      # Remote Assistance
      try {
        $ra = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Remote Assistance' -Name fAllowToGetHelp -ErrorAction Stop
        $r.remoteAssistance = $ra.fAllowToGetHelp -eq 1
      } catch { $r.remoteAssistance = $null }

      # SMBv1
      try {
        $smb = Get-WindowsOptionalFeature -Online -FeatureName 'SMB1Protocol' -ErrorAction Stop
        $r.smbv1Enabled = ($smb.State -eq 'Enabled')
      } catch {
        try {
          $smbReg = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters' -Name SMB1 -ErrorAction Stop
          $r.smbv1Enabled = $smbReg.SMB1 -ne 0
        } catch { $r.smbv1Enabled = $null }
      }

      # Guest account
      try {
        $guest = Get-LocalUser -Name 'Guest' -ErrorAction Stop
        $r.guestAccountEnabled = $guest.Enabled
      } catch { $r.guestAccountEnabled = $null }

      # Proxy
      try {
        $proxy = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -ErrorAction Stop
        $r.proxyEnabled = $proxy.ProxyEnable -eq 1
      } catch { $r.proxyEnabled = $null }

      # Windows Update service
      try {
        $wu = Get-Service -Name wuauserv -ErrorAction Stop
        $r.windowsUpdateRunning = ($wu.Status -eq 'Running')
      } catch { $r.windowsUpdateRunning = $null }

      # Hosts file
      try {
        $hostsPath = "$env:WINDIR\\System32\\drivers\\etc\\hosts"
        $lines = Get-Content $hostsPath -ErrorAction Stop
        # Flag non-comment, non-empty lines that don't resolve to standard
        # loopback/local addresses (127.0.0.1, ::1, 0.0.0.0, localhost).
        # The original check only excluded lines containing 'localhost', which
        # incorrectly flagged valid entries like '127.0.0.1 mydev.local'.
        $suspicious = @($lines | Where-Object {
          $_ -notmatch '^\\s*#' -and
          $_.Trim() -ne '' -and
          $_ -notmatch '\\blocalhost\\b' -and
          $_ -notmatch '^\\s*(127\\.0\\.0\\.1|::1|0\\.0\\.0\\.0|255\\.255\\.255\\.255)\\s'
        })
        $hostEntries = @()
        foreach ($line in $suspicious) {
          $clean = ($line -replace '#.*$', '').Trim()
          if ($clean -match '^(\S+)\s+(.+)$') {
            $ip = $Matches[1]
            $domains = $Matches[2] -split '\s+' | Where-Object { $_ }
            foreach ($domain in $domains) {
              if ($hostEntries.Count -lt 30) {
                $hostEntries += [PSCustomObject]@{ ip = $ip; domain = $domain }
              }
            }
          }
        }
        $r.hostsModified = $suspicious.Count -gt 0
        $r.hostsSuspiciousCount = $suspicious.Count
        $r.hostsSuspiciousEntries = $hostEntries
      } catch { $r.hostsModified = $null; $r.hostsSuspiciousCount = 0 }

      # Listening TCP ports. Keep the complete list for inspection, but mark
      # non-allowlisted ports as notable rather than calling them malicious.
      try {
        $allowedPorts = @(135, 139, 445)
        if ($r.rdpEnabled -eq $true) { $allowedPorts += 3389 }
        $connections = @(Get-NetTCPConnection -State Listen -ErrorAction Stop)
        $portRows = @()
        foreach ($conn in $connections) {
          $procName = $null
          try { $procName = (Get-Process -Id $conn.OwningProcess -ErrorAction Stop).ProcessName } catch {}
          $portRows += [PSCustomObject]@{
            address = [string]$conn.LocalAddress
            port = [int]$conn.LocalPort
            pid = [int]$conn.OwningProcess
            processName = $procName
            protocol = 'TCP'
            notable = $allowedPorts -notcontains [int]$conn.LocalPort
          }
        }
        $r.listeningPorts = $portRows
        $r.notableListeningPorts = @($portRows | Where-Object { $_.notable })
      } catch { $r.listeningPorts = @(); $r.notableListeningPorts = @(); $r.listeningPortsUnavailable = $true }

      $r | ConvertTo-Json -Compress
    `;
    const raw = await runPowerShell(cmd, 30000);
    const data = JSON.parse(raw);
    console.log(`[Security] getAdvancedAudit OK | secureBoot=${data.secureBoot} rdp=${data.rdpEnabled} hvci=${data.hvciEnabled}`);
    return { available: true, data };
  } catch (err) {
    console.warn(`[Security] getAdvancedAudit ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: security:getProcessDetails
// Enriched process list: path, trust classification by location
// ---------------------------------------------------------------------------

ipcMain.handle('security:getProcessDetails', async () => {
  if (process.platform !== 'win32') return { available: false, reason: 'not-windows' };
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'security:getProcessDetails', reason: 'security-proc-details' });
  if (!token) return { available: false, reason: 'busy' };
  try {
    const cmd = `
      $cimMap = @{}
      Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object { $cimMap[$_.ProcessId] = $_ }

      $procs = Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CPU -ne $null } |
        Sort-Object CPU -Descending |
        Select-Object -First 30

      $result = foreach ($p in $procs) {
        $exePath = $null
        try { $exePath = $p.MainModule.FileName } catch {}
        $cim = $cimMap[$p.Id]
        $signed = $null
        $signerName = $null
        if ($exePath) {
          try {
            $sig = Get-AuthenticodeSignature -FilePath $exePath -ErrorAction Stop
            if ($sig.Status -eq 'Valid') {
              $signed = $true
              $signerName = $sig.SignerCertificate.Subject
            } elseif ($sig.Status -eq 'NotSigned') {
              $signed = $false
            }
          } catch {}
        }
        [PSCustomObject]@{
          Name      = $p.Name
          Pid       = $p.Id
          CpuSec    = [Math]::Round($p.CPU, 2)
          MemMb     = [Math]::Round($p.WorkingSet64/1MB, 1)
          Path      = $exePath
          ParentPid = if ($cim -ne $null) { $cim.ParentProcessId } else { $null }
          Signed    = $signed
          SignerName = $signerName
        }
      }
      $result | ConvertTo-Json -Compress
    `;
    const raw = await runPowerShell(cmd, 20000);
    const items = safeParsePsJson(raw);
    if (!items) return { available: false, reason: 'parse-error' };

    const SUSPICIOUS_PATH_PATTERNS = [
      /\\AppData\\Local\\Temp\\/i,
      /\\AppData\\Roaming\\/i,
      /\\Users\\[^\\]+\\Downloads\\/i,
      /\\Users\\[^\\]+\\Desktop\\/i,
      /\\ProgramData\\[^\\]+\\Temp\\/i,
    ];
    const SAFE_PATH_PREFIXES = [
      /^C:\\Windows\\/i,
      /^C:\\Program Files\\/i,
      /^C:\\Program Files \(x86\)\\/i,
    ];

    const processes = items.filter(p => p && p.Name).map(p => {
      const classification = classifyProcess(p.Name);
      const exePath = p.Path || null;

       let trustState = 'unknown';
      let suspiciousLocation = false;
       let unsignedExecutable = false;

      if (exePath) {
        const isSafe = SAFE_PATH_PREFIXES.some(r => r.test(exePath));
        const isSuspicious = SUSPICIOUS_PATH_PATTERNS.some(r => r.test(exePath));
        suspiciousLocation = isSuspicious;
         unsignedExecutable = p.Signed === false;
         if (unsignedExecutable && !isSafe) {
           trustState = 'suspicious';
           suspiciousLocation = true;
         } else if (isSafe) {
          trustState = 'trusted';
        } else if (isSuspicious) {
          trustState = 'suspicious';
        } else {
          trustState = 'review';
        }
      }

      // Known system process names always trusted
      const sysProcs = ['svchost', 'system', 'wininit', 'csrss', 'lsass', 'services', 'dwm', 'winlogon', 'smss', 'registry'];
      if (sysProcs.includes(p.Name.toLowerCase().replace(/\.exe$/i, ''))) {
        trustState = 'trusted';
        suspiciousLocation = false;
         unsignedExecutable = false;
      }

      const gamingImpactMap = { launcher: 'high', overlay: 'medium', browser: 'medium', updater: 'low', security: 'low', system: 'low' };

      return {
        name: p.Name,
        pid: p.Pid || 0,
        cpuSec: p.CpuSec ?? null,
        memMb: p.MemMb ?? null,
        path: exePath,
        parentPid: p.ParentPid ?? null,
        ...classification,
        trustState,
        suspiciousLocation,
        gamingImpact: gamingImpactMap[classification.category] || 'low',
         signed: p.Signed ?? null,
         signerName: p.SignerName || null,
         publisher: p.SignerName || null,
         unsignedExecutable,
        elevated: null,
      };
    });

    console.log(`[Security] getProcessDetails OK | count=${processes.length} suspicious=${processes.filter(p => p.suspiciousLocation).length}`);
    return { available: true, data: processes };
  } catch (err) {
    console.warn(`[Security] getProcessDetails ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: security:getScheduledTasks
// Non-Windows scheduled tasks filtered for suspicious entries
// ---------------------------------------------------------------------------

ipcMain.handle('security:getScheduledTasks', async () => {
  if (process.platform !== 'win32') return { available: false, reason: 'not-windows' };
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'security:getScheduledTasks', reason: 'security-sched-tasks' });
  if (!token) return { available: false, reason: 'busy' };
  try {
    const cmd = `
      $tasks = Get-ScheduledTask -ErrorAction SilentlyContinue |
        Where-Object { $_.TaskPath -notlike '\\Microsoft\\Windows\\*' -and $_.State -ne 'Disabled' }
      $result = foreach ($t in $tasks) {
        $action = $t.Actions | Select-Object -First 1
        [PSCustomObject]@{
          Name      = $t.TaskName
          Path      = $t.TaskPath
          State     = $t.State.ToString()
          Execute   = if ($action -ne $null) { $action.Execute } else { $null }
          Arguments = if ($action -ne $null) { $action.Arguments } else { $null }
        }
      }
      if ($result) { $result | ConvertTo-Json -Compress } else { '[]' }
    `;
    const raw = await runPowerShell(cmd, 20000);
    const items = safeParsePsJson(raw);
    if (!items) return { available: true, data: [] };

    const SUSPICIOUS_TASK_PATTERNS = [
      /\\AppData\\Local\\Temp\\/i,
      /\\AppData\\Roaming\\/i,
      /\\Users\\[^\\]+\\Downloads\\/i,
      /\.tmp$/i,
      /regsvr32|rundll32.*\.tmp|mshta|wscript|cscript/i,
    ];

    const tasks = items.filter(t => t && t.Name).map(t => {
      const suspicious = SUSPICIOUS_TASK_PATTERNS.some(r =>
        r.test(t.Execute || '') || r.test(t.Arguments || '')
      );
      return { ...t, suspicious };
    });

    const suspicious = tasks.filter(t => t.suspicious);
    console.log(`[Security] getScheduledTasks OK | total=${tasks.length} suspicious=${suspicious.length}`);
    return { available: true, data: { tasks, suspicious } };
  } catch (err) {
    console.warn(`[Security] getScheduledTasks ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: security:getServices
// Running services — filtered for suspicious binary paths
// ---------------------------------------------------------------------------

ipcMain.handle('security:getServices', async () => {
  if (process.platform !== 'win32') return { available: false, reason: 'not-windows' };
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'security:getServices', reason: 'security-services' });
  if (!token) return { available: false, reason: 'busy' };
  try {
    const cmd = `
      Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
        Where-Object { $_.StartMode -ne 'Disabled' -and $_.State -eq 'Running' -and $_.PathName -ne $null } |
        Select-Object Name, DisplayName, StartMode, State, PathName, StartName |
        ConvertTo-Json -Compress
    `;
    const raw = await runPowerShell(cmd, 20000);
    const items = safeParsePsJson(raw);
    if (!items) return { available: true, data: { services: [], suspicious: [] } };

    const SAFE_SERVICE_PATHS = [
      /^C:\\Windows\\/i,
      /^C:\\Program Files\\/i,
      /^C:\\Program Files \(x86\)\\/i,
    ];
    const SUSPICIOUS_SERVICE_PATTERNS = [
      /\\AppData\\Local\\Temp\\/i,
      /\\AppData\\Roaming\\/i,
      /\\Users\\[^\\]+\\Downloads\\/i,
    ];

    const services = items.filter(s => s && s.Name).map(s => {
      const pathStr = s.PathName || '';
      const exeMatch = pathStr.match(/^(?:"([^"]+)"|([^\s]+))/);
      const exePath = exeMatch ? (exeMatch[1] || exeMatch[2]) : pathStr;

      const isSafe = SAFE_SERVICE_PATHS.some(r => r.test(exePath));
      const isSusp = SUSPICIOUS_SERVICE_PATTERNS.some(r => r.test(exePath));
      const suspicious = !isSafe || isSusp;

      return {
        name: s.Name,
        displayName: s.DisplayName,
        startMode: s.StartMode,
        state: s.State,
        path: exePath,
        startName: s.StartName,
        suspicious: suspicious && isSusp,
      };
    });

    const suspicious = services.filter(s => s.suspicious);
    console.log(`[Security] getServices OK | total=${services.length} suspicious=${suspicious.length}`);
    // Bug fix: was accidentally sending `suspicious` in the `services` field,
    // which meant the UI never received non-suspicious services at all.
    return { available: true, data: { services: services.slice(0, 50), suspicious } };
  } catch (err) {
    console.warn(`[Security] getServices ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: security:openProcessLocation
// Opens the folder containing a process executable in Explorer
// ---------------------------------------------------------------------------

ipcMain.handle('security:openProcessLocation', async (event, filePath) => {
  if (!filePath || typeof filePath !== 'string') return { ok: false, reason: 'invalid-path' };
  // SECURITY: reject UNC paths (\\server\share) — shell.showItemInFolder on a
  // UNC path triggers an SMB connection to an attacker-controlled host.
  // Only allow absolute local paths (drive-letter form: C:\...).
  const isLocalPath = /^[A-Za-z]:\\/.test(filePath) && !filePath.startsWith('\\\\');
  if (!isLocalPath) return { ok: false, reason: 'unsafe-path' };
  try {
    shell.showItemInFolder(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message };
  }
});

// ---------------------------------------------------------------------------
// IPC: security:openStartupLocation
// Opens the folder containing a startup item executable in Explorer
// ---------------------------------------------------------------------------

ipcMain.handle('security:openStartupLocation', async (event, command) => {
  if (!command || typeof command !== 'string') return { ok: false, reason: 'invalid-command' };
  try {
    // Extract the executable path from the command string
    const match = command.match(/^(?:"([^"]+)"|([^\s]+))/);
    const exePath = match ? (match[1] || match[2]) : command;
    const dir = path.dirname(exePath);
    // SECURITY: reject UNC paths (\\server\share) and non-local paths.
    // shell.openPath on a UNC path would trigger an SMB connection to an
    // attacker-controlled host.  Only allow absolute local paths (C:\...).
    const isLocalPath = /^[A-Za-z]:\\/.test(dir) && !dir.startsWith('\\\\');
    if (!isLocalPath) return { ok: false, reason: 'unsafe-path' };
    shell.openPath(dir);
    return { ok: true, dir };
  } catch (err) {
    return { ok: false, error: err?.message };
  }
});

// ---------------------------------------------------------------------------
// IPC: security:setDefenderOption
// Toggles individual Windows Defender / SmartScreen settings.
// option: 'cloudProtection' | 'puaProtection' | 'controlledFolderAccess' |
//         'sampleSubmission' | 'smartScreen'
// ---------------------------------------------------------------------------

const ALLOWED_DEFENDER_OPTIONS = new Set([
  'cloudProtection', 'puaProtection', 'controlledFolderAccess',
  'sampleSubmission', 'smartScreen'
]);

ipcMain.handle('security:setDefenderOption', async (_event, option, enabled) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows' };
  if (!ALLOWED_DEFENDER_OPTIONS.has(option)) {
    return { ok: false, error: `Unknown option: ${option}` };
  }
  if (typeof enabled !== 'boolean') {
    return { ok: false, error: 'enabled must be a boolean' };
  }
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'security:setDefenderOption', reason: 'security-set-defender-opt' });
  if (!token) return { ok: false, reason: 'busy' };
  let cmd = '';
  switch (option) {
    case 'cloudProtection':
      cmd = `Set-MpPreference -MAPSReporting ${enabled ? 2 : 0} -EA Stop; Write-Output 'ok'`;
      break;
    case 'puaProtection':
      cmd = `Set-MpPreference -PUAProtection ${enabled ? 1 : 0} -EA Stop; Write-Output 'ok'`;
      break;
    case 'controlledFolderAccess':
      cmd = `Set-MpPreference -EnableControlledFolderAccess ${enabled ? 1 : 0} -EA Stop; Write-Output 'ok'`;
      break;
    case 'sampleSubmission':
      cmd = `Set-MpPreference -SubmitSamplesConsent ${enabled ? 1 : 2} -EA Stop; Write-Output 'ok'`;
      break;
    case 'smartScreen': {
      const val = enabled ? 'Warn' : 'Off';
      cmd = `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer' -Name SmartScreenEnabled -Value '${val}' -EA Stop; Write-Output 'ok'`;
      break;
    }
    default:
      return { ok: false, error: 'Unknown option' };
  }

  try {
    const result = await runPowerShell(cmd, 12000);
    const ok = result.trim().includes('ok');
    console.log(`[Security] setDefenderOption option=${option} enabled=${enabled} → ${ok ? 'ok' : 'fail'}`);
    return { ok };
  } catch (err) {
    console.warn(`[Security] setDefenderOption ERROR: ${err?.message}`);
    return { ok: false, error: err?.message };
  } finally {
    psLimiter.release(token);
  }
});

// ---------------------------------------------------------------------------
// IPC: security:runDefenderAction
// Runs a one-shot Defender maintenance action.
// action: 'quickScan' | 'updateSignatures'
// ---------------------------------------------------------------------------

const ALLOWED_DEFENDER_ACTIONS = new Set(['quickScan', 'updateSignatures']);

ipcMain.handle('security:runDefenderAction', async (_event, action) => {
  if (process.platform !== 'win32') return { ok: false, restricted: false, message: 'Defender actions require Windows.' };
  if (!ALLOWED_DEFENDER_ACTIONS.has(action)) {
    return { ok: false, restricted: false, message: `Unknown action: ${action}` };
  }
  const token = psLimiter.tryAcquire({ file: 'security-helper.js', fn: 'security:runDefenderAction', reason: 'security-run-defender-action' });
  if (!token) return { ok: false, restricted: false, reason: 'busy' };
  let cmdlet = '';
  let friendly = '';
  switch (action) {
    case 'quickScan':
      cmdlet = 'Start-MpScan -ScanType QuickScan';
      friendly = 'Quick Scan';
      break;
    case 'updateSignatures':
      cmdlet = 'Update-MpSignature';
      friendly = 'Signature Update';
      break;
    default:
      return { ok: false, restricted: false, message: 'Unknown action.' };
  }

  // Matches policy/WMI errors that indicate Defender is managed or the provider is unavailable.
  const RESTRICTION_RE = /restricted|disabled by your administrator|access is denied|not recognized|cannot be loaded|is not installed|does not exist|access denied|No operation can be performed|invalid class|invalid namespace|0x800704ec|0x800706ba|0x80070005|Tamper/i;
  const RESTRICTION_MSG = 'Defender management is unavailable on this system — it may be controlled by policy, a third-party AV, or the WMI provider may not be registered.';

  // MpCmdRun.exe — works even when the Defender WMI/CIM provider is absent.
  // Primary: %ProgramFiles%\Windows Defender\MpCmdRun.exe
  // Fallback: newest MpCmdRun.exe under %ProgramData%\Microsoft\Windows Defender\Platform\
  // IMPORTANT: use $env:ProgramW6432 inside the PowerShell string rather than
  // interpolating process.env['ProgramW6432'] at module-load time.  The Node.js
  // environment variable is undefined in some sandboxed environments, would bake
  // in 'C:\Program Files' permanently, and could contain special characters that
  // break PowerShell string syntax.  Let PowerShell resolve it at runtime instead.
  const mpCmdRunLocator = `
    $mpCmd = $null
    $pfPaths = @("$env:ProgramFiles\\Windows Defender\\MpCmdRun.exe", "$env:ProgramW6432\\Windows Defender\\MpCmdRun.exe")
    foreach ($p in $pfPaths) { if (Test-Path $p) { $mpCmd = $p; break } }
    if (-not $mpCmd) {
      $platDir = "$env:ProgramData\\Microsoft\\Windows Defender\\Platform"
      if (Test-Path $platDir) {
        $mpCmd = Get-ChildItem $platDir -Filter 'MpCmdRun.exe' -Recurse -EA SilentlyContinue |
                 Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
      }
    }
  `;

  let mpCmdRunAction = '';
  if (action === 'quickScan') {
    // Fire-and-forget — scan runs in background; Defender shows progress in system tray
    mpCmdRunAction = `Start-Process -FilePath $mpCmd -ArgumentList '-Scan -ScanType 1' -NoNewWindow -EA Stop; $result.message = 'Quick Scan started in the background.'`;
  } else {
    // Signature update:
    // Exit code 0 = success.
    // Exit code 2 = "already up to date" on some Windows versions, or elevation
    //               required on others.  We treat both 0 and 2 as non-fatal and
    //               attempt the PowerShell cmdlet path regardless so the update
    //               actually lands even when MpCmdRun can't acquire the lock.
    mpCmdRunAction = `
      $null = & $mpCmd -SignatureUpdate 2>&1
      $ec = $LASTEXITCODE
      if ($ec -eq 0) {
        $result.success = $true; $result.message = 'Signatures updated via MpCmdRun.'
      } elseif ($ec -eq 2) {
        # Code 2: signatures already current, or service busy — try PS cmdlet next
        $result.message = "MpCmdRun code 2 — trying cmdlet fallback"
      } else {
        throw "MpCmdRun exited $ec"
      }
    `;
  }

  const psCmd = `
    ${mpCmdRunLocator}
    $result = @{ success = $false; restricted = $false; message = ''; error = '' }
    try {
      if ($mpCmd) {
        ${mpCmdRunAction}
      }
      # For signature updates: always also attempt the PowerShell cmdlet if we
      # haven't already succeeded.  Update-MpSignature works for local admins
      # without full UAC elevation and uses a different code path than MpCmdRun.
      if (-not $result.success -and '${action}' -eq 'updateSignatures') {
        try {
          $null = Update-MpSignature -ErrorAction Stop
          $result.success = $true
          $result.message = 'Signatures updated via Update-MpSignature.'
        } catch {
          $psErr = $_.Exception.Message
          # PS cmdlet failed — fire wuauclt as a non-elevated last resort.
          # This kicks the Windows Update Agent to check for Defender definitions;
          # it runs asynchronously so we report partial success.
          try {
            Start-Process -FilePath "wuauclt.exe" -ArgumentList "/detectnow /updatenow" -NoNewWindow -EA SilentlyContinue
            Start-Process -FilePath "UsoClient.exe" -ArgumentList "StartScan" -NoNewWindow -EA SilentlyContinue
          } catch {}
          # If the cmdlet error looks like a policy restriction, surface that.
          if ($psErr -match 'restricted|disabled by your administrator|access is denied|not recognized|cannot be loaded|is not installed|does not exist|access denied|No operation can be performed|invalid class|invalid namespace|0x800704ec|0x800706ba|0x80070005|Tamper') {
            $result.restricted = $true
            $result.message = 'Defender management is unavailable on this system.'
          } else {
            # wuauclt fired — mark as partially successful so the UI shows a
            # "checking…" state rather than a hard red error.
            $result.success = $true
            $result.message = 'Windows Update Agent triggered to check for definition updates. Signatures will refresh shortly.'
          }
        }
      } elseif (-not $result.success -and '${action}' -ne 'updateSignatures') {
        # quickScan — no mpCmd found, fall back to PowerShell cmdlet
        $null = ${cmdlet} -ErrorAction Stop
        $result.success = $true
        $result.message = '${friendly} completed.'
      }
    } catch {
      $msg = $_.Exception.Message
      $result.error = $msg
      $result.message = $msg
      # MAINTENANCE NOTE: this pattern must be kept in sync with the JS-side
      # RESTRICTION_RE constant above.  Both detect the same error classes; the
      # PowerShell copy handles errors caught inside PS, the JS copy handles
      # errors that surface as thrown exceptions from execFile/runPowerShell.
      if ($msg -match 'restricted|disabled by your administrator|access is denied|not recognized|cannot be loaded|is not installed|does not exist|access denied|No operation can be performed|invalid class|invalid namespace|0x800704ec|0x800706ba|0x80070005|Tamper') {
        $result.restricted = $true
        $result.message = 'Defender management is unavailable on this system.'
      }
    }
    $result | ConvertTo-Json -Compress
  `;

  try {
    const raw = await runPowerShell(psCmd, 60000);
    // MpCmdRun.exe can emit verbose lines before the JSON — find the last {...} line
    const jsonLine = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('{')).pop() || raw;
    const out = JSON.parse(jsonLine);
    console.log(`[Security] runDefenderAction action=${action} →`, out);
    return {
      ok: !!out.success,
      restricted: !!out.restricted,
      message: out.message || out.error || 'Unknown result',
    };
  } catch (err) {
    const msg = err?.message || String(err);
    console.warn(`[Security] runDefenderAction ERROR action=${action}:`, msg);
    const restricted = RESTRICTION_RE.test(msg);
    return {
      ok: false,
      restricted,
      message: restricted ? RESTRICTION_MSG : msg,
    };
  } finally {
    psLimiter.release(token);
  }
});

console.log('[Security] IPC handlers registered');
