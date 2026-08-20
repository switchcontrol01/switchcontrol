'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  checkIsAdmin,
  runElevatedCommands,
} = require('./ps-shared');

const STATE_DIR = path.join(process.env.APPDATA || os.homedir(), 'SwitchControl');
const STATE_FILE = path.join(STATE_DIR, 'power-plans.json');

const BUILTIN_GUIDS = Object.freeze({
  balanced: '381b4222-f694-41f0-9685-ff5bb260df2e',
  high_performance: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  power_saver: 'a1841308-3541-4fab-bc81-f71556f20b4a',
  ultimate_performance: 'e9a42b02-d5df-448d-aa00-03f14749eb61',
});

const POWER_PROFILES = Object.freeze({
  balanced: { basePlan: 'balanced', scName: 'SwitchControl - Balanced', settings: {} },
  performance: {
    basePlan: 'high_performance',
    scName: 'SwitchControl - Performance',
    settings: { cpuMinPercent: 100, cpuMaxPercent: 100, turbo: 2 },
  },
  ultimate: {
    basePlan: 'ultimate_performance',
    scName: 'SwitchControl - Ultimate Performance',
    settings: { cpuMinPercent: 100, cpuMaxPercent: 100, turbo: 2 },
  },
  powersaver: {
    basePlan: 'power_saver',
    scName: 'SwitchControl - Power Saver',
    settings: { cpuMinPercent: 5, cpuMaxPercent: 100, turbo: 0 },
  },
});

const SETTING_DEFS = Object.freeze({
  cpuMinPercent: ['54533251-82be-4824-96c1-47b60b740d00', '893dee8e-2bef-41e0-89c6-b55d0929964c'],
  cpuMaxPercent: ['54533251-82be-4824-96c1-47b60b740d00', 'bc5038f7-23e0-4960-96da-33abaf5935ec'],
  turbo: ['54533251-82be-4824-96c1-47b60b740d00', 'be337238-0d82-4146-a960-4f3749d470c7'],
});

const BUILTIN_NAMES = {
  balanced: 'Balanced',
  high_performance: 'High performance',
  power_saver: 'Power saver',
  ultimate_performance: 'Ultimate Performance',
};

