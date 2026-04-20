const path = require('path');
const fs   = require('fs');
const { APPDATA_DIR, CONFIG_FILE } = require('./user-data-paths');

/**
 * config-store.js
 *
 * Key/value store for user configuration (API keys, UI secrets, etc.).
 * Backed by sc-config.json in %APPDATA%\SwitchControl\.
 *
 * init() is optional — without it the store falls back to the APPDATA_DIR
 * constant from user-data-paths.js so the store is always functional.
 * When main.js calls init(app.getPath('userData')) it resolves to the same
 * directory (%APPDATA%\SwitchControl) on Windows.
 *
 * Storage location: %APPDATA%\SwitchControl\sc-config.json
 * Survives NSIS uninstall: YES (NSIS only removes the install directory).
 */

let _configFilePath = CONFIG_FILE;

function init(userDataPath) {
  if (userDataPath && typeof userDataPath === 'string') {
    _configFilePath = path.join(userDataPath, 'sc-config.json');
  }
  console.log('[ConfigStore] Initialized — file:', _configFilePath);
}

function ensureDir() {
  const dir = path.dirname(_configFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readConfig() {
  try {
    ensureDir();
    if (!fs.existsSync(_configFilePath)) return {};
    const raw = fs.readFileSync(_configFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    // Guard: must be a plain object (not array, null, number, or string)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('[ConfigStore] Stored config is not a plain object — discarding and returning {}');
      return {};
    }
    return parsed;
  } catch (e) {
    console.warn('[ConfigStore] Failed to read config — returning {}:', e.message);
    return {};
  }
}

function writeConfig(data) {
  try {
    ensureDir();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError('writeConfig: data must be a plain object');
    }
    fs.writeFileSync(_configFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[ConfigStore] Failed to write config:', e.message);
    throw e;
  }
}

function get(key) {
  const val = readConfig()[key];
  return (val !== undefined && val !== null && val !== '') ? val : null;
}

function set(key, value) {
  const config = readConfig();
  if (value === null || value === undefined || value === '') {
    delete config[key];
  } else {
    config[key] = value;
  }
  writeConfig(config);
}

function del(key) {
  const config = readConfig();
  delete config[key];
  writeConfig(config);
}

function getPresenceMap() {
  const config = readConfig();
  const result = {};
  for (const k of Object.keys(config)) {
    result[k] = !!(config[k]);
  }
  return result;
}

module.exports = { init, get, set, del, readConfig, getPresenceMap };
