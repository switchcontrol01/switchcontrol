const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');

const isDev = !app.isPackaged;
let mainWindow = null;

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

  // Always enable DevTools for debugging
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

ipcMain.handle('system:getSpecs', () => {
  const cpuInfo = os.cpus();
  return {
    cpu: {
      model: cpuInfo[0]?.model || 'Unknown',
      cores: cpuInfo.length,
      speed: cpuInfo[0]?.speed || 0
    },
    ram: {
      totalGB: parseFloat((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
      freeGB: parseFloat((os.freemem() / 1024 / 1024 / 1024).toFixed(1)),
      usedGB: parseFloat(((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(1))
    },
    system: {
      platform: process.platform,
      arch: os.arch(),
      hostname: os.hostname()
    }
  };
});

ipcMain.handle('system:getRamUsage', () => {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    totalGB: parseFloat((total / 1024 / 1024 / 1024).toFixed(1)),
    usedGB: parseFloat((used / 1024 / 1024 / 1024).toFixed(1)),
    freeGB: parseFloat((free / 1024 / 1024 / 1024).toFixed(1)),
    usagePercent: parseFloat(((used / total) * 100).toFixed(1))
  };
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

// Tweak handlers (placeholder - tweaks work in UI only for now)
ipcMain.handle('tweak:execute', () => ({ success: true, message: 'Simulated' }));
ipcMain.handle('tweak:checkStatus', () => ({ applied: false }));
ipcMain.handle('tweak:syncAll', () => ({}));
ipcMain.handle('tweak:getLocalState', () => ({ appliedTweaks: {}, lastSync: null }));
ipcMain.handle('tweak:getInfo', () => ({}));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
