const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  isPackaged: () => ipcRenderer.invoke('app:isPackaged'),
  
  isElectron: true,
  
  system: {
    getInfo: () => ipcRenderer.invoke('system:getInfo'),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
  },
  
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  
  onAuthCallback: (callback) => {
    ipcRenderer.on('auth-callback', (event, data) => callback(data));
  },
  
  removeAuthCallbackListener: () => {
    ipcRenderer.removeAllListeners('auth-callback');
  },
});

contextBridge.exposeInMainWorld('switchControl', {
  ready: true,
  version: '1.0.0',
  
  tweaks: {
    apply: async (tweakId) => {
      console.log('[SwitchControl] Tweak apply requested:', tweakId);
      return { success: true, message: 'Tweak functionality will be available in future update' };
    },
    revert: async (tweakId) => {
      console.log('[SwitchControl] Tweak revert requested:', tweakId);
      return { success: true, message: 'Revert functionality will be available in future update' };
    },
    getStatus: async (tweakId) => {
      console.log('[SwitchControl] Tweak status requested:', tweakId);
      return { applied: false, available: true };
    },
  },
  
  startup: {
    getApps: async () => {
      console.log('[SwitchControl] Startup apps requested');
      return [];
    },
    toggleApp: async (appId, enabled) => {
      console.log('[SwitchControl] Toggle startup app:', appId, enabled);
      return { success: true };
    },
  },
  
  system: {
    getInfo: () => ipcRenderer.invoke('system:getInfo'),
    
    clearRam: async () => {
      console.log('[SwitchControl] RAM clear requested');
      return { success: true, freedMB: 0 };
    },
  },
  
  network: {
    getSettings: async () => {
      console.log('[SwitchControl] Network settings requested');
      return {};
    },
    applyTweak: async (tweakId) => {
      console.log('[SwitchControl] Network tweak requested:', tweakId);
      return { success: true };
    },
  },
});

contextBridge.exposeInMainWorld('sc', {
  getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),
  getSystemSpecs: () => ipcRenderer.invoke('system:getSpecs'),
  getRamUsage: () => ipcRenderer.invoke('system:getRamUsage')
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('[SwitchControl Desktop] Preload initialized');
  console.log('[SwitchControl Desktop] Platform:', process.platform);
});
