'use strict';

// Canonical identity and command parameters for the curated Debloater.
// Plain CommonJS is intentional: this file is shipped inside the Electron app.

const appx = {
  teams_consumer: 'MicrosoftTeams',
  feedback_hub: 'Microsoft.WindowsFeedbackHub',
  people_app: 'Microsoft.People',
  solitaire: 'Microsoft.MicrosoftSolitaireCollection',
  tips_app: 'Microsoft.Getstarted',
  bing_weather: 'Microsoft.BingWeather',
  maps_app: 'Microsoft.WindowsMaps',
  cortana: 'Microsoft.549981C3F5F10',
  xbox_gamebar: 'Microsoft.XboxGamingOverlay',
  mixed_reality: 'Microsoft.MixedReality.Portal',
  bing_news: 'Microsoft.BingNews',
  ms_todo: 'Microsoft.Todos',
  clipchamp: 'Clipchamp.Clipchamp',
  ms_family: 'MicrosoftCorporationII.MicrosoftFamily',
  ms_whiteboard: 'Microsoft.Whiteboard',
  power_automate: 'Microsoft.PowerAutomateDesktop',
  voice_recorder: 'Microsoft.WindowsSoundRecorder',
  xbox_identity_provider: 'Microsoft.XboxIdentityProvider',
  xbox_game_speech: 'Microsoft.XboxGameSpeech',
  xbox_tcui: 'Microsoft.Xbox.TCUI',
  phone_link: 'Microsoft.YourPhone',
  paint_3d: 'Microsoft.MSPaint',
  ms_3d_viewer: 'Microsoft.Microsoft3DViewer',
  skype: 'Microsoft.SkypeApp',
};

