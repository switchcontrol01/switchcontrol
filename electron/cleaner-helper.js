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
let cleanerCancelRequested = false;
const activeCleanerProcesses = new Set();

// ── PowerShell runner ─────────────────────────────────────────────────────────
function runPS(cmd, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('Windows only'));
    const child = execFile(
      'powershell.exe',
      ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
       '-WindowStyle', 'Hidden', '-Command', cmd],
      { timeout: timeoutMs, maxBuffer: 1024 * 512, windowsHide: true },
      (err, stdout, stderr) => {
        activeCleanerProcesses.delete(child);
        if (err) return reject(err);
        resolve(stdout?.trim() ?? '');
      }
    );
    activeCleanerProcesses.add(child);
  });
}

// ── Path helpers ──────────────────────────────────────────────────────────────
const windir = process.env.WINDIR || 'C:\\Windows';
const systemDrive = process.env.SystemDrive || path.parse(windir).root.replace(/\\$/, '') || 'C:';
const temp    = process.env.TEMP  || path.join(os.homedir(), 'AppData', 'Local', 'Temp');
const local   = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const roaming = process.env.APPDATA      || path.join(os.homedir(), 'AppData', 'Roaming');

let gpuCapabilityCache = null;
let gpuCapabilityCachedAt = 0;

async function getGpuCapabilities() {
  if (gpuCapabilityCache && Date.now() - gpuCapabilityCachedAt < 300000) {
    return gpuCapabilityCache;
  }
  try {
    const output = await runPS(`
      $names = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue |
        ForEach-Object { $_.Name } | Where-Object { $_ })
      $joined = ($names -join ' ')
      [PSCustomObject]@{
        amd = [bool]($joined -match '(?i)AMD|Radeon')
        nvidia = [bool]($joined -match '(?i)NVIDIA|GeForce|Quadro|Tesla|RTX|GTX')
        names = $names
      } | ConvertTo-Json -Compress
    `, 10000);
    const parsed = JSON.parse(output || '{}');
    gpuCapabilityCache = {
      amd: parsed.amd === true,
      nvidia: parsed.nvidia === true,
      names: Array.isArray(parsed.names) ? parsed.names : [],
    };
  } catch {
    // Unknown must not silently disable a vendor scan. The scan will run and
    // report its real filesystem result when Windows cannot identify the GPU.
    gpuCapabilityCache = { amd: true, nvidia: true, names: [] };
  }
  gpuCapabilityCachedAt = Date.now();
  return gpuCapabilityCache;
}

function isVendorApplicable(id, gpuCapabilities) {
  if (id === 'nvidia_driver_cache') return gpuCapabilities.nvidia;
  if (id === 'amd_driver_cache') return gpuCapabilities.amd;
  return true;
}

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
// Count bytes and files only after each individual delete succeeds. A scan is
// an estimate; locked files and permission failures must not be reported as
// cleaned.
// removeEmptyDirs: true = also prune empty directories after file deletion
function buildPathsCleanCmd(paths, { filter = null, recurse = true, removeEmptyDirs = false } = {}) {
  const psArr = paths.map(p => `'${p}'`).join(',\n        ');
  let gci = 'Get-ChildItem $p';
  if (filter) gci += ` -Filter '${filter}'`;
  if (recurse) gci += ' -Recurse';
  gci += ' -Force -ErrorAction SilentlyContinue';
  const fileWhere = !filter ? ' | Where-Object {!$_.PSIsContainer}' : '';
  const emptyDirPass = removeEmptyDirs ? `
          # Remove empty dirs (deepest first)
          Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object {$_.PSIsContainer} |
            Sort-Object FullName -Descending |
            ForEach-Object { Try { Remove-Item $_.FullName -Force -EA Stop } Catch {} }` : '';
  return () => `
      $paths = @(
        ${psArr}
      )
      $removed = [int64]0; $cnt = 0; $fail = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          $items = ${gci}${fileWhere}
          $items | ForEach-Object {
            Try {
              $sz = [int64]$_.Length
              Remove-Item $_.FullName -Force -EA Stop
              $removed += $sz
              $cnt++
            } Catch { $fail++ }
          }${emptyDirPass}
        }
      }
      Write-Output "$removed|$cnt|$fail"
    `;
}

