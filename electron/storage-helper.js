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
$physDisks = @()
try { $physDisks = @(Get-PhysicalDisk -ErrorAction Stop | Select-Object FriendlyName, MediaType, BusType, HealthStatus, @{N='SizeGB';E={[math]::Round($_.Size/1GB,2)}}) } catch {}
$optState = @{
  lastRunAt = $null
  lastTaskResult = $null
  scheduleEnabled = $null
  status = 'unavailable'
  source = 'windows-scheduled-task'
}
if ((Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) -and (Get-Command Get-ScheduledTaskInfo -ErrorAction SilentlyContinue)) {
  try {
    $task = Get-ScheduledTask -TaskPath '\\Microsoft\\Windows\\Defrag\\' -TaskName 'ScheduledDefrag' -ErrorAction Stop
    $taskInfo = Get-ScheduledTaskInfo -TaskPath '\\Microsoft\\Windows\\Defrag\\' -TaskName 'ScheduledDefrag' -ErrorAction Stop
    $optState.scheduleEnabled = ($task.State -ne 'Disabled')
    $optState.lastTaskResult = [int64]$taskInfo.LastTaskResult
    if ($taskInfo.LastRunTime -and $taskInfo.LastRunTime.Year -gt 2000) {
      $optState.lastRunAt = $taskInfo.LastRunTime.ToUniversalTime().ToString('o')
      $optState.status = if ($optState.lastTaskResult -eq 0) { 'available' } else { 'failed' }
    }
  } catch {}
}
$result = @()
$volumes = @(Get-Volume -ErrorAction Stop | Where-Object { $_.DriveLetter -and $_.Size -gt 0 })
$volumes | ForEach-Object {
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
  $result += [pscustomobject]@{
    letter = [string]$letter
    label = [string]$vol.FileSystemLabel
    sizeBytes = [int64]$vol.Size
    freeBytes = [int64]$vol.SizeRemaining
    healthStatus = [string]$vol.HealthStatus
    mediaType = [string]$mt
    busType = [string]$bt
    model = [string]$model
    trimEnabled = ([int]$trim -eq 1)
    diskHealth = [string]$diskHealth
    optimization = $optState
  }
}
ConvertTo-Json -InputObject @($result) -Depth 5 -Compress
`;
    const out = await runPS(script, 20000);
    const parsed = JSON.parse(out || '[]');
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    const volumes = rows.map(row => {
      return {
        letter:       String(row?.letter ?? '').trim(),
        label:        String(row?.label ?? '').trim(),
        sizeBytes:    Number(row?.sizeBytes) || 0,
        freeBytes:    Number(row?.freeBytes) || 0,
        healthStatus: String(row?.healthStatus ?? 'Unknown').trim(),
        mediaType:    String(row?.mediaType ?? 'Unknown').trim(),
        busType:      String(row?.busType ?? 'Unknown').trim(),
        model:        String(row?.model ?? '').trim(),
        trimEnabled:  row?.trimEnabled === true,
        diskHealth:   String(row?.diskHealth ?? 'Unknown').trim(),
        optimization: {
          lastRunAt: typeof row?.optimization?.lastRunAt === 'string' ? row.optimization.lastRunAt : null,
          lastTaskResult: Number.isFinite(Number(row?.optimization?.lastTaskResult))
            ? Number(row.optimization.lastTaskResult)
            : null,
          scheduleEnabled: typeof row?.optimization?.scheduleEnabled === 'boolean'
            ? row.optimization.scheduleEnabled
            : null,
          status: ['available', 'failed'].includes(row?.optimization?.status)
            ? row.optimization.status
            : 'unavailable',
          source: 'windows-scheduled-task',
        },
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
