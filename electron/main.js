const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const si = require('systeminformation');
const tweakExecutor = require('./tweak-executor');

app.setName('SwitchControl');
const isDev = !app.isPackaged;
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
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
}

// Helper: deliver deep link to renderer
function deliverDeepLink(url) {
  console.log('[DeepLink] deliverDeepLink called with:', url);
  
  if (!mainWindow) {
    console.log('[DeepLink] No main window, queueing:', url);
    pendingDeepLinkUrl = url;
    return;
  }
  
  // Ensure window is visible and focused
  if (mainWindow.isMinimized()) {
    console.log('[DeepLink] Restoring minimized window');
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  console.log('[DeepLink] focusing window');
  
  if (!rendererReady) {
    console.log('[DeepLink] Renderer not ready, queueing:', url);
    pendingDeepLinkUrl = url;
    return;
  }
  
  console.log('[DeepLink] delivered to renderer:', url);
  mainWindow.webContents.send('auth-callback', url);
}

// Single instance lock for Windows deep-link handling
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    console.log('[TEMP-LOG] second-instance event - commandLine:', commandLine);
    
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url) {
      console.log('[TEMP-LOG] protocol URL received - FULL URL:', url);
      deliverDeepLink(url);
    } else if (mainWindow) {
      // Just focus the window even without deep link
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('[TEMP-LOG] open-url event received - FULL URL:', url);
  deliverDeepLink(url);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'SwitchControl',
    width: 1280,
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

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
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
    const parsedUrl = new URL(url);
    // Allow localhost and file:// protocols (normal app navigation)
    if (parsedUrl.protocol === 'file:' || parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
      return; // Allow internal navigation
    }
    // Block external navigation, open in browser
    console.log('[Navigation] Blocking external navigation, opening in browser:', url);
    event.preventDefault();
    shell.openExternal(url);
  });
  
  // Block new window creation - open in browser instead
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Navigation] Blocking new window, opening in browser:', url);
    shell.openExternal(url);
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
    
    // Deliver any pending deep link
    if (pendingDeepLinkUrl) {
      console.log('[DeepLink] Delivering queued deep link:', pendingDeepLinkUrl);
      mainWindow.webContents.send('auth-callback', pendingDeepLinkUrl);
      pendingDeepLinkUrl = null;
    }
  });
  
  // Send focus events to renderer for UI cleanup
  mainWindow.on('focus', () => {
    console.log('[TEMP-LOG] window focus event fired');
    if (rendererReady && mainWindow) {
      mainWindow.webContents.send('window-focus');
    }
  });

  mainWindow.once('ready-to-show', () => {
    console.log('[TEMP-LOG] window ready-to-show, calling show()');
    mainWindow.show();
  });
  mainWindow.on('closed', () => { 
    mainWindow = null; 
    rendererReady = false;
  });
}

// Helper: safe number conversion
function safeNum(value, decimals = 1) {
  const num = Number(value);
  return Number.isFinite(num) ? parseFloat(num.toFixed(decimals)) : 0;
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
    fans: []
  };
  
  function traverse(node) {
    if (!node) return;
    
    const name = (node.Text || '').toLowerCase();
    const value = parseFloat(node.Value);
    const type = (node.Type || '').toLowerCase();
    
    // CPU Temperature
    if (type === 'temperature' && name.includes('cpu') && name.includes('package')) {
      if (Number.isFinite(value)) result.cpuTemp = safeNum(value);
    }
    
    // GPU Temperature
    if (type === 'temperature' && name.includes('gpu') && name.includes('core')) {
      if (Number.isFinite(value)) result.gpuTemp = safeNum(value);
    }
    
    // GPU Load
    if (type === 'load' && name.includes('gpu') && name.includes('core')) {
      if (Number.isFinite(value)) result.gpuLoad = safeNum(value);
    }
    
    // Motherboard Temperature
    if (type === 'temperature' && (name.includes('system') || name.includes('motherboard'))) {
      if (Number.isFinite(value) && result.moboTemp === null) {
        result.moboTemp = safeNum(value);
      }
    }
    
    // Recurse into children
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
  console.log('[DEBUG] IPC open-external received, url:', url);
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
    console.log('[DEBUG] IPC CONTACT SUPPORT / EXTERNAL — opening:', url);
    shell.openExternal(url)
      .then(() => console.log('[DEBUG] MAILTO/URL OPENED OK'))
      .catch(err => console.error('[DEBUG] MAILTO/URL ERROR:', err));
  } else {
    console.log('[DEBUG] IPC open-external REJECTED — unsupported protocol:', url);
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

// System specs with REAL data from systeminformation
// Uses cache - only fetches once per app boot
ipcMain.handle('system:getSpecs', async () => {
  // Return cached specs if available and not expired
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
      system: { os: 'Unknown', osVersion: '', arch: '', hostname: '', hasLibreHardwareMonitor: false },
      disk: { name: 'Unknown', usedGB: 0, totalGB: 0, usePercent: 0 },
      disks: []
    };
  }
});