// Discover profile/library locations at scan time instead of assuming the
// default drive or profile name. Only well-known disposable subdirectories
// are returned; parent folders are never eligible for recursive deletion.
function buildDiscoveredCacheCmd({ roots, subdirs, recurse = true } = {}) {
  const rootArr = roots.map(root => `'${root}'`).join(',\n        ');
  const subArr = subdirs.map(sub => `'${sub}'`).join(', ');
  const recurseFlag = recurse ? ' -Recurse' : '';
  const scan = `
      $roots = @(${rootArr}); $subs = @(${subArr}); $paths = @()
      foreach ($root in $roots) {
        if (Test-Path $root) {
          Get-ChildItem $root -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
            foreach ($sub in $subs) { $candidate = Join-Path $_.FullName $sub; if (Test-Path $candidate) { $paths += $candidate } }
          }
        }
      }
      $total = [int64]0; $cnt = 0
      foreach ($p in ($paths | Sort-Object -Unique)) {
        $items = @(Get-ChildItem $p${recurseFlag} -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer})
        $measure = $items | Measure-Object Length -Sum
        if ($null -ne $measure.Sum) { $total += [int64]$measure.Sum }
        $cnt += $items.Count
      }
      Write-Output "$total|$cnt"
    `;
  const clean = `
      $roots = @(${rootArr}); $subs = @(${subArr}); $paths = @()
      foreach ($root in $roots) {
        if (Test-Path $root) {
          Get-ChildItem $root -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
            foreach ($sub in $subs) { $candidate = Join-Path $_.FullName $sub; if (Test-Path $candidate) { $paths += $candidate } }
          }
        }
      }
      $removed = [int64]0; $cnt = 0; $fail = 0
      foreach ($p in ($paths | Sort-Object -Unique)) {
        $items = @(Get-ChildItem $p${recurseFlag} -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer})
        foreach ($item in $items) {
          try { $sz=[int64]$item.Length; Remove-Item $item.FullName -Force -ErrorAction Stop; $removed += $sz; $cnt++ } catch { $fail++ }
        }
      }
      Write-Output "$removed|$cnt|$fail"
    `;
  return { scanCmd: () => scan, cleanCmd: () => clean };
}

