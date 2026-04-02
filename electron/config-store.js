const path = require('path');
const fs = require('fs');

let _userDataPath = null;

function init(userDataPath) {
  _userDataPath = userDataPath;
  console.log('[ConfigStore] Initialized with userData:', userDataPath);
}

function getConfigPath() {
  if (!_userDataPath) {
    console.warn('[ConfigStore] Not initialized — no userData path set');
    return null;
  }
  return path.join(_userDataPath, 'sc-config.json');
}

function readConfig() {
  try {
    const p = getConfigPath();
    if (!p || !fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[ConfigStore] Failed to read config:', e.message);
    return {};
  }
}

function writeConfig(data) {
  try {
    const p = getConfigPath();
    if (!p) throw new Error('userData path not set');
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
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
