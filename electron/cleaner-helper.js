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
// P2-C1: use global limiter so cleaner never exceeds system-wide PS process cap
const psLimiter = require('./powershell-limiter');

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

// ── SCAN_DEFS builder helpers ─────────────────────────────────────────────────
// Returns a scanCmd thunk: scans a list of paths for matching files.
// filter:  optional glob (e.g. '*.pf'); null = all files
// recurse: true = -Recurse (default)
function buildPathsScanCmd(paths, { filter = null, recurse = true } = {}) {
  const psArr = paths.map(p => `'${p}'`).join(',\n        ');
  let gci = 'Get-ChildItem $p';
  if (filter) gci += ` -Filter '${filter}'`;
  if (recurse) gci += ' -Recurse';
  gci += ' -Force -ErrorAction SilentlyContinue';
  const fileWhere = !filter ? ' | Where-Object {!$_.PSIsContainer}' : '';
  return () => `
      $paths = @(
        ${psArr}
      )
      $total = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          $items = ${gci}${fileWhere}
          $total += ($items | Measure-Object Length -Sum).Sum
          $cnt   += $items.Count
        }
      }
      Write-Output "$total|$cnt"
    `;
}

// Returns a cleanCmd thunk: deletes matching files across a list of paths.
// removeEmptyDirs: true = also prune empty directories after file deletion
function buildPathsCleanCmd(paths, { filter = null, recurse = true, removeEmptyDirs = false } = {}) {
  const psArr = paths.map(p => `'${p}'`).join(',\n        ');
  let gci = 'Get-ChildItem $p';
  if (filter) gci += ` -Filter '${filter}'`;
  if (recurse) gci += ' -Recurse';
  gci += ' -Force -ErrorAction SilentlyContinue';
  const fileWhere = !filter ? '\n            | Where-Object {!$_.PSIsContainer}' : '';
  const emptyDirPass = removeEmptyDirs ? `
          # Remove empty dirs (deepest first)
          Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object {$_.PSIsContainer} |
            Sort-Object FullName -Descending |
            ForEach-Object {
              Try { Remove-Item $_.FullName -Force -ErrorAction Stop } Catch {}
            }` : '';
  return () => `
      $paths = @(
        ${psArr}
      )
      $removed = 0; $cnt = 0; $fail = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          ${gci}${fileWhere} |
            ForEach-Object {
              Try {
                $sz = $_.Length
                Remove-Item $_.FullName -Force -ErrorAction Stop
                $removed += $sz; $cnt++
              } Catch { $fail++ }
            }${emptyDirPass}
        }
      }
      Write-Output "$removed|$cnt|$fail"
    `;
}

// ── Item scan definitions ─────────────────────────────────────────────────────
// Each entry describes HOW to scan for an item. Actual PowerShell is inlined.