function buildSteamCacheCmd(subdirs) {
  const subArr = subdirs.map(s => `'${s}'`).join(', ');
  const body = (cleaning) => `
      $roots = @()
      $roots += @('${local}\\Steam', '${local}\\SteamLibrary', '${roaming}\\Steam',
        '${process.env.ProgramFiles || 'C:\\Program Files'}\\Steam',
        '${process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Steam')
      try { $roots += (Get-ItemProperty 'HKCU:\\Software\\Valve\\Steam' -ErrorAction Stop).SteamPath } catch {}
      try { $roots += (Get-ItemProperty 'HKCU:\\Software\\Valve\\Steam' -ErrorAction Stop).BaseInstallFolder_1 } catch {}
      $libraryRoots = @()
      foreach ($root in ($roots | Where-Object {$_} | Sort-Object -Unique)) {
        if (Test-Path $root) { $libraryRoots += $root; $vf = Join-Path $root 'steamapps\\libraryfolders.vdf'
          if (Test-Path $vf) { $text = Get-Content $vf -Raw -ErrorAction SilentlyContinue; [regex]::Matches($text, '"path"\\s+"([^"]+)"') | ForEach-Object { $libraryRoots += $_.Groups[1].Value.Replace('\\\\','\\') } }
        }
      }
      $paths = @(); $subs = @(${subArr})
      foreach ($root in ($libraryRoots | Sort-Object -Unique)) {
        foreach ($sub in $subs) { $candidate = Join-Path $root $sub; if (Test-Path $candidate) { $paths += $candidate } }
      }
      $total = [int64]0; $cnt = 0; $fail = 0
      foreach ($p in ($paths | Sort-Object -Unique)) {
        $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
        foreach ($item in $items) {
          ${cleaning ? `try { $sz=[int64]$item.Length; Remove-Item $item.FullName -Force -ErrorAction Stop; $total += $sz; $cnt++ } catch { $fail++ }` : `$measure = $items | Measure-Object Length -Sum; if ($null -ne $measure.Sum) { $total += [int64]$measure.Sum }; $cnt += $items.Count; break`}
        }
      }
      Write-Output "${cleaning ? '$total|$cnt|$fail' : '$total|$cnt'}"
    `;
  return { scanCmd: () => body(false), cleanCmd: () => body(true) };
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
      $removed = [int64]0; $cnt = 0; $fail = 0
      If (Test-Path $p) {
        Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
          Where-Object {!$_.PSIsContainer} |
          ForEach-Object {
            Try {
              $sz = [int64]$_.Length
              Remove-Item $_.FullName -Force -ErrorAction Stop
              $removed += $sz; $cnt++
            } Catch { $fail++ }
          }
      }
      Write-Output "$removed|$cnt|$fail"
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
    ...buildSteamCacheCmd(['steamapps\\common\\SteamWebHelper\\htmlcache', 'htmlcache']),
  },

  inet_cache: {
    scanCmd: buildPathsScanCmd([local + '\\Microsoft\\Windows\\INetCache', roaming + '\\Microsoft\\Windows\\INetCache']),
    cleanCmd: buildPathsCleanCmd([local + '\\Microsoft\\Windows\\INetCache', roaming + '\\Microsoft\\Windows\\INetCache']),
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
    ...buildSteamCacheCmd(['steamapps\\downloading', 'steamapps\\temp']),
  },

  steam_shader_cache: {
    ...buildSteamCacheCmd(['steamapps\\shadercache']),
  },

  epic_games_cache: {
    scanCmd: buildPathsScanCmd([local + '\\EpicGamesLauncher\\Saved\\webcache', local + '\\EpicGamesLauncher\\Saved\\Logs']),
    cleanCmd: buildPathsCleanCmd([local + '\\EpicGamesLauncher\\Saved\\webcache', local + '\\EpicGamesLauncher\\Saved\\Logs']),
  },

  // ── Apps ──────────────────────────────────────────────────────────────────
  spotify_cache: {
    scanCmd: buildPathsScanCmd([
      local + '\\Spotify\\Data\\Browser', local + '\\Spotify\\Data\\Cache',
      local + '\\Spotify\\Data\\GPUCache', local + '\\Spotify\\Data\\Code Cache',
    ]),
    cleanCmd: buildPathsCleanCmd([
      local + '\\Spotify\\Data\\Browser', local + '\\Spotify\\Data\\Cache',
      local + '\\Spotify\\Data\\GPUCache', local + '\\Spotify\\Data\\Code Cache',
    ]),
  },

  vscode_cache: {
    scanCmd: buildPathsScanCmd([roaming + '\\Code\\Cache', roaming + '\\Code\\CachedData', roaming + '\\Code\\logs']),
    cleanCmd: buildPathsCleanCmd([roaming + '\\Code\\Cache', roaming + '\\Code\\CachedData', roaming + '\\Code\\logs']),
  },

  teams_cache: {
    ...buildDiscoveredCacheCmd({
      roots: [roaming + '\\Microsoft', local + '\\Microsoft', local + '\\Packages'],
      subdirs: [
        'Teams\\Cache', 'Teams\\Code Cache', 'Teams\\GPUCache', 'Teams\\blob_storage',
        'Teams\\IndexedDB', 'Teams\\Local Storage', 'Teams\\tmp',
        'LocalCache\\Microsoft\\MSTeams\\Cache', 'LocalCache\\Microsoft\\MSTeams\\Code Cache',
        'LocalCache\\Microsoft\\MSTeams\\GPUCache', 'LocalCache\\Microsoft\\MSTeams\\IndexedDB',
      ],
    }),
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
    ...buildDiscoveredCacheCmd({
      roots: [local + '\\Microsoft\\Edge\\User Data'],
      subdirs: ['Cache', 'Code Cache', 'GPUCache', 'Network\\Cache'],
    }),
  },

  chrome_cache: {
    ...buildDiscoveredCacheCmd({
      roots: [local + '\\Google\\Chrome\\User Data'],
      subdirs: ['Cache', 'Code Cache', 'GPUCache', 'Network\\Cache'],
    }),
  },

  firefox_cache: {
    scanCmd: () => `
      $profilesDir = '${local}\\Mozilla\\Firefox\\Profiles'
      $total = 0; $cnt = 0
      If (Test-Path $profilesDir) {
        Get-ChildItem $profilesDir -Directory -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -match '\\.default(?:-release|-esr)?$' } |
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
          Where-Object { $_.Name -match '\\.default(?:-release|-esr)?$' } |
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
    scanCmd: buildPathsScanCmd([systemDrive + '\\ProgramData\\Microsoft\\Windows\\WER\\ReportQueue', systemDrive + '\\ProgramData\\Microsoft\\Windows\\WER\\ReportArchive']),
    cleanCmd: buildPathsCleanCmd([systemDrive + '\\ProgramData\\Microsoft\\Windows\\WER\\ReportQueue', systemDrive + '\\ProgramData\\Microsoft\\Windows\\WER\\ReportArchive']),
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
      $items = @()
      Try {
        $items = @(Get-RecycleBin -ErrorAction Stop)
      } Catch {
        Try {
          $shell = New-Object -ComObject Shell.Application
          $folder = $shell.Namespace(10)
          If ($folder) { $items = @($folder.Items()) }
        } Catch {}
      }
      $total = [int64]0; $cnt = 0
      foreach ($item in $items) {
        $size = 0
        Try { $size = [int64]$item.Size } Catch {}
        $total += $size
        $cnt++
      }
      Write-Output "$total|$cnt"
    `,
    cleanCmd: () => `
      function Get-RecycleSnapshot {
        $items = @()
        Try {
          $items = @(Get-RecycleBin -ErrorAction Stop)
        } Catch {
          Try {
            $shell = New-Object -ComObject Shell.Application
            $folder = $shell.Namespace(10)
            If ($folder) { $items = @($folder.Items()) }
          } Catch {}
        }
        $total = [int64]0; $count = 0
        foreach ($item in $items) {
          $size = 0
          Try { $size = [int64]$item.Size } Catch {}
          $total += $size
          $count++
        }
        return @($total, $count)
      }
      $before = Get-RecycleSnapshot
      $clearFailed = 0
      Try {
        Clear-RecycleBin -Force -ErrorAction Stop
      } Catch {
        $clearFailed++
        Try {
          $shell = New-Object -ComObject Shell.Application
          $folder = $shell.Namespace(10)
          If ($folder) { $folder.Items() | ForEach-Object { $_.InvokeVerb("delete") } }
        } Catch {}
      }
      $after = Get-RecycleSnapshot
      $beforeBytes = [int64]$before[0]
      $beforeCnt = [int]$before[1]
      $afterBytes = [int64]$after[0]
      $afterCnt = [int]$after[1]
      $removed = [Math]::Max([int64]0, $beforeBytes - $afterBytes)
      $cnt = [Math]::Max(0, $beforeCnt - $afterCnt)
      $failed = $clearFailed + $afterCnt
      Write-Output "$removed|$cnt|$failed"
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
      $removed = [int64]0; $cnt = 0; $fail = 0
      foreach ($p in $paths) {
        If (Test-Path $p) {
          $items = Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer}
          $items | ForEach-Object {
            Try {
              $sz = [int64]$_.Length
              Remove-Item $_.FullName -Force -ErrorAction Stop
              $removed += $sz; $cnt++
            } Catch { $fail++ }
          }
        }
      }
      Write-Output "$removed|$cnt|$fail"
    `,
  },

  nvidia_driver_cache: {
    scanCmd: () => `
      $paths = @("${systemDrive}\\NVIDIA","${temp}\\NVIDIA Corporation")
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
      $paths = @("${systemDrive}\\NVIDIA","${temp}\\NVIDIA Corporation")
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
    scanCmd: buildPathsScanCmd([systemDrive + '\\AMD', temp + '\\AMD']),
    cleanCmd: buildPathsCleanCmd([systemDrive + '\\AMD', temp + '\\AMD']),
  },

  browser_crash_logs: {
    scanCmd: buildDiscoveredCacheCmd({
      roots: [
        local + '\\Google\\Chrome\\User Data', local + '\\Microsoft\\Edge\\User Data',
        local + '\\Mozilla\\Firefox\\Profiles',
      ],
      subdirs: ['Crashpad\\reports', 'Crash Reports', 'crashes', 'minidumps'],
    }),
    cleanCmd: buildDiscoveredCacheCmd({
      roots: [
        local + '\\Google\\Chrome\\User Data', local + '\\Microsoft\\Edge\\User Data',
        local + '\\Mozilla\\Firefox\\Profiles',
      ],
      subdirs: ['Crashpad\\reports', 'Crash Reports', 'crashes', 'minidumps'],
    }),
  },

  discord_variants_cache: {
    scanCmd: buildPathsScanCmd([
      local + '\\Discord\\Cache', local + '\\Discord\\Code Cache', local + '\\Discord\\GPUCache',
      local + '\\DiscordCanary\\Cache', local + '\\DiscordPTB\\Cache',
      roaming + '\\discordcanary\\Cache', roaming + '\\discordptb\\Cache',
    ]),
    cleanCmd: buildPathsCleanCmd([
      local + '\\Discord\\Cache', local + '\\Discord\\Code Cache', local + '\\Discord\\GPUCache',
      local + '\\DiscordCanary\\Cache', local + '\\DiscordPTB\\Cache',
      roaming + '\\discordcanary\\Cache', roaming + '\\discordptb\\Cache',
    ]),
  },

  ea_app_cache: {
    scanCmd: buildPathsScanCmd([local + '\\Electronic Arts\\EA Desktop\\Cache', local + '\\Electronic Arts\\EA Desktop\\Logs']),
    cleanCmd: buildPathsCleanCmd([local + '\\Electronic Arts\\EA Desktop\\Cache', local + '\\Electronic Arts\\EA Desktop\\Logs']),
  },
  battle_net_cache: {
    scanCmd: buildPathsScanCmd([local + '\\Battle.net\\Cache', local + '\\Blizzard Entertainment\\Battle.net\\Cache', local + '\\Blizzard Entertainment\\Battle.net\\Logs']),
    cleanCmd: buildPathsCleanCmd([local + '\\Battle.net\\Cache', local + '\\Blizzard Entertainment\\Battle.net\\Cache', local + '\\Blizzard Entertainment\\Battle.net\\Logs']),
  },
  ubisoft_cache: {
    scanCmd: buildPathsScanCmd([local + '\\Ubisoft Game Launcher\\cache', local + '\\Ubisoft Game Launcher\\logs']),
    cleanCmd: buildPathsCleanCmd([local + '\\Ubisoft Game Launcher\\cache', local + '\\Ubisoft Game Launcher\\logs']),
  },
  riot_client_cache: {
    scanCmd: buildPathsScanCmd([local + '\\Riot Games\\Riot Client\\Data\\Cache', local + '\\Riot Games\\Riot Client\\Logs']),
    cleanCmd: buildPathsCleanCmd([local + '\\Riot Games\\Riot Client\\Data\\Cache', local + '\\Riot Games\\Riot Client\\Logs']),
  },
  office_temp: {
    scanCmd: buildPathsScanCmd([local + '\\Microsoft\\Office\\16.0\\OfficeFileCache', local + '\\Microsoft\\Outlook\\RoamCache', temp], { filter: '*.tmp' }),
    cleanCmd: buildPathsCleanCmd([local + '\\Microsoft\\Office\\16.0\\OfficeFileCache', local + '\\Microsoft\\Outlook\\RoamCache', temp], { filter: '*.tmp' }),
  },
  windows_setup_logs: {
    scanCmd: buildPathsScanCmd([windir + '\\Panther', windir + '\\Logs\\MoSetup', windir + '\\Logs\\SetupCleanupTask'], { filter: '*.log', recurse: false }),
    cleanCmd: buildPathsCleanCmd([windir + '\\Panther', windir + '\\Logs\\MoSetup', windir + '\\Logs\\SetupCleanupTask'], { filter: '*.log', recurse: false }),
  },
  visual_studio_cache: {
    scanCmd: buildPathsScanCmd([local + '\\Microsoft\\VisualStudio', local + '\\Microsoft\\VSCommon'], { filter: '*.log' }),
    cleanCmd: buildPathsCleanCmd([local + '\\Microsoft\\VisualStudio', local + '\\Microsoft\\VSCommon'], { filter: '*.log' }),
  },
  jetbrains_logs: {
    scanCmd: buildPathsScanCmd([local + '\\JetBrains', roaming + '\\JetBrains'], { filter: '*.log' }),
    cleanCmd: buildPathsCleanCmd([local + '\\JetBrains', roaming + '\\JetBrains'], { filter: '*.log' }),
  },
};

// These folders require Windows-managed service/API cleanup or can break
// repair, rollback, or protection history. Keep them visible in Advanced mode
// as unsupported information rather than allowing a filesystem wipe.
const UNSUPPORTED_SCAN_IDS = new Set([
  'event_logs_old', 'windows_installer_leftovers', 'windows_defender_history',
  'old_windows_update', 'windows_font_cache', 'windows_icon_cache',
  'update_downloads', 'windows_delivery_optimization',
]);
for (const id of UNSUPPORTED_SCAN_IDS) delete SCAN_DEFS[id];

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
  cleanerCancelRequested = false;
  const results = {};
  try {
    const gpuCapabilities = await getGpuCapabilities();
    // Keep a small native worker pool. Launching one recursive PowerShell
    // process per item made the cleaner compete with the desktop and disk.
    const workerCount = Math.min(3, Math.max(1, ids.length));
    let nextIndex = 0;
    const scanWorker = async () => {
      while (nextIndex < ids.length && !cleanerCancelRequested) {
        const id = ids[nextIndex++];
      const def = SCAN_DEFS[id];
      if (!def) {
        results[id] = { sizeBytes: 0, fileCount: 0, found: false, unsupported: true, error: 'unsupported-item' };
        continue;
      }
      if (!isVendorApplicable(id, gpuCapabilities)) {
        results[id] = { sizeBytes: 0, fileCount: 0, found: false, notApplicable: true, error: 'gpu-vendor-not-present' };
        continue;
      }
      try {
        const timeout = id === 'old_windows_update' ? 60000 : 15000;
        const out = await runPS(def.scanCmd(), timeout);
        const { a: sizeBytes, b: fileCount } = parseOutput(out);
        results[id] = { sizeBytes, fileCount, found: fileCount > 0 || sizeBytes > 0 };
      } catch (err) {
        results[id] = { sizeBytes: 0, fileCount: 0, found: false, error: err.message };
      }
      }
    };
    await Promise.all(Array.from({ length: workerCount }, () => scanWorker()));
  } finally {
    psLimiter.release(token);
  }
  if (cleanerCancelRequested) return { ok: false, reason: 'cancelled', results };
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
  cleanerCancelRequested = false;
  try {
    const gpuCapabilities = await getGpuCapabilities();
    // Timeout tiers — large-storage items need much more time than 20 s.
    // Per-file iteration on 100k+ files was the original bottleneck; the
    // new bulk-delete strategy is faster, but large dirs still need headroom.
    const LONG_TIMEOUT = 180_000;  // 3 min — Windows.old, driver caches, installer leftovers
    const MID_TIMEOUT  =  90_000;  // 90 s  — temp folders, prefetch, browsers, large caches
    const STD_TIMEOUT  =  30_000;  // 30 s  — small registry / service operations
    const LARGE_ITEMS = new Set([
      'old_windows_update', 'amd_driver_cache', 'nvidia_driver_cache',
      'windows_installer_leftovers', 'windows_delivery_optimization', 'update_downloads',
    ]);
    const MID_ITEMS = new Set([
      'windows_temp', 'edge_cache', 'chrome_cache', 'firefox_cache',
      'shader_cache', 'steam_shader_cache',
      'steam_download_cache', 'recycle_bin', 'teams_cache', 'adobe_cache',
      'spotify_cache', 'event_logs_old', 'windows_defender_history',
    ]);

    for (const id of itemIds) {
      if (cleanerCancelRequested) break;
      const def = SCAN_DEFS[id];
      if (!def) { results[id] = { bytesRemoved: 0, filesRemoved: 0, failed: 0, unsupported: true, error: 'unsupported-item' }; continue; }
      if (!isVendorApplicable(id, gpuCapabilities)) {
        results[id] = { bytesRemoved: 0, filesRemoved: 0, failed: 0, notApplicable: true, error: 'gpu-vendor-not-present' };
        continue;
      }
      const timeout = LARGE_ITEMS.has(id) ? LONG_TIMEOUT : MID_ITEMS.has(id) ? MID_TIMEOUT : STD_TIMEOUT;
      try {
        const out = await runPS(def.cleanCmd(), timeout);
        const { a: bytesRemoved, b: filesRemoved, c: failed } = parseOutput(out);
        results[id] = { bytesRemoved, filesRemoved, failed };
      } catch (err) {
        results[id] = { bytesRemoved: 0, filesRemoved: 0, failed: 1, error: err.message };
      }
    }
  } finally {
    psLimiter.release(token);
  }
  if (cleanerCancelRequested) return { ok: false, reason: 'cancelled', results };
  return { ok: true, results };
});

ipcMain.handle('cleaner:cancel', () => {
  cleanerCancelRequested = true;
  // execFile's timeout is intentionally generous for large caches, so an
  // explicit cancel must terminate the actual children rather than merely
  // preventing the next item from starting.
  for (const child of activeCleanerProcesses) {
    try { child.kill(); } catch (_) {}
  }
  return { ok: true };
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
  cleanerCancelRequested = false;
  try {
    const gpuCapabilities = await getGpuCapabilities();
    const ids = Array.isArray(itemIds) ? itemIds : Object.keys(SCAN_DEFS);
    let nextIndex = 0;
    const verifyWorker = async () => {
      while (nextIndex < ids.length && !cleanerCancelRequested) {
        const id = ids[nextIndex++];
      const def = SCAN_DEFS[id];
      if (!def) { results[id] = { sizeBytes: 0, fileCount: 0, found: false, unsupported: true, error: 'unsupported-item' }; continue; }
      if (!isVendorApplicable(id, gpuCapabilities)) {
        results[id] = { sizeBytes: 0, fileCount: 0, found: false, notApplicable: true, error: 'gpu-vendor-not-present' };
        continue;
      }
      try {
        const out = await runPS(def.scanCmd(), 12000);
        const { a: sizeBytes, b: fileCount } = parseOutput(out);
        results[id] = { sizeBytes, fileCount, found: fileCount > 0 || sizeBytes > 0 };
      } catch (err) {
        results[id] = { sizeBytes: 0, fileCount: 0, found: false, error: err.message };
      }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, Math.max(1, ids.length)) }, () => verifyWorker()));
  } finally {
    psLimiter.release(token);
  }
  return cleanerCancelRequested ? { ok: false, reason: 'cancelled', results } : { ok: true, results };
});

console.log('[Cleaner] IPC handlers registered');