// RAM usage (real-time)
ipcMain.handle('system:getRamUsage', () => {
  try {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const totalGB = total / 1024 / 1024 / 1024;
    const usedGB = used / 1024 / 1024 / 1024;
    const freeGB = free / 1024 / 1024 / 1024;
    const usagePercent = (used / total) * 100;
    
    return {
      totalGB: safeNum(totalGB),
      usedGB: safeNum(usedGB),
      freeGB: safeNum(freeGB),
      usagePercent: safeNum(usagePercent),
      ramTotalGb: safeNum(totalGB),
      ramUsedGb: safeNum(usedGB)
    };
  } catch (e) {
    return { totalGB: 0, usedGB: 0, freeGB: 0, usagePercent: 0, ramTotalGb: 0, ramUsedGb: 0 };
  }
});

// All disks (real data)
ipcMain.handle('system:getAllDisks', async () => {
  try {
    const fsData = await si.fsSize();
    return (fsData || []).map(d => {
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
  } catch (e) {
    console.error('[SwitchControl] getAllDisks error:', e);
    return [];
  }
});

// Telemetry - 3-tier merge: systeminformation baseline → nvidia-smi → LHM overlay
// null means unavailable, never undefined
ipcMain.handle('telemetry:getLive', async () => {
  try {
    // === TIER 3: systeminformation baseline (always on) ===
    const load = await si.currentLoad();
    const cpuUsage = safeNum(load.currentLoad || 0);
    
    if (Math.abs(cpuUsage - lastCpuLoad) > 1) {
      lastCpuLoad = cpuUsage;
    }

    const total = os.totalmem();
    const free = os.freemem();
    const ramUsage = safeNum(((total - free) / total) * 100);

    let cpuTemp = null;
    try {
      const temps = await si.cpuTemperature();
      const temp = safeNum(temps.main || 0);
      cpuTemp = Number.isFinite(temp) && temp > 0 ? temp : null;
    } catch (e) {
      // CPU temp not available
    }

    // === TIER 2: nvidia-smi overlay (NVIDIA only) ===
    let gpuTemp = null;
    let gpuLoad = null;
    if (cachedSpecs?.gpu?.isNvidia) {
      try {
        const [nvTemp, nvLoad] = await Promise.all([
          getNvidiaGpuTemp(),
          getNvidiaGpuLoad()
        ]);
        gpuTemp = nvTemp;
        gpuLoad = nvLoad;
      } catch (e) {
        // nvidia-smi not available
      }
    }

    // === TIER 1: LibreHardwareMonitor overlay (if available) ===
    let moboTemp = null;
    const lhm = await getLhmTelemetry();
    if (lhm) {
      // LHM values take precedence when available
      if (lhm.cpuTemp !== null) cpuTemp = lhm.cpuTemp;
      if (lhm.gpuTemp !== null) gpuTemp = lhm.gpuTemp;
      if (lhm.gpuLoad !== null) gpuLoad = lhm.gpuLoad;
      if (lhm.moboTemp !== null) moboTemp = lhm.moboTemp;
    }

    // === DISK USAGE (always-on via systeminformation) ===
    let diskPercent = null;
    try {
      const fsData = await si.fsSize();
      if (fsData && fsData.length > 0) {
        // Use primary/system disk (usually C: on Windows or / on Linux)
        const primaryDisk = fsData.find(d => d.mount === 'C:' || d.mount === '/') || fsData[0];
        diskPercent = safeNum(primaryDisk.use || 0);
      }
    } catch (e) {
      // Disk info not available
    }

    // === NETWORK (always-on via systeminformation) ===
    let netRxSec = null;
    let netTxSec = null;
    try {
      const netStats = await si.networkStats();
      if (netStats && netStats.length > 0) {
        // Sum all interfaces for total throughput
        let totalRx = 0;
        let totalTx = 0;
        netStats.forEach(iface => {
          totalRx += iface.rx_sec || 0;
          totalTx += iface.tx_sec || 0;
        });
        // Convert to KB/s
        netRxSec = safeNum(totalRx / 1024, 1);
        netTxSec = safeNum(totalTx / 1024, 1);
      }
    } catch (e) {
      // Network stats not available
    }

    // === BUILD DISPLAY-READY VALUES ===
    // CPU: prefer temp, fallback to usage
    const cpuDisplay = cpuTemp !== null ? cpuTemp : lastCpuLoad;
    const cpuLabel = cpuTemp !== null ? 'CPU Temp (°C)' : 'CPU Load (%)';
    
    // GPU: prefer temp, fallback to load, then null
    const gpuDisplay = gpuTemp !== null ? gpuTemp : gpuLoad;
    const gpuLabel = gpuTemp !== null ? 'GPU Temp (°C)' : (gpuLoad !== null ? 'GPU Load (%)' : null);
    const showGpu = gpuDisplay !== null;
    
    // Mobo: only show if available
    const showMobo = moboTemp !== null;

    return {
      // Raw values
      cpuUsage: lastCpuLoad,
      ramUsage: ramUsage,
      cpuTemp: cpuTemp,
      gpuTemp: gpuTemp,
      gpuLoad: gpuLoad,
      moboTemp: moboTemp,
      diskPercent: diskPercent,
      netRxSec: netRxSec,
      netTxSec: netTxSec,
      // Display-ready values
      cpuDisplay,
      cpuLabel,
      gpuDisplay,
      gpuLabel,
      showGpu,
      showMobo,
      timestamp: Date.now()
    };
  } catch (e) {
    console.error('[SwitchControl] telemetry error:', e);
    return {
      cpuUsage: 0,
      ramUsage: 0,
      cpuTemp: null,
      gpuTemp: null,
      gpuLoad: null,
      moboTemp: null,
      diskPercent: null,
      netRxSec: null,
      netTxSec: null,
      cpuDisplay: 0,
      cpuLabel: 'CPU Load (%)',
      gpuDisplay: null,
      gpuLabel: null,
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

// Tweak handlers
ipcMain.handle('tweak:execute', async (event, tweakId, action) => {
  console.log(`[SwitchControl] Executing tweak: ${tweakId}, action: ${action}`);
  return await tweakExecutor.executeTweak(tweakId, action);
});

ipcMain.handle('tweak:checkStatus', async (event, tweakId) => {
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
  console.log('[DEBUG] AUTH CLEAR COOKIES CALLED');
  console.log('[TEMP-LOG] auth:clearCookies IPC called');
  try {
    const { session } = require('electron');
    const ses = session.defaultSession;
    
    // Clear cookies for the auth domain
    const cookies = await ses.cookies.get({ domain: 'switchcontrol.org' });
    console.log('[Auth] Found', cookies.length, 'cookies to clear');
    
    for (const cookie of cookies) {
      const url = `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
      await ses.cookies.remove(url, cookie.name);
    }
    
    // Also clear any cookies with .switchcontrol.org domain
    const dotCookies = await ses.cookies.get({ domain: '.switchcontrol.org' });
    for (const cookie of dotCookies) {
      const url = `https://switchcontrol.org${cookie.path}`;
      await ses.cookies.remove(url, cookie.name);
    }
    
    console.log('[Auth] Cookies cleared successfully');
    return { success: true };
  } catch (err) {
    console.error('[Auth] Failed to clear cookies:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:debugCookies', async () => {
  const { session } = require('electron');
  const cookies = await session.defaultSession.cookies.get({
    domain: 'switchcontrol.org'
  });

  console.log('[Auth][MAIN] cookies found:', cookies.length);

  return cookies.map(c => ({
    name: c.name,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
    expirationDate: c.expirationDate
  }));
});

app.whenReady().then(() => {
  console.log('[DEBUG] ========== APP START ==========');
  console.log('[TEMP-LOG] app.whenReady() fired, setting protocol and creating window');
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
  const isDefault = app.isDefaultProtocolClient('switchcontrol');
  console.log('[DeepLink][MAIN] protocol registered:', isDefault);

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

    if (!removed && cookie.session && cookie.domain && cookie.domain.includes('switchcontrol.org')) {
      console.log('[DEBUG] PERSISTING session cookie:', cookie.name, 'domain:', cookie.domain);
      // Session cookies (no expiry) don't survive restart — persist them for 30 days
      const persistedCookie = {
        url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`,
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
        .then(() => console.log('[DEBUG] COOKIE PERSISTED OK:', cookie.name))
        .catch(err => console.error('[DEBUG] COOKIE PERSIST FAIL:', cookie.name, err));
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