function unsupported() {
  return process.platform !== 'win32'
    ? { ok: false, unsupported: true, error: 'Power plans are only available on Windows.' }
    : null;
}

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadState() {
  try {
    ensureStateDir();
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveState(state) {
  try {
    ensureStateDir();
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch (error) {
    console.error('[PowerPlan] failed to persist state:', error.message);
  }
}

function runPowercfg(args, { timeout = 15000 } = {}) {
  const noWindows = unsupported();
  if (noWindows) return Promise.reject(new Error(noWindows.error));
  return new Promise((resolve, reject) => {
    execFile('powercfg.exe', args, { windowsHide: true, timeout }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message).trim();
        reject(new Error(detail || 'powercfg failed'));
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

function parseGuid(value) {
  const match = String(value || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0].toLowerCase() : null;
}

async function getActivePowerScheme() {
  const noWindows = unsupported();
  if (noWindows) return { success: false, ...noWindows };
  try {
    const output = await runPowercfg(['/getactivescheme']);
    const guid = parseGuid(output);
    return guid
      ? { success: true, scheme: { guid, name: output.replace(/.*\)\s*/s, '').trim() || guid } }
      : { success: false, error: 'powercfg returned no active scheme GUID.' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function listPowerSchemes() {
  const noWindows = unsupported();
  if (noWindows) return { success: false, ...noWindows, schemes: [] };
  try {
    const output = await runPowercfg(['/list']);
    const schemes = [];
    for (const line of output.split(/\r?\n/)) {
      const guid = parseGuid(line);
      if (!guid) continue;
      const name = line.replace(/.*\)\s*/, '').replace(/\s*\(Current\)\s*$/i, '').trim() || guid;
      schemes.push({ guid, name, active: /\(Current\)/i.test(line) });
    }
    return { success: true, schemes };
  } catch (error) {
    return { success: false, error: error.message, schemes: [] };
  }
}

async function getPowerPlanState() {
  const active = await getActivePowerScheme();
  if (!active.success) return active;
  const schemes = await listPowerSchemes();
  return { ...active, schemes: schemes.schemes || [], settings: {}, settingsErrors: schemes.success ? {} : { schemes: schemes.error } };
}

function commandForSetting(guid, key, value, mode) {
  const def = SETTING_DEFS[key];
  if (!def) return null;
  return `powercfg /set${mode}valueindex ${guid} ${def[0]} ${def[1]} ${Number(value)}`;
}

async function applyCommands(commands) {
  const noWindows = unsupported();
  if (noWindows) return noWindows;
  const isAdmin = await checkIsAdmin();
  if (isAdmin) {
    const failed = [];
    for (const command of commands) {
      try {
        const parts = command.trim().split(/\s+/);
        await runPowercfg(parts.slice(1));
      } catch (error) {
        failed.push({ command, error: error.message });
      }
    }
    return { ok: failed.length === 0, failed };
  }
  return runElevatedCommands(commands);
}

async function activatePlanByGuid(guid) {
  const normalized = parseGuid(guid);
  if (!normalized) return { ok: false, error: 'Invalid power-plan GUID.' };
  const active = await getActivePowerScheme();
  if (active.success && active.scheme.guid === normalized) return { ok: true, alreadyActive: true, changed: false };
  const result = await applyCommands([`powercfg /setactive ${normalized}`]);
  if (!result.ok) return { ok: false, error: result.error || 'Could not activate power plan.', failed: result.failed };
  const verified = await getActivePowerScheme();
  const ok = verified.success && verified.scheme.guid === normalized;
  return { ok, changed: true, verified: ok, error: ok ? undefined : 'Power plan activation could not be verified.' };
}

async function applyPowerProfile(profileId) {
  const profile = POWER_PROFILES[profileId];
  if (!profile) return { success: false, error: `Unknown profileId: ${profileId}` };
  const guid = BUILTIN_GUIDS[profile.basePlan];
  const commands = [];
  for (const mode of ['ac', 'dc']) {
    for (const [key, value] of Object.entries(profile.settings)) {
      const command = commandForSetting(guid, key, value, mode);
      if (command) commands.push(command);
    }
  }
  commands.push(`powercfg /setactive ${guid}`);
  const result = await applyCommands(commands);
  if (!result.ok) return { success: false, error: result.error || 'Power-plan commands failed.', failedSettings: result.failed };
  const activation = await activatePlanByGuid(guid);
  return { success: activation.ok, verified: activation.verified || activation.alreadyActive, profileId, failedSettings: result.failed || [] };
}

async function applyPowerProfileWithOwnership(profileId) {
  const before = await getActivePowerScheme();
  const result = await applyPowerProfile(profileId);
  if (result.success && before.success) {
    const state = loadState();
    state.originalSchemeGuid = before.scheme.guid;
    state.schemeGuids = state.schemeGuids || {};
    state.schemeGuids[profileId] = BUILTIN_GUIDS[POWER_PROFILES[profileId]?.basePlan];
    saveState(state);
  }
  return result;
}

function validateCustomPlanName(name) {
  return typeof name === 'string' && /^[\w .-]{3,50}$/.test(name.trim());
}

async function applyCustomPowerProfile(name, settings = {}) {
  if (!validateCustomPlanName(name)) return { success: false, error: 'Invalid power-plan name.' };
  const noWindows = unsupported();
  if (noWindows) return { success: false, ...noWindows };

  const baseGuid = BUILTIN_GUIDS.balanced;
  let customGuid;
  try {
    const duplicate = await runPowercfg(['/duplicatescheme', baseGuid]);
    customGuid = parseGuid(duplicate);
    if (!customGuid) return { success: false, error: 'Windows did not return a custom power-plan GUID.' };
    await runPowercfg(['/changename', customGuid, name.trim(), 'SwitchControl custom power plan']);
  } catch (error) {
    return { success: false, error: `Could not create custom power plan: ${error.message}` };
  }

  // AC is intentionally opt-in for the performance profile. DC values remain
  // inherited from the duplicated plan unless the caller explicitly requests
  // battery changes through applyDcSettings. This prevents laptop battery drain
  // and heat increases from an AC-focused optimization.
  const commands = [];
  const acSettings = {
    cpuMinPercent: Number(settings.minProcessorState) || 5,
    cpuMaxPercent: Number(settings.maxProcessorState) || 100,
    turbo: settings.enableTurboBoost ? 2 : 0,
  };
  for (const [key, value] of Object.entries(acSettings)) {
    const command = commandForSetting(customGuid, key, value, 'ac');
    if (command) commands.push(command);
  }
  if (settings.applyDcSettings === true) {
    for (const [key, value] of Object.entries(acSettings)) {
      const command = commandForSetting(customGuid, key, value, 'dc');
      if (command) commands.push(command);
    }
  }
  commands.push(`powercfg /setactive ${customGuid}`);
  const result = await applyCommands(commands);
  if (!result.ok) {
    return { success: false, error: result.error || 'Custom power-plan commands failed.', failedSettings: result.failed };
  }
  const active = await getActivePowerScheme();
  const verified = active.success && active.scheme.guid === customGuid;
  const state = loadState();
  state.schemeGuids = state.schemeGuids || {};
  state.schemeGuids[name.trim()] = customGuid;
  saveState(state);
  return {
    success: verified,
    verified,
    guid: customGuid,
    requestedName: name.trim(),
    dcChanged: settings.applyDcSettings === true,
    error: verified ? undefined : 'Custom power plan activation could not be verified.',
  };
}

function getCustomPlanMeta() {
  const state = loadState();
  return { schemeGuids: state.schemeGuids || {}, originalSchemeGuid: state.originalSchemeGuid || null };
}

async function deleteAllScPlans() {
  const state = loadState();
  state.schemeGuids = {};
  saveState(state);
  return { success: true, deleted: [] };
}

async function verifyRevertClean() {
  const active = await getActivePowerScheme();
  const state = loadState();
  const original = parseGuid(state.originalSchemeGuid);
  return { success: active.success, clean: !original || (active.scheme && active.scheme.guid === original), activeScheme: active.scheme };
}

async function restoreBuiltinPlanNames() {
  return { success: true, skipped: true, reason: 'Built-in names are not modified by SwitchControl.' };
}

async function listSchemesForFrontend() {
  return listPowerSchemes();
}

function getStoredSchemeGuids() {
  return loadState().schemeGuids || {};
}

module.exports = {
  POWER_PROFILES,
  BUILTIN_GUIDS,
  getPowerPlanState,
  applyPowerProfile,
  applyPowerProfileWithOwnership,
  applyCustomPowerProfile,
  getCustomPlanMeta,
  activatePlanByGuid,
  listSchemesForFrontend,
  getActivePowerScheme,
  getStoredSchemeGuids,
  deleteAllScPlans,
  verifyRevertClean,
  restoreBuiltinPlanNames,
  runElevatedCommands,
};