/**
 * Network Tweak Executor
 * Real Windows system-level network changes via PowerShell/netsh/registry.
 * Each tweak has: apply, revert, check scripts.
 * Disabled tweaks have a reason string instead of scripts.
 */

'use strict';

const { execFile }    = require('child_process');
const { performance } = require('perf_hooks');
const dns             = require('dns');
const fs   = require('fs');
const net  = require('net');
const path = require('path');
const { checkIsAdmin, runElevated, _withPsSemaphore } = require('./ps-shared');

// ── helpers ──────────────────────────────────────────────────────────────────

// Diagnostic counter — every powershell.exe spawn increments this.
let _net_psCount = 0;

function execPowerShell(command) {
  const id = ++_net_psCount;
  const t0 = Date.now();
  console.log(`[PS:network-tweak] #${id} execPowerShell SPAWN ts=${t0}`);
  return _withPsSemaphore(() => new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 20000, windowsHide: true },
      (error, stdout, stderr) => {
        console.log(`[PS:network-tweak] #${id} execPowerShell ${error ? 'FAIL' : 'OK'} ${Date.now() - t0}ms`);
        if (error) {
          reject(new Error((stderr || error.message || 'PowerShell error').trim()));
        } else {
          resolve(stdout.trim());
        }
      }
    );
  }));
}

// ── normalization helpers ─────────────────────────────────────────────────────

/**
 * Normalize PowerShell check-script output to a tri-state boolean.
 *
 * Returns:
 *   true  — script definitively reported the tweak is applied
 *   false — script definitively reported the tweak is NOT applied
 *   null  — output is inconclusive or unrecognised (never treat as failure)
 *
 * This prevents brittle "true"/"false" string matching from masking successful
 * commands when the check script returns an unexpected but non-fatal value.
 */
function normalizePSBoolOutput(output) {
  if (output === null || output === undefined) return null;
  const s = String(output).trim().toLowerCase();
  if (s === 'true'  || s === '1' || s === 'yes' || s === 'enabled')  return true;
  if (s === 'false' || s === '0' || s === 'no'  || s === 'disabled') return false;
  // 'inconclusive' or any unrecognised value → inconclusive
  return null;
}

/**
 * Normalize a block of netsh/PowerShell human-readable output for resilient matching.
 * Lowercases, collapses whitespace, and removes Windows line endings.
 */
function normalizeNetshOutput(output) {
  if (!output) return '';
  return output
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .toLowerCase()
    .replace(/[^\S\n]+/g, ' ')  // collapse horizontal whitespace
    .trim();
}

// ── tweak definitions ─────────────────────────────────────────────────────────

/**
 * Each key maps to either:
 *   - { requiresAdmin, apply, revert, check }  — implementable
 *   - { disabled, reason }                      — disabled with explanation
 */
