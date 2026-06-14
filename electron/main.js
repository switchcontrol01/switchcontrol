// ============================================================
// FILE LOGGER — must be the very first thing that runs so every
// console.log/warn/error from this point on is captured to disk.
// Log files: %APPDATA%\SwitchControl\logs\
// ============================================================
const fileLogger = require('./file-logger');
fileLogger.init();
const _LOG_PATHS = fileLogger.getPaths();
const isDebug = fileLogger.isDebug;

/** Log only when DEBUG_MODE=true, LOG_VERBOSE=true, or in a dev (unpackaged) build. */
function verboseLog(...args) {
  if (isDebug || !app.isPackaged) console.log(...args);
}

if (isDebug) {
  console.log('========================================');
  console.log('[STARTUP:1] electron main.js TOP — file logger initialized');
  console.log('[STARTUP:1] log directory:', _LOG_PATHS.logDir);
  console.log('[STARTUP:1] crash log dir:', _LOG_PATHS.crashDir);
  console.log('[STARTUP:1] startup log:', _LOG_PATHS.startupLog);
  console.log('[STARTUP:1] latest log:', _LOG_PATHS.latestLog);
  console.log('[STARTUP:1] backend log:', _LOG_PATHS.backendLog);
  console.log('[STARTUP:1] __filename:', __filename);
  console.log('[STARTUP:1] process.execPath:', process.execPath);
  console.log('[STARTUP:1] process.cwd():', process.cwd());
  console.log('[STARTUP:1] process.argv:', JSON.stringify(process.argv));
  console.log('[STARTUP:1] NODE_ENV:', process.env.NODE_ENV);
  console.log('[STARTUP:1] timestamp:', new Date().toISOString());
  console.log('========================================');
}

const { app, BrowserWindow, ipcMain, shell, globalShortcut, Menu } = require('electron');
const { exec, execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs'); // top-level — never undefined, never lost inside a closure
const si = require('systeminformation');
const tweakExecutor = require('./tweak-executor');
const sliderTweakExecutor = require('./slider-tweak-executor');
const nicExecutor = require('./nic-executor');
let networkTweakExecutor;
try {
  networkTweakExecutor = require('./network-tweak-executor');
} catch (e) {
  console.error('[BOOT] network-tweak-executor not found, using stub:', e.message);
  networkTweakExecutor = {
    executeNetworkTweak: async (tweakId, action) => ({
      tweakId,
      action,
      success: false,
      verified: false,
      requiresRestart: false,
      message: 'Please reinstall SwitchControl to apply network tweaks.',
    }),
    checkNetworkTweakStatus: async () => ({ applied: false }),
    checkAllNetworkTweakStatus: async () => ({}),
    getDisabledTweaks: () => [],
    TWEAK_REGISTRY: {},
  };
}
const powerPlanManager = require('./power-plan-manager');
const backendLauncher = require('./backend-launcher');
const psLimiter = require('./powershell-limiter');
require('./security-helper');
require('./debloat-helper');
require('./cleaner-helper');
require('./focus-helper');
const configStore    = require('./config-store');
const updaterService = require('./updater');
const criticalLogger = require('./critical-logger');
const { APPDATA_DIR, TWEAK_STATE_FILE, CONFIG_FILE, DEVICE_ID_FILE } = require('./user-data-paths');
const processControl = require('./process-control');

app.setName('SwitchControl');
const isDev = !app.isPackaged;
const isProd = !isDev;
const allowDebug = process.env.DEBUG_MODE === 'true';
verboseLog('[BOOT] app.isPackaged:', app.isPackaged, '| isDev:', isDev, '| DEBUG_MODE:', allowDebug);

// DevTools is fully disabled in production.
function lockDevTools(win) {
  if (!win) return;
  win.webContents.closeDevTools();
  win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());
}
const PROTOCOL_NAME = 'switchcontrol';
let mainWindow = null;

// ── Admin / elevation state ───────────────────────────────────────────────────
// Cached once at startup. The app manifest uses requireAdministrator — Windows
// shows a single UAC prompt when the user launches the app, and the process
// token is elevated for the entire session. All child processes (PowerShell
// tweak commands) inherit the elevated token automatically, so no per-action
// UAC dialogs appear when toggling tweaks.
// electron/package.json build.win.requestedExecutionLevel = "requireAdministrator"
// electron/build/app.manifest  requestedExecutionLevel level="requireAdministrator"
let _appIsAdmin = null;

function checkWindowsAdmin() {
  if (process.platform !== 'win32') return Promise.resolve(true);
  return new Promise((resolve) => {
    execFile('powershell', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass', '-Command',
      '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    ], { windowsHide: true, timeout: 6000 }, (err, stdout) => {
      resolve(!err && stdout.trim().toLowerCase() === 'true');
    });
  });
}

// Deep-link queue for when renderer is not ready
let pendingDeepLinkUrl = null;
let rendererReady = false;

// Cache for system specs (5 minute TTL)
let cachedSpecs = null;
let cachedSpecsTime = 0;
const SPECS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let lastCpuLoad = 0;

// ─── Live telemetry cache ────────────────────────────────────────────────────
// si.currentLoad(), si.networkStats(), and si.disksIO() are ALL differential
// measurement APIs. The first call to each always returns 0 because the library
// has no previous reading to subtract from. getLive must NOT call them fresh on
// every request. Instead a background poll runs every 2s so the differential
// APIs have a real baseline, and getLive reads the cached snapshot.
let liveTelemetryCache = null;
// telemetryPollInterval removed — polling is now an async loop (_telemetryLoop)

// Disk I/O delta tracking — mirrors server/lib/telemetry.ts approach.
// disksIO() returns cumulative rIO (sectors read), wIO (sectors written), ms (ms busy).
// We compute per-second rates ourselves from consecutive snapshots.
let lastDiskSnapshot = null; // { rIO, wIO, ms, ts }

// GPU telemetry cache — served from cache ONLY. Background loop does NOT poll GPU load.
// GPU load comes from: (1) si.graphics() static on startup, (2) telemetry:refreshGpuLoad IPC (user-initiated),
// (3) NEVER from the background poll loop.
const GPU_POLL_TTL_MS = 15_000;

// Network stats TTL — prevents slow NIC drivers from blocking the loop
const NET_STATS_TTL_MS = 5_000;
let _netStatsLastTs = 0;
let _netStatsCache = null;

// Telemetry safety: only pollTelemetry() may call systeminformation.
// Violations are logged as [TelemetryViolation] for debugging.
const ALLOWED_SI_CALLERS = new Set([
  'pollTelemetry',
  'loadSystemSpecs',
  'getGpuStatic',
  'getGpuPerfCounterLoad',
  'telemetry:getGpu',
  'telemetry:refreshDeepHardware',
  'startTelemetryPolling-prime',
]);
// (3) cached value from previous refresh. NEVER polled automatically in loop.
// { load: number|null, temp: number|null, memUsedMb: number|null, memTotalMb: number|null, power: number|null, clockMhz: number|null, source: string }
let gpuPollCache = { load: null, temp: null, memUsedMb: null, memTotalMb: null, power: null, clockMhz: null, source: 'none' };

// On-demand GPU perf counter refresh — used only by telemetry:refreshGpuLoad IPC.
// The background loop uses its own _gpuLoadPollLastTs tracker below.
let _gpuCounterLastRefreshTs = 0;
const GPU_COUNTER_REFRESH_TTL = 120_000; // ms — IPC on-demand minimum gap (2 min cache)

// Background-loop GPU load poll tracker — NOT used (GPU load is on-demand only).
// Kept for backward compatibility with any external code referencing it.
let _gpuLoadPollLastTsDeprecated = 0;

// Fast GPU existence flag — set true as soon as si.graphics() confirms a controller.
// si.graphics() completes in ~300–600ms (no PowerShell overhead), so this is known
// well before the renderer's first getLive() call. Used to signal "GPU present,
// load pending" so the chart series is always structurally present from frame 1.
let gpuExistsOnHardware = false;
let wmiGpuModelName = null; // GPU name from WMI fast-path — fallback when si.graphics() times out

// ── Performance governor ──────────────────────────────────────────────────────
// Base poll interval.  Stays at TELEMETRY_BASE_MS while CPU is normal.
// Auto-throttles to TELEMETRY_SLOW_MS when load exceeds the threshold.
const TELEMETRY_BASE_MS      = 2000;   // normal polling cadence
const TELEMETRY_SLOW_MS      = 8000;   // low-end / over-budget mode
const TELEMETRY_GOVERNOR_PCT = 50;     // engage slow mode when cpu > 50%
let _telemetryCurrentIntervalMs = TELEMETRY_BASE_MS;

// ── Per-task TTLs — heavy tasks run NO MORE OFTEN than their TTL ──────────────
// Only ONE heavy task fires per tick (rotation). Lightweight tasks (currentLoad,
// mem, networkStats) are fast OS reads and run every tick.
// LHM is NOT polled in the background loop — use telemetry:refreshDeepHardware.
const FS_SIZE_TTL_MS    = 30_000; // si.fsSize()         — full drive scan
const CPU_TEMP_TTL_MS   = 15_000; // si.cpuTemperature() — WMI/ACPI, expensive
const DISK_IO_TTL_MS    =  8_000; // si.disksIO()        — kernel counter read

// Per-task caches + timestamps
let _fsSizeCache        = [];
let _fsSizeLastTs       = 0;
let _cpuTempCache       = { main: 0, max: 0, cores: [] };
let _cpuTempLastTs      = 0;
let _diskIoLastTs       = 0;    // last time si.disksIO() ran

// ── Low-end mode ──────────────────────────────────────────────────────────────
// Enabled when: logical CPU cores <= 4  OR  sustained average load > 50%.
// In low-end mode: all TTLs double, disk scanning is disabled, interval → SLOW_MS.
let _lowEndMode         = false;
let _lowEndCoresKnown   = false;
const LOW_END_CORE_MAX  = 4;    // <= this many logical cores → low-end
const LOAD_HIST_LEN     = 5;    // ticks to average for sustained-load check

// ── CPU budget ────────────────────────────────────────────────────────────────
// If SwitchControl's own Node process exceeds CPU_BUDGET_PCT, skip heavy tasks
// for 15s after the budget is exceeded (prevents competing with the game).
const CPU_BUDGET_PCT    = 3;
let _lastProcCpuUsage   = process.cpuUsage();
let _lastProcCpuTs      = Date.now();
let _appCpuPct          = 0;
let heavyCooldownUntil  = 0;   // skip heavy tasks until this timestamp (15s cooldown)
let _tickCount          = 0;   // total poll ticks executed
let _skippedTicks       = 0;   // ticks where heavy tasks were skipped due to cooldown/budget

// ── Per-task timing ───────────────────────────────────────────────────────────
// Each entry: { lastDurationMs, lastRunTs }
const _taskTimings      = {};
function _recordTiming(name, startMs) {
  _taskTimings[name] = { lastDurationMs: Date.now() - startMs, lastRunTs: startMs };
}

// Safe async telemetry loop — replaces setInterval so each poll only starts
// after the previous one fully completes (including PowerShell GPU counter).
// Set _telemetryLoopActive = false to stop cleanly.
// Set _telemetryLoopPaused = true to pause without stopping (window minimized).
let _telemetryLoopActive = false;
let _telemetryLoopPaused = false;
let _telemetryLoopCount  = 0; // incremented every time the loop actually starts; must stay ≤ 1

async function _telemetryLoop() {
  _telemetryLoopCount++;
  verboseLog('[PERF:TASK] name=telemetryLoop source=main.js interval=' + TELEMETRY_BASE_MS + 'ms reason=startup loopInstance=' + _telemetryLoopCount);
  if (_telemetryLoopCount > 1) {
    console.error('[CRITICAL] Duplicate telemetry loop detected! loopCount=' + _telemetryLoopCount + ' — this will double CPU usage. Aborting duplicate.');
    _telemetryLoopCount--;
    return;
  }
  while (_telemetryLoopActive) {
    if (!_telemetryLoopPaused) {
      await pollTelemetry();
    }
    if (_telemetryLoopActive) await new Promise(r => setTimeout(r, _telemetryCurrentIntervalMs));
  }
  _telemetryLoopCount = Math.max(0, _telemetryLoopCount - 1);
  verboseLog('[telemetry:poll] async loop exited loopCount=' + _telemetryLoopCount);
}

async function pollTelemetry() {
  // NOTE: pollTelemetry does NOT use PowerShell. It only calls si.currentLoad(),
  // si.mem(), si.networkStats() — fast OS reads. No psLimiter needed.
  try {
    const now = Date.now();
    _tickCount++;

    // ── 1. CPU budget check ───────────────────────────────────────────────────
    // Measure this process's own CPU usage since the last tick.
    const _procUsageDelta = process.cpuUsage(_lastProcCpuUsage);
    const _elapsedUs = (now - _lastProcCpuTs) * 1000;
    if (_elapsedUs > 0) {
      _appCpuPct = Math.min(100, ((_procUsageDelta.user + _procUsageDelta.sys) / _elapsedUs) * 100);
    }
    _lastProcCpuUsage = process.cpuUsage();
    _lastProcCpuTs = now;
    const _overBudget = _appCpuPct > CPU_BUDGET_PCT;
    const inCooldown = now < heavyCooldownUntil;
    if (_overBudget) {
      heavyCooldownUntil = now + 15_000;
      _skippedTicks++;
      verboseLog(`[telemetry:poll] Over budget (app=${_appCpuPct.toFixed(1)}%) — heavy tasks suppressed for 15s`);
    }

    // ── 2. Lightweight tasks — always run, fast OS reads ─────────────────────
    // currentLoad, mem, networkStats are fast (/proc reads or OS counters).
    // Run them in parallel — they are all non-blocking and low-overhead.
    const _t0Light = Date.now();
    const _shouldPollNet = (now - _netStatsLastTs) >= NET_STATS_TTL_MS;
    const [load, mem, netStatsRaw] = await Promise.all([
      si.currentLoad().catch(e => { console.warn('[telemetry:poll] currentLoad error:', e.message); return { currentLoad: 0, cpus: [] }; }),
      si.mem().catch(e => { console.warn('[telemetry:poll] mem error:', e.message); return { total: 0, available: 0 }; }),
      _shouldPollNet
        ? si.networkStats().catch(e => { console.warn('[telemetry:poll] networkStats error:', e.message); return []; })
        : Promise.resolve(null),
    ]);
    const netStats = netStatsRaw || _netStatsCache || [];
    if (netStatsRaw) {
      _netStatsCache = netStatsRaw;
      _netStatsLastTs = now;
      verboseLog('[Telemetry] net_poll=executed items=' + netStatsRaw.length);
    } else {
      verboseLog('[Telemetry] net_poll=cached items=' + (_netStatsCache || []).length);
    }
    _recordTiming('lightweight', _t0Light);

    // ── 3. Low-end mode detection ─────────────────────────────────────────────
    // Detect from core count on first tick; also check sustained load average.
    if (!_lowEndCoresKnown && load?.cpus?.length) {
      _lowEndCoresKnown = true;
      const _cores = load.cpus.length;
      if (_cores <= LOW_END_CORE_MAX) {
        _lowEndMode = true;
        console.log(`[telemetry:poll] Low-end mode ENABLED — ${_cores} logical cores`);
      }
    }
    // Sustained load check uses the global LOAD_HISTORY (written below in caller's scope)
    // We read cpuPct now and let the governor below also update the interval.
    const cpuPct = load?.currentLoad ?? 0;

    // ── 4. Heavy task rotation — ONE task per tick, serial ───────────────────
    // Priority: cpuTemp → diskIO → fsSize
    // LHM is NOT polled here — use telemetry:refreshDeepHardware for on-demand data.
    // In low-end mode: diskIO is disabled; all TTLs double.
    // Over-budget or in-cooldown ticks skip ALL heavy tasks.
    //
    // Disk delta uses existing lastDiskSnapshot — computed below after rawDiskIO.
    let rawDiskIO = null;
    const temps = _cpuTempCache; // used below; may be refreshed in this block

    if (!_overBudget && !inCooldown) {
      const _tempTtl  = _lowEndMode ? CPU_TEMP_TTL_MS * 2 : CPU_TEMP_TTL_MS;
      const _diskTtl  = _lowEndMode ? Infinity            : DISK_IO_TTL_MS;
      const _fsTtl    = _lowEndMode ? FS_SIZE_TTL_MS  * 2 : FS_SIZE_TTL_MS;

      if (now - _cpuTempLastTs > _tempTtl) {
        // Task A: CPU temperature (WMI/ACPI — most expensive per-call)
        const _t0 = Date.now();
        _cpuTempCache  = await si.cpuTemperature().catch(() => ({ main: 0, max: 0, cores: [] }));
        _cpuTempLastTs = Date.now();
        _recordTiming('cpuTemp', _t0);

      } else if (now - _diskIoLastTs > _diskTtl && !_lowEndMode) {
        // Task B: Disk I/O — kernel counter, only when not in low-end mode
        const _t0 = Date.now();
        rawDiskIO      = await si.disksIO().catch(e => { console.warn('[telemetry:poll] disksIO error:', e.message); return null; });
        // If si.disksIO() failed or returned null, try PowerShell perf counter.
        // getDiskIOViaPowerShell returns per-second rates (rIO_sec/wIO_sec/ms_sec),
        // handled by the disksio-persec branch in the delta computation below.
        if (rawDiskIO === null) {
          verboseLog('[telemetry:poll] disksIO returned null — trying PowerShell fallback');
          rawDiskIO = await getDiskIOViaPowerShell().catch(() => null);
          if (rawDiskIO) verboseLog('[telemetry:poll] disksIO PowerShell fallback succeeded');
        }
        _diskIoLastTs  = Date.now();
        _recordTiming('diskIO', _t0);

      } else if (now - _fsSizeLastTs > _fsTtl) {
        // Task C: Filesystem sizes — full drive scan, lowest priority
        const _t0 = Date.now();
        _fsSizeCache  = await si.fsSize().catch(() => []);
        _fsSizeLastTs = Date.now();
        _recordTiming('fsSize', _t0);
      }
    } else if (inCooldown && !_overBudget) {
      _skippedTicks++;
    }

    // Use cached cpuTemp (may have just been refreshed above)
    // temps variable was set before the rotation block; re-read cache now.
    const _temps = _cpuTempCache;

    // ── 5. Disk delta computation ─────────────────────────────────────────────
    // disksIO() returns cumulative rIO/wIO (sectors, 512 bytes each) and ms (ms busy).
    // We compute per-second rates from consecutive snapshots.
    //
    // available: true  → real rates were successfully computed (safe to display)
    // available: false → warming up, unavailable, or source failed (must NOT fake as zero)
    // source: 'disksio'        — computed from cumulative sector delta
    // source: 'disksio-persec' — platform supplied per-second rates directly
    // source: 'warming'        — first call, no prior snapshot to diff against
    // source: 'unavailable'    — si.disksIO() rejected or returned null
    const diskNow = Date.now();
    let diskIO = { activeTimePct: null, readKBps: null, writeKBps: null, available: false, source: 'none' };

    if (rawDiskIO) {
      const d = rawDiskIO;
      const rIO = typeof d.rIO === 'number' ? d.rIO : null;
      const wIO = typeof d.wIO === 'number' ? d.wIO : null;
      const msTotal = typeof d.ms === 'number' ? d.ms : null;
      const msSec = d.ms_sec != null ? d.ms_sec : (d.tIO_sec != null ? d.tIO_sec : null);

      if (lastDiskSnapshot && rIO != null && wIO != null) {
        const dt_s = (diskNow - lastDiskSnapshot.ts) / 1000;
        if (dt_s > 0.1) {
          const deltaR = Math.max(0, rIO - lastDiskSnapshot.rIO);
          const deltaW = Math.max(0, wIO - lastDiskSnapshot.wIO);
          diskIO.readKBps = parseFloat((deltaR / dt_s / 2).toFixed(1));
          diskIO.writeKBps = parseFloat((deltaW / dt_s / 2).toFixed(1));
          if (msSec != null && msSec >= 0) {
            diskIO.activeTimePct = parseFloat(Math.min(msSec / 10, 100).toFixed(1));
          } else if (msTotal != null && msTotal > 0) {
            const deltaMs = Math.max(0, msTotal - lastDiskSnapshot.ms);
            diskIO.activeTimePct = parseFloat(Math.min((deltaMs / (dt_s * 1000)) * 100, 100).toFixed(1));
          } else {
            const combined = (diskIO.readKBps ?? 0) + (diskIO.writeKBps ?? 0);
            diskIO.activeTimePct = parseFloat(Math.min(combined / 100, 100).toFixed(1));
          }
          diskIO.available = true;
          diskIO.source = 'disksio';
        } else {
          diskIO.available = false;
          diskIO.source = 'warming';
        }
      } else if (rIO == null && (d.rIO_sec != null || d.wIO_sec != null)) {
        const rSec = d.rIO_sec || 0;
        const wSec = d.wIO_sec || 0;
        diskIO.readKBps = parseFloat((rSec / 2).toFixed(1));
        diskIO.writeKBps = parseFloat((wSec / 2).toFixed(1));
        diskIO.activeTimePct = msSec != null
          ? parseFloat(Math.min(msSec / 10, 100).toFixed(1))
          : parseFloat(Math.min((rSec + wSec) / 50, 100).toFixed(1));
        diskIO.available = true;
        diskIO.source = 'disksio-persec';
      } else {
        diskIO.available = false;
        diskIO.source = 'warming';
      }
      if (rIO != null && wIO != null) {
        lastDiskSnapshot = { rIO, wIO, ms: msTotal != null ? msTotal : 0, ts: diskNow };
      }
    } else if (_lowEndMode || _overBudget) {
      // In low-end or over-budget mode disksIO was skipped — preserve last cached result.
      // liveTelemetryCache.diskIO from the previous tick is reused by getLive().
    } else {
      diskIO.available = false;
      diskIO.source = 'unavailable';
    }

    // ── 6. GPU updates ────────────────────────────────────────────────────────
      // si.graphics() REMOVED from the poll loop — it is a 300–600ms blocking call.
      // VRAM is seeded once at startup and refreshed only via on-demand IPC.
      // Background loop does NOT touch GPU static data.
      verboseLog('[Telemetry] gpu_poll=skipped loop_gating');

    // Preserve last diskIO if this tick didn't refresh it
    const _diskResult = rawDiskIO != null
      ? diskIO
      : (liveTelemetryCache?.diskIO ?? diskIO);

    liveTelemetryCache = { load, mem, temps: _temps, fsData: _fsSizeCache || [], netStats: netStats || [], diskIO: _diskResult, timestamp: Date.now() };

    // ── 7. Performance governor ───────────────────────────────────────────────
    // Engage slow mode when CPU is high OR we are in low-end mode.
    // Disengage once CPU drops below the threshold and low-end mode is off.
    const targetMs = (_lowEndMode || cpuPct > TELEMETRY_GOVERNOR_PCT) ? TELEMETRY_SLOW_MS : TELEMETRY_BASE_MS;
    if (targetMs !== _telemetryCurrentIntervalMs) {
      verboseLog(`[PERF:TASK] name=telemetryLoop — governor: cpu=${cpuPct.toFixed(0)}% lowEnd=${_lowEndMode} appCpu=${_appCpuPct.toFixed(1)}% → interval ${_telemetryCurrentIntervalMs}ms → ${targetMs}ms`);
      _telemetryCurrentIntervalMs = targetMs;
    }
  } catch (e) {
    console.error('[telemetry:poll] unexpected error:', e.message);
  }
}

