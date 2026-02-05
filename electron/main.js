const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const si = require('systeminformation');
const tweakExecutor = require('./tweak-executor');

const isDev = !app.isPackaged;
const PROTOCOL_NAME = 'switchcontrol';
let mainWindow = null;

// Cache for system specs (called once per app boot)
let cachedSpecs = null;
let lastCpuLoad = 0;

// Register protocol handler BEFORE app is ready
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
}

// Single instance lock for Windows deep-link handling
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    console.log('[SwitchControl] second-instance event:', commandLine);
    
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url && mainWindow) {
      console.log('[SwitchControl] Deep link received:', url);
      mainWindow.webContents.send('auth-callback', url);
    }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('[SwitchControl] open-url event:', url);
  if (mainWindow) {
    mainWindow.webContents.send('auth-callback', url);
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#0b0b0b',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // Required for systeminformation
    }
  });

  mainWindow.webContents.openDevTools({ mode: 'detach' });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5000');
  } else {
    const indexPath = path.join(process.resourcesPath, 'dist', 'index.html');
    console.log('[SwitchControl] Loading:', indexPath);
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('[SwitchControl] Failed to load:', err);
    });
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Helper: safe number conversion
function safeNum(value, decimals = 1) {
  const num = Number(value);
  return Number.isFinite(num) ? parseFloat(num.toFixed(decimals)) : 0;
}

// App info handlers
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);
ipcMain.handle('app:isPackaged', () => app.isPackaged);

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
  if (url.startsWith('http://') || url.startsWith('https://')) {
    shell.openExternal(url);
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
  // Return cached specs if available
  if (cachedSpecs) {
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

    const disks = (fsData || []).map(d => ({
      mount: d.mount || 'Unknown',
      name: d.fs || d.mount || 'Unknown',
      totalGB: safeNum((d.size || 0) / 1024 / 1024 / 1024),
      usedGB: safeNum((d.used || 0) / 1024 / 1024 / 1024),
      usePercent: safeNum(d.use || 0)
    }));

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
        vramGB: gpu?.vram ? safeNum(gpu.vram / 1024) : 0
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
        hostname: os.hostname() || 'Unknown'
      },
      disk: disks[0] || { name: 'C:', usedGB: 0, totalGB: 0, usePercent: 0 },
      disks: disks
    };

    console.log('[SwitchControl] System specs loaded:', cachedSpecs.cpu.model, cachedSpecs.gpu.model);
    return cachedSpecs;

  } catch (e) {
    console.error('[SwitchControl] getSpecs error:', e);
    return {
      cpu: { model: 'Unknown CPU', cores: 0, threads: 0, speed: 'Unknown' },
      gpu: { model: 'Unavailable', vendor: 'Unavailable', vramGB: 0 },
      ram: { totalGB: 0, usedGB: 0, freeGB: 0 },
      system: { os: 'Unknown', osVersion: '', arch: '', hostname: '' },
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
    return (fsData || []).map(d => ({
      mount: d.mount || 'Unknown',
      name: d.fs || d.mount || 'Unknown',
      totalGB: safeNum((d.size || 0) / 1024 / 1024 / 1024),
      usedGB: safeNum((d.used || 0) / 1024 / 1024 / 1024),
      usePercent: safeNum(d.use || 0)
    }));
  } catch (e) {
    console.error('[SwitchControl] getAllDisks error:', e);
    return [];
  }
});

// Telemetry - NEVER returns null, uses 0 fallback
ipcMain.handle('telemetry:getLive', async () => {
  try {
    // Get real CPU load
    const load = await si.currentLoad();
    const cpuUsage = safeNum(load.currentLoad || 0);
    
    // Only update if changed significantly (>1% difference) to reduce re-renders
    if (Math.abs(cpuUsage - lastCpuLoad) > 1) {
      lastCpuLoad = cpuUsage;
    }

    // Get RAM usage
    const total = os.totalmem();
    const free = os.freemem();
    const ramUsage = safeNum(((total - free) / total) * 100);

    // Try to get temps (may not be available on all systems)
    let cpuTemp = 0;
    let gpuTemp = 0;
    try {
      const temps = await si.cpuTemperature();
      cpuTemp = safeNum(temps.main || 0);
    } catch (e) {
      // Temperature not available
    }

    return {
      cpuUsage: lastCpuLoad,
      ramUsage: ramUsage,
      gpuTemp: gpuTemp,
      cpuTemp: cpuTemp,
      timestamp: Date.now()
    };
  } catch (e) {
    console.error('[SwitchControl] telemetry error:', e);
    return {
      cpuUsage: 0,
      ramUsage: 0,
      gpuTemp: 0,
      cpuTemp: 0,
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

    return {
      cpuUsage: safeNum(load.currentLoad || 0),
      cpuCores: (load.cpus || []).map(c => safeNum(c.load || 0)),
      ramUsage: safeNum(((mem.total - mem.available) / mem.total) * 100 || 0),
      cpuTemp: safeNum(temps.main || 0),
      gpuTemp: 0,
      timestamp: Date.now()
    };
  } catch (e) {
    return {
      cpuUsage: 0,
      cpuCores: [],
      ramUsage: 0,
      cpuTemp: 0,
      gpuTemp: 0,
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

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
