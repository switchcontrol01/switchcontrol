const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TWEAK_STATE_FILE = path.join(process.env.APPDATA || '', 'SwitchControl', 'tweak-state.json');
const TWEAK_LOG_FILE  = path.join(process.env.APPDATA || '', 'SwitchControl', 'tweak-log.json');

// ─── file helpers ──────────────────────────────────────────────────────────────
function ensureStateDir() {
  const dir = path.dirname(TWEAK_STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadState() {
  try {
    ensureStateDir();
    if (fs.existsSync(TWEAK_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(TWEAK_STATE_FILE, 'utf8'));
      return {
        meta:   data.meta   || { windowsBuild: os.release(), lastVerified: null },
        tweaks: data.tweaks || {},
      };
    }
  } catch (e) { console.error('[TweakExecutor] loadState failed:', e.message); }
  return { meta: { windowsBuild: os.release(), lastVerified: null }, tweaks: {} };
}

function saveState(state) {
  try {
    ensureStateDir();
    state.meta.windowsBuild = os.release();
    state.meta.lastVerified  = new Date().toISOString();
    fs.writeFileSync(TWEAK_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { console.error('[TweakExecutor] saveState failed:', e.message); }
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

// ─── PowerShell helpers ────────────────────────────────────────────────────────
function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    const wrapped = `try { ${command}; exit 0 } catch { Write-Error $_.Exception.Message; exit 1 }`;
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', wrapped],
      { timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || stdout?.trim() || error.message;
          reject(new Error(msg));
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}

function queryPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 12000 },
      (error, stdout) => resolve(error ? null : stdout.trim())
    );
  });
}

