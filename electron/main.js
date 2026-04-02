// ============================================================
// BOOT PROOF — if you see this in logs, this file is running
// ============================================================
console.log('\n\n========================================');
console.log('[BOOT] ELECTRON MAIN LOADED');
console.log('[BOOT] __filename:', __filename);
console.log('[BOOT] process.execPath:', process.execPath);
console.log('[BOOT] process.cwd():', process.cwd());
console.log('[BOOT] process.argv:', JSON.stringify(process.argv));
console.log('[BOOT] NODE_ENV:', process.env.NODE_ENV);
console.log('[BOOT] timestamp:', new Date().toISOString());
console.log('========================================\n\n');

const { app, BrowserWindow, ipcMain, shell, globalShortcut, Menu } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const si = require('systeminformation');
const tweakExecutor = require('./tweak-executor');
const backendLauncher = require('./backend-launcher');
const configStore = require('./config-store');

app.setName('SwitchControl');
const isDev = !app.isPackaged;
console.log('[BOOT] app.isPackaged:', app.isPackaged);
console.log('[BOOT] isDev:', isDev);
const PROTOCOL_NAME = 'switchcontrol';
let mainWindow = null;

// Deep-link queue for when renderer is not ready
let pendingDeepLinkUrl = null;
let rendererReady = false;

// Cache for system specs (5 minute TTL)
let cachedSpecs = null;
let cachedSpecsTime = 0;
const SPECS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let lastCpuLoad = 0;

// Register protocol handler BEFORE app is ready
let protocolRegistered = false;
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    protocolRegistered = app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  protocolRegistered = app.setAsDefaultProtocolClient(PROTOCOL_NAME);
}
console.log(`[Protocol] ===== PROTOCOL REGISTRATION =====`);
console.log(`[Protocol] result: ${protocolRegistered}`);
console.log(`[Protocol] isDefault: ${app.isDefaultProtocolClient(PROTOCOL_NAME)}`);
console.log(`[Protocol] isDev: ${isDev}`);
console.log(`[Protocol] isPackaged: ${app.isPackaged}`);
console.log(`[Protocol] ================================`);

// Helper: deliver deep link to renderer
function deliverDeepLink(url) {
  console.log('[DeepLink] deliverDeepLink() called');
  
  if (!mainWindow) {
    console.log('[DeepLink] ✗ mainWindow=null, queueing URL');
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
    console.log('[DeepLink] ⏳ rendererReady=false, queueing URL for delivery after load');
    pendingDeepLinkUrl = url;
    return;
  }
  
  console.log('[DeepLink] ✓ sending auth-callback IPC to renderer');
  mainWindow.webContents.send('auth-callback', url);
}

// Single instance lock for Windows deep-link handling
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    console.log('[DeepLink] ===== SECOND-INSTANCE EVENT =====');
    console.log('[DeepLink] commandLine:', JSON.stringify(commandLine));
    
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url) {
      console.log('[DeepLink] ✓ protocol URL FOUND:', url);
      deliverDeepLink(url);
    } else {
      console.log('[DeepLink] ✗ NO protocol URL in commandLine');
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    }
    console.log('[DeepLink] ====================================');
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('[DeepLink] ===== OPEN-URL EVENT =====');
  console.log('[DeepLink] ✓ received URL:', url);
  deliverDeepLink(url);
  console.log('[DeepLink] ============================');
});

