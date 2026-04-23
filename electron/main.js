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

app.setName('SwitchControl');
const isDev = !app.isPackaged;
const isProd = !isDev;
const allowDebug = process.env.DEBUG_MODE === 'true';
verboseLog('[BOOT] app.isPackaged:', app.isPackaged, '| isDev:', isDev, '| DEBUG_MODE:', allowDebug);

/**
 * lockDevTools — harden a BrowserWindow against DevTools access in production.
 * In dev mode this is a no-op so normal debugging continues to work.
 */
function lockDevTools(win) {
  if (isDev) return; // dev builds: no restrictions

  // 1. Immediately close DevTools if somehow opened
  win.webContents.on('devtools-opened', () => {
    win.webContents.closeDevTools();
    console.log('[Security] DevTools open attempt blocked in production.');
  });

  // 2. Block all keyboard shortcuts that open DevTools
  win.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    const isDevToolsShortcut =
      key === 'f12' ||
      (input.control && input.shift && key === 'i') ||
      (input.control && input.shift && key === 'j') ||
      (input.control && key === 'u');
    if (isDevToolsShortcut) event.preventDefault();
  });

  // 3. Block right-click context-menu (removes the Inspect Element option)
  win.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });
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

// GPU telemetry polled in background alongside CPU/disk.
// Windows Performance Counters are the primary source for live GPU usage %.
// { load: number|null, temp: number|null, memUsedMb: number|null, memTotalMb: number|null, power: number|null, clockMhz: number|null, source: string }
let gpuPollCache = { load: null, temp: null, memUsedMb: null, memTotalMb: null, power: null, clockMhz: null, source: 'none' };

// Fast GPU existence flag — set true as soon as si.graphics() confirms a controller.
// si.graphics() completes in ~300–600ms (no PowerShell overhead), so this is known
// well before the renderer's first getLive() call. Used to signal "GPU present,
// load pending" so the chart series is always structurally present from frame 1.
let gpuExistsOnHardware = false;

// Safe async telemetry loop — replaces setInterval so each poll only starts
// after the previous one fully completes (including PowerShell GPU counter).
// Set _telemetryLoopActive = false to stop cleanly.
let _telemetryLoopActive = false;

async function _telemetryLoop() {
  verboseLog('[telemetry:poll] async loop started');
  while (_telemetryLoopActive) {
    await pollTelemetry();
    if (_telemetryLoopActive) await new Promise(r => setTimeout(r, 1000));
  }
  verboseLog('[telemetry:poll] async loop exited');
}

async function pollTelemetry() {
  const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'pollTelemetry', reason: 'telemetry-poll' });
  if (!_token) return; // already running — loop will retry after current poll finishes
  try {
    const [load, mem, temps, fsData, netStats, rawDiskIO] = await Promise.all([
      si.currentLoad().catch(e => { console.warn('[telemetry:poll] currentLoad error:', e.message); return { currentLoad: 0, cpus: [] }; }),
      si.mem().catch(e => { console.warn('[telemetry:poll] mem error:', e.message); return { total: 0, available: 0 }; }),
      si.cpuTemperature().catch(() => ({ main: 0, max: 0, cores: [] })),
      si.fsSize().catch(() => []),
      si.networkStats().catch(e => { console.warn('[telemetry:poll] networkStats error:', e.message); return []; }),
      si.disksIO().catch(e => { console.warn('[telemetry:poll] disksIO error:', e.message); return null; }),
    ]);

    // ── Disk delta computation ────────────────────────────────────────────────
    // disksIO() returns cumulative rIO/wIO (sectors, 512 bytes each) and ms (ms busy).
    // We compute per-second rates from consecutive snapshots, matching server/lib/telemetry.ts.
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
      // systeminformation may provide its own per-second rates on some platforms
      const msSec = d.ms_sec != null ? d.ms_sec : (d.tIO_sec != null ? d.tIO_sec : null);

      if (lastDiskSnapshot && rIO != null && wIO != null) {
        const dt_s = (diskNow - lastDiskSnapshot.ts) / 1000;
        if (dt_s > 0.1) {
          const deltaR = Math.max(0, rIO - lastDiskSnapshot.rIO);
          const deltaW = Math.max(0, wIO - lastDiskSnapshot.wIO);
          // 1 sector = 512 bytes = 0.5 KB
          diskIO.readKBps = parseFloat((deltaR / dt_s / 2).toFixed(1));
          diskIO.writeKBps = parseFloat((deltaW / dt_s / 2).toFixed(1));

          if (msSec != null && msSec >= 0) {
            diskIO.activeTimePct = parseFloat(Math.min(msSec / 10, 100).toFixed(1));
          } else if (msTotal != null && msTotal > 0) {
            const deltaMs = Math.max(0, msTotal - lastDiskSnapshot.ms);
            diskIO.activeTimePct = parseFloat(Math.min((deltaMs / (dt_s * 1000)) * 100, 100).toFixed(1));
          } else {
            // ms data missing — estimate from throughput
            const combined = (diskIO.readKBps ?? 0) + (diskIO.writeKBps ?? 0);
            diskIO.activeTimePct = parseFloat(Math.min(combined / 100, 100).toFixed(1));
          }
          // Real rates successfully computed
          diskIO.available = true;
          diskIO.source = 'disksio';
        } else {
          // dt too small — warming, do not emit values
          diskIO.available = false;
          diskIO.source = 'warming';
        }
      } else if (rIO == null && (d.rIO_sec != null || d.wIO_sec != null)) {
        // Platform only gives per-second rates, no cumulative — use them directly
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
        // Strategy C: rawDiskIO responded but no prior snapshot to diff yet (first call warmup)
        diskIO.available = false;
        diskIO.source = 'warming';
      }

      if (rIO != null && wIO != null) {
        lastDiskSnapshot = { rIO, wIO, ms: msTotal != null ? msTotal : 0, ts: diskNow };
      }
    } else {
      // Strategy D: si.disksIO() rejected entirely — PDH counter unavailable on this system
      diskIO.available = false;
      diskIO.source = 'unavailable';
    }

    // ── GPU polling (runs in parallel with disk, does not block cache update) ──
    // Primary: Windows Performance Counters — works for AMD, NVIDIA, Intel.
    // Fallback: LHM → si.graphics() (for temp/VRAM when perf counter provides load).
    const [gpuCounterResult, lhmResult, gpuStaticResult] = await Promise.allSettled([
      getGpuPerfCounterLoad(),
      getLhmTelemetry(),
      getGpuStatic(),
    ]);

    const gpuCounterLoad = gpuCounterResult.status === 'fulfilled' ? gpuCounterResult.value : null;
    const lhm = lhmResult.status === 'fulfilled' ? lhmResult.value : null;
    const gpuStatic = gpuStaticResult.status === 'fulfilled' ? gpuStaticResult.value : null;

    // Build GPU cache: perf counter for load, LHM for temp/power, si.graphics() for VRAM
    const newGpu = { ...gpuPollCache };

    if (gpuCounterLoad != null) {
      newGpu.load = gpuCounterLoad;
      newGpu.source = 'perf-counter';
    } else if (lhm?.gpuLoad != null) {
      newGpu.load = lhm.gpuLoad;
      newGpu.source = 'lhm';
    }
    // Temperature and power — always prefer LHM
    if (lhm?.gpuTemp != null && lhm.gpuTemp > 0) newGpu.temp = lhm.gpuTemp;
    if (lhm?.gpuPower != null && lhm.gpuPower > 0) newGpu.power = lhm.gpuPower;
    // VRAM from si.graphics() (static, changes slowly)
    if (gpuStatic?.memUsedMb != null) newGpu.memUsedMb = gpuStatic.memUsedMb;
    if (gpuStatic?.memTotalMb != null) newGpu.memTotalMb = gpuStatic.memTotalMb;

    gpuPollCache = newGpu;

    liveTelemetryCache = { load, mem, temps, fsData: fsData || [], netStats: netStats || [], diskIO, timestamp: Date.now() };
  } catch (e) {
    console.error('[telemetry:poll] unexpected error:', e.message);
  } finally {
    psLimiter.release(_token);
  }
}

