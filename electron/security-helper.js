/**
 * security-helper.js
 * Electron IPC handlers for Windows system integrity data.
 * All handlers are Windows-only and return { available: false } on other platforms or on error.
 */

const { ipcMain } = require('electron');
const { execFile } = require('child_process');

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

ipcMain.handle('security:getStatus', async () => {
  if (process.platform !== 'win32') {
    return { available: false, reason: 'not-windows' };
  }

  const result = { available: false, data: null, error: null };

  try {
    // Get-MpComputerStatus (Windows Defender)
    const mpCmd = `$mp = Get-MpComputerStatus -ErrorAction SilentlyContinue; if ($mp) { $mp | Select-Object AMRunningMode, AntivirusEnabled, AntispywareEnabled, RealTimeProtectionEnabled, NISEnabled, TamperProtectionSource, QuickScanEndTime, FullScanEndTime, AMEngineVersion, AntivirusSignatureVersion | ConvertTo-Json -Compress } else { 'null' }`;
    const mpRaw = await runPowerShell(mpCmd);
    let mpData = null;
    if (mpRaw !== 'null') {
      try { mpData = JSON.parse(mpRaw); } catch {}
    }

    // Get-NetFirewallProfile (check if Domain or Private profile is enabled)
    let firewallEnabled = null;
    try {
      const fwCmd = `Get-NetFirewallProfile -Name 'Private' -ErrorAction SilentlyContinue | Select-Object Enabled | ConvertTo-Json -Compress`;
      const fwRaw = await runPowerShell(fwCmd, 5000);
      const fwData = JSON.parse(fwRaw);
      firewallEnabled = fwData?.Enabled === true;
    } catch {}

    if (!mpData && firewallEnabled === null) {
      return { available: false, reason: 'defender-unavailable' };
    }

    result.available = true;
    result.data = {
      realtimeProtection: mpData?.RealTimeProtectionEnabled ?? null,
      tamperProtection: mpData?.TamperProtectionSource != null ? mpData.TamperProtectionSource !== 0 : null,
      antispywareEnabled: mpData?.AntispywareEnabled ?? null,
      defenderAvailable: mpData != null,
      firewallEnabled,
      engineVersion: mpData?.AMEngineVersion ?? null,
      signatureVersion: mpData?.AntivirusSignatureVersion ?? null,
      lastQuickScan: mpData?.QuickScanEndTime ? new Date(mpData.QuickScanEndTime).toISOString() : null,
      lastFullScan: mpData?.FullScanEndTime ? new Date(mpData.FullScanEndTime).toISOString() : null,
      source: 'electron',
    };

    console.log(`[Security] getStatus OK | realtime=${result.data.realtimeProtection} firewall=${firewallEnabled}`);
    return result;
  } catch (err) {
    console.warn(`[Security] getStatus ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
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
  }
});

// ---------------------------------------------------------------------------
// IPC: startup:setEnabled
// Enables or disables a startup item using the Windows StartupApproved registry key.
// This is the same mechanism used by Task Manager — does not delete the run entry.
// ---------------------------------------------------------------------------

ipcMain.handle('startup:setEnabled', async (event, { name, registryKey, enabled }) => {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'not-windows' };
  }

  try {
    // Determine the StartupApproved subkey from the run key location
    let approvedKey;
    if (registryKey && registryKey.includes('HKLM')) {
      approvedKey = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
    } else {
      approvedKey = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
    }

    // 02 00... = enabled, 03 00... = disabled (Task Manager convention)
    const byteValue = enabled
      ? '[byte[]](2,0,0,0,0,0,0,0,0,0,0,0)'
      : '[byte[]](3,0,0,0,0,0,0,0,0,0,0,0)';

    const cmd = `
      $key = '${approvedKey}'
      If (!(Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
      Set-ItemProperty -Path $key -Name '${name}' -Value ${byteValue} -Type Binary -Force
      Write-Output 'ok'
    `;

    const result = await runPowerShell(cmd, 8000);
    const success = result.trim().includes('ok');
    console.log(`[Startup] setEnabled name=${name} enabled=${enabled} → ${success ? 'ok' : 'fail'}`);
    return { ok: success, name, enabled };
  } catch (err) {
    console.warn(`[Startup] setEnabled ERROR: ${err?.message}`);
    return { ok: false, error: err?.message };
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

  const taskName = `SC-Delay-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;

  try {
    if (!delayIso || !executable) {
      // Remove the task if it exists
      const removeCmd = `
        If (Get-ScheduledTask -TaskName '${taskName}' -ErrorAction SilentlyContinue) {
          Unregister-ScheduledTask -TaskName '${taskName}' -Confirm:$false
          Write-Output 'removed'
        } Else {
          Write-Output 'notfound'
        }
      `;
      const r = await runPowerShell(removeCmd, 8000);
      console.log(`[Startup] removeDelay task=${taskName} → ${r.trim()}`);
      return { ok: true, taskName, action: 'removed' };
    }

    // Create/update delayed task
    const escapedExe = executable.replace(/'/g, "''");
    const createCmd = `
      $action  = New-ScheduledTaskAction -Execute '${escapedExe}'
      $trigger = New-ScheduledTaskTrigger -AtLogOn
      $trigger.Delay = '${delayIso}'
      $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable
      Register-ScheduledTask -TaskName '${taskName}' -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force | Out-Null
      Write-Output 'created'
    `;
    const r = await runPowerShell(createCmd, 10000);
    const success = r.trim().includes('created');
    console.log(`[Startup] setDelay task=${taskName} delay=${delayIso} → ${success ? 'ok' : 'fail'}`);
    return { ok: success, taskName, action: 'created' };
  } catch (err) {
    console.warn(`[Startup] setDelay ERROR: ${err?.message}`);
    return { ok: false, error: err?.message };
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

  try {
    const approvedKey = registryKey && registryKey.includes('HKLM')
      ? 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
      : 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';

    const cmd = `
      Try {
        $val = (Get-ItemProperty -Path '${approvedKey}' -Name '${name}' -ErrorAction Stop).'${name}'
        If ($val -and $val[0] -eq 3) { Write-Output 'disabled' }
        Else { Write-Output 'enabled' }
      } Catch {
        Write-Output 'unknown'
      }
    `;
    const result = await runPowerShell(cmd, 6000);
    const state = result.trim();
    return { ok: true, name, state };
  } catch (err) {
    return { ok: false, error: err?.message };
  }
});

console.log('[Security] IPC handlers registered');
