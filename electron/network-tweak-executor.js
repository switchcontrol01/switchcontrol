/**
 * Network Tweak Executor
 * Real Windows system-level network changes via PowerShell/netsh/registry.
 * Each tweak has: apply, revert, check scripts.
 * Disabled tweaks have a reason string instead of scripts.
 */

'use strict';

const { execFile }    = require('child_process');
const { performance } = require('perf_hooks');
const fs   = require('fs');
const net  = require('net');
const os   = require('os');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────────────────────

// Diagnostic counter — every powershell.exe spawn increments this.
let _net_psCount = 0;

function execPowerShell(command) {
  const id = ++_net_psCount;
  const t0 = Date.now();
  console.log(`[PS:network-tweak] #${id} execPowerShell SPAWN ts=${t0}`);
  return new Promise((resolve, reject) => {
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
  });
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
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "SMB2" -EA SilentlyContinue;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "SMB2" -EA SilentlyContinue).SMB2;
      if ($v -eq 1) { "true" } else { "false" }
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

  'tcp-nagle': {
    requiresAdmin: true,
    apply: `
      Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "TcpNoDelay" -Value 1 -Type DWord -Force;
      $ifaces = Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" -EA SilentlyContinue;
      foreach ($iface in $ifaces) {
        Set-ItemProperty -Path $iface.PSPath -Name "TcpAckFrequency" -Value 1 -Type DWord -Force -EA SilentlyContinue;
        Set-ItemProperty -Path $iface.PSPath -Name "TCPNoDelay" -Value 1 -Type DWord -Force -EA SilentlyContinue;
      }
      Write-Output "ok"
    `,
    revert: `
      Remove-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "TcpNoDelay" -EA SilentlyContinue;
      $ifaces = Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" -EA SilentlyContinue;
      foreach ($iface in $ifaces) {
        Remove-ItemProperty -Path $iface.PSPath -Name "TcpAckFrequency" -EA SilentlyContinue;
        Remove-ItemProperty -Path $iface.PSPath -Name "TCPNoDelay" -EA SilentlyContinue;
      }
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "TcpNoDelay" -EA SilentlyContinue).TcpNoDelay;
      if ($v -eq 1) { "true" } else { "false" }
    `,
  },

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

  'tcp-throttling-index': {
    requiresAdmin: true,
    apply: `
      New-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Force -EA SilentlyContinue | Out-Null;
      Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Name "NetworkThrottlingIndex" -Value 0xFFFFFFFF -Type DWord -Force;
      Write-Output "ok"
    `,
    revert: `
      Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Name "NetworkThrottlingIndex" -Value 10 -Type DWord -Force;
      Write-Output "ok"
    `,
    check: `
      $v = (Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Name "NetworkThrottlingIndex" -EA SilentlyContinue).NetworkThrottlingIndex;
      if ($null -ne $v -and $v -lt 0) { "true" } else { "false" }
    `,
  },

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
      $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' };
      foreach ($a in $adapters) {
        try { netsh int ip set interface "$($a.Name)" weakhostsend=enabled weakhostreceive=enabled 2>&1 | Out-Null } catch {}
      }
      Write-Output "ok"
    `,
    revert: `
      $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' };
      foreach ($a in $adapters) {
        try { netsh int ip set interface "$($a.Name)" weakhostsend=disabled weakhostreceive=disabled 2>&1 | Out-Null } catch {}
      }
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
      netsh int tcp set global autotuninglevel=normal;
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
        netsh int tcp set supplemental template=Internet congestionprovider=CTCP 2>&1 | Out-Null;
        Write-Output "ok"
      } catch {
        Write-Output "ok"
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
      netsh int ip set dynamicportrange protocol=tcp startport=1024 numberofports=64511;
      netsh int ip set dynamicportrange protocol=udp startport=1024 numberofports=64511;
      Write-Output "ok"
    `,
    revert: `
      netsh int ip set dynamicportrange protocol=tcp startport=49152 numberofports=16384;
      netsh int ip set dynamicportrange protocol=udp startport=49152 numberofports=16384;
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
        $disabled = $offloads | Where-Object { [string]$_.UdpIPv4RxEnabled -imatch '^false$|^disabled$|^0$' };
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
      # Write NetbiosOptions=2 (disabled) directly to the registry for every
      # Tcpip_{GUID} sub-key under NetBT\Parameters\Interfaces.
      # WMI SetTcpipNetbios() is deprecated on Windows 11 and silently fails to
      # update the registry, so we write the registry directly instead.
      $root = 'HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters\Interfaces'
      if (Test-Path $root) {
        $keys = Get-ChildItem -Path $root -ErrorAction SilentlyContinue
        foreach ($k in $keys) {
          Set-ItemProperty -Path $k.PSPath -Name NetbiosOptions -Value 2 -Type DWord -Force -ErrorAction SilentlyContinue
        }
      }
      Write-Output "ok"
    `,
    revert: `
      # Restore NetbiosOptions=0 (use DHCP/default) on all adapter sub-keys.
      $root = 'HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters\Interfaces'
      if (Test-Path $root) {
        $keys = Get-ChildItem -Path $root -ErrorAction SilentlyContinue
        foreach ($k in $keys) {
          Set-ItemProperty -Path $k.PSPath -Name NetbiosOptions -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
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
      $v = (Get-ItemProperty -Path $path -Name "CacheHashTableBucketSize" -EA SilentlyContinue).CacheHashTableBucketSize;
      if ($v -eq 1) { "true" } else { "false" }
    `,
  },
};

// ── per-action UAC elevation helpers ─────────────────────────────────────────

let _isAdminCache = null;
async function checkIsAdmin() {
  if (_isAdminCache !== null) return _isAdminCache;
  try {
    _isAdminCache = await new Promise(resolve => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command',
          '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],
        { windowsHide: true, timeout: 6000 },
        (err, stdout) => resolve(!err && stdout.trim().toLowerCase() === 'true')
      );
    });
  } catch { _isAdminCache = false; }
  return _isAdminCache;
}

/**
 * Run a single-line PowerShell command in an elevated process via
 * Start-Process -Verb RunAs. Returns { ok, error, cancelled }.
 */
async function runElevated(command) {
  const id         = `sc_net_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const scriptPath = path.join(os.tmpdir(), `${id}.ps1`);
  const resultPath = path.join(os.tmpdir(), `${id}_result.json`);
  const safeScript = scriptPath.replace(/'/g, "''");
  const safeResult = resultPath.replace(/'/g, "''");

  const scriptContent = [
    `$ErrorActionPreference = 'Stop'`,
    `try {`,
    `  ${command}`,
    `  $r = @{ ok = $true; error = $null }`,
    `} catch {`,
    `  $r = @{ ok = $false; error = $_.Exception.Message }`,
    `}`,
    `try { [System.IO.File]::WriteAllText('${safeResult}', ($r | ConvertTo-Json -Compress)) } catch { $r | ConvertTo-Json -Compress | Out-File -FilePath '${safeResult}' -Encoding ascii -Force }`,
  ].join('\r\n');

  fs.writeFileSync(scriptPath, scriptContent, 'utf8');

  // -WindowStyle Hidden on Start-Process itself sets SW_HIDE at ShellExecuteEx / process
  // creation time so conhost.exe never shows the window, not just after powershell starts.
  const launchCmd = `Start-Process powershell -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File','${safeScript}') -Verb RunAs -Wait`;

  try {
    await new Promise((resolve, reject) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', launchCmd],
        { timeout: 120_000, windowsHide: true },
        (err) => err ? reject(err) : resolve()
      );
    });

    const deadline = Date.now() + 5000;
    while (!fs.existsSync(resultPath) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    if (fs.existsSync(resultPath)) {
      const raw = fs.readFileSync(resultPath, 'utf8').replace(/^\uFEFF/, '').trim();
      try { return JSON.parse(raw); } catch { return { ok: false, error: `Bad result JSON: ${raw.slice(0, 100)}` }; }
    }
    return { ok: false, error: 'Result file not produced — elevated script may have crashed.' };
  } catch (err) {
    const msg = err?.message || String(err);
    if (/cancel|denied|elevat|access|uac/i.test(msg) || err?.code === 1) {
      return { ok: false, cancelled: true, error: 'Admin permission was canceled. No system changes were made.' };
    }
    return { ok: false, error: `Elevation failed: ${msg}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(resultPath); } catch {}
  }
}

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
 * Bulk check all tweaks.
 */
async function checkAllNetworkTweakStatus() {
  const results = {};
  for (const tweakId of Object.keys(TWEAK_REGISTRY)) {
    results[tweakId] = await checkNetworkTweakStatus(tweakId);
  }
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
      const previousValue = (typeof status.applied === 'boolean') ? status.applied : null;
      ownershipStore.captureBaseline(scopeKey, {
        itemType:      'network_tweak',
        itemId:        tweakId,
        previousValue,
      });
    } catch (e) {
      console.warn('[NetworkTweak] baseline capture failed for', tweakId, '—', e.message);
    }
  }

  // Step 3: execute
  const result = await executeNetworkTweak(tweakId, action);

  // Step 4: record ownership only after confirmed success
  if (result.success) {
    ownershipStore.recordApply(scopeKey, {
      appliedValue:      action === 'apply',
      verificationState: result.verified ? 'verified' : 'unverified',
    });
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
  const results = await Promise.all(DNS_BENCHMARK_PROVIDERS.map(p => probeProvider(p)));

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
  const allAlive = alive.length === DNS_BENCHMARK_PROVIDERS.length;
  const topJitter = scored[0]?.jitter ?? 999;

  let confidence;
  if (allAlive && avgLoss === 0 && topJitter < 5)     confidence = 'very_high';
  else if (alive.length >= 4 && avgLoss < 20)          confidence = 'high';
  else if (alive.length >= 3)                          confidence = 'medium';
  else                                                 confidence = 'low';

  const providers = ranked.map((p, i) => ({ ...p, rank: i + 1 }));

  return { providers, recommended, recommendedReasons, confidence, categoryWinners, ts: Date.now() };
}

/**
 * Apply a DNS server to all active network adapters via elevated PowerShell.
 * Uses the primary IP passed plus 1.0.0.1 as secondary.
 * Returns { ok, error?, cancelled? }.
 */
async function applyDnsServers(ip) {
  const safeIp = String(ip).replace(/[^0-9.:]/g, '');
  if (!safeIp) return { ok: false, error: 'Invalid IP address' };

  const command = [
    `$adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }`,
    `foreach ($a in $adapters) {`,
    `  Set-DnsClientServerAddress -InterfaceAlias $a.Name -ServerAddresses ('${safeIp}', '1.0.0.1') -ErrorAction SilentlyContinue`,
    `}`,
    `Write-Output "ok"`,
  ].join('; ');

  try {
    return await runElevated(command);
  } catch (e) {
    return { ok: false, error: e.message };
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
  TWEAK_REGISTRY,
  // normalization helpers
  normalizePSBoolOutput,
  normalizeNetshOutput,
};
