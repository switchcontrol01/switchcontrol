const { contextBridge, ipcRenderer } = require('electron');

// SINGLE UNIFIED API - All frontend code must use window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  isPackaged: () => ipcRenderer.invoke('app:isPackaged'),

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
  },

  // Tweaks
  tweaks: {
    execute: (tweakId, action) => ipcRenderer.invoke('tweak:execute', tweakId, action),
    checkStatus: (tweakId) => ipcRenderer.invoke('tweak:checkStatus', tweakId),
    syncAll: () => ipcRenderer.invoke('tweak:syncAll'),
    getLocalState: () => ipcRenderer.invoke('tweak:getLocalState'),
    getInfo: () => ipcRenderer.invoke('tweak:getInfo'),
  },

  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Auth cookie management
  clearAuthCookies: () => ipcRenderer.invoke('auth:clearCookies'),
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('[SwitchControl Desktop] Preload initialized - unified API ready');
  console.log('[SwitchControl Desktop] Platform:', process.platform);
});