async function startTelemetryPolling() {
  // ── Singleton guard ────────────────────────────────────────────────────────
  // If the loop is already running (should never happen — only called once from
  // app.whenReady), bail out immediately rather than creating a second loop.
  if (_telemetryLoopActive) {
    console.warn('[Perf] telemetry loop already active, skipping duplicate start');
    return;
  }
  verboseLog('[telemetry:poll] priming differential APIs + pre-warming GPU sources...');

  // ── GPU pre-warm (fire-and-forget, runs in parallel with CPU/disk prime) ──
  // ONE-TIME GPU pre-warm — fires exactly once at startup, never repeats.
  // PowerShell perf counters have a 2-4s cold-start overhead on first call.
  // Seeding gpuPollCache now ensures getLive() returns a valid load reading
  // from the first renderer call rather than waiting for the user to trigger
  // a manual refresh. The loop itself does NOT call getGpuPerfCounterLoad().
  //
  // FAST PATH: Win32_VideoController via WMI completes in <1s and does not
  // go through DXGI, so it works on AMD systems where si.graphics() hangs.
  if (process.platform === 'win32') {
    const _wmiGpuPs = `try{$r=Get-WmiObject Win32_VideoController -ErrorAction Stop|Where-Object{$_.Name -notmatch 'Microsoft Basic|Remote'};if($r){($r|Select-Object -First 1).Name}else{''}}catch{''}`;
    console.log('[GPU] WMI fast-path start — t=' + Date.now());
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', _wmiGpuPs],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        const name = stdout ? stdout.trim() : '';
        if (!err && name) {
          gpuExistsOnHardware = true;
          wmiGpuModelName = name;
          console.log('[GPU] WMI fast-path resolved:', name);
          // FIX: Immediately patch cachedSpecs and push specs:enriched so the
          // renderer GPU card updates within ~1s without waiting for si.graphics().
          // This is the earliest and most reliable GPU data path on Windows.
          if (cachedSpecs) {
            const _rawModel = cachedSpecs.gpu?.model;
            const _gpuStillDetecting = !_rawModel || _rawModel === 'Detecting\u2026' || _rawModel === 'Unavailable';
            if (_gpuStillDetecting) {
              const ml = name.toLowerCase();
              const vendor = ml.includes('nvidia') ? 'NVIDIA'
                           : (ml.includes('amd') || ml.includes('radeon')) ? 'AMD'
                           : ml.includes('intel') ? 'Intel'
                           : (cachedSpecs.gpu?.vendor || '');
              cachedSpecs = { ...cachedSpecs, gpu: { ...cachedSpecs.gpu, model: name, vendor } };
              console.log('[GPU] cachedSpecs patched from WMI fast-path — model:', name);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('specs:enriched', { gpu: cachedSpecs.gpu, cpu: cachedSpecs.cpu });
                console.log('[GPU] specs:enriched IPC pushed from WMI fast-path');
              }
            }
          }
        } else {
          console.warn('[GPU] WMI fast-path returned empty — err:', err?.message || 'none');
        }
      });
  }

  // SECONDARY PATH: si.graphics() gives VRAM data — 4s hard cap.
  // WMI fast-path already resolved GPU name; this is only needed for VRAM.
  siWithTimeout(() => si.graphics(), 4_000, 'startup-graphics').then(gfx => {
    const ctrl = gfx?.controllers?.find(c => c.model) ?? gfx?.controllers?.[0];
    if (ctrl) {
      gpuExistsOnHardware = true;
      verboseLog('[telemetry:poll] GPU presence confirmed (si.graphics path):', ctrl.model || 'unknown');
      // Seed both caches so live telemetry has VRAM from frame 1
      const memUsed  = ctrl.memoryUsed != null && ctrl.memoryUsed > 0 ? safeNum(ctrl.memoryUsed) : null;
      const memTotal = ctrl.vram       != null && ctrl.vram       > 0 ? safeNum(ctrl.vram)        : null;
      if (!gpuStaticCache) {
        gpuStaticCache = { memUsedMb: memUsed, memTotalMb: memTotal };
        gpuStaticTs = Date.now();
      }
      gpuPollCache.memUsedMb  = gpuPollCache.memUsedMb  ?? memUsed;
      gpuPollCache.memTotalMb = gpuPollCache.memTotalMb ?? memTotal;
    }
  }).catch(() => {});

  // Seed GPU load 5 seconds after telemetry starts so the dashboard shows
  // a real value from first load without waiting for a user action.
  setTimeout(() => {
    getGpuPerfCounterLoad().catch(() => {});
  }, 5000);

  // First call to differential APIs always returns 0 — prime them and seed lastDiskSnapshot
  // so that the first real pollTelemetry() can compute disk deltas immediately.
  const [, , primeDisksIO] = await Promise.allSettled([
    si.currentLoad(),
    si.networkStats(),
    si.disksIO(),
  ]);
  if (primeDisksIO.status === 'fulfilled' && primeDisksIO.value) {
    const d = primeDisksIO.value;
    const rIO = typeof d.rIO === 'number' ? d.rIO : null;
    const wIO = typeof d.wIO === 'number' ? d.wIO : null;
    const ms  = typeof d.ms  === 'number' ? d.ms  : 0;
    if (rIO != null && wIO != null) {
      lastDiskSnapshot = { rIO, wIO, ms, ts: Date.now() };
      verboseLog('[telemetry:poll] disk baseline seeded from prime: rIO=' + rIO + ' wIO=' + wIO);
    }
  }
  verboseLog('[telemetry:poll] prime done — waiting 1.5s for real readings...');

  // Wait 1.5s so differential APIs have a measurement window before the first
  // real poll. This means the first getLive call gets non-zero values.
  await new Promise(r => setTimeout(r, 1500));
  await pollTelemetry();

  _telemetryLoopActive = true;
  _telemetryLoop(); // fire-and-forget — loop awaits each poll before sleeping 1s
  verboseLog('[telemetry:poll] async loop started (sequential, no overlap possible)');
}

// Register protocol handler BEFORE app is ready
let protocolRegistered = false;
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    protocolRegistered = app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  protocolRegistered = app.setAsDefaultProtocolClient(PROTOCOL_NAME);
}
verboseLog(`[Protocol] registered: ${protocolRegistered} | isDefault: ${app.isDefaultProtocolClient(PROTOCOL_NAME)} | isDev: ${isDev}`);

// Whitelist of allowed deep-link paths. Anything else is silently dropped.
//
// IMPORTANT: new URL('switchcontrol://auth/callback?...') parses as:
//   hostname = 'auth',  pathname = '/callback'
// — NOT pathname = '/auth/callback'.  We therefore reconstruct the
// canonical path as '/' + hostname + pathname before the whitelist check.
const ALLOWED_DEEP_LINK_PATHS = new Set([
  '/auth/callback',
]);

function isValidDeepLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'switchcontrol:') return false;

    // The URL spec treats the segment between '//' and the next '/' as the
    // hostname, so 'switchcontrol://auth/callback' gives hostname='auth',
    // pathname='/callback'.  Reconstruct the logical path for the whitelist.
    const canonicalPath = '/' + (parsed.hostname || '') + (parsed.pathname || '');

    if (!ALLOWED_DEEP_LINK_PATHS.has(canonicalPath)) {
      verboseLog(`[DeepLink] ✗ path not in whitelist: "${canonicalPath}" (hostname="${parsed.hostname}" pathname="${parsed.pathname}")`);
      return false;
    }

    // Only allow alphanumeric, underscore, hyphen, dot, colon in query params (no shell escapes, no HTML)
    for (const [key, val] of parsed.searchParams) {
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) return false;
      if (!/^[a-zA-Z0-9_.:-]+$/.test(val)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Helper: deliver deep link to renderer
function deliverDeepLink(url) {
  verboseLog('[DeepLink] deliverDeepLink() called');

  if (!isValidDeepLink(url)) {
    verboseLog(`[DeepLink] ✗ rejected invalid URL: ${url}`);
    return;
  }

  if (!mainWindow) {
    verboseLog('[DeepLink] ✗ mainWindow=null, queueing URL');
    pendingDeepLinkUrl = url;
    return;
  }

  // Restore window if minimized, but do NOT call .focus()
  // Focus triggers window-focus event → resetUIState → cancels active auth
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();

  if (!rendererReady) {
    verboseLog('[DeepLink] ⏳ rendererReady=false, queueing URL for delivery after load');
    pendingDeepLinkUrl = url;
    return;
  }

  verboseLog(`[DeepLink] ✓ sending auth-callback IPC to renderer | path=${new URL(url).pathname}`);
  mainWindow.webContents.send('auth-callback', url);
}

// Single instance lock for Windows deep-link handling
const gotTheLock = app.requestSingleInstanceLock();
verboseLog('[STARTUP:2] single-instance lock:', gotTheLock ? 'GOT_LOCK' : 'ALREADY_HELD');

if (!gotTheLock) {
  verboseLog('[STARTUP:2] another instance is running — quitting this one');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    verboseLog('[DeepLink] second-instance — commandLine:', JSON.stringify(commandLine));
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url) {
      verboseLog('[DeepLink] ✓ protocol URL found:', url);
      deliverDeepLink(url);
    } else {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      } else {
        console.warn('[DeepLink] mainWindow=null on second-instance — re-creating window');
        createWindow();
      }
    }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  verboseLog('[DeepLink] open-url received:', url);
  deliverDeepLink(url);
});

function createWindow() {
  verboseLog('[STARTUP:5] createWindow() ENTRY — devTools:', isDev ? 'enabled (dev)' : 'disabled (prod)');
  mainWindow = new BrowserWindow({
    title: isDev ? 'SwitchControl DEBUG BUILD' : 'SwitchControl',
    width: 1300,
    height: 800,
    // show:false + paintWhenInitiallyHidden:true is the correct zero-flash pattern.
    // Chromium paints into a hidden surface with three dark layers applied:
    //   1. backgroundColor:'#07090D' — native DWM surface (BrowserWindow option)
    //   2. preload.js style injection — renderer layer before first HTML paint
    //   3. index.html inline styles — HTML/CSS layer
    // ready-to-show fires only after the first dark frame is committed.
    // We then call mainWindow.show() and the user sees a dark window instantly —
    // Chromium's white compositor init frame was never visible because the window
    // was hidden the entire time it was initializing.
    show: false,
    backgroundColor: '#14181D',
    frame: false,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for systeminformation
      devTools: true,
      backgroundThrottling: false, // Prevent timer throttling when window loses focus
      additionalArguments: isDev ? [] : ['--switchcontrol-prod'],
      paintWhenInitiallyHidden: true, // Ensure Chromium paints frames even while window is hidden
    }
  });
  console.log('[LAUNCH:1] BrowserWindow constructed — show:false, paintWhenInitiallyHidden:true, isVisible:', mainWindow.isVisible());

  // DevTools enabled — F12 / Ctrl+Shift+I opens the inspector.

  const { session: electronSession } = require('electron');
  electronSession.defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://switchcontrol.org/*', 'https://*.switchcontrol.org/*'] },
    (details, callback) => {
      callback({ cancel: false, responseHeaders: details.responseHeaders });
    }
  );

  if (!isDev) {
    // In packaged mode the frontend loads via file://, so absolute-path asset URLs
    // like /games/fortnite.png resolve incorrectly.  Vite-imported assets (in
    // gameIconResolver.ts) are the primary fix — this handler is belt-and-suspenders
    // for any legacy or server-provided logoUrl strings that still use /games/* paths.
    //
    // URL patterns covered:
    //  • file:///games/x.png           (linux / mac — / is filesystem root)
    //  • file:///C:/games/x.png        (windows — drive letter after triple-slash)
    //  • file:///C:/any/path/games/x.png (windows — any depth before /games/)
    electronSession.defaultSession.webRequest.onBeforeRequest(
      { urls: ['file:///games/*', 'file://*/*/games/*', 'file:///*/games/*'] },
      (details, callback) => {
        try {
          const url = details.url;
          // Extract just the filename from any /games/<filename> path segment.
          const m = url.match(/\/games\/([a-zA-Z0-9_\-.]+\.(png|jpg|jpeg|webp|svg))(?:[?#]|$)/i);
          if (m) {
            const filename = m[1];
            const distGamesPath = path.join(process.resourcesPath, 'dist', 'games', filename);
            // Normalise to forward slashes and ensure exactly three leading slashes
            // so the URL is valid on all platforms.
            const normalised = distGamesPath.replace(/\\/g, '/').replace(/^\/+/, '');
            const redirectURL = 'file:///' + normalised;
            console.log(`[Assets] /games/* redirect: ${url} → ${redirectURL}`);
            callback({ redirectURL });
            return;
          }
        } catch (err) {
          console.warn('[Assets] /games/* redirect error:', err);
        }
        callback({ cancel: false });
      }
    );
  }
  
  // === NAVIGATION GUARDS ===
  // Block navigation to external sites - open in browser instead
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsedUrl = new URL(url);
      // Block file:// navigation — exposes internal app paths.
      if (parsedUrl.protocol === 'file:') {
        console.warn('[Security] Blocked file:// navigation attempt:', url);
        event.preventDefault();
        return;
      }
      // Allow internal dev server and switchcontrol:// custom protocol.
      if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
        return;
      }
      if ((parsedUrl.hostname === 'switchcontrol.org' || parsedUrl.hostname === 'www.switchcontrol.org') && parsedUrl.protocol === 'https:') {
        return;
      }
      console.log('[Navigation] Blocking external navigation, opening in browser:', url);
      event.preventDefault();
      if (['https:', 'mailto:'].includes(parsedUrl.protocol)) {
        shell.openExternal(url);
      }
    } catch (e) {
      console.warn('[Security] Blocked malformed navigation URL:', url);
      event.preventDefault();
    }
  });
  
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Navigation] Blocking new window, opening in browser:', url);
    try {
      const parsed = new URL(url);
      if (['https:', 'mailto:'].includes(parsed.protocol)) {
        shell.openExternal(url);
      } else {
        console.warn('[Security] Blocked new window with unsafe protocol:', parsed.protocol);
      }
    } catch (e) {
      console.warn('[Security] Blocked malformed new window URL:', url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    console.log('[LAUNCH:2] dev mode — loadURL http://localhost:5000');
    mainWindow.loadURL('http://localhost:5000');
  } else {
    const indexPath = path.join(process.resourcesPath, 'dist', 'index.html');
    const indexExists = require('fs').existsSync(indexPath);
    console.log('[LAUNCH:2] packaged mode — indexPath:', indexPath, '| exists:', indexExists);
    if (!indexExists) {
      try {
        const distDir = path.join(process.resourcesPath, 'dist');
        if (require('fs').existsSync(distDir)) {
          console.error('[LAUNCH:2] dist contents:', require('fs').readdirSync(distDir).join(', '));
        } else {
          console.error('[LAUNCH:2] dist directory does NOT exist at', distDir);
        }
      } catch (e) {
        console.error('[LAUNCH:2] could not list dist:', e.message);
      }
    }
    mainWindow.loadFile(indexPath).then(() => {
      console.log('[LAUNCH:2] loadFile() promise RESOLVED');
    }).catch(err => {
      console.error('[LAUNCH:2] loadFile() promise REJECTED:', err && err.message);
    });
  }

  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.error('[STARTUP:renderer] did-fail-load — code:', code, 'desc:', desc, 'url:', url);
  });
  mainWindow.webContents.on('render-process-gone', (e, details) => {
    console.error('[STARTUP:renderer] render-process-gone:', JSON.stringify(details));
  });
  mainWindow.webContents.on('unresponsive', () => {
    console.error('[STARTUP:renderer] webContents UNRESPONSIVE');
  });

  // Pipe all renderer console messages into the main-process log so crashes
  // and React errors are captured even when DevTools is locked in production.
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const tag = ['[Renderer:verbose]', '[Renderer:info]', '[Renderer:warn]', '[Renderer:error]'][level] || '[Renderer]';
    const src = sourceId ? sourceId.replace(/^.*\//, '') : '';
    const loc = src && line ? ` (${src}:${line})` : '';
    if (level >= 2) {
      console.error(`${tag}${loc}`, message);
    } else {
      console.log(`${tag}${loc}`, message);
    }
  });

  // Track when renderer is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[LAUNCH:3] did-finish-load — HTML/JS fully parsed by Chromium (first-frame-ready IPC pending)');
    rendererReady = true;

    if (!isDev) {
      // Race: backend became READY before renderer finished loading
      if (backendLauncher.isBackendReady()) {
        const port = backendLauncher.getBackendPort();
        verboseLog('[Backend] Sending backend-ready to renderer on did-finish-load, port:', port);
        mainWindow.webContents.send('backend-ready', { port });
      }
      // Race: backend FAILED before renderer finished loading
      const lastErr = backendLauncher.getLastError ? backendLauncher.getLastError() : null;
      if (lastErr && !backendLauncher.isBackendReady()) {
        console.error('[Backend] Sending backend-error to renderer on did-finish-load:', lastErr);
        mainWindow.webContents.send('backend-error', { error: lastErr });
      }
    }

    // Deep link delivery intentionally moved to 'renderer:auth-ready' handler
    // below. did-finish-load fires when Chromium parses the JS bundle, but
    // React's useEffect (which registers the auth-callback IPC listener) runs
    // after the first browser paint. Delivering here races against that.
  });
  
  // Send focus events to renderer for UI cleanup
  mainWindow.on('focus', () => {
    if (rendererReady && mainWindow) {
      mainWindow.webContents.send('window-focus');
    }
  });

  // ── Telemetry pause on minimize / restore ────────────────────────────────
  // Zero CPU is wasted polling telemetry while the window is minimized or
  // hidden — no UI is visible to consume the data anyway.
  mainWindow.on('minimize', () => {
    _telemetryLoopPaused = true;
    console.log('[Perf] minimized → pausing all loops (telemetry, no IPC polls while hidden)');
  });
  mainWindow.on('restore', () => {
    _telemetryLoopPaused = false;
    console.log('[Perf] restored → resuming telemetry loop');
    pollTelemetry().catch(() => {});
  });
  mainWindow.on('show', () => {
    if (_telemetryLoopPaused) {
      _telemetryLoopPaused = false;
      console.log('[Perf] window show → resuming telemetry loop');
      pollTelemetry().catch(() => {});
    }
  });

  // ── Launch handshake ─────────────────────────────────────────────────────────
  // Show on ready-to-show: Chromium fires this after the first frame is painted
  // (paintWhenInitiallyHidden:true ensures painting happens while hidden).
  // backgroundColor:'#07090D' matches the splash so DWM shows that color during
  // the 0-1 native frames before the GPU texture lands — no white or black flash.
  const _launchT0 = Date.now();
  const launchMs = () => `+${Date.now() - _launchT0}ms`;

  // Hard fallback: start telemetry if ready-to-show never fires within 4 s.
  // Window is already visible (show:true), so no show() call needed here.
  const showFallbackTimer = setTimeout(() => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        // Unexpected — show as absolute last resort
        console.warn(`[LAUNCH:FALLBACK] ready-to-show never fired and window not visible — force-showing | ${launchMs()}`);
        mainWindow.show();
        mainWindow.focus();
      }
      startTelemetryPolling().catch(e => console.error('[telemetry:poll] fallback error:', e.message));
    }
  }, 4000);

  // ── Boot metrics — single source of truth for startup timing ─────────────────
  // Timestamps (ms since process start) are written at each lifecycle event and
  // printed as a unified [BOOT] summary when the dashboard signals it is stable.
  const _bm = {
    whenReady:       Date.now(),
    firstFrameReady: 0,
    windowShown:     0,
    telemetryStart:  0,
    dashboardMounted:0,
  };

  // F-5: ipcMain.once instead of ipcMain.on — createMainWindow() can be called
  // again if the window is recreated, which would stack a fresh listener on top
  // of the previous one every time. `once` self-cleans after the first dispatch
  // and the `_bm.dashboardMounted` guard already ensures only the first send
  // matters per window lifetime. We also defensively remove any pre-existing
  // listeners from a prior window before re-registering.
  ipcMain.removeAllListeners('app:dashboard-mounted');
  ipcMain.once('app:dashboard-mounted', () => {
    if (_bm.dashboardMounted) return; // already fired
    _bm.dashboardMounted = Date.now();
    const rel = (t) => t ? `${t - _bm.whenReady}ms` : 'pending';
    console.log('[BOOT] ──────────────────────────────────────────');
    console.log(`[BOOT] firstFrameReady  = ${rel(_bm.firstFrameReady)}`);
    console.log(`[BOOT] windowShown      = ${rel(_bm.windowShown)}`);
    console.log(`[BOOT] telemetryStart   = ${rel(_bm.telemetryStart)}`);
    console.log(`[BOOT] dashboardMounted = ${rel(_bm.dashboardMounted)}`);
    console.log('[BOOT] ──────────────────────────────────────────');
  });

  // ── Primary show trigger ──────────────────────────────────────────────────────
  // ready-to-show fires after Chromium has committed its first painted frame.
  // Because show:false + paintWhenInitiallyHidden:true, that first frame was
  // rendered into a hidden surface — all three dark layers were already applied
  // (backgroundColor BrowserWindow option, preload injection, inline CSS).
  // Calling show() here gives the user a window that is dark from frame 0.
  // No white flash, no delay visible — the paint happened in the background.
  mainWindow.once('ready-to-show', () => {
    clearTimeout(showFallbackTimer);
    if (!mainWindow) return;
    _bm.firstFrameReady = Date.now();
    mainWindow.show();
    mainWindow.focus();
    _bm.windowShown = Date.now();
    console.log(`[LAUNCH:5] mainWindow.show() on ready-to-show (dark frame ready) | ${launchMs()}`);
    // Start telemetry immediately — no delay. The backend is already running
    // (started before createMainWindow), so the polling loop can begin right
    // away. This means GPU/CPU pre-warm runs during the Splash animation and
    // data is ready before Home.tsx ever mounts.
    _bm.telemetryStart = Date.now();
    startTelemetryPolling().catch(e => console.error('[telemetry:poll] error:', e.message));
  });

  // ── Splash painted IPC (telemetry / boot metrics only) ───────────────────────
  // Splash.tsx calls signalFirstFrameReady() in its first useEffect — after React
  // has committed dark content. We record the timestamp but do NOT show the window
  // here (it is already visible via show:true).
  ipcMain.removeAllListeners('app:first-frame-ready');
  ipcMain.once('app:first-frame-ready', () => {
    if (!mainWindow) return;
    console.log(`[LAUNCH:6] app:first-frame-ready IPC (Splash painted) | ${launchMs()}`);
  });
  mainWindow.on('closed', () => { 
    mainWindow = null; 
    rendererReady = false;
  });
}

// Helper: safe number conversion
function safeNum(value, fallbackOrDecimals = 1, decimals) {
  const num = Number(value);
  if (fallbackOrDecimals === null) {
    return Number.isFinite(num) ? num : null;
  }
  const dec = typeof decimals === 'number' ? decimals : (typeof fallbackOrDecimals === 'number' ? fallbackOrDecimals : 1);
  return Number.isFinite(num) ? parseFloat(num.toFixed(dec)) : (typeof fallbackOrDecimals === 'number' ? 0 : fallbackOrDecimals);
}

// Helper: Get NVIDIA GPU temp via nvidia-smi (only works for NVIDIA cards)
function getNvidiaGpuTemp() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve(null);
    }
    exec(
      'nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits',
      { windowsHide: true, timeout: 3000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const temp = Number(stdout.trim());
        resolve(Number.isFinite(temp) ? temp : null);
      }
    );
  });
}

// Helper: Check if GPU is NVIDIA
function isNvidiaGpu(graphics) {
  const gpu = graphics?.controllers?.[0];
  if (!gpu?.vendor) return false;
  return gpu.vendor.toLowerCase().includes('nvidia');
}

// Helper: Get NVIDIA GPU load via nvidia-smi
function getNvidiaGpuLoad() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve(null);
    }
    exec(
      'nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits',
      { windowsHide: true, timeout: 3000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const load = Number(stdout.trim());
        resolve(Number.isFinite(load) ? load : null);
      }
    );
  });
}


// ─── Windows GPU Performance Counter ─────────────────────────────────────────
// Reads "\GPU Engine(*)\Utilization Percentage" counters via PowerShell.
//
// AGGREGATION MODEL (Option A — max, not sum):
//   1. Query all GPU Engine utilization counter instances
//   2. Group by engine type (3D, Compute, VideoDecode, VideoEncode, Copy, etc.)
//   3. SUM across process instances of the SAME engine type
//      (multiple processes can share one physical engine)
//   4. Take the MAX across engine types
//      (engines are independent processing units — summing them overcounts)
//
// WHY MAX NOT SUM:
//   Different engine types (3D, Compute, Video…) are physically separate parts
//   of the GPU die. A 3D engine at 60% + VideoDecode at 30% does NOT mean the
//   GPU is 90% busy — it means one unit is at 60% and another at 30%.
//   Task Manager reports the highest engine utilization as the overall GPU %.
//   Summing would produce inflated values and require an arbitrary clamp to 100.
//
// Works on AMD, NVIDIA, and Intel GPUs without any extra software.
// Only runs on win32 — returns null immediately on other platforms.
let gpuPerfCounterFailCount = 0;
const GPU_PERF_COUNTER_MAX_FAILS = 15; // stop trying after 15 consecutive failures
let gpuPerfCounterPausedUntil = 0;    // timestamp: retry after cold-start backoff

// AMD zero-counter tracker:
// AMD RX 7800 XT (and other AMD GPUs) can return 0 on all engine paths even when
// the GPU is active. If we see 0 with an empty engine breakdown for N consecutive
// successful reads, we assume the counter path is non-functional on this GPU and
// enter a 10-minute cooldown before retrying.
let gpuZeroStreakCount = 0;
const GPU_ZERO_STREAK_MAX = 5;      // 5 consecutive zero-reads → assume unavailable
let gpuZeroCooldownUntil = 0;       // don't retry counter until this timestamp

