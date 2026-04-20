const { contextBridge, ipcRenderer } = require('electron');

// ─── Input validation helpers ─────────────────────────────────────────────────
// Lightweight guards that reject garbage before it crosses the privilege boundary.
// Main process remains the final authority — these are a first filter only.

function assertString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function assertOptionalString(value, name) {
  if (value == null) return value;
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string`);
  }
  return value;
}

function assertFunction(value, name) {
  if (typeof value !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be a plain object`);
  }
  return value;
}

// ─── Allowed value sets ───────────────────────────────────────────────────────
const ALLOWED_TWEAK_ACTIONS = new Set(['apply', 'revert']);
const ALLOWED_MEMORY_MODES  = new Set(['safe', 'smart', 'advanced']);

// ─── Unified renderer API ─────────────────────────────────────────────────────
// All frontend code must use window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // ── Low-risk read-only ──────────────────────────────────────────────────────
  getVersion:      () => ipcRenderer.invoke('app:getVersion'),
  getAppVersion:   () => ipcRenderer.invoke('app:getVersion'),
  getPlatform:     () => ipcRenderer.invoke('app:getPlatform'),
  isPackaged:      () => ipcRenderer.invoke('app:isPackaged'),
  getDeviceId:     () => ipcRenderer.invoke('app:getDeviceId'),
  isAdmin:         () => ipcRenderer.invoke('app:isAdmin'),
  getBackendPort:  () => ipcRenderer.invoke('app:getBackendPort'),
  isBackendReady:  () => ipcRenderer.invoke('app:isBackendReady'),
  getBackendError: () => ipcRenderer.invoke('app:getBackendError'),
  debugCookies:    () => ipcRenderer.invoke('auth:debugCookies'),
  openDevTools:    () => ipcRenderer.invoke('app:openDevTools'),
  openLogs:        () => ipcRenderer.invoke('app:openLogs'),

  // ── Controlled privileged actions ───────────────────────────────────────────
  quitApp:          () => ipcRenderer.invoke('app:quit'),
  restart:          () => ipcRenderer.invoke('app:restart'),
  resetAppData:     () => ipcRenderer.invoke('app:resetData'),
  clearAuthCookies: () => ipcRenderer.invoke('auth:clearCookies'),

  openExternal: (url) => {
    assertString(url, 'url');
    return ipcRenderer.invoke('open-external', url);
  },

  // ── Event subscriptions ─────────────────────────────────────────────────────
  // Every subscription returns its own scoped unsubscribe function.
  // removeAllListeners is never used for app-owned shared channels.

  onBackendReady: (callback) => {
    assertFunction(callback, 'onBackendReady callback');
    const handler = (_event, data) => {
      console.log('[Backend] backend-ready event received, port:', data?.port);
      callback(data);
    };
    ipcRenderer.on('backend-ready', handler);
    return () => ipcRenderer.removeListener('backend-ready', handler);
  },

  onBackendError: (callback) => {
    assertFunction(callback, 'onBackendError callback');
    const handler = (_event, data) => {
      console.error('[Backend] backend-error event received:', data?.error);
      callback(data);
    };
    ipcRenderer.on('backend-error', handler);
    return () => ipcRenderer.removeListener('backend-error', handler);
  },

  onWindowFocus: (callback) => {
    assertFunction(callback, 'onWindowFocus callback');
    const handler = () => {
      console.log('[Window] Focus event received');
      callback();
    };
    ipcRenderer.on('window-focus', handler);
    return () => ipcRenderer.removeListener('window-focus', handler);
  },

  // ── Auth — deep-link callback ───────────────────────────────────────────────
  auth: {
    onCallback: (callback) => {
      assertFunction(callback, 'auth.onCallback callback');
      const handler = (_event, url) => {
        console.log('[PremiumFlow] deep-link received:', url);
        callback(url);
      };
      ipcRenderer.on('auth-callback', handler);
      return () => ipcRenderer.removeListener('auth-callback', handler);
    },
  },

  // ── Window controls ─────────────────────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close:    () => ipcRenderer.invoke('window:close'),
  },

  // ── Low-risk read-only system data ──────────────────────────────────────────
  system: {
    getInfo:     () => ipcRenderer.invoke('system:getInfo'),
    getSpecs:    () => ipcRenderer.invoke('system:getSpecs'),
    getRamUsage: () => ipcRenderer.invoke('system:getRamUsage'),
    getAllDisks:  () => ipcRenderer.invoke('system:getAllDisks'),
  },

  // ── Security — system integrity data ────────────────────────────────────────
  security: {
    getStatus:            () => ipcRenderer.invoke('security:getStatus'),
    getStartupApps:       () => ipcRenderer.invoke('security:getStartupApps'),
    getTopProcesses:      () => ipcRenderer.invoke('security:getTopProcesses'),
    getAdvancedProtection: () => ipcRenderer.invoke('security:getAdvancedProtection'),
    getAdvancedAudit:     () => ipcRenderer.invoke('security:getAdvancedAudit'),
    getProcessDetails:    () => ipcRenderer.invoke('security:getProcessDetails'),
    getScheduledTasks:    () => ipcRenderer.invoke('security:getScheduledTasks'),
    getServices:          () => ipcRenderer.invoke('security:getServices'),
    openProcessLocation:  (filePath) => {
      assertString(filePath, 'filePath');
      return ipcRenderer.invoke('security:openProcessLocation', filePath);
    },
    openStartupLocation:  (command) => {
      assertString(command, 'command');
      return ipcRenderer.invoke('security:openStartupLocation', command);
    },
  },

  telemetry: {
    getLive:              (selectedDiskMount) => ipcRenderer.invoke('telemetry:getLive', selectedDiskMount),
    getEnhanced:          () => ipcRenderer.invoke('telemetry:getEnhanced'),
    getCpuCores:          () => ipcRenderer.invoke('telemetry:getCpuCores'),
    getMemoryDetails:     () => ipcRenderer.invoke('telemetry:getMemoryDetails'),
    getGpu:               () => ipcRenderer.invoke('telemetry:getGpu'),
    getDisk:              (selectedDiskMount) => ipcRenderer.invoke('telemetry:getDisk', selectedDiskMount),
    getHardwareTelemetry: () => ipcRenderer.invoke('telemetry:getHardwareTelemetry'),
  },

  // ── Packaged config store — persisted secrets (e.g. OPENAI_API_KEY) ─────────
  config: {
    get: (key) => {
      assertString(key, 'key');
      return ipcRenderer.invoke('config:get', key);
    },
    set: (key, value) => {
      assertString(key, 'key');
      assertOptionalString(value, 'value');
      return ipcRenderer.invoke('config:set', key, value);
    },
    getPresence: () => ipcRenderer.invoke('config:getPresence'),
  },

  // ── System mutation surfaces ─────────────────────────────────────────────────
  tweaks: {
    execute: (tweakId, action) => {
      const id  = assertString(tweakId, 'tweakId');
      const act = assertString(action, 'action');
      if (!ALLOWED_TWEAK_ACTIONS.has(act)) {
        throw new TypeError('tweaks.execute: action must be "apply" or "revert"');
      }
      return ipcRenderer.invoke('tweak:execute', id, act);
    },
    checkStatus: (tweakId) => {
      assertString(tweakId, 'tweakId');
      return ipcRenderer.invoke('tweak:checkStatus', tweakId);
    },
    syncAll:       () => ipcRenderer.invoke('tweak:syncAll'),
    getLocalState: () => ipcRenderer.invoke('tweak:getLocalState'),
    getInfo:       () => ipcRenderer.invoke('tweak:getInfo'),
    getLog:        () => ipcRenderer.invoke('tweak:getLog'),
    // Slider-specific APIs
    readValue: (tweakId) => {
      assertString(tweakId, 'tweakId');
      return ipcRenderer.invoke('tweak:readValue', tweakId);
    },
    applyValue: (tweakId, value) => {
      assertString(tweakId, 'tweakId');
      if (typeof value !== 'number') throw new TypeError('tweaks.applyValue: value must be a number');
      return ipcRenderer.invoke('tweak:applyValue', tweakId, value);
    },
    verifyValue: (tweakId, expectedValue) => {
      assertString(tweakId, 'tweakId');
      if (typeof expectedValue !== 'number') throw new TypeError('tweaks.verifyValue: expectedValue must be a number');
      return ipcRenderer.invoke('tweak:verifyValue', tweakId, expectedValue);
    },
    resetValue: (tweakId) => {
      assertString(tweakId, 'tweakId');
      return ipcRenderer.invoke('tweak:resetValue', tweakId);
    },
    getSliderMeta: (tweakId) => {
      assertString(tweakId, 'tweakId');
      return ipcRenderer.invoke('tweak:getSliderMeta', tweakId);
    },
  },

  nic: {
    getAdapters:      () => ipcRenderer.invoke('nic:getAdapters'),
    getPropertyMeta:  () => ipcRenderer.invoke('nic:getPropertyMeta'),
    getCapabilities: (adapterName) => {
      assertString(adapterName, 'adapterName');
      return ipcRenderer.invoke('nic:getCapabilities', adapterName);
    },
    readProperty: (adapterName, propertyKey) => {
      assertString(adapterName, 'adapterName');
      assertString(propertyKey, 'propertyKey');
      return ipcRenderer.invoke('nic:readProperty', adapterName, propertyKey);
    },
    setProperty: (adapterName, propertyKey, value) => {
      assertString(adapterName, 'adapterName');
      assertString(propertyKey, 'propertyKey');
      if (value === undefined || value === null) throw new TypeError('nic.setProperty: value required');
      return ipcRenderer.invoke('nic:setProperty', adapterName, propertyKey, String(value));
    },
    resetProperty: (adapterName, propertyKey) => {
      assertString(adapterName, 'adapterName');
      assertString(propertyKey, 'propertyKey');
      return ipcRenderer.invoke('nic:resetProperty', adapterName, propertyKey);
    },
  },

  memory: {
    clean: (mode) => {
      const m = assertString(mode, 'mode');
      if (!ALLOWED_MEMORY_MODES.has(m)) {
        throw new TypeError('memory.clean: mode must be "safe", "smart", or "advanced"');
      }
      return ipcRenderer.invoke('memory:clean', m);
    },
  },

  powerPlans: {
    getState:       ()          => ipcRenderer.invoke('powerPlans:getState'),
    applyProfile:   (profileId) => {
      assertString(profileId, 'profileId');
      return ipcRenderer.invoke('powerPlans:applyProfile', profileId);
    },
    listSchemes:    ()          => ipcRenderer.invoke('powerPlans:listSchemes'),
    activateByGuid: (guid)      => {
      assertString(guid, 'guid');
      return ipcRenderer.invoke('powerPlans:activateByGuid', guid);
    },
  },

  networkTweaks: {
    execute: (tweakId, action) => {
      const id  = assertString(tweakId, 'tweakId');
      const act = assertString(action, 'action');
      if (!ALLOWED_TWEAK_ACTIONS.has(act)) {
        throw new TypeError('networkTweaks.execute: action must be "apply" or "revert"');
      }
      return ipcRenderer.invoke('networkTweaks:execute', id, act);
    },
    checkStatus: (tweakId) => {
      assertString(tweakId, 'tweakId');
      return ipcRenderer.invoke('networkTweaks:checkStatus', tweakId);
    },
    checkAll:    () => ipcRenderer.invoke('networkTweaks:checkAll'),
    getDisabled: () => ipcRenderer.invoke('networkTweaks:getDisabled'),
  },

  cleaner: {
    scan:   (itemIds) => ipcRenderer.invoke('cleaner:scan', itemIds),
    clean:  (itemIds) => ipcRenderer.invoke('cleaner:clean', itemIds),
    verify: (itemIds) => ipcRenderer.invoke('cleaner:verify', itemIds),
  },

  debloat: {
    scan:        (items) => ipcRenderer.invoke('debloat:scan', items),
    removeItem:  (item)  => ipcRenderer.invoke('debloat:removeItem', item),
    restoreItem: (item)  => ipcRenderer.invoke('debloat:restoreItem', item),
    verifyItem:  (item)  => ipcRenderer.invoke('debloat:verifyItem', item),
  },

  installedApps: {
    scan: () => ipcRenderer.invoke('installedApps:scan'),
    uninstall: (app) => {
      if (!app || typeof app !== 'object') throw new Error('Invalid app payload');
      return ipcRenderer.invoke('installedApps:uninstall', app);
    },
  },

  startup: {
    setEnabled:  (params) => ipcRenderer.invoke('startup:setEnabled', params),
    setDelay:    (params) => ipcRenderer.invoke('startup:setDelay', params),
    verifyState: (params) => ipcRenderer.invoke('startup:verifyState', params),
  },

  appBooster: {
    scanGames:        (games)  => ipcRenderer.invoke('appBooster:scanGames', games),
    executeAction:    (params) => {
      assertPlainObject(params, 'params');
      return ipcRenderer.invoke('appBooster:executeAction', params);
    },
    browseExecutable: (params) => {
      assertPlainObject(params, 'params');
      return ipcRenderer.invoke('appBooster:browseExecutable', params);
    },
  },

  focus: {
    apply:               (params) => ipcRenderer.invoke('focus:apply', params),
    revert:              (params) => ipcRenderer.invoke('focus:revert', params),
    verify:              ()       => ipcRenderer.invoke('focus:verify'),
    startTriggerMonitor: (params) => ipcRenderer.invoke('focus:startTriggerMonitor', params),
    stopTriggerMonitor:  ()       => ipcRenderer.invoke('focus:stopTriggerMonitor'),
    checkSchedule:       (params) => ipcRenderer.invoke('focus:checkSchedule', params),
    onTriggerFired: (callback) => {
      assertFunction(callback, 'focus.onTriggerFired callback');
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('focus:triggerFired', handler);
      return () => ipcRenderer.removeListener('focus:triggerFired', handler);
    },
  },

  // ── Updater — renderer reads state, main process owns all logic ─────────────
  updater: {
    getState: () => ipcRenderer.invoke('updater:getState'),
    check:    () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install:  () => ipcRenderer.invoke('updater:install'),
    onEvent: (callback) => {
      assertFunction(callback, 'updater.onEvent callback');
      const handler = (_event, payload) => {
        if (!payload || typeof payload !== 'object') {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[preload] updater:event received malformed payload');
          }
          return;
        }
        callback(payload);
      };
      ipcRenderer.on('updater:event', handler);
      return () => ipcRenderer.removeListener('updater:event', handler);
    },
  },
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('[SwitchControl Desktop] Preload initialized - unified API ready');
  console.log('[SwitchControl Desktop] Platform:', process.platform);
});
