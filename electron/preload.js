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
  isAdmin: () => ipcRenderer.invoke('app:isAdmin'),

  quitApp: () => ipcRenderer.invoke('app:quit'),

  // Backend info (for packaged mode API routing)
  getBackendPort: () => ipcRenderer.invoke('app:getBackendPort'),
  isBackendReady: () => ipcRenderer.invoke('app:isBackendReady'),
  getBackendError: () => ipcRenderer.invoke('app:getBackendError'),
  onBackendReady: (callback) => {
    ipcRenderer.on('backend-ready', (event, data) => {
      console.log('[Backend] backend-ready event received, port:', data?.port);
      callback(data);
    });
  },
  onBackendError: (callback) => {
    const handler = (event, data) => {
      console.error('[Backend] backend-error event received:', data?.error);
      callback(data);
    };
    ipcRenderer.on('backend-error', handler);
    return () => ipcRenderer.removeListener('backend-error', handler);
  },

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
    getLive: (selectedDiskMount) => ipcRenderer.invoke('telemetry:getLive', selectedDiskMount),
    getEnhanced: () => ipcRenderer.invoke('telemetry:getEnhanced'),
    getCpuCores: () => ipcRenderer.invoke('telemetry:getCpuCores'),
    getMemoryDetails: () => ipcRenderer.invoke('telemetry:getMemoryDetails'),
    getGpu: () => ipcRenderer.invoke('telemetry:getGpu'),
    getDisk: (selectedDiskMount) => ipcRenderer.invoke('telemetry:getDisk', selectedDiskMount),
    getHardwareTelemetry: () => ipcRenderer.invoke('telemetry:getHardwareTelemetry'),
  },

  // Tweaks
  tweaks: {
    execute: (tweakId, action) => ipcRenderer.invoke('tweak:execute', tweakId, action),
    checkStatus: (tweakId) => ipcRenderer.invoke('tweak:checkStatus', tweakId),
    syncAll: () => ipcRenderer.invoke('tweak:syncAll'),
    getLocalState: () => ipcRenderer.invoke('tweak:getLocalState'),
    getInfo: () => ipcRenderer.invoke('tweak:getInfo'),
    getLog: () => ipcRenderer.invoke('tweak:getLog'),
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
  restart: () => ipcRenderer.invoke('app:restart'),
  resetAppData: () => ipcRenderer.invoke('app:resetData'),
  openLogs: () => ipcRenderer.invoke('app:openLogs'),

  // Auth cookie management
  clearAuthCookies: () => ipcRenderer.invoke('auth:clearCookies'),

  // Debug: dump Electron cookies for switchcontrol.org
  debugCookies: () => ipcRenderer.invoke('auth:debugCookies'),

  // Power plan management
  powerPlans: {
    getState:     ()           => ipcRenderer.invoke('powerPlans:getState'),
    applyProfile: (profileId)  => ipcRenderer.invoke('powerPlans:applyProfile', profileId),
    listSchemes:  ()           => ipcRenderer.invoke('powerPlans:listSchemes'),
  },

  // Packaged config store — persisted secrets (e.g. OPENAI_API_KEY)
  config: {
    get: (key) => ipcRenderer.invoke('config:get', key),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    getPresence: () => ipcRenderer.invoke('config:getPresence'),
  },

  // System Integrity / Security
  security: {
    getStatus:       () => ipcRenderer.invoke('security:getStatus'),
    getStartupApps:  () => ipcRenderer.invoke('security:getStartupApps'),
    getTopProcesses: () => ipcRenderer.invoke('security:getTopProcesses'),
  },

  // System Cleaner — real file scanning and deletion
  cleaner: {
    scan:    (itemIds) => ipcRenderer.invoke('cleaner:scan', itemIds),
    clean:   (itemIds) => ipcRenderer.invoke('cleaner:clean', itemIds),
    verify:  (itemIds) => ipcRenderer.invoke('cleaner:verify', itemIds),
  },

  // Debloat Manager — real Windows app/registry/service removal
  debloat: {
    scan:        (items)  => ipcRenderer.invoke('debloat:scan', items),
    removeItem:  (item)   => ipcRenderer.invoke('debloat:removeItem', item),
    restoreItem: (item)   => ipcRenderer.invoke('debloat:restoreItem', item),
    verifyItem:  (item)   => ipcRenderer.invoke('debloat:verifyItem', item),
  },

  // Startup Manager — real Windows startup control
  // setEnabled uses the StartupApproved registry key (same method as Task Manager)
  // setDelay creates/removes a Task Scheduler delayed task
  startup: {
    setEnabled:   (params) => ipcRenderer.invoke('startup:setEnabled', params),
    setDelay:     (params) => ipcRenderer.invoke('startup:setDelay', params),
    verifyState:  (params) => ipcRenderer.invoke('startup:verifyState', params),
  },

  // App Booster — per-game optimization actions
  appBooster: {
    scanGames:       (games)   => ipcRenderer.invoke('appBooster:scanGames', games),
    executeAction:   (params)  => ipcRenderer.invoke('appBooster:executeAction', params),
    browseExecutable:(params)  => ipcRenderer.invoke('appBooster:browseExecutable', params),
  },

  // Network Tweaks — real Windows system-level network changes
  networkTweaks: {
    execute:     (tweakId, action) => ipcRenderer.invoke('networkTweaks:execute', tweakId, action),
    checkStatus: (tweakId)        => ipcRenderer.invoke('networkTweaks:checkStatus', tweakId),
    checkAll:    ()               => ipcRenderer.invoke('networkTweaks:checkAll'),
    getDisabled: ()               => ipcRenderer.invoke('networkTweaks:getDisabled'),
  },

  // Focus Mode — real system-level actions (power plan, notifications, input lockdown, etc.)
  focus: {
    apply:               (params)  => ipcRenderer.invoke('focus:apply', params),
    revert:              (params)  => ipcRenderer.invoke('focus:revert', params),
    verify:              ()        => ipcRenderer.invoke('focus:verify'),
    startTriggerMonitor: (params)  => ipcRenderer.invoke('focus:startTriggerMonitor', params),
    stopTriggerMonitor:  ()        => ipcRenderer.invoke('focus:stopTriggerMonitor'),
    checkSchedule:       (params)  => ipcRenderer.invoke('focus:checkSchedule', params),
    onTriggerFired: (callback) => {
      const handler = (event, payload) => callback(payload);
      ipcRenderer.on('focus:triggerFired', handler);
      return () => ipcRenderer.removeListener('focus:triggerFired', handler);
    },
  },

  // Auto-Updater — renderer reads state, main process owns all logic
  updater: {
    getState:      () => ipcRenderer.invoke('updater:getState'),
    check:         () => ipcRenderer.invoke('updater:check'),
    download:      () => ipcRenderer.invoke('updater:download'),
    install:       () => ipcRenderer.invoke('updater:install'),
    onEvent: (callback) => {
      const handler = (event, payload) => callback(payload);
      ipcRenderer.on('updater:event', handler);
      return () => ipcRenderer.removeListener('updater:event', handler);
    },
  },
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('[SwitchControl Desktop] Preload initialized - unified API ready');
  console.log('[SwitchControl Desktop] Platform:', process.platform);
});
