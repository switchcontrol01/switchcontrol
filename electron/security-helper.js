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

console.log('[Security] IPC handlers registered');
