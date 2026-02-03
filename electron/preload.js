const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});

contextBridge.exposeInMainWorld('auth', {
  onCallback: (callback) => {
    console.log('[SwitchControl Preload] Registering auth callback listener');
    ipcRenderer.on('auth-callback', (event, url) => {
      console.log('[SwitchControl Preload] Received auth-callback:', url);
      callback(url);
    });
  },
  removeCallbackListener: () => {
    console.log('[SwitchControl Preload] Removing auth callback listener');
    ipcRenderer.removeAllListeners('auth-callback');
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  isPackaged: () => ipcRenderer.invoke('app:isPackaged'),
  
  isElectron: true,
  
  system: {
    getInfo: () => ipcRenderer.invoke('system:getInfo'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
  },
  
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
});

contextBridge.exposeInMainWorld('telemetry', {
  getLive: () => ipcRenderer.invoke('telemetry:getLive'),
});

contextBridge.exposeInMainWorld('sc', {
  getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),
  getSystemSpecs: () => ipcRenderer.invoke('system:getSpecs'),
  getRamUsage: () => ipcRenderer.invoke('system:getRamUsage'),
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('[SwitchControl Desktop] Preload initialized');
  console.log('[SwitchControl Desktop] Platform:', process.platform);
});
