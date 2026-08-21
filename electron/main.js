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
  
  const { app, BrowserWindow, ipcMain, shell, globalShortcut, Menu, Notification, dialog } = require('electron');
  const { exec, execFile } = require('child_process');
  const path = require('path');
  const os = require('os');
  const fs = require('fs'); // top-level — never undefined, never lost inside a closure
  const si = require('systeminformation');
  const tweakExecutor = require('./tweak-executor');
  const sliderTweakExecutor = require('./slider-tweak-executor');
  const presetTweakExecutor = require('./preset-tweak-executor');
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
  const { checkIsAdmin: checkSharedIsAdmin } = require('./ps-shared');
  require('./security-helper');
  require('./debloat-helper');
  const { getIconDataUrlForPath } = require('./file-icon');
  require('./cleaner-helper');
  require('./storage-helper');
  const configStore    = require('./config-store');
  const updaterService = require('./updater');
  const criticalLogger = require('./critical-logger');
  const { APPDATA_DIR, TWEAK_STATE_FILE, CONFIG_FILE, DEVICE_ID_FILE, SPECS_CACHE_FILE, DEVICE_SIGNATURE_FILE } = require('./user-data-paths');
  const processControl = require('./process-control');
  // The latency analyzer is an optional feature. Some packaged builds do not
  // include latency-analyzer.js; requiring it unconditionally makes Electron
  // crash before the window can open.
  let latencyAnalyzer;
  let latencyAnalyzerAvailable = true;
  try {
    latencyAnalyzer = require('./latency-analyzer');
  } catch (e) {
    latencyAnalyzerAvailable = false;
    console.error('[BOOT] latency-analyzer not found; latency analysis is disabled:', e.message);
    latencyAnalyzer = {
      isActive: () => false,
      startAnalysis: async () => false,
      stopAnalysis: () => {},
      getStatus: () => ({
        active: false,
        available: false,
        error: 'Latency analyzer module is not installed.',
      }),
      scanDrivers: async () => [],
      scanAudioDevices: async () => [],
    };
  }
  let _latencyLastSample = null; // last received sample for renderer polling
  let _latencyLastError = null;
  
  app.setName('SwitchControl');
  const isDev = !app.isPackaged;
  const isProd = !isDev;
  const allowDebug = process.env.DEBUG_MODE === 'true';
  verboseLog('[BOOT] app.isPackaged:', app.isPackaged, '| isDev:', isDev, '| DEBUG_MODE:', allowDebug);
  
  // DevTools lock — hard-disabled in production builds.
  // Three layers of defense:
  //   1. devTools:false in webPreferences stops Chromium from building the inspector at all.
  //   2. before-input-event blocks every keyboard shortcut that could open DevTools
  //      (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C) before it reaches the page.
  //   3. devtools-opened listener closes the inspector immediately if anything
  //      bypasses layers 1+2 (e.g. programmatic openDevTools calls from old code paths).
  function lockDevTools(win) {
    if (isDev) return; // Leave DevTools fully open in development.
  
    win.webContents.on('before-input-event', (_event, input) => {
      const ctrl  = input.control || input.meta; // meta = Cmd on macOS
      const shift = input.shift;
      const key   = input.key;
  
      // F12 — universal DevTools toggle
      if (key === 'F12') { _event.preventDefault(); return; }
  
      // Ctrl+Shift+I — Elements / inspector
      if (ctrl && shift && (key === 'i' || key === 'I')) { _event.preventDefault(); return; }
  
      // Ctrl+Shift+J — Console
      if (ctrl && shift && (key === 'j' || key === 'J')) { _event.preventDefault(); return; }
  
      // Ctrl+Shift+C — Element picker
      if (ctrl && shift && (key === 'c' || key === 'C')) { _event.preventDefault(); return; }
    });
  
    // Belt-and-suspenders: if DevTools somehow opens anyway, close it immediately.
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools();
    });
  }
  const PROTOCOL_NAME = 'switchcontrol';
  let mainWindow = null;
  let _fadeTimer = null;
  let _fallbackFadeTimer = null;
  let _telemetryStartDelayTimer = null;
  let _showFallbackTimer = null;
  let _cookiesListenerRegistered = false;
  const FACTORY_RESET_CONFIRMATION = 'RESET_SWITCHCONTROL_DATA';
  
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
    if (_appIsAdmin !== null) return Promise.resolve(_appIsAdmin);
    return checkSharedIsAdmin().then(value => {
      _appIsAdmin = value;
      return value;
    });
  }

  // ─── Shared PowerShell runner for main.js IPC handlers ───────────────────────
  // Acquires a psLimiter slot, spawns powershell.exe, returns trimmed stdout or
  // null on error. Callers keep their own parsing/JSON logic; only the spawn
  // boilerplate is centralised here.
  // Sites with complex stderr handling or custom backoff (getGpuPerfCounterLoad,
  // startup:scan) keep their inline spans and are
  // documented exceptions.
  async function runMainPs(script, { timeout = 10000, label = '' } = {}) {
    if (process.platform !== 'win32') return null;
    const token = psLimiter.tryAcquire({ file: 'main.js', fn: label || 'runMainPs', reason: label || 'main-ps' });
    if (!token) return null;
    try {
      return await new Promise((resolve) => {
        execFile('powershell', [
          '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
          '-ExecutionPolicy', 'Bypass', '-Command', script,
        ], { windowsHide: true, timeout }, (err, stdout) => {
          resolve(err ? null : (stdout || '').trim());
        });
      });
    } finally {
      psLimiter.release(token);
    }
  }
  
  // Deep-link queue for when renderer is not ready
  let pendingDeepLinkUrl = null;
  let rendererReady = false;
  
  // Cache for system specs (5 minute TTL)
  let cachedSpecs = null;
  let cachedSpecsTime = 0;
  let cachedSpecsRevision = 0;
  // Expensive live disk fallback work is allowed only after the initial
  // dashboard has rendered.
  let dashboardMountedAt = 0;
  // A trusted recent specs cache can hydrate the complete GPU list, making the
  // startup WMI probe redundant.
  let skipStartupWmiGpu = false;
  const SPECS_CACHE_TTL          = 5 * 60 * 1000;      // 5 min  — in-memory freshness
  const SPECS_DISK_SERVE_AGE_MS  = 4 * 60 * 60 * 1000; // 4 h    — serve disk cache instantly
  const SPECS_DISK_IGNORE_AGE_MS = 24 * 60 * 60 * 1000;// 24 h   — discard stale disk cache
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
  const GPU_COUNTER_REFRESH_TTL = 120_000;
  const GPU_POLL_TTL_MS = GPU_COUNTER_REFRESH_TTL;
  
  // Network stats TTL — prevents slow NIC drivers from blocking the loop
  const NET_STATS_TTL_MS = 5_000;
  
  // ─── GPU VRAM lookup table ─────────────────────────────────────────────────
  // WMI Win32_VideoController.AdapterRAM is a 32-bit signed integer that caps at
  // ~4 GB. Modern GPUs (AMD RX 7000+, NVIDIA RTX 30+, Intel Arc) report 4 GB or
  // less regardless of their real VRAM.  si.graphics() is skipped for AMD cards
  // because DXGI hangs 3-4 s.  This table provides the ground-truth VRAM for known
  // cards so the Dashboard / PC DNA / Advisor all show the correct number.
  //
  // Key format: lower-case model substring → VRAM in GB.
  // Matching is done with includes() so "RX 7800 XT" hits "rx 7800".
  const GPU_VRAM_TABLE = {
    // AMD RX 9000 series
    'rx 9070 xt': 16, 'rx 9070': 16,
    // AMD RX 7000 series
    'rx 7900 xtx': 24, 'rx 7900 xt': 20, 'rx 7900': 20,
    'rx 7800 xt': 16, 'rx 7800': 16,
    'rx 7700 xt': 12, 'rx 7700': 12,
    'rx 7600 xt': 16, 'rx 7600': 8,
    'rx 7500': 8,
    // AMD RX 6000 series
    'rx 6950 xt': 16, 'rx 6900 xt': 16, 'rx 6900': 16,
    'rx 6800 xt': 16, 'rx 6800': 16,
    'rx 6750 xt': 12, 'rx 6700 xt': 12, 'rx 6700': 10,
    'rx 6650 xt': 8, 'rx 6600 xt': 8, 'rx 6600': 8,
    'rx 6500 xt': 4, 'rx 6500': 4,
    'rx 6400': 4,
    // AMD RX 5000 series
    'rx 5700 xt': 8, 'rx 5700': 8,
    'rx 5600 xt': 6, 'rx 5600': 6,
    'rx 5500 xt': 4, 'rx 5500': 4,
    // NVIDIA RTX 50 series
    'rtx 5090': 32, 'rtx 5080': 16, 'rtx 5070 ti': 16, 'rtx 5070': 12,
    'rtx 5060 ti': 16, 'rtx 5060': 8, 'rtx 5050': 8,
    // NVIDIA RTX 40 series
    'rtx 4090': 24, 'rtx 4080 super': 16, 'rtx 4080': 16, 'rtx 4070 ti super': 16,
    'rtx 4070 ti': 12, 'rtx 4070 super': 12, 'rtx 4070': 12,
    'rtx 4060 ti': 8, 'rtx 4060': 8, 'rtx 4050': 6,
    // NVIDIA RTX 30 series
    'rtx 3090 ti': 24, 'rtx 3090': 24, 'rtx 3080 ti': 12, 'rtx 3080': 10,
    'rtx 3070 ti': 8, 'rtx 3070': 8, 'rtx 3060 ti': 8, 'rtx 3060': 12,
    'rtx 3050': 8,
    // NVIDIA RTX 20 series
    'rtx 2080 ti': 11, 'rtx 2080 super': 8, 'rtx 2080': 8,
    'rtx 2070 super': 8, 'rtx 2070': 8, 'rtx 2060 super': 8, 'rtx 2060': 6,
    // NVIDIA GTX 16 series
    'gtx 1660 ti': 6, 'gtx 1660 super': 6, 'gtx 1660': 6,
    'gtx 1650 super': 4, 'gtx 1650': 4,
    // NVIDIA GTX 10 series
    'gtx 1080 ti': 11, 'gtx 1080': 8, 'gtx 1070 ti': 8, 'gtx 1070': 8,
    'gtx 1060': 6, 'gtx 1050 ti': 4, 'gtx 1050': 2,
    // Intel Arc
    'arc a770': 16, 'arc a750': 8, 'arc a580': 8, 'arc a380': 6, 'arc a310': 4,
  };
  
  /**
   * Return the known VRAM (GB) for a GPU model name, or null if unknown.
   * Handles "AMD Radeon RX 7800 XT" → "rx 7800" lookup.
   */
  function lookupGpuVram(model) {
    if (!model) return null;
    const ml = model.toLowerCase();
    // Direct substring match (e.g. "rx 7800 xt" contains "rx 7800")
    for (const [key, vram] of Object.entries(GPU_VRAM_TABLE)) {
      if (ml.includes(key)) return vram;
    }
    return null;
  }
  let _netStatsLastTs = 0;
  let _netStatsCache = null;
  
  // Approved si.* callers — documentation only, not runtime-enforced.
  // Approved direct callers of systeminformation (si.*).
  // Only these identifiers may call si.* directly; all others must go through
  // the pollTelemetry cache.  assertSiCaller() enforces this at runtime —
  // violations emit a console.error so they surface in dev and packaged logs.
  // To add a new approved caller: add its name here AND call assertSiCaller()
  // at the top of the new handler.
  const ALLOWED_SI_CALLERS = new Set([
    'pollTelemetry',
    'loadSystemSpecs',
    'getGpuStatic',
    'getGpuPerfCounterLoad',
    'telemetry:getGpu',
    'telemetry:refreshDeepHardware',
    'startTelemetryPolling-prime',
    // On-demand reads (IPC handlers, not on the polling budget):
    'system:getRamUsage',          // on-demand RAM snapshot for System page
    'system:getAllDisks',           // on-demand disk list, not polled
    'telemetry:getCpuCores',       // static at boot, cached by caller
    'telemetry:getMemoryDetails',  // on-demand detail panel
  ]);

  /**
   * Enforce the si.* caller allowlist at runtime.
   * Call this at the top of every function/handler that invokes si.* directly.
   * Emits console.error (never throws) so a stray caller surfaces in logs
   * without crashing the app.
   */
  function assertSiCaller(callerName) {
    if (!ALLOWED_SI_CALLERS.has(callerName)) {
      console.error(
        `[SI-GUARD] Unapproved direct si.* call from "${callerName}". ` +
        `Add it to ALLOWED_SI_CALLERS only if it cannot use the telemetry cache.`
      );
    }
  }
  // (3) cached value from previous refresh. NEVER polled automatically in loop.
  // { load: number|null, temp: number|null, memUsedMb: number|null, memTotalMb: number|null, power: number|null, clockMhz: number|null, source: string }
  // ─── Unified GPU state — single source of truth for all GPU reads ─────────────
  // Replaces three separate caches (gpuStaticCache/gpuStaticTs, gpuPollCache,
  // _gpuInfoCache/_gpuInfoCacheTs). All IPC handlers read from here; the renderer
  // API shapes are unchanged — only the internal plumbing is consolidated.
  let gpuState = {
    model: null, vendor: null, isNvidia: false, isAmd: false,
    vramTotalMb: null, vramUsedMb: null, driverVersion: null,
    load: null, temp: null, power: null, clockMhz: null, source: 'none',
    lastStaticUpdate: 0, lastDynamicUpdate: 0,
  };
  
  // On-demand GPU perf counter refresh — used only by telemetry:refreshGpuLoad IPC.
  // The same TTL is used by the low-level reader and IPC handler so neither path
  // can unexpectedly bypass the other path's cache window.
  let _gpuCounterLastRefreshTs = 0;
  let _gpuCounterRefreshInFlight = null;
  let _gpuCounterFailureBackoffUntil = 0;
  const GPU_COUNTER_FAILURE_BACKOFF_MS = 5_000;
  
  
  // Fast GPU existence flag — set true as soon as si.graphics() confirms a controller.
  // si.graphics() completes in ~300–600ms (no PowerShell overhead), so this is known
  // well before the renderer's first getLive() call. Used to signal "GPU present,
  // load pending" so the chart series is always structurally present from frame 1.
  let gpuExistsOnHardware = false;
  let wmiGpuModelName = null; // GPU name from WMI fast-path — fallback when si.graphics() times out
  let wmiGpuModelPromise = null;
  // Single-flight startup GPU probe. Specs enrichment and telemetry startup can
  // be initiated by different lifecycle events; they must share one WMI call
  // instead of each spawning powershell.exe on cold/low-end machines.
  let _startupWmiGpuRaw = null;
  let _startupWmiGpuInFlight = null;
  let _startupWmiGpuAttempted = false;
  function _getStartupWmiGpuRaw() {
    if (process.platform !== 'win32') return Promise.resolve('');
    if (_startupWmiGpuRaw) return Promise.resolve(_startupWmiGpuRaw);
    if (_startupWmiGpuInFlight) return _startupWmiGpuInFlight;
    if (_startupWmiGpuAttempted) return Promise.resolve('');

    const _wmiGpuPs = `try{$r=@(Get-CimInstance Win32_VideoController -ErrorAction Stop|Where-Object{$_.Name -notmatch 'Microsoft Basic|Remote Desktop'}|Sort-Object{-[uint64]$_.AdapterRAM});if($r.Count -gt 0){($r|ForEach-Object{"$($_.Name)|$([uint64]$_.AdapterRAM)"})-join';;'}else{''}}catch{''}`;
    const _fpToken = psLimiter.tryAcquire({ file: 'main.js', fn: '_getStartupWmiGpuRaw', reason: 'startup-wmi-gpu-single-flight' });
    if (!_fpToken) {
      // Do not mark the probe attempted when the shared limiter is busy. A
      // later lifecycle event can retry after the competing elevated work ends.
      return Promise.resolve('');
    }

    _startupWmiGpuAttempted = true;
    _startupWmiGpuInFlight = new Promise(resolve => {
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', _wmiGpuPs],
        { windowsHide: true, timeout: 5000 },
        (err, stdout) => {
          psLimiter.release(_fpToken);
          const raw = !err && stdout ? stdout.trim() : '';
          if (raw) _startupWmiGpuRaw = raw;
          resolve(raw);
        });
    }).finally(() => {
      _startupWmiGpuInFlight = null;
    });
    return _startupWmiGpuInFlight;
  }
  let _resolveWmiGpuModel = null;
  // ── Multi-GPU support ───────────────────────────────────────────────────
  // wmiGpuList is populated once at startup from WMI (all discrete GPUs, ranked by VRAM).
  // selectedGpuIndex is the user’s choice, persisted in configStore.
  let wmiGpuList = [];   // [{ name, vramBytes }] sorted VRAM desc
  let selectedGpuIndex = 0;
  
  // ── Performance governor ──────────────────────────────────────────────────────
  // Base poll interval.  Stays at TELEMETRY_BASE_MS while CPU is normal.
  // Auto-throttles to TELEMETRY_SLOW_MS when load exceeds the threshold.
  const TELEMETRY_BASE_MS      = 2000;   // normal polling cadence
  const TELEMETRY_SLOW_MS      = 8000;   // low-end / over-budget mode
  const TELEMETRY_GOVERNOR_PCT = 50;     // engage slow mode when cpu > 50%
  let _telemetryCurrentIntervalMs = TELEMETRY_BASE_MS;
  // The renderer selects the single telemetry demand profile for the active
  // route. Electron remains the sole hardware-polling owner.
  let _telemetryDemandMode = 'full';
  
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
  let _telemetryDemandPaused = false;
  let _telemetryLoopCount  = 0; // incremented every time the loop actually starts; must stay ≤ 1
  
  async function _telemetryLoop() {
    // Check before incrementing so a rejected duplicate start cannot poison the
    // singleton counter for the remainder of the process lifetime.
    if (_telemetryLoopCount > 0) {
      console.error('[CRITICAL] Duplicate telemetry loop detected! loopCount=' + _telemetryLoopCount + ' — aborting duplicate.');
      return;
    }
    _telemetryLoopCount++;
    verboseLog('[PERF:TASK] name=telemetryLoop source=main.js interval=' + TELEMETRY_BASE_MS + 'ms reason=startup loopInstance=' + _telemetryLoopCount);
    if (_telemetryLoopCount > 1) {
      console.error('[CRITICAL] Duplicate telemetry loop detected! loopCount=' + _telemetryLoopCount + ' — this will double CPU usage. Aborting duplicate.');
      _telemetryLoopCount = Math.max(0, _telemetryLoopCount - 1);
      return;
    }
    while (_telemetryLoopActive) {
      if (!_telemetryLoopPaused && !_telemetryDemandPaused) {
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
        si.currentLoad().catch(e => { console.warn('[telemetry:poll] currentLoad error:', e.message); return { currentLoad: null, cpus: [] }; }),
        // Use Node's native physical-memory counters for the dashboard. On
        // Windows these come from GlobalMemoryStatusEx, the same available
        // physical-memory view used by Task Manager. systeminformation.mem()
        // can mix platform-specific fields and produce a visibly different
        // "used" value on some Windows builds.
        Promise.resolve({ total: os.totalmem(), available: os.freemem() }),
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
        // os.totalmem() is synchronous and near-zero cost. Add RAM pressure to the
        // low-end check — a 6-core laptop with 4 GB RAM is very common budget hardware
        // but would never trigger low-end mode on core count alone, even though RAM
        // pressure is often the bigger lag source for telemetry polling on such machines.
        const _totalRamGB = os.totalmem() / 1_073_741_824;
        if (_cores <= LOW_END_CORE_MAX || _totalRamGB <= 6) {
          _lowEndMode = true;
          console.log(`[telemetry:poll] Low-end mode ENABLED — cores=${_cores} ram=${_totalRamGB.toFixed(1)}GB`);
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
  
      if (
        _telemetryDemandMode !== 'paused' &&
        _telemetryDemandMode !== 'intelligence' &&
        !_overBudget &&
        !inCooldown
      ) {
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
          // Windows can return an object without usable counters instead of
          // rejecting. Treat that the same as null so disk activity does not
          // remain unavailable forever on machines where systeminformation's
          // disk counter provider is incomplete.
          // getDiskIOViaPowerShell returns per-second rates
          // (rIO_sec/wIO_sec/ms_sec), handled by the disksio-persec branch.
          if (!hasUsableDiskIO(rawDiskIO) && dashboardMountedAt > 0) {
            verboseLog('[telemetry:poll] disksIO had no usable counters — trying PowerShell fallback');
            rawDiskIO = await getDiskIOViaPowerShell().catch(() => null);
            if (rawDiskIO) verboseLog('[telemetry:poll] disksIO PowerShell fallback succeeded');
          } else if (!hasUsableDiskIO(rawDiskIO)) {
            verboseLog('[telemetry:poll] disksIO had no usable counters — PowerShell fallback deferred until dashboard mount');
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
      // Hysteresis prevents interval thrashing on a weak system that oscillates around
      // the old single threshold (very plausible — ~50% is exactly where low-end machines
      // cruise). Without it the interval can flip between 2s and 8s every other tick,
      // defeating the purpose of slow mode being *stable* under sustained load.
      // Engage at 60%, only disengage once CPU drops back below 35%.
      const GOVERNOR_ENGAGE_PCT    = 60;
      const GOVERNOR_DISENGAGE_PCT = 35;
      const _currentlySlow = _telemetryCurrentIntervalMs === TELEMETRY_SLOW_MS;
      const shouldBeSlow = _lowEndMode
        || cpuPct > GOVERNOR_ENGAGE_PCT
        || (_currentlySlow && cpuPct > GOVERNOR_DISENGAGE_PCT);
      const demandMs =
        _telemetryDemandMode === 'paused'
          ? TELEMETRY_SLOW_MS
          : _telemetryDemandMode === 'intelligence'
            ? 5000
            : TELEMETRY_BASE_MS;
      const targetMs = _telemetryDemandMode === 'paused'
        ? TELEMETRY_SLOW_MS
        : Math.max(demandMs, shouldBeSlow ? TELEMETRY_SLOW_MS : TELEMETRY_BASE_MS);
      if (targetMs !== _telemetryCurrentIntervalMs) {
        verboseLog(`[PERF:TASK] name=telemetryLoop — governor: cpu=${cpuPct.toFixed(0)}% lowEnd=${_lowEndMode} appCpu=${_appCpuPct.toFixed(1)}% → interval ${_telemetryCurrentIntervalMs}ms → ${targetMs}ms`);
        _telemetryCurrentIntervalMs = targetMs;
      }
    } catch (e) {
      console.error('[telemetry:poll] unexpected error:', e.message);
    }
  }
  
  // In-flight flag prevents a second startTelemetryPolling() call that arrives
  // during the ~1.5-2s prime window from passing the _telemetryLoopActive guard
  // (which is only set to true AFTER the prime completes).  Without this, two
  // callers that fire within the startup window both pass the guard and each
  // independently run the full expensive prime + GPU WMI sequence.
  let _telemetryStartInFlight = false;
  function _scheduleStartupTelemetryStart(reason) {
    if (_telemetryStartDelayTimer) clearTimeout(_telemetryStartDelayTimer);
    const logicalCores = os.cpus()?.length || 0;
    const totalRamGb = os.totalmem() / 1_073_741_824;
    const lowEndHardware = logicalCores > 0 &&
      (logicalCores <= LOW_END_CORE_MAX || totalRamGb <= 6);
    const delayMs = lowEndHardware ? 1500 : 500;
    verboseLog(`[telemetry:poll] startup prime scheduled in ${delayMs}ms | reason=${reason} cores=${logicalCores} ram=${totalRamGb.toFixed(1)}GB`);
    _telemetryStartDelayTimer = setTimeout(() => {
      _telemetryStartDelayTimer = null;
      startTelemetryPolling().catch(e => console.error('[telemetry:poll] error:', e.message));
    }, delayMs);
  }

  async function startTelemetryPolling() {
    // ── Singleton guard ────────────────────────────────────────────────────────
    // If the loop is already running OR a start is already in-flight, bail out.
    if (_telemetryLoopActive || _telemetryStartInFlight) {
      console.warn('[Perf] telemetry loop already active or starting, skipping duplicate start');
      return;
    }
    _telemetryStartInFlight = true;
    try {
    verboseLog('[telemetry:poll] priming differential APIs + pre-warming GPU sources...');
  
    // ── GPU pre-warm (fire-and-forget, runs in parallel with CPU/disk prime) ──
    // ONE-TIME GPU pre-warm — fires exactly once at startup, never repeats.
    // PowerShell perf counters have a 2-4s cold-start overhead on first call.
    // Seeding gpuState now ensures getLive() returns a valid load reading
    // from the first renderer call rather than waiting for the user to trigger
    // a manual refresh. The loop itself does NOT call getGpuPerfCounterLoad().
    //
    // FAST PATH: Win32_VideoController via WMI — completes in <1s, no DXGI.
    // Routed through psLimiter so it doesn't race with batchCheckAll / syncAll.
    // After the name resolves we know the vendor, so we gate si.graphics() below.
    if (process.platform === 'win32') {
      // Skip the redundant WMI spawn when enrichment has already populated wmiGpuModelName.
      // _runEnrichment() fires at whenReady (before createWindow); startTelemetryPolling()
      // runs after show() — so the GPU name is resolved on the vast majority of boots.
      // Saving one powershell.exe cold-start (~300ms–1s on weak CPUs/HDDs) from the boot
      // path is a direct, measurable win on exactly the low-end hardware we're targeting.
      if (skipStartupWmiGpu) {
        console.log('[GPU] WMI fast-path skipped — trusted recent specs cache hydrated GPU list');
      } else if (wmiGpuModelName) {
        console.log('[GPU] WMI fast-path skipped — already resolved by enrichment:', wmiGpuModelName);
      } else {
        console.log('[GPU] WMI fast-path requesting shared startup probe — t=' + Date.now());
        _getStartupWmiGpuRaw().then(rawFp => {
            if (rawFp) {
              // Parse delimited list: "Name1|vram1;;Name2|vram2"
              const fpEntries = rawFp.split(';;').map(e => {
                const p = e.trim().split('|');
                return { name: p[0]?.trim() || '', vramBytes: parseInt(p[1]?.trim() || '0', 10) };
              }).filter(e => e.name);
              if (fpEntries.length > 0) {
                wmiGpuList = fpEntries;
                const storedIdx = configStore.get('selectedGpuIndex', 0);
                selectedGpuIndex = Math.min(Math.max(0, storedIdx), wmiGpuList.length - 1);
              }
              const name = (wmiGpuList[selectedGpuIndex]?.name) || rawFp.split(';;')[0].split('|')[0].trim();
              gpuExistsOnHardware = true;
              wmiGpuModelName = name;
              console.log('[GPU] WMI fast-path resolved:', name, '| total GPUs:', wmiGpuList.length);
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
              // SECONDARY PATH: si.graphics() for VRAM — skip on AMD (DXGI hangs 4s).
              // Vendor is now known from WMI; only run for NVIDIA / Intel.
              const _isAmdGpu = name.toLowerCase().includes('amd') || name.toLowerCase().includes('radeon');
              if (!_isAmdGpu) {
                siWithTimeout(() => si.graphics(), 4_000, 'startup-graphics').then(gfx => {
                  const ctrl = gfx?.controllers?.find(c => c.model) ?? gfx?.controllers?.[0];
                  if (ctrl) {
                    gpuExistsOnHardware = true;
                    const memUsed  = ctrl.memoryUsed != null && ctrl.memoryUsed > 0 ? safeNum(ctrl.memoryUsed) : null;
                    const memTotal = ctrl.vram       != null && ctrl.vram       > 0 ? safeNum(ctrl.vram)       : null;
                    gpuState.vramTotalMb = gpuState.vramTotalMb ?? memTotal;
                    gpuState.vramUsedMb  = gpuState.vramUsedMb  ?? memUsed;
                    if (!gpuState.lastStaticUpdate) gpuState.lastStaticUpdate = Date.now();
                    verboseLog('[GPU] si.graphics VRAM seeded (NVIDIA/Intel path):', memTotal, 'MB');
                  }
                }).catch(() => {});
              } else {
                verboseLog('[GPU] si.graphics skipped for AMD — VRAM will come from WMI enrichment');
              }
            } else {
              console.warn('[GPU] WMI fast-path returned empty — shared probe unavailable');
              // AMD/unknown: still try si.graphics() as last resort (will timeout on AMD but won't block)
              siWithTimeout(() => si.graphics(), 4_000, 'startup-graphics-fallback').then(gfx => {
                const ctrl = gfx?.controllers?.find(c => c.model) ?? gfx?.controllers?.[0];
                if (ctrl) {
                  gpuExistsOnHardware = true;
                  const memUsed  = ctrl.memoryUsed != null && ctrl.memoryUsed > 0 ? safeNum(ctrl.memoryUsed) : null;
                  const memTotal = ctrl.vram       != null && ctrl.vram       > 0 ? safeNum(ctrl.vram)       : null;
                  gpuState.vramTotalMb = gpuState.vramTotalMb ?? memTotal;
                  gpuState.vramUsedMb  = gpuState.vramUsedMb  ?? memUsed;
                  if (!gpuState.lastStaticUpdate) gpuState.lastStaticUpdate = Date.now();
                }
              }).catch(() => {});
            }
          }).catch(() => {
            console.warn('[GPU] WMI fast-path shared probe failed');
          });
      } // end else — WMI fast-path (skipped when enrichment already resolved the GPU name)
    }
  
    // GPU load is available on-demand via telemetry:refreshGpuLoad (IPC) or when
    // the user opens the GPU section / AI advisor. Removed the startup PS spawn
    // that fired at 5s — it was a 2s PowerShell cold-start overlapping with
    // batchCheckAll and adding a CPU spike during early dashboard interaction.
  
    // First call to differential APIs always returns 0 — prime them and seed lastDiskSnapshot
    // so that the first real pollTelemetry() can compute disk deltas immediately.
    // Include si.mem() so we can pre-seed liveTelemetryCache immediately.
    const [primeCpuLoad, , primeDisksIO, primeMem] = await Promise.allSettled([
      si.currentLoad(),
      si.networkStats(),
      si.disksIO(),
      si.mem(),
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
    // Pre-seed liveTelemetryCache with CPU + RAM from the prime so that the
    // first getLive() call returns real values instead of "cache not ready — returning zeros".
    // Disk/network still show "warming" until the 1.5s window elapses and the
    // first real pollTelemetry() tick runs.
    if (primeCpuLoad.status === 'fulfilled' && primeCpuLoad.value &&
        primeMem.status === 'fulfilled' && primeMem.value) {
      liveTelemetryCache = {
        load: primeCpuLoad.value,
        mem: primeMem.value,
        temps: { main: null, max: null },
        fsData: [],
        netStats: [],
        diskIO: { available: false, source: 'warming' },
        timestamp: Date.now(),
      };
      verboseLog('[telemetry:poll] cache pre-seeded with CPU+RAM — getLive will not return zeros');
    }
    verboseLog('[telemetry:poll] prime done — waiting 1.5s for real readings...');
  
    // Wait 1.5s so differential APIs have a measurement window before the first
    // real poll.
    await new Promise(r => setTimeout(r, 1500));
    await pollTelemetry();
  
    _telemetryLoopActive = true;
    _telemetryLoop(); // fire-and-forget — loop awaits each poll before sleeping 1s
    verboseLog('[telemetry:poll] async loop started (sequential, no overlap possible)');
  } finally {
    // Always clear the in-flight flag — whether we completed normally or threw.
    _telemetryStartInFlight = false;
  }
  } // end async function startTelemetryPolling
  
  // Register protocol handler BEFORE app is ready
  let protocolRegistered = false;
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      protocolRegistered = app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    protocolRegistered = app.setAsDefaultProtocolClient(PROTOCOL_NAME);
  }
  console.log(`[Protocol] registered: ${protocolRegistered} | isDefault: ${app.isDefaultProtocolClient(PROTOCOL_NAME)} | isDev: ${isDev}`);
  
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
  
  let _windowCreated = false;
  
  function createWindow() {
    // Guard: prevent double-window creation when second-instance fires before
    // app.whenReady() runs (e.g. user double-clicks quickly while previous
    // launch is still initialising).  Without this guard both the
    // second-instance handler AND the whenReady block call createWindow(),
    // producing two windows and orphaning the first.
    if (_windowCreated) {
      const existing = BrowserWindow.getAllWindows()[0];
      if (existing) {
        if (existing.isMinimized()) existing.restore();
        if (!existing.isVisible()) existing.show();
        existing.focus();
      }
      return;
    }
    _windowCreated = true;
  
    verboseLog('[STARTUP:5] createWindow() ENTRY — devTools:', isDev ? 'enabled (dev)' : 'disabled (prod)');
    mainWindow = new BrowserWindow({
      title: isDev ? 'SwitchControl DEBUG BUILD' : 'SwitchControl',
      width: 1300,
      height: 800,
      // Zero-flash show pattern:
      //   transparent:true  — enables setOpacity() on Windows AND makes the DWM
      //                        surface transparent so no white init frame can slip
      //                        through. Without this, setOpacity() is a no-op on Win.
      //   backgroundColor:'#00000000' — required companion to transparent:true.
      //   show:false        — Chromium paints into a hidden surface.
      //   paintWhenInitiallyHidden:true — forces frame painting while hidden.
      //
      // _tryShowWindow() does: setOpacity(0) → show() → animate setOpacity 0→1
      // over 600ms with ease-out. Splash.tsx's double-rAF clears the CSS opacity
      // lock before the signal fires, so content is fully CSS-visible by the time
      // the OS-level opacity animation starts — giving a premium cross-fade from
      // desktop background to the dark Splash without any white frame.
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      thickFrame: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false, // Required for systeminformation
        devTools: isDev, // DevTools only in development — disabled in production builds
        backgroundThrottling: false, // Prevent timer throttling when window loses focus
        additionalArguments: isDev ? [] : ['--switchcontrol-prod'],
        paintWhenInitiallyHidden: true, // Ensure Chromium paints frames even while window is hidden
      }
    });
    console.log('[LAUNCH:1] BrowserWindow constructed — show:false, paintWhenInitiallyHidden:true, isVisible:', mainWindow.isVisible());
  
    // Apply DevTools lock immediately after window creation.
    lockDevTools(mainWindow);
  
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
    // hidden or unfocused — no UI is visible to consume the data anyway.
    function _pauseTelemetryLoop(reason) {
      if (_telemetryLoopPaused) return;
      _telemetryLoopPaused = true;
      console.log(`[Perf] ${reason} → pausing telemetry loop`);
    }
    mainWindow.on('minimize', () => {
      _pauseTelemetryLoop('minimized');
    });
    function _resumeTelemetryLoop(reason) {
      if (!_telemetryLoopPaused) return;
      _telemetryLoopPaused = false;
      console.log(`[Perf] ${reason} → resuming telemetry loop`);
    }
    mainWindow.on('hide', () => {
      _pauseTelemetryLoop('hidden');
    });
    mainWindow.on('blur', () => {
      _pauseTelemetryLoop('unfocused');
    });
    mainWindow.on('restore', () => {
      _resumeTelemetryLoop('restored');
    });
    mainWindow.on('show', () => {
      if (_telemetryLoopPaused) {
        _resumeTelemetryLoop('window show');
      }
    });
  
    // ── Launch handshake ─────────────────────────────────────────────────────────
    // Two-gate show pattern — eliminates the white flash on startup:
    //
    //   Gate A: ready-to-show  — Chromium has painted its first frame into the
    //           hidden surface (paintWhenInitiallyHidden:true). backgroundColor
    //           '#07090D' matches the HTML/preload color so the native DWM surface
    //           and the renderer layer are the same shade during init.
    //
    //   Gate B: app:first-frame-ready — Splash.tsx fires this via double-rAF
    //           AFTER the browser has composited its first dark frame to screen.
    //           useEffect alone runs before paint; double-rAF guarantees the
    //           Splash background is actually visible before we open the window.
    //
    // mainWindow.show() is called only when BOTH gates have passed, so the very
    // first frame the user sees is the dark, branded Splash — never a white frame.
    const _launchT0 = Date.now();
    const launchMs = () => `+${Date.now() - _launchT0}ms`;
  
    let _chromiumFrameReady = false;
    let _reactSplashReady   = false;
    let _windowShown        = false;
  
    function _tryShowWindow() {
      if (_windowShown || !_chromiumFrameReady || !_reactSplashReady) return;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      _windowShown = true;
      clearTimeout(_showFallbackTimer);
      _bm.windowShown = Date.now();
      // setOpacity(0) → show(): window is OS-invisible when shown, so DWM never
      // gets a chance to composite a white init frame. Then we animate setOpacity
      // from 0 → 1 over 600ms with ease-out so the window cross-fades from the
      // desktop background to the dark Splash — premium, no pop, no flash.
      // Splash.tsx's double-rAF cleared the CSS opacity lock before this fires,
      // so content is already at full CSS opacity during the OS-level fade.
      mainWindow.setOpacity(0);
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('app:window-shown');
      // Animate OS-level opacity 0 → 1 with ease-out over 600ms (~60fps)
      const _FADE_MS = 600;
      const _FADE_TICK = 16;
      let _fadeElapsed = 0;
      _fadeTimer = setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) { clearInterval(_fadeTimer); _fadeTimer = null; return; }
        _fadeElapsed += _FADE_TICK;
        const t = Math.min(1, _fadeElapsed / _FADE_MS);
        const eased = 1 - (1 - t) * (1 - t); // ease-out quad
        mainWindow.setOpacity(eased);
        if (t >= 1) { clearInterval(_fadeTimer); _fadeTimer = null; mainWindow.setOpacity(1); }
      }, _FADE_TICK);
      if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'undocked' });
      }
      console.log(`[LAUNCH:5] mainWindow.show() — both gates passed (chromium+react) | ${launchMs()}`);
      _bm.telemetryStart = Date.now();
      _scheduleStartupTelemetryStart('window-shown');
    }
  
    // Hard fallback: show after 5 s if either gate never fires (e.g. IPC lost).
    _showFallbackTimer = setTimeout(() => {
      _showFallbackTimer = null;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (!mainWindow.isVisible()) {
        console.warn(`[LAUNCH:FALLBACK] show gates timed out — force-showing | ${launchMs()}`);
        // Clear the CSS opacity lock in case Splash.tsx's double-rAF never fired.
        mainWindow.webContents.executeJavaScript(
          "try { document.documentElement.style.opacity = ''; } catch(e) {}"
        ).catch(() => {});
        mainWindow.setOpacity(0);
        mainWindow.show();
        mainWindow.focus();
        // Animate OS-level opacity 0→1 over 600ms (same as normal path)
        const _FADE_MS_FB = 600, _FADE_TICK_FB = 16;
        let _fbElapsed = 0;
        _fallbackFadeTimer = setInterval(() => {
          if (!mainWindow || mainWindow.isDestroyed()) { clearInterval(_fallbackFadeTimer); _fallbackFadeTimer = null; return; }
          _fbElapsed += _FADE_TICK_FB;
          const t = Math.min(1, _fbElapsed / _FADE_MS_FB);
          mainWindow.setOpacity(1 - (1 - t) * (1 - t));
          if (t >= 1) { clearInterval(_fallbackFadeTimer); _fallbackFadeTimer = null; mainWindow.setOpacity(1); }
        }, _FADE_TICK_FB);
        // Start telemetry polling only from inside the force-show branch — the normal
        // show-gate path already calls startTelemetryPolling() when both gates fire.
        // Calling it unconditionally here emits a spurious "already active, skipping
        // duplicate start" warning on every normal launch (the internal singleton guard
        // prevents a real double-loop, but the log noise masks genuine future bugs).
        _scheduleStartupTelemetryStart('show-fallback');
      }
    }, 5000);
  
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
      dashboardMountedAt = _bm.dashboardMounted;
      const rel = (t) => t ? `${t - _bm.whenReady}ms` : 'pending';
      console.log('[BOOT] ──────────────────────────────────────────');
      console.log(`[BOOT] firstFrameReady  = ${rel(_bm.firstFrameReady)}`);
      console.log(`[BOOT] windowShown      = ${rel(_bm.windowShown)}`);
      console.log(`[BOOT] telemetryStart   = ${rel(_bm.telemetryStart)}`);
      console.log(`[BOOT] dashboardMounted = ${rel(_bm.dashboardMounted)}`);
      console.log('[BOOT] ──────────────────────────────────────────');
    });
  
    // ── Gate A: Chromium first frame ─────────────────────────────────────────────
    // ready-to-show fires after Chromium has rendered its first frame into the
    // hidden surface (paintWhenInitiallyHidden:true). The native DWM layer is
    // '#07090D' (backgroundColor option), preload.js set the renderer background
    // to '#07090D', and index.html has a matching dark boot-shell — so all three
    // compositor layers are dark before this event fires.
    mainWindow.once('ready-to-show', () => {
      if (!mainWindow) return;
      _bm.firstFrameReady = Date.now();
      _chromiumFrameReady = true;
      console.log(`[LAUNCH:4] Gate A: ready-to-show (Chromium frame painted) | ${launchMs()}`);
      _tryShowWindow();
    });
  
    // ── Gate B: React Splash composited ──────────────────────────────────────────
    // Splash.tsx fires app:first-frame-ready via double-rAF, which guarantees the
    // Splash component's dark background (#07090D) has been composited to screen
    // before this IPC arrives. Combined with Gate A, mainWindow.show() is called
    // only after the first visible frame is guaranteed to be dark and branded.
    ipcMain.removeAllListeners('app:first-frame-ready');
    ipcMain.once('app:first-frame-ready', () => {
      if (!mainWindow) return;
      _reactSplashReady = true;
      console.log(`[LAUNCH:5] Gate B: app:first-frame-ready (React Splash composited) | ${launchMs()}`);
      _tryShowWindow();
    });
    mainWindow.on('closed', () => { 
      mainWindow = null; 
      rendererReady = false;
      _windowCreated = false; // allow createWindow() on next launch
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
      const token = psLimiter.tryAcquire({
        file: 'main.js',
        fn: 'getNvidiaGpuTemp',
        reason: 'nvidia-smi-temperature',
      });
      if (!token) return resolve(null);
      execFile(
        'nvidia-smi',
        ['--query-gpu=temperature.gpu', '--format=csv,noheader,nounits'],
        { windowsHide: true, timeout: 3000 },
        (err, stdout) => {
          psLimiter.release(token);
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
      const token = psLimiter.tryAcquire({
        file: 'main.js',
        fn: 'getNvidiaGpuLoad',
        reason: 'nvidia-smi-load',
      });
      if (!token) return resolve(null);
      execFile(
        'nvidia-smi',
        ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'],
        { windowsHide: true, timeout: 3000 },
        (err, stdout) => {
          psLimiter.release(token);
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

  // Increment the GPU perf-counter failure counter and engage the pause backoff
  // when the fail limit is reached.  Extracted to replace three identical inline blocks.
  function _recordGpuPerfFailure(reason) {
    gpuPerfCounterFailCount++;
    if (gpuPerfCounterFailCount >= GPU_PERF_COUNTER_MAX_FAILS && !gpuPerfCounterPausedUntil) {
      gpuPerfCounterPausedUntil = Date.now() + 5 * 60 * 1000;
      console.warn(`[GPU:perf] hit fail limit (${GPU_PERF_COUNTER_MAX_FAILS}) — pausing for 5min (${reason})`);
    }
  }
  
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
      return gpuState.load ?? null;
    }
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'getGpuPerfCounterLoad', reason: 'gpu-counter' });
    if (!_token) {
      verboseLog('[Telemetry] gpu_poll=skipped limiter_busy');
      return gpuState.load ?? null;
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
            _recordGpuPerfFailure('ps-error');
            console.warn(`[GPU:perf] PowerShell error (fail ${gpuPerfCounterFailCount}):`, err.message);
            return resolve(null);
          }
          try {
            const parsed = JSON.parse(stdout.trim());
            const max = parsed.max;
            if (!Number.isFinite(max) || max < 0) {
              _recordGpuPerfFailure('bad-max');
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
            _recordGpuPerfFailure('parse-error');
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
    const raw = await runMainPs(ps, { timeout: 7000, label: 'getDiskIOViaPowerShell' });
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.error) return null;
      return parsed;
    } catch { return null; }
  }

  function hasUsableDiskIO(value) {
    if (!value || typeof value !== 'object') return false;
    const cumulative =
      typeof value.rIO === 'number' && Number.isFinite(value.rIO) &&
      typeof value.wIO === 'number' && Number.isFinite(value.wIO);
    const perSecond =
      (typeof value.rIO_sec === 'number' && Number.isFinite(value.rIO_sec)) ||
      (typeof value.wIO_sec === 'number' && Number.isFinite(value.wIO_sec));
    return cumulative || perSecond;
  }
  
  // getGpuStatic() has been folded into gpuState — callers (none remaining in
  // steady-state) should read gpuState.vramTotalMb / gpuState.vramUsedMb directly.
  // The ALLOWED_SI_CALLERS entry for 'getGpuStatic' is kept for historical coverage.
  
  // ── Persistent Device ID — permanently derived from Windows' MachineGuid ──────
  // The ID is a hash of HKLM:\SOFTWARE\Microsoft\Cryptography\MachineGuid (see
  // hardware-fingerprint.js), so it survives uninstall, %appdata% deletion, and
  // factory reset. device-id.json is now a CACHE, not the source of truth: it is
  // verified against a freshly-recomputed hash every launch and overwritten when
  // stale. It also carries `legacyDeviceId` — the pre-permanent random ID —
  // until the server confirms the one-time history migration (see cloud-api.ts
  // x-legacy-device-id header + storage.migrateLegacyDeviceId on the server).
  const DEVICE_ID_REGEX = /^[A-F0-9]{16}$/;
  const hwFingerprint = require('./hardware-fingerprint');

  function _readDeviceIdCache() {
    const fs = require('fs');
    try {
      if (fs.existsSync(DEVICE_ID_FILE)) {
        const data = JSON.parse(fs.readFileSync(DEVICE_ID_FILE, 'utf-8'));
        if (data && typeof data === 'object') return data;
      }
    } catch (e) {
      console.warn('[DeviceID] Failed to read device-id cache:', e.message);
    }
    return null;
  }

  function _writeDeviceIdCache(obj) {
    const fs = require('fs');
    try {
      fs.writeFileSync(DEVICE_ID_FILE, JSON.stringify(obj), 'utf-8');
    } catch (e) {
      console.error('[DeviceID] Failed to write device-id cache:', e.message);
    }
  }

  let cachedDeviceId = null;
  let _deviceIdPromise = null;

  async function getOrCreatePermanentDeviceId() {
    if (cachedDeviceId) return cachedDeviceId;
    if (_deviceIdPromise) return _deviceIdPromise;
    _deviceIdPromise = (async () => {
      const cache = _readDeviceIdCache();
      const permanentId = await hwFingerprint.getPermanentDeviceId(); // null on failure

      if (permanentId) {
        let legacyDeviceId = (cache?.legacyDeviceId && DEVICE_ID_REGEX.test(cache.legacyDeviceId))
          ? cache.legacyDeviceId
          : null;
        // Capture the old random ID ONCE, before the cache is overwritten with the
        // permanent value — the server needs it to carry trial/premium history and
        // device locks forward to the new fingerprint-based ID.
        if (
          !legacyDeviceId &&
          cache?.deviceId &&
          DEVICE_ID_REGEX.test(cache.deviceId) &&
          cache.deviceId !== permanentId &&
          cache.source !== 'machine-guid-hash'
        ) {
          legacyDeviceId = cache.deviceId;
          console.log(`[DeviceID] Legacy random ID captured for one-time migration: ${legacyDeviceId}`);
        }
        if (!cache || cache.deviceId !== permanentId || (cache.legacyDeviceId ?? null) !== legacyDeviceId) {
          _writeDeviceIdCache({
            deviceId: permanentId,
            source: 'machine-guid-hash',
            ...(legacyDeviceId ? { legacyDeviceId } : {}),
            ...(cache?.legacyMigratedAt ? { legacyMigratedAt: cache.legacyMigratedAt } : {}),
            updatedAt: new Date().toISOString(),
          });
        }
        console.log(`[DeviceID] source=machine-guid-hash id=${permanentId}`);
        cachedDeviceId = permanentId;
        return permanentId;
      }

      // FAIL CLOSED — never generate a fresh random ID here: a random fallback
      // would silently reintroduce the resettable-identity bug. Prefer the last
      // known-good cached value; otherwise return null.
      if (cache?.deviceId && DEVICE_ID_REGEX.test(cache.deviceId)) {
        console.warn(`[DeviceID] source=cache-fallback (MachineGuid unavailable) id=${cache.deviceId}`);
        cachedDeviceId = cache.deviceId;
        return cache.deviceId;
      }
      console.error('[DeviceID] MachineGuid unavailable and no cached ID — failing closed (null)');
      return null;
    })().finally(() => { _deviceIdPromise = null; });
    return _deviceIdPromise;
  }
  
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
  
  // ── Post-update grace guard ───────────────────────────────────────────────────
  // The renderer reads this flag on startup to decide whether to defer the
  // premium-expiry revert check.  After an update, the user's JWT or session may
  // not have been re-validated yet, so triggering a revert on first launch would
  // incorrectly reset Windows tweaks for still-premium users.
  // The flag is set here when a version change is detected (main process knows
  // the previous and current version via configStore).  It is cleared by the
  // renderer after the first successful entitlement verification this session.
  ipcMain.handle('app:getPostUpdateGrace', () => {
    try {
      return {
        isPostUpdate: configStore.get('postUpdateGrace') === true,
        fromVersion:  configStore.get('previousVersion') ?? null,
        toVersion:    app.getVersion(),
      };
    } catch (e) {
      return { isPostUpdate: false, fromVersion: null, toVersion: app.getVersion() };
    }
  });
  
  ipcMain.handle('app:clearPostUpdateGrace', () => {
    try {
      configStore.del('postUpdateGrace');
      configStore.del('previousVersion');
      console.log('[UPDATE] Post-update grace cleared — first successful auth verification complete');
      return { ok: true };
    } catch (e) {
      console.warn('[UPDATE] Failed to clear post-update grace:', e?.message);
      return { ok: false };
    }
  });
  
  ipcMain.handle('app:getDeviceId', () => getOrCreatePermanentDeviceId());

  // Legacy random device ID (pre-permanent-fingerprint) — sent to the server as
  // x-legacy-device-id until the one-time history migration is confirmed, then
  // cleared via app:clearLegacyDeviceId.
  ipcMain.handle('app:getLegacyDeviceId', () => {
    const cache = _readDeviceIdCache();
    const legacy = cache?.legacyDeviceId;
    return (legacy && DEVICE_ID_REGEX.test(legacy)) ? legacy : null;
  });

  ipcMain.handle('app:clearLegacyDeviceId', () => {
    try {
      const cache = _readDeviceIdCache();
      if (cache?.legacyDeviceId) {
        delete cache.legacyDeviceId;
        cache.legacyMigratedAt = new Date().toISOString();
        _writeDeviceIdCache(cache);
        console.log('[DeviceID] Legacy device ID cleared — server migration confirmed');
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message };
    }
  });

  // Full 64-char SHA-256 hardware fingerprint (promo/anti-abuse). Never stored
  // on disk — recomputed from the registry each launch (in-memory cached).
  ipcMain.handle('app:getDeviceFingerprint', () => hwFingerprint.getDeviceFingerprint());
  
  // DEVICE_SIGNATURE_FILE is imported from user-data-paths at the top of this file.

  function getOrCreateDeviceSignature() {
    const fs = require('fs');
    try {
      if (fs.existsSync(DEVICE_SIGNATURE_FILE)) {
        const data = JSON.parse(fs.readFileSync(DEVICE_SIGNATURE_FILE, 'utf-8'));
        if (data.signature && typeof data.signature === 'string' && data.signature.length === 32) {
          return data.signature;
        }
      }
    } catch (e) {
      console.warn('[DeviceSignature] Failed to read stored signature:', e.message);
    }
    return null;
  }
  
  function saveDeviceSignature(signature) {
    const fs = require('fs');
    try {
      fs.writeFileSync(DEVICE_SIGNATURE_FILE, JSON.stringify({ signature, updatedAt: new Date().toISOString() }), 'utf-8');
      console.log('[DeviceSignature] Saved signature');
    } catch (e) {
      console.error('[DeviceSignature] Failed to save signature:', e.message);
    }
  }
  
  let cachedDeviceSignature = null;
  
  ipcMain.handle('app:getDeviceSignature', () => {
    if (!cachedDeviceSignature) cachedDeviceSignature = getOrCreateDeviceSignature();
    return cachedDeviceSignature;
  });
  
  ipcMain.handle('app:setDeviceSignature', (_event, signature) => {
    if (typeof signature !== 'string' || signature.length !== 32) {
      console.warn('[DeviceSignature] Invalid signature format');
      return false;
    }
    cachedDeviceSignature = signature;
    saveDeviceSignature(signature);
    return true;
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
          // The helper changes process working sets, but the background
          // telemetry cache still contains the pre-clean sample. Invalidate
          // that RAM portion before resolving IPC so the renderer's immediate
          // refresh observes the post-clean OS value.
          if (liveTelemetryCache) {
            liveTelemetryCache = {
              ...liveTelemetryCache,
              mem: { total: os.totalmem(), available: os.freemem() },
              timestamp: Date.now(),
            };
          }
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
  
  ipcMain.handle('app:resetData', async (_event, confirmation) => {
    if (confirmation !== FACTORY_RESET_CONFIRMATION) {
      console.warn('[Reset] Rejected: missing or incorrect confirmation token');
      return { ok: false, error: 'confirmation_required' };
    }
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
  
  // ── Driver Intelligence: smart vendor-app detection + launch ─────────────────
  // Detect-and-redirect only. Renderer passes an appKey from a fixed allowlist
  // (never a path); main resolves and launches the official vendor tool itself.
  let driverApps = null;
  try {
    driverApps = require('./driver-apps-helper');
  } catch (e) {
    console.error('[driver-apps] failed to load driver-apps-helper:', e?.message, '— detect/launch will be no-ops');
  }
  
  ipcMain.handle('driverApps:detect', async (_event, appKey) => {
    try {
      if (!driverApps || typeof appKey !== 'string' || !driverApps.isKnownAppKey(appKey)) {
        return { installed: false, appKey: null, display: null };
      }
      return await driverApps.detect(appKey);
    } catch (e) {
      console.warn('[driver-apps] detect failed:', e?.message);
      return { installed: false, appKey: null, display: null };
    }
  });
  
  ipcMain.handle('driverApps:launch', async (_event, appKey) => {
    try {
      if (!driverApps || typeof appKey !== 'string' || !driverApps.isKnownAppKey(appKey)) {
        return { launched: false, reason: 'invalid-key' };
      }
      return await driverApps.launch(appKey);
    } catch (e) {
      console.warn('[driver-apps] launch failed:', e?.message);
      return { launched: false, reason: 'launch-failed' };
    }
  });

  // ── Driver Intelligence: read installed driver versions from registry ─────────
  // Queries four device-class registry keys (Display, Net, Media, Bluetooth) so
  // the client can show real installed versions for GPU, WiFi, Ethernet, Audio,
  // and Bluetooth — not just GPU.  Uses direct registry reads (not WMI) so it
  // works even on heavy-WMI AMD systems where CimInstance queries time out.
  ipcMain.handle('driverIntel:getInstalledVersions', async () => {
    if (process.platform !== 'win32') return {};

    // Flat sequential script — one section per device class so there is no
    // switch-inside-ForEach-inside-foreach nesting that can behave oddly on
    // some PS versions.  Bracket notation ($result['key']) is used throughout
    // because it is more reliable than dot notation inside pipeline blocks.
    const ps = `
$result = @{}

function Read-DeviceClass($classPath) {
  if (-not (Test-Path $classPath)) { return }
  Get-ChildItem $classPath -EA SilentlyContinue |
    Where-Object { $_.PSChildName -match '^\\d+$' } |
    ForEach-Object {
      try {
        $v = (Get-ItemProperty $_.PSPath -Name DriverVersion -EA Stop).DriverVersion
        $n = (Get-ItemProperty $_.PSPath -Name DriverDesc    -EA SilentlyContinue).DriverDesc
        if ($v -and $n) { [PSCustomObject]@{ Version=$v; Desc=$n.ToLower() } }
      } catch {}
    }
}

# ── GPU (Display class) ───────────────────────────────────────────────────────
$gcGpu = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
Read-DeviceClass $gcGpu | ForEach-Object {
  $d = $_.Desc; $v = $_.Version
  if     ($d -match 'amd|radeon')                                        { if (-not $result['amd_gpu'])   { $result['amd_gpu']   = $v } }
  elseif ($d -match 'nvidia|geforce')                                    { if (-not $result['nvidia_gpu'])  {
      $ver = $v -replace '.*\\.', ''
      $result['nvidia_gpu'] = if ($ver.Length -ge 5) { $ver.Substring(0,$ver.Length-2)+'.'+$ver.Substring($ver.Length-2) } else { $v }
  }}
  elseif ($d -match 'intel.*graphics|intel.*uhd|intel.*iris|intel.*xe') { if (-not $result['intel_gpu'])  { $result['intel_gpu']  = $v } }
}

# ── Network (Net class) ───────────────────────────────────────────────────────
$gcNet = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e975-e325-11ce-bfc1-08002be10318}'
Read-DeviceClass $gcNet | ForEach-Object {
  $d = $_.Desc; $v = $_.Version
  if     ($d -match 'wi-fi|wifi|wireless|wlan|802\\.11|fastconnect|airlink') { if (-not $result['wifi'])     { $result['wifi']     = $v } }
  elseif ($d -match 'ethernet|pci.*e[0-9]|killer|realtek.*pci|intel.*i[0-9]|i225|i226') { if (-not $result['ethernet']) { $result['ethernet'] = $v } }
}

# ── Audio / Media (Media class) ───────────────────────────────────────────────
$gcMedia = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e96c-e325-11ce-bfc1-08002be10318}'
Read-DeviceClass $gcMedia | ForEach-Object {
  $d = $_.Desc; $v = $_.Version
  if ($d -match 'audio|sound|realtek|hd audio|ac97|high definition') { if (-not $result['audio']) { $result['audio'] = $v } }
}

# ── Bluetooth ─────────────────────────────────────────────────────────────────
$gcBt = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}'
Read-DeviceClass $gcBt | ForEach-Object {
  $d = $_.Desc; $v = $_.Version
  if ($d -match 'bluetooth') { if (-not $result['bluetooth']) { $result['bluetooth'] = $v } }
}

# ── NVIDIA canonical version via nvidia-smi (overrides WHQL registry string) ─
try {
  $smi = & 'nvidia-smi' --query-gpu=driver_version --format=csv,noheader 2>$null
  if ($smi -and $smi.Trim()) { $result['nvidia_gpu'] = $smi.Trim() }
} catch {}

ConvertTo-Json -InputObject $result -Compress -Depth 2
`.trim();

    // Retry up to 3× with 2 s delay — psLimiter slots may all be occupied by
    // startup WMI queries on AMD/heavy-WMI systems.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
      const raw = await runMainPs(ps, { timeout: 15_000, label: 'driverIntel:getInstalledVersions' });
      if (raw) {
        try { return JSON.parse(raw); }
        catch { return {}; }
      }
    }
    return {};
  });

  ipcMain.handle('system:getInfo', () => ({
    platform: process.platform,
    arch: os.arch(),
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem()
  }));
  
  // Fast audio device name probe — used as a fallback when si.audio() times out on
  // AMD systems. Uses Get-PnpDevice (PnP Manager, not WMI) which is fast even on
  // systems where Win32_SoundDevice WMI queries hang indefinitely.
  // Returns { name: string | null }.
  ipcMain.handle('system:getAudioDevice', async () => {
    if (process.platform !== 'win32') return { name: null };
    // Try MEDIA class first (sound cards/codecs), then AudioEndpoint (rendered devices).
    // Get-PnpDevice does NOT use WMI — it calls the PnP Manager directly.
    const cmd = [
      '$d = Get-PnpDevice -Class MEDIA -Status OK -ErrorAction SilentlyContinue | Select-Object -First 1;',
      'if ($d) { $d.FriendlyName }',
      'else {',
      '  $d2 = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue | Select-Object -First 1;',
      '  if ($d2) { $d2.FriendlyName }',
      '}',
    ].join(' ');
    const name = await runMainPs(cmd, { timeout: 4_000, label: 'system:getAudioDevice' }) || null;
    return { name };
  });
  
  // Bluetooth radio name via PnP — used as a reliable fallback when WMI audio/NIC
  // queries time out. Get-PnpDevice -Class Bluetooth queries the PnP Manager directly
  // (not WMI) and returns the actual Bluetooth radio installed in the system,
  // e.g. "Intel(R) Wireless Bluetooth(R)" or "Realtek Bluetooth Adapter".
  // This is far more accurate than guessing from the wireless NIC adapter name.
  // Returns { name: string | null }.
  ipcMain.handle('system:getBluetoothDevice', async () => {
    if (process.platform !== 'win32') return { name: null };
    const cmd = [
      '$d = Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue |',
      '  Where-Object { $_.Description -notmatch "enumerator|hub|root|port|hid|avrcp" } |',
      '  Select-Object -First 1;',
      'if ($d) { $d.FriendlyName ?? $d.Description } else { "" }',
    ].join(' ');
    const name = await runMainPs(cmd, { timeout: 4_000, label: 'system:getBluetoothDevice' }) || null;
    return { name };
  });
  
  // Motherboard info via registry — instant, no WMI/PowerShell process spawn.
  // HKLM:\HARDWARE\DESCRIPTION\System\BIOS is populated by the firmware on boot
  // and is always available without any driver query. Used as a fast fallback
  // when si.baseboard() WMI calls time out (common on AMD X670/X870 platforms).
  // Returns { manufacturer: string | null, model: string | null }.
  ipcMain.handle('system:getMotherboard', async () => {
    if (process.platform !== 'win32') return { manufacturer: null, model: null };
    const cmd = [
      '$p = "HKLM:\\HARDWARE\\DESCRIPTION\\System\\BIOS";',
      '$r = Get-ItemProperty $p -ErrorAction SilentlyContinue;',
      'if ($r) {',
      '  [PSCustomObject]@{ manufacturer = $r.BaseBoardManufacturer; model = $r.BaseBoardProduct } | ConvertTo-Json -Compress',
      '} else { \'{"manufacturer":null,"model":null}\' }',
    ].join(' ');
    const raw = await runMainPs(cmd, { timeout: 2_000, label: 'system:getMotherboard' });
    try {
      const parsed = JSON.parse(raw || '{}');
      return { manufacturer: parsed.manufacturer ?? null, model: parsed.model ?? null };
    } catch {
      return { manufacturer: null, model: null };
    }
  });
  
  /** Race a systeminformation call against a timeout so the renderer never hangs. */
  function siWithTimeout(fn, ms = 5_000, label = 'si call') {
    // A timed-out systeminformation call may continue running underneath the
    // timeout. Do not start another call for the same operation while it is
    // still in flight (particularly important for WMI-backed calls).
    if (!siWithTimeout._inFlight) siWithTimeout._inFlight = new Map();
    const existing = siWithTimeout._inFlight.get(label);
    if (existing) return existing;
    let timer;
    const promise = Promise.resolve().then(fn).finally(() => {
      clearTimeout(timer);
      if (siWithTimeout._inFlight.get(label) === promise) siWithTimeout._inFlight.delete(label);
    });
    const timed = Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
    siWithTimeout._inFlight.set(label, timed);
    return timed;
  }
  
  // ── Specs disk cache ──────────────────────────────────────────────────────────
  // Saves enriched hardware specs to disk after the first successful enrichment.
  // On subsequent launches the cache is loaded instantly — zero WMI/si calls.
  // Cache is served as-is when < 4h old; refreshed in background when 4-24h old;
  // ignored and re-probed when > 24h old (e.g. hardware change after Windows Update).
  
  function _loadSpecsFromDisk() {
    try {
      if (!fs.existsSync(SPECS_CACHE_FILE)) return null;
      const raw = JSON.parse(fs.readFileSync(SPECS_CACHE_FILE, 'utf8'));
      if (!raw || typeof raw._savedAt !== 'number' || !raw.cpu || !raw.gpu) return null;
      const age = Date.now() - raw._savedAt;
      if (age > SPECS_DISK_IGNORE_AGE_MS) {
        verboseLog('[Enrich] disk cache too old (' + Math.round(age / 3600000) + 'h) — ignored');
        return null;
      }
      // Refresh RAM from OS — usage changes every boot, totalmem can change with hardware swaps
      const total = os.totalmem();
      const free  = os.freemem();
      // Fix stale disk-cached VRAM that may have been saved with WMI's 32-bit cap
      let cachedGpu = raw.gpu;
      if (cachedGpu?.model) {
        const lookupVram = lookupGpuVram(cachedGpu.model);
        if (lookupVram != null && lookupVram !== cachedGpu.vramGB) {
          console.log(`[Enrich] disk-cache VRAM override — was ${cachedGpu.vramGB}GB, corrected to ${lookupVram}GB for "${cachedGpu.model}"`);
          cachedGpu = { ...cachedGpu, vramGB: lookupVram };
        }
      }
      const specs = {
        ...raw,
        gpu: cachedGpu,
        ram: {
          totalGB: parseFloat((total / 1073741824).toFixed(1)),
          usedGB:  parseFloat(Math.max(0, (total - free) / 1073741824).toFixed(1)),
          freeGB:  parseFloat((free  / 1073741824).toFixed(1)),
        },
        _partial:        false,
        _fromDiskCache:  true,
        _diskCacheAgeMs: age,
      };
      console.log('[Enrich] disk cache hit — age ' + Math.round(age / 60000) + 'min | GPU: ' + (specs.gpu?.model || '?'));
      return specs;
    } catch (e) {
      verboseLog('[Enrich] disk cache read error:', e.message);
      return null;
    }
  }
  
  function _saveSpecsToDisk(specs) {
    try {
      if (!specs || specs._partial) return;
      if (!fs.existsSync(APPDATA_DIR)) fs.mkdirSync(APPDATA_DIR, { recursive: true });
      const toSave = {
        cpu:    specs.cpu,
        gpu:    specs.gpu,
        gpuList: wmiGpuList,
        selectedGpuIndex,
        ram:    specs.ram,
        system: specs.system,
        disk:   specs.disk,
        disks:  specs.disks,
        _appVersion: app.getVersion(),
        _savedAt: Date.now(),
      };
      fs.writeFileSync(SPECS_CACHE_FILE, JSON.stringify(toSave), 'utf8');
      verboseLog('[Enrich] specs saved to disk cache');
    } catch (e) {
      console.warn('[Enrich] disk cache write failed:', e.message);
    }
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
        vramGB:   null,
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
      disk:  { name: 'C:', usedGB: null, totalGB: null, usePercent: null },
      disks: [],
      _partial: true, // enrichment still in-flight
    };
  }
  
  // ── Background enrichment — GPU (WMI), then CPU+disk deferred ────────────────
  // Two-stage to avoid PS saturation at startup:
  //   Stage 1 (immediate): WMI GPU via psLimiter — resolves in <2s, no DXGI hang.
  //                        si.graphics() removed — it hangs 3-4s on AMD systems.
  //   Stage 2 (deferred 3s): si.cpu() + si.fsSize() — run after batchCheckAll/
  //                           syncAll PS calls have finished, then save to disk.
  let _enrichmentInFlight = null; // null | Promise<void> — deduplicates concurrent callers

  function _enrichSpecsInBackground() {
    if (_enrichmentInFlight) return _enrichmentInFlight;
    _enrichmentInFlight = _runEnrichment();
    return _enrichmentInFlight;
  }

  async function _runEnrichment() {
    const _t0 = Date.now();
    console.log('[Enrich] background enrichment start');
    try {
      // ── Stage 1: GPU via WMI only (fast, psLimiter-gated, no DXGI) ───────────
      let gpuModel = null, gpuVendor = null, gpuVramGB = 0, gpuIsNvidia = false;
  
      if (process.platform === 'win32') {
        const wmiGpuRaw = await _getStartupWmiGpuRaw();
        if (!wmiGpuRaw && wmiGpuModelName) {
          console.log('[Enrich] shared GPU WMI probe unavailable — using startup fast-path fallback');
        }
  
        if (wmiGpuRaw) {
          // Parse all GPUs from delimited list (sorted VRAM desc)
          const gpuEntries = wmiGpuRaw.split(';;').map(e => {
            const p = e.trim().split('|');
            return { name: p[0]?.trim() || '', vramBytes: parseInt(p[1]?.trim() || '0', 10) };
          }).filter(e => e.name);
          if (gpuEntries.length > 0 && wmiGpuList.length === 0) {
            wmiGpuList = gpuEntries;
            const storedIdx = configStore.get('selectedGpuIndex', 0);
            selectedGpuIndex = Math.min(Math.max(0, storedIdx), wmiGpuList.length - 1);
          }
          const selEntry = wmiGpuList[selectedGpuIndex] || gpuEntries[0];
          const rawName = selEntry?.name;
          const wmiRamBytes = selEntry?.vramBytes || 0;
          if (rawName) {
            gpuModel = rawName;
            if (wmiRamBytes > 0) gpuVramGB = parseFloat((wmiRamBytes / 1073741824).toFixed(1));
            const ml = gpuModel.toLowerCase();
            gpuVendor   = ml.includes('nvidia') ? 'NVIDIA'
                        : (ml.includes('amd') || ml.includes('radeon')) ? 'AMD'
                        : ml.includes('intel') ? 'Intel' : null;
            gpuIsNvidia = ml.includes('nvidia');
            // Override WMI's 32-bit-capped AdapterRAM with known ground-truth VRAM
            const lookupVram = lookupGpuVram(gpuModel);
            if (lookupVram != null && lookupVram !== gpuVramGB) {
              console.log(`[Enrich] VRAM override — WMI reported ${gpuVramGB}GB, lookup corrected to ${lookupVram}GB for "${gpuModel}"`);
              gpuVramGB = lookupVram;
            }
            console.log(`[Enrich] Stage 1 GPU — model:${gpuModel} | VRAM:${gpuVramGB.toFixed(1)}GB | +${Date.now() - _t0}ms`);
          }
        }
      }
  
      // Final fallback: startup WMI fast-path name (set by startTelemetryPolling)
      if (!gpuModel && wmiGpuModelName) {
        gpuModel = wmiGpuModelName;
        const ml = gpuModel.toLowerCase();
        gpuVendor   = ml.includes('nvidia') ? 'NVIDIA'
                    : (ml.includes('amd') || ml.includes('radeon')) ? 'AMD'
                    : ml.includes('intel') ? 'Intel' : null;
        gpuIsNvidia = ml.includes('nvidia');
        console.log('[Enrich] Stage 1 GPU: startup fast-path fallback —', gpuModel);
      }
  
      if (cachedSpecs) {
        cachedSpecs = {
          ...cachedSpecs,
          gpu: {
            model:    gpuModel    || cachedSpecs.gpu?.model || 'Unavailable',
            vendor:   gpuVendor   || cachedSpecs.gpu?.vendor || 'Unavailable',
            vramGB:   gpuVramGB   || cachedSpecs.gpu?.vramGB || 0,
            isNvidia: gpuIsNvidia,
          },
          _partial: false,
        };
        cachedSpecsTime = Date.now();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('specs:enriched', { gpu: cachedSpecs.gpu, cpu: cachedSpecs.cpu });
          console.log(`[Enrich] Stage 1 pushed to renderer — GPU:${cachedSpecs.gpu.model} +${Date.now() - _t0}ms`);
        }
      }
  
      // ── Stage 2: CPU details + disk (deferred 3s) ─────────────────────────────
      // si.cpu() gives physicalCores/exact-speed; si.fsSize() gives disk sizes.
      // Neither is needed for the main Dashboard display — they serve Driver Intel
      // and the disk widget.  Waiting 3s lets batchCheckAll/syncAll PS calls finish.
      await new Promise(r => setTimeout(r, 3000));
      if (!cachedSpecs) return; // window closed while waiting
  
      const [cpuResult, fsResult] = await Promise.allSettled([
        siWithTimeout(() => si.cpu(),    5_000, 'enrich.cpu'),
        siWithTimeout(() => si.fsSize(), 8_000, 'enrich.fsSize'),
      ]);
  
      const cpuSi  = cpuResult.status === 'fulfilled' ? cpuResult.value : null;
      const fsData = fsResult.status  === 'fulfilled' ? fsResult.value  : [];
  
      const disks = (fsData || []).map(d => {
        const pct = safeNum(d.use || 0);
        return {
          mount:       d.mount || 'Unknown',
          name:        d.fs    || d.mount || 'Unknown',
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
            model:   cpuSi.brand        || cachedSpecs.cpu.model,
            cores:   cpuSi.physicalCores || cachedSpecs.cpu.cores,
            threads: cpuSi.cores        || cachedSpecs.cpu.threads,
            speed:   cpuSi.speed        ? `${safeNum(cpuSi.speed)} GHz` : cachedSpecs.cpu.speed,
          } : cachedSpecs.cpu,
          disk:  disks[0] || cachedSpecs.disk,
          disks,
          _partial: false,
        };
        cachedSpecsTime = Date.now();
        console.log(`[Enrich] Stage 2 done — CPU+disk ready +${Date.now() - _t0}ms`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('specs:enriched', {
            gpu:   cachedSpecs.gpu,
            cpu:   cachedSpecs.cpu,
            disk:  cachedSpecs.disk,
            disks: cachedSpecs.disks,
          });
        }
        // Persist to disk — next launch reads instantly, zero WMI/si calls
        _saveSpecsToDisk(cachedSpecs);
      }
    } catch (e) {
      console.warn('[Enrich] error:', e.message || e);
    } finally {
      _enrichmentInFlight = null;
    }
  }
  
  // ── loadSystemSpecs — disk cache first, then instant OS build, then enrich ───
  // Boot path (priority order):
  //   1. Disk cache < 4h  → serve instantly, no WMI/si calls at all.
  //   2. Disk cache 4-24h → serve instantly, fire background enrichment.
  //   3. No/stale cache   → _buildInstantSpecs() (sync <1ms), fire enrichment.
  // Home.tsx calls this with an 8s timeout — by then enrichment is always done.
  async function loadSystemSpecs({ deferEnrichment = false } = {}) {
    const now = Date.now();
  
    // Return fully-enriched in-memory cache if still fresh (normal hot-path)
    if (cachedSpecs && !cachedSpecs._partial && (now - cachedSpecsTime) < SPECS_CACHE_TTL) {
      return cachedSpecs;
    }
  
    // First call — try disk cache before running any WMI/si probes
    if (!cachedSpecs) {
      const diskCache = _loadSpecsFromDisk();
      if (diskCache) {
        cachedSpecs     = diskCache;
        cachedSpecsTime = now;
        const _currentAppVersion = app.getVersion();
        const _configuredGpuIndex = Math.max(0, Number(configStore.get('selectedGpuIndex', 0)) || 0);
        const _cachedGpuList = Array.isArray(diskCache.gpuList)
          ? diskCache.gpuList.filter(g => g && typeof g.name === 'string' && g.name.trim())
          : [];
        const _cachedSelectedIndex = Number.isInteger(diskCache.selectedGpuIndex)
          ? diskCache.selectedGpuIndex
          : -1;
        const _cachedSelectedGpu = _cachedGpuList[_cachedSelectedIndex]?.name?.trim() || '';
        const _cacheVersionMatches = diskCache._appVersion === _currentAppVersion;
        const _cacheSelectionMatches = _cachedSelectedIndex === _configuredGpuIndex;
        const _cacheGpuMatchesSelection = !!_cachedSelectedGpu &&
          _cachedSelectedGpu === String(diskCache.gpu?.model || '').trim();

        // Hydrate multi-GPU state before the renderer can request it. This lets
        // a trusted cache skip redundant startup WMI enumeration without
        // breaking gpu:listAll or selected-GPU behavior.
        if (diskCache._diskCacheAgeMs < SPECS_DISK_SERVE_AGE_MS &&
            _cacheVersionMatches && _cacheSelectionMatches && _cacheGpuMatchesSelection) {
          wmiGpuList = _cachedGpuList;
          selectedGpuIndex = Math.min(_configuredGpuIndex, wmiGpuList.length - 1);
          wmiGpuModelName = wmiGpuList[selectedGpuIndex]?.name || diskCache.gpu.model;
          gpuExistsOnHardware = !!wmiGpuModelName;
          skipStartupWmiGpu = true;
          console.log('[GPU] trusted specs cache — startup WMI probe eligible to skip | version:', _currentAppVersion,
            '| selected index:', selectedGpuIndex, '| GPUs:', wmiGpuList.length);
        } else {
          skipStartupWmiGpu = false;
          console.log('[GPU] specs cache requires startup WMI probe | age:', Math.round(diskCache._diskCacheAgeMs / 60000) + 'min',
            '| versionMatch:', _cacheVersionMatches, '| selectionMatch:', _cacheSelectionMatches,
            '| gpuMatch:', _cacheGpuMatchesSelection);
        }
        // Verify cached GPU matches the user's selected GPU index.
        // If they differ (GPU swap, or user changed selection while app was closed), re-enrich.
        const _cachedGpuName = diskCache?.gpu?.model;
        const _selectedName  = wmiGpuList[selectedGpuIndex]?.name;
        if (_selectedName && _cachedGpuName && _cachedGpuName !== _selectedName &&
            _cachedGpuName !== 'Detecting…' && _cachedGpuName !== 'Unavailable') {
          console.log('[SwitchControl] GPU selection mismatch — cached:', _cachedGpuName, '| selected:', _selectedName, '— invalidating');
          _invalidateGpuCache();
        }
        // Background refresh only when cache is getting old (>4h) so hardware
        // changes (new GPU, Windows Update) are eventually reflected.
        if (diskCache._diskCacheAgeMs > SPECS_DISK_SERVE_AGE_MS && !deferEnrichment) {
          console.log('[SwitchControl] Disk cache stale (>' + Math.round(SPECS_DISK_SERVE_AGE_MS / 3600000) + 'h) — background refresh');
          void _enrichSpecsInBackground();
        }
        return cachedSpecs;
      }
  
      // No disk cache — build instant result (sync OS APIs only, <1ms), then
      // fire background enrichment for GPU/disk/full-CPU.
      cachedSpecs = _buildInstantSpecs();
      // If the startup WMI fast-path already resolved (race window ~0-2s),
      // apply GPU name immediately so callers never see "Detecting…".
      if (wmiGpuModelName) {
        const _ml = wmiGpuModelName.toLowerCase();
        const _vendor = _ml.includes('nvidia') ? 'NVIDIA'
                      : (_ml.includes('amd') || _ml.includes('radeon')) ? 'AMD'
                      : _ml.includes('intel') ? 'Intel' : cachedSpecs.gpu.vendor;
        cachedSpecs = {
          ...cachedSpecs,
          gpu: { ...cachedSpecs.gpu, model: wmiGpuModelName, vendor: _vendor, isNvidia: _ml.includes('nvidia') },
        };
        console.log('[SwitchControl] Instant specs: WMI fast-path GPU already ready —', wmiGpuModelName);
      }
      cachedSpecsTime = now;
      console.log('[SwitchControl] Instant specs (sync):', cachedSpecs.cpu.model, '| GPU:', cachedSpecs.gpu.model,
        deferEnrichment ? '| enrichment deferred until renderer request' : '| enrichment starting…');
      if (!deferEnrichment) void _enrichSpecsInBackground();
      return cachedSpecs;
    }
  
    // Enrichment in-flight — return partial result, caller will retry on specs:enriched
    if (cachedSpecs._partial) {
      // The prewarm path intentionally creates only the synchronous partial
      // snapshot. The first renderer request must be the point that starts
      // WMI/systeminformation enrichment, otherwise cold boot work competes
      // with Chromium and the backend before a window is visible.
      if (!deferEnrichment && !_enrichmentInFlight) {
        void _enrichSpecsInBackground();
      }
      return cachedSpecs;
    }
  
    // In-memory TTL expired (>5min) — background refresh, return stale for now
    if ((now - cachedSpecsTime) >= SPECS_CACHE_TTL) {
      void _enrichSpecsInBackground();
    }
  
    return cachedSpecs;
  }
  
  ipcMain.handle('system:loadSpecs', async () => {
    return await loadSystemSpecs();
  });
  
  // App icon handler — used by Process Manager and Startup pages
  ipcMain.handle('appIcons:forPath', async (_event, filePath) => {
    return getIconDataUrlForPath(filePath);
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
    const gpuTemp = gpuState.temp;
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
        siWithTimeout(() => si.mem(),       6_000, 'hwTelemetry.mem').catch(() => ({ total: 0, available: 0 })),
        siWithTimeout(() => si.memLayout(), 10_000, 'hwTelemetry.memLayout').catch(() => []),
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
        siWithTimeout(() => si.graphics(),       10_000, 'deepHw.graphics'),
        siWithTimeout(() => si.cpuTemperature(),  5_000, 'deepHw.cpuTemp'),
        siWithTimeout(() => si.memLayout(),       10_000, 'deepHw.memLayout'),
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
  
  // Display info — comprehensive per-monitor detection engine.
  // Sources: WmiMonitorID, WmiMonitorConnectionParams, WmiMonitorSupportedDisplayFeatures,
  // Win32_VideoController, System.Windows.Forms.Screen, registry (EDID, HDR, VRR).
  // 45s TTL cache — WMI + registry reads are expensive. display:invalidateCache clears it.
  let _displayInfoCache = null;
  let _displayInfoCachedAt = 0;
  let _displayInfoInFlight = null; // Promise dedup — prevents parallel PS scripts
  const DISPLAY_INFO_TTL_MS = 45_000;
  
  ipcMain.handle('system:getDisplayInfo', async () => {
    if (process.platform !== 'win32') return { monitors: [] };
    const now = Date.now();
    if (_displayInfoCache && (now - _displayInfoCachedAt) < DISPLAY_INFO_TTL_MS) {
      return _displayInfoCache;
    }
    if (_displayInfoInFlight) return _displayInfoInFlight;
    _displayInfoInFlight = _runDisplayInfoPs().finally(() => { _displayInfoInFlight = null; });
    return _displayInfoInFlight;
  });

  async function _runDisplayInfoPs() {
    if (process.platform !== 'win32') return { monitors: [] };
  
    // ── Comprehensive multi-monitor detection script ─────────────────────────
    // Sources combined per monitor:
    //   WmiMonitorID          → name, manufacturer, serial
    //   WmiMonitorConnectionParams → connection type (DP/HDMI/DVI/eDP)
    //   WmiMonitorSupportedDisplayFeatures → VRR capable, VRR range
    //   Win32_VideoController → GPU name, current resolution, refresh, bit depth
    //   System.Windows.Forms.Screen → screen geometry + primary flag
    //   Registry EDID         → native resolution, EDID version
    //   Registry (HKCU VideoSettings, GPU class) → HDR enabled, VRR/FreeSync enabled
    const ps = `
  Set-StrictMode -Off
  $out = @{ monitors = @(); scannedAt = [int64](([datetime]::UtcNow - [datetime]'1970-01-01').TotalMilliseconds) }
  
  function Dec($bytes) {
    try { $b = $bytes | Where-Object { $_ -ne 0 }; if (-not $b) { return $null }
      return ([System.Text.Encoding]::ASCII.GetString([byte[]]@($b))).Trim() } catch { return $null }
  }
  function ConnStr($n) {
    switch ([int]$n) { 10{"DisplayPort"} 11{"DisplayPort (Embedded)"} 5{"HDMI"} 4{"DVI"} 8{"Internal (eDP)"} 0{"VGA"} 15{"Miracast"} default{$null} }
  }
  
  $screens = @(); $screenHz = @()
  try {
    Add-Type -AssemblyName System.Windows.Forms -EA Stop
     $screens = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
       @{ device=$_.DeviceName; w=$_.Bounds.Width; h=$_.Bounds.Height; primary=$_.Primary; x=$_.Bounds.X; y=$_.Bounds.Y }
    })
    # Per-monitor refresh rate via EnumDisplaySettings (Win32 API) — one entry per logical display
    Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class DspHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
    public int dmFields, dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID, DeviceKey;
  }
  [DllImport("user32.dll")] public static extern bool EnumDisplayDevices(string d, uint i, ref DISPLAY_DEVICE dd, uint f);
  [DllImport("user32.dll")] public static extern bool EnumDisplaySettings(string d, int n, ref DEVMODE dm);
}
'@ -EA Stop
    $dispDevs = @()
    $di = [uint32]0
    while ($true) {
      $dd2 = New-Object DspHelper+DISPLAY_DEVICE; $dd2.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($dd2)
      if (![DspHelper]::EnumDisplayDevices($null, $di, [ref]$dd2, 0)) { break }
      if ($dd2.StateFlags -band 1) {
        $dm2 = New-Object DspHelper+DEVMODE; $dm2.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($dm2)
        if ([DspHelper]::EnumDisplaySettings($dd2.DeviceName, -1, [ref]$dm2)) {
          # Some AMD/Windows driver combinations return the active mode with
          # dmDisplayFrequency=0 even though the supported mode list below
          # contains the real refresh rates. Keep the display record in that
          # case so monitor identity/resolution can still be correlated and
          # maxHz can be used as the honest fallback.
          if ($dm2.dmDisplayFrequency -gt 0) {
            $screenHz += @{ x=$dm2.dmPositionX; y=$dm2.dmPositionY; hz=$dm2.dmDisplayFrequency }
          }
          # Secondary call — extract monitor hardware ID from DeviceID (e.g. MONITOR\SAM0E4F\...)
          $hwId = $null
          $dd3 = New-Object DspHelper+DISPLAY_DEVICE; $dd3.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($dd3)
           if ([DspHelper]::EnumDisplayDevices($dd2.DeviceName, [uint32]0, [ref]$dd3, 0)) {
             if ($dd3.DeviceID -and $dd3.DeviceID -match '(?i)(?:MONITOR|DISPLAY)\\([^\\]+)') { $hwId = $Matches[1].ToUpper() }
          }
          # Enumerate ALL supported display modes to find the maximum refresh rate this
          # monitor + GPU combination can drive — may be higher than the current setting.
          $maxHz2 = $dm2.dmDisplayFrequency
          $modeN = [uint32]0
          $dmE = New-Object DspHelper+DEVMODE; $dmE.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($dmE)
          while ([DspHelper]::EnumDisplaySettings($dd2.DeviceName, $modeN, [ref]$dmE)) {
            if ($dmE.dmDisplayFrequency -gt $maxHz2) { $maxHz2 = $dmE.dmDisplayFrequency }
            $modeN++
          }
           $dispDevs += @{ x=$dm2.dmPositionX; y=$dm2.dmPositionY; hz=$dm2.dmDisplayFrequency; maxHz=$maxHz2; w=$dm2.dmPelsWidth; h=$dm2.dmPelsHeight; bpp=$dm2.dmBitsPerPel; hwId=$hwId; displayName=$dd3.DeviceString }
        }
      }
      $di++
    }
  } catch {}
  
  $vcs = @()
  try { $vcs = @(Get-CimInstance Win32_VideoController -EA Stop |
    Select-Object Name,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate,CurrentBitsPerPixel,VideoModeDescription) } catch {}
  
  $monIds  = @(); try { $monIds  = @(Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID                       -EA Stop) } catch {}
  $connPs  = @(); try { $connPs  = @(Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorConnectionParams         -EA Stop) } catch {}
  $dispFt  = @(); try { $dispFt  = @(Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorSupportedDisplayFeatures -EA Stop) } catch {}
  
  # Build EDID map keyed by hardware model ID (e.g. "SAM0E4F").
  # The registry key name under HKLM:\...\Enum\DISPLAY\ IS the hardware model ID —
  # the same token WmiMonitorID.InstanceName encodes after "DISPLAY\". Keying by
  # model ID instead of building a positional array removes the ordering dependency
  # that caused the old $edids[$i] to associate the wrong EDID with the wrong monitor
  # when WMI and the registry enumerate models in different orders.
  $edidMap = @{}
  try {
    $base = "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\DISPLAY"
    foreach ($mod in (Get-ChildItem $base -EA SilentlyContinue | Select-Object -First 8)) {
      $modelId = $mod.PSChildName.ToUpper()
      foreach ($inst in (Get-ChildItem $mod.PSPath -EA SilentlyContinue | Select-Object -First 4)) {
        $e = (Get-ItemProperty (Join-Path $inst.PSPath "Device Parameters") -Name EDID -EA SilentlyContinue).EDID
        if ($e -and $e.Count -ge 72) {
          $hHi = ([int]$e[58] -band 0xF0) -shr 4; $hLo = [int]$e[56]
          $vHi = ([int]$e[61] -band 0xF0) -shr 4; $vLo = [int]$e[59]
          $nx = ($hHi -shl 8) -bor $hLo; $ny = ($vHi -shl 8) -bor $vLo
          if ($nx -gt 320 -and $ny -gt 240) {
            if (-not $edidMap.ContainsKey($modelId)) {
              $edidMap[$modelId] = @{ nx=$nx; ny=$ny; ver="$([int]$e[18]).$([int]$e[19])" }
            }
            break
          }
        }
      }
    }
  } catch {}
  
  $hdrOn = $null
  try { $v=(Get-ItemProperty 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\VideoSettings' -Name EnableHDRForVideo -EA Stop).EnableHDRForVideo; $hdrOn=($v -eq 1) } catch {}
  if ($null -eq $hdrOn) {
    try {
      foreach ($sk in (Get-ChildItem 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\VideoSettings' -EA Stop)) {
        $a=(Get-ItemProperty $sk.PSPath -Name AdvancedColorEnabled -EA SilentlyContinue).AdvancedColorEnabled
        if ($null -ne $a) { $hdrOn=($a -eq 1); break }
        $b=(Get-ItemProperty $sk.PSPath -Name EnableHDRForVideo -EA SilentlyContinue).EnableHDRForVideo
        if ($null -ne $b) { $hdrOn=($b -eq 1); break }
      }
    } catch {}
  }
  if ($null -eq $hdrOn) {
    try {
      $cb='HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers\\Configuration'; $n=0
      :hdr foreach ($ck in (Get-ChildItem $cb -EA Stop)) {
        foreach ($sk in (Get-ChildItem $ck.PSPath -EA SilentlyContinue)) {
          foreach ($s2 in (Get-ChildItem $sk.PSPath -EA SilentlyContinue)) {
            $a=(Get-ItemProperty $s2.PSPath -Name AdvancedColorEnabled -EA SilentlyContinue).AdvancedColorEnabled
            if ($null -ne $a) { $hdrOn=($a -eq 1); break hdr }
            if (++$n -gt 8) { break hdr }
          }
        }
      }
    } catch {}
  }
  if ($null -eq $hdrOn) {
    try {
      $gc='HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
      foreach ($dk in (Get-ChildItem $gc -EA Stop | Where-Object { $_.PSChildName -match '^\\d+$' } | Select-Object -First 4)) {
        $a=(Get-ItemProperty $dk.PSPath -Name IsHDREnabled -EA SilentlyContinue).IsHDREnabled
        if ($null -ne $a) { $hdrOn=($a -eq 1); break }
        $b=(Get-ItemProperty $dk.PSPath -Name AdvancedColorEnabled -EA SilentlyContinue).AdvancedColorEnabled
        if ($null -ne $b) { $hdrOn=($b -eq 1); break }
      }
    } catch {}
  }
  
  $vrrOn = $null; $fsOn = $null
  try { $v=(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\VideoSettings' -Name EnableVariableRefreshRate -EA Stop).EnableVariableRefreshRate; $vrrOn=($v -eq 1) } catch {}
  try {
    $gc='HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
    foreach ($dk in (Get-ChildItem $gc -EA Stop | Where-Object { $_.PSChildName -match '^\\d+$' } | Select-Object -First 8)) {
      foreach ($kn in @('KMD_FreeSync','KMD_FreeSync2','KMD_EnableFreeSyncDX','DAL2FreeSync2')) {
        $v=(Get-ItemProperty $dk.PSPath -Name $kn -EA SilentlyContinue).$kn
        if ($null -ne $v) { $fsOn=([int]$v -ge 1); if ($null -eq $vrrOn){$vrrOn=$fsOn}; break }
      }
      if ($null -ne $fsOn) { break }
    }
  } catch {}
  
  $gpuName = $null
  if ($vcs.Count -gt 0) {
    $g = $vcs | Where-Object { $_.Name -notmatch 'Microsoft|Basic|Virtual|Remote' } | Select-Object -First 1
    $gpuName = if ($g) { $g.Name } else { $vcs[0].Name }
  }
  
  # ── Monitor → display-device correlation (3-tier, identity-safe) ────────────
  # WmiMonitorID.InstanceName: DISPLAY\\SAM0E4F\\<instance>  -- hwId = "SAM0E4F"
  # EnumDisplayDevices DeviceID: MONITOR\\SAM0E4F\\{GUID}\\NN -- hwId = "SAM0E4F"
  # Both embed the same EISA hardware model code, enabling reliable identity-based
  # matching even when the two data sources enumerate monitors in different orders.
  #
  # Tier 1 (hwId exact match)  — most reliable; used when both sides produce a
  #   matching hardware ID string. Fails silently when a driver/EDID quirk causes
  #   EnumDisplayDevices to return an empty DeviceID for a monitor child device, or
  #   when the two API paths format the ID differently (e.g. extra trailing segment).
  #
  # Tier 2 (EDID native-res constraint) — fallback when Tier 1 misses. A display
  #   physically cannot run above its own native panel resolution. If exactly ONE
  #   remaining candidate has currentRes <= nativeRes for a given monitor, assign it.
  #   Uses $edidMap[$hwId] (keyed by the same EISA code) so native-res lookup is also
  #   identity-based, not positional.
  #
  # Tier 3 (leave unmatched) — when neither Tier 1 nor Tier 2 can resolve uniquely,
  #   the monitor intentionally has no $monToDisp entry. $dev will be null, and the
  #   dynamic fields (currentResX/Y, refreshHz, isPrimary) will be null in the output.
  #   An honest null is strictly less harmful than a 50%-likely-wrong positional guess,
  #   which produced the "currentRes 2560×1440 on a 1920×1080-native monitor" bug.
  $monToDisp = @{}
  $fallbackScreenByMon = @{}
  $monHwIds  = @()
  for ($mi2 = 0; $mi2 -lt $monIds.Count; $mi2++) {
    $id = $null
     if ($monIds[$mi2].InstanceName -match '(?i)(?:DISPLAY|MONITOR)\\([^\\]+)') { $id = $Matches[1].ToUpper() }
    $monHwIds += $id
  }
  if ($dispDevs -and $dispDevs.Count -gt 0) {
    $usedDispIdx = @{}

    # Tier 1: exact hwId match
    for ($mi2 = 0; $mi2 -lt $monIds.Count; $mi2++) {
      $mHwId = $monHwIds[$mi2]
      if ($mHwId) {
        for ($j = 0; $j -lt $dispDevs.Count; $j++) {
          if (-not $usedDispIdx.ContainsKey($j) -and $dispDevs[$j].hwId -ne $null -and $dispDevs[$j].hwId -eq $mHwId) {
            $monToDisp[$mi2] = $dispDevs[$j]; $usedDispIdx[$j] = $true; break
          }
        }
      }
    }

    # Tier 2: match the friendly monitor name exposed by the display-device
    # child. Some drivers omit DeviceID even though DeviceString is present.
    # Normalize punctuation/spaces so "LS24AG32x" matches common driver
    # variants such as "LS24AG32x (NVIDIA High Definition Audio)".
    for ($mi2 = 0; $mi2 -lt $monIds.Count; $mi2++) {
      if ($monToDisp.ContainsKey($mi2)) { continue }
      $mName = Dec $monIds[$mi2].UserFriendlyName
      $mKey = if ($mName) { ($mName.ToLower() -replace '[^a-z0-9]','') } else { $null }
      if (-not $mKey -or $mKey.Length -lt 4) { continue }
      for ($j = 0; $j -lt $dispDevs.Count; $j++) {
        if ($usedDispIdx.ContainsKey($j)) { continue }
        $dName = $dispDevs[$j].displayName
        $dKey = if ($dName) { ($dName.ToLower() -replace '[^a-z0-9]','') } else { $null }
        if ($dKey -and ($dKey -eq $mKey -or $dKey.Contains($mKey) -or $mKey.Contains($dKey))) {
          $monToDisp[$mi2] = $dispDevs[$j]; $usedDispIdx[$j] = $true; break
        }
      }
    }

    # Tier 3: EDID native-res constraint for monitors still unmatched after
    # identity matching.
    for ($mi2 = 0; $mi2 -lt $monIds.Count; $mi2++) {
      if ($monToDisp.ContainsKey($mi2)) { continue }
      $mHwId = $monHwIds[$mi2]
      $mEd   = if ($mHwId -and $edidMap.ContainsKey($mHwId)) { $edidMap[$mHwId] } else { $null }
      if ($mEd -and [int]$mEd.nx -gt 0 -and [int]$mEd.ny -gt 0) {
        $compatible = @()
        for ($j = 0; $j -lt $dispDevs.Count; $j++) {
          if (-not $usedDispIdx.ContainsKey($j)) {
            $d = $dispDevs[$j]
            # currentRes <= nativeRes is the physical constraint; >0 guard avoids false-positives
            # when $d.w/$d.h are 0 (EnumDisplaySettings returned no mode data for that output)
            if ([int]$d.w -gt 0 -and [int]$d.h -gt 0 -and [int]$d.w -le [int]$mEd.nx -and [int]$d.h -le [int]$mEd.ny) {
              $compatible += $j
            }
          }
        }
        # Assign only when exactly one candidate is constraint-compatible —
        # if multiple candidates satisfy the constraint the choice is ambiguous
        # and Tier 3 (leave null) is safer than guessing.
        if ($compatible.Count -eq 1) {
          $monToDisp[$mi2] = $dispDevs[$compatible[0]]; $usedDispIdx[$compatible[0]] = $true
        }
      }
    }
    # Tier 4: if exactly one monitor/device pair remains, the pairing is no
    # longer ambiguous. This recovers refresh/resolution data when a driver
    # exposes a malformed child DeviceID but all other displays matched.
    $leftMon = @()
    for ($mi2 = 0; $mi2 -lt $monIds.Count; $mi2++) {
      if (-not $monToDisp.ContainsKey($mi2)) { $leftMon += $mi2 }
    }
    $leftDisp = @()
    for ($j = 0; $j -lt $dispDevs.Count; $j++) {
      if (-not $usedDispIdx.ContainsKey($j)) { $leftDisp += $j }
    }
    if ($leftMon.Count -eq 1 -and $leftDisp.Count -eq 1) {
      $monToDisp[$leftMon[0]] = $dispDevs[$leftDisp[0]]
    }

    # Tier 5: when a driver omits the child monitor hardware ID, use the
    # monitor's EDID native-resolution constraint to match it to exactly one
    # remaining Windows screen. This supplies that screen's own EnumDisplaySettings
    # refresh rate without falling back to arbitrary array position.
    $usedScreenIdx = @{}
    for ($mi2 = 0; $mi2 -lt $monIds.Count; $mi2++) {
      if ($monToDisp.ContainsKey($mi2)) {
        $mapped = $monToDisp[$mi2]
        for ($si = 0; $si -lt $screens.Count; $si++) {
          if ($screens[$si].x -eq $mapped.x -and $screens[$si].y -eq $mapped.y) {
            $usedScreenIdx[$si] = $true
          }
        }
      }
    }
    for ($mi2 = 0; $mi2 -lt $monIds.Count; $mi2++) {
      if ($monToDisp.ContainsKey($mi2) -or $fallbackScreenByMon.ContainsKey($mi2)) { continue }
      $mHwId = $monHwIds[$mi2]
      $mEd = if ($mHwId -and $edidMap.ContainsKey($mHwId)) { $edidMap[$mHwId] } else { $null }
      if (-not $mEd -or [int]$mEd.nx -le 0 -or [int]$mEd.ny -le 0) { continue }
      $compatibleScreens = @()
      for ($si = 0; $si -lt $screens.Count; $si++) {
        if (-not $usedScreenIdx.ContainsKey($si) -and
            [int]$screens[$si].w -gt 0 -and [int]$screens[$si].h -gt 0 -and
            [int]$screens[$si].w -le [int]$mEd.nx -and [int]$screens[$si].h -le [int]$mEd.ny) {
          $compatibleScreens += $si
        }
      }
      if ($compatibleScreens.Count -eq 1) {
        $screenIndex = $compatibleScreens[0]
        $fallbackScreenByMon[$mi2] = $screens[$screenIndex]
        $usedScreenIdx[$screenIndex] = $true
      }
    }
  }

  # Final identity-safe fallback for drivers that expose WMI monitor records
  # but omit a usable child DeviceID/DeviceString. Match an unmatched monitor
  # to a Windows screen only when its EDID native resolution leaves exactly one
  # compatible candidate. This supplies that screen's own EnumDisplaySettings
  # refresh rate without guessing by WMI array order.
  $usedFallbackScreens = @{}
  foreach ($mappedKey in $monToDisp.Keys) {
    $mapped = $monToDisp[$mappedKey]
    for ($si = 0; $si -lt $screens.Count; $si++) {
      if ($screens[$si].x -eq $mapped.x -and $screens[$si].y -eq $mapped.y) {
        $usedFallbackScreens[$si] = $true
      }
    }
  }
  foreach ($mappedKey in $fallbackScreenByMon.Keys) {
    $mapped = $fallbackScreenByMon[$mappedKey]
    for ($si = 0; $si -lt $screens.Count; $si++) {
      if ($screens[$si].x -eq $mapped.x -and $screens[$si].y -eq $mapped.y) {
        $usedFallbackScreens[$si] = $true
      }
    }
  }
  for ($mi2 = 0; $mi2 -lt $monIds.Count; $mi2++) {
    if ($monToDisp.ContainsKey($mi2) -or $fallbackScreenByMon.ContainsKey($mi2)) { continue }
    $mHwId = $monHwIds[$mi2]
    $mEd = if ($mHwId -and $edidMap.ContainsKey($mHwId)) { $edidMap[$mHwId] } else { $null }
    if (-not $mEd -or [int]$mEd.nx -le 0 -or [int]$mEd.ny -le 0) { continue }
    $compatibleScreens = @()
    for ($si = 0; $si -lt $screens.Count; $si++) {
      if (-not $usedFallbackScreens.ContainsKey($si) -and
          [int]$screens[$si].w -gt 0 -and [int]$screens[$si].h -gt 0 -and
          [int]$screens[$si].w -le [int]$mEd.nx -and [int]$screens[$si].h -le [int]$mEd.ny) {
        $compatibleScreens += $si
      }
    }
    if ($compatibleScreens.Count -eq 1) {
      $screenIndex = $compatibleScreens[0]
      $fallbackScreenByMon[$mi2] = $screens[$screenIndex]
      $usedFallbackScreens[$screenIndex] = $true
    }
  }

  $i = 0
  foreach ($mi in $monIds) {
    $name = Dec $mi.UserFriendlyName
    $mfr  = Dec $mi.ManufacturerName
    $ser  = Dec $mi.SerialNumberID
    if ($ser -ne $null -and ($ser -match '^0+$' -or $ser.Length -lt 2)) { $ser = $null }
    if ($mfr -ne $null -and ($mfr -match '^[\\?\\*]+$' -or $mfr.Length -lt 2)) { $mfr = $null }
  
    $ipfx = if ($mi.InstanceName) { $mi.InstanceName -replace '_\\d+$','' } else { $null }
    $cp   = if ($ipfx) { $connPs | Where-Object { ($_.InstanceName -replace '_\\d+$','') -eq $ipfx } | Select-Object -First 1 } else { $null }
    # TEMPORARY DISPLAY DIAGNOSTIC: preserve the raw WMI value in the internal
    # PowerShell result so the JS boundary can identify malformed driver output.
    # This field is stripped before the renderer response is returned.
    $rawConn = if ($cp) { $cp.VideoOutputTechnology } else { $null }
    $conn = if ($cp) { ConnStr $rawConn } else { $null }
  
    $df     = if ($ipfx) { $dispFt | Where-Object { ($_.InstanceName -replace '_\\d+$','') -eq $ipfx } | Select-Object -First 1 } else { $null }
    $vrrCap = if ($df -and $null -ne $df.ContinuousFrequencySupported) { [bool]$df.ContinuousFrequencySupported } else { $null }
    $vrrMin = $null; $vrrMax = $null
    try {
      if ($df) {
        if ($df.MinVerticalRefreshRate -and [int]$df.MinVerticalRefreshRate -gt 0) { $vrrMin=[int]$df.MinVerticalRefreshRate }
        if ($df.MaxVerticalRefreshRate -and [int]$df.MaxVerticalRefreshRate -gt 0) { $vrrMax=[int]$df.MaxVerticalRefreshRate }
      }
    } catch {}
  
    # Use the pre-matched display device (correlated by hardware ID, not array index)
    $dev   = if ($monToDisp.ContainsKey($i)) { $monToDisp[$i] } else { $null }
    $scr   = if ($dev) {
      $screens | Where-Object { $_.x -eq $dev.x -and $_.y -eq $dev.y } | Select-Object -First 1
    } else { $null }
    # WMI video-controller order is not a display identity.  Do not attach a
    # controller to a monitor by array position; an unknown association is
    # represented as null below.
    $vc    = $null
    # Look up EDID by the monitor's own hardware model ID (identity-safe, not positional)
    $miHwId = $monHwIds[$i]
    $ed     = if ($miHwId -and $edidMap.ContainsKey($miHwId)) { $edidMap[$miHwId] } else { $null }
  
    # Do not use left-to-right screen order as a monitor identity fallback.
    # It is not stable with mixed adapters, docking stations, or mirroring.
    $fallbackScr   = if ($fallbackScreenByMon.ContainsKey($i)) { $fallbackScreenByMon[$i] } else { $null }
    $hz=$null; $maxHzOut=$null; $bpp=$null; $rx=$null; $ry=$null
    if ($dev) {
      # Per-device data from EnumDisplaySettings — authoritative for multi-monitor, no index aliasing
      if ([int]$dev.hz  -gt 0) { $hz  = [int]$dev.hz  }
      if ($dev.maxHz -and [int]$dev.maxHz -gt 0) { $maxHzOut = [int]$dev.maxHz }
      if ([int]$dev.w   -gt 0) { $rx  = [int]$dev.w   }
      if ([int]$dev.h   -gt 0) { $ry  = [int]$dev.h   }
      if ([int]$dev.bpp -gt 0) { $bpp = [int]$dev.bpp }
    } else {
      if ($vc) {
        if ([int]$vc.CurrentRefreshRate -gt 0)          { $hz  = [int]$vc.CurrentRefreshRate }
        if ([int]$vc.CurrentBitsPerPixel -gt 0)         { $bpp = [int]$vc.CurrentBitsPerPixel }
        if ([int]$vc.CurrentHorizontalResolution -gt 0) { $rx  = [int]$vc.CurrentHorizontalResolution }
        if ([int]$vc.CurrentVerticalResolution -gt 0)   { $ry  = [int]$vc.CurrentVerticalResolution }
        if (($null -eq $rx -or $rx -le 0) -and $vc.VideoModeDescription -match '(\\d+) x (\\d+)') {
          $rx=[int]$Matches[1]; $ry=[int]$Matches[2]
        }
      }
      # Per-monitor Hz via positional screen (sorted left-to-right).
      # This is authoritative for the Hz when hwId/EDID correlation fails,
      # because $vc.CurrentRefreshRate is a GPU-level value that always reflects
      # the PRIMARY monitor's refresh rate on single-GPU setups.
      if ($fallbackScr) {
        $rx = $fallbackScr.w; $ry = $fallbackScr.h
        $hzFb = $screenHz | Where-Object { $_.x -eq $fallbackScr.x -and $_.y -eq $fallbackScr.y } | Select-Object -First 1
        if ($hzFb -and [int]$hzFb.hz -gt 0) { $hz = [int]$hzFb.hz }
      }
    }
  
    $monGpu = if ($vc) { $vc.Name } elseif ($vcs.Count -eq 1) { $gpuName } else { $null }
  
    $out.monitors += @{
      id=$("mon_$i"); name=$name; manufacturer=$mfr; serial=$ser; connectionType=$conn; connectionTypeRaw=$rawConn
      currentResX=$rx; currentResY=$ry; refreshHz=$hz; maxRefreshHz=$maxHzOut; bitsPerPixel=$bpp
      nativeResX=if($ed){$ed.nx}else{$null}; nativeResY=if($ed){$ed.ny}else{$null}
      edidVersion=if($ed){$ed.ver}else{$null}
      hdrEnabled=$hdrOn; vrrEnabled=$vrrOn; vrrCapable=$vrrCap; freeSyncEnabled=$fsOn
      vrrMin=$vrrMin; vrrMax=$vrrMax; gpuName=$monGpu
      isPrimary=if($scr){$scr.primary}elseif($fallbackScr){$fallbackScr.primary}else{($i -eq 0)}
    }
    $i++
  }
  
  if ($out.monitors.Count -eq 0) {
    $srcs = if ($screens.Count -gt 0) { $screens } else {
      @($vcs | Where-Object { [int]$_.CurrentHorizontalResolution -gt 0 } | ForEach-Object {
        @{ w=[int]$_.CurrentHorizontalResolution; h=[int]$_.CurrentVerticalResolution; primary=$false }
      })
    }
    $fi = 0
    foreach ($src in $srcs) {
      $vc  = if ($vcs.Count -eq 1) { $vcs[0] } else { $null }
      $ed  = $null  # no hwId available in the WMI-absent fallback path; EDID cannot be keyed
      $hz  = if ($vc -and [int]$vc.CurrentRefreshRate -gt 0) { [int]$vc.CurrentRefreshRate } else { $null }
      # Override Hz with per-monitor value from EnumDisplaySettings when available
      if ($null -ne $src.x) {
        $hzFb = $screenHz | Where-Object { $_.x -eq $src.x -and $_.y -eq $src.y } | Select-Object -First 1
        if ($hzFb -and [int]$hzFb.hz -gt 0) { $hz = [int]$hzFb.hz }
      }
      $bpp = if ($vc -and [int]$vc.CurrentBitsPerPixel -gt 0) { [int]$vc.CurrentBitsPerPixel } else { $null }
       $gn  = if ($vc) { $vc.Name } elseif ($vcs.Count -eq 1) { $gpuName } else { $null }
      $out.monitors += @{
        id="mon_$fi"; name=$null; manufacturer=$null; serial=$null; connectionType=$null
        currentResX=$src.w; currentResY=$src.h; refreshHz=$hz; bitsPerPixel=$bpp
        nativeResX=if($ed){$ed.nx}else{$null}; nativeResY=if($ed){$ed.ny}else{$null}
        edidVersion=if($ed){$ed.ver}else{$null}
        hdrEnabled=$hdrOn; vrrEnabled=$vrrOn; vrrCapable=$null; freeSyncEnabled=$fsOn
        vrrMin=$null; vrrMax=$null; gpuName=$gn; isPrimary=$src.primary
      }
      $fi++
    }
  }
  
  $out | ConvertTo-Json -Depth 5 -Compress`.trim();
  
    try {
      const raw = await runMainPs(ps, { timeout: 15_000, label: 'system:getDisplayInfo' });
      if (!raw) return { monitors: [] };
  
      const parsed = JSON.parse(raw);
      // Normalise: PS may return a single object (not array) for single-monitor systems
      const rawMonitors = Array.isArray(parsed.monitors)
        ? parsed.monitors
        : parsed.monitors ? [parsed.monitors] : [];
  
      const monitors = rawMonitors.map((m) => {
        // TEMPORARY DISPLAY DIAGNOSTIC: record the raw WMI value and the value
        // produced by ConnStr() so the affected user's local log identifies
        // the exact monitor/driver shape. The raw field is never returned to
        // the renderer.
        try {
          console.info(
            `[DisplayInfo:diagnostic] id=${m.id ?? 'unknown'} name=${JSON.stringify(m.name ?? null)} ` +
            `rawType=${typeof m.connectionTypeRaw} raw=${JSON.stringify(m.connectionTypeRaw ?? null)} ` +
            `normalizedType=${typeof m.connectionType} normalized=${JSON.stringify(m.connectionType ?? null)}`
          );
        } catch (e) {
          console.warn('[DisplayInfo:diagnostic] failed to serialize connection metadata:', e.message);
        }

        return {
        id:             m.id             ?? null,
        name:           m.name           ?? null,
        manufacturer:   m.manufacturer   ?? null,
        serial:         m.serial         ?? null,
        connectionType: m.connectionType ?? null,
        currentResX:    m.currentResX    ?? null,
        currentResY:    m.currentResY    ?? null,
        refreshHz:      m.refreshHz      ?? null,
        maxRefreshHz:   m.maxRefreshHz   ?? null,
        bitsPerPixel:   m.bitsPerPixel   ?? null,
        nativeResX:     m.nativeResX     ?? null,
        nativeResY:     m.nativeResY     ?? null,
        edidVersion:    m.edidVersion    ?? null,
        hdrEnabled:     m.hdrEnabled     ?? null,
        vrrEnabled:     m.vrrEnabled     ?? null,
        vrrCapable:     m.vrrCapable     ?? null,
        freeSyncEnabled:m.freeSyncEnabled ?? null,
        vrrMin:         m.vrrMin         ?? null,
        vrrMax:         m.vrrMax         ?? null,
        gpuName:        m.gpuName        ?? null,
        isPrimary:      m.isPrimary      ?? false,
        };
      });
  
      const result = { monitors, scannedAt: parsed.scannedAt ?? Date.now() };
      _displayInfoCache = result;
      _displayInfoCachedAt = Date.now();
      return result;
    } catch (e) {
      console.warn('[system:getDisplayInfo] error:', e.message);
      return { monitors: [] };
    }
  }
  
  // Clear the display info cache so the next call re-runs the PowerShell scan.
  // Called by the UI refresh button and monitor hot-plug events.
  ipcMain.handle('display:invalidateCache', () => {
    _displayInfoCache = null;
    _displayInfoCachedAt = 0;
    return { ok: true };
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
      const ramTotalGb = parseFloat((ramTotal / (1024 * 1024 * 1024)).toFixed(1));
      const ramUsedGb = parseFloat((ramUsed / (1024 * 1024 * 1024)).toFixed(1));
      const ramPercent = ramTotal > 0 ? Math.round((ramUsed / ramTotal) * 100) : 0;
  
      // --- GPU telemetry: read from unified gpuState (fast, non-blocking cache read) ---
      // load: populated by LHM (if running) or by the last on-demand perf counter refresh.
      // No PowerShell is spawned in the polling loop — see telemetry:refreshGpuLoad for on-demand.
      const gpuLoad     = gpuState.load;
      const gpuTemp     = gpuState.temp;
      const gpuMemUsed  = gpuState.vramUsedMb;
      const gpuMemTotal = gpuState.vramTotalMb;
      const gpuPower    = gpuState.power;
      const gpuClockMhz = gpuState.clockMhz;
  
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
            source:          gpuState.source,
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
    assertSiCaller('system:getRamUsage');
    try {
      // Keep this on the same native physical-memory counters as telemetry.
      // Mixing systeminformation.active with os.freemem makes the RAM card
      // disagree with Task Manager after an optimization.
      const total = os.totalmem();
      const free = os.freemem();
      const used = Math.max(0, total - free);
      return {
        total,
        used,
        free,
        usagePercent: Math.round((used / total) * 100),
        totalGB: Math.round(total / 1024 / 1024 / 1024),
        usedGB: Number((used / 1024 / 1024 / 1024).toFixed(1)),
        freeGB: Number((free / 1024 / 1024 / 1024).toFixed(1)),
      };
    } catch (e) {
      return { total: 0, used: 0, free: 0, usagePercent: 0, totalGB: 0, usedGB: 0, freeGB: 0 };
    }
  });
  
  ipcMain.handle('system:getAllDisks', async () => {
    assertSiCaller('system:getAllDisks');
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
    assertSiCaller('telemetry:getCpuCores');
    try {
      const load = await si.currentLoad();
      return (load.cpus || []).map((c, i) => ({ core: i, load: safeNum(c.load || 0) }));
    } catch (e) {
      return [];
    }
  });
  
  ipcMain.handle('telemetry:getMemoryDetails', async () => {
    assertSiCaller('telemetry:getMemoryDetails');
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
  
  // ── telemetry:getGpu — reads from / populates unified gpuState ────────────────
  // Si.graphics() is ~300–600ms; a 30s staleness window avoids re-running it on
  // every rapid UI open. nvidia-smi fills temp/power/clockCore for NVIDIA cards
  // where si.graphics() returns 0 for those fields.
  // _gpuInfoCache and _gpuInfoCacheTs have been folded into gpuState.lastStaticUpdate.
  ipcMain.handle('telemetry:getGpu', async () => {
    try {
      const now = Date.now();
      const GPU_INFO_TTL_MS = 30_000;
      // Serve from gpuState if the model is already known and the data is fresh
      if (gpuState.model && (now - gpuState.lastStaticUpdate) < GPU_INFO_TTL_MS) {
        return {
          model:        gpuState.model,
          vendor:       gpuState.vendor        || '',
          driverVersion:gpuState.driverVersion || null,
          vram:         gpuState.vramTotalMb,
          memoryUsed:   gpuState.vramUsedMb,
          temperature:  gpuState.temp,
          load:         gpuState.load,
          powerDraw:    gpuState.power,
          clockCore:    gpuState.clockMhz,
          clockMemory:  null,
          cached:       true,
        };
      }

      const graphics = await si.graphics();
      const controllers = graphics.controllers || [];
      // Correlate by GPU name rather than raw array index — si.graphics() and wmiGpuList
      // are independent enumeration sources (systeminformation vs WMI Win32_VideoController)
      // and are NOT guaranteed to return GPUs in the same order.  On a multi-GPU system
      // positional indexing silently returns the wrong card's temperature / VRAM.
      // Never fall back to enumeration position: independent providers reorder
      // adapters differently on hybrid/multi-GPU systems.
      const targetName = (wmiGpuList[selectedGpuIndex]?.name || gpuState.model || '').toLowerCase();
      let ctrl = null;
      if (targetName && controllers.length > 1) {
        // Bidirectional substring: handles "NVIDIA GeForce RTX 4080" ↔ "NVIDIA GeForce RTX 4080 SUPER" variants
        ctrl = controllers.find(c => {
          const m = (c.model || '').toLowerCase();
          return m.includes(targetName) || targetName.includes(m);
        });
        if (!ctrl) verboseLog(`[telemetry:getGpu] name-match failed for "${wmiGpuList[selectedGpuIndex]?.name}"`);
      } else {
        // Only a single controller is unambiguous.
        ctrl = controllers.length === 1 ? controllers[0] : null;
      }
      if (!ctrl) return null;

      const vendorLower = (ctrl.vendor || '').toLowerCase();
      const isAmd = vendorLower.includes('amd') || vendorLower.includes('advanced micro');
      const isNvidia = vendorLower.includes('nvidia');

      // Populate gpuState with fresh static fields
      gpuState.model        = ctrl.model         || gpuState.model || 'Unknown GPU';
      gpuState.vendor       = ctrl.vendor         || gpuState.vendor || '';
      gpuState.driverVersion= ctrl.driverVersion  || gpuState.driverVersion || null;
      gpuState.isNvidia     = isNvidia;
      gpuState.isAmd        = isAmd;
      if (ctrl.vram        > 0) gpuState.vramTotalMb = safeNum(ctrl.vram);
      if (ctrl.memoryUsed  > 0) gpuState.vramUsedMb  = safeNum(ctrl.memoryUsed);
      if (!isAmd && ctrl.temperatureGpu > 0) gpuState.temp = safeNum(ctrl.temperatureGpu);
      if (!isAmd && ctrl.utilizationGpu >= 0) { gpuState.load = safeNum(ctrl.utilizationGpu); gpuState.source = 'si'; }
      gpuState.lastStaticUpdate = now;

      // nvidia-smi for NVIDIA as last resort (skip for AMD — no smi support)
      if (isNvidia && (gpuState.temp === null || gpuState.load === null)) {
        try {
          const nvidiaFull = await new Promise((resolve) => {
            execFile(
              'nvidia-smi',
              ['--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,clocks.current.graphics,clocks.current.memory', '--format=csv,noheader,nounits'],
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
            if (gpuState.temp       === null && Number.isFinite(nv[0])) gpuState.temp       = nv[0];
            if (gpuState.load       === null && Number.isFinite(nv[1])) { gpuState.load = nv[1]; gpuState.source = 'nvidia-smi'; }
            if (gpuState.vramUsedMb === null && Number.isFinite(nv[2])) gpuState.vramUsedMb = nv[2];
            if (gpuState.vramTotalMb=== null && Number.isFinite(nv[3])) gpuState.vramTotalMb= nv[3];
            if (gpuState.power      === null && Number.isFinite(nv[4])) gpuState.power      = nv[4];
            if (gpuState.clockMhz   === null && Number.isFinite(nv[5])) gpuState.clockMhz   = nv[5];
          }
        } catch {}
      }

      const result = {
        model:        gpuState.model,
        vendor:       gpuState.vendor       || '',
        driverVersion:gpuState.driverVersion|| null,
        vram:         gpuState.vramTotalMb,
        memoryUsed:   gpuState.vramUsedMb,
        temperature:  gpuState.temp,
        load:         gpuState.load,
        powerDraw:    gpuState.power,
        clockCore:    gpuState.clockMhz,
        clockMemory:  null,
        cached:       false,
      };
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
    if (_gpuCounterRefreshInFlight) return _gpuCounterRefreshInFlight;
    if (now < _gpuCounterFailureBackoffUntil) {
      return { load: gpuState.load, source: gpuState.source, cached: true, skipped: true, error: 'GPU load refresh is backing off after a failed read.' };
    }
    if (now - _gpuCounterLastRefreshTs < GPU_COUNTER_REFRESH_TTL) {
      verboseLog('[telemetry:refreshGpuLoad] within TTL — returning cached load=' + gpuState.load);
      return { load: gpuState.load, source: gpuState.source, cached: true };
    }
    _gpuCounterRefreshInFlight = (async () => {
      try {
        const load = await getGpuPerfCounterLoad();
        if (typeof load !== 'number' || !Number.isFinite(load) || load < 0 || load > 100) {
          throw new Error('GPU perf counter returned no valid load');
        }
        gpuState.load = load;
        gpuState.source = 'perf-counter';
        gpuState.lastDynamicUpdate = Date.now();
        _gpuCounterLastRefreshTs = Date.now(); // advance success TTL only after valid read
        verboseLog('[telemetry:refreshGpuLoad] perf counter read: load=' + load + '%');
        return { load: gpuState.load, source: gpuState.source, cached: false };
      } catch (e) {
        _gpuCounterFailureBackoffUntil = Date.now() + GPU_COUNTER_FAILURE_BACKOFF_MS;
        console.error('[telemetry:refreshGpuLoad] error:', e.message);
        return { load: gpuState.load, source: gpuState.source, cached: false, error: e.message };
      } finally {
        _gpuCounterRefreshInFlight = null;
      }
    })();
    return _gpuCounterRefreshInFlight;
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
  
  // Shared across both startup reconciliation IPC paths. App.tsx uses
  // tweak:batchCheckAll while TweaksList uses tweak:syncAll, but both need the
  // same expensive full PowerShell verification. Await the existing promise
  // instead of launching a second batch when the calls overlap.
  let _batchCheckAllInFlight = null;

  async function runSharedBatchCheckAll() {
    if (_batchCheckAllInFlight) {
      console.log('[tweak:batchCheckAll] joining existing batch verification');
      return _batchCheckAllInFlight;
    }

    _batchCheckAllInFlight = Promise.resolve()
      .then(() => tweakExecutor.batchCheckAllTweaks())
      .finally(() => {
        _batchCheckAllInFlight = null;
      });

    return _batchCheckAllInFlight;
  }

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
      const result = await tweakExecutor.executeTweakWithOwnership(tweakId, action, options);
  
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
    if (_batchCheckAllInFlight) {
      console.log('[tweak:syncAll] joining existing batch verification');
      return _batchCheckAllInFlight;
    }
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'tweak:syncAll', reason: 'tweak-sync-all' });
    if (!_token) {
      const skipped = psLimiter.skippedResult({ file: 'main.js', fn: 'tweak:syncAll', reason: 'tweak-sync-all' });
      console.log('[tweak:syncAll] returning explicit skipped result — sync already in progress');
      return skipped; // caller checks result.skipped === true and uses cached state
    }
    const t0 = Date.now();
    console.log(`[PS-Exec] start file=main.js fn=tweak:syncAll reason=tweak-sync-all — batch mode, ${Object.keys(tweakExecutor.ALL_TWEAKS).length} tweaks`);
    try {
      const results = await runSharedBatchCheckAll();
      console.log(`[PS-Exec] done file=main.js fn=tweak:syncAll ms=${Date.now() - t0} tweaks=${Object.keys(results).length}`);
      return results;
    } finally {
      psLimiter.release(_token);
    }
  });
  
  // Batch check — reads ALL tweak states in a single PowerShell invocation.
  // Called once at app startup (non-blocking) to reconcile the Zustand store
  // against real Windows state after an AppData wipe or first launch.
  ipcMain.handle('tweak:batchCheckAll', async () => {
    if (_batchCheckAllInFlight) {
      console.log('[tweak:batchCheckAll] joining existing batch verification');
      return _batchCheckAllInFlight;
    }
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'tweak:batchCheckAll', reason: 'tweak-batch-check' });
    if (!_token) {
      console.log('[tweak:batchCheckAll] skipped — PS limiter full, will retry on TweaksList mount');
      return { ok: false, skipped: true, inconclusive: true, status: {}, error: 'Verification busy; no state was changed.' };
    }
    try {
      return await runSharedBatchCheckAll();
    } finally {
      psLimiter.release(_token);
    }
  });
  
  ipcMain.handle('tweak:getLog', () => {
    return tweakExecutor.getExecutionLog();
  });

  // GPU MSI Mode — adapter scan used by the TweakCard GPU selector
  ipcMain.handle('gpuMsi:scanAdapters', async () => {
    try {
      const gpus = await tweakExecutor.scanCompatibleGpus();
      return { gpus: gpus || [] };
    } catch (err) {
      console.error('[gpuMsi:scanAdapters] error:', err.message);
      return { gpus: [], error: err.message };
    }
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
  function RRK($src,$rp,$ap){$ap2=GA $ap;try{$k=Get-Item $rp -EA SilentlyContinue;if(!$k){return};foreach($n in $k.GetValueNames()){try{$cmd=$k.GetValue($n,$null,'DoNotExpandEnvironmentNames');if(!$cmd){continue};$exe=EP $cmd;$exeE=if($exe){[Environment]::ExpandEnvironmentVariables($exe)}else{$null};$ex=TE $exeE;$pub=if($ex){GP $exeE}else{$null};$en=if($ap2.ContainsKey($n)){$ap2[$n]}else{$true};$entries.Add(@{id=(MID "\${src}-$n");name=$n;publisher=$pub;executablePath=$exeE;commandLine="$cmd";source=$src;enabled=$en;fileExists=$ex;broken=(!$ex);registryName=$n})}catch{}}}catch{$errs+="RunKey \${src}: \${_}"}}
  RRK 'registry-hkcu' 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
  RRK 'registry-hklm' 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
  function RF($src,$folder){if(!(Test-Path $folder -EA SilentlyContinue)){return};Get-ChildItem $folder -Filter '*.lnk' -EA SilentlyContinue|ForEach-Object{try{$sh=New-Object -ComObject WScript.Shell;$lnk=$sh.CreateShortcut($_.FullName);$exe=$lnk.TargetPath;$a2=$lnk.Arguments;$cmd=if($a2){"$([char]34)$exe$([char]34) $a2"}else{$exe};$ex=TE $exe;$pub=if($ex){GP $exe}else{$null};$n=$_.BaseName;$entries.Add(@{id=(MID "$src-$n");name=$n;publisher=$pub;executablePath=$exe;commandLine=$cmd;source=$src;enabled=$true;fileExists=$ex;broken=(!$ex);folderPath=$_.FullName})}catch{}}}
  RF 'startup-folder-user' ([Environment]::GetFolderPath('Startup'))
  RF 'startup-folder-common' ([Environment]::GetFolderPath('CommonStartup'))
  try{Get-ScheduledTask -EA SilentlyContinue|ForEach-Object{$t=$_;$ht=$t.Triggers|Where-Object{$_.CimClass.CimClassName -match 'Logon|Boot'};if(!$ht){return};$a=$t.Actions|Select-Object -First 1;if(!$a -or !$a.Execute){return};$exe=[Environment]::ExpandEnvironmentVariables($a.Execute);$cmd=if($a.Arguments){"$([char]34)$exe$([char]34) $($a.Arguments)"}else{$exe};$ex=TE $exe;$pub=if($ex){GP $exe}else{$null};$tf="$($t.TaskPath)$($t.TaskName)";$entries.Add(@{id=(MID "task-$tf");name=$t.TaskName;publisher=$pub;executablePath=$exe;commandLine=$cmd;source='task-scheduler';enabled=($t.State -ne 'Disabled');fileExists=$ex;broken=(!$ex);taskPath=$tf})}}catch{$errs+="TaskSched: $_"}
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

  ipcMain.handle('tweak:saveVerifiedState', (_event, stateMap) => {
    return tweakExecutor.saveVerifiedState(stateMap);
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
    // timer-resolution-slider and the timer-res toggle both call NtSetTimerResolution.
    // Kill the toggle agent first so the two processes don't race each other.
    if (tweakId === 'timer-resolution-slider') {
      tweakExecutor.cleanupTimerResProcess();
    }
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
    // Use forceRevertSliderToDefault (not resetSliderValue) so the UI "Reset to Default"
    // button always lands on the compiled-in Windows default, bypassing any stale
    // per-session backup.  resetSliderValue restores the backup first (e.g. 38 from a
    // prior session) which makes the user click twice to reach the real default — and
    // leaves a non-default value in the registry between clicks.
    // resetSliderValue is still used by the premium-revert engine (trial expiry) where
    // "restore what was there before the user ever touched this tweak" is the right goal.
    try { return await sliderTweakExecutor.forceRevertSliderToDefault(tweakId); } finally { psLimiter.release(token); }
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
  
  /**
   * Batch revert all premium slider tweaks that have an original-value backup.
   * Called by the client-side premium revert engine on trial expiry.
   */
  ipcMain.handle('tweak:revertAllSliders', async () => {
    try {
      const result = await sliderTweakExecutor.revertAllPremiumSliders();
      console.log(`[IPC] tweak:revertAllSliders — reverted=${result.reverted.length} failed=${result.failed.length}`);
      return { success: true, ...result };
    } catch (e) {
      console.error('[IPC] tweak:revertAllSliders error:', e.message);
      return { success: false, error: e.message, reverted: [], failed: [] };
    }
  });
  
  // Preset-profile tweak IPC handlers — same psLimiter guard as slider tweaks
  // so a rapid double-click can never spawn overlapping PowerShell writes.
  ipcMain.handle('presetTweaks:getState', async (event, tweakId) => {
    if (typeof tweakId !== 'string') return { optionId: null, error: 'Invalid tweakId' };
    const token = psLimiter.tryAcquire({ file: 'main.js', fn: 'preset:getState', reason: 'preset-read' });
    if (!token) return { optionId: null, error: 'busy' };
    try { return await presetTweakExecutor.readPresetValue(tweakId); } finally { psLimiter.release(token); }
  });
  
  ipcMain.handle('presetTweaks:apply', async (event, tweakId, optionId) => {
    if (typeof tweakId !== 'string') return { ok: false, error: 'Invalid tweakId' };
    if (typeof optionId !== 'string') return { ok: false, error: 'Option id required' };
    const token = psLimiter.tryAcquire({ file: 'main.js', fn: 'preset:apply', reason: 'preset-apply' });
    if (!token) return { ok: false, error: 'Another tweak is being applied — please wait a moment.' };
    try { return await presetTweakExecutor.applyPresetValue(tweakId, optionId); } finally { psLimiter.release(token); }
  });
  
  ipcMain.handle('presetTweaks:revert', async (event, tweakId) => {
    if (typeof tweakId !== 'string') return { ok: false, error: 'Invalid tweakId' };
    const token = psLimiter.tryAcquire({ file: 'main.js', fn: 'preset:revert', reason: 'preset-revert' });
    if (!token) return { ok: false, error: 'busy' };
    try { return await presetTweakExecutor.resetPresetValue(tweakId); } finally { psLimiter.release(token); }
  });
  
  ipcMain.handle('presetTweaks:getMeta', (event, tweakId) => {
    if (typeof tweakId !== 'string') return null;
    return presetTweakExecutor.getPresetTweakMeta(tweakId);
  });
  
  ipcMain.handle('presetTweaks:checkCrashSentinel', () => {
    return presetTweakExecutor.checkCrashSentinel();
  });
  
  /**
   * Batch revert all premium preset tweaks that have an original-value backup.
   * Called by the client-side premium revert engine on trial expiry.
   */
  ipcMain.handle('presetTweaks:revertAll', async () => {
    try {
      const result = await presetTweakExecutor.revertAllPremiumPresets();
      console.log(`[IPC] presetTweaks:revertAll — reverted=${result.reverted.length} failed=${result.failed.length}`);
      return { success: true, ...result };
    } catch (e) {
      console.error('[IPC] presetTweaks:revertAll error:', e.message);
      return { success: false, error: e.message, reverted: [], failed: [] };
    }
  });
  
  // ── Multi-GPU: cache invalidation helper ─────────────────────────────────
  // Clears ALL GPU-related caches so a GPU switch takes full effect immediately.
  function _invalidateGpuCache() {
    cachedSpecs     = null;
    cachedSpecsTime = 0;
    gpuState = {
      model: null, vendor: null, isNvidia: false, isAmd: false,
      vramTotalMb: null, vramUsedMb: null, driverVersion: null,
      load: null, temp: null, power: null, clockMhz: null, source: 'none',
      lastStaticUpdate: 0, lastDynamicUpdate: 0,
    };
    try { const fs = require('fs'); fs.unlinkSync(SPECS_CACHE_FILE); } catch (_e) {}
    console.log('[GPU] cache invalidated for GPU switch');
  }

  // Return all detected GPUs so the renderer can show a picker
  ipcMain.handle('gpu:listAll', () => {
    return {
      gpus: wmiGpuList.map((g, i) => ({
        index:    i,
        name:     g.name,
        vramGB:   g.vramBytes > 0 ? parseFloat((g.vramBytes / 1073741824).toFixed(1)) : 0,
        vendor:   g.name.toLowerCase().includes('nvidia') ? 'NVIDIA'
                : (g.name.toLowerCase().includes('amd') || g.name.toLowerCase().includes('radeon')) ? 'AMD'
                : g.name.toLowerCase().includes('intel') ? 'Intel' : 'Unknown',
        selected: i === selectedGpuIndex,
      })),
      selectedIndex: selectedGpuIndex,
    };
  });

  // User picks a different GPU — invalidate caches, re-enrich with new selection
  ipcMain.handle('gpu:setSelected', async (_e, index) => {
    const idx = parseInt(index, 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= wmiGpuList.length) {
      return { ok: false, error: `Invalid GPU index: ${index} (have ${wmiGpuList.length} GPUs)` };
    }
    selectedGpuIndex = idx;
    wmiGpuModelName  = wmiGpuList[idx].name;
    configStore.set('selectedGpuIndex', idx);
    _invalidateGpuCache();
    console.log('[GPU] user selected GPU', idx, ':', wmiGpuModelName);
    void _enrichSpecsInBackground();
    return { ok: true, index: idx, name: wmiGpuModelName };
  });

  // Query the current GPU selection so the renderer can show it on load
  ipcMain.handle('gpu:getSelected', () => {
    const gpu = wmiGpuList[selectedGpuIndex];
    return {
      index:    selectedGpuIndex,
      name:     gpu?.name   || wmiGpuModelName || null,
      vramGB:   gpu ? parseFloat((gpu.vramBytes / 1073741824).toFixed(1)) : 0,
      total:    wmiGpuList.length,
    };
  });

  // Extreme Labs was retired. Keep the legacy implementation unreachable so
  // existing installs cannot expose or execute the removed IPC surface.
  if (false) {
  ipcMain.handle('extremeLabs:createRestorePoint', async () => {
    try {
      if (process.platform !== 'win32') {
        return { ok: false, error: 'System restore points require Windows' };
      }
      const now = Date.now();
      const label = `SwitchControl Extreme Labs ${new Date(now).toISOString().replace('T', ' ').substring(0, 19)}`;
      // Escape single quotes for PowerShell string literal
      const safeLbl = label.replace(/'/g, "''");
      const ps = `
$ErrorActionPreference = 'Stop'
try { Enable-ComputerRestore -Drive "$env:SystemDrive" -ErrorAction SilentlyContinue } catch {}
Checkpoint-Computer -Description '${safeLbl}' -RestorePointType MODIFY_SETTINGS
Write-Output 'ok'`.trim();
      const result = await new Promise((resolve) => {
        const token = psLimiter.tryAcquire({ file: 'main.js', fn: 'createRestorePoint', reason: 'extreme-labs-restore' });
        if (!token) {
          return resolve({ ok: false, error: 'System busy — try again in a moment' });
        }
        execFile('powershell', [
          '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
          '-ExecutionPolicy', 'Bypass', '-Command', ps,
        ], { windowsHide: true, timeout: 60_000 }, (err, stdout, stderr) => {
          psLimiter.release(token);
          if (err) {
            const detail = (stderr || err.message || '').trim().split('\n')[0];
            console.error('[ExtremeLabs] Restore point failed:', detail);
            return resolve({ ok: false, error: 'Windows could not create a restore point: ' + detail });
          }
          if ((stdout || '').trim().toLowerCase().includes('ok')) {
            extremeLabsStore.lastRestorePoint = now;
            return resolve({ ok: true, timestamp: now, label });
          }
          resolve({ ok: false, error: 'Restore point script returned unexpected output — System Protection may be disabled on this drive.' });
        });
      });
      return result;
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
      if (process.platform !== 'win32') {
        return { ok: false, error: 'Extreme Labs analysis requires Windows' };
      }
      // Check real registry/service state for each category instead of returning
      // hardcoded scores.  Each WMI/registry check contributes to an honest score.
      const ps = `
$ErrorActionPreference = 'SilentlyContinue'
function Reg($p,$n){try{(Get-ItemProperty -Path $p -Name $n -EA Stop).$n}catch{$null}}
# Timer resolution / dynamic tick
$timerRes  = Reg 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel' 'GlobalTimerResolutionRequests'
$dynTick   = (bcdedit /enum {current} 2>$null) -match 'useplatformtick.*Yes'
# Game DVR / Capture
$gameDvr   = Reg 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR' 'AppCaptureEnabled'
$gameBar   = Reg 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR' 'GameDVR_Enabled'
# Win32PrioritySeparation
$w32pri    = Reg 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' 'Win32PrioritySeparation'
# SysMain (Superfetch) service
$sysmain   = (Get-Service -Name SysMain -EA SilentlyContinue).Status
# Network throttling index
$netThrot  = Reg 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' 'NetworkThrottlingIndex'
# MMCSS no lazy mode
$mmcssLazy = Reg 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' 'NoLazyMode'
# Power throttling
$pwrThrot  = Reg 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' 'PowerThrottlingOff'
@{
  timerResSet    = ($timerRes -eq 1)
  dynTickOff     = [bool]$dynTick
  gameDvrOff     = ($gameDvr -eq 0 -and $gameBar -eq 0)
  w32Pri         = [int]($w32pri -as [int])
  sysMainStopped = ($sysmain -eq 'Stopped' -or $sysmain -eq $null)
  netThrotMax    = ($netThrot -eq 4294967295 -or $netThrot -eq [uint32]::MaxValue)
  mmcssNoLazy    = ($mmcssLazy -eq 1)
  pwrThrotOff    = ($pwrThrot -eq 1)
} | ConvertTo-Json -Compress`.trim();

      const raw = await new Promise((resolve) => {
        const token = psLimiter.tryAcquire({ file: 'main.js', fn: 'extremeLabs:analyze', reason: 'extreme-analyze' });
        if (!token) return resolve(null);
        execFile('powershell', [
          '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
          '-ExecutionPolicy', 'Bypass', '-Command', ps,
        ], { windowsHide: true, timeout: 15_000 }, (err, stdout) => {
          psLimiter.release(token);
          resolve(!err && stdout ? stdout.trim() : null);
        });
      });

      let state = {};
      try { state = raw ? JSON.parse(raw) : {}; } catch (_) {}

      const timerScore  = state.timerResSet  ? 95 : (state.dynTickOff ? 60 : 35);
      const schedScore  = (state.w32Pri === 26 || state.w32Pri === 24) ? 90 : (state.w32Pri > 0 ? 55 : 40);
      const captScore   = state.gameDvrOff   ? 95 : 30;
      const netScore    = state.netThrotMax  ? 90 : (state.mmcssNoLazy ? 60 : 45);
      const svcScore    = state.sysMainStopped ? 85 : 55;
      const pwrScore    = state.pwrThrotOff  ? 90 : 50;
      const overallScore = Math.round((timerScore + schedScore + captScore + netScore + svcScore + pwrScore) / 6);

      return {
        ok: true,
        scannedAt: Date.now(),
        categories: [
          { name: 'Latency Core',          score: timerScore, recommendation: state.timerResSet  ? 'Timer resolution is optimised' : 'Enable timer resolution for lower scheduling latency' },
          { name: 'Scheduler / CPU',       score: schedScore, recommendation: schedScore >= 85    ? 'Win32 priority separation is tuned' : 'Adjust Win32PrioritySeparation for foreground app priority' },
          { name: 'Gaming / Capture',      score: captScore,  recommendation: state.gameDvrOff   ? 'Game DVR/capture is off — good' : 'Game DVR is active — disabling reduces capture overhead' },
          { name: 'Network Latency',       score: netScore,   recommendation: state.netThrotMax  ? 'Network throttling index is maxed' : 'Set NetworkThrottlingIndex to max for lower jitter' },
          { name: 'Service Weight',        score: svcScore,   recommendation: state.sysMainStopped ? 'SysMain is stopped' : 'SysMain is running — disabling frees memory and I/O' },
          { name: 'Power Throttling',      score: pwrScore,   recommendation: state.pwrThrotOff  ? 'Power throttling is disabled' : 'Power throttling is active — may limit burst CPU performance' },
        ],
        overallScore,
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
        } else if (mapped.type === 'preset') {
          const meta = presetTweakExecutor.getPresetTweakMeta(mapped.tweakId);
          const recommendedOptionId = mapped.recommendedOptionId != null ? mapped.recommendedOptionId : (meta && meta.defaultOptionId);
          if (recommendedOptionId != null) {
            const applyResult = await presetTweakExecutor.applyPresetValue(mapped.tweakId, recommendedOptionId);
            const ok = applyResult.ok;
            if (ok) appliedCount++; else failedCount++;
            console.log('[ExtremeLabsApply]', JSON.stringify({ id, applied: ok, tweakId: mapped.tweakId, type: 'preset', error: applyResult.error }));
            results.push({ id, applied: ok, verify: applyResult.verifyResult, error: applyResult.error });
          } else {
            console.log('[ExtremeLabsApply]', JSON.stringify({ id, applied: false, tweakId: mapped.tweakId, reason: 'noRecommendedOptionId' }));
            results.push({ id, applied: false, reason: 'No recommended option available' });
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
            results.push({ id, applied: ok, result: execResult, error: execResult.error });
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
  
  ipcMain.handle('extremeLabs:restoreBaseline', async (_event, ids) => {
    try {
      const allIds = [
        'global-timer-resolution', 'dynamic-tick', 'hpet-disable',
        'win32-priority-separation', 'system-responsiveness', 'mmcss-no-lazy', 'power-throttling-extreme',
        'disable-game-dvr', 'disable-xbox-capture', 'windowed-games-opt', 'fortnite-priority-booster',
        'network-throttling-index', 'tcp-no-delay', 'rss-enable',
        'interrupt-moderation', 'eee-disable', 'flow-control',
        'windows-search-disable', 'sysmain-disable', 'print-spooler-disable',
        'xbox-services-disable', 'bluetooth-disable',
        'edge-update-disable', 'adobe-updater-disable', 'teams-startup-disable', 'vendor-updaters-disable',
      ];
  
      // If the caller passes a specific list of IDs (from the ownership store), only
      // revert those — avoids spawning PowerShell for tweaks that were never applied.
      // Falls back to the full list when ids is absent or empty (safety sweep).
      const targetIds = Array.isArray(ids) && ids.length > 0
        ? ids.filter(id => allIds.includes(id))
        : allIds;
  
      // Fetch NIC adapter once up-front so parallel NIC reverts share the result.
      let physicalAdapter = null;
      if (targetIds.some(id => _extremeLabsMapToRegistryTweak(id)?.type === 'nic')) {
        try {
          const { adapters = [] } = await nicExecutor.getNetAdapters();
          physicalAdapter = adapters.find(
            a => a.status === 'Up' && !/loopback|bluetooth|hyper|virtual|tunnel|vpn/i.test(a.name)
          ) ?? null;
        } catch { /* non-fatal — nic reverts will report no-adapter */ }
      }
  
      // Run reverts in batches of 4 — independent registry/netsh operations but
      // batched to avoid spawning 24 PowerShell processes simultaneously which
      // causes a visible CPU spike on the user's machine.
      const BATCH_SIZE = 4;
      const results = [];
      for (let i = 0; i < targetIds.length; i += BATCH_SIZE) {
        const batch = targetIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (id) => {
            try {
              const mapped = _extremeLabsMapToRegistryTweak(id);
              if (!mapped) return { id, reverted: false, reason: 'No mapping' };
              if (mapped.type === 'slider') {
                const r = await sliderTweakExecutor.resetSliderValue(mapped.tweakId);
                return { id, reverted: r.success, error: r.error };
              } else if (mapped.type === 'preset') {
                const r = await presetTweakExecutor.resetPresetValue(mapped.tweakId);
                return { id, reverted: r.ok, error: r.error };
              } else if (mapped.type === 'nic') {
                if (!physicalAdapter) return { id, reverted: false, reason: 'No adapter' };
                const r = await nicExecutor.resetNicProperty(physicalAdapter.name, mapped.propertyKey);
                return { id, reverted: r.ok, error: r.error };
              } else {
                const r = await tweakExecutor.executeTweak(mapped.tweakId, 'revert');
                return { id, reverted: r.success, error: r.error };
              }
            } catch (e) {
              return { id, reverted: false, error: e.message };
            }
          })
        );
        results.push(...batchResults);
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
  
  // Live system-state check for all Extreme Labs tweaks.
  // Reads the actual registry / NIC / service state — NOT the ownership JSON.
  // Called on page mount so the UI correctly reflects applied tweaks even when
  // %appdata%\SwitchControl is deleted and localStorage is wiped.
  ipcMain.handle('extremeLabs:checkAllStatus', async () => {
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'extremeLabs:checkAllStatus', reason: 'el-check-all-status' });
    if (!_token) {
      console.log('[extremeLabs:checkAllStatus] SKIPPED — PS limiter full');
      return { ok: false, status: {}, skipped: true, inconclusive: true, error: 'Verification busy; no state was changed.' };
    }
    try {
      const allIds = [
        'pci-msi-mode-extreme',
        'global-timer-resolution', 'dynamic-tick', 'hpet-disable',
        'win32-priority-separation', 'system-responsiveness', 'mmcss-no-lazy', 'power-throttling-extreme',
        'disable-game-dvr', 'disable-xbox-capture', 'windowed-games-opt', 'fortnite-priority-booster',
        'network-throttling-index', 'tcp-no-delay', 'rss-enable',
        'interrupt-moderation', 'eee-disable', 'flow-control',
        'windows-search-disable', 'sysmain-disable', 'print-spooler-disable',
        'xbox-services-disable', 'bluetooth-disable',
        'edge-update-disable', 'adobe-updater-disable', 'teams-startup-disable', 'vendor-updaters-disable',
      ];
  
      // ── Step 1: batch-check all toggle/tweak-type entries in one PS call ────
      const batchResults = await tweakExecutor.batchCheckAllTweaks();
  
      // ── Step 2: slider tweaks (3 individual registry reads) ─────────────────
      const sliderIds = allIds.filter(id => {
        const m = _extremeLabsMapToRegistryTweak(id);
        return m && m.type === 'slider';
      });
      const sliderStatus = {};
      await Promise.all(sliderIds.map(async id => {
        const mapped = _extremeLabsMapToRegistryTweak(id);
        try {
          const r = await sliderTweakExecutor.readSliderValue(mapped.tweakId);
          // Applied = registry holds the recommended value (not absent/default, no error)
          sliderStatus[id] = !r.missing && r.value === mapped.recommendedValue && r.error == null;
          } catch {
          sliderStatus[id] = null;
        }
      }));
  
      // ── Step 3: Preset-type tweaks ──────────────────────────────────────────
      const presetIds = allIds.filter(id => {
        const m = _extremeLabsMapToRegistryTweak(id);
        return m && m.type === 'preset';
      });
      const presetStatus = {};
      await Promise.all(presetIds.map(async id => {
        const mapped = _extremeLabsMapToRegistryTweak(id);
        try {
          const meta = presetTweakExecutor.getPresetTweakMeta(mapped.tweakId);
          const r = await presetTweakExecutor.readPresetValue(mapped.tweakId);
          presetStatus[id] = !r.missing && r.optionId !== (meta && meta.defaultOptionId) && r.error == null;
          } catch {
          presetStatus[id] = null;
        }
      }));
  
      // ── Step 4: NIC-type tweaks ──────────────────────────────────────────────
      const nicIds = allIds.filter(id => {
        const m = _extremeLabsMapToRegistryTweak(id);
        return m && m.type === 'nic';
      });
      const nicStatus = {};
      if (nicIds.length > 0) {
        let physicalAdapter = null;
        try {
          const { adapters = [] } = await nicExecutor.getNetAdapters();
          physicalAdapter = adapters.find(a => a.status === 'Up' && !/loopback|bluetooth|hyper|virtual|tunnel|vpn/i.test(a.name)) ?? null;
        } catch { /* non-fatal */ }
  
        await Promise.all(nicIds.map(async id => {
          if (!physicalAdapter) { nicStatus[id] = null; return; }
          const mapped = _extremeLabsMapToRegistryTweak(id);
          try {
            const r = await nicExecutor.readNicProperty(physicalAdapter.name, mapped.propertyKey);
            nicStatus[id] = r.supported && r.registryValue === String(mapped.enabledValue);
          } catch {
            nicStatus[id] = null;
          }
        }));
      }
  
      // ── Step 5: assemble final status map ───────────────────────────────────
      const status = {};
      for (const id of allIds) {
        const mapped = _extremeLabsMapToRegistryTweak(id);
        if (!mapped) { status[id] = null; continue; }
        if (mapped.type === 'tweak') {
          const entry = batchResults[mapped.tweakId];
          status[id] = entry?.inconclusive ? null : (entry ? !!(entry.isApplied || entry.applied) : null);
        } else if (mapped.type === 'slider') {
          status[id] = sliderStatus[id] ?? null;
        } else if (mapped.type === 'preset') {
          status[id] = presetStatus[id] ?? null;
        } else if (mapped.type === 'nic') {
          status[id] = nicStatus[id] ?? null;
        } else {
          status[id] = null;
        }
      }
  
      const appliedCount = Object.values(status).filter(Boolean).length;
      const inconclusive = Object.entries(status).filter(([, value]) => value === null).map(([id]) => id);
      console.log(`[extremeLabs:checkAllStatus] done applied=${appliedCount}/${allIds.length}`);
      return { ok: inconclusive.length === 0, status, inconclusive, verified: inconclusive.length === 0 };
    } catch (e) {
      console.error('[extremeLabs:checkAllStatus] error:', e.message);
      return { ok: false, status: {}, error: e.message };
    } finally {
      psLimiter.release(_token);
    }
  });
  
  }

  // NIC tuning IPC handlers
  ipcMain.handle('nic:getAdapters', async () => {
    return await nicExecutor.getNetAdapters();
  });
  
  ipcMain.handle('nic:getCapabilities', async (event, adapterName) => {
    if (typeof adapterName !== 'string' || !adapterName.trim()) {
      return { capabilities: {}, error: 'adapterName required' };
    }
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'nic:getCapabilities', reason: 'nic-caps' });
    if (!_token) return psLimiter.skippedResult({ file: 'main.js', fn: 'nic:getCapabilities', reason: 'nic-caps' });
    try {
      return await nicExecutor.getAdapterCapabilities(adapterName);
    } finally {
      psLimiter.release(_token);
    }
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
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'nic:readProperty', reason: 'nic-read' });
    if (!_token) return psLimiter.skippedResult({ file: 'main.js', fn: 'nic:readProperty', reason: 'nic-read' });
    try {
      return await nicExecutor.readNicProperty(adapterName, propertyKey);
    } finally {
      psLimiter.release(_token);
    }
  });
  
  ipcMain.handle('nic:setProperty', async (event, adapterName, propertyKey, value) => {
    if (typeof adapterName !== 'string' || typeof propertyKey !== 'string') {
      return { ok: false, error: 'adapterName and propertyKey required' };
    }
    if (value === undefined || value === null) {
      return { ok: false, error: 'value required' };
    }
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'nic:setProperty', reason: 'nic-set' });
    if (!_token) return psLimiter.skippedResult({ file: 'main.js', fn: 'nic:setProperty', reason: 'nic-set' });
    try {
      return await nicExecutor.setNicPropertyWithOwnership(adapterName, propertyKey, value);
    } finally {
      psLimiter.release(_token);
    }
  });
  
  ipcMain.handle('nic:resetProperty', async (event, adapterName, propertyKey) => {
    if (typeof adapterName !== 'string' || typeof propertyKey !== 'string') {
      return { ok: false, error: 'adapterName and propertyKey required' };
    }
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'nic:resetProperty', reason: 'nic-reset' });
    if (!_token) return psLimiter.skippedResult({ file: 'main.js', fn: 'nic:resetProperty', reason: 'nic-reset' });
    try {
      return await nicExecutor.resetNicProperty(adapterName, propertyKey);
    } finally {
      psLimiter.release(_token);
    }
  });
  
  ipcMain.handle('nic:getPropertyMeta', () => {
    return nicExecutor.getNicPropertyMeta();
  });
  
  // Power Plan handlers
  ipcMain.handle('powerPlans:getState', async () => {
    verboseLog('[IPC] powerPlans:getState');
    // Retry up to 3× with 1.5 s delay — psLimiter slots may all be occupied by
    // startup scans (enrichment, syncAll, batchCheckAll, etc.) when the user
    // navigates to the Power Plan page immediately after launch.  Same pattern
    // as system:getInfo (line 2407 area).
    for (let attempt = 0; attempt < 3; attempt++) {
      const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'powerPlans:getState', reason: 'power-plan-read' });
      if (_token) {
        try {
          return await powerPlanManager.getPowerPlanState();
        } catch (e) {
          console.error('[IPC] powerPlans:getState error:', e.message);
          return { success: false, error: e.message };
        } finally {
          psLimiter.release(_token);
        }
      }
      if (attempt < 2) {
        console.log(`[IPC] powerPlans:getState — limiter busy (attempt ${attempt + 1}/3), retrying in 1.5 s`);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    return { success: false, skipped: true, error: 'Power-plan state read timed out — the app is busy at startup. Use the Retry button.' };
  });
  
  ipcMain.handle('powerPlans:applyProfile', async (event, profileId) => {
    verboseLog(`[IPC] powerPlans:applyProfile: ${profileId}`);
    if (typeof profileId !== 'string') return { success: false, error: 'Invalid profileId' };
    const valid = Object.keys(powerPlanManager.POWER_PROFILES);
    if (!valid.includes(profileId)) return { success: false, error: `Unknown profileId "${profileId}". Valid: ${valid.join(', ')}` };
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'powerPlans:applyProfile', reason: 'power-plan-apply' });
    if (!_token) return { success: false, skipped: true, error: 'Power-plan operation already in progress' };
    try {
      return await powerPlanManager.applyPowerProfileWithOwnership(profileId);
    } catch (e) {
      console.error('[IPC] powerPlans:applyProfile error:', e.message);
      return { success: false, error: e.message };
    } finally {
      psLimiter.release(_token);
    }
  });
  
  ipcMain.handle('powerPlans:listSchemes', async () => {
    verboseLog('[IPC] powerPlans:listSchemes');
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'powerPlans:listSchemes', reason: 'power-plan-list' });
    if (!_token) return { success: false, skipped: true, error: 'Power-plan operation already in progress', schemes: [] };
    try {
      return await powerPlanManager.listSchemesForFrontend();
    } catch (e) {
      return { success: false, error: e.message, schemes: [] };
    } finally {
      psLimiter.release(_token);
    }
  });
  
  ipcMain.handle('powerPlans:applyCustom', async (event, name, settings) => {
    verboseLog(`[IPC] powerPlans:applyCustom name="${name}"`);
    if (typeof name !== 'string') return { success: false, error: 'Invalid plan name' };
    if (!settings || typeof settings !== 'object') return { success: false, error: 'Invalid settings object' };
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'powerPlans:applyCustom', reason: 'power-plan-custom' });
    if (!_token) return { success: false, skipped: true, error: 'Power-plan operation already in progress' };
    try {
      return await powerPlanManager.applyCustomPowerProfile(name, settings);
    } catch (e) {
      console.error('[IPC] powerPlans:applyCustom error:', e.message);
      return { success: false, error: e.message };
    } finally {
      psLimiter.release(_token);
    }
  });
  
  // Captured per-session baselines keep revert operations from imposing
  // assumptions (especially on laptops, where DC policy is user-specific).
  const _powerOverrideBackups = new Map();
  async function _capturePowerOverride(id, subgroup, setting) {
    if (_powerOverrideBackups.has(id)) return _powerOverrideBackups.get(id);
    const raw = await runMainPs(`powercfg /q scheme_current ${subgroup} ${setting}`, { timeout: 4000, label: 'powerPlans:captureOverride' });
    if (!raw) return null;
    const ac = raw.match(/Current AC Power Setting Index:\s*0x([0-9a-f]+)/i);
    const dc = raw.match(/Current DC Power Setting Index:\s*0x([0-9a-f]+)/i);
    if (!ac && !dc) return null;
    const backup = { ac: ac ? parseInt(ac[1], 16) : null, dc: dc ? parseInt(dc[1], 16) : null };
    _powerOverrideBackups.set(id, backup);
    return backup;
  }

  ipcMain.handle('powerPlans:applyOverride', async (event, id, enabled) => {
    verboseLog(`[IPC] powerPlans:applyOverride id="${id}" enabled=${enabled}`);
    const OVERRIDE_PS = {
      'disable-throttle': {
        apply:  'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 3b04d4fd-1cc7-4f23-ab1c-d1337819c4bb 0; powercfg /setactive scheme_current',
        revert: 'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 3b04d4fd-1cc7-4f23-ab1c-d1337819c4bb 3; powercfg /setactive scheme_current',
      },
      'hardware-pstates': {
        apply:  'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 be337238-0d82-4146-a960-4f3749d470c7 1; powercfg /setactive scheme_current',
        revert: 'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 be337238-0d82-4146-a960-4f3749d470c7 0; powercfg /setactive scheme_current',
      },
      'turbo-boost': {
        apply:  'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 45bcc044-d885-43e2-8605-ee0ec6e96b59 2; powercfg /setactive scheme_current',
        revert: 'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 45bcc044-d885-43e2-8605-ee0ec6e96b59 1; powercfg /setactive scheme_current',
      },
      'core-parking': {
        apply:  'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 0; powercfg /setactive scheme_current',
        revert: 'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 100; powercfg /setactive scheme_current',
      },
      'usb-suspend': {
        apply:  'powercfg /setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0; powercfg /setactive scheme_current',
        revert: 'powercfg /setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 1; powercfg /setactive scheme_current',
      },
      'usb-power': {
        apply:  'powercfg /setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 d4e98f31-5ffe-4ce1-be31-1b38b384c009 0; powercfg /setactive scheme_current',
        revert: 'powercfg /setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 d4e98f31-5ffe-4ce1-be31-1b38b384c009 3; powercfg /setactive scheme_current',
      },
      'sleep': {
        apply:  'powercfg /x -standby-timeout-ac 0',
        revert: 'powercfg /x -standby-timeout-ac 30',
      },
      'hibernate': {
        apply:  'powercfg /h off',
        revert: 'powercfg /h on',
      },
      'freq-scaling': {
        apply:  'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 893dee8e-2bef-41e0-89c6-b55d0929964c 100; powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 bc5038f7-23e0-4960-96da-33abaf5935ec 100; powercfg /setactive scheme_current',
        revert: 'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 893dee8e-2bef-41e0-89c6-b55d0929964c 5; powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 bc5038f7-23e0-4960-96da-33abaf5935ec 100; powercfg /setactive scheme_current',
      },
      'perf-processes': {
        apply:  "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -Value 38 -Type DWord -Force",
        revert: "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -Value 2 -Type DWord -Force",
      },
    };
    const cmdSet = OVERRIDE_PS[id];
    if (!cmdSet) return { success: false, error: `Unknown override: ${id}` };
    // For setting overrides, capture both AC and DC before the first apply.
    // Revert restores exactly what the user had, rather than hard-coded values.
    const settingMatch = cmdSet.apply.match(/setacvalueindex\s+scheme_current\s+([0-9a-f-]+)\s+([0-9a-f-]+)/i);
    let ps = enabled ? cmdSet.apply : cmdSet.revert;
    if (id === 'sleep') {
      const backup = await _capturePowerOverride(
        id,
        '238c9fa8-0aad-41ed-83f4-97be242c8f20',
        '29f6c1db-86da-48c5-9fdb-f2b67b1f44da',
      );
      if (!enabled && backup) {
        const restore = [];
        if (backup.ac !== null) restore.push(`powercfg /setacvalueindex scheme_current 238c9fa8-0aad-41ed-83f4-97be242c8f20 29f6c1db-86da-48c5-9fdb-f2b67b1f44da ${backup.ac}`);
        if (backup.dc !== null) restore.push(`powercfg /setdcvalueindex scheme_current 238c9fa8-0aad-41ed-83f4-97be242c8f20 29f6c1db-86da-48c5-9fdb-f2b67b1f44da ${backup.dc}`);
        restore.push('powercfg /setactive scheme_current');
        ps = restore.join('; ');
      } else if (!enabled && !backup) {
        return { success: false, inconclusive: true, error: 'Could not read the prior sleep values; nothing was reverted.' };
      }
    }
    if (settingMatch) {
      const [, subgroup, setting] = settingMatch;
      const backup = await _capturePowerOverride(id, subgroup, setting);
      if (!enabled && backup) {
        const restore = [];
        if (backup.ac !== null) restore.push(`powercfg /setacvalueindex scheme_current ${subgroup} ${setting} ${backup.ac}`);
        if (backup.dc !== null) restore.push(`powercfg /setdcvalueindex scheme_current ${subgroup} ${setting} ${backup.dc}`);
        restore.push('powercfg /setactive scheme_current');
        ps = restore.join('; ');
      } else if (!enabled && !backup) {
        return { success: false, inconclusive: true, error: 'Could not read the prior power-plan values; nothing was reverted.' };
      }
    }
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'powerPlans:applyOverride', reason: 'power-plan-override' });
    if (!_token) return { success: false, skipped: true, error: 'Power-plan operation already in progress' };
    try {
      const result = await powerPlanManager.runElevatedCommands([ps]);
      if (result.cancelled) return { success: false, cancelled: true, error: 'Admin permission cancelled.' };
      if (!result.ok) return { success: false, error: result.error || 'Command failed.' };
      return { success: true };
    } catch (e) {
      console.error(`[IPC] powerPlans:applyOverride ${id} error:`, e.message);
      return { success: false, error: e.message };
    } finally {
      psLimiter.release(_token);
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
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'powerPlans:activateByGuid', reason: 'power-plan-activate' });
    if (!_token) return { success: false, skipped: true, error: 'Power-plan operation already in progress' };
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
    } finally {
      psLimiter.release(_token);
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
      // ── Canonical redirects ───────────────────────────────────────────────────
      // 'tcp-nagle' and 'tcp-throttling-index' were duplicate owners of the same
      // Windows registry values as tweak-executor's 'tcp-no-delay' and
      // slider-tweak-executor's 'net-throttle-index'.  Duplicate entries have been
      // removed from network-tweak-executor's TWEAK_REGISTRY; these two IDs are
      // now routed to their canonical owners so ownership is recorded once and the
      // premium revert pipeline sees a single coherent record per registry value.
      if (tweakId === 'tcp-nagle') {
        const ipcAction = action === 'enable' ? 'apply' : 'revert';
        const r = await tweakExecutor.executeTweakWithOwnership('tcp-no-delay', ipcAction, {});
        console.log(`[PS-Exec] done fn=networkTweaks:execute:${tweakId} (→tcp-no-delay) success=${r.success} verified=${r.verified}`);
        return {
          tweakId, action,
          success:        r.success,
          verified:       r.verified || false,
          message:        r.message || (r.success ? 'ok' : 'failed'),
          requiresRestart: r.requiresRestart || false,
        };
      }
      if (tweakId === 'tcp-throttling-index') {
        const r = action === 'enable'
          ? await sliderTweakExecutor.applySliderValue('net-throttle-index', 4294967295)
          : await sliderTweakExecutor.resetSliderValue('net-throttle-index');
        console.log(`[PS-Exec] done fn=networkTweaks:execute:${tweakId} (→net-throttle-index) ok=${r.ok} verified=${r.verified}`);
        return {
          tweakId, action,
          success:        r.ok === true,
          verified:       r.verified || false,
          message:        r.error || (r.ok ? 'ok' : 'failed'),
          requiresRestart: false,
        };
      }
      // ─────────────────────────────────────────────────────────────────────────
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
      // Redirect canonical duplicates (same redirect logic as networkTweaks:execute)
      if (tweakId === 'tcp-nagle') {
        const r = await tweakExecutor.checkTweakStatus('tcp-no-delay');
        return { tweakId, applied: (typeof r.isApplied === 'boolean') ? r.isApplied : null };
      }
      if (tweakId === 'tcp-throttling-index') {
        const r = await sliderTweakExecutor.readSliderValue('net-throttle-index');
        return { tweakId, applied: !r.error && !r.missing && r.value === 4294967295 };
      }
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

      // Inject redirected IDs that were removed from TWEAK_REGISTRY but are still
      // shown on the Network Tweaks page — check via their canonical executors.
      try {
        const tcpNoDelay = await tweakExecutor.checkTweakStatus('tcp-no-delay');
        result['tcp-nagle'] = { tweakId: 'tcp-nagle', applied: (typeof tcpNoDelay.isApplied === 'boolean') ? tcpNoDelay.isApplied : null };
      } catch (e) {
        result['tcp-nagle'] = { tweakId: 'tcp-nagle', applied: null, error: e.message };
      }
      try {
        const nti = await sliderTweakExecutor.readSliderValue('net-throttle-index');
        result['tcp-throttling-index'] = { tweakId: 'tcp-throttling-index', applied: !nti.error && !nti.missing && nti.value === 4294967295 };
      } catch (e) {
        result['tcp-throttling-index'] = { tweakId: 'tcp-throttling-index', applied: null, error: e.message };
      }

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

  // ── DNS Benchmark & Apply ─────────────────────────────────────────────────────

  ipcMain.handle('dns:benchmark', async () => {
    try {
      return await networkTweakExecutor.benchmarkDnsProviders();
    } catch (e) {
      console.error('[IPC] dns:benchmark error:', e.message);
      return null;
    }
  });

  ipcMain.handle('dns:applyDns', async (_event, ip) => {
    if (typeof ip !== 'string' || !ip.trim()) {
      return { ok: false, error: 'Invalid IP address' };
    }
    try {
      return await networkTweakExecutor.applyDnsServers(ip.trim());
    } catch (e) {
      console.error('[IPC] dns:applyDns error:', e.message);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('dns:revertDns', async () => {
    try {
      return await networkTweakExecutor.revertDnsServers();
    } catch (e) {
      console.error('[IPC] dns:revertDns error:', e.message);
      return { ok: false, error: e.message };
    }
  });

  // ── Premium expiry / ownership ────────────────────────────────────────────────
  
  const premiumRevertPipeline = require('./premium-revert-pipeline');
  const ownershipStore        = require('./ownership-store');
  let premiumRevertInFlight = null;
  
  /**
   * Revert all app-owned premium changes when a trial expires or subscription ends.
   * Returns a full result report ({ total, reverted, skipped, failed, details }).
   */
  ipcMain.handle('premium:revertAll', async (_event, options) => {
    if (premiumRevertInFlight) {
      console.log('[IPC] premium:revertAll — joining existing expiry revert pipeline');
      return premiumRevertInFlight;
    }

    console.log('[IPC] premium:revertAll — starting expiry revert pipeline');
    premiumRevertInFlight = (async () => {
      try {
        const result = await premiumRevertPipeline.revertAllAppOwned(options);
        console.log(`[IPC] premium:revertAll done — reverted=${result.reverted} skipped=${result.skipped} failed=${result.failed}`);
        return { success: result.success !== false && result.failed === 0, ...result };
      } catch (e) {
        console.error('[IPC] premium:revertAll error:', e.message);
        return { success: false, error: e.message, total: 0, reverted: 0, skipped: 0, failed: 0, details: {} };
      }
    })();

    try {
      return await premiumRevertInFlight;
    } finally {
      premiumRevertInFlight = null;
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
   * Check whether the disk-backed ownership store has any app-applied items
   * that still need reverting (appliedByApp === true).
   *
   * This is the authoritative source of truth for the boot-time revert gate.
   * The client-side Zustand ownership store is cleared by closeRevertModal() for
   * UI purposes, which breaks the boot-time retry for items that failed to revert.
   * Reading from the disk store directly avoids that gap — a failed revert leaves
   * its record on disk with appliedByApp=true even after the modal is closed.
   */
  ipcMain.handle('premium:hasAppOwned', () => {
    try {
      const owned = ownershipStore.getAllAppOwned();
      return { success: true, hasItems: owned.length > 0, count: owned.length };
    } catch (e) {
      console.error('[IPC] premium:hasAppOwned error:', e.message);
      return { success: false, hasItems: false, count: 0, error: e.message };
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
    const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'premium:cleanupScPlans', reason: 'power-plan-cleanup' });
    if (!_token) return { success: false, skipped: true, error: 'Power-plan operation already in progress' };
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
    } finally {
      psLimiter.release(_token);
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
  // ── Latency Analyzer ─────────────────────────────────────────────────────────
  ipcMain.handle('latencyAnalyzer:start', async () => {
    console.info('[latencyAnalyzer:ipc] start request');
    if (!latencyAnalyzerAvailable) {
      console.error('[latencyAnalyzer:ipc] start unavailable: module not packaged');
      return {
        ok: false,
        error: 'Latency analyzer module is not installed. Please reinstall SwitchControl.',
      };
    }
    if (latencyAnalyzer.isActive()) {
      return { ok: false, error: 'Analysis already running' };
    }
    _latencyLastSample = null;
    _latencyLastError = null;
    await latencyAnalyzer.startAnalysis(
      (sample) => {
        _latencyLastSample = sample;
        console.info('[latencyAnalyzer:ipc] sample received', JSON.stringify(sample));
      },
      (err) => {
        _latencyLastError = err;
        console.error('[latencyAnalyzer:ipc] collector error:', err);
      }
    );
    console.info('[latencyAnalyzer:ipc] start response ok');
    return { ok: true };
  });

  ipcMain.handle('latencyAnalyzer:stop', async () => {
    console.info('[latencyAnalyzer:ipc] stop request');
    latencyAnalyzer.stopAnalysis();
    _latencyLastSample = null;
    _latencyLastError = null;
    console.info('[latencyAnalyzer:ipc] stop response ok');
    return { ok: true };
  });

  ipcMain.handle('latencyAnalyzer:getSample', () => {
    const s = _latencyLastSample;
    _latencyLastSample = null; // consume so renderer can tell when a new sample arrives
    if (s) console.info('[latencyAnalyzer:ipc] sample delivered to renderer');
    return s;
  });

  ipcMain.handle('latencyAnalyzer:getStatus', () => {
    return { ...latencyAnalyzer.getStatus(), lastError: _latencyLastError };
  });

  ipcMain.handle('latencyAnalyzer:scanDrivers', async () => {
    try {
      return await latencyAnalyzer.scanDrivers();
    } catch (e) {
      console.warn('[latencyAnalyzer:scanDrivers] error:', e.message);
      return [];
    }
  });

  ipcMain.handle('latencyAnalyzer:scanAudioDevices', async () => {
    try {
      return await latencyAnalyzer.scanAudioDevices();
    } catch (e) {
      console.warn('[latencyAnalyzer:scanAudioDevices] error:', e.message);
      return [];
    }
  });

  // ── Scheduler stats (lightweight — safe to call from devtools/debug panels) ────
  ipcMain.handle('telemetry:setDemandMode', (_event, mode) => {
    if (!['full', 'intelligence', 'paused'].includes(mode)) {
      throw new Error('Invalid telemetry demand mode');
    }
    if (_telemetryDemandMode === mode) return { ok: true, mode };
    _telemetryDemandMode = mode;
    _telemetryDemandPaused = mode === 'paused';
    const shouldSlow = mode !== 'full' || _lowEndMode || _telemetryCurrentIntervalMs === TELEMETRY_SLOW_MS;
    _telemetryCurrentIntervalMs = mode === 'paused'
      ? TELEMETRY_SLOW_MS
      : mode === 'intelligence'
        ? Math.max(5000, shouldSlow ? TELEMETRY_SLOW_MS : 5000)
        : (shouldSlow ? TELEMETRY_SLOW_MS : TELEMETRY_BASE_MS);
    console.log(`[telemetry:demand] mode=${mode} interval=${_telemetryCurrentIntervalMs}ms`);
    return { ok: true, mode };
  });

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
      demandMode:           _telemetryDemandMode,
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
        paused:            _telemetryLoopPaused || _telemetryDemandPaused,
        instances:         _telemetryLoopCount,
        currentIntervalMs: _telemetryCurrentIntervalMs,
          demandMode: _telemetryDemandMode,
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
  
    // ── Post-update grace tracking ─────────────────────────────────────────────
    // Compare the version stored from the last launch to the current version.
    // A mismatch means the user just installed an update.  We set a grace flag
    // so the renderer skips the startup premium-revert check on first launch —
    // preventing false reverts before the new version has had a chance to verify
    // the user's entitlements against the server.
    try {
      const storedVersion   = configStore.get('installedVersion');
      const currentVersion  = app.getVersion();
      if (storedVersion && storedVersion !== currentVersion) {
        console.log(`[UPDATE] Version change: ${storedVersion} → ${currentVersion} — setting post-update grace flag`);
        configStore.set('postUpdateGrace', true);
        configStore.set('previousVersion', storedVersion);
      }
      // Always update the stored version so the next launch can detect changes.
      configStore.set('installedVersion', currentVersion);
    } catch (e) {
      console.warn('[UPDATE] Version tracking failed (non-fatal):', e?.message);
    }
  
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
    // Pre-warm only the synchronous snapshot before the window opens. The
    // previous call also launched WMI/systeminformation enrichment here, which
    // competed with Chromium and the packaged backend on cold/low-end boots.
    // Splash.tsx's first getSpecs() request starts the shared enrichment after
    // the renderer exists, while still receiving this instant snapshot.
    loadSystemSpecs({ deferEnrichment: true }).then(specs => {
      console.log('[PREWARM] instant cachedSpecs seeded before window open —', specs?.cpu?.model, '| GPU:', specs?.gpu?.model);
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
      // DevTools locked in production — only open in development builds.
      if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' });
    });
  
    // ── Updater boot ─────────────────────────────────────────────────────────
    updaterService.setMainWindow(mainWindow);
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
  
    if (!_cookiesListenerRegistered) {
      _cookiesListenerRegistered = true;
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
    }
  
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
    if (_telemetryStartDelayTimer) {
      clearTimeout(_telemetryStartDelayTimer);
      _telemetryStartDelayTimer = null;
    }
    // Cancel any pending fade/fallback timers so they don't fire during teardown
    if (_fadeTimer)         { clearInterval(_fadeTimer);         _fadeTimer         = null; }
    if (_fallbackFadeTimer) { clearInterval(_fallbackFadeTimer); _fallbackFadeTimer = null; }
    if (_showFallbackTimer) { clearTimeout(_showFallbackTimer);  _showFallbackTimer = null; }
    tweakExecutor.cleanupTimerResProcess();
    backendLauncher.stopBackend();
  });

  // Ensure the timer-resolution PowerShell agent is cleaned up on hard exits.
  // 'before-quit' handles graceful exits; these cover crashes and SIGTERM.
  app.on('will-quit',  () => tweakExecutor.cleanupTimerResProcess());
  process.on('exit',   () => tweakExecutor.cleanupTimerResProcess());
  process.on('SIGTERM',() => tweakExecutor.cleanupTimerResProcess());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
