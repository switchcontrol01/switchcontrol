'use strict';
const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ── Storage ───────────────────────────────────────────────────────────────────

const STATE_DIR  = path.join(process.env.APPDATA || os.homedir(), 'SwitchControl');
const STATE_FILE = path.join(STATE_DIR, 'power-plans.json');

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadState() {
  try {
    ensureDir();
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveState(state) {
  try {
    ensureDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[PowerPlan] saveState failed:', e.message);
  }
}

// ── Windows GUIDs ─────────────────────────────────────────────────────────────

const BUILTIN_GUIDS = {
  balanced:             '381b4222-f694-41f0-9685-ff5bb260df2e',
  high_performance:     '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  power_saver:          'a1841308-3541-4fab-bc81-f71556f20b4a',
  ultimate_performance: 'e9a42b02-d5df-448d-aa00-03f14749eb61',
};

// subgroup + setting GUIDs for every managed property
const SETTING_DEFS = {
  cpuMinPercentAC: {
    subgroup: '54533251-82be-4824-96c1-47b60b740d00',
    setting:  '893dee8e-2bef-41e0-89c6-b55d0929964c',
    label:    'Min CPU State',
    fmt:      (v) => v >= 100 ? 'Fixed at maximum' : v <= 5 ? 'Minimal idle floor' : `${v}% minimum`,
  },
  cpuMaxPercentAC: {
    subgroup: '54533251-82be-4824-96c1-47b60b740d00',
    setting:  'bc5038f7-23e0-4960-96da-33abaf5935ec',
    label:    'Max CPU State',
    fmt:      (v) => v >= 100 ? 'Uncapped' : `Capped at ${v}%`,
  },
  coreParkingMinCoresAC: {
    subgroup: '54533251-82be-4824-96c1-47b60b740d00',
    setting:  '0cc5b647-c1df-4637-891a-dec35c318583',
    label:    'Core Parking',
    fmt:      (v) => v >= 100 ? 'No parking allowed' : v <= 25 ? 'Aggressive parking' : 'Minimal parking allowed',
  },
  perfBoostModeAC: {
    subgroup: '54533251-82be-4824-96c1-47b60b740d00',
    setting:  'be337238-0d82-4146-a960-4f3749d470c7',
    label:    'CPU Boost Mode',
    fmt:      (v) => ({ 0: 'Disabled', 1: 'Enabled', 2: 'Aggressive', 3: 'Efficient enabled', 4: 'Efficient aggressive' })[v] ?? `Mode ${v}`,
  },
  usbSelectiveSuspendAC: {
    subgroup: '2a737441-1930-4402-8d77-b2bebba308a3',
    setting:  '48e6b7a6-50f5-4782-a5d4-53bb8f07e226',
    label:    'USB Selective Suspend',
    fmt:      (v) => v === 0 ? 'Disabled' : 'Enabled',
  },
  pcieAspmAC: {
    subgroup: '501a4d13-42af-4429-9fd1-a8218c268e20',
    setting:  'ee12f906-d277-404b-b6da-e5fa1a576df5',
    label:    'PCIe ASPM',
    fmt:      (v) => v === 0 ? 'Off (max performance)' : v === 1 ? 'Moderate' : 'Maximum saving',
  },
  sleepAfterAC: {
    subgroup: '238c9fa8-0aad-41ed-83f4-97be242c8f20',
    setting:  '29f6c1db-86da-48c5-9fdb-f2b67b1f44da',
    label:    'Sleep Timeout',
    fmt:      (v) => v === 0 ? 'Never' : v < 120 ? `${v}s` : `After ${Math.round(v / 60)} min`,
  },
  hibernateAfterAC: {
    subgroup: '238c9fa8-0aad-41ed-83f4-97be242c8f20',
    setting:  '9d7815a6-7ee4-497e-8888-515a05f02364',
    label:    'Hibernate Timeout',
    fmt:      (v) => v === 0 ? 'Never' : `After ${Math.round(v / 60)} min`,
  },
  displayOffAfterAC: {
    subgroup: '7516b95f-f776-4464-8c53-06167f40cc99',
    setting:  '3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e',
    label:    'Display Off',
    fmt:      (v) => v === 0 ? 'Never' : v < 120 ? `${v}s` : `After ${Math.round(v / 60)} min`,
  },
};

// ── Preset profile definitions ────────────────────────────────────────────────
// perfBoostModeAC: 0=Disabled 1=Enabled 2=Aggressive 3=EfficientEnabled 4=EfficientAggressive

const POWER_PROFILES = {
  maximum_performance: {
    id: 'maximum_performance',
    name: 'Maximum Performance',
    basePlan: 'high_performance',
    scName: 'SwitchControl - Max Performance',
    scDesc: 'Full CPU at all times, USB/PCIe power saving off, no sleep. Optimised for gaming and low-latency workloads.',
    settings: {
      cpuMinPercentAC:       100,
      cpuMaxPercentAC:       100,
      coreParkingMinCoresAC: 100,
      perfBoostModeAC:       2,
      usbSelectiveSuspendAC: 0,
      pcieAspmAC:            0,
      sleepAfterAC:          0,
      hibernateAfterAC:      0,
      displayOffAfterAC:     0,
    },
  },
  balanced_gaming: {
    id: 'balanced_gaming',
    name: 'Balanced Gaming',
    basePlan: 'balanced',
    scName: 'SwitchControl - Balanced Gaming',
    scDesc: 'Dynamic CPU scaling with aggressive boost, cores always unparked. Good balance of performance and temperature.',
    settings: {
      cpuMinPercentAC:       5,
      cpuMaxPercentAC:       100,
      coreParkingMinCoresAC: 100,
      perfBoostModeAC:       4,
      usbSelectiveSuspendAC: 0,
      pcieAspmAC:            0,
      sleepAfterAC:          0,
      hibernateAfterAC:      1800,
      displayOffAfterAC:     0,
    },
  },
  efficiency_laptop: {
    id: 'efficiency_laptop',
    name: 'Efficiency / Laptop',
    basePlan: 'balanced',
    scName: 'SwitchControl - Efficiency',
    scDesc: 'CPU capped at 85%, core parking and PCIe saving enabled. Extends battery life on laptops.',
    settings: {
      cpuMinPercentAC:       5,
      cpuMaxPercentAC:       85,
      coreParkingMinCoresAC: 25,
      perfBoostModeAC:       3,
      usbSelectiveSuspendAC: 1,
      pcieAspmAC:            2,
      sleepAfterAC:          900,
      hibernateAfterAC:      1800,
      displayOffAfterAC:     300,
    },
  },
};

// ── Low-level helpers ─────────────────────────────────────────────────────────

function runPowercfg(...args) {
  return new Promise((resolve, reject) => {
    execFile('powercfg', args, { timeout: 15_000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || stdout?.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    const wrapped = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; try{${command};exit 0}catch{Write-Error $_.Exception.Message;exit 1}`;
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', wrapped],
      { timeout: 20_000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr?.trim() || stdout?.trim() || err.message));
        else resolve(stdout.trim());
      }
    );
  });
}

let _isAdmin = null;
async function checkIsAdmin() {
  if (_isAdmin !== null) return _isAdmin;
  try {
    const out = await runPowerShell(
      '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'
    );
    _isAdmin = out.trim().toLowerCase() === 'true';
  } catch { _isAdmin = false; }
  return _isAdmin;
}

// Run multiple powercfg commands via UAC-elevated PowerShell (same pattern as tweak-executor)
async function runElevatedCommands(commands) {
  const tmpDir     = os.tmpdir();
  const scriptId   = `sc_pp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const scriptPath = path.join(tmpDir, `${scriptId}.ps1`);
  const resultPath = path.join(tmpDir, `${scriptId}_result.json`);

  const safeResultPath = resultPath.replace(/'/g, "''");
  const safeScriptPath = scriptPath.replace(/'/g, "''");

  const lines = [
    `$ErrorActionPreference = 'Continue'`,
    `$failed = @()`,
    ...commands.map(cmd =>
      `try { & ${cmd} 2>&1 | Out-Null } catch { $failed += '${cmd.replace(/'/g, "''")}' }`
    ),
    `$r = @{ ok = $true; failed = $failed }`,
    `try { [System.IO.File]::WriteAllText('${safeResultPath}', ($r | ConvertTo-Json -Compress)) } catch { $r | ConvertTo-Json -Compress | Out-File -FilePath '${safeResultPath}' -Encoding ascii -Force }`,
  ];

  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8');
  console.log(`[PowerPlan] runElevated: scriptPath="${scriptPath}" commands=${commands.length}`);

  const launchCmd = `Start-Process powershell -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File','${safeScriptPath}') -Verb RunAs -Wait`;
  try {
    await new Promise((resolve, reject) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', launchCmd],
        { timeout: 120_000, windowsHide: true },
        (err) => { err ? reject(err) : resolve(); }
      );
    });

    const deadline = Date.now() + 5000;
    while (!fs.existsSync(resultPath) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    if (fs.existsSync(resultPath)) {
      const raw = fs.readFileSync(resultPath, 'utf8').replace(/^\uFEFF/, '').trim();
      console.log(`[PowerPlan] runElevated result: "${raw}"`);
      try { return JSON.parse(raw); } catch { return { ok: false, error: `Bad result JSON: ${raw.slice(0, 100)}` }; }
    }
    return { ok: false, error: 'Result file not produced after 5s — elevated script may have crashed.' };
  } catch (err) {
    const msg = err?.message || String(err);
    if (/cancel|denied|elevat|access|uac/i.test(msg) || err?.code === 1) {
      return { ok: false, cancelled: true, error: 'Admin permission was canceled. No system changes were made.' };
    }
    return { ok: false, error: `Elevation failed: ${msg}` };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
    try { fs.unlinkSync(resultPath); } catch {}
  }
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseSchemeList(output) {
  const schemes = [];
  for (const line of output.split('\n')) {
    const m = line.match(/Power Scheme GUID:\s*([0-9a-f-]{36})\s+\(([^)]+)\)\s*(\*)?/i);
    if (m) schemes.push({ guid: m[1].toLowerCase(), name: m[2].trim(), isActive: !!m[3] });
  }
  return schemes;
}

function parseActiveScheme(output) {
  const m = output.match(/Power Scheme GUID:\s*([0-9a-f-]{36})\s+\(([^)]+)\)/i);
  return m ? { guid: m[1].toLowerCase(), name: m[2].trim() } : null;
}

function parseAcValue(output) {
  const m = output.match(/Current AC Power Setting Index:\s*(0x[0-9a-fA-F]+|\d+)/i);
  if (!m) return null;
  const raw = m[1];
  return raw.startsWith('0x') ? parseInt(raw, 16) : parseInt(raw, 10);
}

// ── Core operations ───────────────────────────────────────────────────────────

async function listPowerSchemes() {
  try {
    const out = await runPowercfg('/list');
    return { success: true, schemes: parseSchemeList(out) };
  } catch (e) {
    return { success: false, error: e.message, schemes: [] };
  }
}

async function getActivePowerScheme() {
  try {
    const out = await runPowercfg('/getactivescheme');
    const scheme = parseActiveScheme(out);
    if (!scheme) return { success: false, error: 'Could not parse active scheme output', scheme: null };
    return { success: true, scheme };
  } catch (e) {
    return { success: false, error: e.message, scheme: null };
  }
}

async function readAllSettings(schemeGuid) {
  const settings = {};
  const errors   = {};
  for (const [key, def] of Object.entries(SETTING_DEFS)) {
    try {
      const out = await runPowercfg('/query', schemeGuid, def.subgroup, def.setting);
      const val = parseAcValue(out);
      settings[key] = val;
    } catch (e) {
      errors[key]   = e.message;
      settings[key] = null;
    }
  }
  return { settings, errors };
}

function generateBreakdown(settings) {
  const get = (key) => {
    const v = settings[key];
    return v !== null && v !== undefined ? SETTING_DEFS[key]?.fmt(v) ?? String(v) : null;
  };

  const minPct = settings.cpuMinPercentAC;
  const maxPct = settings.cpuMaxPercentAC;

  return {
    cpuBoost:            get('perfBoostModeAC')           ?? 'Unknown',
    cpuRange:            (minPct !== null && maxPct !== null) ? `${minPct}% – ${maxPct}%` : 'Unknown',
    coreParking:         get('coreParkingMinCoresAC')     ?? 'Unknown',
    sleepHibernate:      settings.sleepAfterAC === 0 ? 'Sleep disabled'
                           : settings.sleepAfterAC != null ? `After ${Math.round(settings.sleepAfterAC / 60)} min`
                           : 'Unknown',
    usbPowerSaving:      get('usbSelectiveSuspendAC')     ?? 'Unknown',
    frequencyScaling:    (maxPct === 100 && minPct === 100) ? 'Fixed at maximum' : 'Dynamic based on demand',
    pciePower:           get('pcieAspmAC')                ?? 'Unknown',
    displayTimeout:      get('displayOffAfterAC')         ?? 'Unknown',
  };
}

function matchProfileToPreset(activeGuid, settings) {
  // First: check GUID match against known builtin + stored SC GUIDs
  const storedState = loadState();
  const guidMap = storedState.schemeGuids || {};
  for (const [profileId, guid] of Object.entries(guidMap)) {
    if (guid && guid.toLowerCase() === activeGuid) {
      // Validate settings still match
      const profile = POWER_PROFILES[profileId];
      if (!profile) continue;
      const keys = Object.keys(profile.settings).filter(k => settings[k] !== null && settings[k] !== undefined);
      const matches = keys.filter(k => settings[k] === profile.settings[k]).length;
      if (keys.length > 0 && matches / keys.length >= 0.85) {
        const mismatches = {};
        keys.filter(k => settings[k] !== profile.settings[k]).forEach(k => {
          mismatches[k] = { expected: profile.settings[k], actual: settings[k] };
        });
        return { match: matches === keys.length ? 'exact_match' : 'close_match', profileId, mismatches };
      }
    }
  }

  // Fall back to settings-based matching
  let bestProfileId = null;
  let bestScore = 0;
  let bestMismatches = null;

  for (const [profileId, profile] of Object.entries(POWER_PROFILES)) {
    const keys = Object.keys(profile.settings).filter(k => settings[k] !== null && settings[k] !== undefined);
    if (keys.length === 0) continue;
    const matches = keys.filter(k => settings[k] === profile.settings[k]).length;
    const score = matches / keys.length;
    if (score > bestScore) {
      bestScore = score;
      bestProfileId = profileId;
      const m = {};
      keys.filter(k => settings[k] !== profile.settings[k]).forEach(k => {
        m[k] = { expected: profile.settings[k], actual: settings[k] };
      });
      bestMismatches = m;
    }
  }

  if (bestScore >= 1.0)  return { match: 'exact_match',  profileId: bestProfileId, mismatches: {} };
  if (bestScore >= 0.7)  return { match: 'close_match',  profileId: bestProfileId, mismatches: bestMismatches };
  return { match: 'custom_modified', profileId: null, mismatches: {} };
}

// Get or create a SwitchControl-managed scheme for the given profile.
// Returns the GUID to use (string) or throws.
async function ensureSwitchControlScheme(profileId) {
  const profile = POWER_PROFILES[profileId];
  if (!profile) throw new Error(`Unknown profileId: ${profileId}`);

  const state = loadState();
  const existingGuid = state.schemeGuids?.[profileId];

  if (existingGuid) {
    // Confirm it still exists
    const listResult = await listPowerSchemes();
    if (listResult.schemes.some(s => s.guid === existingGuid.toLowerCase())) {
      console.log(`[PowerPlan] Reusing existing SC scheme "${existingGuid}" for ${profileId}`);
      // Refresh name & description in case they changed
      try {
        await runPowercfg('/changename', existingGuid.toLowerCase(), profile.scName, profile.scDesc || 'SwitchControl managed power plan');
      } catch { /* non-critical, ignore */ }
      return existingGuid.toLowerCase();
    }
    console.warn(`[PowerPlan] Stored GUID ${existingGuid} no longer exists — will recreate`);
  }

  // Need to duplicate the base plan (requires admin)
  const baseGuid = await resolveBasePlanGuid(profile.basePlan);
  const isAdminNow = await checkIsAdmin();
  let newGuid = null;

  if (isAdminNow) {
    // Run directly — no elevation needed, no window flash
    try {
      const dupOut = await runPowercfg('/duplicatescheme', baseGuid);
      const m = dupOut.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (m) {
        newGuid = m[0].toLowerCase();
        try {
          await runPowercfg('/changename', newGuid, profile.scName, profile.scDesc || 'SwitchControl managed power plan');
        } catch { /* non-critical */ }
        console.log(`[PowerPlan] Admin: duplicated scheme "${newGuid}" for ${profileId}`);
      }
    } catch (e) {
      console.warn(`[PowerPlan] Admin direct duplicate failed — ${e.message}`);
    }
  } else {
    const resultPath = path.join(os.tmpdir(), `sc_pp_dup_${Date.now()}.txt`);
    const safeResultPath = resultPath.replace(/'/g, "''");
    const safeScName = profile.scName.replace(/'/g, "''");
    const safeScDesc = (profile.scDesc || 'SwitchControl managed power plan').replace(/'/g, "''");

    const commands = [
      `$out = (& powercfg /duplicatescheme ${baseGuid} 2>&1) -join ''`,
      `$m = [regex]::Match($out, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')`,
      `if ($m.Success) { $guid = $m.Value; & powercfg /changename $guid '${safeScName}' '${safeScDesc}'; [System.IO.File]::WriteAllText('${safeResultPath}', $guid) }`,
    ];

    await runElevatedCommands(commands);

    const deadline = Date.now() + 3000;
    while (!fs.existsSync(resultPath) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    if (fs.existsSync(resultPath)) {
      newGuid = fs.readFileSync(resultPath, 'utf8').replace(/^\uFEFF/, '').trim().toLowerCase();
      try { fs.unlinkSync(resultPath); } catch {}
    }
  }

  if (!newGuid || !/^[0-9a-f-]{36}$/.test(newGuid)) {
    // Fallback: use built-in base plan directly
    console.warn(`[PowerPlan] Could not create duplicate scheme — falling back to base plan GUID ${baseGuid}`);
    newGuid = baseGuid;
  }

  // Persist
  const newState = { ...state, schemeGuids: { ...(state.schemeGuids || {}), [profileId]: newGuid } };
  saveState(newState);
  console.log(`[PowerPlan] Saved SC scheme "${newGuid}" for ${profileId}`);
  return newGuid;
}

async function resolveBasePlanGuid(basePlan) {
  // Check if ultimate performance is available
  if (basePlan === 'ultimate_performance') {
    const listResult = await listPowerSchemes();
    const hasUltimate = listResult.schemes.some(s => s.guid === BUILTIN_GUIDS.ultimate_performance);
    if (!hasUltimate) {
      console.log('[PowerPlan] Ultimate Performance not available, falling back to High Performance');
      basePlan = 'high_performance';
    }
  }
  return BUILTIN_GUIDS[basePlan] || BUILTIN_GUIDS.balanced;
}

// ── Main API ──────────────────────────────────────────────────────────────────

async function applyPowerProfile(profileId) {
  const profile = POWER_PROFILES[profileId];
  if (!profile) return { success: false, error: `Unknown profileId: ${profileId}` };

  console.log(`[PowerPlan] applyPowerProfile: ${profileId}`);

  let schemeGuid;
  try {
    schemeGuid = await ensureSwitchControlScheme(profileId);
  } catch (e) {
    return { success: false, error: `Could not prepare power scheme: ${e.message}` };
  }

  // Build powercfg commands for all settings
  const settingCmds = [];
  for (const [key, value] of Object.entries(profile.settings)) {
    const def = SETTING_DEFS[key];
    if (!def) continue;
    settingCmds.push(`powercfg /setacvalueindex ${schemeGuid} ${def.subgroup} ${def.setting} ${value}`);
    settingCmds.push(`powercfg /setdcvalueindex ${schemeGuid} ${def.subgroup} ${def.setting} ${value}`);
  }
  settingCmds.push(`powercfg /setactive ${schemeGuid}`);

  const isAdmin = await checkIsAdmin();
  let applyResult = { ok: true, failed: [] };

  if (isAdmin) {
    // Run directly (no UAC needed)
    const failed = [];
    for (const cmd of settingCmds) {
      try {
        const args = cmd.split(' ').slice(1); // remove "powercfg"
        await runPowercfg(...args);
      } catch (e) {
        failed.push(cmd);
        console.error(`[PowerPlan] Direct cmd failed: ${cmd} — ${e.message}`);
      }
    }
    applyResult = { ok: true, failed };
  } else {
    applyResult = await runElevatedCommands(settingCmds);
    if (applyResult.cancelled) {
      return { success: false, cancelled: true, error: 'Admin permission was canceled. No system changes were made.' };
    }
    if (!applyResult.ok) {
      return { success: false, error: applyResult.error || 'Elevation failed.' };
    }
  }

  // Verify
  const [activeResult, settingsResult] = await Promise.all([
    getActivePowerScheme(),
    readAllSettings(schemeGuid),
  ]);

  const settings     = settingsResult.settings;
  const breakdown    = generateBreakdown(settings);
  const profileMatch = matchProfileToPreset(activeResult.scheme?.guid ?? '', settings);

  const failedSettings = applyResult.failed ?? [];
  const success = activeResult.scheme?.guid === schemeGuid.toLowerCase() && profileMatch.match !== 'custom_modified';

  console.log(`[PowerPlan] applyPowerProfile result: success=${success} match=${profileMatch.match} failedSettings=${failedSettings.length}`);

  return {
    success,
    verified:        success,
    profileId,
    activeScheme:    activeResult.scheme,
    settings,
    breakdown,
    profileMatch,
    failedSettings,
    settingsErrors:  settingsResult.errors,
  };
}

async function getPowerPlanState() {
  try {
    const activeResult = await getActivePowerScheme();
    if (!activeResult.success || !activeResult.scheme) {
      return { success: false, error: activeResult.error || 'Could not read active power scheme' };
    }

    const schemeGuid  = activeResult.scheme.guid;
    const { settings, errors } = await readAllSettings(schemeGuid);
    const breakdown   = generateBreakdown(settings);
    const profileMatch = matchProfileToPreset(schemeGuid, settings);

    return {
      success:      true,
      activeScheme: activeResult.scheme,
      settings,
      breakdown,
      profileMatch,
      settingsErrors: errors,
    };
  } catch (e) {
    console.error('[PowerPlan] getPowerPlanState error:', e.message);
    return { success: false, error: e.message };
  }
}

async function listSchemesForFrontend() {
  const result = await listPowerSchemes();
  return result;
}

// ── Low-level plan activation ─────────────────────────────────────────────────

/**
 * Activate a power plan by exact GUID.
 * Used by the premium-expiry revert pipeline to restore the user's original plan.
 *
 * @param {string} guid — must pass UUID format check
 * @returns {{ success, activeScheme?, error? }}
 */
async function activatePlanByGuid(guid) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guid || !UUID_RE.test(guid.trim())) {
    return { success: false, error: `Invalid GUID: ${guid}` };
  }
  const cleanGuid = guid.trim().toLowerCase();
  const isAdmin = await checkIsAdmin();

  try {
    if (isAdmin) {
      const { execFileSync } = require('child_process');
      execFileSync('powercfg', ['/setactive', cleanGuid], { stdio: 'pipe', windowsHide: true });
    } else {
      // Needs UAC
      const result = await runElevatedCommands([`powercfg /setactive ${cleanGuid}`]);
      if (!result.ok) {
        return { success: false, error: result.error || 'Elevation failed.' };
      }
    }

    // Verify
    const verifyResult = await getActivePowerScheme();
    const activeGuid = verifyResult.scheme?.guid ?? '';
    if (activeGuid !== cleanGuid) {
      return { success: false, error: `Set GUID but verification failed — active=${activeGuid}` };
    }
    return { success: true, activeScheme: verifyResult.scheme };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Ownership-aware wrapper ────────────────────────────────────────────────────

const ownershipStore = require('./ownership-store');

/**
 * Apply a power profile AND maintain the ownership / baseline record.
 *
 * Order:
 *   1. Read current active GUID from Windows (baseline read)
 *   2. Store baseline ONLY if not already captured (immutable first-capture)
 *   3. Apply the power profile (existing applyPowerProfile)
 *   4. Record appliedByApp=true ONLY after confirmed success
 *
 * previousPlanGuid = exact active GUID before SwitchControl changed it.
 * On revert, the pipeline calls activatePlanByGuid(previousPlanGuid) to restore.
 * This handles custom user plans correctly — it restores the exact GUID, not
 * a generic "Balanced" or "High Performance".
 */
async function applyPowerProfileWithOwnership(profileId) {
  const scopeKey = ownershipStore.buildScopeKey('power_plan', 'active-scheme');

  // Step 1+2: capture baseline if first time applying a plan
  const existing = ownershipStore.getOwnershipRecord(scopeKey);
  if (!existing || !existing.baselineCaptured) {
    try {
      const active = await getActivePowerScheme();
      if (active.success && active.scheme) {
        ownershipStore.captureBaseline(scopeKey, {
          itemType:        'power_plan',
          itemId:          'active-scheme',
          previousPlanGuid: active.scheme.guid,
          previousValue:   { guid: active.scheme.guid, name: active.scheme.name },
        });
      } else {
        console.warn('[PowerPlan] could not read active scheme for baseline:', active.error);
      }
    } catch (e) {
      console.warn('[PowerPlan] baseline capture failed —', e.message);
    }
  }

  // Step 3: execute
  const result = await applyPowerProfile(profileId);

  // Step 4: record ownership only after confirmed success
  if (result.success) {
    ownershipStore.recordApply(scopeKey, {
      appliedValue:      { profileId, guid: result.activeScheme?.guid || null },
      appliedPlanGuid:   result.activeScheme?.guid || null,
      verificationState: result.verified ? 'verified' : 'unverified',
    });
  }

  return result;
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Return the map of { profileId → guid } stored in power-plans.json.
 * Used by the revert pipeline to identify which GUIDs are SC-managed plans.
 */
function getStoredSchemeGuids() {
  const state = loadState();
  return state.schemeGuids || {};
}

module.exports = {
  POWER_PROFILES,
  BUILTIN_GUIDS,
  getPowerPlanState,
  applyPowerProfile,
  applyPowerProfileWithOwnership,
  activatePlanByGuid,
  listSchemesForFrontend,
  getActivePowerScheme,
  getStoredSchemeGuids,
};