const registry = {
  advertising_id: { regPath: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', regName: 'Enabled', disabled: 0, defaultValue: 1 },
  activity_history: { regPath: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', regName: 'PublishUserActivities', disabled: 0, defaultValue: 1 },
  start_suggestions: { regPath: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', regName: 'SystemPaneSuggestionsEnabled', disabled: 0, defaultValue: 1 },
  lock_screen_ads: { regPath: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', regName: 'RotatingLockScreenOverlayEnabled', disabled: 0, defaultValue: 1 },
  copilot: { regPath: 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', regName: 'TurnOffWindowsCopilot', disabled: 1, defaultValue: 0 },
  widgets: { regPath: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Dsh', regName: 'AllowNewsAndInterests', disabled: 0, defaultValue: 1 },
  chat_icon: { regPath: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', regName: 'TaskbarMn', disabled: 0, defaultValue: 1 },
  start_recommendations: { regPath: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer', regName: 'HideRecommendedSection', disabled: 1, defaultValue: 0 },
  tips_notifications: { regPath: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', regName: 'SoftLandingEnabled', disabled: 0, defaultValue: 1 },
  get_more_windows: { regPath: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\UserProfileEngagement', regName: 'ScoobeSystemSettingEnabled', disabled: 0, defaultValue: 1 },
  ceip_registry: { regPath: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\SQMClient\\Windows', regName: 'CEIPEnable', disabled: 0, defaultValue: 1 },
};

const services = {
  diagtrack: { serviceName: 'DiagTrack', defaultStartType: 'Automatic' },
  sysmain: { serviceName: 'SysMain', defaultStartType: 'Automatic' },
  delivery_optimization: { serviceName: 'DoSvc', defaultStartType: 'Automatic' },
  fax_service: { serviceName: 'Fax', defaultStartType: 'Manual' },
  geolocation_service: { serviceName: 'lfsvc', defaultStartType: 'Manual' },
  error_reporting: { serviceName: 'WerSvc', defaultStartType: 'Manual' },
  maps_broker: { serviceName: 'MapsBroker', defaultStartType: 'Automatic' },
  windows_search: { serviceName: 'WSearch', defaultStartType: 'DelayedAuto' },
  connected_devices_platform: { serviceName: 'CDPSvc', defaultStartType: 'Automatic' },
  print_spooler: { serviceName: 'Spooler', defaultStartType: 'Automatic' },
  remote_registry: { serviceName: 'RemoteRegistry', defaultStartType: 'Manual' },
  win_remote_mgmt: { serviceName: 'WinRM', defaultStartType: 'Manual' },
  xbox_live_auth: { serviceName: 'XblAuthManager', defaultStartType: 'Manual' },
  xbox_live_gamesave: { serviceName: 'XblGameSave', defaultStartType: 'Manual' },
  xbox_live_network: { serviceName: 'XboxNetApiSvc', defaultStartType: 'Manual' },
  windows_insider_svc: { serviceName: 'wisvc', defaultStartType: 'Manual' },
  retail_demo: { serviceName: 'RetailDemo', defaultStartType: 'Manual' },
};

const telemetryTaskPaths = [
  '\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser',
  '\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip',
  '\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector',
  '\\Microsoft\\Windows\\Feedback\\Siuf\\DmClient',
  '\\Microsoft\\Windows\\Feedback\\Siuf\\DmClientOnScenarioDownload',
];

const contracts = {};
for (const [id, packageName] of Object.entries(appx)) contracts[id] = { id, type: 'appx', packageName, restoreSupported: id !== 'mixed_reality' };
for (const [id, values] of Object.entries(registry)) contracts[id] = { id, type: 'registry', ...values, restoreSupported: true };
for (const [id, values] of Object.entries(services)) contracts[id] = { id, type: 'service', ...values, restoreSupported: true };
contracts.telemetry_tasks = { id: 'telemetry_tasks', type: 'task', taskPaths: telemetryTaskPaths, restoreSupported: true };

const ALLOWED_TYPES = new Set(['appx', 'registry', 'service', 'task']);
const ALLOWED_START_TYPES = new Set(['Automatic', 'AutomaticDelayedStart', 'DelayedAuto', 'Manual', 'Disabled']);

function sameArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameValue(a, b) {
  return typeof a === 'number' && typeof b === 'number' ? Number.isFinite(a) && a === b : a === b;
}

function getCanonicalContract(id) {
  return typeof id === 'string' ? contracts[id] || null : null;
}

function validateItemPayload(item, action = 'remove') {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Invalid item payload.';
  const contract = getCanonicalContract(item.id);
  if (!contract) return 'Unknown Debloater item.';
  if (!ALLOWED_TYPES.has(item.type) || item.type !== contract.type) return 'Debloater item type does not match its canonical identity.';
  if (action === 'restore' && (item.restoreSupported !== true || contract.restoreSupported !== true)) return 'Item does not support restore.';
  if (contract.type === 'appx' && item.packageName !== contract.packageName) return 'Package identity does not match the catalog.';
  if (contract.type === 'registry') {
    if (item.regPath !== contract.regPath || item.regName !== contract.regName) return 'Registry identity does not match the catalog.';
    const expected = action === 'restore' ? contract.defaultValue : contract.disabled;
    const actual = action === 'restore' ? item.regValueDefault : action === 'scan' ? item.expectedDisabledValue : item.regValueDisabled;
    if (!sameValue(actual, expected)) return 'Registry value does not match the catalog.';
  }
  if (contract.type === 'service') {
    if (item.serviceName !== contract.serviceName) return 'Service identity does not match the catalog.';
    if (action === 'restore' && item.defaultStartType !== contract.defaultStartType) return 'Service restore value does not match the catalog.';
  }
  if (contract.type === 'task' && !sameArray(item.taskPaths, contract.taskPaths)) return 'Scheduled task paths do not match the catalog.';
  return null;
}

function getCanonicalItemIds() {
  return Object.keys(contracts);
}

module.exports = { ALLOWED_START_TYPES, contracts, getCanonicalContract, getCanonicalItemIds, validateItemPayload };