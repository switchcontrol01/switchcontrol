const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

let si;
let enhancedCache = null;
let enhancedCacheTime = 0;
const ENHANCED_CACHE_MS = 500;
let enhancedCrashCount = 0;
let enhancedDisabled = false;
const MAX_CRASH_COUNT = 2;
try {
  si = require('systeminformation');
} catch (e) {
  console.warn('[SwitchControl] systeminformation not installed. Run: npm install systeminformation');
  si = null;
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let mainWindow = null;

const PROTOCOL_NAME = 'switchcontrol';
const AUTH_DOMAIN = 'https://switchcontrol.org';

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
    console.log('[SwitchControl] second-instance event, argv:', commandLine);
    
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url) {
      console.log('[SwitchControl] Deep link received:', url);
      handleDeepLink(url);
    }
  });
}

function handleDeepLink(url) {
  console.log('[SwitchControl] Handling deep link:', url);
  
  if (!mainWindow) {
    console.error('[SwitchControl] No main window available for deep link');
    return;
  }
  
  try {
    mainWindow.webContents.send('auth-callback', url);
    console.log('[SwitchControl] Sent auth-callback to renderer with URL:', url);
  } catch (err) {
    console.error('[SwitchControl] Failed to send deep link to renderer:', err);
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
    const filePath = path.join(app.getAppPath(), 'dist', 'index.html');
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
    disk: { name: 'Unavailable', usedGB: 0, totalGB: 0 },
    disks: []
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
          const allDisks = fsSize
            .filter(fs => fs.size > 0 && (fs.mount.match(/^[A-Z]:$/) || fs.mount === '/' || fs.mount.startsWith('/mnt')))
            .map(fs => ({
              mount: fs.mount,
              name: fs.fs || fs.mount,
              usedGB: fs.used ? parseFloat((fs.used / 1024 / 1024 / 1024).toFixed(0)) : 0,
              totalGB: fs.size ? parseFloat((fs.size / 1024 / 1024 / 1024).toFixed(0)) : 0,
              usedPercent: fs.use ? parseFloat(fs.use.toFixed(1)) : 0
            }));
          
          specs.disks = allDisks;
          
          const mainFs = fsSize.find(fs => fs.mount === 'C:' || fs.mount === '/') || fsSize[0];
          if (mainFs) {
            specs.disk.name = mainFs.mount || 'C:';
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

async function getAllDisks() {
  if (!si) return [];
  
  try {
    const fsSize = await si.fsSize().catch(() => []);
    return fsSize
      .filter(fs => fs.size > 0 && (fs.mount.match(/^[A-Z]:$/) || fs.mount === '/' || fs.mount.startsWith('/mnt')))
      .map(fs => ({
        mount: fs.mount,
        name: fs.fs || fs.mount,
        usedGB: fs.used ? parseFloat((fs.used / 1024 / 1024 / 1024).toFixed(0)) : 0,
        totalGB: fs.size ? parseFloat((fs.size / 1024 / 1024 / 1024).toFixed(0)) : 0,
        usedPercent: fs.use ? parseFloat(fs.use.toFixed(1)) : 0
      }));
  } catch (error) {
    console.error('[SwitchControl] Error getting disks:', error.message);
    return [];
  }
}

async function getLiveTelemetry() {
  const telemetry = {
    cpuLoadPercent: 0,
    cpuTempC: null,
    gpuTempC: null,
    gpuLoadPercent: null,
    moboTempC: null,
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
        const [cpuLoad, cpuTemp, graphics, baseboard] = await Promise.all([
          si.currentLoad().catch(() => null),
          si.cpuTemperature().catch(() => null),
          si.graphics().catch(() => null),
          si.baseboard().catch(() => null)
        ]);

        if (cpuLoad) {
          telemetry.cpuLoadPercent = parseFloat(cpuLoad.currentLoad?.toFixed(1) || '0');
        }

        if (cpuTemp && cpuTemp.main !== null && cpuTemp.main !== -1) {
          telemetry.cpuTempC = parseFloat(cpuTemp.main.toFixed(0));
        }
        
        if (cpuTemp && cpuTemp.chipset !== null && cpuTemp.chipset !== -1) {
          telemetry.moboTempC = parseFloat(cpuTemp.chipset.toFixed(0));
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
  
  ipcMain.handle('system:getAllDisks', async () => await getAllDisks());

  ipcMain.handle('system:getRamUsage', async () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return {
      ramTotalGb: parseFloat((totalMem / 1024 / 1024 / 1024).toFixed(1)),
      ramUsedGb: parseFloat(((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(1))
    };
  });

  ipcMain.handle('telemetry:getLive', async () => await getLiveTelemetry());

  ipcMain.handle('telemetry:getEnhanced', async () => {
    if (enhancedDisabled) {
      return { enhancedAvailable: false, error: 'Disabled due to repeated crashes' };
    }

    const now = Date.now();
    if (enhancedCache && (now - enhancedCacheTime) < ENHANCED_CACHE_MS) {
      return enhancedCache;
    }

    const helperPath = app.isPackaged
      ? path.join(process.resourcesPath, 'bin', 'SensorsHelper.exe')
      : path.join(__dirname, 'bin', 'SensorsHelper.exe');

    return new Promise((resolve) => {
      const fs = require('fs');
      if (!fs.existsSync(helperPath)) {
        console.warn('[telemetry] SensorsHelper.exe not found at:', helperPath);
        enhancedDisabled = true;
        resolve({ enhancedAvailable: false, error: 'Helper not found' });
        return;
      }

      let stdout = '';
      let stderr = '';
      let resolved = false;

      const proc = spawn(helperPath, [], { windowsHide: true });

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill();
          enhancedCrashCount++;
          if (enhancedCrashCount >= MAX_CRASH_COUNT) {
            console.warn('[telemetry] enhanced sensors disabled after repeated timeouts');
            enhancedDisabled = true;
          }
          resolve({ enhancedAvailable: false, error: 'Timeout' });
        }
      }, 1500);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (resolved) return;
        resolved = true;

        if (code !== 0 || !stdout.trim()) {
          enhancedCrashCount++;
          if (enhancedCrashCount >= MAX_CRASH_COUNT) {
            console.warn('[telemetry] enhanced sensors disabled after repeated failures');
            enhancedDisabled = true;
          }
          resolve({ enhancedAvailable: false, error: stderr || 'Helper failed' });
          return;
        }

        enhancedCrashCount = 0;

        try {
          const data = JSON.parse(stdout.trim());
          enhancedCache = { enhancedAvailable: true, ...data };
          enhancedCacheTime = now;
          resolve(enhancedCache);
        } catch (e) {
          resolve({ enhancedAvailable: false, error: 'Parse error' });
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        if (resolved) return;
        resolved = true;
        enhancedCrashCount++;
        if (enhancedCrashCount >= MAX_CRASH_COUNT) {
          console.warn('[telemetry] enhanced sensors disabled after spawn errors');
          enhancedDisabled = true;
        }
        resolve({ enhancedAvailable: false, error: err.message });
      });
    });
  });

  ipcMain.handle('open-external', async (event, url) => {
    console.log('[SwitchControl] Opening external URL:', url);
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
  console.log('[SwitchControl] macOS open-url event:', url);
  handleDeepLink(url);
});

app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

app.whenReady().then(() => {
  setupIPC();
  createWindow();
  registerProductionShortcuts();

  const launchUrl = process.argv.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
  if (launchUrl) {
    console.log('[SwitchControl] Launched with deep link:', launchUrl);
    setTimeout(() => handleDeepLink(launchUrl), 500);
  }

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