const SCAN_DEFS = {
  // Storage Noise ─────────────────────────────────────────────────────────────
  windows_temp: {
    scanCmd: buildPathsScanCmd([temp, windir + '\\Temp']),
    cleanCmd: buildPathsCleanCmd([temp, windir + '\\Temp'], { removeEmptyDirs: true }),
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
    scanCmd: buildPathsScanCmd([windir + '\\Minidump', local + '\\CrashDumps', windir + '\\LiveKernelReports']),
    cleanCmd: buildPathsCleanCmd([windir + '\\Minidump', local + '\\CrashDumps', windir + '\\LiveKernelReports']),
  },

  wer_reports: {
    scanCmd: buildPathsScanCmd([
      local + '\\Microsoft\\Windows\\WER\\ReportArchive',
      local + '\\Microsoft\\Windows\\WER\\ReportQueue',
      roaming + '\\Microsoft\\Windows\\WER',
    ]),
    cleanCmd: buildPathsCleanCmd([
      local + '\\Microsoft\\Windows\\WER\\ReportArchive',
      local + '\\Microsoft\\Windows\\WER\\ReportQueue',
      roaming + '\\Microsoft\\Windows\\WER',
    ]),
  },

  // Privacy Residue ──────────────────────────────────────────────────────────
  thumbcache: {
    scanCmd: buildPathsScanCmd([local + '\\Microsoft\\Windows\\Explorer'], { filter: 'thumbcache_*.db', recurse: false }),
    cleanCmd: buildPathsCleanCmd([local + '\\Microsoft\\Windows\\Explorer'], { filter: 'thumbcache_*.db', recurse: false }),
  },

  recent_files: {
    scanCmd: buildPathsScanCmd([roaming + '\\Microsoft\\Windows\\Recent'], { filter: '*.lnk', recurse: false }),
    cleanCmd: buildPathsCleanCmd([roaming + '\\Microsoft\\Windows\\Recent'], { filter: '*.lnk', recurse: false }),
  },

  // Latency Killers ──────────────────────────────────────────────────────────
  discord_cache: {
    scanCmd: buildPathsScanCmd([roaming + '\\discord\\Cache', roaming + '\\discord\\Code Cache', roaming + '\\discord\\GPUCache']),
    cleanCmd: buildPathsCleanCmd([roaming + '\\discord\\Cache', roaming + '\\discord\\Code Cache', roaming + '\\discord\\GPUCache']),
  },

  steam_htmlcache: {
    scanCmd: buildPathsScanCmd([local + '\\Steam\\htmlcache', roaming + '\\Microsoft\\Windows\\INetCache']),
    cleanCmd: buildPathsCleanCmd([local + '\\Steam\\htmlcache', roaming + '\\Microsoft\\Windows\\INetCache']),
  },

  shader_cache: {
    scanCmd: buildPathsScanCmd([local + '\\NVIDIA\\DXCache', local + '\\NVIDIA\\GLCache', local + '\\D3DSCache', local + '\\AMD\\DxCache']),
    cleanCmd: buildPathsCleanCmd([local + '\\NVIDIA\\DXCache', local + '\\NVIDIA\\GLCache', local + '\\D3DSCache', local + '\\AMD\\DxCache']),
  },

  anticheat_temp: {
    scanCmd: buildPathsScanCmd([local + '\\Temp\\EasyAntiCheat', local + '\\Temp\\Vanguard', local + '\\Temp\\BattlEye', windir + '\\Temp\\EasyAntiCheat']),
    cleanCmd: buildPathsCleanCmd([local + '\\Temp\\EasyAntiCheat', local + '\\Temp\\Vanguard', local + '\\Temp\\BattlEye', windir + '\\Temp\\EasyAntiCheat']),
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
              $rawVal = ($_.Value -replace '"','').Trim()
              $expanded = [System.Environment]::ExpandEnvironmentVariables($rawVal)
              $exe = $expanded.Split(' ')[0].Trim()
              $sysPath = $exe -match '(?i)(system32|SysWOW64|SystemRoot|Windows\\)'
              If (!$sysPath -and $exe -match '^[A-Za-z]:\\' -and !(Test-Path $exe)) {
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
              $rawVal = ($_.Value -replace '"','').Trim()
              $expanded = [System.Environment]::ExpandEnvironmentVariables($rawVal)
              $exe = $expanded.Split(' ')[0].Trim()
              $sysPath = $exe -match '(?i)(system32|SysWOW64|SystemRoot|Windows\\)'
              If (!$sysPath -and $exe -match '^[A-Za-z]:\\' -and !(Test-Path $exe)) {
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
            $removed += $sz; $cnt++
          } Catch {}
        }
      Write-Output "$removed|$cnt|0"
    `,
  },

  // ── Gaming ─────────────────────────────────────────────────────────────────
  steam_download_cache: {
    scanCmd: () => `
      $paths = @(
        'C:\\Program Files (x86)\\Steam\\steamapps\\downloading',
        'C:\\Program Files (x86)\\Steam\\steamapps\\temp'
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
      $paths = @('C:\\Program Files (x86)\\Steam\\steamapps\\downloading','C:\\Program Files (x86)\\Steam\\steamapps\\temp')
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

  steam_shader_cache: {
    scanCmd: () => `
      $p = 'C:\\Program Files (x86)\\Steam\\steamapps\\shadercache'
      If (Test-Path $p) {
        $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
        $total = ($items | Measure-Object Length -Sum).Sum
        Write-Output "$total|$($items.Count)"
      } Else { Write-Output "0|0" }
    `,
    cleanCmd: () => `
      $p = 'C:\\Program Files (x86)\\Steam\\steamapps\\shadercache'
      $removed = 0; $cnt = 0
      If (Test-Path $p) {
        Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
          Where-Object {!$_.PSIsContainer} |
          ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  epic_games_cache: {
    scanCmd: buildPathsScanCmd([local + '\\EpicGamesLauncher\\Saved\\webcache', local + '\\EpicGamesLauncher\\Saved\\Logs']),
    cleanCmd: buildPathsCleanCmd([local + '\\EpicGamesLauncher\\Saved\\webcache', local + '\\EpicGamesLauncher\\Saved\\Logs']),
  },

  // ── Apps ──────────────────────────────────────────────────────────────────
  spotify_cache: {
    scanCmd: buildPathsScanCmd([local + '\\Spotify\\Data', roaming + '\\Spotify\\Data']),
    cleanCmd: buildPathsCleanCmd([local + '\\Spotify\\Data', roaming + '\\Spotify\\Data']),
  },

  vscode_cache: {
    scanCmd: buildPathsScanCmd([roaming + '\\Code\\Cache', roaming + '\\Code\\CachedData', roaming + '\\Code\\logs']),
    cleanCmd: buildPathsCleanCmd([roaming + '\\Code\\Cache', roaming + '\\Code\\CachedData', roaming + '\\Code\\logs']),
  },

  teams_cache: {
    scanCmd: buildPathsScanCmd([
      roaming + '\\Microsoft\\Teams\\Cache',
      roaming + '\\Microsoft\\Teams\\blob_storage',
      roaming + '\\Microsoft\\Teams\\databases',
      roaming + '\\Microsoft\\Teams\\GPUCache',
      roaming + '\\Microsoft\\Teams\\IndexedDB',
      roaming + '\\Microsoft\\Teams\\Local Storage',
      roaming + '\\Microsoft\\Teams\\tmp',
    ]),
    cleanCmd: buildPathsCleanCmd([
      roaming + '\\Microsoft\\Teams\\Cache',
      roaming + '\\Microsoft\\Teams\\blob_storage',
      roaming + '\\Microsoft\\Teams\\databases',
      roaming + '\\Microsoft\\Teams\\GPUCache',
      roaming + '\\Microsoft\\Teams\\IndexedDB',
      roaming + '\\Microsoft\\Teams\\Local Storage',
      roaming + '\\Microsoft\\Teams\\tmp',
    ]),
  },

  zoom_cache: {
    scanCmd: buildPathsScanCmd([roaming + '\\Zoom\\data', local + '\\Zoom\\data']),
    cleanCmd: buildPathsCleanCmd([roaming + '\\Zoom\\data', local + '\\Zoom\\data']),
  },

  obs_cache: {
    scanCmd: buildPathsScanCmd([roaming + '\\obs-studio\\logs', roaming + '\\obs-studio\\crashes']),
    cleanCmd: buildPathsCleanCmd([roaming + '\\obs-studio\\logs', roaming + '\\obs-studio\\crashes']),
  },

  voicemeeter_logs: {
    scanCmd: buildPathsScanCmd([roaming + '\\VoicemeeterBanana'], { filter: '*.log', recurse: false }),
    cleanCmd: buildPathsCleanCmd([roaming + '\\VoicemeeterBanana'], { filter: '*.log', recurse: false }),
  },

  adobe_cache: {
    scanCmd: () => `
      $total = 0; $cnt = 0
      $fixedPaths = @('${roaming}\\Adobe\\Common\\Media Cache Files','${local}\\Adobe\\Premiere Pro')
      foreach ($p in $fixedPaths) {
        If (Test-Path $p) {
          $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
          $total += ($items | Measure-Object Length -Sum).Sum; $cnt += $items.Count
        }
      }
      $aeBase = '${roaming}\\Adobe\\After Effects'
      If (Test-Path $aeBase) {
        Get-ChildItem $aeBase -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $dc = "$($_.FullName)\\disk cache"
          If (Test-Path $dc) {
            $items = Get-ChildItem $dc -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
            $total += ($items | Measure-Object Length -Sum).Sum; $cnt += $items.Count
          }
        }
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $removed = 0; $cnt = 0
      $fixedPaths = @('${roaming}\\Adobe\\Common\\Media Cache Files','${local}\\Adobe\\Premiere Pro')
      foreach ($p in $fixedPaths) {
        If (Test-Path $p) {
          Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object {!$_.PSIsContainer} |
            ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
        }
      }
      $aeBase = '${roaming}\\Adobe\\After Effects'
      If (Test-Path $aeBase) {
        Get-ChildItem $aeBase -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $dc = "$($_.FullName)\\disk cache"
          If (Test-Path $dc) {
            Get-ChildItem $dc -Recurse -Force -ErrorAction SilentlyContinue |
              Where-Object {!$_.PSIsContainer} |
              ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
          }
        }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  onedrive_cache: {
    scanCmd: buildPathsScanCmd([local + '\\Microsoft\\OneDrive\\logs', local + '\\Microsoft\\OneDrive\\temp']),
    cleanCmd: buildPathsCleanCmd([local + '\\Microsoft\\OneDrive\\logs', local + '\\Microsoft\\OneDrive\\temp']),
  },

  // ── Browsers ──────────────────────────────────────────────────────────────
  edge_cache: {
    scanCmd: buildPathsScanCmd([local + '\\Microsoft\\Edge\\User Data\\Default\\Cache', local + '\\Microsoft\\Edge\\User Data\\Default\\Code Cache']),
    cleanCmd: buildPathsCleanCmd([local + '\\Microsoft\\Edge\\User Data\\Default\\Cache', local + '\\Microsoft\\Edge\\User Data\\Default\\Code Cache']),
  },

  chrome_cache: {
    scanCmd: buildPathsScanCmd([local + '\\Google\\Chrome\\User Data\\Default\\Cache', local + '\\Google\\Chrome\\User Data\\Default\\Code Cache']),
    cleanCmd: buildPathsCleanCmd([local + '\\Google\\Chrome\\User Data\\Default\\Cache', local + '\\Google\\Chrome\\User Data\\Default\\Code Cache']),
  },

  firefox_cache: {
    scanCmd: () => `
      $profilesDir = '${local}\\Mozilla\\Firefox\\Profiles'
      $total = 0; $cnt = 0
      If (Test-Path $profilesDir) {
        Get-ChildItem $profilesDir -Directory -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -like '*.default-release' } |
          ForEach-Object {
            foreach ($sub in @('cache2','startupCache')) {
              $sp = "$($_.FullName)\\$sub"
              If (Test-Path $sp) {
                $items = Get-ChildItem $sp -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
                $total += ($items | Measure-Object Length -Sum).Sum; $cnt += $items.Count
              }
            }
          }
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $profilesDir = '${local}\\Mozilla\\Firefox\\Profiles'
      $removed = 0; $cnt = 0
      If (Test-Path $profilesDir) {
        Get-ChildItem $profilesDir -Directory -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -like '*.default-release' } |
          ForEach-Object {
            foreach ($sub in @('cache2','startupCache')) {
              $sp = "$($_.FullName)\\$sub"
              If (Test-Path $sp) {
                Get-ChildItem $sp -Recurse -Force -ErrorAction SilentlyContinue |
                  Where-Object {!$_.PSIsContainer} |
                  ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
              }
            }
          }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  // ── Windows System ─────────────────────────────────────────────────────────
  windows_prefetch: {
    scanCmd: buildPathsScanCmd([windir + '\\Prefetch'], { filter: '*.pf', recurse: false }),
    cleanCmd: buildPathsCleanCmd([windir + '\\Prefetch'], { filter: '*.pf', recurse: false }),
  },

  windows_font_cache: {
    scanCmd: buildPathsScanCmd([windir + '\\ServiceProfiles\\LocalService\\AppData\\Local\\FontCache'], { filter: '*.dat', recurse: false }),
    cleanCmd: buildPathsCleanCmd([windir + '\\ServiceProfiles\\LocalService\\AppData\\Local\\FontCache'], { filter: '*.dat', recurse: false }),
  },

  windows_icon_cache: {
    scanCmd: () => `
      $total = 0; $cnt = 0
      $single = '${local}\\IconCache.db'
      If (Test-Path $single) { $sz=(Get-Item $single -Force -EA SilentlyContinue).Length; If ($sz) { $total += $sz; $cnt++ } }
      $explorerDir = '${local}\\Microsoft\\Windows\\Explorer'
      If (Test-Path $explorerDir) {
        $items = Get-ChildItem $explorerDir -Filter 'iconcache*.db' -Force -ErrorAction SilentlyContinue
        $total += ($items | Measure-Object Length -Sum).Sum; $cnt += $items.Count
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $removed = 0; $cnt = 0
      $single = '${local}\\IconCache.db'
      If (Test-Path $single) { Try { $sz=(Get-Item $single -Force).Length; Remove-Item $single -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
      $explorerDir = '${local}\\Microsoft\\Windows\\Explorer'
      If (Test-Path $explorerDir) {
        Get-ChildItem $explorerDir -Filter 'iconcache*.db' -Force -ErrorAction SilentlyContinue |
          ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  directx_shader_cache: {
    scanCmd: () => `
      $p = '${local}\\D3DSCache'
      If (Test-Path $p) {
        $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
        $total = ($items | Measure-Object Length -Sum).Sum
        Write-Output "$total|$($items.Count)"
      } Else { Write-Output "0|0" }
    `,
    cleanCmd: () => `
      $p = '${local}\\D3DSCache'
      $removed = 0; $cnt = 0
      If (Test-Path $p) {
        Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
          Where-Object {!$_.PSIsContainer} |
          ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  windows_installer_leftovers: {
    scanCmd: () => `
      $p = '${windir}\\Installer\\$PatchCache$'
      If (Test-Path $p) {
        $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
          Where-Object {!$_.PSIsContainer}
        $total = ($items | Measure-Object Length -Sum).Sum
        Write-Output "$total|$($items.Count)"
      } Else { Write-Output "0|0" }
    `,
    cleanCmd: () => `
      $p = '${windir}\\Installer\\$PatchCache$'
      $removed = 0; $cnt = 0
      If (Test-Path $p) {
        Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
          Where-Object {!$_.PSIsContainer} |
          ForEach-Object {
            Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {}
          }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  windows_memory_dump: {
    scanCmd: () => `
      $total = 0; $cnt = 0
      $full = '${windir}\\MEMORY.DMP'
      If (Test-Path $full) { $sz=(Get-Item $full -Force -EA SilentlyContinue).Length; If ($sz) { $total += $sz; $cnt++ } }
      $miniDir = '${windir}\\Minidump'
      If (Test-Path $miniDir) {
        $items = Get-ChildItem $miniDir -Filter '*.dmp' -Force -ErrorAction SilentlyContinue
        $total += ($items | Measure-Object Length -Sum).Sum; $cnt += $items.Count
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $removed = 0; $cnt = 0
      $full = '${windir}\\MEMORY.DMP'
      If (Test-Path $full) { Try { $sz=(Get-Item $full -Force).Length; Remove-Item $full -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
      $miniDir = '${windir}\\Minidump'
      If (Test-Path $miniDir) {
        Get-ChildItem $miniDir -Filter '*.dmp' -Force -ErrorAction SilentlyContinue |
          ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  windows_cbs_logs: {
    scanCmd: buildPathsScanCmd([windir + '\\Logs\\CBS'], { filter: '*.log', recurse: false }),
    cleanCmd: buildPathsCleanCmd([windir + '\\Logs\\CBS'], { filter: '*.log', recurse: false }),
  },

  windows_dism_logs: {
    scanCmd: buildPathsScanCmd([windir + '\\Logs\\DISM'], { filter: '*.log', recurse: false }),
    cleanCmd: buildPathsCleanCmd([windir + '\\Logs\\DISM'], { filter: '*.log', recurse: false }),
  },

  windows_defender_history: {
    scanCmd: buildPathsScanCmd(['C:\\ProgramData\\Microsoft\\Windows Defender\\Scans\\History\\Service']),
    cleanCmd: buildPathsCleanCmd(['C:\\ProgramData\\Microsoft\\Windows Defender\\Scans\\History\\Service']),
  },

  windows_delivery_optimization: {
    scanCmd: buildPathsScanCmd([windir + '\\SoftwareDistribution\\DeliveryOptimization']),
    cleanCmd: buildPathsCleanCmd([windir + '\\SoftwareDistribution\\DeliveryOptimization']),
  },

  wer_queue: {
    scanCmd: buildPathsScanCmd(['C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportQueue', 'C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportArchive']),
    cleanCmd: buildPathsCleanCmd(['C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportQueue', 'C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportArchive']),
  },

  print_spooler: {
    scanCmd: () => `
      $p = '${windir}\\System32\\spool\\PRINTERS'
      If (Test-Path $p) {
        $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
        $total = ($items | Measure-Object Length -Sum).Sum
        Write-Output "$total|$($items.Count)"
      } Else { Write-Output "0|0" }
    `,
    cleanCmd: () => `
      $removed = 0; $cnt = 0
      $p = '${windir}\\System32\\spool\\PRINTERS'
      Try { Stop-Service -Name Spooler -Force -ErrorAction Stop } Catch {}
      Try {
        If (Test-Path $p) {
          Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object {!$_.PSIsContainer} |
            ForEach-Object {
              Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {}
            }
        }
      } Finally {
        Try { Start-Service -Name Spooler -ErrorAction SilentlyContinue } Catch {}
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  iis_logs: {
    scanCmd: () => `
      $p = 'C:\\inetpub\\logs\\LogFiles'
      If (Test-Path $p) {
        $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
        $total = ($items | Measure-Object Length -Sum).Sum
        Write-Output "$total|$($items.Count)"
      } Else { Write-Output "0|0" }
    `,
    cleanCmd: () => `
      $p = 'C:\\inetpub\\logs\\LogFiles'
      $removed = 0; $cnt = 0
      If (Test-Path $p) {
        Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
          Where-Object {!$_.PSIsContainer} |
          ForEach-Object { Try { $sz=$_.Length; Remove-Item $_.FullName -Force -EA Stop; $removed+=$sz; $cnt++ } Catch {} }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  bluetooth_pairing_logs: {
    scanCmd: () => `
      $p = '${windir}\\System32\\winevt\\Logs'
      If (Test-Path $p) {
        $items = Get-ChildItem $p -Filter 'Microsoft-Windows-Bluetooth*.evtx' -Force -ErrorAction SilentlyContinue
        $total = ($items | Measure-Object Length -Sum).Sum
        Write-Output "$total|$($items.Count)"
      } Else { Write-Output "0|0" }
    `,
    cleanCmd: () => `
      $p = '${windir}\\System32\\winevt\\Logs'
      $removed = 0; $cnt = 0
      If (Test-Path $p) {
        Get-ChildItem $p -Filter 'Microsoft-Windows-Bluetooth*.evtx' -Force -ErrorAction SilentlyContinue |
          ForEach-Object {
            Try {
              $sz = $_.Length
              wevtutil.exe cl $_.BaseName 2>$null
              $removed += $sz; $cnt++
            } Catch {}
          }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  // ── Storage Cleanup ────────────────────────────────────────────────────────
  recycle_bin: {
    scanCmd: () => `
      $total = 0; $cnt = 0
      Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object {
        $rb = "$($_.Root)\`$Recycle.Bin"
        If (Test-Path $rb) {
          $items = Get-ChildItem $rb -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
          $total += ($items | Measure-Object Length -Sum).Sum; $cnt += $items.Count
        }
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      $total = 0; $cnt = 0; $failed = 0
      Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object {
        $rb = "$($_.Root)\`$Recycle.Bin"
        If (Test-Path $rb) {
          $items = Get-ChildItem $rb -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object {!$_.PSIsContainer}
          $drvBytes = ($items | Measure-Object Length -Sum).Sum
          $drvCnt   = $items.Count
          If ($drvCnt -gt 0) {
            Try {
              Clear-RecycleBin -DriveLetter $_.Name -Force -ErrorAction Stop
              $total += $drvBytes
              $cnt   += $drvCnt
            } Catch {
              $failed++
            }
          }
        }
      }
      Write-Output "$total|$cnt|$failed"
    `,
  },

  old_windows_update: {
    scanCmd: () => `
      $paths = @('C:\\Windows.old','C:\\$WinREAgent')
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
      $paths = @('C:\\Windows.old','C:\\$WinREAgent')
      $removed = 0; $cnt = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
          $removed += ($items | Measure-Object Length -Sum).Sum; $cnt += $items.Count
          Try { Remove-Item $p -Recurse -Force -ErrorAction Stop } Catch {}
        }
      }
      Write-Output "$removed|$cnt|0"
    `,
  },

  nvidia_driver_cache: {
    scanCmd: () => `
      $paths = @('C:\\NVIDIA',"${temp}\\NVIDIA Corporation")
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
      $paths = @('C:\\NVIDIA',"${temp}\\NVIDIA Corporation")
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

  amd_driver_cache: {
    scanCmd: buildPathsScanCmd(['C:\\AMD', temp + '\\AMD']),
    cleanCmd: buildPathsCleanCmd(['C:\\AMD', temp + '\\AMD']),
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
  // P2-C1: single-flight — prevent a second scan while one is running
  const token = psLimiter.tryAcquire({ file: 'cleaner-helper.js', fn: 'cleaner:scan', reason: 'cleaner-scan' });
  if (!token) return { ok: false, reason: 'busy', results: {} };

  const ids = Array.isArray(itemIds) ? itemIds : Object.keys(SCAN_DEFS);
  const results = {};
  try {
    await Promise.all(ids.map(async id => {
      const def = SCAN_DEFS[id];
      if (!def) { results[id] = { sizeBytes: 0, fileCount: 0, found: false, error: 'unknown-item' }; return; }
      try {
        const timeout = id === 'old_windows_update' ? 60000 : 15000;
        const out = await runPS(def.scanCmd(), timeout);
        const { a: sizeBytes, b: fileCount } = parseOutput(out);
        results[id] = { sizeBytes, fileCount, found: fileCount > 0 || sizeBytes > 0 };
      } catch (err) {
        results[id] = { sizeBytes: 0, fileCount: 0, found: false, error: err.message };
      }
    }));
  } finally {
    psLimiter.release(token);
  }
  return { ok: true, results };
});

// ── IPC: cleaner:clean ────────────────────────────────────────────────────────
// Cleans selected items. Returns { ok, results: { [itemId]: { bytesRemoved, filesRemoved, failed, error? } } }

ipcMain.handle('cleaner:clean', async (event, itemIds) => {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'not-windows', results: {} };
  }
  // P2-C1: single-flight — prevent clean while scan (or another clean) is running
  const token = psLimiter.tryAcquire({ file: 'cleaner-helper.js', fn: 'cleaner:clean', reason: 'cleaner-clean' });
  if (!token) return { ok: false, reason: 'busy', results: {} };

  const results = {};
  try {
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
  } finally {
    psLimiter.release(token);
  }
  return { ok: true, results };
});

// ── IPC: cleaner:verify ───────────────────────────────────────────────────────
// Re-scans after cleaning to verify. Returns same structure as scan.

ipcMain.handle('cleaner:verify', async (event, itemIds) => {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'not-windows', results: {} };
  }
  // P2-C1: single-flight — verify is a scan operation, use the scan slot
  const token = psLimiter.tryAcquire({ file: 'cleaner-helper.js', fn: 'cleaner:verify', reason: 'cleaner-verify' });
  if (!token) return { ok: false, reason: 'busy', results: {} };

  const results = {};
  try {
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
  } finally {
    psLimiter.release(token);
  }
  return { ok: true, results };
});

console.log('[Cleaner] IPC handlers registered');