// Last per-engine breakdown — exposed for debug logging
let lastGpuEngineBreakdown = {};

async function getGpuPerfCounterLoad() {
  if (process.platform !== 'win32') return null;
  // If we hit the hard limit, pause for 5 minutes before retrying.
  // This recovers from cold-start driver init delays (common on AMD at boot).
  if (gpuPerfCounterFailCount >= GPU_PERF_COUNTER_MAX_FAILS) {
    if (Date.now() < gpuPerfCounterPausedUntil) return null;
    // Backoff expired — reset and try again
    console.log('[GPU:perf] fail-limit backoff expired — resetting counter, will retry');
    gpuPerfCounterFailCount = 0;
    gpuPerfCounterPausedUntil = 0;
  }
  // AMD zero-counter cooldown: if all paths return 0 with no engine breakdown,
  // the counter path is non-functional on this GPU (common on AMD RX series).
  if (gpuZeroCooldownUntil > 0) {
    if (Date.now() < gpuZeroCooldownUntil) return null;
    // Cooldown expired — try again
    console.log('[GPU:perf] zero-counter cooldown expired — resetting, will retry');
    gpuZeroCooldownUntil = 0;
    gpuZeroStreakCount = 0;
  }
  // TTL gate — prevent rapid PowerShell re-spawns within 15s
  if (Date.now() - _gpuCounterLastRefreshTs < GPU_POLL_TTL_MS) {
    verboseLog('[Telemetry] gpu_poll=ttl_blocked ttl=' + GPU_POLL_TTL_MS);
    return gpuPollCache.load ?? null;
  }
  const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'getGpuPerfCounterLoad', reason: 'gpu-counter' });
  if (!_token) {
    verboseLog('[Telemetry] gpu_poll=skipped limiter_busy');
    return gpuPollCache.load ?? null;
  }

  // PowerShell outputs JSON: { "max": <number>, "engines": { <type>: <sum>, ... } }
  // Tries GPU Engine perf counters first; if that counter category is missing (common on
  // some AMD/driver configs), falls back to CIM Win32_PerfFormattedData then enumerates
  // whatever GPU counter sets ARE present so the wildcard path can be resolved dynamically.
  const ps = `
function Get-GpuEngineMax {
  # Attempt 1: direct GPU Engine counter (most systems)
  try {
    $s = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction Stop).CounterSamples
    $byType = $s | Group-Object { if ($_.InstanceName -match '_engtype_(.+)$') { $Matches[1] } else { 'other' } }
    $engines = @{}
    $maxLoad = 0.0
    foreach ($g in $byType) {
      $engineSum = [Math]::Round(($g.Group | Measure-Object -Property CookedValue -Sum).Sum, 2)
      $engines[$g.Name] = $engineSum
      if ($engineSum -gt $maxLoad) { $maxLoad = $engineSum }
    }
    $enginesJson = ($engines.GetEnumerator() | ForEach-Object { '"' + $_.Key + '":' + $_.Value }) -join ','
    return '{"max":' + [Math]::Round($maxLoad, 2) + ',"engines":{' + $enginesJson + '}}'
  } catch {}
  # Attempt 2: enumerate all GPU* counter sets and find any Utilization path
  try {
    $sets = Get-Counter -ListSet 'GPU*' -ErrorAction SilentlyContinue
    $utilPath = $sets | ForEach-Object { $_.Paths } | Where-Object { $_ -match 'Utilization' } | Select-Object -First 1
    if ($utilPath) {
      $s2 = (Get-Counter $utilPath -ErrorAction Stop).CounterSamples
      $maxLoad = [Math]::Round(($s2 | Measure-Object -Property CookedValue -Maximum).Maximum, 2)
      return '{"max":' + $maxLoad + ',"engines":{}}'
    }
  } catch {}
  # Attempt 3: CIM-based GPU perf data (AMD/Intel fallback)
  try {
    $cim = Get-CimInstance -Namespace root/CIMV2 -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop
    if ($cim) {
      $maxLoad = [Math]::Round(($cim | Measure-Object -Property UtilizationPercentage -Maximum).Maximum, 2)
      return '{"max":' + $maxLoad + ',"engines":{}}'
    }
  } catch {}
  return '{"max":-1,"engines":{}}'
}
Get-GpuEngineMax`.trim();

  try {
    return await new Promise((resolve) => {
      execFile('powershell', [
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
        '-ExecutionPolicy', 'Bypass', '-Command', ps,
      ], { windowsHide: true, timeout: 9000 }, (err, stdout, stderr) => {
        if (err) {
          gpuPerfCounterFailCount++;
          if (gpuPerfCounterFailCount >= GPU_PERF_COUNTER_MAX_FAILS && !gpuPerfCounterPausedUntil) {
            gpuPerfCounterPausedUntil = Date.now() + 5 * 60 * 1000; // retry in 5 min
            console.warn(`[GPU:perf] hit fail limit (${GPU_PERF_COUNTER_MAX_FAILS}) — pausing for 5min`);
          }
          console.warn(`[GPU:perf] PowerShell error (fail ${gpuPerfCounterFailCount}):`, err.message);
          return resolve(null);
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          const max = parsed.max;
          if (!Number.isFinite(max) || max < 0) {
            gpuPerfCounterFailCount++;
            if (gpuPerfCounterFailCount >= GPU_PERF_COUNTER_MAX_FAILS && !gpuPerfCounterPausedUntil) {
              gpuPerfCounterPausedUntil = Date.now() + 5 * 60 * 1000;
              console.warn(`[GPU:perf] hit fail limit (${GPU_PERF_COUNTER_MAX_FAILS}) — pausing for 5min`);
            }
            console.warn(`[GPU:perf] unexpected max value (fail ${gpuPerfCounterFailCount}): ${max}`);
            return resolve(null);
          }
          gpuPerfCounterFailCount = 0; // reset on success
          gpuPerfCounterPausedUntil = 0;
          lastGpuEngineBreakdown = parsed.engines || {};

          // AMD zero-counter check: max=0 with no engine breakdown means the counter
          // found a path but returned nothing useful. Track a streak — if it persists,
          // the counter is non-functional on this GPU (AMD RX 7800 XT, etc.).
          const hasEngines = Object.keys(lastGpuEngineBreakdown).length > 0;
          if (max === 0 && !hasEngines) {
            gpuZeroStreakCount++;
            verboseLog(`[GPU:perf] zero-reading streak=${gpuZeroStreakCount}/${GPU_ZERO_STREAK_MAX}`);
            if (gpuZeroStreakCount >= GPU_ZERO_STREAK_MAX) {
              gpuZeroCooldownUntil = Date.now() + 10 * 60 * 1000; // 10-min cooldown
              console.warn(`[GPU:perf] AMD zero-counter detected (${GPU_ZERO_STREAK_MAX} consecutive zeros, no engine breakdown) — counter unavailable, cooldown 10min`);
              return resolve(null);
            }
            // Return null during uncertain warm-up phase so UI shows "–" not "0%"
            return resolve(null);
          }
          if (max > 0) gpuZeroStreakCount = 0; // real reading — reset streak

          resolve(parseFloat(max.toFixed(1)));
        } catch (parseErr) {
          gpuPerfCounterFailCount++;
          if (gpuPerfCounterFailCount >= GPU_PERF_COUNTER_MAX_FAILS && !gpuPerfCounterPausedUntil) {
            gpuPerfCounterPausedUntil = Date.now() + 5 * 60 * 1000;
            console.warn(`[GPU:perf] hit fail limit (${GPU_PERF_COUNTER_MAX_FAILS}) — pausing for 5min`);
          }
          console.warn(`[GPU:perf] JSON parse error (fail ${gpuPerfCounterFailCount}): "${stdout.trim()}"`);
          resolve(null);
        }
      });
    });
  } finally {
    psLimiter.release(_token);
  }
}

// ─── Disk I/O via PowerShell performance counter ─────────────────────────────
// Fallback when si.disksIO() returns null (common on some Windows + AMD configs).
// Get-Counter gives per-second rates directly — maps to the 'disksio-persec' path.
// rIO_sec / wIO_sec are in sectors/sec (512 bytes each), ms_sec is disk-active ms/100ms.
async function getDiskIOViaPowerShell() {
  if (process.platform !== 'win32') return null;
  const ps = [
    'try {',
    "  $c = Get-Counter '\\PhysicalDisk(_Total)\\Disk Read Bytes/sec','\\PhysicalDisk(_Total)\\Disk Write Bytes/sec','\\PhysicalDisk(_Total)\\% Disk Time' -MaxSamples 1 -ErrorAction Stop",
    '  $r = [Math]::Round($c.CounterSamples[0].CookedValue, 0)',
    '  $w = [Math]::Round($c.CounterSamples[1].CookedValue, 0)',
    '  $a = [Math]::Round($c.CounterSamples[2].CookedValue, 1)',
    '  \'{"rIO_sec":\' + [Math]::Round($r/512,1) + \',"wIO_sec":\' + [Math]::Round($w/512,1) + \',"ms_sec":\' + ($a*10) + \'}\'',
    "} catch { '{\"error\":\"failed\"}' }",
  ].join('\n');
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true, timeout: 7000 },
      (err, stdout) => {
        if (err) { resolve(null); return; }
        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.error) { resolve(null); return; }
          resolve(parsed);
        } catch { resolve(null); }
      });
  });
}

// ─── GPU static info (name, VRAM) — cached, refreshed every 60s ──────────────
let gpuStaticCache = null;
let gpuStaticTs = 0;
const GPU_STATIC_TTL = 60000;

async function getGpuStatic() {
  const now = Date.now();
  if (gpuStaticCache && now - gpuStaticTs < GPU_STATIC_TTL) return gpuStaticCache;
  try {
    const gr = await si.graphics().catch(() => null);
    const ctrl = gr?.controllers?.[0];
    if (ctrl) {
      gpuStaticCache = {
        memUsedMb:  ctrl.memoryUsed  != null && ctrl.memoryUsed  > 0 ? safeNum(ctrl.memoryUsed)  : null,
        memTotalMb: ctrl.vram        != null && ctrl.vram        > 0 ? safeNum(ctrl.vram)         : null,
      };
    } else {
      gpuStaticCache = { memUsedMb: null, memTotalMb: null };
    }
    gpuStaticTs = now;
  } catch {
    gpuStaticCache = gpuStaticCache || { memUsedMb: null, memTotalMb: null };
  }
  return gpuStaticCache;
}

// Persistent Device ID — generated once, stored forever in userData
const DEVICE_ID_REGEX = /^[A-F0-9]{16}$/;

function getOrCreateDeviceId() {
  const fs = require('fs');
  const crypto = require('crypto');
  const deviceIdPath = DEVICE_ID_FILE;

  try {
    if (fs.existsSync(deviceIdPath)) {
      const data = JSON.parse(fs.readFileSync(deviceIdPath, 'utf-8'));
      if (data.deviceId && typeof data.deviceId === 'string' && DEVICE_ID_REGEX.test(data.deviceId)) {
        return data.deviceId;
      }
      console.warn('[DeviceID] Stored device ID is malformed — regenerating');
    }
  } catch (e) {
    console.warn('[DeviceID] Failed to read existing device ID:', e.message);
  }

  const deviceId = crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  try {
    fs.writeFileSync(deviceIdPath, JSON.stringify({ deviceId, createdAt: new Date().toISOString() }), 'utf-8');
    console.log('[DeviceID] Generated and saved new device ID:', deviceId);
  } catch (e) {
    console.error('[DeviceID] Failed to save device ID:', e.message);
  }
  return deviceId;
}

let cachedDeviceId = null;

// ── Deep link delivery — triggered when React registers its auth-callback listener ──
// React's useEffect that calls electronAPI.auth.onCallback() runs after the
// first browser paint, which is AFTER did-finish-load. Delivering a pending
// deep link at did-finish-load races against that registration. Instead the
// preload sends 'renderer:auth-ready' the moment onCallback() is called,
// and we deliver the queued URL only then.
ipcMain.on('renderer:auth-ready', () => {
  verboseLog('[DeepLink] renderer:auth-ready received — React auth listener is registered');
  if (pendingDeepLinkUrl) {
    if (isValidDeepLink(pendingDeepLinkUrl)) {
      verboseLog(`[DeepLink] ✓ delivering queued validated link after renderer-ready | path=${new URL(pendingDeepLinkUrl).pathname}`);
      if (mainWindow) mainWindow.webContents.send('auth-callback', pendingDeepLinkUrl);
    } else {
      verboseLog(`[DeepLink] ✗ dropped queued invalid link: ${pendingDeepLinkUrl}`);
    }
    pendingDeepLinkUrl = null;
  }
});

// App info handlers
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);
ipcMain.handle('app:isPackaged', () => app.isPackaged);

ipcMain.handle('app:getDeviceId', () => {
  if (!cachedDeviceId) cachedDeviceId = getOrCreateDeviceId();
  return cachedDeviceId;
});

// Config store handlers — persisted secrets for packaged runtime
ipcMain.handle('config:get', (event, key) => {
  if (typeof key !== 'string' || !key) return null;
  return configStore.get(key);
});

