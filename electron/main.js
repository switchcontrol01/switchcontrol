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
    backgroundColor: '#0b0b0b',
    frame: false,
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

  const fs = require('fs');
  if (!fs.existsSync(exePath)) {
    console.error('[Memory] Helper not found at:', exePath);
    return { error: true, message: 'Memory helper not found. Feature requires the desktop app.' };
  }

  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    const child = execFile(exePath, ['--mode', mode], { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[Memory] Helper error:', err.message);
        if (stderr) console.error('[Memory] stderr:', stderr);
        resolve({ error: true, message: 'Memory clean failed: ' + (err.killed ? 'timeout' : err.message) });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        console.log(`[Memory] ${mode} mode: scanned=${result.processes_scanned} trimmed=${result.processes_trimmed} freed=${result.estimated_mb_freed}MB`);
        resolve(result);
      } catch (parseErr) {
        console.error('[Memory] Invalid JSON output:', stdout);
        resolve({ error: true, message: 'Memory clean returned invalid data.' });
      }
    });
  });
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

ipcMain.handle('telemetry:getLive', async () => {
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

    let gpuTemp = null;
    let gpuLoad = null;
    let gpuMemUsed = null;
    let gpuMemTotal = null;
    let gpuPower = null;
    let gpuClockMhz = null;

    if (cachedSpecs?.gpu?.isNvidia) {
      try {
        const { execSync } = require('child_process');
        const output = execSync('nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,clocks.current.graphics --format=csv,noheader,nounits', { timeout: 3000, encoding: 'utf8' });
        const parts = output.trim().split(',').map(s => s.trim());
        if (parts.length >= 6) {
          gpuTemp = safeNum(parseFloat(parts[0]), null);
          gpuLoad = safeNum(parseFloat(parts[1]), null);
          gpuMemUsed = safeNum(parseFloat(parts[2]), null);
          gpuMemTotal = safeNum(parseFloat(parts[3]), null);
          gpuPower = safeNum(parseFloat(parts[4]), null);
          gpuClockMhz = safeNum(parseFloat(parts[5]), null);
        }
      } catch (e) {
        try { gpuTemp = await getNvidiaGpuTemp(); } catch (e2) {}
      }
    }

    const primaryDisk = (fsData || []).find(d => d.mount === 'C:' || d.mount === '/') || (fsData || [])[0];
    const diskPercent = primaryDisk ? safeNum(primaryDisk.use, null) : null;
    const diskReadSec = safeNum(diskIO.rIO_sec || 0, 0);
    const diskWriteSec = safeNum(diskIO.wIO_sec || 0, 0);

    let netRxSec = 0;
    let netTxSec = 0;
    for (const iface of (netStats || [])) {
      netRxSec += safeNum(iface.rx_sec || 0, 0);
      netTxSec += safeNum(iface.tx_sec || 0, 0);
    }
    const netRxKBs = Math.round(netRxSec / 1024);
    const netTxKBs = Math.round(netTxSec / 1024);

    return {
      cpuUsage: cpuLoad,
      cpuTemp: cpuTemp > 0 ? cpuTemp : null,
      cpuMaxTemp: cpuMaxTemp > 0 ? cpuMaxTemp : null,
      showCpuTemp: cpuTemp > 0,
      cpuCoreCount: coreLoads.length,
      ramUsage: ramPercent,
      ramTotal: ramTotalGb,
      ramUsedGb,
      ramTotalGb,
      gpuTemp: gpuTemp > 0 ? gpuTemp : null,
      gpuLoad: gpuLoad !== null && gpuLoad >= 0 ? gpuLoad : null,
      gpuMemUsed: gpuMemUsed !== null ? gpuMemUsed : null,
      gpuMemTotal: gpuMemTotal !== null ? gpuMemTotal : null,
      gpuPower: gpuPower !== null && gpuPower > 0 ? gpuPower : null,
      gpuClockMhz: gpuClockMhz !== null && gpuClockMhz > 0 ? gpuClockMhz : null,
      showGpu: !!(gpuTemp || gpuLoad !== null),
      showMobo: false,
      diskPercent,
      diskReadSec,
      diskWriteSec,
      netRxSec: netRxKBs > 0 ? netRxKBs : null,
      netTxSec: netTxKBs > 0 ? netTxKBs : null,
      timestamp: Date.now()
    };
  } catch (e) {
    return { cpuUsage: 0, cpuTemp: null, showCpuTemp: false, ramUsage: 0, ramTotal: 0, gpuTemp: null, gpuLoad: null, showGpu: false, showMobo: false, diskPercent: null, timestamp: Date.now() };
  }
});

ipcMain.handle('system:getRamUsage', async () => {
  try {
    const mem = await si.mem();
    return {
      total: mem.total,
      used: mem.total - mem.available,
      free: mem.available,
      usagePercent: Math.round(((mem.total - mem.available) / mem.total) * 100)
    };
  } catch (e) {
    return { total: 0, used: 0, free: 0, usagePercent: 0 };
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
    const controllers = (graphics.controllers || []).map(g => ({
      model: g.model,
      vendor: g.vendor,
      vram: g.vram,
      bus: g.bus,
      driverVersion: g.driverVersion,
      temperatureGpu: g.temperatureGpu
    }));
    return controllers;
  } catch (e) {
    return [];
  }
});

ipcMain.handle('telemetry:getDisk', async () => {
  try {
    const [disks, io] = await Promise.all([
      si.fsSize().catch(() => []),
      si.disksIO().catch(() => ({ rIO: 0, wIO: 0, tIO: 0 }))
    ]);
    return {
      disks: (disks || []).map(d => ({
        fs: d.fs,
        type: d.type,
        size: d.size,
        used: d.used,
        available: d.available,
        use: d.use,
        mount: d.mount
      })),
      io: { rIO: io.rIO || 0, wIO: io.wIO || 0, tIO: io.tIO || 0 }
    };
  } catch (e) {
    return { disks: [], io: { rIO: 0, wIO: 0, tIO: 0 } };
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
  const state = tweakExecutor.getLocalState();
  const results = {};
  for (const tweakId of Object.keys(state.appliedTweaks)) {
    results[tweakId] = await tweakExecutor.checkTweakStatus(tweakId);
  }
  return results;
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

  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
  console.log('[DeepLink] protocol registered:', app.isDefaultProtocolClient('switchcontrol'));

  if (!isDev) {
    console.log('[Backend] Starting embedded backend...');
    backendLauncher.startBackend(app).then(result => {
      if (result.ready) {
        console.log(`[Backend] Ready on port ${result.port} (${Date.now() - bootStart}ms from boot)`);
      } else {
        console.error('[Backend] FAILED:', result.error || 'unknown');
      }
    });
  }

  // Backend port / readiness IPC — registered once at startup, not inside createWindow
  ipcMain.handle('app:getBackendPort', () => {
    return backendLauncher.getBackendPort();
  });

  ipcMain.handle('app:isBackendReady', () => {
    return backendLauncher.isBackendReady();
  });

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

  createWindow();
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
