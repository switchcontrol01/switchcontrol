const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const tweakExecutor = require('./tweak-executor');

const isDev = !app.isPackaged;
const PROTOCOL_NAME = 'switchcontrol';
let mainWindow = null;

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
  // Windows: Handle deep-link when app is already running
  app.on('second-instance', (event, commandLine) => {
    console.log('[SwitchControl] second-instance event:', commandLine);
    
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    
    // Find the deep-link URL in command line args
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url && mainWindow) {
      console.log('[SwitchControl] Deep link received:', url);
      mainWindow.webContents.send('auth-callback', url);
    }
  });
}

// macOS: Handle deep-link
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
      sandbox: true
    }
  });

  // Always enable DevTools for debugging (remove this line once working)
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

// System info
ipcMain.handle('system:getInfo', () => ({
  platform: process.platform,
  arch: os.arch(),
  hostname: os.hostname(),
  cpus: os.cpus().length,
  totalMemory: os.totalmem(),
  freeMemory: os.freemem()
}));

ipcMain.handle('system:getSpecs', async () => {
  try {
    const cpuInfo = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const totalGB = totalMem / 1024 / 1024 / 1024;
    const freeGB = freeMem / 1024 / 1024 / 1024;
    const usedGB = totalGB - freeGB;
    
    return {
      cpu: {
        model: cpuInfo?.[0]?.model || 'Unknown CPU',
        cores: cpuInfo?.length || 0,
        threads: cpuInfo?.length || 0,
        speed: cpuInfo?.[0]?.speed ? `${(cpuInfo[0].speed / 1000).toFixed(1)} GHz` : 'Unknown'
      },
      gpu: {
        model: 'Unknown GPU',
        vendor: 'Unknown',
        vramGB: 0
      },
      ram: {
        totalGB: Number.isFinite(totalGB) ? parseFloat(totalGB.toFixed(1)) : 0,
        usedGB: Number.isFinite(usedGB) ? parseFloat(usedGB.toFixed(1)) : 0,
        freeGB: Number.isFinite(freeGB) ? parseFloat(freeGB.toFixed(1)) : 0
      },
      system: {
        os: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
        osVersion: os.release() || 'Unknown',
        arch: os.arch() || 'Unknown',
        hostname: os.hostname() || 'Unknown'
      },
      disk: {
        name: 'C:',
        usedGB: 0,
        totalGB: 0
      },
      disks: []
    };
  } catch (e) {
    console.error('[SwitchControl] getSpecs error:', e);
    return {
      cpu: { model: 'Unknown CPU', cores: 0, threads: 0, speed: 'Unknown' },
      gpu: { model: 'Unknown GPU', vendor: 'Unknown', vramGB: 0 },
      ram: { totalGB: 0, usedGB: 0, freeGB: 0 },
      system: { os: 'Unknown', osVersion: '', arch: '', hostname: '' },
      disk: { name: 'Unknown', usedGB: 0, totalGB: 0 },
      disks: []
    };
  }
});

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
      totalGB: Number.isFinite(totalGB) ? parseFloat(totalGB.toFixed(1)) : 0,
      usedGB: Number.isFinite(usedGB) ? parseFloat(usedGB.toFixed(1)) : 0,
      freeGB: Number.isFinite(freeGB) ? parseFloat(freeGB.toFixed(1)) : 0,
      usagePercent: Number.isFinite(usagePercent) ? parseFloat(usagePercent.toFixed(1)) : 0,
      ramTotalGb: Number.isFinite(totalGB) ? parseFloat(totalGB.toFixed(1)) : 0,
      ramUsedGb: Number.isFinite(usedGB) ? parseFloat(usedGB.toFixed(1)) : 0
    };
  } catch (e) {
    return { totalGB: 0, usedGB: 0, freeGB: 0, usagePercent: 0, ramTotalGb: 0, ramUsedGb: 0 };
  }
});

ipcMain.handle('system:getAllDisks', () => []);

// Telemetry (basic)
ipcMain.handle('telemetry:getLive', () => ({
  cpuUsage: Math.random() * 30 + 20,
  ramUsage: parseFloat((((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1)),
  gpuTemp: null,
  cpuTemp: null
}));

ipcMain.handle('telemetry:getEnhanced', () => null);

// Tweak handlers - real Windows execution for Tier A tweaks
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
  // Register protocol again after ready for safety
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
