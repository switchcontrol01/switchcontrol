const { app, BrowserWindow, ipcMain, shell, protocol, globalShortcut } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Security: Block dangerous shortcuts in production
function registerProductionShortcuts() {
  if (isDev) return;

  // Block DevTools shortcuts
  globalShortcut.register('CommandOrControl+Shift+I', () => {});
  globalShortcut.register('F12', () => {});
  
  // Block zoom shortcuts
  globalShortcut.register('CommandOrControl+Plus', () => {});
  globalShortcut.register('CommandOrControl+=', () => {});
  globalShortcut.register('CommandOrControl+-', () => {});
  globalShortcut.register('CommandOrControl+0', () => {});
  globalShortcut.register('CommandOrControl+numadd', () => {});
  globalShortcut.register('CommandOrControl+numsub', () => {});
  
  // Block refresh shortcuts
  globalShortcut.register('CommandOrControl+R', () => {});
  globalShortcut.register('F5', () => {});
  globalShortcut.register('CommandOrControl+Shift+R', () => {});
}

let mainWindow = null;

const PROTOCOL_NAME = 'switchcontrol';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#0f0f14',
    show: false,
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
    },
    icon: path.join(__dirname, '../build/icon.ico'),
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/public/index.html'));
  }
}

function setupDeepLinking() {
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
    return false;
  }

  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url) {
      handleDeepLink(url);
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  return true;
}

function handleDeepLink(url) {
  if (!mainWindow) return;

  try {
    const parsedUrl = new URL(url);
    
    if (parsedUrl.protocol === `${PROTOCOL_NAME}:`) {
      const pathname = parsedUrl.pathname.replace(/^\/\//, '/');
      
      if (pathname.startsWith('/auth/callback')) {
        const code = parsedUrl.searchParams.get('code');
        const state = parsedUrl.searchParams.get('state');
        const provider = parsedUrl.searchParams.get('provider') || 'google';
        
        if (code) {
          mainWindow.webContents.send('auth-callback', { code, state, provider });
          
          if (isDev) {
            mainWindow.loadURL(`http://localhost:5000/auth/callback?code=${code}&state=${state}&provider=${provider}`);
          } else {
            mainWindow.loadURL(`file://${path.join(__dirname, '../dist/public/index.html')}#/auth/callback?code=${code}&state=${state}&provider=${provider}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to parse deep link:', error);
  }
}

function setupIPC() {
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getPlatform', () => {
    return process.platform;
  });

  ipcMain.handle('app:isPackaged', () => {
    return app.isPackaged;
  });

  ipcMain.handle('system:getInfo', async () => {
    const os = require('os');
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
    };
  });

  ipcMain.handle('system:openExternal', async (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  // Security IPC handlers - Windows Defender integration
  ipcMain.handle('security:getStatus', async () => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec('powershell -Command "Get-MpComputerStatus | ConvertTo-Json"', (error, stdout) => {
        if (error) {
          resolve({ success: false, error: error.message });
          return;
        }
        try {
          const data = JSON.parse(stdout);
          resolve({
            success: true,
            data: {
              realTimeProtection: data.RealTimeProtectionEnabled,
              tamperProtection: data.IsTamperProtected,
              lastScanTime: data.QuickScanEndTime || 'Never',
              engineVersion: data.AMEngineVersion,
              signatureVersion: data.AntivirusSignatureVersion,
              lastUpdated: data.AntivirusSignatureLastUpdated
            }
          });
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse Defender status' });
        }
      });
    });
  });

  ipcMain.handle('security:startQuickScan', async () => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec('powershell -Command "Start-MpScan -ScanType QuickScan"', (error) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  });

  ipcMain.handle('security:startFullScan', async () => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec('powershell -Command "Start-MpScan -ScanType FullScan"', (error) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  });

  ipcMain.handle('security:getThreats', async () => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec('powershell -Command "Get-MpThreat | ConvertTo-Json"', (error, stdout) => {
        if (error) {
          resolve({ success: true, data: [] });
          return;
        }
        try {
          const threats = stdout.trim() ? JSON.parse(stdout) : [];
          const threatArray = Array.isArray(threats) ? threats : [threats];
          const mapped = threatArray.map((t) => ({
            id: String(t.ThreatID),
            name: t.ThreatName || 'Unknown Threat',
            severity: t.SeverityID >= 5 ? 'Severe' : t.SeverityID >= 4 ? 'High' : t.SeverityID >= 3 ? 'Medium' : 'Low',
            category: t.CategoryID || 'Unknown',
            status: t.ThreatStatusID === 0 ? 'Active' : 'Resolved',
            filePath: t.Resources?.[0] || undefined
          }));
          resolve({ success: true, data: mapped });
        } catch (e) {
          resolve({ success: true, data: [] });
        }
      });
    });
  });

  ipcMain.handle('security:quarantineThreat', async (event, threatId) => {
    const { execFile } = require('child_process');
    const sanitizedId = String(threatId).replace(/[^0-9]/g, '');
    if (!sanitizedId) {
      return { success: false, error: 'Invalid threat ID' };
    }
    return new Promise((resolve) => {
      execFile('powershell', ['-Command', `Remove-MpThreat -ThreatID ${sanitizedId}`], (error) => {
        resolve({ success: !error, error: error?.message });
      });
    });
  });

  ipcMain.handle('security:removeThreat', async (event, threatId) => {
    const { execFile } = require('child_process');
    const sanitizedId = String(threatId).replace(/[^0-9]/g, '');
    if (!sanitizedId) {
      return { success: false, error: 'Invalid threat ID' };
    }
    return new Promise((resolve) => {
      execFile('powershell', ['-Command', `Remove-MpThreat -ThreatID ${sanitizedId} -Force`], (error) => {
        resolve({ success: !error, error: error?.message });
      });
    });
  });

  ipcMain.handle('security:allowThreat', async (event, threatId, filePath) => {
    const { execFile } = require('child_process');
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'File path required for exclusion' };
    }
    const sanitizedPath = filePath.replace(/[`$"]/g, '');
    return new Promise((resolve) => {
      execFile('powershell', ['-Command', `Add-MpPreference -ExclusionPath "${sanitizedPath}"`], (error) => {
        resolve({ success: !error, error: error?.message });
      });
    });
  });

  ipcMain.handle('security:emergencyCleanup', async () => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec('powershell -Command "Start-MpScan -ScanType QuickScan"', (error) => {
        resolve({ success: !error, error: error?.message });
      });
    });
  });
}

app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

if (!setupDeepLinking()) {
  process.exit(0);
}

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

// Unregister shortcuts on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (event, contents) => {
  // Security: Block all external navigation - only allow app URLs
  contents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      
      // Only allow file:// (production) and localhost:5000 (dev)
      const isAppUrl = 
        navigationUrl.startsWith('file://') ||
        (parsedUrl.hostname === 'localhost' && parsedUrl.port === '5000');
      
      if (!isAppUrl) {
        event.preventDefault();
        // Open external URLs in system browser (including OAuth)
        if (navigationUrl.startsWith('http://') || navigationUrl.startsWith('https://')) {
          shell.openExternal(navigationUrl);
        }
      }
    } catch (e) {
      event.preventDefault();
    }
  });

  // Security: Block window.open popups entirely
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});
