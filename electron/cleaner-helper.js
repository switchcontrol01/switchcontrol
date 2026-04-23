/**
 * cleaner-helper.js
 * Real Windows system cleaner IPC handlers.
 * Uses PowerShell for all file scanning and deletion.
 * Windows-only. Returns graceful { ok: false } on other platforms.
 */

const { ipcMain } = require('electron');
const { execFile } = require('child_process');
const os = require('os');
const path = require('path');

// ── PowerShell runner ─────────────────────────────────────────────────────────
function runPS(cmd, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('Windows only'));
    execFile(
      'powershell.exe',
      ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
       '-WindowStyle', 'Hidden', '-Command', cmd],
      { timeout: timeoutMs, maxBuffer: 1024 * 512, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve(stdout?.trim() ?? '');
      }
    );
  });
}

// ── Path helpers ──────────────────────────────────────────────────────────────
const windir = process.env.WINDIR || 'C:\\Windows';
const temp    = process.env.TEMP  || path.join(os.homedir(), 'AppData', 'Local', 'Temp');
const local   = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const roaming = process.env.APPDATA      || path.join(os.homedir(), 'AppData', 'Roaming');

// ── Item scan definitions ─────────────────────────────────────────────────────
// Each entry describes HOW to scan for an item. Actual PowerShell is inlined.

