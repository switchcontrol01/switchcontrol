/**
 * storage-helper.js
 * Drive health & optimization IPC handlers.
 * Uses PowerShell Get-Volume / Get-PhysicalDisk / Optimize-Volume.
 * Windows-only. Returns graceful { ok: false } on other platforms.
 */

const { ipcMain } = require('electron');
const { execFile } = require('child_process');
const psLimiter = require('./powershell-limiter');

function runPS(cmd, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('Windows only'));
    execFile(
      'powershell.exe',
      ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
       '-WindowStyle', 'Hidden', '-Command', cmd],
      { timeout: timeoutMs, maxBuffer: 1024 * 512, windowsHide: true },
      (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout?.trim() ?? '');
      }
    );
  });
}

// ── IPC: storage:getVolumes ───────────────────────────────────────────────────
// Returns { ok, volumes: DriveVolume[] }
// DriveVolume: { letter, label, sizeBytes, freeBytes, healthStatus,
//               mediaType, busType, model, trimEnabled, diskHealth }

ipcMain.handle('storage:getVolumes', async () => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows', volumes: [] };

  const token = psLimiter.tryAcquire({ file: 'storage-helper.js', fn: 'storage:getVolumes', reason: 'storage-volumes' });
  if (!token) return { ok: false, reason: 'busy', volumes: [] };

  try {
    const script = `
$physDisks = Get-PhysicalDisk | Select-Object FriendlyName, MediaType, BusType, HealthStatus, @{N='SizeGB';E={[math]::Round($_.Size/1GB,2)}}
$result = @()
Get-Volume | Where-Object { $_.DriveLetter -and $_.Size -gt 0 } | ForEach-Object {
  $vol = $_
  $letter = $vol.DriveLetter
  $mt = 'Unknown'; $bt = 'Unknown'; $model = ''; $diskHealth = 'Unknown'
  try {
    $part = Get-Partition -DriveLetter $letter -ErrorAction SilentlyContinue
    if ($part) {
      $diskNum = ($part | Select-Object -First 1).DiskNumber
      $rawDisk = Get-Disk -Number $diskNum -ErrorAction SilentlyContinue
      if ($rawDisk) {
        $sizeGB = [math]::Round($rawDisk.Size/1GB, 2)
        $pd = $physDisks | Where-Object { [math]::Abs($_.SizeGB - $sizeGB) -lt 5 } | Select-Object -First 1
        if ($pd) { $mt = $pd.MediaType; $bt = $pd.BusType; $model = $pd.FriendlyName; $diskHealth = $pd.HealthStatus }
      }
    }
  } catch {}
  $trim = 0
  try {
    $t = & fsutil behavior query DisableDeleteNotify 2>&1 | Out-String
    if ($t -match '=\s*0') { $trim = 1 }
  } catch {}
  $entry = "$($letter)|$($vol.FileSystemLabel)|$($vol.Size)|$($vol.SizeRemaining)|$($vol.HealthStatus)|$mt|$bt|$model|$trim|$diskHealth"
  $result += $entry
}
$result -join "||END||"
`;
    const out = await runPS(script, 20000);
    const lines = out.split('||END||').map(l => l.trim()).filter(Boolean);
    const volumes = lines.map(line => {
      const parts = line.split('|');
      return {
        letter:       parts[0]?.trim() ?? '',
        label:        parts[1]?.trim() ?? '',
        sizeBytes:    parseInt(parts[2] ?? '0', 10) || 0,
        freeBytes:    parseInt(parts[3] ?? '0', 10) || 0,
        healthStatus: parts[4]?.trim() ?? 'Unknown',
        mediaType:    parts[5]?.trim() ?? 'Unknown',
        busType:      parts[6]?.trim() ?? 'Unknown',
        model:        parts[7]?.trim() ?? '',
        trimEnabled:  (parts[8]?.trim() ?? '0') === '1',
        diskHealth:   parts[9]?.trim() ?? 'Unknown',
      };
    }).filter(v => v.letter.length === 1);

    return { ok: true, volumes };
  } catch (err) {
    return { ok: false, reason: err.message, volumes: [] };
  } finally {
    psLimiter.release(token);
  }
});

// ── IPC: storage:optimize ─────────────────────────────────────────────────────
// type: 'trim' (SSD/NVMe) | 'defrag' (HDD)
// Returns { ok, durationMs, output }

ipcMain.handle('storage:optimize', async (event, driveLetter, type) => {
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows' };

  if (typeof driveLetter !== 'string' || !/^[A-Za-z]$/.test(driveLetter.trim())) {
    return { ok: false, reason: 'invalid-drive-letter' };
  }
  if (type !== 'trim' && type !== 'defrag') {
    return { ok: false, reason: 'invalid-type' };
  }

  const token = psLimiter.tryAcquire({ file: 'storage-helper.js', fn: 'storage:optimize', reason: 'storage-optimize' });
  if (!token) return { ok: false, reason: 'busy' };

  const letter = driveLetter.trim().toUpperCase();
  const cmd = type === 'trim'
    ? `Optimize-Volume -DriveLetter ${letter} -ReTrim -Verbose 4>&1 | Out-String`
    : `Optimize-Volume -DriveLetter ${letter} -Defrag -Verbose 4>&1 | Out-String`;

  const t0 = Date.now();
  try {
    const out = await runPS(cmd, 300_000); // 5-min cap
    return { ok: true, durationMs: Date.now() - t0, output: out.substring(0, 500) };
  } catch (err) {
    return { ok: false, reason: err.message, durationMs: Date.now() - t0 };
  } finally {
    psLimiter.release(token);
  }
});

console.log('[Storage] IPC handlers registered');