async function startTelemetryPolling() {
  verboseLog('[telemetry:poll] priming differential APIs + pre-warming GPU sources...');

  // ── GPU pre-warm (fire-and-forget, runs in parallel with CPU/disk prime) ──
  // PowerShell perf counters have a 2-4s cold-start overhead on first call.
  // By starting all GPU queries NOW (before the 1.5s measurement window wait),
  // gpuPollCache has real values before the first real pollTelemetry() executes.
  // This ensures getLive() can return gpu.available=true + a valid load reading
  // from the very first renderer call — no delayed line join on the chart.
  si.graphics().then(gfx => {
    const ctrl = gfx?.controllers?.find(c => c.model) ?? gfx?.controllers?.[0];
    if (ctrl) {
      gpuExistsOnHardware = true;
      verboseLog('[telemetry:poll] GPU presence confirmed (fast path):', ctrl.model || 'unknown');
      // Also seed VRAM from this call so getGpuStatic() cache is warm
      if (!gpuStaticCache) {
        gpuStaticCache = {
          memUsedMb:  ctrl.memoryUsed != null && ctrl.memoryUsed > 0 ? safeNum(ctrl.memoryUsed) : null,
          memTotalMb: ctrl.vram       != null && ctrl.vram       > 0 ? safeNum(ctrl.vram)        : null,
        };
        gpuStaticTs = Date.now();
      }
    }
  }).catch(() => {});

  getGpuPerfCounterLoad().then(load => {
    if (load != null) {
      gpuPollCache = { ...gpuPollCache, load, source: 'perf-counter' };
      verboseLog('[telemetry:poll] GPU pre-warm (perf counter) complete: load=' + load + '%');
    }
  }).catch(() => {});

  getLhmTelemetry().then(lhm => {
    if (lhm) {
      const upd = { ...gpuPollCache };
      if (lhm.gpuLoad != null && upd.load == null) { upd.load = lhm.gpuLoad; upd.source = 'lhm'; }
      if (lhm.gpuTemp  != null && lhm.gpuTemp  > 0) upd.temp  = lhm.gpuTemp;
      if (lhm.gpuPower != null && lhm.gpuPower > 0) upd.power = lhm.gpuPower;
      gpuPollCache = upd;
      verboseLog('[telemetry:poll] GPU pre-warm (LHM) complete: load=' + lhm.gpuLoad + ' temp=' + lhm.gpuTemp);
    }
  }).catch(() => {});

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

// Helper: deliver deep link to renderer
function deliverDeepLink(url) {
  verboseLog('[DeepLink] deliverDeepLink() called');
  
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
  
  verboseLog('[DeepLink] ✓ sending auth-callback IPC to renderer');
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
    show: false,
    backgroundColor: '#07090D',
    frame: false,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for systeminformation
      devTools: isDev, // Disabled at Chromium level in production builds
      backgroundThrottling: false, // Prevent timer throttling when window loses focus
      additionalArguments: isDev ? [] : ['--switchcontrol-prod'],
    }
  });
  console.log('[STARTUP:5] BrowserWindow constructed — show:false (waiting for ready-to-show), isVisible:', mainWindow.isVisible());

  // ── DevTools access hardening ─────────────────────────────────────────────────
  // In dev: F12 / Ctrl+Shift+I toggle DevTools normally.
  // In production: lockDevTools() blocks all entry points (shortcuts, context-menu,
  // devtools-opened event, Chromium-level via webPreferences.devTools:false).
  if (isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = input.key.toLowerCase();
      const isDevToolsShortcut =
        key === 'f12' ||
        (input.control && input.shift && key === 'i') ||
        (input.control && input.shift && key === 'j');
      if (!isDevToolsShortcut) return;
      console.log('[DevTools] Shortcut pressed — toggling DevTools (dev mode)');
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    });
  }
  lockDevTools(mainWindow); // no-op in dev; full lockdown in production

  // ── Auto-open DevTools on launch (dev only) ───────────────────────────────────
  if (isDev) {
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('[DevTools] Auto-opening DevTools (dev mode)');
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
  }

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
      if (parsedUrl.protocol === 'file:' || parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
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
    console.log('[STARTUP:6] dev mode — loadURL http://localhost:5000');
    mainWindow.loadURL('http://localhost:5000');
  } else {
    const indexPath = path.join(process.resourcesPath, 'dist', 'index.html');
    const indexExists = require('fs').existsSync(indexPath);
    console.log('[STARTUP:6] packaged mode — indexPath:', indexPath, '| exists:', indexExists);
    if (!indexExists) {
      try {
        const distDir = path.join(process.resourcesPath, 'dist');
        if (require('fs').existsSync(distDir)) {
          console.error('[STARTUP:6] dist contents:', require('fs').readdirSync(distDir).join(', '));
        } else {
          console.error('[STARTUP:6] dist directory does NOT exist at', distDir);
        }
      } catch (e) {
        console.error('[STARTUP:6] could not list dist:', e.message);
      }
    }
    mainWindow.loadFile(indexPath).then(() => {
      console.log('[STARTUP:6] loadFile() promise RESOLVED');
    }).catch(err => {
      console.error('[STARTUP:6] loadFile() promise REJECTED:', err && err.message);
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
    verboseLog('[STARTUP:7] did-finish-load — renderer ready');
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

    if (pendingDeepLinkUrl) {
      verboseLog('[DeepLink] Delivering queued deep link:', pendingDeepLinkUrl);
      mainWindow.webContents.send('auth-callback', pendingDeepLinkUrl);
      pendingDeepLinkUrl = null;
    }
  });
  
  // Send focus events to renderer for UI cleanup
  mainWindow.on('focus', () => {
    if (rendererReady && mainWindow) {
      mainWindow.webContents.send('window-focus');
    }
  });

  // Safety net: if ready-to-show never fires (e.g. GPU stall), force-show after 5 s.
  const showFallbackTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.warn('[STARTUP] ready-to-show fallback — showing window after 5 s timeout');
      mainWindow.show();
      mainWindow.focus();
    }
  }, 5000);

  mainWindow.once('ready-to-show', () => {
    clearTimeout(showFallbackTimer);
    verboseLog('[SwitchControl] Window ready-to-show — showing window');
    // Show first, then focus so the Windows compositor paints immediately and
    // JS timers are not throttled (Chromium GPU rendering stall on frameless windows).
    mainWindow.show();
    mainWindow.focus();
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

// LHM detection cache
let lhmAvailable = null;
let lhmLastCheck = 0;
const LHM_CHECK_INTERVAL = 30000; // Re-check every 30 seconds

// Helper: Check if LibreHardwareMonitor is running and accessible
async function checkLibreHardwareMonitor() {
  const now = Date.now();
  if (lhmAvailable !== null && (now - lhmLastCheck) < LHM_CHECK_INTERVAL) {
    return lhmAvailable;
  }
  
  return new Promise((resolve) => {
    // LHM Web Server default port is 8085
    const http = require('http');
    const req = http.get('http://localhost:8085/data.json', { timeout: 2000 }, (res) => {
      lhmAvailable = res.statusCode === 200;
      lhmLastCheck = now;
      res.resume(); // Consume response to free up memory
      resolve(lhmAvailable);
    });
    
    req.on('error', () => {
      lhmAvailable = false;
      lhmLastCheck = now;
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      lhmAvailable = false;
      lhmLastCheck = now;
      resolve(false);
    });
  });
}

// Helper: Fetch telemetry from LibreHardwareMonitor
async function getLhmTelemetry() {
  if (!await checkLibreHardwareMonitor()) {
    return null;
  }
  
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get('http://localhost:8085/data.json', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = parseLhmData(json);
          resolve(result);
        } catch (e) {
          resolve(null);
        }
      });
    });
    
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

