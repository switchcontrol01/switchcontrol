const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const os = require('os');

let si;
try {
  si = require('systeminformation');
} catch (e) {
  console.warn('[SwitchControl] systeminformation not installed. Run: npm install systeminformation');
  si = null;
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let mainWindow = null;

const PROTOCOL_NAME = 'switchcontrol';

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url) {
      handleAuthCallback(url);
    }
  });
}

function handleAuthCallback(url) {
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get('token');
    const userJson = parsed.searchParams.get('user');
    
    if (token && userJson && mainWindow) {
      const user = JSON.parse(decodeURIComponent(userJson));
      mainWindow.webContents.send('auth-callback', { token, user });
    }
  } catch (err) {
    console.error('[SwitchControl] Failed to parse auth callback:', err);
  }
}

function registerProductionShortcuts() {
  if (isDev) return;

  const disabled = [
    'CommandOrControl+Shift+I',
    'F12',
    'CommandOrControl+R',
    'F5',
    'CommandOrControl+Shift+R',
    'CommandOrControl+Plus',
    'CommandOrControl+=',
    'CommandOrControl+-',
    'CommandOrControl+0'
  ];

  disabled.forEach(key => {
    globalShortcut.register(key, () => {});
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#0a0a0f',
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const filePath = path.join(__dirname, '..', 'dist', 'public', 'index.html');
    console.log('Loading:', filePath);
    mainWindow.loadFile(filePath).catch(err => {
      console.error('Failed to load:', err);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function getSystemSpecs() {
  const specs = {
    cpu: { model: 'Unavailable', cores: 0, threads: 0, speed: 'Unavailable' },
    ram: { totalGB: 0, usedGB: 0, freeGB: 0 },
    gpu: { model: 'Unavailable', vendor: 'Unavailable', vramGB: 0 },
    system: { os: 'Unavailable', osVersion: 'Unavailable', arch: os.arch(), hostname: os.hostname() },
    disk: { name: 'Unavailable', usedGB: 0, totalGB: 0 }
  };

  try {
    const cpuInfo = os.cpus();
    if (cpuInfo && cpuInfo.length > 0) {
      specs.cpu.model = cpuInfo[0].model || 'Unavailable';
      specs.cpu.threads = cpuInfo.length;
    }

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    specs.ram.totalGB = parseFloat((totalMem / 1024 / 1024 / 1024).toFixed(1));
    specs.ram.freeGB = parseFloat((freeMem / 1024 / 1024 / 1024).toFixed(1));
    specs.ram.usedGB = parseFloat(((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(1));

    if (si) {
      try {
        const [cpu, graphics, osInfo, diskLayout, fsSize] = await Promise.all([
          si.cpu().catch(() => null),
          si.graphics().catch(() => null),
          si.osInfo().catch(() => null),
          si.diskLayout().catch(() => null),
          si.fsSize().catch(() => null)
        ]);

        if (cpu) {
          specs.cpu.model = cpu.brand || cpu.manufacturer || specs.cpu.model;
          specs.cpu.cores = cpu.physicalCores || cpu.cores || 0;
          specs.cpu.threads = cpu.cores || specs.cpu.threads;
          specs.cpu.speed = cpu.speed ? `${cpu.speed} GHz` : 'Unavailable';
        }

        if (graphics?.controllers?.length > 0) {
          const gpu = graphics.controllers[0];
          specs.gpu.model = gpu.model || 'Unavailable';
          specs.gpu.vendor = gpu.vendor || 'Unavailable';
          specs.gpu.vramGB = gpu.vram ? parseFloat((gpu.vram / 1024).toFixed(1)) : 0;
        }

        if (osInfo) {
          specs.system.os = osInfo.distro || osInfo.platform || 'Unavailable';
          specs.system.osVersion = osInfo.release || 'Unavailable';
          specs.system.arch = osInfo.arch || os.arch();
        }

        if (diskLayout?.length > 0) {
          specs.disk.name = diskLayout[0].name || diskLayout[0].device || 'Primary Disk';
          specs.disk.totalGB = diskLayout[0].size ? parseFloat((diskLayout[0].size / 1024 / 1024 / 1024).toFixed(0)) : 0;
        }

        if (fsSize?.length > 0) {
          const mainFs = fsSize.find(fs => fs.mount === 'C:' || fs.mount === '/') || fsSize[0];
          if (mainFs) {
            specs.disk.usedGB = mainFs.used ? parseFloat((mainFs.used / 1024 / 1024 / 1024).toFixed(0)) : 0;
            specs.disk.totalGB = mainFs.size ? parseFloat((mainFs.size / 1024 / 1024 / 1024).toFixed(0)) : specs.disk.totalGB;
          }
        }
      } catch (siError) {
        console.error('[SwitchControl] systeminformation error:', siError.message);
      }
    }
  } catch (error) {
    console.error('[SwitchControl] Error getting system specs:', error.message);
  }

  return specs;
}

async function getLiveTelemetry() {
  const telemetry = {
    cpuLoadPercent: 0,
    cpuTempC: null,
    gpuTempC: null,
    gpuLoadPercent: null,
    ramUsedGb: 0,
    ramTotalGb: 0
  };

  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    telemetry.ramTotalGb = parseFloat((totalMem / 1024 / 1024 / 1024).toFixed(1));
    telemetry.ramUsedGb = parseFloat(((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(1));

    if (si) {
      try {
        const [cpuLoad, cpuTemp, graphics] = await Promise.all([
          si.currentLoad().catch(() => null),
          si.cpuTemperature().catch(() => null),
          si.graphics().catch(() => null)
        ]);

        if (cpuLoad) {
          telemetry.cpuLoadPercent = parseFloat(cpuLoad.currentLoad?.toFixed(1) || '0');
        }

        if (cpuTemp && cpuTemp.main !== null && cpuTemp.main !== -1) {
          telemetry.cpuTempC = parseFloat(cpuTemp.main.toFixed(0));
        }

        if (graphics?.controllers?.length > 0) {
          const gpu = graphics.controllers[0];
          if (gpu.temperatureGpu !== null && gpu.temperatureGpu !== undefined) {
            telemetry.gpuTempC = parseFloat(gpu.temperatureGpu.toFixed(0));
          }
          if (gpu.utilizationGpu !== null && gpu.utilizationGpu !== undefined) {
            telemetry.gpuLoadPercent = parseFloat(gpu.utilizationGpu.toFixed(1));
          }
        }
      } catch (siError) {
        console.error('[SwitchControl] Telemetry error:', siError.message);
      }
    }
  } catch (error) {
    console.error('[SwitchControl] Error getting telemetry:', error.message);
  }

  return telemetry;
}

function setupIPC() {
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getPlatform', () => process.platform);
  ipcMain.handle('app:isPackaged', () => app.isPackaged);

  ipcMain.handle('system:getInfo', async () => ({
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
  }));

  ipcMain.handle('system:getSpecs', async () => await getSystemSpecs());

  ipcMain.handle('system:getRamUsage', async () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return {
      ramTotalGb: parseFloat((totalMem / 1024 / 1024 / 1024).toFixed(1)),
      ramUsedGb: parseFloat(((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(1))
    };
  });

  ipcMain.handle('telemetry:getLive', async () => await getLiveTelemetry());

  ipcMain.handle('system:openExternal', async (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleAuthCallback(url);
});

app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

app.whenReady().then(() => {
  setupIPC();
  createWindow();
  registerProductionShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