const TWEAK_REGISTRY = {

  // ── SMB ──────────────────────────────────────────────────────────────────

  'smb-non-best-effort': {
    requiresAdmin: true,
    apply: `
      New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" -Force -EA SilentlyContinue | Out-Null;
      Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" -Name "NonBestEffortLimit" -Value 0 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" -Name "NonBestEffortLimit" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" -Name "NonBestEffortLimit" -EA SilentlyContinue).NonBestEffortLimit;
      if ($v -eq 0) { "true" } else { "false" }
    `,
  },

  'smb-v2v3': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "SMB2" -Value 1 -Type DWord -Force;
      Write-Output "ok"
    `,
    // Revert explicitly sets SMB2=0 (disabled) instead of removing the key.
    // Removing the key returns Windows to its default (SMBv2 enabled), so
    // checkStatus would immediately read back applied=true even after a successful
    // revert — causing the toggle to bounce back to ON in the UI.  Setting SMB2=0
    // makes the disabled state explicit and verifiable.
    revert: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "SMB2" -Value 0 -Type DWord -Force;
      Write-Output "ok"
    `,
    // check: SMB2=1 or absent (null) → Windows default = enabled → true
    //        SMB2=0 → explicitly disabled → false
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "SMB2" -EA SilentlyContinue).SMB2;
      if ($v -eq 1 -or $null -eq $v) { "true" } else { "false" }
    `,
  },

  'smb-live-migration': {
    disabled: true,
    reason: 'Enterprise/Hyper-V live migration feature — not applicable to desktop systems. No meaningful effect for home networking.',
  },

  'smb-congruent-ops': {
    disabled: true,
    reason: 'Duplicate of smb-max-requests — both set MaxCmds. Use smb-max-requests instead.',
  },

  'smb-max-requests': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" -Name "MaxCmds" -Value 128 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" -Name "MaxCmds" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" -Name "MaxCmds" -EA SilentlyContinue).MaxCmds;
      if ($v -eq 128) { "true" } else { "false" }
    `,
  },

  'smb-irp-stack': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "IRPStackSize" -Value 20 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "IRPStackSize" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "IRPStackSize" -EA SilentlyContinue).IRPStackSize;
      if ($v -ge 15) { "true" } else { "false" }
    `,
  },

  'smb-incoming-requests': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "MaxWorkItems" -Value 512 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "MaxWorkItems" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "MaxWorkItems" -EA SilentlyContinue).MaxWorkItems;
      if ($v -ge 256) { "true" } else { "false" }
    `,
  },

  'smb-pipe-data': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "SizReqBuf" -Value 32000 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "SizReqBuf" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "SizReqBuf" -EA SilentlyContinue).SizReqBuf;
      if ($v -ge 16000) { "true" } else { "false" }
    `,
  },

  'smb-request-buffer': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" -Name "SizCharBuf" -Value 8192 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" -Name "SizCharBuf" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" -Name "SizCharBuf" -EA SilentlyContinue).SizCharBuf;
      if ($v -ge 4096) { "true" } else { "false" }
    `,
  },

  'smb-preallocate': {
    disabled: true,
    reason: 'No documented Windows registry parameter for SMB connection pre-allocation. Cannot be implemented without placebo behavior.',
  },

  // ── TCP/IP ────────────────────────────────────────────────────────────────

  'tcp-wait-time': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "TcpTimedWaitDelay" -Value 30 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "TcpTimedWaitDelay" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "TcpTimedWaitDelay" -EA SilentlyContinue).TcpTimedWaitDelay;
      if ($v -ne $null -and [int]$v -le 60) { "true" } else { "false" }
    `,
  },

  'tcp-bufferlist': {
    disabled: true,
    reason: 'No stable, documented Windows parameter for TCP buffer-list tracking. Cannot be implemented without undocumented internals.',
  },

  // 'tcp-nagle' has been REMOVED from this registry.
  // Canonical owner: tweak-executor.js → 'tcp-no-delay'  (same TcpNoDelay + TcpAckFrequency
  // registry values; single ownership record under itemType='tweak').
  // main.js networkTweaks:execute / checkStatus / checkAll redirect this ID there automatically.

  'tcp-non-sack-rto': {
    disabled: true,
    reason: 'No stable, documented Windows parameter maps to non-SACK RTO tuning. Cannot be safely implemented.',
  },

  'tcp-task-offload': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "DisableTaskOffload" -Value 1 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "DisableTaskOffload" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "DisableTaskOffload" -EA SilentlyContinue).DisableTaskOffload;
      if ($v -eq 1) { "true" } else { "false" }
    `,
  },

  'tcp-timestamps': {
    requiresAdmin: true,
    apply: `
      netsh int tcp set global timestamps=disabled;
      Write-Output "ok"
    `,
    revert: `
      netsh int tcp set global timestamps=enabled;
      Write-Output "ok"
    `,
    check: `
      $out = netsh int tcp show global 2>&1;
      $line = @($out) | Where-Object { $_ -imatch 'timestamp' } | Select-Object -First 1;
      if ($line) { if ($line -imatch ':\\s*disabled') { 'true' } else { 'false' } } else { 'false' }
    `,
  },

  'tcp-window-heuristics': {
    requiresAdmin: true,
    apply: `
      netsh int tcp set heuristics disabled;
      Write-Output "ok"
    `,
    revert: `
      netsh int tcp set heuristics enabled;
      Write-Output "ok"
    `,
    check: `
      $out = netsh int tcp show heuristics 2>&1;
      $line = @($out) | Where-Object { $_ -imatch 'heuristic|scaling' } | Select-Object -First 1;
      if ($line) { if ($line -imatch ':\\s*disabled') { 'true' } else { 'false' } } else { 'false' }
    `,
  },

  'tcp-dca': {
    disabled: true,
    reason: 'Direct Cache Access (DCA) is a hardware feature requiring BIOS/chipset support and cannot be enabled via Windows registry on most consumer systems.',
  },

  // 'tcp-throttling-index' has been REMOVED from this registry.
  // Canonical owner: slider-tweak-executor.js → 'net-throttle-index'  (same
  // NetworkThrottlingIndex DWORD in Multimedia\SystemProfile; single ownership record
  // under itemType='slider').
  // main.js networkTweaks:execute / checkStatus / checkAll redirect this ID there automatically.

  'tcp-pmtu': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "EnablePMTUDiscovery" -Value 1 -Type DWord -Force;
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "EnablePMTUBHDetect" -Value 1 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "EnablePMTUDiscovery" -EA SilentlyContinue;
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "EnablePMTUBHDetect" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $disc = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "EnablePMTUDiscovery" -EA SilentlyContinue).EnablePMTUDiscovery;
      $bh   = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "EnablePMTUBHDetect" -EA SilentlyContinue).EnablePMTUBHDetect;
      if ($disc -eq 1 -and $bh -eq 1) { "true" } else { "false" }
    `,
  },

  'tcp-rss': {
    requiresAdmin: true,
    apply: `
      netsh int tcp set global rss=enabled;
      Write-Output "ok"
    `,
    revert: `
      netsh int tcp set global rss=disabled;
      Write-Output "ok"
    `,
    check: `
      $out = netsh int tcp show global 2>&1;
      $line = @($out) | Where-Object { $_ -imatch 'receive.side.scal|rss\\b' } | Select-Object -First 1;
      if ($line) { if ($line -imatch ':\\s*enabled') { 'true' } else { 'false' } } else { 'false' }
    `,
  },

  'tcp-chimney': {
    disabled: true,
    reason: 'TCP Chimney Offload is deprecated and removed in Windows 10/11. Command has no effect on modern systems.',
  },

  'tcp-sack': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "SackOpts" -Value 1 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "SackOpts" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "SackOpts" -EA SilentlyContinue).SackOpts;
      if ($v -eq 1) { "true" } else { "false" }
    `,
  },

  'tcp-weak-host': {
    requiresAdmin: true,
    apply: `
      $adapters = @(Get-NetAdapter -ErrorAction Stop);
      if ($adapters.Count -eq 0) { throw "No network adapters were found." }
      $failed = @();
      foreach ($a in $adapters) {
        & netsh int ip set interface "$($a.Name)" weakhostsend=enabled weakhostreceive=enabled 2>&1 | Out-Null;
        if ($LASTEXITCODE -ne 0) { $failed += $a.Name }
      }
      if ($failed.Count -gt 0) { throw "Weak-host enable failed for: $($failed -join ', ')" }
      Write-Output "ok"
    `,
    revert: `
      $adapters = @(Get-NetAdapter -ErrorAction Stop);
      if ($adapters.Count -eq 0) { throw "No network adapters were found." }
      $failed = @();
      foreach ($a in $adapters) {
        & netsh int ip set interface "$($a.Name)" weakhostsend=disabled weakhostreceive=disabled 2>&1 | Out-Null;
        if ($LASTEXITCODE -ne 0) { $failed += $a.Name }
      }
      if ($failed.Count -gt 0) { throw "Weak-host disable failed for: $($failed -join ', ')" }
      Write-Output "ok"
    `,
    check: `
      $ifaces = Get-NetIPInterface -AddressFamily IPv4 -EA SilentlyContinue;
      $enabled = $ifaces | Where-Object { [string]$_.WeakHostSend -imatch '^true$|^enabled$|^1$' };
      if ($null -ne $enabled -and @($enabled).Count -gt 0) { 'true' } else { 'false' }
    `,
  },

  'tcp-winhttp': {
    requiresAdmin: true,
    apply: `
      netsh int tcp set global autotuninglevel=normal;
      Write-Output "ok"
    `,
    revert: `
      netsh int tcp set global autotuninglevel=disabled;
      Write-Output "ok"
    `,
    check: `
      $out = netsh int tcp show global 2>&1;
      $line = @($out) | Where-Object { $_ -imatch 'auto.tun' } | Select-Object -First 1;
      if ($line) { if ($line -imatch ':\\s*normal') { 'true' } else { 'false' } } else { 'false' }
    `,
  },

  'tcp-rto-increase': {
    disabled: true,
    reason: 'Increasing TCP retransmission timeout is counterproductive for gaming — it increases delay during packet loss events instead of reducing it.',
  },

  'tcp-connection-timeout': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "TcpMaxConnectRetransmissions" -Value 1 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "TcpMaxConnectRetransmissions" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "TcpMaxConnectRetransmissions" -EA SilentlyContinue).TcpMaxConnectRetransmissions;
      if ($v -eq 1) { "true" } else { "false" }
    `,
  },

  'tcp-congestion': {
    requiresAdmin: true,
    apply: `
      try {
        $out = netsh int tcp set supplemental template=Internet congestionprovider=CTCP 2>&1;
        if ($out -imatch 'error|not supported|invalid') { Write-Output "unsupported" } else { Write-Output "ok" }
      } catch {
        Write-Output "unsupported"
      }
    `,
    revert: `
      try {
        netsh int tcp set supplemental template=Internet congestionprovider=default 2>&1 | Out-Null;
        Write-Output "ok"
      } catch {
        Write-Output "ok"
      }
    `,
    check: `
      try {
        $s = Get-NetTCPSetting -SettingName Internet -EA SilentlyContinue;
        if ($s -and [string]$s.CongestionProvider -imatch 'ctcp|compound') { 'true' }
        else {
          $out = netsh int tcp show supplemental template=Internet 2>&1;
          if ($out -imatch 'ctcp|compound') { 'true' } else { 'false' }
        }
      } catch {
        try {
          $out = netsh int tcp show supplemental template=Internet 2>&1;
          if ($out -imatch 'ctcp|compound') { 'true' } else { 'false' }
        } catch { 'false' }
      }
    `,
  },

  'tcp-ttl': {
    disabled: true,
    reason: 'Reducing TTL provides no latency benefit and can cause connectivity failures to distant hosts or CDN nodes. Harmful tweak removed.',
  },

  'tcp-connection-limit': {
    disabled: true,
    reason: 'Half-open connection limit was removed in Windows Vista/7. No effect on Windows 10/11 — legacy tweak.',
  },

  'tcp-port-range': {
    requiresAdmin: true,
    apply: `
      $backupPath = "$env:APPDATA\\SwitchControl\\tcp-port-range-backup.json";
      $tcpOut = netsh int ip show dynamicportrange protocol=tcp 2>&1;
      $udpOut = netsh int ip show dynamicportrange protocol=udp 2>&1;
      $tcpSP = if ($tcpOut -match 'Start Port\s*:\s*(\d+)') { $Matches[1] } else { '49152' };
      $tcpNP = if ($tcpOut -match 'Number of Ports\s*:\s*(\d+)') { $Matches[1] } else { '16384' };
      $udpSP = if ($udpOut -match 'Start Port\s*:\s*(\d+)') { $Matches[1] } else { '49152' };
      $udpNP = if ($udpOut -match 'Number of Ports\s*:\s*(\d+)') { $Matches[1] } else { '16384' };
      $b = [PSCustomObject]@{ tcpSP=$tcpSP; tcpNP=$tcpNP; udpSP=$udpSP; udpNP=$udpNP } | ConvertTo-Json -Compress;
      $dir = Split-Path $backupPath;
      if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null };
      $b | Out-File -FilePath ($backupPath + '.tmp') -Encoding utf8 -Force;
      if (Test-Path ($backupPath + '.tmp')) { Move-Item -Path ($backupPath + '.tmp') -Destination $backupPath -Force -EA SilentlyContinue };
      netsh int ip set dynamicportrange protocol=tcp startport=1024 numberofports=64511;
      netsh int ip set dynamicportrange protocol=udp startport=1024 numberofports=64511;
      Write-Output "ok"
    `,
    revert: `
      $backupPath = "$env:APPDATA\\SwitchControl\\tcp-port-range-backup.json";
      $tcpSP = '49152'; $tcpNP = '16384'; $udpSP = '49152'; $udpNP = '16384';
      if (Test-Path $backupPath) {
        try { $b = Get-Content $backupPath -Raw | ConvertFrom-Json; $tcpSP=$b.tcpSP; $tcpNP=$b.tcpNP; $udpSP=$b.udpSP; $udpNP=$b.udpNP } catch {}
        Remove-Item $backupPath -Force -EA SilentlyContinue;
      };
      netsh int ip set dynamicportrange protocol=tcp startport=$tcpSP numberofports=$tcpNP;
      netsh int ip set dynamicportrange protocol=udp startport=$udpSP numberofports=$udpNP;
      Write-Output "ok"
    `,
    check: `
      $out = netsh int ip show dynamicportrange protocol=tcp 2>&1;
      $match = @($out) | Where-Object { $_ -match '64511' } | Select-Object -First 1;
      if ($match) { 'true' } else { 'false' }
    `,
  },

  // ── UDP ───────────────────────────────────────────────────────────────────

  'udp-offloads': {
    requiresAdmin: true,
    apply: `
      try {
        Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
          Disable-NetAdapterChecksumOffload -Name $_.Name -UdpIPv4 -EA SilentlyContinue 2>&1 | Out-Null
        }
      } catch {}
      Write-Output "ok"
    `,
    revert: `
      try {
        Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
          Enable-NetAdapterChecksumOffload -Name $_.Name -UdpIPv4 -EA SilentlyContinue 2>&1 | Out-Null
        }
      } catch {}
      Write-Output "ok"
    `,
    check: `
      try {
        $offloads = Get-NetAdapterChecksumOffload -EA SilentlyContinue;
        $disabled = $offloads | Where-Object { [string]$_.UdpIPv4RxEnabled -imatch '^false$|^disabled$|^0$' -and [string]$_.UdpIPv4TxEnabled -imatch '^false$|^disabled$|^0$' };
        if ($null -ne $disabled -and @($disabled).Count -gt 0) { 'true' } else { 'false' }
      } catch { 'false' }
    `,
  },

  'udp-fast-send': {
    disabled: true,
    reason: 'No documented, stable Windows parameter for UDP fast-send path tuning. Undocumented internals cannot be safely used.',
  },

  // ── Security ──────────────────────────────────────────────────────────────

  'sec-llmnr': {
    requiresAdmin: true,
    apply: `
      New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient" -Force -EA SilentlyContinue | Out-Null;
      Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient" -Name "EnableMulticast" -Value 0 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient" -Name "EnableMulticast" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient" -Name "EnableMulticast" -EA SilentlyContinue).EnableMulticast;
      if ($v -eq 0) { "true" } else { "false" }
    `,
  },

  'sec-mpp': {
    disabled: true,
    reason: 'MPP is ambiguous — no clear single Windows component maps to this label. Cannot implement without risk of unintended side effects.',
  },

  'sec-netbios': {
    requiresAdmin: true,
    apply: `
      # Capture per-adapter baseline before writing, then disable NetBIOS.
      # WMI SetTcpipNetbios() is deprecated on Windows 11 — write registry directly.
      $backupPath = "$env:APPDATA\\SwitchControl\\netbios-backup.json"
      $root = 'HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters\Interfaces'
      $baseline = @()
      if (Test-Path $root) {
        $keys = Get-ChildItem -Path $root -ErrorAction SilentlyContinue
        foreach ($k in $keys) {
          $v = (Get-ItemProperty -Path $k.PSPath -Name NetbiosOptions -ErrorAction SilentlyContinue).NetbiosOptions
          $baseline += [PSCustomObject]@{ keyName = $k.PSChildName; originalValue = if ($null -ne $v) { [int]$v } else { 0 } }
        }
        $dir = Split-Path $backupPath
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        ($baseline | ConvertTo-Json -Compress) | Out-File -FilePath ($backupPath + '.tmp') -Encoding utf8 -Force
        if (Test-Path ($backupPath + '.tmp')) { Move-Item -Path ($backupPath + '.tmp') -Destination $backupPath -Force -EA SilentlyContinue }
        foreach ($k in $keys) {
          Set-ItemProperty -Path $k.PSPath -Name NetbiosOptions -Value 2 -Type DWord -Force -ErrorAction SilentlyContinue
        }
      }
      Write-Output "ok"
    `,
    revert: `
      # Restore each adapter's original NetbiosOptions value from backup.
      $backupPath = "$env:APPDATA\\SwitchControl\\netbios-backup.json"
      $root = 'HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters\Interfaces'
      if (Test-Path $root) {
        $keys = Get-ChildItem -Path $root -ErrorAction SilentlyContinue
        $baseline = @{}
        if (Test-Path $backupPath) {
          try { $arr = Get-Content $backupPath -Raw | ConvertFrom-Json; foreach ($e in $arr) { $baseline[$e.keyName] = $e.originalValue } } catch {}
          Remove-Item $backupPath -Force -EA SilentlyContinue
        }
        foreach ($k in $keys) {
          $restoreVal = if ($baseline.ContainsKey($k.PSChildName)) { $baseline[$k.PSChildName] } else { 0 }
          Set-ItemProperty -Path $k.PSPath -Name NetbiosOptions -Value $restoreVal -Type DWord -Force -ErrorAction SilentlyContinue
        }
      }
      Write-Output "ok"
    `,
    check: `
      # HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters\Interfaces
      # contains a sub-key per adapter (Tcpip_{GUID}) with NetbiosOptions:
      #   0 = use DHCP setting  1 = enabled  2 = disabled
      $root = 'HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters\Interfaces'
      if (-not (Test-Path $root)) { "false"; exit }
      $keys = Get-ChildItem -Path $root -ErrorAction SilentlyContinue
      if (-not $keys -or $keys.Count -eq 0) { "false"; exit }
      $anyDisabled = $false
      foreach ($k in $keys) {
        $v = (Get-ItemProperty -Path $k.PSPath -Name NetbiosOptions -ErrorAction SilentlyContinue).NetbiosOptions
        if ($v -eq 2) { $anyDisabled = $true; break }
      }
      if ($anyDisabled) { "true" } else { "false" }
    `,
  },

  // ── DNS ───────────────────────────────────────────────────────────────────

  'dns-doh': {
    disabled: true,
    reason: 'OS-level DNS over HTTPS requires Windows 11 build 19628+ and a configured DoH resolver. Too version-dependent to implement safely for all users.',
  },

  'dns-optimize': {
    requiresAdmin: true,
    apply: `
      $path = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters";
      Set-ItemProperty -Path $path -Name "CacheHashTableBucketSize" -Value 1 -Type DWord -Force;
      Set-ItemProperty -Path $path -Name "CacheHashTableSize" -Value 384 -Type DWord -Force;
      Set-ItemProperty -Path $path -Name "MaxCacheEntryTtlLimit" -Value 64000 -Type DWord -Force;
      Set-ItemProperty -Path $path -Name "MaxSOACacheEntryTtlLimit" -Value 300 -Type DWord -Force;
      Set-ItemProperty -Path $path -Name "NegativeCacheTime" -Value 0 -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      $path = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters";
      Remove-ItemProperty -Path $path -Name "CacheHashTableBucketSize" -EA SilentlyContinue;
      Remove-ItemProperty -Path $path -Name "CacheHashTableSize" -EA SilentlyContinue;
      Remove-ItemProperty -Path $path -Name "MaxCacheEntryTtlLimit" -EA SilentlyContinue;
      Remove-ItemProperty -Path $path -Name "MaxSOACacheEntryTtlLimit" -EA SilentlyContinue;
      Remove-ItemProperty -Path $path -Name "NegativeCacheTime" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $path = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters";
      $v1 = (Get-ItemProperty -Path $path -Name "CacheHashTableBucketSize" -EA SilentlyContinue).CacheHashTableBucketSize;
      $v2 = (Get-ItemProperty -Path $path -Name "NegativeCacheTime" -EA SilentlyContinue).NegativeCacheTime;
      $v3 = (Get-ItemProperty -Path $path -Name "MaxCacheEntryTtlLimit" -EA SilentlyContinue).MaxCacheEntryTtlLimit;
      if ($v1 -eq 1 -and $v2 -eq 0 -and $v3 -eq 64000) { "true" } else { "false" }
    `,
  },
};

// ── per-action UAC elevation helpers ─────────────────────────────────────────
// checkIsAdmin and runElevated are imported from ps-shared.js.

// ── executor API ──────────────────────────────────────────────────────────────

/**
 * Execute a network tweak action.
 * @param {string} tweakId
 * @param {'apply'|'revert'} action  — must match the preload ALLOWED_TWEAK_ACTIONS set
 * @returns {{ tweakId, action, success, verified, message, requiresRestart, disabled?, reason?, error? }}
 */
async function executeNetworkTweak(tweakId, action) {
  const entry = TWEAK_REGISTRY[tweakId];

  if (!entry) {
    return {
      tweakId, action,
      success: false, verified: false,
      message: `Unknown tweak: ${tweakId}`,
      requiresRestart: false,
      error: 'not_found',
    };
  }

  if (entry.disabled) {
    return {
      tweakId, action,
      success: false, verified: false,
      message: entry.reason,
      requiresRestart: false,
      disabled: true,
    };
  }

  const script = action === 'apply' ? entry.apply : entry.revert;

  // ── Write step: use per-action elevation when not already admin ──────────────
  let rawOutput = '';
  const alreadyAdmin = await checkIsAdmin();

  if (alreadyAdmin) {
    try {
      rawOutput = await execPowerShell(script);
    } catch (err) {
      return {
        tweakId, action,
        success: false, verified: false,
        message: err.message,
        requiresRestart: false,
        error: 'execution_error',
      };
    }
  } else {
    console.log(`[NetworkTweak] Requesting UAC elevation for ${tweakId} (${action})`);
    const elevResult = await runElevated(script);
    if (elevResult.cancelled) {
      return {
        tweakId, action,
        success: false, verified: false,
        message: 'Admin permission was canceled. No system changes were made.',
        requiresRestart: false,
        error: 'uac_cancelled',
      };
    }
    if (!elevResult.ok) {
      return {
        tweakId, action,
        success: false, verified: false,
        message: elevResult.error || 'Elevated command failed.',
        requiresRestart: false,
        error: 'elevation_failed',
      };
    }
  }

  // ── Verification step (read-only, no elevation needed) ─────────────────────
  let verified = false;
  if (entry.check) {
    try {
      const checkOut = await execPowerShell(entry.check);
      const isEnabled = normalizePSBoolOutput(checkOut);
      if (isEnabled !== null) {
        verified = action === 'apply' ? isEnabled : !isEnabled;
      }
    } catch (verifyErr) {
      console.warn(`[NetworkTweak] Verification inconclusive for ${tweakId}:`, verifyErr.message);
    }
  }

  const verb = action === 'apply' ? 'Enabled' : 'Disabled';
  return {
    tweakId, action,
    success: true,
    verified,
    message: verified ? `${verb} and verified` : `${verb} (verification inconclusive)`,
    requiresRestart: false,
    rawOutput,
  };
}

/**
 * Check the current applied status of a tweak (true = applied, false = not, null = unknown).
 * @param {string} tweakId
 * @returns {{ tweakId, applied: boolean|null, disabled?: boolean, reason?: string }}
 */
async function checkNetworkTweakStatus(tweakId) {
  const entry = TWEAK_REGISTRY[tweakId];
  if (!entry) return { tweakId, applied: null };
  if (entry.disabled) return { tweakId, applied: null, disabled: true, reason: entry.reason };
  if (!entry.check) return { tweakId, applied: null };

  try {
    const out = await execPowerShell(entry.check);
    // normalizePSBoolOutput: null = inconclusive → applied: null
    return { tweakId, applied: normalizePSBoolOutput(out) };
  } catch {
    return { tweakId, applied: null };
  }
}

/**
 * Bulk check all tweaks — runs all checks in parallel for speed.
 */
async function checkAllNetworkTweakStatus() {
  const tweakIds = Object.keys(TWEAK_REGISTRY);
  const checks   = await Promise.all(tweakIds.map(id => checkNetworkTweakStatus(id)));
  const results  = {};
  tweakIds.forEach((id, i) => { results[id] = checks[i]; });
  return results;
}

function getDisabledTweaks() {
  const out = {};
  for (const [id, entry] of Object.entries(TWEAK_REGISTRY)) {
    if (entry.disabled) out[id] = entry.reason;
  }
  return out;
}

// ── Ownership-aware wrapper ────────────────────────────────────────────────────

const ownershipStore = require('./ownership-store');

/**
 * Execute a network tweak AND maintain the ownership / baseline record.
 *
 * Order:
 *   1. Read current real system state via checkNetworkTweakStatus (baseline read)
 *   2. Store baseline ONLY if not already captured (immutable first-capture)
 *   3. Run the tweak command (existing executeNetworkTweak)
 *   4. Record appliedByApp=true ONLY after confirmed success
 *
 * previousValue is the tri-state result of the check script:
 *   true  = tweak was already applied before we touched it
 *   false = tweak was not applied
 *   null  = inconclusive — revert pipeline will skip this item (fail-safe)
 */
async function executeNetworkTweakWithOwnership(tweakId, action) {
  const scopeKey = ownershipStore.buildScopeKey('network_tweak', tweakId);

  // Step 1+2: capture baseline if first time
  const existing = ownershipStore.getOwnershipRecord(scopeKey);
  if (!existing || !existing.baselineCaptured) {
    try {
      const status = await checkNetworkTweakStatus(tweakId);
      // status.applied: boolean | null (null = inconclusive or disabled)
      const verifySucceeded = typeof status.applied === 'boolean';
      const previousValue = verifySucceeded ? status.applied : null;
      ownershipStore.captureBaseline(scopeKey, {
        itemType:      'network_tweak',
        itemId:        tweakId,
        previousValue,
        verifySucceeded, // if false, captureBaseline skips the write so a later read can get the real baseline
      });
    } catch (e) {
      console.warn('[NetworkTweak] baseline capture failed for', tweakId, '—', e.message);
    }
  }

  // Step 3: execute
  const result = await executeNetworkTweak(tweakId, action);

  // Step 4: update ownership only after confirmed success. A revert must
  // clear app ownership; recording every successful action as recordApply()
  // leaves a reverted network tweak owned/applied forever.
  if (result.success) {
    if (action === 'revert') {
      ownershipStore.recordRevert(scopeKey);
    } else {
      ownershipStore.recordApply(scopeKey, {
        appliedValue:      true,
        verificationState: result.verified ? 'verified' : 'unverified',
      });
    }
  }

  return result;
}

// ── DNS Benchmark (runs locally on the user's PC) ─────────────────────────────

const DNS_BENCHMARK_PROVIDERS = [
  { id: 'cloudflare', label: 'Cloudflare', ip: '1.1.1.1',         port: 53 },
  { id: 'google',     label: 'Google',     ip: '8.8.8.8',         port: 53 },
  { id: 'quad9',      label: 'Quad9',      ip: '9.9.9.9',         port: 53 },
  { id: 'opendns',    label: 'OpenDNS',    ip: '208.67.222.222',  port: 53 },
  { id: 'adguard',    label: 'AdGuard',    ip: '94.140.14.14',    port: 53 },
];

/**
 * Single TCP probe to host:port. Returns latency in ms, or null on failure/timeout.
 */
function tcpProbe(host, port, timeoutMs = 1500) {
  return new Promise(resolve => {
    const t0 = performance.now();
    const socket = new net.Socket();
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(val);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(performance.now() - t0));
    socket.on('timeout', () => finish(null));
    socket.on('error',   () => finish(null));
    socket.connect(port, host);
  });
}

/**
 * Benchmark all 5 DNS providers from the local machine.
 * Returns a DnsBenchmarkResult-shaped object matching the server schema.
 */
async function benchmarkDnsProviders() {
  const PROBES         = 5;
  const STAGGER_MS     = 90;

  // Node reports the resolver addresses currently selected by Windows. This
  // commonly includes the user's router (for example 192.168.1.1), while
  // still respecting VPN and manually configured adapter DNS.
  const localResolvers = dns.getServers()
    .filter(ip => net.isIPv4(ip) && !ip.startsWith('127.') && ip !== '0.0.0.0')
    .filter((ip, index, list) => list.indexOf(ip) === index)
    .map((ip, index) => ({
      id: `local-dns-${index}`,
      label: index === 0 ? 'Your Network DNS' : `Your Network DNS ${index + 1}`,
      ip,
      port: 53,
      local: true,
    }))
    .filter(provider => !DNS_BENCHMARK_PROVIDERS.some(publicProvider => publicProvider.ip === provider.ip));

  const providersToBenchmark = [...localResolvers, ...DNS_BENCHMARK_PROVIDERS];

  async function probeProvider(provider) {
    const samples = [];
    for (let i = 0; i < PROBES; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, STAGGER_MS));
      const t = await tcpProbe(provider.ip, provider.port, 1500);
      samples.push(t);
    }
    const succeeded = samples.filter(v => v !== null);
    const loss      = parseFloat(((1 - succeeded.length / PROBES) * 100).toFixed(0));

    if (succeeded.length === 0) {
      return { id: provider.id, label: provider.label, ip: provider.ip,
        local: provider.local === true,
        avg: 999, median: 999, min: 999, max: 999, jitter: 0, loss: 100, stabilityScore: 0 };
    }

    // Trim highest + lowest outlier if 4+ samples succeeded
    let trimmed = [...succeeded].sort((a, b) => a - b);
    if (trimmed.length >= 4) trimmed = trimmed.slice(1, trimmed.length - 1);

    const avg    = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
    const mid    = Math.floor(trimmed.length / 2);
    const median = trimmed.length % 2 === 0
      ? (trimmed[mid - 1] + trimmed[mid]) / 2
      : trimmed[mid];
    const min    = trimmed[0];
    const max    = trimmed[trimmed.length - 1];
    const jitter = trimmed.length > 1
      ? trimmed.reduce((s, v) => s + Math.abs(v - avg), 0) / trimmed.length
      : 0;

    const jitterRatio    = avg > 0 ? jitter / avg : 0;
    const stabilityScore = Math.max(0, Math.min(100,
      Math.round(100 - jitterRatio * 60 - loss * 1.5)));

    return {
      id: provider.id, label: provider.label, ip: provider.ip,
      local: provider.local === true,
      avg:    parseFloat(avg.toFixed(1)),
      median: parseFloat(median.toFixed(1)),
      min:    parseFloat(min.toFixed(1)),
      max:    parseFloat(max.toFixed(1)),
      jitter: parseFloat(jitter.toFixed(1)),
      loss,
      stabilityScore,
    };
  }

  // All 5 providers probed in parallel
  const results = await Promise.all(providersToBenchmark.map(p => probeProvider(p)));

  const alive  = results.filter(p => p.loss < 100);
  const ranked = [...results].sort((a, b) => a.avg - b.avg);

  const scored = alive.map(p => {
    const latencyScore   = Math.max(0, 100 - p.avg * 0.8);
    const jitterScore    = Math.max(0, 100 - p.jitter * 6);
    const lossScore      = Math.max(0, 100 - p.loss * 8);
    const stabilityBonus = p.stabilityScore;
    const composite      = latencyScore * 0.40 + jitterScore * 0.30 + lossScore * 0.20 + stabilityBonus * 0.10;
    return { ...p, composite };
  }).sort((a, b) => b.composite - a.composite);

  const recommended = scored[0]?.id ?? ranked[0]?.id ?? 'cloudflare';
  const rec         = results.find(p => p.id === recommended);

  const recommendedReasons = [];
  if (rec && alive.length > 0) {
    const byAvg    = [...alive].sort((a, b) => a.avg    - b.avg);
    const byJitter = [...alive].sort((a, b) => a.jitter - b.jitter);
    const byStab   = [...alive].sort((a, b) => b.stabilityScore - a.stabilityScore);
    if (byAvg[0]?.id    === recommended) recommendedReasons.push('Lowest average latency');
    if (byJitter[0]?.id === recommended) recommendedReasons.push('Lowest jitter');
    if (byStab[0]?.id   === recommended) recommendedReasons.push('Highest stability score');
    if (rec.loss === 0)                  recommendedReasons.push('Zero packet loss');
    if (rec.median < byAvg[0].avg * 0.95) recommendedReasons.push('Best median response time');
  }
  if (recommendedReasons.length === 0) recommendedReasons.push('Best overall composite score');

  const byAvg    = alive.length ? [...alive].sort((a, b) => a.avg    - b.avg)   : results;
  const byJitter = alive.length ? [...alive].sort((a, b) => a.jitter - b.jitter) : results;
  const byStab   = alive.length ? [...alive].sort((a, b) => b.stabilityScore - a.stabilityScore) : results;
  const byGaming = alive.length
    ? [...alive].sort((a, b) => (a.avg * 0.55 + a.jitter * 0.45) - (b.avg * 0.55 + b.jitter * 0.45))
    : results;

  const categoryWinners = {
    bestOverall:   scored[0]?.id   ?? '',
    lowestLatency: byAvg[0]?.id    ?? '',
    lowestJitter:  byJitter[0]?.id ?? '',
    mostStable:    byStab[0]?.id   ?? '',
    bestGaming:    byGaming[0]?.id ?? '',
  };

  const avgLoss  = alive.length > 0 ? alive.reduce((s, p) => s + p.loss, 0) / alive.length : 100;
  const allAlive = alive.length === providersToBenchmark.length;
  const topJitter = scored[0]?.jitter ?? 999;

  let confidence;
  if (allAlive && avgLoss === 0 && topJitter < 5)     confidence = 'very_high';
  else if (alive.length >= 4 && avgLoss < 20)          confidence = 'high';
  else if (alive.length >= 3)                          confidence = 'medium';
  else                                                 confidence = 'low';

  const providers = ranked.map((p, i) => ({ ...p, rank: i + 1 }));

  return {
    providers,
    recommended,
    recommendedReasons,
    confidence,
    categoryWinners,
    localResolvers: localResolvers.map(({ id, label, ip }) => ({ id, label, ip })),
    ts: Date.now(),
  };
}

/** Map a primary DNS IP to its provider's canonical secondary IP. */
const DNS_SECONDARY_MAP = {
  '1.1.1.1':       '1.0.0.1',       // Cloudflare
  '8.8.8.8':       '8.8.4.4',       // Google
  '9.9.9.9':       '149.112.112.112', // Quad9
  '208.67.222.222':'208.67.220.220', // OpenDNS
  '94.140.14.14':  '94.140.15.15',  // AdGuard
};

/**
 * Apply a DNS server to all active network adapters via elevated PowerShell.
 * Saves original per-adapter DNS before applying so revertDnsServers can restore.
 * Returns { ok, error?, cancelled? }.
 */
async function applyDnsServers(ip) {
  const safeIp = String(ip).replace(/[^0-9.:]/g, '');
  if (!safeIp) return { ok: false, error: 'Invalid IP address' };

  const secondaryIp = DNS_SECONDARY_MAP[safeIp] || null;
  const serverAddresses = secondaryIp ? `'${safeIp}', '${secondaryIp}'` : `'${safeIp}'`;
  const { DNS_SERVERS_BACKUP_FILE } = require('./user-data-paths');
  const safeBackup = DNS_SERVERS_BACKUP_FILE.replace(/'/g, "''");

  const command = [
    // Capture original DNS for all adapters before changing anything
    `$adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }`,
    `$backup = @()`,
    `foreach ($a in $adapters) {`,
    `  $cur = (Get-DnsClientServerAddress -InterfaceAlias $a.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses`,
    `  $backup += [PSCustomObject]@{ alias = $a.Name; dns = ($cur -join ',') }`,
    `}`,
    `$dir = Split-Path '${safeBackup}'`,
    `if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }`,
    `($backup | ConvertTo-Json -Compress) | Out-File -FilePath ('${safeBackup}' + '.tmp') -Encoding utf8 -Force`,
    `if (Test-Path ('${safeBackup}' + '.tmp')) { Move-Item -Path ('${safeBackup}' + '.tmp') -Destination '${safeBackup}' -Force -ErrorAction SilentlyContinue }`,
    // Now apply the new DNS
    `foreach ($a in $adapters) {`,
    `  Set-DnsClientServerAddress -InterfaceAlias $a.Name -ServerAddresses (${serverAddresses}) -ErrorAction SilentlyContinue`,
    `}`,
    `Write-Output "ok"`,
  ].join('; ');

  try {
    return await runElevated(command);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Restore DNS settings to what they were before the last applyDnsServers call.
 * Reads the per-adapter backup written by applyDnsServers.
 * Returns { ok, error?, cancelled? }.
 */
async function revertDnsServers() {
  const { DNS_SERVERS_BACKUP_FILE } = require('./user-data-paths');
  const safeBackup = DNS_SERVERS_BACKUP_FILE.replace(/'/g, "''");

  const command = [
    `$backupPath = '${safeBackup}'`,
    // Never reset every adapter to DHCP when the backup is gone: the user may
    // have intentionally configured static, VPN, enterprise, or filtered DNS.
    // Throw before touching Windows so the caller can report an inconclusive
    // revert rather than falsely claiming the original values were restored.
    `if (-not (Test-Path $backupPath)) { throw "DNS_BACKUP_MISSING" }`,
    `try { $backup = Get-Content $backupPath -Raw | ConvertFrom-Json } catch { throw "DNS_BACKUP_INVALID" }`,
    `foreach ($entry in $backup) {`,
    `  $addrs = if ($entry.dns) { $entry.dns -split ',' | Where-Object { $_ } } else { @() }`,
    `  if ($addrs.Count -gt 0) {`,
    `    Set-DnsClientServerAddress -InterfaceAlias $entry.alias -ServerAddresses $addrs -ErrorAction SilentlyContinue`,
    `  } else {`,
    `    Set-DnsClientServerAddress -InterfaceAlias $entry.alias -ResetServerAddresses -ErrorAction SilentlyContinue`,
    `  }`,
    `}`,
    `Remove-Item $backupPath -Force -EA SilentlyContinue`,
    `Write-Output "ok"`,
  ].join('; ');

  try {
    const result = await runElevated(command);
    if (result?.ok) return { ok: true, success: true, verified: true, error: null };
    if (result?.error === 'DNS_BACKUP_MISSING') {
      return {
        ok: false,
        success: false,
        inconclusive: true,
        error: 'No DNS backup found — cannot confirm original values, nothing was reverted.',
      };
    }
    if (result?.error === 'DNS_BACKUP_INVALID') {
      return {
        ok: false,
        success: false,
        inconclusive: true,
        error: 'DNS backup is invalid — cannot confirm original values, nothing was reverted.',
      };
    }
    return { ...result, ok: false, success: false };
  } catch (e) {
    return { ok: false, success: false, inconclusive: true, error: e.message };
  }
}

module.exports = {
  executeNetworkTweak,
  executeNetworkTweakWithOwnership,
  checkNetworkTweakStatus,
  checkAllNetworkTweakStatus,
  getDisabledTweaks,
  benchmarkDnsProviders,
  applyDnsServers,
  revertDnsServers,
  TWEAK_REGISTRY,
  // normalization helpers
  normalizePSBoolOutput,
  // normalizeNetshOutput is defined above but currently unused by callers
};