function createWindow() {
  console.log('[BOOT] Creating window with DevTools enabled');
  mainWindow = new BrowserWindow({
    title: 'SwitchControl DEBUG BUILD',
    width: 1300,
    height: 800,
    show: false,
    backgroundColor: '#0c0e12',
    frame: false,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for systeminformation
      devTools: true,
    }
  });

  // Add keyboard shortcut handler for DevTools (before-input-event)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F12 = toggle DevTools
    if (input.key.toLowerCase() === 'f12') {
      console.log('[DevTools] F12 pressed - toggling DevTools');
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
      return;
    }
    // Ctrl+Shift+I = toggle DevTools
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      console.log('[DevTools] Ctrl+Shift+I pressed - toggling DevTools');
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
      return;
    }
    // Ctrl+Shift+J = toggle DevTools console
    if (input.control && input.shift && input.key.toLowerCase() === 'j') {
      console.log('[DevTools] Ctrl+Shift+J pressed - toggling DevTools');
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
      return;
    }
  });

  const { session: electronSession } = require('electron');
  electronSession.defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://switchcontrol.org/*', 'https://*.switchcontrol.org/*'] },
    (details, callback) => {
      const setCookies = details.responseHeaders?.['set-cookie'] || details.responseHeaders?.['Set-Cookie'];
      if (setCookies) {
        console.log('[Auth][MAIN] set-cookie received for', details.url);
        console.log('[Auth][MAIN] set-cookie values:', setCookies);
      }
      callback({ cancel: false, responseHeaders: details.responseHeaders });
    }
  );
  
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
    mainWindow.loadURL('http://localhost:5000');
  } else {
    const indexPath = path.join(process.resourcesPath, 'dist', 'index.html');
    console.log('[SwitchControl] Loading:', indexPath);
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('[SwitchControl] Failed to load:', err);
    });
  }

  // Track when renderer is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[SwitchControl] Renderer did-finish-load');
    rendererReady = true;

    console.log('[DevTools] FORCING DEVTOOLS OPEN');
    setTimeout(() => {
      try {
        mainWindow?.webContents.openDevTools({ mode: 'detach' });
        console.log('[DevTools] openDevTools called successfully');
      } catch (err) {
        console.error('[DevTools] Failed to open DevTools:', err);
      }
    }, 500);

    // Close the race: if the backend became ready BEFORE the renderer
    // finished loading, the backend-ready push was skipped. Send it now.
    if (!isDev && backendLauncher.isBackendReady()) {
      const port = backendLauncher.getBackendPort();
      console.log('[Backend] Sending backend-ready to renderer on did-finish-load, port:', port);
      mainWindow.webContents.send('backend-ready', { port });
    }

    if (pendingDeepLinkUrl) {
      console.log('[DeepLink] Delivering queued deep link:', pendingDeepLinkUrl);
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

  mainWindow.once('ready-to-show', () => {
    console.log('[SwitchControl] Window ready-to-show');
    mainWindow.show();
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

// Persistent Device ID — generated once, stored forever in userData
function getOrCreateDeviceId() {
  const fs = require('fs');
  const crypto = require('crypto');
  const deviceIdPath = path.join(app.getPath('userData'), 'device-id.json');
  
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
    execFile(exePath, ['--mode', mode], { timeout: 10000 }, (err, stdout, stderr) => {
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
    const [load, mem, temps, fsData, netStats, diskIO] = await Promise.all([
      si.currentLoad().catch(() => ({ currentLoad: 0, cpus: [] })),
      si.mem().catch(() => ({ total: 0, available: 0, used: 0, swaptotal: 0, swapused: 0 })),
      si.cpuTemperature().catch(() => ({ main: 0, max: 0, cores: [] })),
      si.fsSize().catch(() => []),
      si.networkStats().catch(() => []),
      si.disksIO().catch(() => ({ rIO_sec: 0, wIO_sec: 0 }))
    ]);

    const cpuLoad = safeNum(load.currentLoad || 0);
    const cpuTemp = safeNum(temps.main || 0);
    const cpuMaxTemp = safeNum(temps.max || 0);
    const coreLoads = (load.cpus || []).map(c => safeNum(c.load || 0));

    const ramTotal = mem.total || 0;
    const ramUsed = (mem.total || 0) - (mem.available || 0);
    const ramTotalGb = Math.round(ramTotal / (1024 * 1024 * 1024));
    const ramUsedGb = parseFloat((ramUsed / (1024 * 1024 * 1024)).toFixed(1));
    const ramPercent = ramTotal > 0 ? Math.round((ramUsed / ramTotal) * 100) : 0;

    // --- GPU telemetry: LHM first (AMD + NVIDIA), then si.graphics(), then nvidia-smi ---
    let gpuTemp = null;
    let gpuLoad = null;
    let gpuMemUsed = null;
    let gpuMemTotal = null;
    let gpuPower = null;
    let gpuClockMhz = null;

    // 1. Try LibreHardwareMonitor — works for AMD and NVIDIA
    try {
      const lhm = await getLhmTelemetry();
      if (lhm) {
        if (lhm.gpuTemp != null && lhm.gpuTemp > 0) gpuTemp = lhm.gpuTemp;
        if (lhm.gpuLoad != null && lhm.gpuLoad >= 0) gpuLoad = lhm.gpuLoad;
        if (lhm.gpuPower != null && lhm.gpuPower > 0) gpuPower = lhm.gpuPower;
      }
    } catch {}

    // 2. Try si.graphics() for load/temp if LHM didn't provide them
    if (gpuTemp === null || gpuLoad === null) {
      try {
        const gr = await si.graphics().catch(() => null);
        const ctrl = gr?.controllers?.[0];
        if (ctrl) {
          if (gpuTemp === null && ctrl.temperatureGpu != null && ctrl.temperatureGpu > 0) {
            gpuTemp = safeNum(ctrl.temperatureGpu);
          }
          if (gpuLoad === null && ctrl.utilizationGpu != null && ctrl.utilizationGpu >= 0) {
            gpuLoad = safeNum(ctrl.utilizationGpu);
          }
          if (gpuMemUsed === null && ctrl.memoryUsed != null && ctrl.memoryUsed > 0) {
            gpuMemUsed = safeNum(ctrl.memoryUsed);
          }
          if (gpuMemTotal === null && ctrl.vram != null && ctrl.vram > 0) {
            gpuMemTotal = safeNum(ctrl.vram);
          }
        }
      } catch {}
    }

    // 3. nvidia-smi for NVIDIA only if LHM and si didn't give us data
    if (cachedSpecs?.gpu?.isNvidia && (gpuTemp === null || gpuLoad === null)) {
      try {
        const nvidiaData = await new Promise((resolve) => {
          exec(
            'nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,clocks.current.graphics --format=csv,noheader,nounits',
            { windowsHide: true, timeout: 3000 },
            (err, stdout) => {
              if (err || !stdout) return resolve(null);
              const parts = stdout.trim().split(',').map(s => s.trim());
              if (parts.length >= 6) return resolve(parts);
              resolve(null);
            }
          );
        });
        if (nvidiaData) {
          if (gpuTemp === null) gpuTemp = safeNum(parseFloat(nvidiaData[0]), null);
          if (gpuLoad === null) gpuLoad = safeNum(parseFloat(nvidiaData[1]), null);
          if (gpuMemUsed === null) gpuMemUsed = safeNum(parseFloat(nvidiaData[2]), null);
          if (gpuMemTotal === null) gpuMemTotal = safeNum(parseFloat(nvidiaData[3]), null);
          if (gpuPower === null) gpuPower = safeNum(parseFloat(nvidiaData[4]), null);
          if (gpuClockMhz === null) gpuClockMhz = safeNum(parseFloat(nvidiaData[5]), null);
        }
      } catch {}
    }

    // --- Disk: resolve selected disk, fall back to C: then first ---
    const disks = fsData || [];
    let selectedDisk = null;
    if (selectedDiskMount) {
      selectedDisk = disks.find(d => d.mount === selectedDiskMount);
    }
    if (!selectedDisk) {
      selectedDisk = disks.find(d => d.mount === 'C:' || d.mount === '/') || disks[0];
    }
    const diskPercent = selectedDisk ? safeNum(selectedDisk.use, 0) : 0;
    const diskReadSec = safeNum(diskIO.rIO_sec || 0, 0);
    const diskWriteSec = safeNum(diskIO.wIO_sec || 0, 0);

    // --- Network: always return 0 (not null) when idle ---
    let netRxSec = 0;
    let netTxSec = 0;
    for (const iface of (netStats || [])) {
      netRxSec += safeNum(iface.rx_sec || 0, 0);
      netTxSec += safeNum(iface.tx_sec || 0, 0);
    }
    const netRxKBs = Math.round(netRxSec / 1024);
    const netTxKBs = Math.round(netTxSec / 1024);

    const gpuAvailable = gpuLoad != null || gpuTemp != null;
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
        usagePct:    gpuLoad  != null && gpuLoad  >= 0 ? gpuLoad  : null,
        tempC:       gpuTemp  != null && gpuTemp  >  0 ? gpuTemp  : null,
        vramUsedMb,
        vramTotalMb,
        vramUsagePct,
        powerW:      gpuPower    != null && gpuPower    > 0 ? gpuPower    : null,
        clockMhz:    gpuClockMhz != null && gpuClockMhz > 0 ? gpuClockMhz : null,
      },
      disk: {
        selectedMount:  selectedDisk?.mount || null,
        usagePct:       diskPercent,
        readOpsPerSec:  diskReadSec,
        writeOpsPerSec: diskWriteSec,
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

    console.log(`[telemetry:getLive] disk=${result.disk.selectedMount} diskPct=${diskPercent} net=${netRxKBs}↓/${netTxKBs}↑ gpu=${gpuLoad}%/${gpuTemp}°C`);
    return result;
  } catch (e) {
    console.error('[telemetry:getLive] error:', e.message);
    return {
      timestamp: Date.now(),
      cpu:     { usagePct: 0, tempC: null, coreCount: 0 },
      ram:     { usedGb: 0, totalGb: 0, usagePct: 0 },
      gpu:     { available: false, model: null, usagePct: null, tempC: null, vramUsedMb: null, vramTotalMb: null, vramUsagePct: null, powerW: null, clockMhz: null },
      disk:    { selectedMount: null, usagePct: 0, readOpsPerSec: 0, writeOpsPerSec: 0 },
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
      fs: d.fs,
      type: d.type,
      size: d.size,
      used: d.used,
      available: d.available,
      use: d.use,
      mount: d.mount
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
    console.log(`[telemetry:getGpu] model=${result.model} vendor=${result.vendor} load=${result.load} temp=${result.temperature} vram=${result.vram}MB power=${result.powerDraw}W`);
    return result;
  } catch (e) {
    console.error('[telemetry:getGpu] error:', e.message);
    return null;
  }
});

ipcMain.handle('telemetry:getDisk', async (event, selectedDiskMount) => {
  try {
    const [disks, io] = await Promise.all([
      si.fsSize().catch(() => []),
      si.disksIO().catch(() => ({ rIO: 0, wIO: 0, tIO: 0 }))
    ]);

    // Find the requested disk, fall back to C: then first
    const allDisks = (disks || []).map(d => ({
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
      selected = allDisks.find(d => d.mount === selectedDiskMount);
    }
    if (!selected) {
      selected = allDisks.find(d => d.mount === 'C:' || d.mount === '/') || allDisks[0];
    }

    console.log(`[telemetry:getDisk] requested=${selectedDiskMount} resolved=${selected?.mount} use=${selected?.use}%`);
    return {
      disks: allDisks,
      selected,
      io: { rIO: io.rIO || 0, wIO: io.wIO || 0, tIO: io.tIO || 0 }
    };
  } catch (e) {
    console.error('[telemetry:getDisk] error:', e.message);
    return { disks: [], selected: null, io: { rIO: 0, wIO: 0, tIO: 0 } };
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
  return await tweakExecutor.executeTweak(tweakId, action);
});

ipcMain.handle('tweak:checkStatus', async (event, tweakId) => {
  if (typeof tweakId !== 'string') {
    return { error: true, message: 'Invalid tweakId' };
  }
  return await tweakExecutor.checkTweakStatus(tweakId);
});

ipcMain.handle('tweak:syncAll', async () => {
  // Check ALL known real tweaks (not just previously-applied ones)
  const allTweakIds = Object.keys(tweakExecutor.ALL_TWEAKS);
  const results = {};
  for (const tweakId of allTweakIds) {
    results[tweakId] = await tweakExecutor.checkTweakStatus(tweakId);
  }
  return results;
});

ipcMain.handle('tweak:getLog', () => {
  return tweakExecutor.getExecutionLog();
});

ipcMain.handle('tweak:getLocalState', () => {
  return tweakExecutor.getLocalState();
});

ipcMain.handle('tweak:getInfo', () => {
  return tweakExecutor.getTweakInfo();
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

app.whenReady().then(async () => {
  const bootStart = Date.now();
  console.log('[BOOT] isDev:', isDev, '| isPackaged:', app.isPackaged);
  console.log('[BOOT] process.execPath:', process.execPath);
  console.log('[BOOT] process.resourcesPath:', process.resourcesPath);

  const userDataPath = app.getPath('userData');
  configStore.init(userDataPath);
  console.log('[BOOT] Config store initialized:', userDataPath);

  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
  console.log('[DeepLink] protocol registered:', app.isDefaultProtocolClient('switchcontrol'));

  // Register backend IPC handlers BEFORE starting the backend
  // so the renderer can poll immediately while backend boots
  ipcMain.handle('app:getBackendPort', () => {
    const port = backendLauncher.getBackendPort();
    return port;
  });

  ipcMain.handle('app:isBackendReady', () => {
    return backendLauncher.isBackendReady();
  });

  ipcMain.handle('app:getBackendError', () => {
    return backendLauncher.getLastError ? backendLauncher.getLastError() : null;
  });

  // Start creating window immediately (shows on ready-to-show)
  // Backend starts in parallel — renderer polls until ready
  createWindow();

  if (!isDev) {
    console.log('[Backend] ===== PACKAGED MODE — Starting embedded backend =====');
    // Fire-and-forget: don't block the app.whenReady() promise.
    // The window has already been created; the renderer polls getBackendPort()
    // independently. We notify it when ready via the backend-ready IPC event.
    backendLauncher.startBackend(app).then(result => {
      console.log(`[Backend] startBackend() resolved after ${Date.now() - bootStart}ms`);
      console.log(`[Backend] Result: ready=${result.ready} port=${result.port} error=${result.error || 'none'}`);
      if (result.ready) {
        console.log(`[Backend] SUCCESS — port ${result.port} (${Date.now() - bootStart}ms from boot)`);
        if (mainWindow && rendererReady) {
          mainWindow.webContents.send('backend-ready', { port: result.port });
        }
        // If renderer finished loading before backend was ready, it missed the push.
        // did-finish-load handler already covers this race, but send again to be safe.
      } else {
        console.error('[Backend] FAILED:', result.error || 'unknown');
        if (mainWindow && rendererReady) {
          mainWindow.webContents.send('backend-error', { error: result.error || 'Backend failed to start' });
        }
      }
    }).catch(err => {
      console.error('[Backend] Uncaught startup error:', err.message);
    });
  } else {
    console.log('[Backend] Dev mode — using dev server proxy');
  }

  // Register DevTools IPC handler (always available for debugging)
  ipcMain.handle('app:openDevTools', (event) => {
    console.log('[DevTools] IPC handler called - opening DevTools');
    if (mainWindow) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    return { success: true };
  });

  // DEBUG ISSUE 1: Log all cookies on app ready
  const { session } = require('electron');
  const ses = session.defaultSession;

  ses.cookies.get({}).then(cookies => {
    console.log('[DEBUG] COOKIES ON START — total count:', cookies.length);
    cookies.forEach(c => {
      console.log('[DEBUG] COOKIE:', JSON.stringify({
        name: c.name,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        session: c.session,
        expirationDate: c.expirationDate,
        sameSite: c.sameSite
      }));
    });
  }).catch(err => console.error('[DEBUG] COOKIE READ ERROR:', err));

  // Persist session cookies across restarts by extending their lifetime
  ses.cookies.on('changed', (event, cookie, cause, removed) => {
    // DEBUG ISSUE 1: Log every cookie change
    console.log('[DEBUG] COOKIE CHANGED:', JSON.stringify({
      name: cookie.name,
      domain: cookie.domain,
      session: cookie.session,
      cause: cause,
      removed: removed,
      expirationDate: cookie.expirationDate
    }));

    const shouldPersist = cookie.domain && (
      cookie.domain.includes('switchcontrol.org') ||
      cookie.domain.includes('127.0.0.1')
    );
    if (!removed && cookie.session && shouldPersist) {
      console.log('[Auth] Persisting session cookie:', cookie.name, 'domain:', cookie.domain);
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
        .then(() => console.log('[Auth] Cookie persisted:', cookie.name))
        .catch(err => console.error('[Auth] Cookie persist failed:', cookie.name, err));
    }
  });
});

app.on('window-all-closed', () => {
  backendLauncher.stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  backendLauncher.stopBackend();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