// Helper: Parse LHM JSON structure to extract temps/loads
function parseLhmData(data) {
  const result = {
    cpuTemp: null,
    gpuTemp: null,
    gpuLoad: null,
    moboTemp: null,
    fans: [],
    packagePower: null,
    vcoreVoltage: null,
    cpuBoostClock: null,
    thermalThrottling: false,
    gpuPower: null,
  };
  
  function traverse(node) {
    if (!node) return;
    
    const name = (node.Text || '').toLowerCase();
    const value = parseFloat(node.Value);
    const type = (node.Type || '').toLowerCase();
    
    if (type === 'temperature' && name.includes('cpu') && name.includes('package')) {
      if (Number.isFinite(value)) {
        result.cpuTemp = safeNum(value);
        if (value >= 95) result.thermalThrottling = true;
      }
    }
    
    if (type === 'temperature' && name.includes('gpu') && name.includes('core')) {
      if (Number.isFinite(value)) result.gpuTemp = safeNum(value);
    }
    
    if (type === 'load' && name.includes('gpu') && name.includes('core')) {
      if (Number.isFinite(value)) result.gpuLoad = safeNum(value);
    }
    
    if (type === 'temperature' && (name.includes('system') || name.includes('motherboard'))) {
      if (Number.isFinite(value) && result.moboTemp === null) {
        result.moboTemp = safeNum(value);
      }
    }

    if (type === 'power' && name.includes('cpu') && name.includes('package')) {
      if (Number.isFinite(value)) result.packagePower = safeNum(value);
    }

    if (type === 'power' && name.includes('gpu') && (name.includes('package') || name.includes('total') || name.includes('board'))) {
      if (Number.isFinite(value)) result.gpuPower = safeNum(value);
    }

    if (type === 'voltage' && (name.includes('vcore') || (name.includes('cpu') && name.includes('core')))) {
      if (Number.isFinite(value) && value > 0.5 && value < 2.0 && result.vcoreVoltage === null) {
        result.vcoreVoltage = Math.round(value * 1000) / 1000;
      }
    }

    if (type === 'clock' && name.includes('cpu') && name.includes('core') && !name.includes('bus')) {
      if (Number.isFinite(value) && value > (result.cpuBoostClock || 0)) {
        result.cpuBoostClock = Math.round(value);
      }
    }
    
    if (node.Children && Array.isArray(node.Children)) {
      node.Children.forEach(traverse);
    }
  }
  
  traverse(data);
  return result;
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
const GPU_PERF_COUNTER_MAX_FAILS = 5; // stop trying after 5 consecutive failures

// Last per-engine breakdown — exposed for debug logging
let lastGpuEngineBreakdown = {};

async function getGpuPerfCounterLoad() {
  if (process.platform !== 'win32') return null;
  if (gpuPerfCounterFailCount >= GPU_PERF_COUNTER_MAX_FAILS) return null;
  const _token = psLimiter.tryAcquire({ file: 'main.js', fn: 'getGpuPerfCounterLoad', reason: 'gpu-counter' });
  if (!_token) {
    verboseLog('[GPU:perf] skipped — limiter refused (another run in flight)');
    return gpuPollCache.load ?? null;
  }

  // PowerShell outputs JSON: { "max": <number>, "engines": { <type>: <sum>, ... } }
  const ps = `
try {
  $s = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction Stop).CounterSamples
  $byType = $s | Group-Object { if ($_.InstanceName -match '_engtype_(.+)$') { $Matches[1] } else { 'other' } }
  $engines = @{}
  $maxLoad = 0.0
  foreach ($g in $byType) {
    # Sum across all process instances of this engine type to get total engine load
    $engineSum = [Math]::Round(($g.Group | Measure-Object -Property CookedValue -Sum).Sum, 2)
    $engines[$g.Name] = $engineSum
    if ($engineSum -gt $maxLoad) { $maxLoad = $engineSum }
  }
  $enginesJson = ($engines.GetEnumerator() | ForEach-Object { '"' + $_.Key + '":' + $_.Value }) -join ','
  '{"max":' + [Math]::Round($maxLoad, 2) + ',"engines":{' + $enginesJson + '}}'
} catch {
  '{"max":-1,"engines":{}}'
}`.trim();

  try {
    return await new Promise((resolve) => {
      execFile('powershell', [
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
        '-ExecutionPolicy', 'Bypass', '-Command', ps,
      ], { windowsHide: true, timeout: 4000 }, (err, stdout, stderr) => {
        if (err) {
          gpuPerfCounterFailCount++;
          console.warn(`[GPU:perf] PowerShell error (fail ${gpuPerfCounterFailCount}):`, err.message);
          return resolve(null);
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          const max = parsed.max;
          if (!Number.isFinite(max) || max < 0) {
            gpuPerfCounterFailCount++;
            console.warn(`[GPU:perf] unexpected max value (fail ${gpuPerfCounterFailCount}): ${max}`);
            return resolve(null);
          }
          gpuPerfCounterFailCount = 0; // reset on success
          lastGpuEngineBreakdown = parsed.engines || {};
          resolve(parseFloat(max.toFixed(1)));
        } catch (parseErr) {
          gpuPerfCounterFailCount++;
          console.warn(`[GPU:perf] JSON parse error (fail ${gpuPerfCounterFailCount}): "${stdout.trim()}"`);
          resolve(null);
        }
      });
    });
  } finally {
    psLimiter.release(_token);
  }
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
function getOrCreateDeviceId() {
  const fs = require('fs');
  const crypto = require('crypto');
  const deviceIdPath = DEVICE_ID_FILE;
  
  try {
    if (fs.existsSync(deviceIdPath)) {
      const data = JSON.parse(fs.readFileSync(deviceIdPath, 'utf-8'));
      if (data.deviceId && typeof data.deviceId === 'string') {
        return data.deviceId;
      }
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

  console.log(`[Memory] mode=${mode} exePath=${exePath} isPackaged=${app.isPackaged}`);

  const fs = require('fs');
  if (!fs.existsSync(exePath)) {
    console.error('[Memory] Helper binary not found at:', exePath);
    return { error: true, message: 'Memory helper not found. Feature requires the desktop app.' };
  }

  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    execFile(exePath, ['--mode', mode], { timeout: 10000, windowsHide: true }, (err, stdout, stderr) => {
      if (stderr) console.log('[Memory] stderr:', stderr.trim());
      if (err) {
        console.error('[Memory] execFile error:', err.message, 'killed:', err.killed);
        resolve({ error: true, message: 'Memory clean failed: ' + (err.killed ? 'timeout' : err.message) });
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

async function loadSystemSpecs() {
  const now = Date.now();
  if (cachedSpecs && (now - cachedSpecsTime) < SPECS_CACHE_TTL) {
    return cachedSpecs;
  }

  try {
    // Fetch all data in parallel with individual try/catch
    let cpu = { brand: 'Unknown CPU', cores: 0, speed: 0 };
    let mem = { total: 0, available: 0 };
    let graphics = { controllers: [] };
    let fsData = [];

    try {
      cpu = await si.cpu();
    } catch (e) {
      console.error('[SwitchControl] Failed to get CPU info:', e.message);
    }

    try {
      mem = await si.mem();
    } catch (e) {
      console.error('[SwitchControl] Failed to get memory info:', e.message);
    }

    try {
      graphics = await si.graphics();
    } catch (e) {
      console.error('[SwitchControl] Failed to get graphics info:', e.message);
    }

    try {
      fsData = await si.fsSize();
    } catch (e) {
      console.error('[SwitchControl] Failed to get disk info:', e.message);
    }

    const totalGB = (mem.total || 0) / 1024 / 1024 / 1024;
    const freeGB = (mem.available || 0) / 1024 / 1024 / 1024;
    const usedGB = totalGB - freeGB;

    const gpu = graphics.controllers?.[0];

    const disks = (fsData || []).map(d => {
      const pct = safeNum(d.use || 0);
      return {
        mount: d.mount || 'Unknown',
        name: d.fs || d.mount || 'Unknown',
        totalGB: safeNum((d.size || 0) / 1024 / 1024 / 1024),
        usedGB: safeNum((d.used || 0) / 1024 / 1024 / 1024),
        usePercent: pct,
        usedPercent: pct // Alias for compatibility
      };
    });

    cachedSpecs = {
      cpu: {
        model: cpu.brand || 'Unknown CPU',
        cores: cpu.physicalCores || cpu.cores || 0,
        threads: cpu.cores || 0,
        speed: cpu.speed ? `${safeNum(cpu.speed)} GHz` : 'Unknown'
      },
      gpu: {
        model: gpu?.model || 'Unavailable',
        vendor: gpu?.vendor || 'Unavailable',
        vramGB: gpu?.vram ? safeNum(gpu.vram / 1024) : 0,
        isNvidia: isNvidiaGpu(graphics)
      },
      ram: {
        totalGB: safeNum(totalGB),
        usedGB: safeNum(usedGB),
        freeGB: safeNum(freeGB)
      },
      system: {
        os: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
        osVersion: os.release() || 'Unknown',
        arch: os.arch() || 'Unknown',
        hostname: os.hostname() || 'Unknown',
        hasLibreHardwareMonitor: await checkLibreHardwareMonitor()
      },
      disk: disks[0] || { name: 'C:', usedGB: 0, totalGB: 0, usePercent: 0 },
      disks: disks
    };

    cachedSpecsTime = Date.now();
    console.log('[SwitchControl] System specs loaded:', cachedSpecs.cpu.model, cachedSpecs.gpu.model, 'LHM:', cachedSpecs.system.hasLibreHardwareMonitor);
    return cachedSpecs;

  } catch (e) {
    console.error('[SwitchControl] getSpecs error:', e);
    return {
      cpu: { model: 'Unknown CPU', cores: 0, threads: 0, speed: 'Unknown' },
      gpu: { model: 'Unavailable', vendor: 'Unavailable', vramGB: 0, isNvidia: false },
      ram: { totalGB: 0, usedGB: 0, freeGB: 0 },
      system: { os: 'Unknown', osVersion: 'Unknown', arch: 'Unknown', hostname: 'Unknown', hasLibreHardwareMonitor: false },
      disk: { name: 'Unknown', usedGB: 0, totalGB: 0, usePercent: 0 },
      disks: []
    };
  }
}

ipcMain.handle('system:loadSpecs', async () => {
  return await loadSystemSpecs();
});

// Telemetry handlers
ipcMain.handle('telemetry:getBasic', async () => {
  try {
    const [load, mem, temps] = await Promise.all([
      si.currentLoad().catch(() => ({ currentLoad: 0 })),
      si.mem().catch(() => ({ total: 0, available: 0 })),
      si.cpuTemperature().catch(() => ({ main: 0 }))
    ]);

    const cpuTemp = safeNum(temps.main || 0);
    const ramTotal = Math.round((mem.total || 0) / (1024 * 1024 * 1024));
    const ramUsed = Math.round((((mem.total || 0) - (mem.available || 0)) / (mem.total || 1)) * 100);

    return {
      cpuUsage: safeNum(load.currentLoad || 0),
      ramUsage: ramUsed,
      cpuTemp: cpuTemp > 0 ? cpuTemp : null,
      showCpuTemp: cpuTemp > 0,
      ramTotal: ramTotal,
      showGpu: false,
      showMobo: false,
      timestamp: Date.now()
    };
  } catch (e) {
    return {
      cpuUsage: 0,
      ramUsage: 0,
      cpuTemp: null,
      showCpuTemp: false,
      ramTotal: 0,
      showGpu: false,
      showMobo: false,
      timestamp: Date.now()
    };
  }
});

ipcMain.handle('telemetry:getEnhanced', async () => {
  try {
    const [load, mem, temps] = await Promise.all([
      si.currentLoad().catch(() => ({ currentLoad: 0, cpus: [] })),
      si.mem().catch(() => ({ total: 0, available: 0 })),
      si.cpuTemperature().catch(() => ({ main: 0 }))
    ]);

    const cpuTemp = safeNum(temps.main || 0);
    
    // Only fetch GPU temp if NVIDIA GPU is detected
    let gpuTemp = null;
    if (cachedSpecs?.gpu?.isNvidia) {
      try {
        gpuTemp = await getNvidiaGpuTemp();
      } catch (e) {
        // GPU temp not available
      }
    }

    return {
      cpuUsage: safeNum(load.currentLoad || 0),
      cpuCores: (load.cpus || []).map(c => safeNum(c.load || 0)),
      ramUsage: safeNum(((mem.total - mem.available) / mem.total) * 100 || 0),
      cpuTemp: Number.isFinite(cpuTemp) && cpuTemp > 0 ? cpuTemp : null,
      gpuTemp: gpuTemp,
      timestamp: Date.now()
    };
  } catch (e) {
    return {
      cpuUsage: 0,
      cpuCores: [],
      ramUsage: 0,
      cpuTemp: null,
      gpuTemp: null,
      timestamp: Date.now()
    };
  }
});

ipcMain.handle('telemetry:getHardwareTelemetry', async () => {
  try {
    const specs = await loadSystemSpecs();
    const lhm = await getLhmTelemetry();

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

    let memoryTimings = null;
    const physicalCores = specs?.cpu?.cores || null;
    const logicalCores = specs?.cpu?.threads || null;

    const speedMatch = specs?.cpu?.speed?.match(/[\d.]+/);
    const baseClock = speedMatch ? Math.round(parseFloat(speedMatch[0]) * 1000) : null;

    const cpuBoostClock = lhm?.cpuBoostClock || (baseClock ? Math.round(baseClock * 1.15) : null);
    const cpuBaseClock = baseClock;
    const packagePower = lhm?.packagePower || null;
    const vcoreVoltage = lhm?.vcoreVoltage ?? null;
    const cpuTemp = lhm?.cpuTemp ?? null;
    const thermalThrottling = lhm ? lhm.thermalThrottling : null;
    const gpuPower = lhm?.gpuPower ?? null;

    return {
      cpuBoostClock,
      cpuBaseClock,
      packagePower,
      ppt: null,
      tdc: null,
      edc: null,
      memoryFrequency,
      memoryTimings,
      physicalCores,
      logicalCores,
      cStateResidency: null,
      cpuModel,
      gpuModel,
      ramTotalGB,
      rebarSupported: null,
      vcoreVoltage,
      cpuTemp,
      thermalThrottling,
      gpuPower,
    };
  } catch (e) {
    console.error('[SwitchControl] hardware telemetry error:', e.message);
    return null;
  }
});

// Alias handlers for preload/main name alignment
ipcMain.handle('system:getSpecs', async () => {
  return await loadSystemSpecs();
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
        gpu:     { available: gpuExistsOnHardware, model: null, usagePct: gpuExistsOnHardware ? 0 : null, tempC: null, vramUsedMb: null, vramTotalMb: null, vramUsagePct: null, powerW: null, clockMhz: null },
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

    // --- GPU telemetry: read from background-polled gpuPollCache (fast, non-blocking) ---
    // gpuPollCache is updated every 1s by pollTelemetry() using Windows Perf Counters + LHM.
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
    // While GPU is confirmed present but perf counter hasn't returned yet (load==null),
    // emit 0 so the series exists in the chart data. The line will show a flat 0%
    // baseline for those first few seconds — honest, continuous, and never broken.
    const gpuUsagePct = gpuLoad != null && gpuLoad >= 0 ? gpuLoad : (gpuExistsOnHardware ? 0 : null);
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
        model:       cachedSpecs?.gpu?.model || null,
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

ipcMain.handle('telemetry:getGpu', async () => {
  try {
    const graphics = await si.graphics();
    const ctrl = (graphics.controllers || [])[0];
    if (!ctrl) return null;

    const vendorLower = (ctrl.vendor || '').toLowerCase();
    const isAmd = vendorLower.includes('amd') || vendorLower.includes('advanced micro');

    // Base info from systeminformation
    // For AMD, si.graphics() often returns 0 for load/temp — treat 0 as missing so LHM can override
    const result = {
      model: ctrl.model || 'Unknown GPU',
      vendor: ctrl.vendor || '',
      driverVersion: ctrl.driverVersion || null,
      vram: ctrl.vram > 0 ? safeNum(ctrl.vram) : null,             // MB
      memoryUsed: ctrl.memoryUsed > 0 ? safeNum(ctrl.memoryUsed) : null, // MB
      // For AMD, treat 0 from si as "no data" (LHM will fill); for NVIDIA 0 is valid (GPU idle)
      temperature: ctrl.temperatureGpu > 0 ? safeNum(ctrl.temperatureGpu) : null,
      load: (!isAmd && ctrl.utilizationGpu >= 0) ? safeNum(ctrl.utilizationGpu) : null,
      powerDraw: null,
      clockCore: null,
      clockMemory: null,
    };

    // LHM takes priority — covers AMD RX series + NVIDIA, provides real sensor values
    // For AMD, LHM is the only reliable source; for NVIDIA it supplements si
    try {
      const lhm = await getLhmTelemetry();
      if (lhm) {
        // AMD: always prefer LHM over si (si returns 0 for AMD which is meaningless)
        // NVIDIA: only fill in gaps
        if (lhm.gpuTemp > 0 && (isAmd || result.temperature === null)) {
          result.temperature = lhm.gpuTemp;
        }
        if (lhm.gpuLoad != null && (isAmd || result.load === null)) {
          result.load = lhm.gpuLoad;
        }
        if (lhm.gpuPower > 0 && result.powerDraw === null) {
          result.powerDraw = lhm.gpuPower;
        }
      }
    } catch {}

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
    verboseLog(`[telemetry:getGpu] model=${result.model} vendor=${result.vendor} load=${result.load} temp=${result.temperature} vram=${result.vram}MB power=${result.powerDraw}W`);
    return result;
  } catch (e) {
    console.error('[telemetry:getGpu] error:', e.message);
    return null;
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
ipcMain.handle('tweak:execute', async (event, tweakId, action) => {
  if (typeof tweakId !== 'string' || typeof action !== 'string') {
    return { error: true, message: 'Invalid parameters' };
  }
  const validActions = ['apply', 'revert'];
  if (!validActions.includes(action)) {
    return { error: true, message: 'Invalid action. Use apply or revert.' };
  }
  console.log(`[SwitchControl] Executing tweak: ${tweakId}, action: ${action}`);
  return await tweakExecutor.executeTweakWithOwnership(tweakId, action);
});

ipcMain.handle('tweak:checkStatus', async (event, tweakId) => {
  if (typeof tweakId !== 'string') {
    return { error: true, message: 'Invalid tweakId' };
  }
  return await tweakExecutor.checkTweakStatus(tweakId);
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

ipcMain.handle('tweak:getLog', () => {
  return tweakExecutor.getExecutionLog();
});

// Diagnostic: returns the live PS limiter state (active slots, global cap)
// Useful for verifying zero idle PowerShell processes between polls.
ipcMain.handle('psLimiter:getState', () => {
  return psLimiter.getState();
});

ipcMain.handle('tweak:getLocalState', () => {
  return tweakExecutor.getLocalState();
});

ipcMain.handle('tweak:getInfo', () => {
  return tweakExecutor.getTweakInfo();
});

// Slider tweak IPC handlers
ipcMain.handle('tweak:readValue', async (event, tweakId) => {
  if (typeof tweakId !== 'string') return { value: null, error: 'Invalid tweakId' };
  return await sliderTweakExecutor.readSliderValue(tweakId);
});

ipcMain.handle('tweak:applyValue', async (event, tweakId, value) => {
  if (typeof tweakId !== 'string') return { ok: false, error: 'Invalid tweakId' };
  if (value === undefined || value === null) return { ok: false, error: 'Value required' };
  return await sliderTweakExecutor.applySliderValue(tweakId, value);
});

ipcMain.handle('tweak:verifyValue', async (event, tweakId, expectedValue) => {
  if (typeof tweakId !== 'string') return { ok: false, error: 'Invalid tweakId' };
  return await sliderTweakExecutor.verifySliderValue(tweakId, expectedValue);
});

ipcMain.handle('tweak:resetValue', async (event, tweakId) => {
  if (typeof tweakId !== 'string') return { ok: false, error: 'Invalid tweakId' };
  return await sliderTweakExecutor.resetSliderValue(tweakId);
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

ipcMain.handle('powerPlans:activateByGuid', async (event, guid) => {
  verboseLog(`[IPC] powerPlans:activateByGuid: ${guid}`);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof guid !== 'string' || !UUID_RE.test(guid.trim())) {
    return { success: false, error: 'Invalid GUID' };
  }
  try {
    const { execFileSync } = require('child_process');
    execFileSync('powercfg', ['/setactive', guid.trim()], { stdio: 'pipe', windowsHide: true });
    // Verify the plan is now active
    const verifyState = await powerPlanManager.getPowerPlanState();
    const activeGuid = verifyState?.activeScheme?.guid ?? '';
    if (activeGuid.toLowerCase() !== guid.trim().toLowerCase()) {
      return { success: false, error: `Plan set but verification failed — active=${activeGuid}` };
    }
    verboseLog(`[IPC] powerPlans:activateByGuid success — active="${activeGuid}"`);
    return { success: true, activeScheme: verifyState.activeScheme };
  } catch (e) {
    console.error('[IPC] powerPlans:activateByGuid error:', e.message);
    return { success: false, error: e.message };
  }
});

// ── App Booster: per-game system actions ──────────────────────────────────────

ipcMain.handle('appBooster:scanGames', async (event, games) => {
  verboseLog('[AppBooster] scanGames start —', games?.length, 'games');
  const fs   = require('fs');
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
    if (fs.existsSync(vdfPath)) {
      try {
        const vdf = fs.readFileSync(vdfPath, 'utf8');
        for (const m of [...vdf.matchAll(/"path"\s+"([^"]+)"/g)]) {
          const lib = m[1].replace(/\\\\/g, '\\');
          const common = path.join(lib, 'steamapps', 'common');
          if (!steamCommonPaths.includes(common)) steamCommonPaths.push(common);
        }
      } catch (e) { console.log('[AppBooster] vdf parse error', vdfPath, e.message); }
      const def = path.join(steamRoot, 'steamapps', 'common');
      if (!steamCommonPaths.includes(def)) steamCommonPaths.push(def);
    }
  }
  verboseLog('[AppBooster] Steam library paths found:', steamCommonPaths.length);

  // ── 2. Epic Games Launcher manifests → map exe basename → install dir ──────
  // Manifests live in %ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item
  const epicInstalls = {}; // exeBasename.toLowerCase() → installLocation
  const epicManifestDirs = [
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'),
  ];
  for (const manifestDir of epicManifestDirs) {
    if (!fs.existsSync(manifestDir)) continue;
    let items;
    try { items = fs.readdirSync(manifestDir).filter(f => f.endsWith('.item')); } catch { continue; }
    for (const itemFile of items) {
      try {
        const raw = fs.readFileSync(path.join(manifestDir, itemFile), 'utf8');
        const manifest = JSON.parse(raw);
        const installLoc  = manifest.InstallLocation;
        const launchExe   = manifest.LaunchExecutable; // e.g. "FortniteGame/Binaries/Win64/FortniteClient-Win64-Shipping.exe"
        if (installLoc && launchExe) {
          const exeBasename = path.basename(launchExe).toLowerCase();
          const exeDir      = path.join(installLoc, path.dirname(launchExe));
          epicInstalls[exeBasename] = exeDir;
          console.log(`[AppBooster] Epic manifest: ${exeBasename} → ${exeDir}`);
        }
      } catch { /* skip malformed manifest */ }
    }
  }

  // ── 3. Xbox / Game Pass install roots ─────────────────────────────────────
  const xboxRoots = [];
  const drives = ['C', 'D', 'E', 'F', 'G'];
  for (const d of drives) {
    const p = `${d}:\\XboxGames`;
    if (fs.existsSync(p)) xboxRoots.push(p);
  }
  // Also check user-configured Xbox install dirs from registry (best-effort)
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\GamingServices" /v "GamingRootPath" /reg:64 2>nul',
      { timeout: 3000, encoding: 'utf8', windowsHide: true }
    );
    const m = out.match(/GamingRootPath\s+REG_SZ\s+(.+)/i);
    if (m) {
      const p = m[1].trim();
      if (p && !xboxRoots.includes(p)) xboxRoots.push(p);
    }
  } catch { /* registry key may not exist */ }
  verboseLog('[AppBooster] Xbox roots found:', xboxRoots.length, xboxRoots);

  // ── helper: find exe inside a root directory (up to 3 levels deep) ─────────
  function findExeIn(rootDir, exeName, maxDepth = 3) {
    if (maxDepth < 0 || !fs.existsSync(rootDir)) return null;
    let entries;
    try { entries = fs.readdirSync(rootDir, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (!entry.isDirectory()) {
        if (entry.name.toLowerCase() === exeName.toLowerCase()) return rootDir;
      } else {
        const found = findExeIn(fullPath, exeName, maxDepth - 1);
        if (found) return found;
      }
    }
    return null;
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
      if (fs.existsSync(path.join(p, g.executable))) {
        detected = true; installPath = p;
        console.log(`[AppBooster]   ${g.slug}: found via Epic manifest → ${p}`);
      }
    }

    // Step B: hardcoded knownPaths
    if (!detected) {
      for (const p of (g.knownPaths || [])) {
        if (fs.existsSync(path.join(p, g.executable))) {
          detected = true; installPath = p; break;
        }
      }
    }

    // Step C: Xbox roots (recursive, 3 levels)
    if (!detected) {
      for (const xboxRoot of xboxRoots) {
        if (detected) break;
        let xboxDirs;
        try { xboxDirs = fs.readdirSync(xboxRoot); } catch { continue; }
        for (const dir of xboxDirs) {
          if (detected) break;
          const found = findExeIn(path.join(xboxRoot, dir), g.executable, 3);
          if (found) { detected = true; installPath = found; }
        }
      }
    }

    // Step D: Steam common dirs (one level + one deeper)
    if (!detected) {
      for (const commonDir of steamCommonPaths) {
        if (detected) break;
        if (!fs.existsSync(commonDir)) continue;
        let gameDirs;
        try { gameDirs = fs.readdirSync(commonDir); } catch { continue; }
        for (const dir of gameDirs) {
          if (detected) break;
          const gameDir = path.join(commonDir, dir);
          if (fs.existsSync(path.join(gameDir, g.executable))) {
            detected = true; installPath = gameDir; break;
          }
          let subDirs;
          try { subDirs = fs.readdirSync(gameDir); } catch { continue; }
          for (const sub of subDirs) {
            const subDir = path.join(gameDir, sub);
            if (fs.existsSync(path.join(subDir, g.executable))) {
              detected = true; installPath = subDir; break;
            }
          }
        }
      }
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

  try {
    validateAppBoosterInput(installPath, 'installPath', WIN_PATH_RE);
    validateAppBoosterInput(executable,  'executable',  EXEC_NAME_RE);
    validateAppBoosterInput(gameName,    'gameName',    GAME_NAME_RE);
  } catch (e) {
    return { success: false, error: e.message, verified: false };
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
  };

  const scriptSet = scripts[type];
  if (!scriptSet || !scriptSet[mode]) {
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
  }
});

// ── Network Tweaks ────────────────────────────────────────────────────────────

ipcMain.handle('networkTweaks:execute', async (event, tweakId, action) => {
  console.log(`[IPC] networkTweaks:execute id=${tweakId} action=${action}`);
  try {
    const result = await networkTweakExecutor.executeNetworkTweakWithOwnership(tweakId, action);
    console.log(`[IPC] networkTweaks:execute result:`, result.success, result.verified, result.message?.slice(0, 80));
    return result;
  } catch (e) {
    console.error('[IPC] networkTweaks:execute error:', e.message);
    return { tweakId, action, success: false, verified: false, message: e.message, requiresRestart: false };
  }
});

ipcMain.handle('networkTweaks:checkStatus', async (event, tweakId) => {
  try {
    return await networkTweakExecutor.checkNetworkTweakStatus(tweakId);
  } catch (e) {
    return { tweakId, applied: null, error: e.message };
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
  console.log('[PS-Exec] start file=main.js fn=networkTweaks:checkAll reason=net-tweak-check-all');
  try {
    const result = await networkTweakExecutor.checkAllNetworkTweakStatus();
    console.log(`[PS-Exec] done file=main.js fn=networkTweaks:checkAll ms=${Date.now() - t0}`);
    return result;
  } catch (e) {
    console.error('[IPC] networkTweaks:checkAll error:', e.message);
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
  // Start telemetry poll before window so first getLive call finds a primed cache.
  startTelemetryPolling().catch(e => console.error('[telemetry:poll] startTelemetryPolling error:', e.message));
  createWindow();

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

  // Register DevTools IPC handler — dev mode only
  ipcMain.handle('app:openDevTools', (event) => {
    if (!isDev) {
      console.warn('[Security] app:openDevTools IPC call blocked in production.');
      return { success: false, reason: 'production' };
    }
    if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' });
    return { success: true };
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

app.on('window-all-closed', () => {
  backendLauncher.stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  _telemetryLoopActive = false; // signals the async loop to stop after current poll
  console.log('[telemetry:poll] async loop stop requested on quit');
  backendLauncher.stopBackend();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