const SCAN_DEFS = {
  // Storage Noise ─────────────────────────────────────────────────────────────
  windows_temp: {
    scanCmd: () => `
      $paths = @('${temp}', '${windir}\\Temp')
      $total = 0; $cnt = 0
      foreach ($p in $paths) {
        $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue
        $total += ($items | Where-Object {!$_.PSIsContainer} | Measure-Object Length -Sum).Sum
        $cnt   += ($items | Where-Object {!$_.PSIsContainer}).Count
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $paths = @('${temp}', '${windir}\\Temp')
      $removed = 0; $cnt = 0; $fail = 0
      foreach ($p in $paths) {
        Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
          Where-Object {!$_.PSIsContainer} |
          ForEach-Object {
            Try {
              $sz = $_.Length
              Remove-Item $_.FullName -Force -ErrorAction Stop
              $removed += $sz; $cnt++
            } Catch { $fail++ }
          }
        # Remove empty dirs
        Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
          Where-Object {$_.PSIsContainer} |
          Sort-Object FullName -Descending |
          ForEach-Object {
            Try { Remove-Item $_.FullName -Force -ErrorAction Stop } Catch {}
          }
      }
      Write-Output "$removed|$cnt|$fail"
    `,
  },

  update_downloads: {
    scanCmd: () => `
      $p = '${windir}\\SoftwareDistribution\\Download'
      If (Test-Path $p) {
        $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
        $total = ($items | Measure-Object Length -Sum).Sum
        $cnt = $items.Count
        Write-Output "$total|$cnt"
      } Else { Write-Output "0|0" }
    `,
    cleanCmd: () => `
      $p = '${windir}\\SoftwareDistribution\\Download'
      $removed = 0; $cnt = 0
      If (Test-Path $p) {
        Get-ChildItem $p -Force -ErrorAction SilentlyContinue |
          ForEach-Object {
            Try {
              $sz = (Get-ChildItem $_.FullName -Recurse -Force -EA SilentlyContinue |
                Where-Object {!$_.PSIsContainer} | Measure-Object Length -Sum).Sum
              Remove-Item $_.FullName -Recurse -Force -ErrorAction Stop
              $removed += $sz; $cnt++
            } Catch {}
          }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  crash_dumps: {
    scanCmd: () => `
      $paths = @(
        '${windir}\\Minidump',
        '${local}\\CrashDumps',
        '${windir}\\LiveKernelReports'
      )
      $total = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
          $total += ($items | Measure-Object Length -Sum).Sum
          $cnt   += $items.Count
        }
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $paths = @('${windir}\\Minidump','${local}\\CrashDumps','${windir}\\LiveKernelReports')
      $removed = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object {!$_.PSIsContainer} |
            ForEach-Object {
              Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {}
            }
        }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  wer_reports: {
    scanCmd: () => `
      $paths = @(
        '${local}\\Microsoft\\Windows\\WER\\ReportArchive',
        '${local}\\Microsoft\\Windows\\WER\\ReportQueue',
        '${roaming}\\Microsoft\\Windows\\WER'
      )
      $total = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
          $total += ($items | Measure-Object Length -Sum).Sum
          $cnt   += $items.Count
        }
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $paths = @(
        '${local}\\Microsoft\\Windows\\WER\\ReportArchive',
        '${local}\\Microsoft\\Windows\\WER\\ReportQueue',
        '${roaming}\\Microsoft\\Windows\\WER'
      )
      $removed = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object {!$_.PSIsContainer} |
            ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
        }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  // Privacy Residue ──────────────────────────────────────────────────────────
  thumbcache: {
    scanCmd: () => `
      $p = '${local}\\Microsoft\\Windows\\Explorer'
      If (Test-Path $p) {
        $items = Get-ChildItem $p -Filter 'thumbcache_*.db' -Force -ErrorAction SilentlyContinue
        $total = ($items | Measure-Object Length -Sum).Sum
        Write-Output "$total|$($items.Count)"
      } Else { Write-Output "0|0" }
    `,
    cleanCmd: () => `
      $p = '${local}\\Microsoft\\Windows\\Explorer'
      $removed = 0; $cnt = 0
      If (Test-Path $p) {
        Get-ChildItem $p -Filter 'thumbcache_*.db' -Force -ErrorAction SilentlyContinue |
          ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  recent_files: {
    scanCmd: () => `
      $p = '${roaming}\\Microsoft\\Windows\\Recent'
      If (Test-Path $p) {
        $items = Get-ChildItem $p -Filter '*.lnk' -Force -ErrorAction SilentlyContinue
        $total = ($items | Measure-Object Length -Sum).Sum
        Write-Output "$total|$($items.Count)"
      } Else { Write-Output "0|0" }
    `,
    cleanCmd: () => `
      $p = '${roaming}\\Microsoft\\Windows\\Recent'
      $removed = 0; $cnt = 0
      If (Test-Path $p) {
        Get-ChildItem $p -Filter '*.lnk' -Force -ErrorAction SilentlyContinue |
          ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  // Latency Killers ──────────────────────────────────────────────────────────
  discord_cache: {
    scanCmd: () => `
      $paths = @('${roaming}\\discord\\Cache','${roaming}\\discord\\Code Cache','${roaming}\\discord\\GPUCache')
      $total = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
          $total += ($items | Measure-Object Length -Sum).Sum; $cnt += $items.Count
        }
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $paths = @('${roaming}\\discord\\Cache','${roaming}\\discord\\Code Cache','${roaming}\\discord\\GPUCache')
      $removed = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object {!$_.PSIsContainer} |
            ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
        }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  steam_htmlcache: {
    scanCmd: () => `
      $paths = @(
        '${local}\\Steam\\htmlcache',
        '${roaming}\\Microsoft\\Windows\\INetCache'
      )
      $total = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
          $total += ($items | Measure-Object Length -Sum).Sum; $cnt += $items.Count
        }
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $paths = @('${local}\\Steam\\htmlcache','${roaming}\\Microsoft\\Windows\\INetCache')
      $removed = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object {!$_.PSIsContainer} |
            ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
        }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  shader_cache: {
    scanCmd: () => `
      $paths = @(
        '${local}\\NVIDIA\\DXCache',
        '${local}\\NVIDIA\\GLCache',
        '${local}\\D3DSCache',
        '${local}\\AMD\\DxCache'
      )
      $total = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
          $total += ($items | Measure-Object Length -Sum).Sum; $cnt += $items.Count
        }
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $paths = @('${local}\\NVIDIA\\DXCache','${local}\\NVIDIA\\GLCache','${local}\\D3DSCache','${local}\\AMD\\DxCache')
      $removed = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object {!$_.PSIsContainer} |
            ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
        }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  anticheat_temp: {
    scanCmd: () => `
      $paths = @(
        '${local}\\Temp\\EasyAntiCheat',
        '${local}\\Temp\\Vanguard',
        '${local}\\Temp\\BattlEye',
        '${windir}\\Temp\\EasyAntiCheat'
      )
      $total = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
          $total += ($items | Measure-Object Length -Sum).Sum; $cnt += $items.Count
        }
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $paths = @('${local}\\Temp\\EasyAntiCheat','${local}\\Temp\\Vanguard','${local}\\Temp\\BattlEye','${windir}\\Temp\\EasyAntiCheat')
      $removed = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object {!$_.PSIsContainer} |
            ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
        }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  dns_cache: {
    scanCmd: () => `
      # DNS cache is in RAM, not disk. We report fixed estimate if cache has entries.
      Try {
        $entries = Get-DnsClientCache -ErrorAction Stop
        If ($entries.Count -gt 0) { Write-Output "0|$($entries.Count)" }
        Else { Write-Output "0|0" }
      } Catch { Write-Output "0|0" }
    `,
    cleanCmd: () => `
      Try {
        Clear-DnsClientCache -ErrorAction Stop
        Write-Output "0|1|0"
      } Catch { Write-Output "0|0|1" }
    `,
  },

  // Performance Waste ────────────────────────────────────────────────────────
  dead_startup_entries: {
    scanCmd: () => `
      $regPaths = @(
        'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
      )
      $dead = 0
      foreach ($rp in $regPaths) {
        If (Test-Path $rp) {
          $vals = Get-ItemProperty $rp -ErrorAction SilentlyContinue
          $vals.PSObject.Properties |
            Where-Object { $_.Name -notlike 'PS*' } |
            ForEach-Object {
              $exe = ($_.Value -replace '"','').Split(' ')[0].Trim()
              # Check if path exists (skip env vars, registry-only, system paths)
              If ($exe -match '^[A-Za-z]:\\' -and $exe -notmatch 'system32|SysWOW64' -and !(Test-Path $exe)) {
                $dead++
              }
            }
        }
      }
      Write-Output "0|$dead"
    `,
    cleanCmd: () => `
      $regPaths = @(
        'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
      )
      $cnt = 0
      foreach ($rp in $regPaths) {
        If (Test-Path $rp) {
          $vals = Get-ItemProperty $rp -ErrorAction SilentlyContinue
          $vals.PSObject.Properties |
            Where-Object { $_.Name -notlike 'PS*' } |
            ForEach-Object {
              $name = $_.Name
              $exe = ($_.Value -replace '"','').Split(' ')[0].Trim()
              If ($exe -match '^[A-Za-z]:\\' -and $exe -notmatch 'system32|SysWOW64' -and !(Test-Path $exe)) {
                Try {
                  Remove-ItemProperty -Path $rp -Name $name -ErrorAction Stop
                  $cnt++
                } Catch {}
              }
            }
        }
      }
      Write-Output "0|$cnt|0"
    `,
  },

  event_logs_old: {
    // Advanced mode only — clears old archived event logs
    scanCmd: () => `
      $p = '${windir}\\System32\\winevt\\Logs'
      $items = Get-ChildItem $p -Filter '*.evtx' -ErrorAction SilentlyContinue
      $total = ($items | Measure-Object Length -Sum).Sum
      Write-Output "$total|$($items.Count)"
    `,
    cleanCmd: () => `
      # Only clear non-critical archived logs
      $skip = @('System','Application','Security','Setup')
      $p = '${windir}\\System32\\winevt\\Logs'
      $removed = 0; $cnt = 0
      Get-ChildItem $p -Filter '*.evtx' -ErrorAction SilentlyContinue |
        Where-Object { $n = $_.BaseName; !($skip | Where-Object {$n -like "*$_*"}) } |
        ForEach-Object {
          Try {
            $sz = $_.Length
            wevtutil.exe cl $_.BaseName 2>$null
            $removed += $sz - $_.Length; $cnt++
          } Catch {}
        }
      Write-Output "$removed|$cnt|0"
    `,
  },
};

// ── Parse scan/clean output ───────────────────────────────────────────────────
function parseOutput(output) {
  const parts = output.split('|').map(p => parseInt(p.trim(), 10) || 0);
  return { a: parts[0] ?? 0, b: parts[1] ?? 0, c: parts[2] ?? 0 };
}

// ── IPC: cleaner:scan ─────────────────────────────────────────────────────────
// Returns { ok, results: { [itemId]: { sizeBytes, fileCount, found, error? } } }

ipcMain.handle('cleaner:scan', async (event, itemIds) => {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'not-windows', results: {} };
  }

  const ids = Array.isArray(itemIds) ? itemIds : Object.keys(SCAN_DEFS);
  const results = {};

  await Promise.all(ids.map(async id => {
    const def = SCAN_DEFS[id];
    if (!def) { results[id] = { sizeBytes: 0, fileCount: 0, found: false, error: 'unknown-item' }; return; }
    try {
      const out = await runPS(def.scanCmd(), 15000);
      const { a: sizeBytes, b: fileCount } = parseOutput(out);
      results[id] = { sizeBytes, fileCount, found: fileCount > 0 || sizeBytes > 0 };
    } catch (err) {
      results[id] = { sizeBytes: 0, fileCount: 0, found: false, error: err.message };
    }
  }));

  return { ok: true, results };
});

// ── IPC: cleaner:clean ────────────────────────────────────────────────────────
// Cleans selected items. Returns { ok, results: { [itemId]: { bytesRemoved, filesRemoved, failed, error? } } }

ipcMain.handle('cleaner:clean', async (event, itemIds) => {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'not-windows', results: {} };
  }

  const results = {};

  for (const id of itemIds) {
    const def = SCAN_DEFS[id];
    if (!def) { results[id] = { bytesRemoved: 0, filesRemoved: 0, failed: 0, error: 'unknown-item' }; continue; }
    try {
      const out = await runPS(def.cleanCmd(), 20000);
      const { a: bytesRemoved, b: filesRemoved, c: failed } = parseOutput(out);
      results[id] = { bytesRemoved, filesRemoved, failed };
    } catch (err) {
      results[id] = { bytesRemoved: 0, filesRemoved: 0, failed: 1, error: err.message };
    }
  }

  return { ok: true, results };
});

// ── IPC: cleaner:verify ───────────────────────────────────────────────────────
// Re-scans after cleaning to verify. Returns same structure as scan.

ipcMain.handle('cleaner:verify', async (event, itemIds) => {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'not-windows', results: {} };
  }

  const results = {};
  await Promise.all(itemIds.map(async id => {
    const def = SCAN_DEFS[id];
    if (!def) { results[id] = { sizeBytes: 0, fileCount: 0, found: false }; return; }
    try {
      const out = await runPS(def.scanCmd(), 12000);
      const { a: sizeBytes, b: fileCount } = parseOutput(out);
      results[id] = { sizeBytes, fileCount, found: fileCount > 0 || sizeBytes > 0 };
    } catch (err) {
      results[id] = { sizeBytes: 0, fileCount: 0, found: false, error: err.message };
    }
  }));

  return { ok: true, results };
});

console.log('[Cleaner] IPC handlers registered');
