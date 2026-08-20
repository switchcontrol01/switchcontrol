const { contextBridge, ipcRenderer } = require('electron');
// ─── Zero-flash dark background ───────────────────────────────────────────────
// Preload runs synchronously before any page HTML is fetched or parsed.
//
// Three-layer flash prevention:
//   1. transparent:true on BrowserWindow → DWM surface is transparent, so no
//      white DWM init frame can appear. Also enables setOpacity() on Windows.
//   2. background styles below → Chromium renderer layer is dark.
//   3. opacity: 0 below → content is invisible until Splash.tsx's double-rAF
//      calls document.documentElement.style.opacity = '' just before sending
//      app:first-frame-ready. By the time main.js calls show(), content is at
//      full CSS opacity and the OS-level setOpacity fade (0→1, 280ms ease-out)
//      cross-fades the entire window in smoothly — no flash, no instant pop.
try {
  document.documentElement.style.setProperty('background', '#07090D', 'important');
  document.documentElement.style.setProperty('background-color', '#07090D', 'important');
  document.documentElement.style.setProperty('color-scheme', 'dark');
  document.documentElement.style.setProperty('opacity', '0', 'important');
} catch (_) {}
// ─── Production detection ─────────────────────────────────────────────────────
// Main process passes --switchcontrol-prod via additionalArguments in production.
// This is reliable across dev/packaged builds without depending on NODE_ENV.
const isProdBuild = process.argv.includes('--switchcontrol-prod');
// DevTools are disabled in production builds. F12 and Ctrl+Shift+I are blocked
// by the before-input-event handler in main.js.
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
const ALLOWED_TWEAK_ACTIONS  = new Set(['apply', 'revert']);
const ALLOWED_MEMORY_MODES   = new Set(['safe', 'smart', 'advanced']);
const ALLOWED_PC_PROFILES    = new Set(['safe', 'competitive', 'extreme']);
// Config keys that the renderer is allowed to read/write. The config store holds
// secrets (e.g. selectedGpuIndex) — restricting to an
// explicit allowlist prevents a compromised renderer from enumerating arbitrary keys.
const ALLOWED_CONFIG_KEYS = new Set([
  'installedVersion',
  'postUpdateGrace',
  'previousVersion',
  'selectedGpuIndex',
]);
// IP address allowlist pattern (IPv4 only — DNS apply only accepts numeric IPs).
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
// Drive letter pattern — single letter optionally followed by colon.
const DRIVE_LETTER_RE = /^[A-Za-z]:?$/;
// Max items allowed in bulk array IPC calls — prevents memory exhaustion from
// a crafted oversized array reaching the main process.
const MAX_ARRAY_IPC_LEN = 500;
// ─── Array content validation helper ─────────────────────────────────────────
// Validates that value is an array of non-empty strings with a length cap.
function assertStringArray(value, name, maxLen = MAX_ARRAY_IPC_LEN) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  if (value.length > maxLen) throw new TypeError(`${name} exceeds max length of ${maxLen}`);
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string' || !value[i].trim()) {
      throw new TypeError(`${name}[${i}] must be a non-empty string`);
    }
  }
  return value;
}
// ─── Shared event subscription factory ───────────────────────────────────────
// Eliminates the repetitive assertFunction → wrap-handler → ipcRenderer.on/once
// → return-unsubscribe boilerplate that was duplicated across six subscriptions.
//
//   channel    — IPC channel name
//   callback   — user callback; receives the event payload as its only argument
//   once       — use ipcRenderer.once instead of .on (default: false)
//   log        — called with payload in dev builds only (if !isProdBuild)
//   alwaysLog  — called with payload unconditionally (for error/warning events)
//   validate   — predicate; if it returns false the handler drops the event
//                without calling callback (used for schema validation)
function onEvent(channel, callback, { once = false, log, alwaysLog, validate } = {}) {
  assertFunction(callback, `${channel} callback`);
  const handler = (_e, data) => {
    if (validate && !validate(data)) return;
    if (alwaysLog) alwaysLog(data);
    else if (log && !isProdBuild) log(data);
    callback(data);
  };
  ipcRenderer[once ? 'once' : 'on'](channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
// ─── specs:enriched replay cache ─────────────────────────────────────────────
// Caches the most recent specs:enriched payload so that subscribers who
// register AFTER the event fires (e.g. Home mounting 1-2s after enrichment
// completes) receive the resolved GPU/CPU data immediately on subscribe.
let _lastSpecsEnrichedPayload = null;
ipcRenderer.on('specs:enriched', (_, payload) => {
  const gpuOk  = payload?.gpu?.model  && payload.gpu.model  !== 'Detecting\u2026';
  const diskOk = payload?.disk?.name  && (payload.disk?.totalGB ?? 0) > 0;
  if (gpuOk || diskOk) {
    // Merge so a GPU-only event (WMI fast-path) doesn't wipe a previously
    // cached disk payload, and a GPU+disk event fills everything in.
    _lastSpecsEnrichedPayload = _lastSpecsEnrichedPayload
      ? { ..._lastSpecsEnrichedPayload, ...payload }
      : payload;
  }
});
// ─── Unified renderer API ─────────────────────────────────────────────────────
// All frontend code must use window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  // ── Launch handshake: renderer signals first branded frame is painted ────────
  signalFirstFrameReady:    () => ipcRenderer.send('app:first-frame-ready'),
  signalDashboardMounted:   () => ipcRenderer.send('app:dashboard-mounted'),
  // ── Low-risk read-only ──────────────────────────────────────────────────────
  getVersion:    () => ipcRenderer.invoke('app:getVersion'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'), // alias of getVersion — both kept for call-site compatibility; do not add a third
  getPlatform:     () => ipcRenderer.invoke('app:getPlatform'),
  isPackaged:      () => ipcRenderer.invoke('app:isPackaged'),
  getDeviceId:     () => ipcRenderer.invoke('app:getDeviceId'),
  getDeviceSignature: () => ipcRenderer.invoke('app:getDeviceSignature'),
  // Legacy device-ID migration (one-time, pre-permanent-fingerprint installs)
  getLegacyDeviceId:   () => ipcRenderer.invoke('app:getLegacyDeviceId'),
  clearLegacyDeviceId: () => ipcRenderer.invoke('app:clearLegacyDeviceId'),
  // 64-char SHA-256 hardware fingerprint (promo/anti-abuse) — read-only
  getDeviceFingerprint: () => ipcRenderer.invoke('app:getDeviceFingerprint'),
  setDeviceSignature: (signature) => ipcRenderer.invoke('app:setDeviceSignature', signature),
  isAdmin:         () => ipcRenderer.invoke('app:isAdmin'),
  isIPCReady:      () => ipcRenderer.invoke('app:isIPCReady'),
  getPostUpdateGrace:   () => ipcRenderer.invoke('app:getPostUpdateGrace'),
  clearPostUpdateGrace: () => ipcRenderer.invoke('app:clearPostUpdateGrace'),
  getBackendPort:  () => ipcRenderer.invoke('app:getBackendPort'),
  isBackendReady:  () => ipcRenderer.invoke('app:isBackendReady'),
  getBackendError: () => ipcRenderer.invoke('app:getBackendError'),
  debugCookies:    () => ipcRenderer.invoke('auth:debugCookies'),
  debug: {
    getPerformanceInfo: () => ipcRenderer.invoke('debug:getPerformanceInfo'),
  },
  openLogs:        () => ipcRenderer.invoke('app:openLogs'),
  // ── Controlled privileged actions ───────────────────────────────────────────
  quitApp:          () => ipcRenderer.invoke('app:quit'),
  restart:          () => ipcRenderer.invoke('app:restart'),
  resetAppData:     () => ipcRenderer.invoke('app:resetData', 'RESET_SWITCHCONTROL_DATA'),
  clearAuthCookies: () => ipcRenderer.invoke('auth:clearCookies'),
  openExternal: (url) => {
    assertString(url, 'url');
    return ipcRenderer.invoke('open-external', url);
  },
  // ── Event subscriptions ─────────────────────────────────────────────────────
  // Every subscription returns its own scoped unsubscribe function.
  // removeAllListeners is never used for app-owned shared channels.
  onBackendReady: (callback) => onEvent('backend-ready', callback, {
    log: (d) => console.log('[Backend] backend-ready event received, port:', d?.port),
  }),
  onBackendError: (callback) => onEvent('backend-error', callback, {
    // Logs unconditionally (even in production) so backend failures are always visible.
    alwaysLog: (d) => console.error('[Backend] backend-error event received:', d?.error),
  }),
  onWindowFocus: (callback) => onEvent('window-focus', callback, {
    log: () => console.log('[Window] Focus event received'),
  }),
  // ── Launch handshake: main confirms window is now visible ────────────────
  // Called once after mainWindow.show() so the renderer can start the opacity
  // reveal ONLY after the OS window is actually on screen (no mid-transition flash).
  onWindowShown: (callback) => onEvent('app:window-shown', callback, {
    once: true,
    log: () => console.log('[LAUNCH] app:window-shown received — starting opacity reveal'),
  }),
  // ── Auth — deep-link callback ───────────────────────────────────────────────
  auth: {
    onCallback: (callback) => {
      assertFunction(callback, 'auth.onCallback callback');
      const handler = (_event, url) => {
        if (!isProdBuild) console.log('[PremiumFlow] deep-link received:', url);
        callback(url);
      };
      ipcRenderer.on('auth-callback', handler);
      // Signal to main that the renderer auth listener is now registered and
      // ready to receive deep-link callbacks. Main holds any pending deep link
      // until this fires instead of relying on the did-finish-load timing.
      ipcRenderer.send('renderer:auth-ready');
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
    getInfo:           () => ipcRenderer.invoke('system:getInfo'),
    getSpecs:          () => ipcRenderer.invoke('system:getSpecs'),
    getRamUsage:       () => ipcRenderer.invoke('system:getRamUsage'),
    getAllDisks:        () => ipcRenderer.invoke('system:getAllDisks'),
    getDisplayInfo:        () => ipcRenderer.invoke('system:getDisplayInfo'),
    invalidateDisplayCache:() => ipcRenderer.invoke('display:invalidateCache'),
    getAudioDevice:      () => ipcRenderer.invoke('system:getAudioDevice'),
    getBluetoothDevice: () => ipcRenderer.invoke('system:getBluetoothDevice'),
    getMotherboard:      () => ipcRenderer.invoke('system:getMotherboard'),
    onSpecsEnriched: (cb) => {
      // If specs were already enriched before this subscriber registered, replay
      // the last payload immediately so late subscribers (e.g. Home mounting after
      // enrichment completes) never stay stuck on "Detecting…".
      if (_lastSpecsEnrichedPayload) {
        try { cb(_lastSpecsEnrichedPayload); } catch (e) {}
      }
      const handler = (_, payload) => cb(payload);
      ipcRenderer.on('specs:enriched', handler);
      return () => ipcRenderer.removeListener('specs:enriched', handler);
    },
  },
  // ── Shared native icon bridge (Process Manager, Startup) ─────────────────────
  // Reads the real icon out of a .exe via Electron's shell.getFileIcon(),
  // main-process side, with its own on-disk cache (see electron/file-icon.js).
  appIcons: {
    forPath: (filePath) => {
      assertString(filePath, 'filePath');
      return ipcRenderer.invoke('appIcons:forPath', filePath);
    },
  },
  // ── Security — system integrity data ────────────────────────────────────────
  security: {
    getStatus:            () => ipcRenderer.invoke('security:getStatus'),
    getStartupApps:       () => ipcRenderer.invoke('security:getStartupApps'),
    getTopProcesses:      () => ipcRenderer.invoke('security:getTopProcesses'),
    getAdvancedProtection: () => ipcRenderer.invoke('security:getAdvancedProtection'),
    getAdvancedAudit:     () => ipcRenderer.invoke('security:getAdvancedAudit'),
    setDefenderOption:    (option, enabled) => {
      const ALLOWED_DEFENDER_OPTIONS = new Set([
        'cloudProtection', 'puaProtection', 'controlledFolderAccess',
        'sampleSubmission', 'smartScreen'
      ]);
      if (!ALLOWED_DEFENDER_OPTIONS.has(option)) {
        throw new TypeError(`Invalid Defender option: ${option}`);
      }
      if (typeof enabled !== 'boolean') {
        throw new TypeError('enabled must be a boolean');
      }
      return ipcRenderer.invoke('security:setDefenderOption', option, enabled);
    },
    runDefenderAction:    (action) => {
      const ALLOWED_DEFENDER_ACTIONS = new Set(['quickScan', 'updateSignatures']);
      if (!ALLOWED_DEFENDER_ACTIONS.has(action)) {
        throw new TypeError(`Invalid Defender action: ${action}`);
      }
      return ipcRenderer.invoke('security:runDefenderAction', action);
    },
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
    getHardwareTelemetry:  () => ipcRenderer.invoke('telemetry:getHardwareTelemetry'),
    refreshGpuLoad:        () => ipcRenderer.invoke('telemetry:refreshGpuLoad'),
    refreshDeepHardware:   () => ipcRenderer.invoke('telemetry:refreshDeepHardware'),
    getSchedulerStats:     () => ipcRenderer.invoke('telemetry:getSchedulerStats'),
  },
  // ── Packaged config store — persisted app state ───────────────────────────
  config: {
    get: (key) => {
      assertString(key, 'key');
      if (!ALLOWED_CONFIG_KEYS.has(key)) throw new TypeError(`config.get: unknown key "${key}"`);
      return ipcRenderer.invoke('config:get', key);
    },
    set: (key, value) => {
      assertString(key, 'key');
      if (!ALLOWED_CONFIG_KEYS.has(key)) throw new TypeError(`config.set: unknown key "${key}"`);
      assertOptionalString(value, 'value');
      return ipcRenderer.invoke('config:set', key, value);
    },
    getPresence: () => ipcRenderer.invoke('config:getPresence'),
  },
  // ── Diagnostic logging bridge (narrow, validated) ────────────────────────────
  // Renderer → main only. Input is re-validated in main.js before writing.
  // Never exposes file paths or read access back to the renderer.
  logs: {
    /**
     * Report a critical event from the renderer (error boundary, global handler).
     * @param {{ category, severity, source, message, stack?, route?, userId? }} event
     */
    reportCritical: (event) => {
      // Throw on bad input — silently resolving would hide caller bugs in the
      // diagnostic-logging path, defeating the purpose of the call entirely.
      if (!event || typeof event !== 'object') {
        throw new TypeError('logs.reportCritical: event must be a non-null object');
      }
      return ipcRenderer.invoke('log:reportCritical', event);
    },
    /**
     * Returns the human-readable critical event summary string.
     */
    getCriticalSummary: () => ipcRenderer.invoke('log:getCriticalSummary'),
    /**
     * Returns the last n critical events as structured objects.
     */
    getRecentCritical: (n = 20) => ipcRenderer.invoke('log:getRecentCritical', n),
    /**
     * Exports all diagnostic files to a timestamped Desktop folder and opens it.
     * @param {string} notes — optional user-supplied text to include in export
     */
    exportDiagnostics: (notes = '') => {
      if (typeof notes !== 'string') notes = '';
      return ipcRenderer.invoke('log:exportDiagnostics', notes.substring(0, 2000));
    },
  },
  // ── System mutation surfaces ─────────────────────────────────────────────────
  tweaks: {
    execute: (tweakId, action, options) => {
      const id  = assertString(tweakId, 'tweakId');
      const act = assertString(action, 'action');
      if (!ALLOWED_TWEAK_ACTIONS.has(act)) {
        throw new TypeError('tweaks.execute: action must be "apply" or "revert"');
      }
      return ipcRenderer.invoke('tweak:execute', id, act, options || {});
    },
    checkStatus: (tweakId) => {
      assertString(tweakId, 'tweakId');
      return ipcRenderer.invoke('tweak:checkStatus', tweakId);
    },
    scanGpusForMsi: () => ipcRenderer.invoke('gpuMsi:scanAdapters'),
    // Multi-GPU picker — enumerate all detected GPUs and switch the active one
    listAllGpus:    () => ipcRenderer.invoke('gpu:listAll'),
    getSelectedGpu: () => ipcRenderer.invoke('gpu:getSelected'),
    setSelectedGpu: (index) => ipcRenderer.invoke('gpu:setSelected', index),
    syncAll:            () => ipcRenderer.invoke('tweak:syncAll'),
    batchCheckAll:      () => ipcRenderer.invoke('tweak:batchCheckAll'),
    getLocalState:      () => ipcRenderer.invoke('tweak:getLocalState'),
    saveVerifiedState:  (stateMap) => ipcRenderer.invoke('tweak:saveVerifiedState', stateMap),
    getInfo:       () => ipcRenderer.invoke('tweak:getInfo'),
    getLog:        () => ipcRenderer.invoke('tweak:getLog'),
    // Slider-specific APIs
    readValue: (tweakId) => {
      assertString(tweakId, 'tweakId');
      return ipcRenderer.invoke('tweak:readValue', tweakId);
    },
    applyValue: (tweakId, value) => {
      assertString(tweakId, 'tweakId');
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('tweaks.applyValue: value must be a finite number');
      return ipcRenderer.invoke('tweak:applyValue', tweakId, value);
    },
    verifyValue: (tweakId, expectedValue) => {
      assertString(tweakId, 'tweakId');
      if (typeof expectedValue !== 'number' || !Number.isFinite(expectedValue)) throw new TypeError('tweaks.verifyValue: expectedValue must be a finite number');
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
    checkCrashSentinel: () => ipcRenderer.invoke('tweak:checkCrashSentinel'),
    getDisabledSliders: () => ipcRenderer.invoke('tweak:getDisabledSliders'),
    revertAllSliders: () => ipcRenderer.invoke('tweak:revertAllSliders'),
  },
  // ── Preset-profile tweak APIs ─────────────────────────────────────────────────
  presetTweaks: {
    getState: (tweakId) => {
      assertString(tweakId, 'tweakId');
      return ipcRenderer.invoke('presetTweaks:getState', tweakId);
    },
    apply: (tweakId, optionId) => {
      assertString(tweakId, 'tweakId');
      assertString(optionId, 'optionId');
      return ipcRenderer.invoke('presetTweaks:apply', tweakId, optionId);
    },
    revert: (tweakId) => {
      assertString(tweakId, 'tweakId');
      return ipcRenderer.invoke('presetTweaks:revert', tweakId);
    },
    getMeta: (tweakId) => {
      assertString(tweakId, 'tweakId');
      return ipcRenderer.invoke('presetTweaks:getMeta', tweakId);
    },
    checkCrashSentinel: () => ipcRenderer.invoke('presetTweaks:checkCrashSentinel'),
    revertAll: () => ipcRenderer.invoke('presetTweaks:revertAll'),
  },
  nic: {
    getAdapters:      () => ipcRenderer.invoke('nic:getAdapters'),
    getPropertyMeta:  () => ipcRenderer.invoke('nic:getPropertyMeta'),
    getCapabilities: (adapterName) => {
      assertString(adapterName, 'adapterName');
      return ipcRenderer.invoke('nic:getCapabilities', adapterName);
    },
    invalidateCache: (adapterName) => {
      if (adapterName != null && typeof adapterName !== 'string') {
        throw new TypeError('nic.invalidateCache: adapterName must be a string or null');
      }
      return ipcRenderer.invoke('nic:invalidateCache', adapterName ?? null);
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
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        throw new TypeError('nic.setProperty: value must be a string, number, or boolean');
      }
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
    applyCustom:    (name, settings) => {
      assertString(name, 'customPlanName');
      assertPlainObject(settings, 'applyCustom settings');
      return ipcRenderer.invoke('powerPlans:applyCustom', name, settings);
    },
    getCustomMeta:     () => ipcRenderer.invoke('powerPlans:getCustomMeta'),
    getStoredSCGuids:  () => ipcRenderer.invoke('powerPlans:getStoredSCGuids'),
    applyOverride: (id, enabled) => {
      assertString(id, 'overrideId');
      return ipcRenderer.invoke('powerPlans:applyOverride', id, !!enabled);
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
  dns: {
    benchmark: () => ipcRenderer.invoke('dns:benchmark'),
    applyDns:  (ip) => {
      assertString(ip, 'ip');
      if (!IP_RE.test(ip)) throw new TypeError(`dns.applyDns: "${ip}" is not a valid IPv4 address`);
      return ipcRenderer.invoke('dns:applyDns', ip);
    },
  },
  cleaner: {
    scan: (itemIds) => {
      assertStringArray(itemIds, 'cleaner.scan itemIds');
      return ipcRenderer.invoke('cleaner:scan', itemIds);
    },
    clean: (itemIds) => {
      assertStringArray(itemIds, 'cleaner.clean itemIds');
      return ipcRenderer.invoke('cleaner:clean', itemIds);
    },
    verify: (itemIds) => {
      assertStringArray(itemIds, 'cleaner.verify itemIds');
      return ipcRenderer.invoke('cleaner:verify', itemIds);
    },
  },
  debloat: {
    scan: (items) => {
      assertStringArray(items, 'debloat.scan items');
      return ipcRenderer.invoke('debloat:scan', items);
    },
    removeItem: (item) => {
      assertPlainObject(item, 'debloat.removeItem item');
      if (typeof item.id !== 'string' || !item.id.trim()) throw new TypeError('debloat.removeItem: item.id must be a non-empty string');
      if (typeof item.type !== 'string' || !item.type.trim()) throw new TypeError('debloat.removeItem: item.type must be a non-empty string');
      return ipcRenderer.invoke('debloat:removeItem', item);
    },
    restoreItem: (item) => {
      assertPlainObject(item, 'debloat.restoreItem item');
      if (typeof item.id !== 'string' || !item.id.trim()) throw new TypeError('debloat.restoreItem: item.id must be a non-empty string');
      if (typeof item.type !== 'string' || !item.type.trim()) throw new TypeError('debloat.restoreItem: item.type must be a non-empty string');
      return ipcRenderer.invoke('debloat:restoreItem', item);
    },
    verifyItem: (item) => {
      assertPlainObject(item, 'debloat.verifyItem item');
      if (typeof item.id !== 'string' || !item.id.trim()) throw new TypeError('debloat.verifyItem: item.id must be a non-empty string');
      if (typeof item.type !== 'string' || !item.type.trim()) throw new TypeError('debloat.verifyItem: item.type must be a non-empty string');
      return ipcRenderer.invoke('debloat:verifyItem', item);
    },
  },
  installedApps: {
    scan: () => ipcRenderer.invoke('installedApps:scan'),
    icon: (appId) => {
      assertString(appId, 'appId');
      return ipcRenderer.invoke('installedApps:icon', appId);
    },
    uninstall: (app) => {
      assertPlainObject(app, 'installedApps.uninstall app');
      if (typeof app.name !== 'string' || !app.name.trim()) throw new TypeError('installedApps.uninstall: app.name must be a non-empty string');
      if (typeof app.type !== 'string' || !app.type.trim()) throw new TypeError('installedApps.uninstall: app.type must be a non-empty string');
      return ipcRenderer.invoke('installedApps:uninstall', app);
    },
  },
  // ── Driver Intelligence: detect + launch official vendor tools ──────────────
  driverApps: {
    detect: (appKey) => {
      assertString(appKey, 'appKey');
      return ipcRenderer.invoke('driverApps:detect', appKey);
    },
    launch: (appKey) => {
      assertString(appKey, 'appKey');
      return ipcRenderer.invoke('driverApps:launch', appKey);
    },
  },
  driverIntel: {
    getInstalledVersions: () => ipcRenderer.invoke('driverIntel:getInstalledVersions'),
  },
  startup: {
    scan: () => ipcRenderer.invoke('startup:scan'),
    setEnabled: (params) => {
      assertPlainObject(params, 'startup.setEnabled params');
      return ipcRenderer.invoke('startup:setEnabled', params);
    },
    setDelay: (params) => {
      assertPlainObject(params, 'startup.setDelay params');
      return ipcRenderer.invoke('startup:setDelay', params);
    },
    verifyState: (params) => {
      assertPlainObject(params, 'startup.verifyState params');
      return ipcRenderer.invoke('startup:verifyState', params);
    },
  },
  extremeLabs: {
    createRestorePoint: () => ipcRenderer.invoke('extremeLabs:createRestorePoint'),
    createBaseline:     () => ipcRenderer.invoke('extremeLabs:createBaseline'),
    analyze:            () => ipcRenderer.invoke('extremeLabs:analyze'),
    applySelected:      (ids) => {
      assertStringArray(ids, 'extremeLabs.applySelected ids');
      return ipcRenderer.invoke('extremeLabs:applySelected', ids);
    },
    restoreBaseline:    (ids) => {
      const safeIds = Array.isArray(ids) ? ids : [];
      assertStringArray(safeIds, 'extremeLabs.restoreBaseline ids');
      return ipcRenderer.invoke('extremeLabs:restoreBaseline', safeIds);
    },
    getStatus:          () => ipcRenderer.invoke('extremeLabs:getStatus'),
    checkAllStatus:     () => ipcRenderer.invoke('extremeLabs:checkAllStatus'),
  },
  premium: {
    revertAll:            () => ipcRenderer.invoke('premium:revertAll'),
    previewRevert:        () => ipcRenderer.invoke('premium:previewRevert'),
    getOwnership:         () => ipcRenderer.invoke('premium:getOwnership'),
    // Reads the disk-backed ownership store directly — survives clearPremiumOwnership()
    // on the client Zustand store. Use for the boot-time revert gate so that tweaks
    // that failed to revert in a prior session are still detected on next launch.
    hasAppOwned:          () => ipcRenderer.invoke('premium:hasAppOwned'),
    powerPlanSanityCheck: () => ipcRenderer.invoke('premium:powerPlanSanityCheck'),
    cleanupScPlans:       () => ipcRenderer.invoke('premium:cleanupScPlans'),
  },
  updater: {
    getState: () => ipcRenderer.invoke('updater:getState'),
    check:    () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install:  () => ipcRenderer.invoke('updater:install'),
    onEvent: (callback) => onEvent('updater:event', callback, {
      validate: (payload) => {
        if (!payload || typeof payload !== 'object') {
          if (!isProdBuild) console.warn('[preload] updater:event received malformed payload');
          return false;
        }
        return true;
      },
    }),
  },
  processControl: {
    scan:   () => ipcRenderer.invoke('processControl:scan'),
    buildPlan: (scanResult, profile) => {
      assertPlainObject(scanResult, 'processControl.buildPlan scanResult');
      if (!Array.isArray(scanResult.processes)) throw new TypeError('processControl.buildPlan: scanResult.processes must be an array');
      if (!ALLOWED_PC_PROFILES.has(profile)) throw new TypeError('processControl.buildPlan: profile must be "safe", "competitive", or "extreme"');
      return ipcRenderer.invoke('processControl:buildPlan', scanResult, profile);
    },
    applyPlan: (plan) => {
      assertPlainObject(plan, 'processControl.applyPlan plan');
      if (!ALLOWED_PC_PROFILES.has(plan.profile)) throw new TypeError('processControl.applyPlan: plan.profile must be "safe", "competitive", or "extreme"');
      if (!Array.isArray(plan.toStop)) throw new TypeError('processControl.applyPlan: plan.toStop must be an array');
      if (!Array.isArray(plan.toLowerPriority)) throw new TypeError('processControl.applyPlan: plan.toLowerPriority must be an array');
      return ipcRenderer.invoke('processControl:applyPlan', plan);
    },
    getLastResult: () => ipcRenderer.invoke('processControl:getLastResult'),
    restoreLast: () => ipcRenderer.invoke('processControl:restoreLast'),
    getProtectedList: () => ipcRenderer.invoke('processControl:getProtectedList'),
    terminate: (pid) => {
      if (!Number.isInteger(pid) || pid <= 0) throw new TypeError('processControl.terminate: pid must be a positive integer');
      return ipcRenderer.invoke('processControl:terminate', pid);
    },
  },
  latencyAnalyzer: {
    start:            () => ipcRenderer.invoke('latencyAnalyzer:start'),
    stop:             () => ipcRenderer.invoke('latencyAnalyzer:stop'),
    getSample:        () => ipcRenderer.invoke('latencyAnalyzer:getSample'),
    getStatus:        () => ipcRenderer.invoke('latencyAnalyzer:getStatus'),
    scanDrivers:      () => ipcRenderer.invoke('latencyAnalyzer:scanDrivers'),
    scanAudioDevices: () => ipcRenderer.invoke('latencyAnalyzer:scanAudioDevices'),
  },
  storage: {
    getVolumes: () => ipcRenderer.invoke('storage:getVolumes'),
    optimize: (driveLetter, type) => {
      assertString(driveLetter, 'driveLetter');
      if (!DRIVE_LETTER_RE.test(driveLetter)) {
        throw new TypeError(`storage.optimize: "${driveLetter}" is not a valid drive letter (expected e.g. "C" or "C:")`);
      }
      const ALLOWED_OPT_TYPES = new Set(['trim', 'defrag']);
      if (!ALLOWED_OPT_TYPES.has(type)) {
        throw new TypeError('storage.optimize: type must be "trim" or "defrag"');
      }
      return ipcRenderer.invoke('storage:optimize', driveLetter, type);
    },
  },
});
window.addEventListener('DOMContentLoaded', () => {
  console.log('[SwitchControl Desktop] Preload initialized - unified API ready');
  console.log('[SwitchControl Desktop] Platform:', process.platform);
});
