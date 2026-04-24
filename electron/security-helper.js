/**
 * security-helper.js
 * Electron IPC handlers for Windows system integrity data.
 * All handlers are Windows-only and return { available: false } on other platforms or on error.
 */

const { ipcMain, shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');

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
// Enables or disables a startup entry using the correct Windows mechanism for
// each source type (registry Run keys, startup folders, Task Scheduler tasks).
// Params: { source, registryName, taskPath, folderPath, enabled }
// ---------------------------------------------------------------------------

ipcMain.handle('startup:setEnabled', async (event, params) => {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'not-windows' };
  }

  const { source, registryName, taskPath, folderPath, enabled } = params || {};
  const flag = enabled ? 2 : 3; // 2=enabled, 3=disabled (Task Manager convention)

  try {
    let cmd = '';

    if (source === 'registry-hkcu' && registryName) {
      const safeName = registryName.replace(/'/g, "''");
      const approvedPath = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
      cmd = `$val=[byte[]](${flag},0,0,0,0,0,0,0,0,0,0,0); If(!(Test-Path '${approvedPath}')){New-Item -Path '${approvedPath}' -Force|Out-Null}; Set-ItemProperty -Path '${approvedPath}' -Name '${safeName}' -Value $val -Type Binary -Force; Write-Output 'ok'`;

    } else if (source === 'registry-hklm' && registryName) {
      const safeName = registryName.replace(/'/g, "''");
      const approvedPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
      cmd = `$val=[byte[]](${flag},0,0,0,0,0,0,0,0,0,0,0); If(!(Test-Path '${approvedPath}')){New-Item -Path '${approvedPath}' -Force|Out-Null}; Set-ItemProperty -Path '${approvedPath}' -Name '${safeName}' -Value $val -Type Binary -Force; Write-Output 'ok'`;

    } else if (source === 'startup-folder-user' && folderPath) {
      const safeName = require('path').basename(folderPath).replace(/'/g, "''");
      const approvedPath = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder';
      cmd = `$val=[byte[]](${flag},0,0,0,0,0,0,0,0,0,0,0); If(!(Test-Path '${approvedPath}')){New-Item -Path '${approvedPath}' -Force|Out-Null}; Set-ItemProperty -Path '${approvedPath}' -Name '${safeName}' -Value $val -Type Binary -Force; Write-Output 'ok'`;

    } else if (source === 'startup-folder-common' && folderPath) {
      const safeName = require('path').basename(folderPath).replace(/'/g, "''");
      const approvedPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder';
      cmd = `$val=[byte[]](${flag},0,0,0,0,0,0,0,0,0,0,0); If(!(Test-Path '${approvedPath}')){New-Item -Path '${approvedPath}' -Force|Out-Null}; Set-ItemProperty -Path '${approvedPath}' -Name '${safeName}' -Value $val -Type Binary -Force; Write-Output 'ok'`;

    } else if (source === 'task-scheduler' && taskPath) {
      const parts = taskPath.split('\\').filter(Boolean);
      const taskName = parts.pop() || taskPath;
      const taskFolder = parts.length > 0 ? '\\' + parts.join('\\') + '\\' : '\\';
      const safeFolder = taskFolder.replace(/'/g, "''");
      const safeTName = taskName.replace(/'/g, "''");
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

// ---------------------------------------------------------------------------
// IPC: security:getAdvancedProtection
// Extended Defender intelligence: cloud, PUA, SmartScreen, signature/scan age
// ---------------------------------------------------------------------------

ipcMain.handle('security:getAdvancedProtection', async () => {
  if (process.platform !== 'win32') return { available: false, reason: 'not-windows' };
  try {
    const cmd = `
      $mp   = Get-MpComputerStatus -ErrorAction SilentlyContinue
      $pref = Get-MpPreference    -ErrorAction SilentlyContinue
      $svc  = (Get-Service -Name WinDefend -ErrorAction SilentlyContinue)?.Status

      $signatureAge = $null
      if ($mp?.AntivirusSignatureLastUpdated) {
        $signatureAge = [int]([DateTime]::UtcNow - $mp.AntivirusSignatureLastUpdated.ToUniversalTime()).TotalDays
      }
      $quickScanAge = $null
      if ($mp?.QuickScanEndTime -and $mp.QuickScanEndTime.Year -gt 2000) {
        $quickScanAge = [int]([DateTime]::UtcNow - $mp.QuickScanEndTime.ToUniversalTime()).TotalDays
      }
      $fullScanAge = $null
      if ($mp?.FullScanEndTime -and $mp.FullScanEndTime.Year -gt 2000) {
        $fullScanAge = [int]([DateTime]::UtcNow - $mp.FullScanEndTime.ToUniversalTime()).TotalDays
      }

      $smartScreen = $null
      try {
        $ss = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer' -Name SmartScreenEnabled -ErrorAction Stop).SmartScreenEnabled
        $smartScreen = ($ss -ne 'Off')
      } catch {}

      @{
        cloudProtection         = if ($pref) { $pref.MAPSReporting -ne 0 } else { $null }
        sampleSubmission        = if ($pref) { $pref.SubmitSamplesConsent -in @(1,3) } else { $null }
        controlledFolderAccess  = if ($pref) { $pref.EnableControlledFolderAccess -ne 0 } else { $null }
        puaProtection           = if ($pref) { $pref.PUAProtection -ne 0 } else { $null }
        smartScreen             = $smartScreen
        signatureVersion        = $mp?.AntivirusSignatureVersion
        signatureAge            = $signatureAge
        quickScanAge            = $quickScanAge
        fullScanAge             = $fullScanAge
        defenderServiceRunning  = ($svc -eq 'Running')
      } | ConvertTo-Json -Compress
    `;
    const raw = await runPowerShell(cmd, 18000);
    const data = JSON.parse(raw);
    console.log(`[Security] getAdvancedProtection OK | sigAge=${data.signatureAge}d quickAge=${data.quickScanAge}d`);
    return { available: true, data };
  } catch (err) {
    console.warn(`[Security] getAdvancedProtection ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  }
});

// ---------------------------------------------------------------------------
// IPC: security:getAdvancedAudit
// Platform trust, remote surface, persistence risks
// ---------------------------------------------------------------------------

ipcMain.handle('security:getAdvancedAudit', async () => {
  if (process.platform !== 'win32') return { available: false, reason: 'not-windows' };
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
        $suspicious = @($lines | Where-Object { $_ -notmatch '^\\s*#' -and $_.Trim() -ne '' -and $_ -notmatch 'localhost' })
        $r.hostsModified      = $suspicious.Count -gt 0
        $r.hostsSuspiciousCount = $suspicious.Count
      } catch { $r.hostsModified = $null; $r.hostsSuspiciousCount = 0 }

      $r | ConvertTo-Json -Compress
    `;
    const raw = await runPowerShell(cmd, 30000);
    const data = JSON.parse(raw);
    console.log(`[Security] getAdvancedAudit OK | secureBoot=${data.secureBoot} rdp=${data.rdpEnabled} hvci=${data.hvciEnabled}`);
    return { available: true, data };
  } catch (err) {
    console.warn(`[Security] getAdvancedAudit ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  }
});

// ---------------------------------------------------------------------------
// IPC: security:getProcessDetails
// Enriched process list: path, trust classification by location
// ---------------------------------------------------------------------------

ipcMain.handle('security:getProcessDetails', async () => {
  if (process.platform !== 'win32') return { available: false, reason: 'not-windows' };
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
        [PSCustomObject]@{
          Name      = $p.Name
          Pid       = $p.Id
          CpuSec    = [Math]::Round($p.CPU, 2)
          MemMb     = [Math]::Round($p.WorkingSet64/1MB, 1)
          Path      = $exePath
          ParentPid = $cim?.ParentProcessId
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

      if (exePath) {
        const isSafe = SAFE_PATH_PREFIXES.some(r => r.test(exePath));
        const isSuspicious = SUSPICIOUS_PATH_PATTERNS.some(r => r.test(exePath));
        suspiciousLocation = isSuspicious;
        if (isSafe) {
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
        signed: null,
        signerName: null,
        publisher: null,
        elevated: null,
      };
    });

    console.log(`[Security] getProcessDetails OK | count=${processes.length} suspicious=${processes.filter(p => p.suspiciousLocation).length}`);
    return { available: true, data: processes };
  } catch (err) {
    console.warn(`[Security] getProcessDetails ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  }
});

// ---------------------------------------------------------------------------
// IPC: security:getScheduledTasks
// Non-Windows scheduled tasks filtered for suspicious entries
// ---------------------------------------------------------------------------

ipcMain.handle('security:getScheduledTasks', async () => {
  if (process.platform !== 'win32') return { available: false, reason: 'not-windows' };
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
          Execute   = $action?.Execute
          Arguments = $action?.Arguments
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
  }
});

// ---------------------------------------------------------------------------
// IPC: security:getServices
// Running services — filtered for suspicious binary paths
// ---------------------------------------------------------------------------

ipcMain.handle('security:getServices', async () => {
  if (process.platform !== 'win32') return { available: false, reason: 'not-windows' };
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
    return { available: true, data: { services: suspicious.slice(0, 50), suspicious } };
  } catch (err) {
    console.warn(`[Security] getServices ERROR: ${err?.message}`);
    return { available: false, reason: 'error', error: err?.message };
  }
});

// ---------------------------------------------------------------------------
// IPC: security:openProcessLocation
// Opens the folder containing a process executable in Explorer
// ---------------------------------------------------------------------------

ipcMain.handle('security:openProcessLocation', async (event, filePath) => {
  if (!filePath || typeof filePath !== 'string') return { ok: false, reason: 'invalid-path' };
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

ipcMain.handle('security:setDefenderOption', async (_event, option, enabled) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows' };

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
  }
});

// ---------------------------------------------------------------------------
// IPC: security:runDefenderAction
// Runs a one-shot Defender maintenance action.
// action: 'quickScan' | 'updateSignatures'
// ---------------------------------------------------------------------------

ipcMain.handle('security:runDefenderAction', async (_event, action) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows' };

  let cmd = '';
  switch (action) {
    case 'quickScan':
      cmd = `Start-MpScan -ScanType QuickScan -EA SilentlyContinue; Write-Output 'ok'`;
      break;
    case 'updateSignatures':
      cmd = `Update-MpSignature -EA SilentlyContinue; Write-Output 'ok'`;
      break;
    default:
      return { ok: false, error: 'Unknown action' };
  }

  try {
    await runPowerShell(cmd, 60000);
    console.log(`[Security] runDefenderAction action=${action} → ok`);
    return { ok: true };
  } catch (err) {
    console.warn(`[Security] runDefenderAction ERROR: ${err?.message}`);
    return { ok: false, error: err?.message };
  }
});

console.log('[Security] IPC handlers registered');