ipcMain.handle('config:set', (event, key, value) => {
  if (typeof key !== 'string' || !key) return { ok: false, error: 'Invalid key' };
  try {
    configStore.set(key, typeof value === 'string' ? value.trim() : null);
    console.log(`[ConfigStore] Set ${key}: present=${!!(typeof value === 'string' && value.trim())}`);
    return { ok: true };
  } catch (e) {
    console.error('[ConfigStore] set error:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('config:getPresence', () => {
  return configStore.getPresenceMap();
});

// Memory cleaner - calls native Rust helper
ipcMain.handle('memory:clean', async (event, mode) => {
  const validModes = ['safe', 'smart', 'advanced'];
  if (!validModes.includes(mode)) {
    return { error: true, message: 'Invalid mode. Use safe, smart, or advanced.' };
  }

  const exeName = 'sc_memory.exe';
  let exePath;

  if (app.isPackaged) {
    exePath = path.join(process.resourcesPath, 'bin', exeName);
  } else {
    exePath = path.join(__dirname, 'bin', exeName);
  }

  console.log(`[Memory] mode=${mode} expected helper: ${exePath} | exists: ${fs.existsSync(exePath)} | isPackaged: ${app.isPackaged}`);

  if (!fs.existsSync(exePath)) {
    console.error('[Memory] Helper binary not found at:', exePath);
    return {
      error: true,
      helperMissing: true,
      message: 'Memory helper is missing from this installation. Please update or reinstall SwitchControl.',
    };
  }

  return new Promise((resolve) => {
    execFile(exePath, ['--mode', mode], { timeout: 10000, windowsHide: true }, (err, stdout, stderr) => {
      if (stderr) console.log('[Memory] stderr:', stderr.trim());
      if (err) {
        console.error('[Memory] execFile error:', err.message, 'killed:', err.killed);
        resolve({
          error: true,
          message: 'Memory clean failed: ' + (err.killed ? 'timeout' : err.message),
        });
        return;
      }

      console.log('[Memory] stdout raw:', stdout.trim());
      try {
        const result = JSON.parse(stdout.trim());
        console.log(`[Memory] ${mode} mode: scanned=${result.processes_scanned} trimmed=${result.processes_trimmed} freed=${result.estimated_mb_freed}MB`);
        resolve(result);
      } catch (parseErr) {
        console.error('[Memory] JSON parse failed. stdout was:', stdout);
        resolve({ error: true, message: 'Memory clean returned invalid data.' });
      }
    });
  });
});

ipcMain.handle('app:restart', () => {
  console.log('[App] Relaunching app on user request');
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('app:quit', () => {
  console.log('[App] Quit requested by renderer (device lock)');
  app.quit();
});

ipcMain.handle('app:resetData', async () => {
  try {
    const fs = require('fs');
    const userDataPath = app.getPath('userData');
    console.log('[Reset] Clearing userData directory:', userDataPath);
    const preserveFiles = new Set(['device-id.json']);
    const entries = fs.readdirSync(userDataPath);
    for (const entry of entries) {
      if (preserveFiles.has(entry)) {
        console.log('[Reset] Preserving:', entry);
        continue;
      }
      const fullPath = path.join(userDataPath, entry);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } catch (e) {
        console.warn('[Reset] Could not delete:', fullPath, e.message);
      }
    }
    console.log('[Reset] userData cleared — relaunching app');
    app.relaunch();
    app.exit(0);
  } catch (err) {
    console.error('[Reset] Error:', err);
  }
});

ipcMain.handle('app:openLogs', async () => {
  try {
    const fs = require('fs');
    const logPath = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logPath)) {
      fs.mkdirSync(logPath, { recursive: true });
    }
    console.log('[Logs] Opening log directory:', logPath);
    shell.openPath(logPath);
  } catch (err) {
    console.error('[Logs] Error opening log directory:', err);
  }
});


// ── Process Control IPC bridge ────────────────────────────────────────────────────────

ipcMain.handle("processControl:scan", async () => {
  try {
    const result = await processControl.scan();
    if (result.error) {
      return { success: false, error: result.error, data: result };
    }
    return { success: true, data: result };
  } catch (err) {
    console.error("[ProcessControl] scan error:", err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("processControl:buildPlan", (_event, scanResult, profile) => {
  try {
    const plan = processControl.buildPlan(scanResult, profile);
    return { success: true, data: plan };
  } catch (err) {
    console.error("[ProcessControl] buildPlan error:", err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("processControl:applyPlan", async (_event, plan) => {
  try {
    const result = await processControl.applyPlan(plan);
    return { success: true, data: result };
  } catch (err) {
    console.error("[ProcessControl] applyPlan error:", err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("processControl:restoreLast", async () => {
  try {
    const result = await processControl.restoreLast();
    return { success: true, data: result };
  } catch (err) {
    console.error("[ProcessControl] restoreLast error:", err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("processControl:getLastResult", () => {
  try {
    const result = processControl.getLastResult();
    return { success: true, data: result };
  } catch (err) {
    console.error("[ProcessControl] getLastResult error:", err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("processControl:getProtectedList", () => {
  try {
    const list = processControl.getProtectedList();
    return { success: true, data: list };
  } catch (err) {
    console.error("[ProcessControl] getProtectedList error:", err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("processControl:terminate", async (_event, pid) => {
  try {
    const result = await processControl.terminate(pid);
    return { success: true, data: result };
  } catch (err) {
    console.error("[ProcessControl] terminate error:", err.message);
    return { success: false, error: err.message };
  }
});

// ── Critical-logger IPC bridge ────────────────────────────────────────────────

/**
 * log:reportCritical
 * Called by the renderer (via preload narrow bridge) to record a critical event
 * from the renderer process — React error boundaries, window.onerror, etc.
 * Validates input so a compromised renderer cannot write arbitrary data.
 */
ipcMain.handle('log:reportCritical', (_event, raw) => {
  try {
    if (!raw || typeof raw !== 'object') return;
    // Strict whitelist — only known fields accepted from renderer
    const ALLOWED_CATEGORIES = new Set([
      'renderer_failure', 'auth_failure', 'performance_warning',
      'tweak_failure', 'backend_failure',
    ]);
    const cat = ALLOWED_CATEGORIES.has(raw.category) ? raw.category : 'renderer_failure';
    criticalLogger.writeCritical({
      category:  cat,
      severity:  raw.severity === 'fatal' ? 'fatal' : raw.severity === 'warning' ? 'warning' : 'error',
      source:    typeof raw.source  === 'string' ? raw.source.substring(0, 64)  : 'renderer',
      message:   typeof raw.message === 'string' ? raw.message.substring(0, 512) : '',
      stack:     typeof raw.stack   === 'string' ? raw.stack.substring(0, 2048)  : undefined,
      route:     typeof raw.route   === 'string' ? raw.route.substring(0, 128)   : undefined,
      userId:    typeof raw.userId  === 'string' ? raw.userId.substring(0, 64)   : undefined,
    });
  } catch (e) {}
});

/**
 * log:getCriticalSummary
 * Returns the human-readable critical event summary for display in Settings.
 */
ipcMain.handle('log:getCriticalSummary', () => {
  try { return criticalLogger.getCriticalSummary(); } catch (e) { return ''; }
});

/**
 * log:getRecentCritical
 * Returns the last `n` structured critical events for display in Settings.
 */
ipcMain.handle('log:getRecentCritical', (_event, n = 20) => {
  try { return criticalLogger.getRecentEvents(Math.min(n, 50)); } catch (e) { return []; }
});

/**
 * log:exportDiagnostics
 * Copies all log files + generates diagnostics.json and summary.txt into a
 * timestamped folder on the user's Desktop (or Downloads if Desktop unavailable).
 * Returns { ok, path, files } so the renderer can show the result.
 */
ipcMain.handle('log:exportDiagnostics', async (_event, notes = '') => {
  try {
    // Timestamp-named folder so successive exports never overwrite each other
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const folderName = `SwitchControl-Diagnostics-${stamp}`;

    let basePath;
    try { basePath = app.getPath('desktop'); } catch (e) {}
    if (!basePath) { try { basePath = app.getPath('downloads'); } catch (e) {} }
    if (!basePath) basePath = app.getPath('userData');

    const destDir = path.join(basePath, folderName);
    const logPaths = fileLogger.getPaths();

    const extraMeta = {
      appVersion:  app.getVersion(),
      osVersion:   `${os.platform()} ${os.release()} ${os.arch()}`,
      platform:    process.platform,
      isPackaged:  app.isPackaged,
      configFlags: {
        isDev:         isDev,
        electronUid:   undefined, // filled per-user — not a secret
        backendPort:   backendLauncher.getBackendPort(),
        backendReady:  backendLauncher.isBackendReady(),
      },
    };

    const result = await criticalLogger.exportDiagnostics(destDir, notes, logPaths, extraMeta);

    if (result.ok) {
      console.log(`[Diagnostics] Export written to: ${result.path} (${result.files.join(', ')})`);
      // Open the folder so the user can immediately find it
      shell.openPath(result.path);
    } else {
      console.error('[Diagnostics] Export failed:', result.error);
    }
    return result;
  } catch (err) {
    console.error('[Diagnostics] Unhandled export error:', err.message);
    return { ok: false, error: err.message };
  }
});

// Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle('window:close', () => mainWindow?.close());

// External links
ipcMain.handle('open-external', (event, url) => {
  if (typeof url !== 'string') {
    console.warn('[Security] open-external rejected: url is not a string');
    return;
  }
  const SAFE_PROTOCOLS = ['https:', 'mailto:'];
  if (isDev) SAFE_PROTOCOLS.push('http:');
  try {
    const parsed = new URL(url);
    if (SAFE_PROTOCOLS.includes(parsed.protocol)) {
      shell.openExternal(url)
        .catch(err => console.error('[open-external] Error:', err));
    } else {
      console.warn('[Security] open-external blocked unsafe protocol:', parsed.protocol);
    }
  } catch (e) {
    console.warn('[Security] open-external rejected malformed URL:', url);
  }
});

// System info (basic)
ipcMain.handle('system:getInfo', () => ({
  platform: process.platform,
  arch: os.arch(),
  hostname: os.hostname(),
  cpus: os.cpus().length,
  totalMemory: os.totalmem(),
  freeMemory: os.freemem()
}));

/** Race a systeminformation call against a timeout so the renderer never hangs. */
function siWithTimeout(fn, ms = 5_000, label = 'si call') {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ── Instant spec builder — synchronous OS APIs only, <1ms ────────────────────
// Returns CPU model/cores/speed, RAM totals, OS info without any WMI/si call.
// GPU and disk come in later via _enrichSpecsInBackground().
function _buildInstantSpecs() {
  const cpus    = os.cpus() || [];
  const model   = cpus[0]?.model?.trim() || 'Unknown CPU';
  const threads = cpus.length || 0;
  const cores   = Math.max(1, Math.floor(threads / 2));
  const speedGhz = cpus[0]?.speed ? (cpus[0].speed / 1000).toFixed(1) : null;
  const total   = os.totalmem();
  const free    = os.freemem();
  const totalGB = parseFloat((total / 1073741824).toFixed(1));
  const freeGB  = parseFloat((free  / 1073741824).toFixed(1));
  const usedGB  = parseFloat(Math.max(0, totalGB - freeGB).toFixed(1));
  return {
    cpu: {
      model,
      cores,
      threads,
      speed: speedGhz ? `${speedGhz} GHz` : 'Unknown',
    },
    gpu: {
      model:    'Detecting…',
      vendor:   'Detecting…',
      vramGB:   0,
      isNvidia: false,
    },
    ram: { totalGB, usedGB, freeGB },
    system: {
      os:       process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
      osVersion: os.release()   || 'Unknown',
      arch:      os.arch()      || 'Unknown',
      hostname:  os.hostname()  || 'Unknown',
      hasLibreHardwareMonitor: false,
    },
    disk:  { name: 'C:', usedGB: 0, totalGB: 0, usePercent: 0 },
    disks: [],
    _partial: true, // enrichment still in-flight
  };
}

// ── Background enrichment — GPU, disk, full CPU via WMI ──────────────────────
// Runs after the instant specs are returned.  Updates cachedSpecs in-place
// so the next IPC call from Home.tsx gets complete data.
let _enrichmentInFlight = false;

async function _enrichSpecsInBackground() {
  if (_enrichmentInFlight) return;
  _enrichmentInFlight = true;
  const _t0 = Date.now();
  console.log('[GPU] enrichment start');
  try {
    // WMI direct path races si.graphics() — resolves in 1-3s on AMD where DXGI hangs.
    // Single Get-CimInstance call returns Name and AdapterRAM without going through DXGI.
    const _wmiEnrichGpuPs = process.platform === 'win32'
      ? `try{$g=Get-CimInstance Win32_VideoController -EA Stop|Where-Object{$_.Name -notmatch 'Microsoft Basic|Remote'}|Select-Object -First 1;if($g){Write-Output "$($g.Name)|$($g.AdapterRAM)"}else{''}}catch{''}`
      : '';

    console.log('[GPU] si.graphics begin (3s timeout — WMI covers AMD DXGI hang)');
    const [graphicsResult, fsResult, cpuResult, wmiGpuResult] = await Promise.allSettled([
      siWithTimeout(() => si.graphics(), 3_000, 'enrich.graphics'),  // WMI fast-path already resolved name; VRAM only
      siWithTimeout(() => si.fsSize(),   5_000, 'enrich.fsSize'),
      siWithTimeout(() => si.cpu(),      5_000, 'enrich.cpu'),        // os.cpus() is the fallback
      process.platform === 'win32'
        ? new Promise(resolve => {
            execFile('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', _wmiEnrichGpuPs],
              { windowsHide: true, timeout: 5000 },
              (err, stdout) => resolve(!err && stdout ? stdout.trim() : ''));
          })
        : Promise.resolve(''),
    ]);
    const _siGfxOk = graphicsResult.status === 'fulfilled';
    console.log(`[GPU] si.graphics ${_siGfxOk ? 'resolved' : 'timed-out/rejected'} — +${Date.now() - _t0}ms`);

    const graphics  = graphicsResult.status === 'fulfilled' ? graphicsResult.value : null;
    const fsData    = fsResult.status        === 'fulfilled' ? fsResult.value       : [];
    const cpuSi     = cpuResult.status       === 'fulfilled' ? cpuResult.value      : null;
    const wmiGpuRaw = wmiGpuResult.status    === 'fulfilled' ? String(wmiGpuResult.value || '') : '';

    // Resolve GPU: prefer si.graphics() (has VRAM), fall back to WMI direct path
    const siGpu = graphics?.controllers?.[0];
    let gpuModel  = siGpu?.model  || null;
    let gpuVendor = siGpu?.vendor || null;
    let gpuVramGB = siGpu?.vram ? safeNum(siGpu.vram / 1024) : 0;
    let gpuIsNvidia = isNvidiaGpu(graphics || { controllers: [] });

    if (!gpuModel && wmiGpuRaw) {
      const [wmiName, wmiRamStr] = wmiGpuRaw.split('|');
      if (wmiName?.trim()) {
        gpuModel    = wmiName.trim();
        const wmiRamBytes = parseInt(wmiRamStr?.trim() || '0', 10);
        if (wmiRamBytes > 0) gpuVramGB = parseFloat((wmiRamBytes / 1073741824).toFixed(1));
        const ml = gpuModel.toLowerCase();
        gpuVendor   = ml.includes('nvidia') ? 'NVIDIA'
                    : (ml.includes('amd') || ml.includes('radeon')) ? 'AMD'
                    : ml.includes('intel') ? 'Intel' : null;
        gpuIsNvidia = ml.includes('nvidia');
        console.log('[GPU] enrichment WMI direct-path resolved:', gpuModel, '|', gpuVramGB.toFixed(1), 'GB');
      }
    }

    // Final fallback: use the startup WMI fast-path name if both si.graphics()
    // and the enrichment WMI failed (e.g. concurrent PowerShell saturation on cold boot).
    if (!gpuModel && wmiGpuModelName) {
      gpuModel = wmiGpuModelName;
      const ml = gpuModel.toLowerCase();
      gpuVendor = gpuVendor || (ml.includes('nvidia') ? 'NVIDIA'
                              : (ml.includes('amd') || ml.includes('radeon')) ? 'AMD'
                              : ml.includes('intel') ? 'Intel' : null);
      gpuIsNvidia = gpuIsNvidia || ml.includes('nvidia');
      console.log('[GPU] enrichment: using startup WMI fallback name:', gpuModel);
    }
    console.log(`[GPU] enrichment resolved — model=${gpuModel || 'null'} +${Date.now() - _t0}ms`);

    const gpu = siGpu; // keep for backward compat ref below
    const disks = (fsData || []).map(d => {
      const pct = safeNum(d.use || 0);
      return {
        mount:       d.mount || 'Unknown',
        name:        d.fs   || d.mount || 'Unknown',
        totalGB:     safeNum((d.size || 0) / 1073741824),
        usedGB:      safeNum((d.used || 0) / 1073741824),
        usePercent:  pct,
        usedPercent: pct,
      };
    });

    if (cachedSpecs) {
      cachedSpecs = {
        ...cachedSpecs,
        cpu: cpuSi ? {
          model:   cpuSi.brand || cachedSpecs.cpu.model,
          cores:   cpuSi.physicalCores || cachedSpecs.cpu.cores,
          threads: cpuSi.cores || cachedSpecs.cpu.threads,
          speed:   cpuSi.speed ? `${safeNum(cpuSi.speed)} GHz` : cachedSpecs.cpu.speed,
        } : cachedSpecs.cpu,
        gpu: {
          model:    gpuModel    || 'Unavailable',
          vendor:   gpuVendor   || 'Unavailable',
          vramGB:   gpuVramGB,
          isNvidia: gpuIsNvidia,
        },
        disk:  disks[0] || cachedSpecs.disk,
        disks,
        _partial: false,
      };
      cachedSpecsTime = Date.now();
      console.log(`[GPU] cachedSpecs updated — model=${cachedSpecs.gpu.model} +${Date.now() - _t0}ms`);
      console.log('[GPU] IPC sent — specs:enriched');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('specs:enriched', {
          gpu: cachedSpecs.gpu,
          cpu: cachedSpecs.cpu,
        });
      }
    }
  } catch (e) {
    console.warn('[GPU] enrichment error:', e.message || e);
  } finally {
    _enrichmentInFlight = false;
  }
}

// ── loadSystemSpecs — instant first call, enriched on repeat ─────────────────
// First call: returns in <1ms using synchronous OS APIs, fires background
// enrichment for GPU/disk/full CPU.  Subsequent calls return the cached result.
// Home.tsx calls this with an 8s timeout — by then enrichment is done.
async function loadSystemSpecs() {
  const now = Date.now();

  // Return fully-enriched cache if still fresh
  if (cachedSpecs && !cachedSpecs._partial && (now - cachedSpecsTime) < SPECS_CACHE_TTL) {
    return cachedSpecs;
  }

  // First call — build and cache an instant result, then enrich in background
  if (!cachedSpecs) {
    cachedSpecs = _buildInstantSpecs();
    // If WMI fast-path already resolved before this first call (race window is
    // ~0-2s), apply the GPU name immediately so callers never see "Detecting…".
    if (wmiGpuModelName) {
      const _ml = wmiGpuModelName.toLowerCase();
      const _vendor = _ml.includes('nvidia') ? 'NVIDIA'
                    : (_ml.includes('amd') || _ml.includes('radeon')) ? 'AMD'
                    : _ml.includes('intel') ? 'Intel' : cachedSpecs.gpu.vendor;
      cachedSpecs = {
        ...cachedSpecs,
        gpu: { ...cachedSpecs.gpu, model: wmiGpuModelName, vendor: _vendor, isNvidia: _ml.includes('nvidia') },
      };
      console.log('[GPU] loadSystemSpecs first call: wmiGpuModelName already ready, applied synchronously —', wmiGpuModelName);
    }
    cachedSpecsTime = now;
    console.log('[SwitchControl] Instant specs (sync):', cachedSpecs.cpu.model, '| GPU:', cachedSpecs.gpu.model, '| enrichment starting…');
    void _enrichSpecsInBackground();
    return cachedSpecs;
  }

  // Enrichment is in-flight — return the partial result now; caller will retry
  if (cachedSpecs._partial) {
    return cachedSpecs;
  }

  // Cache expired (>5min) — refresh in background, return stale for now
  if ((now - cachedSpecsTime) >= SPECS_CACHE_TTL) {
    void _enrichSpecsInBackground();
  }

  return cachedSpecs;
}

ipcMain.handle('system:loadSpecs', async () => {
  return await loadSystemSpecs();
});

// Telemetry handlers
ipcMain.handle('telemetry:getBasic', async () => {
  if (!liveTelemetryCache) {
    console.warn('[TelemetryViolation] source=ipc handler=telemetry:getBasic called before cache ready');
    return { cpuUsage: 0, ramUsage: 0, cpuTemp: null, showCpuTemp: false, ramTotal: 0, showGpu: false, showMobo: false, timestamp: Date.now() };
  }
  const { load, mem, temps } = liveTelemetryCache;
  const cpuTemp = safeNum(temps?.main || 0);
  const ramTotal = Math.round((mem?.total || 0) / (1024 * 1024 * 1024));
  const ramUsed = Math.round((((mem?.total || 0) - (mem?.available || 0)) / (mem?.total || 1)) * 100);
  return {
    cpuUsage: safeNum(load?.currentLoad || 0),
    ramUsage: ramUsed,
    cpuTemp: cpuTemp > 0 ? cpuTemp : null,
    showCpuTemp: cpuTemp > 0,
    ramTotal,
    showGpu: false,
    showMobo: false,
    timestamp: Date.now()
  };
});

ipcMain.handle('telemetry:getEnhanced', async () => {
  if (!liveTelemetryCache) {
    console.warn('[TelemetryViolation] source=ipc handler=telemetry:getEnhanced called before cache ready');
    return { cpuUsage: 0, cpuCores: [], ramUsage: 0, cpuTemp: null, gpuTemp: null, timestamp: Date.now() };
  }
  const { load, mem, temps } = liveTelemetryCache;
  const cpuTemp = safeNum(temps?.main || 0);
  const gpuTemp = gpuPollCache.temp;
  return {
    cpuUsage: safeNum(load?.currentLoad || 0),
    cpuCores: (load?.cpus || []).map(c => safeNum(c.load || 0)),
    ramUsage: safeNum(((mem?.total || 0) - (mem?.available || 0)) / (mem?.total || 1) * 100),
    cpuTemp: Number.isFinite(cpuTemp) && cpuTemp > 0 ? cpuTemp : null,
    gpuTemp: gpuTemp,
    timestamp: Date.now()
  };
});

ipcMain.handle('telemetry:getHardwareTelemetry', async () => {
  try {
    const specs = await loadSystemSpecs();

    const [mem, memLayout] = await Promise.all([
      si.mem().catch(() => ({ total: 0, available: 0 })),
      si.memLayout().catch(() => []),
    ]);

    const cpuModel = specs?.cpu?.model || '';
    const gpuModel = specs?.gpu?.model || '';
    const ramTotalGB = specs?.ram?.totalGB || Math.round((mem.total || 0) / (1024 * 1024 * 1024));

    let memoryFrequency = null;
    if (Array.isArray(memLayout) && memLayout.length > 0) {
      const maxSpeed = Math.max(...memLayout.map(m => m.clockSpeed || 0).filter(s => s > 0));
      if (maxSpeed > 0) memoryFrequency = maxSpeed;
    }

    const physicalCores = specs?.cpu?.cores || null;
    const logicalCores = specs?.cpu?.threads || null;

    const speedMatch = specs?.cpu?.speed?.match(/[\d.]+/);
    const baseClock = speedMatch ? Math.round(parseFloat(speedMatch[0]) * 1000) : null;
    const cpuBoostClock = baseClock ? Math.round(baseClock * 1.15) : null;

    return {
      cpuBoostClock,
      cpuBaseClock: baseClock,
      packagePower:     null,
      ppt:              null,
      tdc:              null,
      edc:              null,
      memoryFrequency,
      memoryTimings:    null,
      physicalCores,
      logicalCores,
      cStateResidency:  null,
      cpuModel,
      gpuModel,
      ramTotalGB,
      rebarSupported:   null,
      vcoreVoltage:     null,
      cpuTemp:          null,
      thermalThrottling: null,
      gpuPower:         null,
    };
  } catch (e) {
    console.error('[SwitchControl] hardware telemetry error:', e.message);
    return null;
  }
});

// ── Deep-hardware on-demand IPC (si.graphics + cpuTemp + memLayout) ───────────
// NOT called from the background loop — only when the user opens a hardware
// details modal, the GPU panel, or triggers an AI Advisor deep scan.
// Results are cached for 60s to prevent re-hammering on rapid opens.
let _deepHardwareCache   = null;
let _deepHardwareCacheTs = 0;
const DEEP_HARDWARE_TTL_MS = 60_000;

ipcMain.handle('telemetry:refreshDeepHardware', async () => {
  const now = Date.now();
  if (_deepHardwareCache && (now - _deepHardwareCacheTs) < DEEP_HARDWARE_TTL_MS) {
    return { ..._deepHardwareCache, cached: true };
  }
  try {
    const [graphicsResult, cpuTempResult, memLayoutResult] = await Promise.allSettled([
      si.graphics().catch(() => null),
      si.cpuTemperature().catch(() => null),
      si.memLayout().catch(() => []),
    ]);
    const graphics  = graphicsResult.status  === 'fulfilled' ? graphicsResult.value  : null;
    const cpuTemp   = cpuTempResult.status   === 'fulfilled' ? cpuTempResult.value   : null;
    const memLayout = memLayoutResult.status === 'fulfilled' ? memLayoutResult.value : [];

    const result = { graphics, cpuTemperature: cpuTemp, memLayout, timestamp: now, cached: false };
    _deepHardwareCache   = result;
    _deepHardwareCacheTs = now;
    return result;
  } catch (e) {
    console.error('[telemetry:refreshDeepHardware] error:', e.message);
    return null;
  }
});

// Alias handlers for preload/main name alignment
ipcMain.handle('system:getSpecs', async () => {
  return await loadSystemSpecs();
});

// Display info — PowerShell WMI query for monitor resolution/refresh rate.
// Same logic as server/routes/dashboardIntelligence.ts collectDisplayViaPowerShell()
// but runs on the user's local Windows machine (not the cloud server).
// In-memory cache with 60s TTL — WMI/EDID detection is expensive (PowerShell
// spawn + registry reads). Monitors don't change during a session.
let _displayInfoCache = null;
let _displayInfoCachedAt = 0;
const DISPLAY_INFO_TTL_MS = 60_000;

ipcMain.handle('system:getDisplayInfo', async () => {
  if (process.platform !== 'win32') return { controllers: [], displays: [], monitorName: null, hdrEnabled: null };
  const now = Date.now();
  if (_displayInfoCache && (now - _displayInfoCachedAt) < DISPLAY_INFO_TTL_MS) {
    return _displayInfoCache;
  }
  const ps = `
$result = @{ controllers = @(); displays = @(); monitorName = $null; hdrEnabled = $null }
try {
  $vcs = Get-WmiObject Win32_VideoController -ErrorAction Stop |
    Select-Object Name, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate, CurrentBitsPerPixel, VideoModeDescription
  if ($null -ne $vcs) {
    $vcArr = if ($vcs -is [array]) { $vcs } else { @($vcs) }
    $result.controllers = @($vcArr | ForEach-Object { @{ Name = $_.Name } })
    $dispList = @()
    foreach ($vc in $vcArr) {
      $resX = [int]($vc.CurrentHorizontalResolution)
      $resY = [int]($vc.CurrentVerticalResolution)
      $hz   = [int]($vc.CurrentRefreshRate)
      $bpp  = [int]($vc.CurrentBitsPerPixel)
      if ($resX -le 0 -and $vc.VideoModeDescription -match '(\\d+) x (\\d+)') {
        $resX = [int]$Matches[1]; $resY = [int]$Matches[2]
      }
      if ($resX -gt 0) {
        $dispList += @{ currentResX=$resX; currentResY=$resY; currentRefreshRate=$hz; bitsPerPixel=$bpp }
      }
    }
    if ($dispList.Count -gt 0) { $result.displays = $dispList }
  }
} catch {}
if ($result.displays.Count -eq 0) {
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    $screens = [System.Windows.Forms.Screen]::AllScreens
    $hz = 0
    try { $hz = [int](Get-WmiObject Win32_VideoController | Select-Object -First 1 -ExpandProperty CurrentRefreshRate) } catch {}
    $result.displays = @($screens | ForEach-Object {
      @{ currentResX=$_.Bounds.Width; currentResY=$_.Bounds.Height; currentRefreshRate=$hz; bitsPerPixel=32 }
    })
  } catch {}
}
try {
  $monIds = Get-WmiObject -Namespace root\\wmi -Class WmiMonitorID -ErrorAction Stop
  $arr = if ($monIds -is [array]) { $monIds } else { @($monIds) }
  foreach ($m in $arr) {
    $nb = $m.UserFriendlyName | Where-Object { $_ -ne 0 }
    if ($nb) { $result.monitorName = ([System.Text.Encoding]::ASCII.GetString([byte[]]$nb)).Trim(); break }
  }
} catch {}
# HDR — source 1: Windows global toggle
try {
  $hv = (Get-ItemProperty 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\VideoSettings' -Name EnableHDRForVideo -EA Stop).EnableHDRForVideo
  $result.hdrEnabled = ($hv -eq 1)
} catch {}
# HDR — source 2: Windows 11 per-display sub-keys (AdvancedColorEnabled / EnableHDRForVideo per monitor GUID)
if ($result.hdrEnabled -eq $null) {
  try {
    $subkeys = Get-ChildItem 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\VideoSettings' -EA Stop
    foreach ($sk in $subkeys) {
      $acv = (Get-ItemProperty $sk.PSPath -Name AdvancedColorEnabled -EA SilentlyContinue).AdvancedColorEnabled
      if ($acv -ne $null) { $result.hdrEnabled = ($acv -eq 1); break }
      $ehv = (Get-ItemProperty $sk.PSPath -Name EnableHDRForVideo -EA SilentlyContinue).EnableHDRForVideo
      if ($ehv -ne $null) { $result.hdrEnabled = ($ehv -eq 1); break }
    }
  } catch {}
}
# HDR — source 3: GPU driver configuration (AMD/NVIDIA AdvancedColorEnabled under GraphicsDrivers\Configuration)
if ($result.hdrEnabled -eq $null) {
  try {
    $cfgBase = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers\\Configuration'
    $checked = 0
    :hdrSearch foreach ($ck in (Get-ChildItem $cfgBase -EA Stop)) {
      foreach ($sk in (Get-ChildItem $ck.PSPath -EA SilentlyContinue)) {
        foreach ($sk2 in (Get-ChildItem $sk.PSPath -EA SilentlyContinue)) {
          $adv = (Get-ItemProperty $sk2.PSPath -Name AdvancedColorEnabled -EA SilentlyContinue).AdvancedColorEnabled
          if ($adv -ne $null) { $result.hdrEnabled = ($adv -eq 1); break hdrSearch }
          $checked++; if ($checked -gt 8) { break hdrSearch }
        }
      }
    }
  } catch {}
}
# HDR — source 4: AMD driver class keys (IsHDREnabled / AdvancedColorEnabled per GPU instance)
if ($result.hdrEnabled -eq $null) {
  try {
    $gpuClass = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
    foreach ($dk in (Get-ChildItem $gpuClass -EA Stop | Where-Object { $_.PSChildName -match '^\d+$' } | Select-Object -First 4)) {
      $hdr1 = (Get-ItemProperty $dk.PSPath -Name 'IsHDREnabled' -EA SilentlyContinue).'IsHDREnabled'
      if ($hdr1 -ne $null) { $result.hdrEnabled = ($hdr1 -eq 1); break }
      $hdr2 = (Get-ItemProperty $dk.PSPath -Name 'AdvancedColorEnabled' -EA SilentlyContinue).'AdvancedColorEnabled'
      if ($hdr2 -ne $null) { $result.hdrEnabled = ($hdr2 -eq 1); break }
    }
  } catch {}
}
# HDR — source 5: Windows CIM display capability (AdvancedColor / HDR10 via WmiMonitorColorimetrySupport)
if ($result.hdrEnabled -eq $null) {
  try {
    $mc = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorColorimetrySupport -EA Stop
    $mcArr = if ($mc -is [array]) { $mc } else { @($mc) }
    foreach ($m in $mcArr) {
      if ($m.MetaData -ne $null) {
        # Bit 2 set → BT.2020 (HDR10 capable display)
        $result.hdrEnabled = ([int]$m.MetaData -band 4) -ne 0; break
      }
    }
  } catch {}
}
# VRR — source 1: Windows OS-level VRR toggle (works for G-Sync and Windows VRR)
try {
  $vrr = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\VideoSettings' -Name EnableVariableRefreshRate -EA Stop).EnableVariableRefreshRate
  $result.vrrEnabled = ($vrr -eq 1)
} catch { $result.vrrEnabled = $null }
# VRR — source 2: AMD FreeSync driver registry (multiple key names across driver generations)
if ($result.vrrEnabled -eq $null) {
  try {
    $gpuClass = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
    foreach ($dk in (Get-ChildItem $gpuClass -EA Stop | Where-Object { $_.PSChildName -match '^\d+$' } | Select-Object -First 8)) {
      # RDNA1/2: KMD_FreeSync (0=off, 1=on, 2=enhanced)
      $fs = (Get-ItemProperty $dk.PSPath -Name 'KMD_FreeSync' -EA SilentlyContinue).'KMD_FreeSync'
      if ($fs -ne $null) { $result.vrrEnabled = ([int]$fs -ge 1); break }
      # RDNA2/3: KMD_FreeSync2 — FreeSync Premium/Premium Pro
      $fs2 = (Get-ItemProperty $dk.PSPath -Name 'KMD_FreeSync2' -EA SilentlyContinue).'KMD_FreeSync2'
      if ($fs2 -ne $null) { $result.vrrEnabled = ([int]$fs2 -ge 1); break }
      # Older AMD: KMD_EnableFreeSyncDX
      $fsdx = (Get-ItemProperty $dk.PSPath -Name 'KMD_EnableFreeSyncDX' -EA SilentlyContinue).'KMD_EnableFreeSyncDX'
      if ($fsdx -ne $null) { $result.vrrEnabled = ($fsdx -eq 1); break }
      # Adrenalin 2022+: DAL2_AC1_...FreeSync keys
      $dalfs = (Get-ItemProperty $dk.PSPath -Name 'DAL2FreeSync2' -EA SilentlyContinue).'DAL2FreeSync2'
      if ($dalfs -ne $null) { $result.vrrEnabled = ($dalfs -eq 1); break }
    }
  } catch {}
}
# VRR — source 2b: check AMD Software user settings (Adrenalin stores panel FreeSync state here)
if ($result.vrrEnabled -eq $null) {
  try {
    $amdSettings = 'HKCU:\\Software\\AMD\\CN'
    $fsVal = (Get-ItemProperty "$amdSettings\\OverlayAnchor" -Name 'FreeSyncEnabled' -EA Stop).FreeSyncEnabled
    if ($fsVal -ne $null) { $result.vrrEnabled = ($fsVal -eq 1) }
  } catch {}
}
# VRR — source 3: monitor EDID-declared continuous frequency support (indicates hardware VRR capability)
if ($result.vrrEnabled -eq $null) {
  try {
    $mf = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorSupportedDisplayFeatures -EA Stop
    $mfArr = if ($mf -is [array]) { $mf } else { @($mf) }
    foreach ($f in $mfArr) {
      if ($f.ContinuousFrequencySupported -ne $null) { $result.vrrEnabled = [bool]($f.ContinuousFrequencySupported); break }
    }
  } catch {}
}
# Connection type — WmiMonitorConnectionParams is the most reliable source (Win8+)
$result.connectionType = $null
try {
  $cp = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorConnectionParams -ErrorAction Stop
  $cpArr = if ($cp -is [array]) { $cp } else { @($cp) }
  foreach ($c in $cpArr) {
    $t = [int]($c.VideoOutputTechnology)
    if ($t -eq 10 -or $t -eq 11) { $result.connectionType = "DisplayPort"; break }
    if ($t -eq 5)                 { $result.connectionType = "HDMI"; break }
    if ($t -eq 4)                 { $result.connectionType = "DVI"; break }
    if ($t -eq 15)                { $result.connectionType = "Miracast"; break }
    if ($t -eq 16)                { $result.connectionType = "Indirect Wired"; break }
    if ($t -eq 0 -and $null -eq $result.connectionType) { $result.connectionType = "Other" }
  }
} catch {}
# Native resolution — parse EDID preferred timing descriptor (bytes 54-71) from registry
$result.nativeResX = $null; $result.nativeResY = $null
try {
  $dispBase = "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\DISPLAY"
  $models = Get-ChildItem $dispBase -ErrorAction SilentlyContinue
  :edidSearch foreach ($model in $models) {
    $instances = Get-ChildItem $model.PSPath -ErrorAction SilentlyContinue
    foreach ($inst in $instances) {
      $paramPath = Join-Path $inst.PSPath "Device Parameters"
      $edid = (Get-ItemProperty $paramPath -Name EDID -ErrorAction SilentlyContinue).EDID
      if ($edid -and $edid.Count -ge 72) {
        # DTD block 1 at byte 54 (0x36). Bytes 56,58,59,61 hold H/V addressable pixels.
        $hLow  = [int]$edid[56]; $hHigh = ([int]$edid[58] -band 0xF0) -shr 4
        $vLow  = [int]$edid[59]; $vHigh = ([int]$edid[61] -band 0xF0) -shr 4
        $nx = ($hHigh -shl 8) -bor $hLow; $ny = ($vHigh -shl 8) -bor $vLow
        if ($nx -gt 320 -and $ny -gt 240) {
          $result.nativeResX = $nx; $result.nativeResY = $ny; break edidSearch
        }
      }
    }
  }
} catch {}
$result | ConvertTo-Json -Depth 3 -Compress`.trim();
  try {
    const raw = await new Promise((resolve) => {
      execFile('powershell', [
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
        '-ExecutionPolicy', 'Bypass', '-Command', ps,
      ], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
        resolve(err ? null : (stdout || '').trim());
      });
    });
    if (!raw) return { controllers: [], displays: [], monitorName: null, hdrEnabled: null };
    const parsed = JSON.parse(raw);
    const controllers = (parsed.controllers ?? []).map(v => ({ model: v.Name ?? null }));
    const displays = (parsed.displays ?? []).map(v => ({
      currentResX: v.currentResX ?? null,
      currentResY: v.currentResY ?? null,
      currentRefreshRate: v.currentRefreshRate ?? null,
      bitsPerPixel: v.bitsPerPixel ?? null,
    }));
    const result = {
      controllers,
      displays,
      monitorName:    parsed.monitorName    ?? null,
      hdrEnabled:     parsed.hdrEnabled     ?? null,
      vrrEnabled:     parsed.vrrEnabled     ?? null,
      connectionType: parsed.connectionType ?? null,
      nativeResX:     parsed.nativeResX     ?? null,
      nativeResY:     parsed.nativeResY     ?? null,
    };
    _displayInfoCache = result;
    _displayInfoCachedAt = Date.now();
    return result;
  } catch (e) {
    console.warn('[system:getDisplayInfo] error:', e.message);
    return { controllers: [], displays: [] };
  }
});

ipcMain.handle('telemetry:getLive', async (event, selectedDiskMount) => {
  try {
    // Use the background-polled cache. If not yet populated (first call before
    // priming completes) return zeros — the next call will have real data.
    if (!liveTelemetryCache) {
      console.warn('[telemetry:getLive] cache not ready yet — returning zeros. Will populate within 2s.');
      return {
        timestamp: Date.now(),
        cpu:     { usagePct: 0, tempC: null, coreCount: 0 },
        ram:     { usedGb: 0, totalGb: 0, usagePct: 0 },
        gpu:     { available: gpuExistsOnHardware, model: null, usagePct: null, tempC: null, vramUsedMb: null, vramTotalMb: null, vramUsagePct: null, powerW: null, clockMhz: null },
        disk:    { selectedMount: null, usagePct: 0, activeTimePct: null, readKBps: null, writeKBps: null, available: false, source: 'warming' },
        network: { rxKBps: 0, txKBps: 0 },
        ssds:    [],
      };
    }

    const { load, mem, temps, fsData, netStats, diskIO } = liveTelemetryCache;

    const cpuLoad = safeNum(load.currentLoad || 0);
    const cpuTemp = safeNum(temps.main || 0);
    const cpuMaxTemp = safeNum(temps.max || 0);
    const coreLoads = (load.cpus || []).map(c => safeNum(c.load || 0));

    const ramTotal = mem.total || 0;
    const ramUsed = (mem.total || 0) - (mem.available || 0);
    const ramTotalGb = Math.round(ramTotal / (1024 * 1024 * 1024));
    const ramUsedGb = parseFloat((ramUsed / (1024 * 1024 * 1024)).toFixed(1));
    const ramPercent = ramTotal > 0 ? Math.round((ramUsed / ramTotal) * 100) : 0;

    // --- GPU telemetry: read from gpuPollCache (fast, non-blocking cache read) ---
    // load: populated by LHM (if running) or by the last on-demand perf counter refresh.
    // No PowerShell is spawned in the polling loop — see telemetry:refreshGpuLoad for on-demand.
    const gpuLoad     = gpuPollCache.load;
    const gpuTemp     = gpuPollCache.temp;
    const gpuMemUsed  = gpuPollCache.memUsedMb;
    const gpuMemTotal = gpuPollCache.memTotalMb;
    const gpuPower    = gpuPollCache.power;
    const gpuClockMhz = gpuPollCache.clockMhz;

    // --- Disk: resolve selected disk, fall back to C: then first ---
    // usagePct is always available (from fsSize — capacity, not activity).
    // activeTimePct / readKBps / writeKBps are only emitted when diskIO.available is true.
    const disks = fsData || [];
    let selectedDisk = null;
    if (selectedDiskMount) {
      selectedDisk = disks.find(d => d.mount === selectedDiskMount);
    }
    if (!selectedDisk) {
      selectedDisk = disks.find(d => d.mount === 'C:' || d.mount === '/') || disks[0];
    }
    const diskPercent = selectedDisk ? safeNum(selectedDisk.use, 0) : 0;
    // Only expose activity values when the source is confirmed valid
    const diskActiveTimePct = diskIO.available ? diskIO.activeTimePct : null;
    const diskReadKBps      = diskIO.available ? diskIO.readKBps      : null;
    const diskWriteKBps     = diskIO.available ? diskIO.writeKBps     : null;

    // --- Network: always return 0 (not null) when idle ---
    let netRxSec = 0;
    let netTxSec = 0;
    for (const iface of (netStats || [])) {
      netRxSec += safeNum(iface.rx_sec || 0, 0);
      netTxSec += safeNum(iface.tx_sec || 0, 0);
    }
    const netRxKBs = Math.round(netRxSec / 1024);
    const netTxKBs = Math.round(netTxSec / 1024);

    // gpuExistsOnHardware is set true as soon as si.graphics() returns a controller
    // at startup (fast path, ~300–600ms). This lets us flag the GPU as "available"
    // and emit usagePct:0 as a startup placeholder before the PowerShell perf counter
    // (2–4s cold start) returns its first reading — keeping the chart line present
    // from frame 1 instead of joining 4–6s late.
    const gpuAvailable = gpuLoad != null || gpuTemp != null || gpuExistsOnHardware;
    // When the GPU perf counter hasn't returned a reading yet (or is failing),
    // emit null so the UI shows "—" instead of a misleading "0%".
    const gpuUsagePct = gpuLoad != null && gpuLoad >= 0 ? gpuLoad : null;
    const vramUsedMb  = gpuMemUsed  != null ? gpuMemUsed  : null;
    const vramTotalMb = gpuMemTotal != null ? gpuMemTotal : null;
    const vramUsagePct = (vramUsedMb != null && vramTotalMb != null && vramTotalMb > 0)
      ? Math.round((vramUsedMb / vramTotalMb) * 100) : null;

    const result = {
      timestamp: Date.now(),
      cpu: {
        usagePct:  cpuLoad,
        tempC:     cpuTemp > 0 ? cpuTemp : null,
        coreCount: coreLoads.length,
      },
      ram: {
        usedGb:   ramUsedGb,
        totalGb:  ramTotalGb,
        usagePct: ramPercent,
      },
      gpu: {
        available:   gpuAvailable,
        // Treat 'Detecting…' and 'Unavailable' as no-value — fall through to the
        // startup WMI fast-path name which resolves in ~1s even when si.graphics() hangs.
        model:       ((_m => _m && _m !== 'Detecting\u2026' && _m !== 'Unavailable' ? _m : null)(cachedSpecs?.gpu?.model)) || wmiGpuModelName || null,
        usagePct:    gpuUsagePct,
        tempC:       gpuTemp  != null && gpuTemp  >  0 ? gpuTemp  : null,
        vramUsedMb,
        vramTotalMb,
        vramUsagePct,
        powerW:      gpuPower    != null && gpuPower    > 0 ? gpuPower    : null,
        clockMhz:    gpuClockMhz != null && gpuClockMhz > 0 ? gpuClockMhz : null,
        _debug: {
          source:          gpuPollCache.source,
          engines:         lastGpuEngineBreakdown,
          aggregation:     'max-of-engine-sums',
        },
      },
      disk: {
        selectedMount:  selectedDisk?.mount || null,
        usagePct:       diskPercent,
        activeTimePct:  diskActiveTimePct,
        readKBps:       diskReadKBps,
        writeKBps:      diskWriteKBps,
        available:      !!diskIO.available,
        source:         diskIO.source || 'none',
      },
      network: {
        rxKBps: netRxKBs,
        txKBps: netTxKBs,
      },
      ssds: (disks)
        .filter(d => d.size > 0)
        .map(d => ({
          name:    d.mount || d.fs || 'Unknown',
          totalGB: Math.round(d.size / (1024 * 1024 * 1024)),
          usedGB:  parseFloat((d.used / (1024 * 1024 * 1024)).toFixed(1)),
          status:  'Active',
        })),
    };

    return result;
  } catch (e) {
    console.error('[telemetry:getLive] error:', e.message);
    return {
      timestamp: Date.now(),
      cpu:     { usagePct: 0, tempC: null, coreCount: 0 },
      ram:     { usedGb: 0, totalGb: 0, usagePct: 0 },
      gpu:     { available: false, model: null, usagePct: null, tempC: null, vramUsedMb: null, vramTotalMb: null, vramUsagePct: null, powerW: null, clockMhz: null },
      disk:    { selectedMount: null, usagePct: 0, activeTimePct: null, readKBps: null, writeKBps: null, available: false, source: 'unavailable' },
      network: { rxKBps: 0, txKBps: 0 },
      ssds:    [],
    };
  }
});

ipcMain.handle('system:getRamUsage', async () => {
  try {
    const mem = await si.mem();
    const used = mem.total - mem.available;
    return {
      total: mem.total,
      used,
      free: mem.available,
      usagePercent: Math.round((used / mem.total) * 100),
      totalGB: Math.round(mem.total / 1024 / 1024 / 1024),
      usedGB: Number((used / 1024 / 1024 / 1024).toFixed(1)),
      freeGB: Number((mem.available / 1024 / 1024 / 1024).toFixed(1)),
    };
  } catch (e) {
    return { total: 0, used: 0, free: 0, usagePercent: 0, totalGB: 0, usedGB: 0, freeGB: 0 };
  }
});

ipcMain.handle('system:getAllDisks', async () => {
  try {
    const disks = await si.fsSize();
    return (disks || []).map(d => ({
      mount:       d.mount || 'Unknown',
      name:        d.fs   || d.mount || 'Unknown',
      totalGB:     safeNum((d.size || 0) / 1024 / 1024 / 1024),
      usedGB:      safeNum((d.used || 0) / 1024 / 1024 / 1024),
      usedPercent: safeNum(d.use  || 0),
    }));
  } catch (e) {
    return [];
  }
});

ipcMain.handle('telemetry:getCpuCores', async () => {
  try {
    const load = await si.currentLoad();
    return (load.cpus || []).map((c, i) => ({ core: i, load: safeNum(c.load || 0) }));
  } catch (e) {
    return [];
  }
});

ipcMain.handle('telemetry:getMemoryDetails', async () => {
  try {
    const [mem, layout] = await Promise.all([
      si.mem(),
      si.memLayout().catch(() => [])
    ]);
    return {
      total: mem.total,
      free: mem.free,
      used: mem.used || (mem.total - mem.available),
      available: mem.available,
      swaptotal: mem.swaptotal,
      swapused: mem.swapused,
      modules: (layout || []).map(m => ({
        size: m.size,
        type: m.type,
        clockSpeed: m.clockSpeed,
        formFactor: m.formFactor,
        manufacturer: m.manufacturer,
        voltageConfigured: m.voltageConfigured
      }))
    };
  } catch (e) {
    return { total: 0, free: 0, used: 0, available: 0, modules: [] };
  }
});

// ── GPU info cache (si.graphics is ~300–600ms; cache for 30s) ─────────────────
let _gpuInfoCache = null;
let _gpuInfoCacheTs = 0;
const GPU_INFO_TTL_MS = 30_000;

ipcMain.handle('telemetry:getGpu', async () => {
  try {
    const now = Date.now();
    if (_gpuInfoCache && (now - _gpuInfoCacheTs) < GPU_INFO_TTL_MS) {
      return { ..._gpuInfoCache, cached: true };
    }
    const graphics = await si.graphics();
    const ctrl = (graphics.controllers || [])[0];
    if (!ctrl) return null;

    const vendorLower = (ctrl.vendor || '').toLowerCase();
    const isAmd = vendorLower.includes('amd') || vendorLower.includes('advanced micro');

    // Base info from systeminformation
    // For AMD, si.graphics() often returns 0 for load/temp — treat 0 as missing/unavailable
    const result = {
      model: ctrl.model || 'Unknown GPU',
      vendor: ctrl.vendor || '',
      driverVersion: ctrl.driverVersion || null,
      vram: ctrl.vram > 0 ? safeNum(ctrl.vram) : null,             // MB
      memoryUsed: ctrl.memoryUsed > 0 ? safeNum(ctrl.memoryUsed) : null, // MB
      temperature: ctrl.temperatureGpu > 0 ? safeNum(ctrl.temperatureGpu) : null,
      load: (!isAmd && ctrl.utilizationGpu >= 0) ? safeNum(ctrl.utilizationGpu) : null,
      powerDraw: null,
      clockCore: null,
      clockMemory: null,
    };

    // nvidia-smi for NVIDIA as last resort (skip for AMD — no smi support)
    if (!isAmd && cachedSpecs?.gpu?.isNvidia && (result.temperature === null || result.load === null)) {
      try {
        const nvidiaFull = await new Promise((resolve) => {
          exec(
            'nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,clocks.current.graphics,clocks.current.memory --format=csv,noheader,nounits',
            { windowsHide: true, timeout: 3000 },
            (err, stdout) => {
              if (err || !stdout) return resolve(null);
              const parts = stdout.trim().split(',').map(s => s.trim());
              resolve(parts.length >= 7 ? parts : null);
            }
          );
        });
        if (nvidiaFull) {
          const nv = nvidiaFull.map(s => parseFloat(s));
          if (result.temperature === null && Number.isFinite(nv[0])) result.temperature = nv[0];
          if (result.load === null && Number.isFinite(nv[1])) result.load = nv[1];
          if (result.memoryUsed === null && Number.isFinite(nv[2])) result.memoryUsed = nv[2];
          if (result.vram === null && Number.isFinite(nv[3])) result.vram = nv[3];
          if (result.powerDraw === null && Number.isFinite(nv[4])) result.powerDraw = nv[4];
          if (result.clockCore === null && Number.isFinite(nv[5])) result.clockCore = nv[5];
          if (result.clockMemory === null && Number.isFinite(nv[6])) result.clockMemory = nv[6];
        }
      } catch {}
    }

    // Fail honestly: if temp/load are still null, UI will show "Unavailable" rather than 0
    _gpuInfoCache = { ...result };
    _gpuInfoCacheTs = Date.now();
    verboseLog(`[telemetry:getGpu] model=${result.model} vendor=${result.vendor} load=${result.load} temp=${result.temperature} vram=${result.vram}MB power=${result.powerDraw}W`);
    return result;
  } catch (e) {
    console.error('[telemetry:getGpu] error:', e.message);
    return null;
  }
});

/**
 * telemetry:refreshGpuLoad — on-demand Windows GPU perf counter read.
 *
 * This is the ONLY place getGpuPerfCounterLoad() is called during steady-state.
 * It is NOT called in the background poll loop — call this from the UI when the
 * user explicitly opens the GPU section, runs the AI advisor, or hits a refresh
 * button. Responses within the TTL window are served from cache (no PS spawn).
 *
 * Returns: { load: number|null, source: string, cached: boolean, error?: string }
 */
ipcMain.handle('telemetry:refreshGpuLoad', async () => {
  const now = Date.now();
  if (now - _gpuCounterLastRefreshTs < GPU_COUNTER_REFRESH_TTL) {
    verboseLog('[telemetry:refreshGpuLoad] within TTL — returning cached load=' + gpuPollCache.load);
    return { load: gpuPollCache.load, source: gpuPollCache.source, cached: true };
  }
  _gpuCounterLastRefreshTs = now;
  try {
    const load = await getGpuPerfCounterLoad();
    if (load != null) {
      gpuPollCache = { ...gpuPollCache, load, source: 'perf-counter' };
      verboseLog('[telemetry:refreshGpuLoad] perf counter read: load=' + load + '%');
    }
    return { load: gpuPollCache.load, source: gpuPollCache.source, cached: false };
  } catch (e) {
    console.error('[telemetry:refreshGpuLoad] error:', e.message);
    return { load: gpuPollCache.load, source: gpuPollCache.source, cached: false, error: e.message };
  }
});

ipcMain.handle('telemetry:getDisk', async (event, selectedDiskMount) => {
  try {
    // Prefer the cached fsData from the polling loop — it is already warmed up and reliable.
    // Fresh si.fsSize() calls sometimes return [] on Windows even while the polling loop succeeds.
    let fsData = liveTelemetryCache?.fsData;
    if (!fsData || fsData.length === 0) {
      // Cache not ready yet — fall back to a direct call
      fsData = await si.fsSize().catch(() => []);
    }

    // Use cached disk IO — disksIO() is a differential API; fresh calls return 0 without a baseline.
    // diskIO shape: { readKBps, writeKBps, activeTimePct, available, source }
    // rIO_sec / wIO_sec do NOT exist on this object — the cache stores computed KB/s already.
    const cachedIO = liveTelemetryCache?.diskIO || { readKBps: null, writeKBps: null, activeTimePct: null, available: false, source: 'none' };

    const allDisks = (fsData || []).map(d => ({
      fs: d.fs,
      type: d.type,
      size: d.size,
      used: d.used,
      available: d.available,
      use: d.use,
      mount: d.mount
    }));

    let selected = null;
    if (selectedDiskMount) {
      selected = allDisks.find(d => d.mount === selectedDiskMount) || null;
    }
    if (!selected) {
      selected = allDisks.find(d => d.mount === 'C:' || d.mount === '/') || allDisks[0] || null;
    }

    verboseLog(`[telemetry:getDisk] requested=${selectedDiskMount} resolved=${selected?.mount} use=${selected?.use}% disks=${allDisks.length} available=${cachedIO.available} source=${cachedIO.source}`);
    return {
      disks: allDisks,
      selected,
      // rIO = read KB/s (NOT cumulative sectors — already a rate from pollTelemetry)
      // wIO = write KB/s
      // tIO = active time percent
      io: {
        rIO:       cachedIO.available ? cachedIO.readKBps      : null,
        wIO:       cachedIO.available ? cachedIO.writeKBps     : null,
        tIO:       cachedIO.available ? cachedIO.activeTimePct : null,
        available: !!cachedIO.available,
        source:    cachedIO.source || 'none',
      },
    };
  } catch (e) {
    console.error('[telemetry:getDisk] error:', e.message);
    return { disks: [], selected: null, io: { rIO: null, wIO: null, tIO: null, available: false, source: 'unavailable' } };
  }
});

// Tweak handlers
ipcMain.handle('tweak:execute', async (event, tweakId, action, options = {}) => {
  if (typeof tweakId !== 'string' || typeof action !== 'string') {
    return { error: true, message: 'Invalid parameters' };
  }
  const validActions = ['apply', 'revert'];
  if (!validActions.includes(action)) {
    return { error: true, message: 'Invalid action. Use apply or revert.' };
  }

  // AudioGuard: block audio-affecting tweaks in bulk mode when devices are present
  if (action === 'apply' && options?.context === 'bulk') {
    const ag = await tweakExecutor.audioGuardCheck(tweakId, 'bulk');
    if (ag && !ag.ok) {
      console.warn(`[tweak:execute] AudioGuard blocked ${tweakId}: ${ag.reason}`);
      return {
        success: false, skipped: true, failureType: 'blocked_by_guard',
        userMessage: 'Blocked by AudioGuard',
        hint: ag.reason,
        message: null, error: ag.reason, verified: false, requiresReboot: false, requiresAdmin: false, commandsRun: [],
      };
    }
  }

  // Per-tweakId single-flight: prevents the same tweak running apply+revert concurrently
  // if a component remounts while a previous execute is still in flight on the main side.
  const _token = psLimiter.tryAcquire({
    file: 'main.js', fn: `tweak:execute:${tweakId}`, reason: `tweak-${action}`,
  });
  if (!_token) {
    console.log(`[tweak:execute] SKIPPED — ${tweakId} already executing (action=${action})`);
    return {
      success: false, skipped: true, failureType: 'unknown',
      userMessage: 'Tweak Busy',
      hint: 'Another operation on this tweak is already in progress. Please wait.',
      message: null, error: null, verified: false, requiresReboot: false, requiresAdmin: false, commandsRun: [],
    };
  }
  console.log(`[PS-Exec] start file=main.js fn=tweak:execute:${tweakId} reason=tweak-${action}`);

  // NetworkGuard: capture baseline ping before applying network-affecting tweaks
  let networkBaseline = null;
  if (action === 'apply') {
    const ng = await tweakExecutor.networkGuardPre(tweakId);
    if (ng) networkBaseline = ng.baselineMs ?? null;
  }

  try {
    const result = await tweakExecutor.executeTweakWithOwnership(tweakId, action);

    // NetworkGuard: post-check and auto-rollback on ping regression
    if (action === 'apply' && result.success) {
      const ngPost = await tweakExecutor.networkGuardPost(tweakId, networkBaseline);
      if (ngPost && !ngPost.ok && ngPost.rollbackRequired) {
        console.warn(`[tweak:execute] NetworkGuard triggering auto-rollback for ${tweakId}: ${ngPost.reason}`);
        const rollbackResult = await tweakExecutor.executeTweakWithOwnership(tweakId, 'revert');
        console.log(`[TweakRollback] ${tweakId} auto-rollback result: success=${rollbackResult.success}`);
        return {
          ...result,
          success: false,
          failureType: 'rollback_triggered',
          userMessage: 'NetworkGuard — Tweak auto-rolled back',
          hint: `${ngPost.reason} The tweak was automatically reverted.`,
          rollbackTriggered: true,
          networkGuard: { baselineMs: ngPost.baselineMs, postMs: ngPost.postMs, deltaMs: ngPost.deltaMs, pctIncrease: ngPost.pctIncrease },
        };
      }
    }

    return result;
  } finally {
    psLimiter.release(_token);
  }
});

ipcMain.handle('tweak:checkStatus', async (event, tweakId) => {
  if (typeof tweakId !== 'string') {
    return { error: true, message: 'Invalid tweakId' };
  }
  const _token = psLimiter.tryAcquire({ file: 'main.js', fn: `tweak:checkStatus:${tweakId}`, reason: 'tweak-check-status' });
  if (!_token) {
    console.log(`[tweak:checkStatus] SKIPPED — ${tweakId} check already in flight`);
    return { tweakId, isApplied: null, applied: null, skipped: true };
  }
  try {
    return await tweakExecutor.checkTweakStatus(tweakId);
  } finally {
    psLimiter.release(_token);
  }
});

ipcMain.handle('tweak:syncAll', async () => {
  const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'tweak:syncAll', reason: 'tweak-sync-all' });
  if (!_token) {
    const skipped = psLimiter.skippedResult({ file: 'main.js', fn: 'tweak:syncAll', reason: 'tweak-sync-all' });
    console.log('[tweak:syncAll] returning explicit skipped result — sync already in progress');
    return skipped; // caller checks result.skipped === true and uses cached state
  }
  const t0 = Date.now();
  console.log(`[PS-Exec] start file=main.js fn=tweak:syncAll reason=tweak-sync-all — ${Object.keys(tweakExecutor.ALL_TWEAKS).length} checks`);
  try {
    const allTweakIds = Object.keys(tweakExecutor.ALL_TWEAKS);
    const results = {};
    for (const tweakId of allTweakIds) {
      results[tweakId] = await tweakExecutor.checkTweakStatus(tweakId);
    }
    console.log(`[PS-Exec] done file=main.js fn=tweak:syncAll ms=${Date.now() - t0}`);
    return results;
  } finally {
    psLimiter.release(_token);
  }
});

// Batch check — reads ALL tweak states in a single PowerShell invocation.
// Called once at app startup (non-blocking) to reconcile the Zustand store
// against real Windows state after an AppData wipe or first launch.
ipcMain.handle('tweak:batchCheckAll', async () => {
  const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'tweak:batchCheckAll', reason: 'tweak-batch-check' });
  if (!_token) {
    console.log('[tweak:batchCheckAll] skipped — PS limiter full, will retry on TweaksList mount');
    return null; // caller treats null as "skip reconciliation"
  }
  try {
    return await tweakExecutor.batchCheckAllTweaks();
  } finally {
    psLimiter.release(_token);
  }
});

ipcMain.handle('tweak:getLog', () => {
  return tweakExecutor.getExecutionLog();
});

// Diagnostic: returns the live PS limiter state (active slots, global cap)
// Useful for verifying zero idle PowerShell processes between polls.
ipcMain.handle('psLimiter:getState', () => {
  return psLimiter.getState();
});

// ── Startup Apps ─────────────────────────────────────────────────────────────
// startup:setEnabled is registered in security-helper.js (handles all source types)
// startup:scan — reads registry Run keys, StartupApproved state, startup folders,
// and Task Scheduler logon/boot tasks. Returns only entries that actually exist.
ipcMain.handle('startup:scan', async () => {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Windows only', entries: [] };
  }

  const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'startup:scan', reason: 'startup-scan' });
  if (!_token) {
    if (isDebug) verboseLog('[startup:scan] SKIPPED — scan already in flight');
    return { ok: false, error: 'Scan already running', entries: [] };
  }

  const PS_SCAN = `
$entries=[System.Collections.Generic.List[hashtable]]::new();$errs=@()
function EP($c){if(!$c){return $null};$c=$c.Trim();if($c -match '^"([^"]+)"'){return $Matches[1]};if($c -match '^([^\\s]+\\.[eE][xX][eE])'){return $Matches[1]};if($c -match '^([^\\s]+)'){return $Matches[1]};return $null}
function TE($p){try{$p -and (Test-Path $p -PathType Leaf -EA SilentlyContinue)}catch{$false}}
function GP($p){try{if(!$p -or !(Test-Path $p -EA SilentlyContinue)){return $null};$v=[Diagnostics.FileVersionInfo]::GetVersionInfo($p);if($v.CompanyName){return $v.CompanyName.Trim()}}catch{};return $null}
function GA($rp){$m=@{};try{$k=Get-Item $rp -EA SilentlyContinue;if($k){foreach($n in $k.GetValueNames()){try{$b=$k.GetValue($n,$null,'DoNotExpandEnvironmentNames');$m[$n]=($b -is [byte[]] -and $b.Length -gt 0 -and $b[0] -eq 2)}catch{}}}}catch{};return $m}
function MID($s){[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s)) -replace '[^A-Za-z0-9]',''}
function RRK($src,$rp,$ap){$ap2=GA $ap;try{$k=Get-Item $rp -EA SilentlyContinue;if(!$k){return};foreach($n in $k.GetValueNames()){try{$cmd=$k.GetValue($n,$null,'DoNotExpandEnvironmentNames');if(!$cmd){continue};$exe=EP $cmd;$ex=TE $exe;$pub=if($ex){GP $exe}else{$null};$en=if($ap2.ContainsKey($n)){$ap2[$n]}else{$true};$entries.Add(@{id=(MID "\${src}-$n");name=$n;publisher=$pub;executablePath=$exe;commandLine="$cmd";source=$src;enabled=$en;fileExists=$ex;broken=(!$ex);registryName=$n})}catch{}}}catch{$errs+="RunKey \${src}: \${_}"}}
RRK 'registry-hkcu' 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
RRK 'registry-hklm' 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
function RF($src,$folder){if(!(Test-Path $folder -EA SilentlyContinue)){return};Get-ChildItem $folder -Filter '*.lnk' -EA SilentlyContinue|ForEach-Object{try{$sh=New-Object -ComObject WScript.Shell;$lnk=$sh.CreateShortcut($_.FullName);$exe=$lnk.TargetPath;$a2=$lnk.Arguments;$cmd=if($a2){"$([char]34)$exe$([char]34) $a2"}else{$exe};$ex=TE $exe;$pub=if($ex){GP $exe}else{$null};$n=$_.BaseName;$entries.Add(@{id=(MID "$src-$n");name=$n;publisher=$pub;executablePath=$exe;commandLine=$cmd;source=$src;enabled=$true;fileExists=$ex;broken=(!$ex);folderPath=$_.FullName})}catch{}}}
RF 'startup-folder-user' ([Environment]::GetFolderPath('Startup'))
RF 'startup-folder-common' ([Environment]::GetFolderPath('CommonStartup'))
try{Get-ScheduledTask -EA SilentlyContinue|ForEach-Object{$t=$_;$ht=$t.Triggers|Where-Object{$_.CimClass.CimClassName -match 'Logon|Boot'};if(!$ht){return};$a=$t.Actions|Select-Object -First 1;if(!$a -or !$a.Execute){return};$exe=$a.Execute;$cmd=if($a.Arguments){"$([char]34)$exe$([char]34) $($a.Arguments)"}else{$exe};$ex=TE $exe;$pub=if($ex){GP $exe}else{$null};$tf="$($t.TaskPath)$($t.TaskName)";$entries.Add(@{id=(MID "task-$tf");name=$t.TaskName;publisher=$pub;executablePath=$exe;commandLine=$cmd;source='task-scheduler';enabled=($t.State -ne 'Disabled');fileExists=$ex;broken=(!$ex);taskPath=$tf})}}catch{$errs+="TaskSched: $_"}
[ordered]@{entries=$entries;errors=$errs}|ConvertTo-Json -Depth 4 -Compress
`.trim();

  return new Promise((resolve) => {
    execFile('powershell', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass', '-Command', PS_SCAN,
    ], { windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
      psLimiter.release(_token);
      if (err) {
        if (isDebug) console.error('[startup:scan] powershell error:', err.message, stderr?.slice(0, 300));
        return resolve({ ok: false, error: err.message, entries: [] });
      }
      try {
        const raw = JSON.parse(stdout.trim());
        // Sanitize every entry — PowerShell can return raw FileInfo/CimInstance
        // objects as field values (e.g. publisher, executablePath) which would
        // crash React when rendered. Enforce primitive types on all fields.
        const toStr = (v) => (typeof v === 'string' ? v : v == null ? null : null);
        const sanitize = (e) => {
          if (!e || typeof e !== 'object') return null;
          return {
            id:             typeof e.id === 'string'             ? e.id             : String(e.id ?? ''),
            name:           typeof e.name === 'string'           ? e.name           : String(e.name ?? ''),
            publisher:      toStr(e.publisher),
            executablePath: toStr(e.executablePath),
            commandLine:    typeof e.commandLine === 'string'    ? e.commandLine    : String(e.commandLine ?? ''),
            source:         typeof e.source === 'string'         ? e.source         : String(e.source ?? ''),
            enabled:        Boolean(e.enabled),
            fileExists:     Boolean(e.fileExists),
            broken:         Boolean(e.broken),
            ...(e.registryName != null ? { registryName: typeof e.registryName === 'string' ? e.registryName : null } : {}),
            ...(e.taskPath    != null ? { taskPath:    typeof e.taskPath    === 'string' ? e.taskPath    : null } : {}),
            ...(e.folderPath  != null ? { folderPath:  typeof e.folderPath  === 'string' ? e.folderPath  : null } : {}),
          };
        };
        const entries = Array.isArray(raw.entries)
          ? raw.entries.map(sanitize).filter(Boolean)
          : [];
        if (raw.errors && raw.errors.length > 0) {
          if (isDebug) console.warn('[startup:scan] partial errors:', raw.errors);
        }
        resolve({ ok: true, entries });
      } catch (parseErr) {
        if (isDebug) console.error('[startup:scan] JSON parse error:', parseErr.message, stdout?.slice(0, 300));
        resolve({ ok: false, error: 'JSON parse failed', entries: [] });
      }
    });
  });
});

ipcMain.handle('tweak:getLocalState', () => {
  return tweakExecutor.getLocalState();
});

ipcMain.handle('tweak:getInfo', () => {
  return tweakExecutor.getTweakInfo();
});

// Slider tweak IPC handlers
// P2-S1: each mutating slider call acquires a psLimiter slot so rapid UI
// interactions can never spawn overlapping PowerShell registry writes.
ipcMain.handle('tweak:readValue', async (event, tweakId) => {
  if (typeof tweakId !== 'string') return { value: null, error: 'Invalid tweakId' };
  const token = psLimiter.tryAcquire({ file: 'main.js', fn: 'slider:readValue', reason: 'slider-read' });
  if (!token) return { value: null, error: 'busy' };
  try { return await sliderTweakExecutor.readSliderValue(tweakId); } finally { psLimiter.release(token); }
});

ipcMain.handle('tweak:applyValue', async (event, tweakId, value) => {
  if (typeof tweakId !== 'string') return { ok: false, error: 'Invalid tweakId' };
  if (value === undefined || value === null) return { ok: false, error: 'Value required' };
  const token = psLimiter.tryAcquire({ file: 'main.js', fn: 'slider:applyValue', reason: 'slider-apply' });
  if (!token) return { ok: false, error: 'Another tweak is being applied — please wait a moment.' };
  try { return await sliderTweakExecutor.applySliderValue(tweakId, value); } finally { psLimiter.release(token); }
});

ipcMain.handle('tweak:verifyValue', async (event, tweakId, expectedValue) => {
  if (typeof tweakId !== 'string') return { ok: false, error: 'Invalid tweakId' };
  const token = psLimiter.tryAcquire({ file: 'main.js', fn: 'slider:verifyValue', reason: 'slider-verify' });
  if (!token) return { ok: false, error: 'busy' };
  try { return await sliderTweakExecutor.verifySliderValue(tweakId, expectedValue); } finally { psLimiter.release(token); }
});

ipcMain.handle('tweak:resetValue', async (event, tweakId) => {
  if (typeof tweakId !== 'string') return { ok: false, error: 'Invalid tweakId' };
  const token = psLimiter.tryAcquire({ file: 'main.js', fn: 'slider:resetValue', reason: 'slider-reset' });
  if (!token) return { ok: false, error: 'busy' };
  try { return await sliderTweakExecutor.resetSliderValue(tweakId); } finally { psLimiter.release(token); }
});

ipcMain.handle('tweak:getSliderMeta', (event, tweakId) => {
  if (typeof tweakId !== 'string') return null;
  return sliderTweakExecutor.getSliderTweakMeta(tweakId);
});

ipcMain.handle('tweak:checkCrashSentinel', () => {
  return sliderTweakExecutor.checkCrashSentinel();
});

ipcMain.handle('tweak:getDisabledSliders', () => {
  return sliderTweakExecutor.DISABLED_SLIDER_TWEAKS;
});

// ── Extreme Labs IPC handlers ─────────────────────────────────────────────────────

const extremeLabsStore = {
  sessions: [],
  currentSession: null,
  lastRestorePoint: null,
  lastBaseline: null,
};

function _extremeLabsValidateTweakIds(ids) {
  if (!Array.isArray(ids)) return { ok: false, error: 'ids must be an array' };
  const validIds = new Set([
    'global-timer-resolution', 'dynamic-tick', 'hpet-disable',
    'win32-priority-separation', 'system-responsiveness', 'mmcss-no-lazy', 'power-throttling-extreme',
    'disable-game-dvr', 'disable-xbox-capture', 'windowed-games-opt',
    'network-throttling-index', 'tcp-no-delay', 'rss-enable',
    'interrupt-moderation', 'eee-disable', 'flow-control',
    'windows-search-disable', 'sysmain-disable', 'print-spooler-disable',
    'xbox-services-disable', 'bluetooth-disable',
    'edge-update-disable', 'adobe-updater-disable', 'teams-startup-disable', 'vendor-updaters-disable',
  ]);
  for (const id of ids) {
    if (typeof id !== 'string' || !validIds.has(id)) {
      return { ok: false, error: `Invalid tweak id: ${id}` };
    }
  }
  return { ok: true };
}

// Maps extreme tweak id to existing registry/slider tweak executor
function _extremeLabsMapToRegistryTweak(id) {
  const map = {
    'global-timer-resolution': { type: 'tweak', tweakId: 'timer-res' },
    'dynamic-tick': { type: 'tweak', tweakId: 'synth-timers' },
    'hpet-disable': { type: 'tweak', tweakId: 'hpet-disable' },
    'power-throttling-extreme': { type: 'tweak', tweakId: 'power-throttling' },
    'disable-game-dvr': { type: 'tweak', tweakId: 'disable-game-dvr' },
    'disable-xbox-capture': { type: 'tweak', tweakId: 'disable-game-dvr' }, // same underlying
    'windowed-games-opt': { type: 'tweak', tweakId: 'optimize-windowed-games' },
    'win32-priority-separation': { type: 'slider', tweakId: 'win32-priority-sep', recommendedValue: 26 },
    'system-responsiveness': { type: 'slider', tweakId: 'sys-responsiveness', recommendedValue: 10 },
    'mmcss-no-lazy': { type: 'tweak', tweakId: 'mmcss-nolazymode' },
    'network-throttling-index': { type: 'slider', tweakId: 'net-throttle-index', recommendedValue: 4294967295 },
    'tcp-no-delay': { type: 'tweak', tweakId: 'tcp-no-delay' },
    'rss-enable': { type: 'nic', propertyKey: 'RSS', enabledValue: '1' },
    'interrupt-moderation': { type: 'nic', propertyKey: 'InterruptModeration', enabledValue: '0' },
    'eee-disable': { type: 'nic', propertyKey: 'EEE', enabledValue: '0' },
    'flow-control': { type: 'nic', propertyKey: 'FlowControl', enabledValue: '0' },
    'windows-search-disable': { type: 'tweak', tweakId: 'win-search-index' },
    'sysmain-disable': { type: 'tweak', tweakId: 'superfetch' },
    'print-spooler-disable': { type: 'tweak', tweakId: 'fax-printer' },
    'xbox-services-disable': { type: 'tweak', tweakId: 'xbox-services' },
    'bluetooth-disable': { type: 'tweak', tweakId: 'bluetooth' },
    'edge-update-disable': { type: 'tweak', tweakId: 'edge-update' },
    'adobe-updater-disable': { type: 'tweak', tweakId: 'adobe-updater' },
    'teams-startup-disable': { type: 'tweak', tweakId: 'teams-startup' },
    'vendor-updaters-disable': { type: 'tweak', tweakId: 'vendor-updaters' },
  };
  return map[id] || null;
}

ipcMain.handle('extremeLabs:createRestorePoint', async () => {
  try {
    const now = Date.now();
    extremeLabsStore.lastRestorePoint = now;
    return { ok: true, timestamp: now };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('extremeLabs:createBaseline', async () => {
  try {
    const baseline = { timestamp: Date.now(), snapshot: 'baseline-captured' };
    extremeLabsStore.lastBaseline = baseline;
    return { ok: true, baseline };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('extremeLabs:analyze', async () => {
  try {
    // Simulated latency analysis — returns categories with tweak recommendations
    return {
      ok: true,
      categories: [
        { name: 'Latency Core', score: 72, recommendation: 'Consider timer resolution and dynamic tick' },
        { name: 'Scheduler / CPU', score: 65, recommendation: 'Priority separation may help' },
        { name: 'Gaming / Capture', score: 45, recommendation: 'Game DVR is active — disabling may help' },
        { name: 'Network Latency', score: 58, recommendation: 'Network throttling is moderate' },
        { name: 'Service Weight', score: 80, recommendation: 'Services are light' },
        { name: 'Startup / Vendor Weight', score: 55, recommendation: 'Several updaters active at boot' },
      ],
      overallScore: 62,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('extremeLabs:applySelected', async (event, ids) => {
  const validation = _extremeLabsValidateTweakIds(ids);
  if (!validation.ok) return validation;

  const results = [];
  let appliedCount = 0, failedCount = 0, adminBlockedCount = 0, notSupportedCount = 0;

  for (const id of ids) {
    const mapped = _extremeLabsMapToRegistryTweak(id);
    if (!mapped) {
      console.log('[ExtremeLabsApply]', JSON.stringify({ id, applied: false, reason: 'missingTweak', registryLookupFailed: true }));
      results.push({ id, applied: false, reason: 'No registry mapping for this tweak' });
      failedCount++;
      continue;
    }

    // Check if mapped tweak is known-unsupported before attempting execution
    if (mapped.type === 'tweak' && tweakExecutor.isUnsupported && tweakExecutor.isUnsupported(mapped.tweakId)) {
      const unsupportedReason = tweakExecutor.getUnsupportedReason ? tweakExecutor.getUnsupportedReason(mapped.tweakId) : 'Not supported in this build';
      console.log('[ExtremeLabsApply]', JSON.stringify({ id, applied: false, notSupported: true, tweakId: mapped.tweakId, reason: unsupportedReason }));
      results.push({ id, applied: false, notSupported: true, reason: unsupportedReason });
      notSupportedCount++;
      continue;
    }

    try {
      if (mapped.type === 'slider') {
        const meta = sliderTweakExecutor.getSliderTweakMeta(mapped.tweakId);
        const recommendedValue = mapped.recommendedValue != null ? mapped.recommendedValue : (meta && meta.recommendedValue);
        if (recommendedValue != null) {
          const applyResult = await sliderTweakExecutor.applySliderValue(mapped.tweakId, recommendedValue);
          const ok = applyResult.ok;
          if (ok) appliedCount++; else failedCount++;
          console.log('[ExtremeLabsApply]', JSON.stringify({ id, applied: ok, tweakId: mapped.tweakId, type: 'slider', error: applyResult.error }));
          results.push({ id, applied: ok, verify: applyResult.verifyResult, error: applyResult.error });
        } else {
          console.log('[ExtremeLabsApply]', JSON.stringify({ id, applied: false, tweakId: mapped.tweakId, reason: 'noRecommendedValue' }));
          results.push({ id, applied: false, reason: 'No recommended value available' });
          failedCount++;
        }
      } else if (mapped.type === 'nic') {
        const { adapters = [] } = await nicExecutor.getNetAdapters();
        const physical = adapters.find(a => a.status === 'Up' && !/loopback|bluetooth|hyper|virtual|tunnel|vpn/i.test(a.name));
        if (!physical) {
          console.log('[ExtremeLabsApply]', JSON.stringify({ id, applied: false, type: 'nic', reason: 'noAdapterFound' }));
          results.push({ id, applied: false, reason: 'No suitable network adapter found' });
          failedCount++;
          continue;
        }
        const setResult = await nicExecutor.setNicProperty(physical.name, mapped.propertyKey, mapped.enabledValue);
        const ok = setResult.ok && setResult.outcome === 'write_succeeded_verified';
        if (ok) appliedCount++; else failedCount++;
        console.log('[ExtremeLabsApply]', JSON.stringify({ id, applied: ok, type: 'nic', adapter: physical.name, outcome: setResult.outcome }));
        results.push({ id, applied: ok, result: setResult });
      } else {
        const execResult = await tweakExecutor.executeTweak(mapped.tweakId, 'apply');
        const ok = execResult.success;
        // Detect admin elevation failure
        const adminRequired = !ok && (
          /requires.*admin|access.*denied|elevation|privileged|run as administrator/i.test(execResult.error || '') ||
          execResult.exitCode === 5
        );
        if (adminRequired) {
          adminBlockedCount++;
          console.log('[ExtremeLabsApply]', JSON.stringify({ id, applied: false, adminRequired: true, tweakId: mapped.tweakId, error: execResult.error }));
          results.push({ id, applied: false, adminRequired: true, reason: 'Administrator access required for this optimization. Run the app as Administrator.' });
        } else {
          if (ok) appliedCount++; else failedCount++;
          console.log('[ExtremeLabsApply]', JSON.stringify({ id, applied: ok, tweakId: mapped.tweakId, type: 'tweak', error: execResult.error }));
          results.push({ id, applied: ok, result: execResult });
        }
      }
    } catch (e) {
      failedCount++;
      console.log('[ExtremeLabsApply]', JSON.stringify({ id, applied: false, error: e.message }));
      results.push({ id, applied: false, error: e.message });
    }
  }

  console.log('[ExtremeLabsApply]', JSON.stringify({
    requested: ids.length,
    applied: appliedCount,
    failed: failedCount,
    adminBlocked: adminBlockedCount,
    notSupported: notSupportedCount,
  }));

  return { ok: true, results, summary: { applied: appliedCount, failed: failedCount, adminBlocked: adminBlockedCount, notSupported: notSupportedCount } };
});

ipcMain.handle('extremeLabs:restoreBaseline', async () => {
  try {
    const results = [];
    const allIds = [
      'global-timer-resolution', 'dynamic-tick', 'hpet-disable',
      'win32-priority-separation', 'system-responsiveness', 'mmcss-no-lazy', 'power-throttling-extreme',
      'disable-game-dvr', 'disable-xbox-capture', 'windowed-games-opt',
      'network-throttling-index', 'tcp-no-delay', 'rss-enable',
      'interrupt-moderation', 'eee-disable', 'flow-control',
      'windows-search-disable', 'sysmain-disable', 'print-spooler-disable',
      'xbox-services-disable', 'bluetooth-disable',
      'edge-update-disable', 'adobe-updater-disable', 'teams-startup-disable', 'vendor-updaters-disable',
    ];
    for (const id of allIds) {
      try {
        const mapped = _extremeLabsMapToRegistryTweak(id);
        if (!mapped) { results.push({ id, reverted: false, reason: 'No mapping' }); continue; }
        if (mapped.type === 'slider') {
          const resetResult = await sliderTweakExecutor.resetSliderValue(mapped.tweakId);
          results.push({ id, reverted: resetResult.success, error: resetResult.error });
        } else if (mapped.type === 'nic') {
          const { adapters = [] } = await nicExecutor.getNetAdapters();
          const physical = adapters.find(a => a.status === 'Up' && !/loopback|bluetooth|hyper|virtual|tunnel|vpn/i.test(a.name));
          if (!physical) { results.push({ id, reverted: false, reason: 'No adapter' }); continue; }
          const resetResult = await nicExecutor.resetNicProperty(physical.name, mapped.propertyKey);
          results.push({ id, reverted: resetResult.ok, error: resetResult.error });
        } else {
          const execResult = await tweakExecutor.executeTweak(mapped.tweakId, 'revert');
          results.push({ id, reverted: execResult.success, error: execResult.error });
        }
      } catch (e) {
        results.push({ id, reverted: false, error: e.message });
      }
    }
    extremeLabsStore.currentSession = null;
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('extremeLabs:getStatus', async () => {
  return {
    ok: true,
    hasRestorePoint: !!extremeLabsStore.lastRestorePoint,
    hasBaseline: !!extremeLabsStore.lastBaseline,
    sessionActive: !!extremeLabsStore.currentSession,
    lastRestoreTimestamp: extremeLabsStore.lastRestorePoint,
  };
});

// NIC tuning IPC handlers
ipcMain.handle('nic:getAdapters', async () => {
  return await nicExecutor.getNetAdapters();
});

ipcMain.handle('nic:getCapabilities', async (event, adapterName) => {
  if (typeof adapterName !== 'string' || !adapterName.trim()) {
    return { capabilities: {}, error: 'adapterName required' };
  }
  return await nicExecutor.getAdapterCapabilities(adapterName);
});

ipcMain.handle('nic:invalidateCache', async (event, adapterName) => {
  // adapterName === null → flush all; string → flush specific adapter
  nicExecutor.invalidateCapabilityCache(typeof adapterName === 'string' ? adapterName : null);
  return { ok: true };
});

ipcMain.handle('nic:readProperty', async (event, adapterName, propertyKey) => {
  if (typeof adapterName !== 'string' || typeof propertyKey !== 'string') {
    return { value: null, supported: false, error: 'adapterName and propertyKey required' };
  }
  return await nicExecutor.readNicProperty(adapterName, propertyKey);
});

ipcMain.handle('nic:setProperty', async (event, adapterName, propertyKey, value) => {
  if (typeof adapterName !== 'string' || typeof propertyKey !== 'string') {
    return { ok: false, error: 'adapterName and propertyKey required' };
  }
  if (value === undefined || value === null) {
    return { ok: false, error: 'value required' };
  }
  return await nicExecutor.setNicPropertyWithOwnership(adapterName, propertyKey, value);
});

ipcMain.handle('nic:resetProperty', async (event, adapterName, propertyKey) => {
  if (typeof adapterName !== 'string' || typeof propertyKey !== 'string') {
    return { ok: false, error: 'adapterName and propertyKey required' };
  }
  return await nicExecutor.resetNicProperty(adapterName, propertyKey);
});

ipcMain.handle('nic:getPropertyMeta', () => {
  return nicExecutor.getNicPropertyMeta();
});

// Power Plan handlers
ipcMain.handle('powerPlans:getState', async () => {
  verboseLog('[IPC] powerPlans:getState');
  try {
    return await powerPlanManager.getPowerPlanState();
  } catch (e) {
    console.error('[IPC] powerPlans:getState error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('powerPlans:applyProfile', async (event, profileId) => {
  verboseLog(`[IPC] powerPlans:applyProfile: ${profileId}`);
  if (typeof profileId !== 'string') return { success: false, error: 'Invalid profileId' };
  const valid = Object.keys(powerPlanManager.POWER_PROFILES);
  if (!valid.includes(profileId)) return { success: false, error: `Unknown profileId "${profileId}". Valid: ${valid.join(', ')}` };
  try {
    return await powerPlanManager.applyPowerProfileWithOwnership(profileId);
  } catch (e) {
    console.error('[IPC] powerPlans:applyProfile error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('powerPlans:listSchemes', async () => {
  verboseLog('[IPC] powerPlans:listSchemes');
  try {
    return await powerPlanManager.listSchemesForFrontend();
  } catch (e) {
    return { success: false, error: e.message, schemes: [] };
  }
});

ipcMain.handle('powerPlans:applyCustom', async (event, name, settings) => {
  verboseLog(`[IPC] powerPlans:applyCustom name="${name}"`);
  if (typeof name !== 'string') return { success: false, error: 'Invalid plan name' };
  if (!settings || typeof settings !== 'object') return { success: false, error: 'Invalid settings object' };
  try {
    return await powerPlanManager.applyCustomPowerProfile(name, settings);
  } catch (e) {
    console.error('[IPC] powerPlans:applyCustom error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('powerPlans:getCustomMeta', async () => {
  verboseLog('[IPC] powerPlans:getCustomMeta');
  try {
    return powerPlanManager.getCustomPlanMeta();
  } catch (e) {
    console.error('[IPC] powerPlans:getCustomMeta error:', e.message);
    return null;
  }
});

ipcMain.handle('powerPlans:getStoredSCGuids', () => {
  try {
    const guids = Object.values(powerPlanManager.getStoredSchemeGuids());
    return guids.filter(Boolean).map(g => String(g).toLowerCase());
  } catch {
    return [];
  }
});

ipcMain.handle('powerPlans:activateByGuid', async (event, guid) => {
  verboseLog(`[IPC] powerPlans:activateByGuid: ${guid}`);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof guid !== 'string' || !UUID_RE.test(guid.trim())) {
    return { success: false, error: 'Invalid GUID' };
  }
  try {
    // Route through activatePlanByGuid which handles admin/non-admin elevation,
    // the restoredefaultschemes fallback for the Balanced GUID, and GUID verification.
    const result = await powerPlanManager.activatePlanByGuid(guid.trim());
    if (result.ok) {
      verboseLog(`[IPC] powerPlans:activateByGuid success — active="${result.activeScheme?.guid}"`);
      return { success: true, activeScheme: result.activeScheme, alreadyActive: result.alreadyActive || false };
    }
    console.error('[IPC] powerPlans:activateByGuid failed:', result.error);
    return { success: false, error: result.error };
  } catch (e) {
    console.error('[IPC] powerPlans:activateByGuid error:', e.message);
    return { success: false, error: e.message };
  }
});

// ── App Booster: per-game system actions ──────────────────────────────────────

ipcMain.handle('appBooster:scanGames', async (event, games) => {
  verboseLog('[AppBooster] scanGames start —', games?.length, 'games');
  const fs   = require('fs').promises;
  const path = require('path');
  const os   = require('os');

  // ── 1. Build dynamic Steam library roots from libraryfolders.vdf ──────────
  const steamCommonPaths = [];
  const steamRootCandidates = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam', 'D:\\SteamLibrary', 'D:\\Games\\Steam',
    'E:\\Steam', 'E:\\SteamLibrary', 'E:\\Games\\Steam',
    'F:\\Steam', 'F:\\SteamLibrary',
  ];
  for (const steamRoot of steamRootCandidates) {
    const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
    try {
      await fs.access(vdfPath);
      const vdf = await fs.readFile(vdfPath, 'utf8');
      for (const m of [...vdf.matchAll(/"path"\s+"([^"]+)"/g)]) {
        const lib = m[1].replace(/\\\\/g, '\\');
        const common = path.join(lib, 'steamapps', 'common');
        if (!steamCommonPaths.includes(common)) steamCommonPaths.push(common);
      }
      const def = path.join(steamRoot, 'steamapps', 'common');
      if (!steamCommonPaths.includes(def)) steamCommonPaths.push(def);
    } catch { /* vdf not found or unreadable */ }
  }
  verboseLog('[AppBooster] Steam library paths found:', steamCommonPaths.length);

  // ── 2. Epic Games Launcher manifests → map exe basename → install dir ──────
  // Manifests live in %ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item
  const epicInstalls = {}; // exeBasename.toLowerCase() → installLocation
  const epicManifestDirs = [
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'),
  ];
  for (const manifestDir of epicManifestDirs) {
    let items;
    try {
      items = (await fs.readdir(manifestDir)).filter(f => f.endsWith('.item'));
    } catch { continue; }
    for (const itemFile of items) {
      try {
        const raw = await fs.readFile(path.join(manifestDir, itemFile), 'utf8');
        const manifest = JSON.parse(raw);

        // DLC filter: skip items that carry a MainGameCatalogItemId that differs
        // from their own CatalogItemId (primary DLC signal).
        if (
          manifest.MainGameCatalogItemId &&
          manifest.CatalogItemId !== manifest.MainGameCatalogItemId
        ) continue;

        // Secondary DLC filter: if AppCategories is present and contains no
        // "games" entry, this is likely DLC/addon content — skip it.
        const cats = manifest.AppCategories ?? [];
        if (cats.length > 0 && !cats.some(c => c.toLowerCase().includes('games'))) {
          continue;
        }

        const installLoc  = manifest.InstallLocation;
        const launchExe   = manifest.LaunchExecutable;
        if (installLoc && launchExe) {
          const exeBasename = path.basename(launchExe).toLowerCase();
          const exeDir      = path.join(installLoc, path.dirname(launchExe));
          epicInstalls[exeBasename] = exeDir;
          console.log(`[AppBooster] Epic manifest: ${exeBasename} → ${exeDir}`);
        }
      } catch (parseErr) {
        console.warn('[EpicDetector] Failed to parse manifest:', itemFile, parseErr?.message);
      }
    }
  }

  // ── 3. Xbox / Game Pass install roots ─────────────────────────────────────
  const xboxRoots = [];
  const drives = ['C', 'D', 'E', 'F', 'G'];
  for (const d of drives) {
    const p = `${d}:\\XboxGames`;
    try { await fs.access(p); xboxRoots.push(p); } catch { /* not found */ }
  }
  // Also check user-configured Xbox install dirs from registry (best-effort)
  try {
    const { execFile } = require('child_process');
    const out = await new Promise((resolve, reject) => {
      execFile(
        'reg',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\GamingServices', '/v', 'GamingRootPath', '/reg:64'],
        { timeout: 3000, encoding: 'utf8', windowsHide: true },
        (err, stdout) => { if (err) reject(err); else resolve(stdout); }
      );
    });
    const m = out.match(/GamingRootPath\s+REG_SZ\s+(.+)/i);
    if (m) {
      const p = m[1].trim();
      if (p && !xboxRoots.includes(p)) xboxRoots.push(p);
    }
  } catch { /* registry key may not exist */ }
  if (isDebug) verboseLog('[AppBooster] Xbox roots found:', xboxRoots.length, xboxRoots);

  // ── helper: find exe inside a root directory (up to 3 levels deep) ─────────
  async function findExeIn(rootDir, exeName, maxDepth = 3) {
    if (maxDepth < 0) return null;
    let entries;
    try { entries = await fs.readdir(rootDir, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (!entry.isDirectory()) {
        if (entry.name.toLowerCase() === exeName.toLowerCase()) return rootDir;
      } else {
        const found = await findExeIn(fullPath, exeName, maxDepth - 1);
        if (found) return found;
      }
    }
    return null;
  }

  // ── Step E source: build running-process map (exeName.lower → directory) ──
  // This is the most reliable fallback: if the game exe is live in memory we
  // know exactly where it lives, even if manifest / disk scans miss it.
  const runningProcMap = {}; // e.g. "fortniteclient-win64-shipping.exe" → "C:\...\Win64"
  try {
    const { execFile } = require('child_process');
    const psOut = await new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile', '-NonInteractive', '-Command',
          'Get-WmiObject Win32_Process | Where-Object { $_.ExecutablePath } | ForEach-Object { $_.ExecutablePath } | ConvertTo-Json -Compress',
        ],
        { timeout: 6000, encoding: 'utf8', windowsHide: true },
        (err, stdout) => { if (err) reject(err); else resolve(stdout); }
      );
    });
    let paths = [];
    try { paths = JSON.parse(psOut.trim()); } catch { /* single result, not array */ }
    if (typeof paths === 'string') paths = [paths];
    for (const exeFullPath of (Array.isArray(paths) ? paths : [])) {
      if (!exeFullPath) continue;
      const base = path.basename(exeFullPath).toLowerCase();
      if (!runningProcMap[base]) {
        runningProcMap[base] = path.dirname(exeFullPath);
      }
    }
    if (isDebug) console.log(`[AppBooster] Running processes mapped: ${Object.keys(runningProcMap).length} exe(s) found`);
  } catch (e) {
    if (isDebug) console.log('[AppBooster] Running process map failed (non-fatal):', e.message?.slice(0, 120));
  }

  // ── Per-game detection ────────────────────────────────────────────────────
  const results = [];
  for (const g of (games || [])) {
    let detected = false;
    let installPath = null;
    const exeLower = g.executable.toLowerCase();

    // Step A: Epic manifest lookup (exact exe match)
    if (!detected && epicInstalls[exeLower]) {
      const p = epicInstalls[exeLower];
      try {
        await fs.access(path.join(p, g.executable));
        detected = true; installPath = p;
        console.log(`[AppBooster]   ${g.slug}: found via Epic manifest → ${p}`);
      } catch { /* not found */ }
    }

    // Step B: hardcoded knownPaths
    if (!detected) {
      for (const p of (g.knownPaths || [])) {
        try {
          await fs.access(path.join(p, g.executable));
          detected = true; installPath = p; break;
        } catch { /* not found */ }
      }
    }

    // Step C: Xbox roots (recursive, 3 levels)
    if (!detected) {
      for (const xboxRoot of xboxRoots) {
        if (detected) break;
        let xboxDirs;
        try { xboxDirs = await fs.readdir(xboxRoot); } catch { continue; }
        for (const dir of xboxDirs) {
          if (detected) break;
          const found = await findExeIn(path.join(xboxRoot, dir), g.executable, 3);
          if (found) { detected = true; installPath = found; }
        }
      }
    }

    // Step D: Steam common dirs (one level + one deeper)
    if (!detected) {
      for (const commonDir of steamCommonPaths) {
        if (detected) break;
        let gameDirs;
        try { gameDirs = await fs.readdir(commonDir); } catch { continue; }
        for (const dir of gameDirs) {
          if (detected) break;
          const gameDir = path.join(commonDir, dir);
          try {
            await fs.access(path.join(gameDir, g.executable));
            detected = true; installPath = gameDir; break;
          } catch {
            let subDirs;
            try { subDirs = await fs.readdir(gameDir); } catch { continue; }
            for (const sub of subDirs) {
              const subDir = path.join(gameDir, sub);
              try {
                await fs.access(path.join(subDir, g.executable));
                detected = true; installPath = subDir; break;
              } catch { /* not found */ }
            }
          }
        }
      }
    }
    // Step E: running-process fallback — catches games that are live but
    // installed to an unexpected path (e.g. custom drive, non-standard Epic dir)
    if (!detected && runningProcMap[exeLower]) {
      const p = runningProcMap[exeLower];
      detected = true; installPath = p;
      console.log(`[AppBooster]   ${g.slug}: found via running process → ${p}`);
    }

    console.log(`[AppBooster]   ${g.slug}: detected=${detected}${installPath ? ` path=${installPath}` : ''}`);
    results.push({ slug: g.slug, detected, installPath });
  }

  const detectedCount = results.filter(r => r.detected).length;
  console.log(`[AppBooster] scanGames done — ${detectedCount}/${games?.length} detected`);
  return results;
});

ipcMain.handle('appBooster:browseExecutable', async (event, { slug, gameName }) => {
  const { dialog } = require('electron');
  const path = require('path');
  const fs   = require('fs');
  try {
    const result = await dialog.showOpenDialog({
      title: `Locate ${gameName || 'game'} executable`,
      buttonLabel: 'Select',
      filters: [{ name: 'Executables', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const exePath    = result.filePaths[0];
    const installDir = path.dirname(exePath);
    const exeName    = path.basename(exePath);
    console.log(`[AppBooster] browseExecutable: slug=${slug} exe=${exeName} dir=${installDir}`);
    return { canceled: false, exePath, installDir, exeName };
  } catch (e) {
    console.error('[AppBooster] browseExecutable error:', e.message);
    return { canceled: true, error: e.message };
  }
});

// Validate App Booster inputs before interpolating them into PowerShell scripts.
// Any value that fails is rejected — prevents cloud-poisoned paths from injecting commands.
function validateAppBoosterInput(value, label, pattern) {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value !== 'string') throw new Error(`[AppBooster] ${label} must be a string`);
  if (!pattern.test(value)) {
    console.error(`[AppBooster] Rejected dangerous ${label}: ${JSON.stringify(value)}`);
    throw new Error(`[AppBooster] Invalid characters in ${label} — action aborted`);
  }
  return value;
}

// Allow typical Windows path characters (letters, digits, space, backslash, colon, period,
// parentheses, hyphen, underscore). Explicitly excludes " ; ` $ & | ( ) { } < > and newlines.
const WIN_PATH_RE  = /^[A-Za-z0-9 ._\-\\:()\[\]]+$/;
// Executable filename: simple name + extension, no path separators or shell metacharacters.
const EXEC_NAME_RE = /^[A-Za-z0-9 ._\-]+\.(?:exe|bat|cmd)$/i;
// Game name: printable alphanumerics, spaces, apostrophes, hyphens, periods, colons.
const GAME_NAME_RE = /^[A-Za-z0-9 .':\-_&]+$/;

// Escape a value for safe interpolation inside a PowerShell double-quoted string.
// In PS, `"` inside `"..."` must be doubled to `""`.  This is defense-in-depth on top of
// the allowlist validation above — both layers must be defeated for injection to occur.
function escapePsString(s) {
  if (!s) return s;
  return s.replace(/"/g, '""');
}

ipcMain.handle('appBooster:executeAction', async (event, { type, mode, executable, installPath, gameName }) => {
  console.log(`[IPC] appBooster:executeAction type=${type} mode=${mode} exe=${executable}`);

  // ── Phase 1: validate all inputs before touching the limiter ─────────────────
  // Unknown type/mode is caught here so the limiter is never acquired needlessly.
  const VALID_BOOSTER_TYPES = [
    'cpu-priority', 'fso-disable', 'gpu-preference', 'network-qos',
    'manual-high-perf-plan', 'manual-game-mode', 'manual-nagle', 'manual-visual-fx',
  ];
  const VALID_BOOSTER_MODES = ['apply', 'revert', 'check'];
  if (!VALID_BOOSTER_TYPES.includes(type) || !VALID_BOOSTER_MODES.includes(mode)) {
    return { success: false, error: `Unknown action type "${type}" or mode "${mode}"`, verified: false };
  }
  try {
    validateAppBoosterInput(installPath, 'installPath', WIN_PATH_RE);
    validateAppBoosterInput(executable,  'executable',  EXEC_NAME_RE);
    validateAppBoosterInput(gameName,    'gameName',    GAME_NAME_RE);
  } catch (e) {
    return { success: false, error: e.message, verified: false };
  }

  // ── Phase 2: acquire slot — now safe, all early-return paths above hold no token ─
  const _boosterToken = psLimiter.tryAcquire({
    file: 'main.js',
    fn: `appBooster:executeAction:${type}:${(executable || '').replace(/[^a-z0-9]/gi, '_')}`,
    reason: `app-booster-${mode}`,
  });
  if (!_boosterToken) {
    console.log(`[appBooster:executeAction] SKIPPED — ${type}/${executable} already executing`);
    return { success: false, skipped: true, error: 'Action already in progress for this game/type.', verified: false };
  }

  const exePath = installPath ? require('path').join(installPath, executable) : executable;

  // Escape all user-supplied values before interpolation into PowerShell double-quoted strings.
  const safeExe      = escapePsString(executable);
  const safeExePath  = escapePsString(exePath);
  const safeGameName = escapePsString(gameName);

  const scripts = {
    'cpu-priority': {
      apply: `New-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${safeExe}\\PerfOptions" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${safeExe}\\PerfOptions" -Name "CpuPriorityClass" -Value 6 -Type DWord -Force; Write-Output "ok"`,
      revert: `Remove-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${safeExe}\\PerfOptions" -Recurse -Force -EA SilentlyContinue; Write-Output "ok"`,
      check:  `$v = (Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${safeExe}\\PerfOptions" -Name "CpuPriorityClass" -EA SilentlyContinue).CpuPriorityClass; if ($v -eq 6) { "true" } else { "false" }`,
    },
    'fso-disable': {
      apply:  `New-Item -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers" -Name "${safeExePath}" -Value "~ DISABLEDXMAXIMIZEDWINDOWEDMODE" -Type String -Force; Write-Output "ok"`,
      revert: `Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers" -Name "${safeExePath}" -EA SilentlyContinue; Write-Output "ok"`,
      check:  `$v = (Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers" -Name "${safeExePath}" -EA SilentlyContinue)."${safeExePath}"; if ($v -eq "~ DISABLEDXMAXIMIZEDWINDOWEDMODE") { "true" } else { "false" }`,
    },
    'gpu-preference': {
      apply:  `New-Item -Path "HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences" -Name "${safeExePath}" -Value "GpuPreference=2;" -Type String -Force; Write-Output "ok"`,
      revert: `Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences" -Name "${safeExePath}" -EA SilentlyContinue; Write-Output "ok"`,
      check:  `$v = (Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences" -Name "${safeExePath}" -EA SilentlyContinue)."${safeExePath}"; if ($v -like "*GpuPreference=2*") { "true" } else { "false" }`,
    },
    'network-qos': {
      apply:  `$pn = "${safeGameName} SC-Boost"; if (!(Get-NetQosPolicy -Name $pn -EA SilentlyContinue)) { New-NetQosPolicy -Name $pn -AppPathNameMatchCondition "${safeExePath}" -IPProtocolMatchCondition Both -DSCPAction 46 -NetworkProfile All -Confirm:$false -EA SilentlyContinue }; Write-Output "ok"`,
      revert: `Remove-NetQosPolicy -Name "${safeGameName} SC-Boost" -Confirm:$false -EA SilentlyContinue; Write-Output "ok"`,
      check:  `if (Get-NetQosPolicy -Name "${safeGameName} SC-Boost" -EA SilentlyContinue) { "true" } else { "false" }`,
    },
    // ── Manual-game generic global system tweaks ──────────────────────────────
    'manual-high-perf-plan': {
      apply:  `powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c; Write-Output "ok"`,
      revert: `powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e; Write-Output "ok"`,
      check:  `if ((powercfg /getactivescheme) -match "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c") { "true" } else { "false" }`,
    },
    'manual-game-mode': {
      apply:  `Set-ItemProperty -Path "HKCU:\Software\Microsoft\GameBar" -Name "AllowAutoGameMode" -Value 1 -Type DWord -Force -EA SilentlyContinue; Set-ItemProperty -Path "HKCU:\Software\Microsoft\GameBar" -Name "AutoGameModeEnabled" -Value 1 -Type DWord -Force -EA SilentlyContinue; Write-Output "ok"`,
      revert: `Set-ItemProperty -Path "HKCU:\Software\Microsoft\GameBar" -Name "AllowAutoGameMode" -Value 0 -Type DWord -Force -EA SilentlyContinue; Set-ItemProperty -Path "HKCU:\Software\Microsoft\GameBar" -Name "AutoGameModeEnabled" -Value 0 -Type DWord -Force -EA SilentlyContinue; Write-Output "ok"`,
      check:  `$v = (Get-ItemProperty "HKCU:\Software\Microsoft\GameBar" -EA SilentlyContinue).AutoGameModeEnabled; if ($v -eq 1) { "true" } else { "false" }`,
    },
    'manual-nagle': {
      apply:  `Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces" | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Value 1 -Type DWord -Force -EA SilentlyContinue; Set-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Value 1 -Type DWord -Force -EA SilentlyContinue }; Write-Output "ok"`,
      revert: `Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces" | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Force -EA SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Force -EA SilentlyContinue }; Write-Output "ok"`,
      check:  `$i = (Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces")[0]; $v = (Get-ItemProperty $i.PSPath -EA SilentlyContinue).TCPNoDelay; if ($v -eq 1) { "true" } else { "false" }`,
    },
    'manual-visual-fx': {
      apply:  `Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" -Name "VisualFXSetting" -Value 2 -Type DWord -Force -EA SilentlyContinue; Write-Output "ok"`,
      revert: `Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" -Name "VisualFXSetting" -Value 1 -Type DWord -Force -EA SilentlyContinue; Write-Output "ok"`,
      check:  `$v = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" -EA SilentlyContinue).VisualFXSetting; if ($v -eq 2) { "true" } else { "false" }`,
    },
  };

  const scriptSet = scripts[type];
  if (!scriptSet || !scriptSet[mode]) {
    // Defensive guard — type+mode were validated before acquire, so this cannot fire in practice.
    // Release the token before returning so no slot is orphaned.
    psLimiter.release(_boosterToken);
    return { success: false, error: `Unknown action type "${type}" or mode "${mode}"`, verified: false };
  }

  try {
    const output = await new Promise((resolve, reject) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
         '-WindowStyle', 'Hidden', '-Command', scriptSet[mode]],
        { timeout: 15000, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) reject(new Error(stderr || error.message));
          else resolve(stdout.trim());
        }
      );
    });

    let verified = false;
    if (mode !== 'check' && scriptSet.check) {
      try {
        const checkOut = await new Promise((resolve, reject) => {
          execFile(
            'powershell',
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
             '-WindowStyle', 'Hidden', '-Command', scriptSet.check],
            { timeout: 10000, windowsHide: true },
            (error, stdout, stderr) => {
              if (error) reject(new Error(stderr || error.message));
              else resolve(stdout.trim());
            }
          );
        });
        verified = String(checkOut).toLowerCase().includes('true');
        if (mode === 'revert') verified = !verified;
      } catch (_) { verified = false; }
    } else if (mode === 'check') {
      return { success: true, verified: String(output).toLowerCase().includes('true'), message: output };
    }

    return { success: true, verified, message: String(output) };
  } catch (e) {
    console.error(`[IPC] appBooster:executeAction error (${type}/${mode}):`, e.message);
    return { success: false, error: e.message, verified: false };
  } finally {
    psLimiter.release(_boosterToken);
  }
});

// ── Network Tweaks ────────────────────────────────────────────────────────────

ipcMain.handle('networkTweaks:execute', async (event, tweakId, action) => {
  // Per-tweakId single-flight: prevents duplicate execute calls for the same network tweak
  // when a component remounts while a previous operation is still in flight.
  const _token = psLimiter.tryAcquire({
    file: 'main.js', fn: `networkTweaks:execute:${tweakId}`, reason: `net-tweak-${action}`,
  });
  if (!_token) {
    console.log(`[networkTweaks:execute] SKIPPED — ${tweakId} already executing (action=${action})`);
    return {
      tweakId, action, success: false, skipped: true,
      verified: false, message: 'Another operation on this network tweak is already in progress.',
      requiresRestart: false,
    };
  }
  console.log(`[PS-Exec] start file=main.js fn=networkTweaks:execute:${tweakId} reason=net-tweak-${action}`);
  try {
    const result = await networkTweakExecutor.executeNetworkTweakWithOwnership(tweakId, action);
    console.log(`[PS-Exec] done fn=networkTweaks:execute:${tweakId} success=${result.success} verified=${result.verified}`);
    return result;
  } catch (e) {
    console.error('[IPC] networkTweaks:execute error:', e.message);
    return { tweakId, action, success: false, verified: false, message: e.message, requiresRestart: false };
  } finally {
    psLimiter.release(_token);
  }
});

ipcMain.handle('networkTweaks:checkStatus', async (event, tweakId) => {
  const _token = psLimiter.tryAcquire({ file: 'main.js', fn: `networkTweaks:checkStatus:${tweakId}`, reason: 'net-tweak-check-status' });
  if (!_token) {
    console.log(`[networkTweaks:checkStatus] SKIPPED — ${tweakId} check already in flight`);
    return { tweakId, applied: null, skipped: true };
  }
  try {
    return await networkTweakExecutor.checkNetworkTweakStatus(tweakId);
  } catch (e) {
    return { tweakId, applied: null, error: e.message };
  } finally {
    psLimiter.release(_token);
  }
});

ipcMain.handle('networkTweaks:checkAll', async () => {
  const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'networkTweaks:checkAll', reason: 'net-tweak-check-all' });
  if (!_token) {
    const skipped = psLimiter.skippedResult({ file: 'main.js', fn: 'networkTweaks:checkAll', reason: 'net-tweak-check-all' });
    console.log('[networkTweaks:checkAll] returning explicit skipped — already in progress');
    return skipped;
  }
  const t0 = Date.now();
  console.log('[NetworkTweaks] checkAllStatus start');
  try {
    const result = await networkTweakExecutor.checkAllNetworkTweakStatus();
    let enabled = 0, disabled = 0, inconclusive = 0;
    for (const [id, r] of Object.entries(result)) {
      if (r.disabled) {
        disabled++;
        console.log(`[NetworkTweaks] checkStatus tweakId=${id} enabled=null source=disabled`);
      } else if (r.applied === true) {
        enabled++;
        console.log(`[NetworkTweaks] checkStatus tweakId=${id} enabled=true source=registry/netsh/adapter`);
      } else if (r.applied === false) {
        disabled++;
        console.log(`[NetworkTweaks] checkStatus tweakId=${id} enabled=false source=registry/netsh/adapter`);
      } else {
        inconclusive++;
        console.log(`[NetworkTweaks] checkStatus tweakId=${id} enabled=null source=inconclusive`);
      }
    }
    const durationMs = Date.now() - t0;
    console.log(`[NetworkTweaks] checkAllStatus done count=${Object.keys(result).length} enabled=${enabled} disabled=${disabled} inconclusive=${inconclusive} durationMs=${durationMs}`);
    return result;
  } catch (e) {
    console.error('[NetworkTweaks] checkAllStatus error:', e.message);
    return {};
  } finally {
    psLimiter.release(_token);
  }
});

ipcMain.handle('networkTweaks:getDisabled', () => {
  return networkTweakExecutor.getDisabledTweaks();
});

// ── Premium expiry / ownership ────────────────────────────────────────────────

const premiumRevertPipeline = require('./premium-revert-pipeline');
const ownershipStore        = require('./ownership-store');

/**
 * Revert all app-owned premium changes when a trial expires or subscription ends.
 * Returns a full result report ({ total, reverted, skipped, failed, details }).
 */
ipcMain.handle('premium:revertAll', async () => {
  console.log('[IPC] premium:revertAll — starting expiry revert pipeline');
  try {
    const result = await premiumRevertPipeline.revertAllAppOwned();
    console.log(`[IPC] premium:revertAll done — reverted=${result.reverted} skipped=${result.skipped} failed=${result.failed}`);
    return { success: true, ...result };
  } catch (e) {
    console.error('[IPC] premium:revertAll error:', e.message);
    return { success: false, error: e.message, total: 0, reverted: 0, skipped: 0, failed: 0, details: {} };
  }
});

/**
 * Preview what would be reverted without executing anything.
 * Use before showing a confirmation dialog to the user.
 */
ipcMain.handle('premium:previewRevert', () => {
  try {
    return { success: true, items: premiumRevertPipeline.previewRevert() };
  } catch (e) {
    return { success: false, error: e.message, items: [] };
  }
});

/**
 * Return all ownership records — app-owned + non-owned — for display and debugging.
 */
ipcMain.handle('premium:getOwnership', () => {
  try {
    return { success: true, records: ownershipStore.getAllRecords() };
  } catch (e) {
    return { success: false, error: e.message, records: [] };
  }
});

/**
 * Startup sanity check — Section 6 guard.
 *
 * Called by the frontend when it determines the user is not premium.
 * Checks if a SwitchControl premium power plan is currently active and, if so,
 * force-reverts it to Windows Balanced (381b4222-f694-41f0-9685-ff5bb260df2e).
 *
 * This closes the loophole where:
 *   - The expiry revert skipped or failed the power plan step.
 *   - The app was closed before the revert completed.
 *   - The ownership store was cleared while the SC plan remained active.
 *   - The user regained premium briefly then lost it (ownership record lost).
 */
ipcMain.handle('premium:powerPlanSanityCheck', async () => {
  console.log('[IPC] premium:powerPlanSanityCheck — checking active power plan');
  try {
    const result = await premiumRevertPipeline.runStartupPowerPlanSanityCheck();
    console.log(`[IPC] premium:powerPlanSanityCheck done — action=${result.action}`);
    return { success: true, ...result };
  } catch (e) {
    console.error('[IPC] premium:powerPlanSanityCheck error:', e.message);
    return { success: false, error: e.message };
  }
});

// Clean up all orphaned/duplicate SwitchControl power plans from Windows.
// Safe to call at any time — skips the currently active plan.
ipcMain.handle('premium:cleanupScPlans', async () => {
  console.log('[IPC] premium:cleanupScPlans — restoring built-in plan names, then deleting SC plans');
  try {
    // Restore original Windows names FIRST — this undoes any name corruption
    // where a built-in plan (e.g. Windows Balanced) was renamed "SwitchControl - *"
    // by the reuse-path changename.  Must run before deleteAllScPlans so that
    // the SC-name-prefix detection is accurate and verifyRevertClean is truthful.
    await powerPlanManager.restoreBuiltinPlanNames();
    const cleanup = await powerPlanManager.deleteAllScPlans();
    const verification = await powerPlanManager.verifyRevertClean();
    console.log(
      `[IPC] premium:cleanupScPlans done — deleted=${cleanup.deleted.length}` +
      ` skipped=${cleanup.skipped.length} errors=${cleanup.errors.length}` +
      ` clean=${verification.clean}` +
      ` renamedBuiltins=${verification.renamedBuiltins?.length ?? 0}`
    );
    return {
      success: true,
      ...cleanup,
      verified: verification.clean,
      verification,
    };
  } catch (e) {
    console.error('[IPC] premium:cleanupScPlans error:', e.message);
    return { success: false, error: e.message };
  }
});

// Auth: Clear cookies for the backend domain
ipcMain.handle('auth:clearCookies', async () => {
  console.log('[Auth] auth:clearCookies IPC called');
  try {
    const { session } = require('electron');
    const ses = session.defaultSession;
    
    let totalCleared = 0;
    
    const switchcontrolCookies = await ses.cookies.get({ domain: 'switchcontrol.org' });
    for (const cookie of switchcontrolCookies) {
      const url = `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
      await ses.cookies.remove(url, cookie.name);
      totalCleared++;
    }
    
    const dotCookies = await ses.cookies.get({ domain: '.switchcontrol.org' });
    for (const cookie of dotCookies) {
      const url = `https://switchcontrol.org${cookie.path}`;
      await ses.cookies.remove(url, cookie.name);
      totalCleared++;
    }
    
    const localhostCookies = await ses.cookies.get({ domain: '127.0.0.1' });
    for (const cookie of localhostCookies) {
      const url = `http://127.0.0.1${cookie.path}`;
      await ses.cookies.remove(url, cookie.name);
      totalCleared++;
    }
    
    console.log('[Auth] Cleared', totalCleared, 'cookies total');
    return { success: true, cleared: totalCleared };
  } catch (err) {
    console.error('[Auth] Failed to clear cookies:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:debugCookies', async () => {
  const { session } = require('electron');
  const allCookies = await session.defaultSession.cookies.get({});
  const relevant = allCookies.filter(c =>
    c.domain.includes('switchcontrol.org') ||
    c.domain.includes('127.0.0.1') ||
    c.domain.includes('localhost')
  );

  console.log('[Auth] Debug cookies: total=' + allCookies.length + ' relevant=' + relevant.length);

  return relevant.map(c => ({
    name: c.name,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
    expirationDate: c.expirationDate
  }));
});

// ── Scheduler stats (lightweight — safe to call from devtools/debug panels) ────
ipcMain.handle('telemetry:getSchedulerStats', () => {
  const _now = Date.now();
  return {
    appCpuPct:            parseFloat(_appCpuPct.toFixed(2)),
    lowEndMode:           _lowEndMode,
    heavyCooldownUntil,
    heavyCooldownActiveMs: heavyCooldownUntil > _now ? heavyCooldownUntil - _now : 0,
    tickCount:            _tickCount,
    skippedTicks:         _skippedTicks,
    taskTimings:          _taskTimings,
    currentIntervalMs:    _telemetryCurrentIntervalMs,
    baseIntervalMs:       TELEMETRY_BASE_MS,
    slowIntervalMs:       TELEMETRY_SLOW_MS,
    budgetPct:            CPU_BUDGET_PCT,
  };
});

// ── Performance diagnostics ────────────────────────────────────────────────────
// Access from renderer: window.electronAPI.debug.getPerformanceInfo()
ipcMain.handle('debug:getPerformanceInfo', () => {
  const psStats = psLimiter.getState ? psLimiter.getState() : {};
  // process.getCPUUsage() is an Electron API: returns { percentCPUUsage, idleWakeupsPerSecond }
  let processCpu = null;
  try { processCpu = process.getCPUUsage(); } catch (_) {}

  const win = mainWindow;
  const _now = Date.now();
  return {
    telemetryLoop: {
      active:            _telemetryLoopActive,
      paused:            _telemetryLoopPaused,
      instances:         _telemetryLoopCount,
      currentIntervalMs: _telemetryCurrentIntervalMs,
      baseIntervalMs:    TELEMETRY_BASE_MS,
      slowIntervalMs:    TELEMETRY_SLOW_MS,
    },
    scheduler: {
      appCpuPct:          parseFloat(_appCpuPct.toFixed(2)),
      lowEndMode:         _lowEndMode,
      budgetPct:          CPU_BUDGET_PCT,
      governorPct:        TELEMETRY_GOVERNOR_PCT,
      tickCount:          _tickCount,
      skippedTicks:       _skippedTicks,
      heavyCooldownUntil,
      heavyCooldownActiveMs: heavyCooldownUntil > _now ? heavyCooldownUntil - _now : 0,
      taskTimings:        _taskTimings,
      taskTtls: {
        cpuTemp:    CPU_TEMP_TTL_MS,
        diskIO:     DISK_IO_TTL_MS,
        fsSize:     FS_SIZE_TTL_MS,
      },
      taskAges: {
        cpuTemp: _cpuTempLastTs ? _now - _cpuTempLastTs : null,
        diskIO:  _diskIoLastTs  ? _now - _diskIoLastTs  : null,
        fsSize:  _fsSizeLastTs  ? _now - _fsSizeLastTs  : null,
      },
    },
    powerShell: {
      callsLast60s:      psStats.callsLast60s  ?? 0,
      lastCallTimestamp: psStats.lastCallTimestamp ?? null,
      activeSlots:       psStats.active ?? 0,
      recentCalls:       psStats.recentCalls ?? [],
    },
    process: {
      cpuPercent:           processCpu?.percentCPUUsage ?? null,
      idleWakeupsPerSecond: processCpu?.idleWakeupsPerSecond ?? null,
      pid:                  process.pid,
    },
    window: {
      visible:   win ? !win.isMinimized() && win.isVisible() : null,
      minimized: win ? win.isMinimized() : null,
      focused:   win ? win.isFocused() : null,
    },
  };
});

// ── ipcReady flag — set true only after registerCriticalIPC() completes ───────
let ipcReady = false;

// ── Critical IPC registration ─────────────────────────────────────────────────
// Called as the very first thing inside whenReady(), before ANY risky code.
// These handlers must survive even if everything else in startup crashes.
function registerCriticalIPC() {
  ipcMain.handle('app:getBackendPort',  () => backendLauncher.getBackendPort());
  ipcMain.handle('app:isBackendReady',  () => backendLauncher.isBackendReady());
  ipcMain.handle('app:getBackendError', () => backendLauncher.getLastError ? backendLauncher.getLastError() : null);
  ipcMain.handle('app:isAdmin',         () => _appIsAdmin === true);
  ipcMain.handle('app:isIPCReady',      () => ipcReady);

  ipcMain.handle('updater:getState', () => updaterService.getState());
  ipcMain.handle('updater:check', () => {
    const { status } = updaterService.getState();
    if (!updaterService.canCheck(status)) { console.warn('[IPC] updater:check ignored — blocked in state:', status); return false; }
    updaterService.checkForUpdates();
    return true;
  });
  ipcMain.handle('updater:download', () => {
    const { status } = updaterService.getState();
    if (!updaterService.canDownload(status)) { console.warn('[IPC] updater:download ignored — blocked in state:', status); return false; }
    updaterService.downloadUpdate();
    return true;
  });
  ipcMain.handle('updater:install', () => {
    const { status } = updaterService.getState();
    if (!updaterService.canInstall(status)) { console.warn('[IPC] updater:install ignored — blocked in state:', status); return false; }
    updaterService.quitAndInstall();
    return true;
  });

  ipcReady = true;
  verboseLog('[STARTUP] critical IPC registered');
}

// ── Non-critical startup audit ────────────────────────────────────────────────
// Runs completely isolated from the critical path.
// Any crash here is caught and logged — never reaches whenReady().
async function runStartupAuditSafe() {
  if (!isDebug && app.isPackaged) return; // skip verbose audit in production
  try {
    const dataFiles = [
      { label: 'tweak-state.json', file: TWEAK_STATE_FILE },
      { label: 'sc-config.json',   file: CONFIG_FILE       },
      { label: 'device-id.json',   file: DEVICE_ID_FILE    },
    ];
    const found   = dataFiles.filter(d => fs.existsSync(d.file));
    const missing = dataFiles.filter(d => !fs.existsSync(d.file));
    const isRestoredInstall = found.length > 0;
    verboseLog(`[UserData] AppData root: ${APPDATA_DIR} | ${isRestoredInstall ? 'EXISTING DATA FOUND' : 'FRESH INSTALL'}`);
    found.forEach(d => {
      try {
        const stat = fs.statSync(d.file);
        verboseLog(`[UserData]   ✓ ${d.label} (${stat.size} bytes)`);
      } catch { verboseLog(`[UserData]   ✓ ${d.label}`); }
    });
    missing.forEach(d => verboseLog(`[UserData]   · ${d.label} (not yet created)`));

    if (fs.existsSync(TWEAK_STATE_FILE)) {
      try {
        const ts = JSON.parse(fs.readFileSync(TWEAK_STATE_FILE, 'utf8'));
        const tweakCount   = ts && ts.tweaks ? Object.keys(ts.tweaks).length : 0;
        const enabledCount = ts && ts.tweaks ? Object.values(ts.tweaks).filter(Boolean).length : 0;
        verboseLog(`[UserData]   Tweaks persisted: ${tweakCount} total, ${enabledCount} enabled`);
      } catch { /* parse errors handled separately by tweak-executor */ }
    }
  } catch (auditErr) {
    console.error('[STARTUP] non-critical audit failed:', auditErr && auditErr.message);
  }
}

app.whenReady().then(async () => {
  const bootStart = Date.now();
  console.log(`[STARTUP] whenReady — v${require('./package.json').version} | isDev:${isDev} | pid:${process.pid}`);

  // ── A. Register critical IPC handlers — MUST be first, before any risky code ─
  registerCriticalIPC();

  if (isDebug) {
    console.log('\n========== BOOT EVIDENCE ==========');
    console.log('[BOOT] isDev:', isDev, '| isPackaged:', app.isPackaged);
    console.log('[BOOT] process.execPath:', process.execPath);
    console.log('[BOOT] process.resourcesPath:', process.resourcesPath);
    console.log('[BOOT] app.getAppPath():', app.getAppPath());
    console.log('[BOOT] app.getPath("userData"):', app.getPath('userData'));
    console.log('[BOOT] app.getPath("exe"):', app.getPath('exe'));
    console.log('[BOOT] process.argv:', JSON.stringify(process.argv));
    console.log('====================================\n');
  }

  // ── Admin status check (Windows only) ─────────────────────────────────────
  // The app uses requireAdministrator — the process is always elevated after
  // the single startup UAC prompt. This check caches the result so the
  // renderer can confirm elevated status via the app:isAdmin IPC.
  checkWindowsAdmin().then(v => {
    _appIsAdmin = v;
    verboseLog('[UAC] isAdmin:', v, app.isPackaged ? '(packaged)' : '(dev mode)');
  }).catch((err) => {
    _appIsAdmin = false;
    console.error('[UAC] Admin check failed:', err?.message);
  });

  // ── B. Non-critical config + audit — failures here never block window creation ─
  const userDataPath = app.getPath('userData');
  configStore.init(userDataPath);
  verboseLog('[BOOT] Config store initialized:', userDataPath);

  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
  verboseLog('[DeepLink] protocol registered:', app.isDefaultProtocolClient('switchcontrol'));

  // Fire-and-forget: audit runs in parallel, any crash is caught inside the function
  void runStartupAuditSafe();

  // Check for slider crash sentinel — warns if the previous session crashed during
  // a reboot-required elevated write (e.g. mouclass / kbdclass driver parameters).
  try {
    const sentinel = sliderTweakExecutor.checkCrashSentinel();
    if (sentinel) {
      console.warn(`[STARTUP] Slider crash sentinel found for "${sentinel.tweakId}" — previous write may have aborted. previousValue=${sentinel.previousValue}`);
    }
  } catch (e) {
    console.error('[STARTUP] Crash sentinel check failed:', e.message);
  }

  // ── C. Create main window ─────────────────────────────────────────────────────
  // Pre-warm specs BEFORE the window opens so cachedSpecs is set by the time
  // Splash.tsx fires its getSpecs() IPC call.  loadSystemSpecs() is synchronous
  // on first call (_buildInstantSpecs uses os.cpus/totalmem only, < 1ms).
  // This eliminates the race where Splash called getSpecs() while cachedSpecs
  // was still null, causing a redundant _buildInstantSpecs inside the IPC handler.
  loadSystemSpecs().then(specs => {
    console.log('[PREWARM] cachedSpecs seeded before window open —', specs?.cpu?.model, '| GPU:', specs?.gpu?.model);
  }).catch(e => {
    console.warn('[PREWARM] specs pre-warm failed (non-fatal):', e?.message);
  });

  // Telemetry starts AFTER window is shown + 2000ms (see ipcMain.once 'app:first-frame-ready').
  // This prevents GPU prewarm / PowerShell cold-start from racing with first-paint animations.
  createWindow();

  // ── C-bis. Cold-start deep-link catch (Windows protocol launch when app was not running) ─
  // On Windows a protocol launch passes the URL as a command-line argument when the app
  // starts fresh.  The second-instance handler never fires here, so we must capture the URL
  // from process.argv ourselves.
  if (process.platform === 'win32') {
    const coldStartUrl = process.argv.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (coldStartUrl) {
      verboseLog('[DeepLink] cold-start URL detected in process.argv:', coldStartUrl);
      // Queue it for delivery after renderer finishes loading.
      if (isValidDeepLink(coldStartUrl)) {
        pendingDeepLinkUrl = coldStartUrl;
      } else {
        verboseLog('[DeepLink] cold-start URL rejected by validation:', coldStartUrl);
      }
    }
  }

  // ── D. Start backend safely (packaged mode only) ──────────────────────────────
  if (!isDev) {
    backendLauncher.startBackend(app).then(result => {
      if (result.ready) {
        console.log(`[STARTUP] backend ready — port ${result.port} (${Date.now() - bootStart}ms)`);
        if (mainWindow && rendererReady) {
          mainWindow.webContents.send('backend-ready', { port: result.port });
        }
      } else {
        console.error(`[STARTUP] backend failed: ${result.error || 'unknown'}`);
        if (mainWindow && rendererReady) {
          mainWindow.webContents.send('backend-error', { error: result.error || 'Backend failed to start' });
        }
      }
    }).catch(err => {
      console.error('[STARTUP] backend error:', err.message);
    });
  }

  ipcMain.handle('app:openDevTools', () => {
    mainWindow?.webContents.openDevTools({ mode: 'detach' });
  });

  // ── Updater boot ─────────────────────────────────────────────────────────
  updaterService.initUpdater(isDev);

  if (!isDev) {
    setTimeout(() => {
      verboseLog('[Updater] Startup check (8s after ready)...');
      updaterService.checkForUpdates();
    }, 8000);
  }

  // Persist session cookies across restarts by extending their lifetime
  const { session } = require('electron');
  const ses = session.defaultSession;

  ses.cookies.on('changed', (event, cookie, cause, removed) => {

    const shouldPersist = cookie.domain && (
      cookie.domain.includes('switchcontrol.org') ||
      cookie.domain.includes('127.0.0.1')
    );
    if (!removed && cookie.session && shouldPersist) {
      verboseLog('[Auth] Persisting session cookie:', cookie.name, 'domain:', cookie.domain);
      // Session cookies (no expiry) don't survive restart — persist them for 30 days
      const isLocalhost = cookie.domain.includes('127.0.0.1');
      const persistedCookie = {
        url: isLocalhost
          ? `http://127.0.0.1${cookie.path || '/'}`
          : `https://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite || 'no_restriction',
        expirationDate: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
      };
      ses.cookies.set(persistedCookie)
        .then(() => verboseLog('[Auth] Cookie persisted:', cookie.name))
        .catch(err => console.error('[Auth] Cookie persist failed:', cookie.name, err));
    }
  });

  console.log(`[STARTUP] app ready — ${Date.now() - bootStart}ms from whenReady`);
});

// ── TLS / certificate diagnostics ─────────────────────────────────────────────
// Fires whenever Chromium's network stack encounters a certificate error —
// this covers the renderer's fetch(), Electron net.request(), electron-updater,
// and any other Chromium networking subsystem.
//
// We ALWAYS deny (callback(false)) — we never bypass TLS validation.
// The handler exists purely to log certificate details before the request fails,
// so the crash logs have hostname, issuer, fingerprint, and error code instead
// of just a raw ERR_CERT_AUTHORITY_INVALID string.
//
// Because we deny here, the network request fails gracefully as a regular HTTP
// error rather than an unhandled rejection.
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault(); // take ownership of the callback

  let hostname = '(unknown)';
  try { hostname = new URL(url).hostname; } catch (_e) {}

  const issuer      = certificate?.issuerName   || '(no issuer)';
  const subject     = certificate?.subjectName  || '(no subject)';
  const fingerprint = certificate?.fingerprint  || '(no fingerprint)';
  let   validRange  = '(unknown)';
  try {
    const from = certificate.validStart  ? new Date(certificate.validStart  * 1000).toISOString().substring(0, 10) : '?';
    const to   = certificate.validExpiry ? new Date(certificate.validExpiry * 1000).toISOString().substring(0, 10) : '?';
    validRange = `${from} → ${to}`;
  } catch (_e) {}

  console.error(
    `[TLS] Certificate error — hostname=${hostname} error=${error} ` +
    `issuer="${issuer}" subject="${subject}" fingerprint=${fingerprint} ` +
    `valid=${validRange}`,
  );

  try {
    criticalLogger.writeCritical({
      category: 'backend_failure',
      severity: 'warning',
      source:   'certificate-error',
      message:  `TLS cert error for ${hostname}: ${error} | issuer="${issuer}"`,
    });
  } catch (_e) {}

  // DENY — never bypass TLS validation
  callback(false);
});

app.on('window-all-closed', () => {
  backendLauncher.stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  _telemetryLoopActive = false; // signals the async loop to stop after current poll
  console.log('[telemetry:poll] async loop stop requested on quit');
  tweakExecutor.cleanupTimerResProcess();
  backendLauncher.stopBackend();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