function checkPowerShell(command) {
  return queryPowerShell(command).then(out => {
    if (out === null) return false;
    return out.toLowerCase() === 'true';
  });
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
  const launchCmd = `Start-Process powershell -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', '${safeScriptPath}') -Verb RunAs -Wait`;

  try {
    await new Promise((resolve, reject) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', launchCmd],
        { timeout: 120_000 },
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
      return { ok: false, error: 'UAC prompt was cancelled or access was denied.' };
    }
    return { ok: false, error: `Elevation failed: ${msg}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(resultPath); } catch {}
  }
}

// ─── UNSUPPORTED tweaks ────────────────────────────────────────────────────────
// These tweaks cannot be implemented with persistent registry/command changes.
// They are kept visible and honestly marked, toggle is disabled in UI.
const UNSUPPORTED_TWEAKS = {
  'p-states': "Requires a runtime agent process for CPU P-state control via driver calls. Cannot be applied persistently via registry.",
  'irq-priority': "Requires kernel-level interrupt affinity control not accessible from user-mode. Needs a signed kernel driver or MSR access.",
  'timer-res': "Timer resolution requires a persistent runtime process calling timeBeginPeriod(). The effect is not persistent via registry and resets when the process exits. Requires agent.",
  'desktop-comp': "Desktop Window Manager (DWM) cannot be disabled on Windows 10/11. This is a legacy Windows XP/Vista feature and has no modern equivalent.",
  'hdcp': "HDCP enforcement is controlled at the hardware/display-driver level and cannot be reliably toggled via registry or PowerShell.",
};

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
    apply:  `$tp = "\\Microsoft\\Windows\\Power Efficiency Diagnostics"; $tn = "AnalyzeSystem"; $task = Get-ScheduledTask -TaskPath $tp -TaskName $tn -EA SilentlyContinue; if ($task) { Disable-ScheduledTask -TaskPath $tp -TaskName $tn | Out-Null }`,
    revert: `$tp = "\\Microsoft\\Windows\\Power Efficiency Diagnostics"; $tn = "AnalyzeSystem"; $task = Get-ScheduledTask -TaskPath $tp -TaskName $tn -EA SilentlyContinue; if ($task) { Enable-ScheduledTask -TaskPath $tp -TaskName $tn | Out-Null }`,
    check:  `$t = Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Power Efficiency Diagnostics\\" -TaskName "AnalyzeSystem" -EA SilentlyContinue; if (-not $t) { $false } else { $t.State -eq "Disabled" }`,
  },
  'maintenance': {
    name: 'Disable Maintenance Tasks',
    requiresAdmin:  true,
    requiresReboot: false,
    apply:  `$tp = "\\Microsoft\\Windows\\TaskScheduler\\"; $tn = "Regular Maintenance"; $task = Get-ScheduledTask -TaskPath $tp -TaskName $tn -EA SilentlyContinue; if ($task) { Disable-ScheduledTask -TaskPath $tp -TaskName $tn | Out-Null }`,
    revert: `$tp = "\\Microsoft\\Windows\\TaskScheduler\\"; $tn = "Regular Maintenance"; $task = Get-ScheduledTask -TaskPath $tp -TaskName $tn -EA SilentlyContinue; if ($task) { Enable-ScheduledTask -TaskPath $tp -TaskName $tn | Out-Null }`,
    check:  `$t = Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\TaskScheduler\\" -TaskName "Regular Maintenance" -EA SilentlyContinue; if (-not $t) { $false } else { $t.State -eq "Disabled" }`,
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
    name: 'Disable Fax & Printer Services',
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
  if (UNSUPPORTED_TWEAKS[tweakId]) return { isApplied: false, unsupported: true };

  const tweak = ALL_TWEAKS[tweakId];
  if (!tweak) return { isApplied: false, verified: false };

  if (tweak._special === 'nvidia-telemetry') {
    const hasNv = await checkPowerShell("(Get-CimInstance Win32_VideoController -EA SilentlyContinue | Where-Object { $_.Name -like '*NVIDIA*' }) -ne $null");
    if (!hasNv) return { isApplied: false, unsupported: true, message: 'No NVIDIA GPU detected.' };
    const applied = await checkPowerShell(
      `$tasks = Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskName -like "NvTm*" -or $_.TaskName -like "NvNode*" }; if ($tasks.Count -eq 0) { $svc = Get-Service -Name NvTelemetryContainer -EA SilentlyContinue; $svc -and ($svc.StartType -eq "Disabled") } else { ($tasks | Where-Object { $_.State -ne "Disabled" }).Count -eq 0 }`
    );
    return { isApplied: applied, verified: true };
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
    const result = {
      success: false,
      unsupported: true,
      message: UNSUPPORTED_TWEAKS[tweakId],
      commandsRun: [],
      requiresReboot: false,
      requiresAdmin:  false,
      error: null,
    };
    logEntry({ tweakId, action, result, ms: 0 });
    return result;
  }

  const tweak = ALL_TWEAKS[tweakId];

  // 2. Unknown tweak
  if (!tweak) {
    const result = {
      success: false,
      message: 'Tweak not found in registry.',
      commandsRun: [],
      requiresReboot: false,
      requiresAdmin:  false,
      error: `No implementation for "${tweakId}"`,
    };
    logEntry({ tweakId, action, result, ms: 0 });
    return result;
  }

  // 3. Admin check — elevate per-action when possible
  if (tweak.requiresAdmin) {
    const isAdmin = await checkIsAdmin();
    if (!isAdmin) {
      // Special-case tweaks use custom handlers that can't be lifted into a temp script
      if (tweak._special) {
        const result = {
          success:        false,
          requiresAdmin:  true,
          requiresReboot: tweak.requiresReboot || false,
          commandsRun:    [],
          message:        null,
          error:          'This tweak requires SwitchControl to be run as Administrator. Right-click the app and choose "Run as administrator".',
        };
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
        const result = {
          success:        false,
          requiresAdmin:  true,
          requiresReboot: tweak.requiresReboot || false,
          commandsRun,
          message:        null,
          error: isCancelled
            ? 'Elevation cancelled. Accept the UAC prompt to apply this tweak.'
            : `Elevation failed: ${elevErr.message}`,
        };
        logEntry({ tweakId, action, result, ms: Date.now() - startTime });
        return result;
      }

      if (!elevResult.ok) {
        const result = {
          success:        false,
          requiresAdmin:  true,
          requiresReboot: tweak.requiresReboot || false,
          commandsRun,
          message:        null,
          error:          elevResult.error || 'Elevated command failed.',
        };
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
        const result = {
          success:        true,
          verified:       true,
          requiresReboot: tweak.requiresReboot || false,
          requiresAdmin:  true,
          commandsRun,
          message:        `${tweak.name} ${expectedApplied ? 'applied' : 'reverted'} and verified (elevated).`,
          error:          null,
        };
        logEntry({ tweakId, action, verificationResult: verification, result, ms: Date.now() - startTime });
        return result;
      } else {
        const result = {
          success:        false,
          verified:       true,
          requiresReboot: tweak.requiresReboot || false,
          requiresAdmin:  true,
          commandsRun,
          message:        null,
          error:          'Elevated command ran but system state did not change. May be blocked by policy.',
        };
        logEntry({ tweakId, action, verificationResult: verification, result, ms: Date.now() - startTime });
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

      const result = {
        success:        true,
        verified:       true,
        requiresReboot: tweak.requiresReboot || false,
        requiresAdmin:  tweak.requiresAdmin  || false,
        commandsRun,
        message:        `${tweak.name} ${expectedApplied ? 'applied' : 'reverted'} and verified on your system.`,
        error:          null,
      };
      logEntry({ tweakId, action, verificationResult: verification, result, ms: Date.now() - startTime });
      return result;
    } else {
      const result = {
        success:        false,
        verified:       true,
        requiresReboot: tweak.requiresReboot || false,
        requiresAdmin:  tweak.requiresAdmin  || false,
        commandsRun,
        message:        null,
        error:          'Command ran but system state did not change. May be blocked by policy or antivirus.',
      };
      logEntry({ tweakId, action, verificationResult: verification, result, ms: Date.now() - startTime });
      return result;
    }

  } catch (error) {
    console.error(`[TweakExecutor] Failed ${action} ${tweakId}:`, error.message);
    let errorMsg = error.message || 'Execution failed';
    if (/access.*denied|not.*allowed|unauthorized|privilege/i.test(errorMsg)) {
      errorMsg = 'Access denied. Run SwitchControl as Administrator.';
    } else if (/does not exist|not found|cannot find/i.test(errorMsg)) {
      errorMsg = 'Registry path or service not found. This setting may not apply to your Windows version.';
    }

    const result = {
      success:        false,
      verified:       false,
      requiresReboot: false,
      requiresAdmin:  /access.*denied|administrator/i.test(errorMsg),
      commandsRun,
      message:        null,
      error:          errorMsg,
    };
    logEntry({ tweakId, action, result, ms: Date.now() - startTime });
    return result;
  }
}

async function checkTweakStatus(tweakId) {
  if (UNSUPPORTED_TWEAKS[tweakId]) {
    return { tweakId, isApplied: false, applied: false, unsupported: true, error: null };
  }

  const tweak = ALL_TWEAKS[tweakId];
  if (!tweak) return { tweakId, isApplied: false, applied: false, error: null };

  try {
    const result = await verifyTweak(tweakId);
    return { tweakId, isApplied: result.isApplied, applied: result.isApplied, unsupported: result.unsupported || false, error: result.error || null };
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

module.exports = {
  executeTweak,
  checkTweakStatus,
  verifyTweak,
  getLocalState,
  getTweakInfo,
  getExecutionLog,
  ALL_TWEAKS,
  HKCU_TWEAKS,
  ADMIN_TWEAKS,
  UNSUPPORTED_TWEAKS,
};
