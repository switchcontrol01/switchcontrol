const { contextBridge, ipcRenderer } = require('electron');

// SINGLE UNIFIED API - All frontend code must use window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  isPackaged: () => ipcRenderer.invoke('app:isPackaged'),
  getDeviceId: () => ipcRenderer.invoke('app:getDeviceId'),

  // Backend info (for packaged mode API routing)
  getBackendPort: () => ipcRenderer.invoke('app:getBackendPort'),
  isBackendReady: () => ipcRenderer.invoke('app:isBackendReady'),

  // Auth callbacks (deep-link handling)
  auth: {
    onCallback: (callback) => {
      ipcRenderer.on('auth-callback', (event, url) => {
        console.log('[PremiumFlow] deep-link received:', url);
        callback(url);
      });
    },
    removeCallbackListener: () => {
      ipcRenderer.removeAllListeners('auth-callback');
    },
  },

  // Window focus event (for UI cleanup on re-focus)
  onWindowFocus: (callback) => {
    ipcRenderer.on('window-focus', () => {
      console.log('[Window] Focus event received');
      callback();
    });
  },
  removeWindowFocusListener: () => {
    ipcRenderer.removeAllListeners('window-focus');
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  // System data
  system: {
    getInfo: () => ipcRenderer.invoke('system:getInfo'),
    getSpecs: () => ipcRenderer.invoke('system:getSpecs'),
    getRamUsage: () => ipcRenderer.invoke('system:getRamUsage'),
    getAllDisks: () => ipcRenderer.invoke('system:getAllDisks'),
  },

  // Telemetry (live stats)
  telemetry: {
    getLive: () => ipcRenderer.invoke('telemetry:getLive'),
    getEnhanced: () => ipcRenderer.invoke('telemetry:getEnhanced'),
    getCpuCores: () => ipcRenderer.invoke('telemetry:getCpuCores'),
    getMemoryDetails: () => ipcRenderer.invoke('telemetry:getMemoryDetails'),
    getGpu: () => ipcRenderer.invoke('telemetry:getGpu'),
    getDisk: () => ipcRenderer.invoke('telemetry:getDisk'),
    getHardwareTelemetry: () => ipcRenderer.invoke('telemetry:getHardwareTelemetry'),
  },

  // Tweaks
  tweaks: {
    execute: (tweakId, action) => ipcRenderer.invoke('tweak:execute', tweakId, action),
    checkStatus: (tweakId) => ipcRenderer.invoke('tweak:checkStatus', tweakId),
    syncAll: () => ipcRenderer.invoke('tweak:syncAll'),
    getLocalState: () => ipcRenderer.invoke('tweak:getLocalState'),
    getInfo: () => ipcRenderer.invoke('tweak:getInfo'),
  },

  // Memory cleaner
  memory: {
    clean: (mode) => ipcRenderer.invoke('memory:clean', mode),
  },

  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // DevTools (development only)
  openDevTools: () => ipcRenderer.invoke('app:openDevTools'),

  // App data management
  resetAppData: () => ipcRenderer.invoke('app:resetData'),
  openLogs: () => ipcRenderer.invoke('app:openLogs'),

  // Auth cookie management
  clearAuthCookies: () => ipcRenderer.invoke('auth:clearCookies'),

  // Debug: dump Electron cookies for switchcontrol.org
  debugCookies: () => ipcRenderer.invoke('auth:debugCookies'),
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('[SwitchControl Desktop] Preload initialized - unified API ready');
  console.log('[SwitchControl Desktop] Platform:', process.platform);
});
