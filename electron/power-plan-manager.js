'use strict';
const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { checkIsAdmin, runElevated, runElevatedCommands } = require('./ps-shared');

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
    const tmpFile = STATE_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), { encoding: 'utf8' });
    fs.renameSync(tmpFile, STATE_FILE);
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
  coreParkingMaxCoresAC: {
    subgroup: '54533251-82be-4824-96c1-47b60b740d00',
    setting:  'ea062031-0e34-4ff1-9b6d-eb1059334028',
    label:    'Maximum Unparked Cores',
    fmt:      (v) => v >= 100 ? 'All cores available' : `${v}% maximum`,
  },
  perfBoostModeAC: {
    subgroup: '54533251-82be-4824-96c1-47b60b740d00',
    setting:  'be337238-0d82-4146-a960-4f3749d470c7',
    label:    'CPU Boost Mode',
    fmt:      (v) => ({ 0: 'Disabled', 1: 'Enabled', 2: 'Aggressive', 3: 'Efficient enabled', 4: 'Efficient aggressive' })[v] ?? `Mode ${v}`,
  },
  systemCoolingPolicyAC: {
    subgroup: '54533251-82be-4824-96c1-47b60b740d00',
    setting:  '94d3a615-a899-4ac5-ae2b-e4d8f634367f',
    label:    'Cooling Policy',
    fmt:      (v) => v === 1 ? 'Active cooling' : v === 0 ? 'Passive cooling' : `Mode ${v}`,
  },
  energyPerformancePreferenceAC: {
    subgroup: '54533251-82be-4824-96c1-47b60b740d00',
    setting:  '36687f9e-e3a5-4dbf-b1dc-15eb381c6863',
    label:    'Energy Performance Preference',
    fmt:      (v) => v <= 0 ? 'Maximum performance' : v >= 100 ? 'Maximum efficiency' : `${v}% performance preference`,
  },
  processorIdleDisableAC: {
    subgroup: '54533251-82be-4824-96c1-47b60b740d00',
    setting:  '5d76a2ca-e8c0-402f-a133-2158492d58ad',
    label:    'Processor Idle',
    fmt:      (v) => v === 1 ? 'Idle states disabled' : v === 0 ? 'Idle states enabled' : `Mode ${v}`,
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
  processorThrottleStates: {
    subgroup: '54533251-82be-4824-96c1-47b60b740d00',
    setting:  '3b04d4fd-1cc7-4f23-ab1c-d1337819c4bb',
    label:    'Processor Throttle States',
    fmt:      (v) => v === 0 ? 'Disabled' : 'Enabled',
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
    applyDcSettings: false,
    settings: {
      cpuMinPercentAC:       100,
      cpuMaxPercentAC:       100,
      coreParkingMinCoresAC: 100,
      coreParkingMaxCoresAC: 100,
      perfBoostModeAC:       2,
      systemCoolingPolicyAC: 1,
      energyPerformancePreferenceAC: 0,
      processorIdleDisableAC: 1,
      usbSelectiveSuspendAC: 0,
      processorThrottleStates: 0,
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
    applyDcSettings: false,
    settings: {
      cpuMinPercentAC:       5,
      cpuMaxPercentAC:       100,
      coreParkingMinCoresAC: 100,
      coreParkingMaxCoresAC: 100,
      perfBoostModeAC:       4,
      systemCoolingPolicyAC: 1,
      energyPerformancePreferenceAC: 32,
      processorIdleDisableAC: 0,
      usbSelectiveSuspendAC: 0,
      processorThrottleStates: 1,
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
    applyDcSettings: false,
    settings: {
      cpuMinPercentAC:       5,
      cpuMaxPercentAC:       85,
      coreParkingMinCoresAC: 25,
      coreParkingMaxCoresAC: 75,
      perfBoostModeAC:       3,
      systemCoolingPolicyAC: 0,
      energyPerformancePreferenceAC: 80,
      processorIdleDisableAC: 0,
      usbSelectiveSuspendAC: 1,
      processorThrottleStates: 1,
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

// runPowerShell, checkIsAdmin, and runElevatedCommands are imported from ps-shared.js.


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

/**
 * Returns true if the given scheme GUID is present in the current powercfg /list output.
 * Returns false on any error (caller should treat unknown as absent for safety checks).
 */
async function schemeExists(guid) {
  try {
    const { schemes } = await listPowerSchemes();
    return schemes.some(s => s.guid === guid.toLowerCase());
  } catch {
    return false;
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
  // Run all 9 /query calls concurrently — each targets an independent subgroup/setting
  // pair, so there is no ordering requirement.  Parallel execution cuts load time by
  // roughly 8× vs the previous sequential for-await loop (each powercfg spawn has
  // ~50-150 ms of process-creation overhead on Windows).
  const entries = Object.entries(SETTING_DEFS);
  const results = await Promise.all(
    entries.map(([key, def]) =>
      runPowercfg('/query', schemeGuid, def.subgroup, def.setting)
        .then(out => ({ key, val: parseAcValue(out), err: null }))
        .catch(e  => ({ key, val: null,              err: e.message }))
    )
  );
  const settings = {};
  const errors   = {};
  for (const { key, val, err } of results) {
    settings[key] = val;
    if (err) errors[key] = err;
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
      const expectedKeys = Object.keys(profile.settings);
      const keys = expectedKeys.filter(k => settings[k] !== null && settings[k] !== undefined);
      // Never call a partial readback exact. A null value without a powercfg
      // error is still an unreadable value, not proof that the requested
      // setting matched.
      if (keys.length !== expectedKeys.length) continue;
      const matches = keys.filter(k => settings[k] === profile.settings[k]).length;
      if (keys.length > 0 && matches / keys.length >= 0.85) {
        const mismatches = {};
        keys.filter(k => settings[k] !== profile.settings[k]).forEach(k => {
          mismatches[k] = { expected: profile.settings[k], actual: settings[k] };
        });
        return { match: matches === keys.length ? 'exact_match' : 'close_match', profileId, mismatches };
      }

      // The GUID is authoritative ownership for a SwitchControl-managed
      // scheme. Windows/OEM firmware can normalize enough values that the
      // settings score falls below close-match even though this exact managed
      // scheme is active. Preserve the profile identity so callers can show
      // the correct active card and report the setting drift separately.
      const mismatches = {};
      keys.filter(k => settings[k] !== profile.settings[k]).forEach(k => {
        mismatches[k] = { expected: profile.settings[k], actual: settings[k] };
      });
      return { match: 'custom_modified', profileId, mismatches };
    }
  }

  // Fall back to settings-based matching
  let bestProfileId = null;
  let bestScore = 0;
  let bestMismatches = null;

  for (const [profileId, profile] of Object.entries(POWER_PROFILES)) {
    const expectedKeys = Object.keys(profile.settings);
    const keys = expectedKeys.filter(k => settings[k] !== null && settings[k] !== undefined);
    if (keys.length === 0 || keys.length !== expectedKeys.length) continue;
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
    const existingLower = existingGuid.toLowerCase();
    // Confirm it still exists
    const listResult = await listPowerSchemes();
    if (listResult.schemes.some(s => s.guid === existingLower)) {
      console.log(`[PowerPlan] Reusing existing SC scheme "${existingGuid}" for ${profileId}`);
      // Refresh name & description in case they changed.
      // CRITICAL GUARD: NEVER rename a built-in Windows plan.
      // If existingGuid is a built-in GUID (e.g. BALANCED_GUID stored as fallback from
      // a failed duplication), renaming it would corrupt the Windows Balanced plan name
      // to "SwitchControl - Balanced Gaming", which then can't be cleaned up on revert.
      const builtinGuidSet = new Set(Object.values(BUILTIN_GUIDS).map(g => g.toLowerCase()));
      if (!builtinGuidSet.has(existingLower)) {
        try {
          await runPowercfg('/changename', existingLower, profile.scName, profile.scDesc || 'SwitchControl managed power plan');
        } catch { /* non-critical, ignore */ }
      } else {
        console.warn(
          `[PowerPlan] Stored GUID ${existingLower} is a built-in Windows plan — ` +
          `skipping changename to prevent name corruption. ` +
          `A proper SC duplicate should be created instead.`
        );
      }
      return existingLower;
    }
    console.warn(`[PowerPlan] Stored GUID ${existingGuid} no longer exists — will scan for orphaned SC plan`);
  }

  // Before creating a new plan, check if an orphaned SC plan with the same name
  // already exists on Windows (e.g. from a previous install where state was cleared).
  // Adopting it avoids accumulating duplicate plans in Power Options.
  try {
    const listResult = await listPowerSchemes();
    const orphan = listResult.schemes?.find(
      s => s.name && s.name.toLowerCase() === profile.scName.toLowerCase()
    );
    if (orphan) {
      const orphanGuid = orphan.guid.toLowerCase();
      console.log(
        `[PowerPlan] Found orphaned SC plan "${orphan.name}" (${orphanGuid}) — adopting instead of creating new`
      );
      // Reuse the `state` already loaded at the top of this function — avoids a
      // redundant second loadState() disk read in the same call frame.
      const newState = { ...state, schemeGuids: { ...(state.schemeGuids || {}), [profileId]: orphanGuid } };
      saveState(newState);
      return orphanGuid;
    }
  } catch (e) {
    console.warn('[PowerPlan] Orphan scan failed — will proceed to create new plan:', e.message);
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
    // Non-admin path: use runElevated from ps-shared (VBScript/ShellExecute, no flash).
    const guidId     = `sc_pp_guid_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const guidPath   = path.join(os.tmpdir(), `${guidId}.txt`);
    const safeGuidPath = guidPath.replace(/'/g, "''");
    const safeScName   = profile.scName.replace(/'/g, "''");
    const safeScDesc   = (profile.scDesc || 'SwitchControl managed power plan').replace(/'/g, "''");

    const command = [
      `$ErrorActionPreference = 'Continue'`,
      `$raw = & powercfg /duplicatescheme ${baseGuid} 2>&1`,
      `$out = ($raw | Out-String).Trim()`,
      `$m = [regex]::Match($out, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')`,
      `if ($m.Success) {`,
      `  $guid = $m.Value.ToLower()`,
      `  & powercfg /changename $guid '${safeScName}' '${safeScDesc}' | Out-Null`,
      `  [System.IO.File]::WriteAllText('${safeGuidPath}', $guid)`,
      `}`,
    ].join('\r\n');

    await runElevated(command, { tempFilePrefix: 'sc_pp_dup_' });

    if (fs.existsSync(guidPath)) {
      newGuid = fs.readFileSync(guidPath, 'utf8').replace(/^\uFEFF/, '').trim().toLowerCase();
      try { fs.unlinkSync(guidPath); } catch {}
    }
  }

  if (!newGuid || !/^[0-9a-f-]{36}$/.test(newGuid)) {
    // Fallback: use built-in base plan directly
    console.warn(`[PowerPlan] Could not create duplicate scheme — falling back to base plan GUID ${baseGuid}`);
    newGuid = baseGuid;
    // CRITICAL GUARD: NEVER persist a built-in GUID as an SC scheme GUID.
    // If persisted, the reuse path would call `powercfg /changename <BALANCED_GUID>
    // "SwitchControl - Balanced Gaming"` on the next apply — permanently renaming
    // the Windows Balanced plan.  That renamed plan can then never be deleted on
    // revert (Windows refuses to delete the active plan) and the revert verifier
    // falsely reports clean because the GUID matches BALANCED_GUID.
    const builtinGuidSet = new Set(Object.values(BUILTIN_GUIDS).map(g => g.toLowerCase()));
    if (builtinGuidSet.has(newGuid.toLowerCase())) {
      console.warn(
        `[PowerPlan] Fallback GUID ${newGuid} is a built-in Windows plan — ` +
        `NOT persisting to power-plans.json (prevents name corruption on reuse).`
      );
      return newGuid;   // use for this session only, do not save
    }
  }

  // Persist
  const newState = { ...state, schemeGuids: { ...(state.schemeGuids || {}), [profileId]: newGuid } };
  saveState(newState);
  console.log(`[PowerPlan] Saved SC scheme "${newGuid}" for ${profileId}`);
  return newGuid;
}

async function resolveBasePlanGuid(basePlan) {
  let listResult = null;
  try { listResult = await listPowerSchemes(); } catch { /* non-fatal */ }

  const schemes = listResult?.schemes ?? [];

  // Ultimate Performance: consumer Windows editions don't include it by default.
  if (basePlan === 'ultimate_performance') {
    const hasUltimate = schemes.some(s => s.guid === BUILTIN_GUIDS.ultimate_performance);
    if (!hasUltimate) {
      console.log('[PowerPlan] Ultimate Performance not available — trying High Performance');
      basePlan = 'high_performance';
    }
  }

  // High Performance: may be missing if the user deleted it.
  if (basePlan === 'high_performance') {
    const hasHighPerf = schemes.length === 0 || schemes.some(s => s.guid === BUILTIN_GUIDS.high_performance);
    if (!hasHighPerf) {
      console.log('[PowerPlan] High Performance plan not found in scheme list — falling back to Balanced');
      return BUILTIN_GUIDS.balanced;
    }
  }

  return BUILTIN_GUIDS[basePlan] || BUILTIN_GUIDS.balanced;
}

// ── Main API ──────────────────────────────────────────────────────────────────

async function applyPowerProfile(profileId) {
  const profile = POWER_PROFILES[profileId];
  if (!profile) return { success: false, error: `Unknown profileId: ${profileId}` };

  console.log(`[PowerPlan] ── applyPowerProfile START: profileId="${profileId}" ──`);
  console.log(`[PowerPlan]   basePlan="${profile.basePlan}" scName="${profile.scName}"`);

  // ── Step 1: Read active GUID before any change ─────────────────────────────
  let guidBefore = '(unread)';
  try {
    const pre = await getActivePowerScheme();
    guidBefore = pre.scheme?.guid ?? '(null)';
    console.log(`[PowerPlan]   GUID before: ${guidBefore} ("${pre.scheme?.name ?? ''}")`);
  } catch (e) {
    console.warn(`[PowerPlan]   pre-read failed: ${e.message}`);
  }

  // ── Step 2: Ensure/create the SC scheme ────────────────────────────────────
  let schemeGuid;
  try {
    schemeGuid = await ensureSwitchControlScheme(profileId);
    console.log(`[PowerPlan]   target schemeGuid: ${schemeGuid}`);
  } catch (e) {
    console.error(`[PowerPlan]   ensureSwitchControlScheme failed: ${e.message}`);
    return { success: false, error: `Could not prepare power scheme: ${e.message}` };
  }

  // ── Step 2b: Guard — if target scheme doesn't exist, restore built-in plans and retry once ──
  // Happens when OEM software (e.g. "Lumin Updated Power") removes all built-in Windows
  // schemes.  We never run restoredefaultschemes unconditionally — only when the scheme
  // we need is provably absent.  We never retry more than once.
  const schemePresent = await schemeExists(schemeGuid);
  if (!schemePresent) {
    console.warn(`[PowerPlan]   schemeGuid ${schemeGuid} not found — running powercfg -restoredefaultschemes (once)`);
    const isAdminNowRestore = await checkIsAdmin();
    try {
      if (isAdminNowRestore) {
        await runPowercfg('-restoredefaultschemes');
      } else {
        const r = await runElevatedCommands(['powercfg -restoredefaultschemes']);
        if (r.cancelled) {
          return { success: false, cancelled: true, error: 'Admin permission was canceled. No system changes were made.' };
        }
      }
      console.log('[PowerPlan]   restoredefaultschemes done — retrying ensureSwitchControlScheme');
      try {
        schemeGuid = await ensureSwitchControlScheme(profileId);
        console.log(`[PowerPlan]   retry schemeGuid: ${schemeGuid}`);
      } catch (retryErr) {
        console.error(`[PowerPlan]   retry ensureSwitchControlScheme failed: ${retryErr.message}`);
      }
    } catch (restoreErr) {
      console.error(`[PowerPlan]   restoredefaultschemes failed: ${restoreErr.message}`);
    }

    // Final check — if still absent, surface a specific user-facing message
    const stillMissing = !(await schemeExists(schemeGuid));
    if (stillMissing) {
      return {
        success: false,
        missingScheme: true,
        error:
          "Your PC's manufacturer software may have removed some standard Windows power plans. " +
          'Open Windows Settings → Power & Sleep → Additional power settings, then click ' +
          '"Restore plan defaults" or reinstall your OEM power utility to fix this.',
      };
    }
  }

  // ── Step 3: Build and run setting commands ─────────────────────────────────
  const settingCmds = [];
  for (const [key, value] of Object.entries(profile.settings)) {
    const def = SETTING_DEFS[key];
    if (!def) continue;
    settingCmds.push(`powercfg /setacvalueindex ${schemeGuid} ${def.subgroup} ${def.setting} ${value}`);
    if (profile.applyDcSettings === true) {
      settingCmds.push(`powercfg /setdcvalueindex ${schemeGuid} ${def.subgroup} ${def.setting} ${value}`);
    }
  }
  settingCmds.push(`powercfg /setactive ${schemeGuid}`);

  const isAdmin = await checkIsAdmin();
  console.log(`[PowerPlan]   isAdmin=${isAdmin} — running ${settingCmds.length} powercfg commands`);
  let applyResult = { ok: true, failed: [] };

  if (isAdmin) {
    const failed = [];
    for (const cmd of settingCmds) {
      try {
        const args = cmd.split(' ').slice(1);
        await runPowercfg(...args);
      } catch (e) {
        failed.push(cmd);
        console.error(`[PowerPlan]   cmd FAILED: ${cmd} — stderr: ${e.message}`);
      }
    }
    // Fix: ok must reflect real outcome — hardcoding ok:true masked silent
    // failures.  The non-admin (runElevatedCommands) path already propagates
    // ok:false when any command fails; this branch now matches that semantic.
    applyResult = { ok: failed.length === 0, failed };
  } else {
    applyResult = await runElevatedCommands(settingCmds);
    if (applyResult.cancelled) {
      console.warn(`[PowerPlan]   UAC cancelled — no changes made`);
      return { success: false, cancelled: true, error: 'Admin permission was canceled. No system changes were made.' };
    }
    if (!applyResult.ok) {
      console.error(`[PowerPlan]   elevation failed: ${applyResult.error}`);
      return { success: false, error: applyResult.error || 'Elevation failed.' };
    }
  }

  const failedSettings = applyResult.failed ?? [];
  if (failedSettings.length > 0) {
    // Some powercfg commands failed.  This is intentionally non-fatal: hardware-
    // limited settings (e.g. perfBoostMode not supported on all CPUs) are expected
    // to fail on read-back and are still useful with whatever DOES apply.
    // Overall `success` stays tied to guidMatch (GUID became active) — see comment
    // below — not to individual setting commands.
    //
    // NOTE: the frontend currently checks only result.success and does NOT render
    // failedSettings to the user, so these failures are invisible in the UI.
    // They ARE present in the returned response for callers that inspect them.
    // If command failures should be surfaced visibly, the frontend PowerPlan
    // apply handler must be updated to read and display result.failedSettings.
    console.warn(
      `[PowerPlan]   ${failedSettings.length} of ${settingCmds.length} setting cmd(s) failed ` +
      `(plan GUID may still be active — check success/verified below):`,
      failedSettings,
    );
  }

  // ── Step 4: Verify — confirm the target GUID is now active ─────────────────
  const [activeResult, settingsResult] = await Promise.all([
    getActivePowerScheme(),
    readAllSettings(schemeGuid),
  ]);

  const guidAfter = (activeResult.scheme?.guid ?? '').toLowerCase();
  console.log(`[PowerPlan]   GUID after:  ${guidAfter} ("${activeResult.scheme?.name ?? ''}")`);
  console.log(`[PowerPlan]   target GUID: ${schemeGuid.toLowerCase()}`);

  const settings     = settingsResult.settings;
  const breakdown    = generateBreakdown(settings);
  const profileMatch = matchProfileToPreset(guidAfter, settings);

  // SUCCESS = the target scheme GUID is now active.
  // Settings match is INFORMATIONAL — some settings may be hardware-limited
  // (e.g. perfBoostModeAC=2 not supported on all CPUs) and will not reflect
  // the requested value on read-back.  The plan is still active and useful.
  const guidMatch = activeResult.success && guidAfter === schemeGuid.toLowerCase();
  const success   = guidMatch;

  console.log(
    `[PowerPlan] ── applyPowerProfile END ──` +
    ` success=${success} guidMatch=${guidMatch}` +
    ` settingsMatch=${profileMatch.match}` +
    ` failedCmds=${failedSettings.length}` +
    ` settingsErrors=${Object.keys(settingsResult.errors || {}).length}`
  );

  if (!success) {
    console.error(
      `[PowerPlan]   APPLY FAILED — active GUID "${guidAfter}" ≠ target GUID "${schemeGuid.toLowerCase()}"` +
      (activeResult.success ? '' : ` — getActivePowerScheme failed: ${activeResult.error}`)
    );
  }

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

// Windows Balanced plan GUID — immutable, used for restoredefaultschemes fallback.
const BALANCED_GUID = BUILTIN_GUIDS.balanced; // '381b4222-f694-41f0-9685-ff5bb260df2e'

/**
 * Activate a power plan by exact GUID.
 * Used by the premium-expiry revert pipeline to restore the user's original plan.
 *
 * Guarantees:
 *   1. If the target GUID is already active, returns immediately without any
 *      system call or UAC prompt (avoids unnecessary elevation).
 *      → { ok: true, alreadyActive: true, changed: false }
 *
 *   2. If activation of BALANCED_GUID fails (plan deleted), invokes
 *      `powercfg -restoredefaultschemes` to restore Windows built-in plans,
 *      then retries exactly once — never relies on plan names.
 *      Success → { ok: true, restoredDefaults: true, retried: true, changed: true }
 *      Failure → { ok: false, restoredDefaultsAttempted: true, error }
 *
 * @param {string} guid — must be a valid UUID
 * @returns {{ ok: boolean, changed?: boolean, alreadyActive?: boolean,
 *             restoredDefaults?: boolean, restoredDefaultsAttempted?: boolean,
 *             retried?: boolean, activeScheme?: object, error?: string }}
 */
async function activatePlanByGuid(guid) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guid || !UUID_RE.test(guid.trim())) {
    return { ok: false, error: `Invalid GUID: ${guid}` };
  }
  const cleanGuid = guid.trim().toLowerCase();

  // ── Guard 1: already active — skip all system calls (no UAC, no powercfg) ──
  try {
    const current = await getActivePowerScheme();
    if (current.success && current.scheme?.guid === cleanGuid) {
      console.log(
        `[PowerPlan] activatePlanByGuid: ${cleanGuid} is already the active plan` +
        ` — revert skipped because already active (no UAC / no powercfg spawn)`
      );
      return { ok: true, alreadyActive: true, changed: false, activeScheme: current.scheme };
    }
  } catch (e) {
    // Non-fatal — cannot confirm pre-state, proceed with activation attempt
    console.warn('[PowerPlan] activatePlanByGuid: pre-check failed —', e.message);
  }

  const isAdmin = await checkIsAdmin();

  // ── Inner helper: run a single powercfg command ────────────────────────────
  async function runSetActive(targetGuid) {
    if (isAdmin) {
      const { execFileSync } = require('child_process');
      execFileSync('powercfg', ['/setactive', targetGuid], { stdio: 'pipe', windowsHide: true });
    } else {
      const result = await runElevatedCommands([`powercfg /setactive ${targetGuid}`]);
      if (!result.ok) throw new Error(result.error || 'Elevation failed.');
    }
  }

  async function runRestoreDefaultSchemes() {
    if (isAdmin) {
      const { execFileSync } = require('child_process');
      execFileSync('powercfg', ['-restoredefaultschemes'], { stdio: 'pipe', windowsHide: true });
    } else {
      await runElevatedCommands(['powercfg -restoredefaultschemes']);
    }
  }

  // ── Activation attempt ─────────────────────────────────────────────────────
  let restoredDefaults = false;

  try {
    await runSetActive(cleanGuid);
  } catch (firstErr) {
    // ── Guard 2: BALANCED_GUID missing — restore built-in plans then retry ──
    // Only runs when the target is the Windows Balanced plan (safe to restore).
    // Restoring default schemes on a non-Balanced target could wipe user plans.
    if (cleanGuid === BALANCED_GUID) {
      console.warn(
        `[PowerPlan] activatePlanByGuid: Balanced activation failed (${firstErr.message})` +
        ` — invoking powercfg -restoredefaultschemes then retrying (once)`
      );
      try {
        await runRestoreDefaultSchemes();
        console.log('[PowerPlan] activatePlanByGuid: restoredefaultschemes completed — retrying setactive');
        restoredDefaults = true;
        await runSetActive(cleanGuid);
        console.log('[PowerPlan] activatePlanByGuid: retry success — Balanced plan restored and activated');
      } catch (restoreErr) {
        console.error('[PowerPlan] activatePlanByGuid: retry after restoredefaultschemes also failed —', restoreErr.message);
        return {
          ok: false,
          restoredDefaultsAttempted: true,
          error: `Balanced activation failed; restoredefaultschemes + retry also failed: ${restoreErr.message} (original: ${firstErr.message})`,
        };
      }
    } else {
      return { ok: false, error: firstErr.message };
    }
  }

  // ── Verify: confirm the GUID is truly active now ───────────────────────────
  const verifyResult = await getActivePowerScheme();
  const activeGuid = verifyResult.scheme?.guid ?? '';
  if (activeGuid !== cleanGuid) {
    return { ok: false, error: `Set GUID but verification failed — active=${activeGuid}, expected=${cleanGuid}` };
  }

  if (restoredDefaults) {
    return { ok: true, restoredDefaults: true, retried: true, changed: true, activeScheme: verifyResult.scheme };
  }
  return { ok: true, changed: true, activeScheme: verifyResult.scheme };
}

// ── SC plan cleanup ───────────────────────────────────────────────────────────

const SC_PLAN_NAME_PREFIX = 'SwitchControl -';

/**
 * Delete all SwitchControl-managed power plans from Windows except the one
 * currently active (Windows rejects deletion of the active plan).
 *
 * Detection priority — most-trusted first:
 *   1. GUIDs stored in power-plans.json schemeGuids (definitive app registry)
 *   2. GUIDs in ownership-store where itemType=power_plan + appliedByApp=true
 *   3. Name-prefix fallback: plans whose name starts with SC_PLAN_NAME_PREFIX
 *      (catches orphans from reinstalls where both registries were cleared)
 *      — only schemes NOT matching any built-in GUID are eligible here
 *
 * User-created plans are safe: only GUIDs confirmed via registry/ownership,
 * or schemes explicitly named with the SC prefix, are removed.
 *
 * @returns {{ deleted: string[], skipped: string[], errors: string[], verified: boolean }}
 */
async function deleteAllScPlans() {
  const deleted  = [];
  const skipped  = [];
  const errors   = [];

  // ── 1. Read currently active plan ────────────────────────────────────────────
  let activeGuid = null;
  try {
    const cur = await getActivePowerScheme();
    activeGuid = cur.scheme?.guid?.toLowerCase() ?? null;
  } catch { /* non-fatal */ }

  // ── 2. List all Windows power schemes ────────────────────────────────────────
  let schemes = [];
  try {
    const listResult = await listPowerSchemes();
    schemes = listResult.schemes || [];
  } catch (e) {
    return { deleted, skipped, errors: [`listPowerSchemes failed: ${e.message}`], verified: false };
  }

  // ── 3. Build confirmed-SC-owned GUID set ─────────────────────────────────────
  const confirmedGuids = new Set();

  // Priority 1: power-plans.json schemeGuids (preset profiles) + custom plan GUID
  try {
    const st = loadState();
    const storedGuids = Object.values(st.schemeGuids || {});
    storedGuids.forEach(g => g && confirmedGuids.add(String(g).toLowerCase()));
    // Also include the custom plan GUID (has no SC-name-prefix, so not caught by name fallback)
    if (st.customPlan?.guid) {
      confirmedGuids.add(String(st.customPlan.guid).toLowerCase());
    }
  } catch { /* non-critical */ }

  // Priority 2: ownership-store records with appliedByApp=true + power_plan type
  try {
    const ownershipStore = require('./ownership-store');
    const allRecords = ownershipStore.getAllRecords();
    Object.values(allRecords).forEach(r => {
      if (r.itemType === 'power_plan' && r.appliedByApp === true && r.appliedPlanGuid) {
        confirmedGuids.add(String(r.appliedPlanGuid).toLowerCase());
      }
    });
  } catch { /* non-critical */ }

  // ── 4. Identify which Windows schemes to delete ───────────────────────────────
  const builtinGuidSet = new Set(Object.values(BUILTIN_GUIDS).map(g => String(g).toLowerCase()));

  const toDelete = schemes.filter(s => {
    const guid = s.guid?.toLowerCase();
    if (!guid) return false;

    // Registry match (Priority 1 + 2): definitive app-owned
    if (confirmedGuids.has(guid)) return true;

    // Name-prefix fallback (Priority 3): orphans from cleared registries
    // Only if name matches AND it's not a known Windows built-in GUID
    if (s.name && s.name.startsWith(SC_PLAN_NAME_PREFIX) && !builtinGuidSet.has(guid)) {
      console.log(`[PowerPlan] deleteAllScPlans: name-fallback matched orphan "${s.name}" (${guid})`);
      return true;
    }

    return false;
  });

  if (toDelete.length === 0) {
    console.log('[PowerPlan] deleteAllScPlans: no SC plans found to delete');
    // Verify: confirm no stale name-prefix plans remain
    const orphansRemaining = schemes.filter(
      s => s.name?.startsWith(SC_PLAN_NAME_PREFIX) && !builtinGuidSet.has(s.guid?.toLowerCase())
    );
    return { deleted, skipped, errors, verified: orphansRemaining.length === 0 };
  }

  const isAdmin = await checkIsAdmin();

  // ── 5. Delete each candidate ─────────────────────────────────────────────────
  for (const scheme of toDelete) {
    const guid = scheme.guid.toLowerCase();
    if (guid === activeGuid) {
      // Windows refuses to delete the active plan — active plan must be
      // switched first. This should not happen in normal revert flow since
      // revert activates Windows Balanced before calling deleteAllScPlans.
      console.log(`[PowerPlan] deleteAllScPlans: skipping active plan "${scheme.name}" (${guid}) — revert must run first`);
      skipped.push(guid);
      continue;
    }
    try {
      if (isAdmin) {
        const { execFileSync } = require('child_process');
        execFileSync('powercfg', ['/delete', guid], { stdio: 'pipe', windowsHide: true });
      } else {
        const result = await runElevatedCommands([`powercfg /delete ${guid}`]);
        if (!result.ok) throw new Error(result.error || 'Elevation failed');
      }
      console.log(`[PowerPlan] deleteAllScPlans: deleted "${scheme.name}" (${guid})`);
      deleted.push(guid);
    } catch (e) {
      console.error(`[PowerPlan] deleteAllScPlans: failed to delete "${scheme.name}" (${guid}): ${e.message}`);
      errors.push(guid);
    }
  }

  // ── 6. Clear deleted GUIDs from power-plans.json ─────────────────────────────
  try {
    const state = loadState();
    if (state.schemeGuids) {
      const cleaned = {};
      for (const [pid, g] of Object.entries(state.schemeGuids)) {
        if (!deleted.includes(String(g).toLowerCase())) {
          cleaned[pid] = g;
        }
      }
      saveState({ ...state, schemeGuids: cleaned });
    }
  } catch { /* non-critical */ }

  // ── 7. Post-deletion verification ────────────────────────────────────────────
  // Re-list schemes and confirm no SC plans remain (excluding active if skipped).
  let verified = false;
  try {
    const recheck = await listPowerSchemes();
    const remaining = (recheck.schemes || []).filter(
      s => s.name?.startsWith(SC_PLAN_NAME_PREFIX) && !builtinGuidSet.has(s.guid?.toLowerCase())
    );
    // Verification passes if zero SC plans remain, or only the still-active one is left (skipped)
    const nonActiveRemaining = remaining.filter(s => s.guid?.toLowerCase() !== activeGuid);
    verified = nonActiveRemaining.length === 0;
    if (verified) {
      console.log('[PowerPlan] deleteAllScPlans: post-delete verification PASSED — no SC plans remain');
    } else {
      console.warn(
        `[PowerPlan] deleteAllScPlans: post-delete verification FAILED — ` +
        `${nonActiveRemaining.length} SC plans still present: ` +
        nonActiveRemaining.map(s => `"${s.name}"(${s.guid})`).join(', ')
      );
    }
  } catch (e) {
    console.warn('[PowerPlan] deleteAllScPlans: post-delete verification threw:', e.message);
  }

  console.log(`[PowerPlan] deleteAllScPlans: deleted=${deleted.length} skipped=${skipped.length} errors=${errors.length} verified=${verified}`);
  return { deleted, skipped, errors, verified };
}

/**
 * Verify that the current system state is clean for a non-premium user:
 *   • Active plan is Windows Balanced (381b4222-f694-41f0-9685-ff5bb260df2e)
 *   • No SwitchControl-named plans remain in the system
 *
 * @returns {{ activeGuid: string, isBalanced: boolean, scPlansRemaining: string[], clean: boolean }}
 */
async function verifyRevertClean() {
  const builtinGuidSet = new Set(Object.values(BUILTIN_GUIDS).map(g => String(g).toLowerCase()));
  let activeGuid = '';
  let isBalanced = false;

  try {
    const cur = await getActivePowerScheme();
    activeGuid = (cur.scheme?.guid ?? '').toLowerCase();
    isBalanced = activeGuid === BALANCED_GUID;
  } catch (e) {
    console.warn('[PowerPlan] verifyRevertClean: could not read active scheme:', e.message);
  }

  let scPlansRemaining = [];
  let renamedBuiltins  = [];
  try {
    const listResult = await listPowerSchemes();
    const allSchemes  = listResult.schemes || [];

    // Custom SC duplicate plans (non-built-in GUIDs, SC name prefix)
    scPlansRemaining = allSchemes
      .filter(s => s.name?.startsWith(SC_PLAN_NAME_PREFIX) && !builtinGuidSet.has(s.guid?.toLowerCase()))
      .map(s => `"${s.name}" (${s.guid})`);

    // Built-in plans that were renamed with the SC prefix — these cannot be
    // deleted (they are Windows built-ins) but their name must be restored.
    // This catches the case where ensureSwitchControlScheme fell back to
    // BALANCED_GUID and the reuse path renamed Windows Balanced to
    // "SwitchControl - Balanced Gaming".
    renamedBuiltins = allSchemes
      .filter(s => s.name?.startsWith(SC_PLAN_NAME_PREFIX) && builtinGuidSet.has(s.guid?.toLowerCase()))
      .map(s => `"${s.name}" (${s.guid})`);
  } catch (e) {
    console.warn('[PowerPlan] verifyRevertClean: could not list schemes:', e.message);
  }

  const clean = isBalanced && scPlansRemaining.length === 0 && renamedBuiltins.length === 0;
  console.log(
    `[PowerPlan] verifyRevertClean: isBalanced=${isBalanced}` +
    ` scPlansRemaining=${scPlansRemaining.length}` +
    ` renamedBuiltins=${renamedBuiltins.length}` +
    ` clean=${clean}`
  );
  if (!clean) {
    if (!isBalanced) console.warn(`[PowerPlan] verifyRevertClean: active GUID is ${activeGuid} (expected ${BALANCED_GUID})`);
    if (scPlansRemaining.length) console.warn('[PowerPlan] verifyRevertClean: SC plans still present:', scPlansRemaining);
    if (renamedBuiltins.length) console.warn('[PowerPlan] verifyRevertClean: built-in plans renamed with SC prefix:', renamedBuiltins);
  }
  return { activeGuid, isBalanced, scPlansRemaining, renamedBuiltins, clean };
}

// Original Windows names + descriptions for built-in power plans.
// Used to restore plan names after they may have been renamed by the SC reuse path.
const BUILTIN_PLAN_NAMES = {
  [BUILTIN_GUIDS.balanced]:
    ['Balanced', 'Automatically balances performance with energy consumption on capable hardware.'],
  [BUILTIN_GUIDS.high_performance]:
    ['High performance', 'Favors performance, but may use more energy.'],
  [BUILTIN_GUIDS.power_saver]:
    ["Power saver", "Saves energy by reducing your PC's performance where possible."],
  [BUILTIN_GUIDS.ultimate_performance]:
    ['Ultimate Performance', 'Provides ultimate performance on higher end PCs.'],
};

/**
 * Restore the original Windows names of all known built-in power plans.
 *
 * This is called before deleteAllScPlans() and verifyRevertClean() to undo
 * any name corruption caused by the reuse-path changename guard failure.
 * After restoration, the SC-name-prefix detection reliably finds only true
 * SC duplicate plans (non-built-in GUIDs), never falsely renamed built-ins.
 *
 * Non-fatal: plans that don't exist on this Windows edition are silently skipped.
 *
 * @returns {{ guid: string, name: string, ok: boolean, error?: string }[]}
 */
async function restoreBuiltinPlanNames() {
  const results = [];
  for (const [guid, [name, desc]] of Object.entries(BUILTIN_PLAN_NAMES)) {
    try {
      await runPowercfg('/changename', guid, name, desc);
      console.log(`[PowerPlan] restoreBuiltinPlanNames: restored "${name}" (${guid})`);
      results.push({ guid, name, ok: true });
    } catch (e) {
      // Plans like ultimate_performance may not exist on consumer editions — non-fatal.
      console.log(`[PowerPlan] restoreBuiltinPlanNames: skipped "${name}" (${guid}) — ${e.message}`);
      results.push({ guid, name, ok: false, error: e.message });
    }
  }
  return results;
}

// ── Custom power plan ─────────────────────────────────────────────────────────

const CUSTOM_PLAN_INVALID_CHARS = /[\\/:*?"<>|]/;

function validateCustomPlanName(name) {
  if (typeof name !== 'string') return 'Name must be a string.';
  const t = name.trim();
  if (t.length < 3)  return 'Name must be at least 3 characters.';
  if (t.length > 50) return 'Name must be at most 50 characters.';
  if (CUSTOM_PLAN_INVALID_CHARS.test(t)) return 'Name contains invalid characters (\\ / : * ? " < > |).';
  return null;
}

/**
 * Duplicate a base scheme and return the new GUID.
 * Handles admin (direct powercfg) and non-admin (elevated PS1 script) paths.
 * Does NOT rename the new scheme — caller is responsible for naming.
 *
 * @param {string} baseGuid
 * @returns {Promise<string|null>} new GUID in lowercase or null on failure
 */
async function duplicateSchemeRaw(baseGuid) {
  const isAdminNow = await checkIsAdmin();
  let newGuid = null;

  if (isAdminNow) {
    try {
      const dupOut = await runPowercfg('/duplicatescheme', baseGuid);
      const m = dupOut.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (m) newGuid = m[0].toLowerCase();
    } catch (e) {
      console.warn(`[PowerPlan:Custom] admin direct duplicate failed — ${e.message}`);
    }
  } else {
    // Non-admin path: use runElevated from ps-shared (VBScript/ShellExecute, no flash).
    const guidId     = `sc_cust_guid_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const guidPath   = path.join(os.tmpdir(), `${guidId}.txt`);
    const safeGuidPath = guidPath.replace(/'/g, "''");

    const command = [
      `$ErrorActionPreference = 'Continue'`,
      `$raw = & powercfg /duplicatescheme ${baseGuid} 2>&1`,
      `$out = ($raw | Out-String).Trim()`,
      `$m = [regex]::Match($out, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')`,
      `if ($m.Success) { [System.IO.File]::WriteAllText('${safeGuidPath}', $m.Value.ToLower()) }`,
    ].join('\r\n');

    await runElevated(command, { tempFilePrefix: 'sc_cust_dup_' });

    if (fs.existsSync(guidPath)) {
      newGuid = fs.readFileSync(guidPath, 'utf8').replace(/^\uFEFF/, '').trim().toLowerCase();
      try { fs.unlinkSync(guidPath); } catch {}
    }
  }

  if (!newGuid || !/^[0-9a-f-]{36}$/.test(newGuid)) return null;
  return newGuid;
}

/**
 * Apply a custom power plan with a user-defined name and granular settings.
 *
 * Flow:
 *   1. Validate name (3-50 chars, no invalid chars)
 *   2. Reuse stored custom GUID if it still exists in Windows; otherwise duplicate base plan
 *   3. Rename the plan to the user's exact custom name
 *   4. Apply each selected setting via powercfg
 *   5. Activate the plan
 *   6. Verify active GUID matches
 *   7. Persist { guid, name, createdAt, lastAppliedSettings } in power-plans.json
 *
 * @param {string} name     - User-supplied plan name (3-50 chars, no special chars)
 * @param {object} settings - CustomSettings object from the frontend
 */
async function applyCustomPowerProfile(name, settings) {
  console.log(`[PowerPlan:Custom] name input="${name}"`);

  const nameErr = validateCustomPlanName(name);
  if (nameErr) {
    console.error(`[PowerPlan:Custom] validation failed: ${nameErr}`);
    return { success: false, error: nameErr };
  }
  const cleanName = name.trim();
  const state = loadState();

  // ── Step 1: Resolve or create the custom GUID ────────────────────────────────
  let customGuid = typeof state.customPlan?.guid === 'string' ? state.customPlan.guid.toLowerCase() : null;

  if (customGuid) {
    const listResult = await listPowerSchemes();
    const stillExists = listResult.schemes?.some(s => s.guid.toLowerCase() === customGuid);
    if (!stillExists) {
      console.log(`[PowerPlan:Custom] stored GUID ${customGuid} no longer exists — will create new`);
      customGuid = null;
    }
  }

  if (!customGuid) {
    const baseGuid = await resolveBasePlanGuid('high_performance');
    console.log(`[PowerPlan:Custom] duplicating base plan ${baseGuid}`);
    customGuid = await duplicateSchemeRaw(baseGuid);
    console.log(`[PowerPlan:Custom] duplicated base GUID=${customGuid}`);
    if (!customGuid) {
      return { success: false, error: 'Could not create a new custom power plan (duplication failed or was cancelled).' };
    }
  }

  // ── Step 2: Rename to user's exact name ──────────────────────────────────────
  try {
    await runPowercfg('/changename', customGuid, cleanName, 'SwitchControl custom power plan');
    console.log(`[PowerPlan:Custom] renamed to="${cleanName}"`);
  } catch (e) {
    console.warn(`[PowerPlan:Custom] rename failed (non-fatal): ${e.message}`);
  }

  // ── Step 3: Build setting commands ───────────────────────────────────────────
  const cmds = [];

  // Custom profiles are performance profiles for the plugged-in machine by
  // default. Preserve the duplicated plan's battery/DC policy unless the user
  // explicitly opts into changing it.
  function addSetting(key, value, applyDc = settings.applyDcSettings === true) {
    const def = SETTING_DEFS[key];
    if (!def) return;
    console.log(`[PowerPlan:Custom] applying setting=${key} value=${value}`);
    cmds.push(`powercfg /setacvalueindex ${customGuid} ${def.subgroup} ${def.setting} ${value}`);
    if (applyDc) {
      cmds.push(`powercfg /setdcvalueindex ${customGuid} ${def.subgroup} ${def.setting} ${value}`);
    }
  }

  // CPU % states — frequency scaling overrides sliders
  const minProc = settings.disableFrequencyScaling ? 100 : (Number(settings.minProcessorState) || 5);
  const maxProc = settings.disableFrequencyScaling ? 100 : (Number(settings.maxProcessorState) || 100);
  addSetting('cpuMinPercentAC', minProc);
  addSetting('cpuMaxPercentAC', maxProc);

  // Core parking
  if (settings.disableCoreParking) {
    addSetting('coreParkingMinCoresAC', 100);
  }

  // Turbo boost (perfBoostModeAC: 2=aggressive / 0=disabled)
  addSetting('perfBoostModeAC', settings.enableTurboBoost ? 2 : 0);

  // Throttle states (0=disabled / 1=enabled)
  addSetting('processorThrottleStates', settings.disableThrottleStates ? 0 : 1);

  // USB selective suspend
  addSetting('usbSelectiveSuspendAC', settings.disableUsbSelectiveSuspend ? 0 : 1);

  // PCIe ASPM — always disable for performance in custom plans
  addSetting('pcieAspmAC', 0);

  // Sleep & hibernate
  if (settings.disableSleep) {
    addSetting('sleepAfterAC', 0);
    addSetting('hibernateAfterAC', 0);
  } else if (settings.disableHibernation) {
    addSetting('hibernateAfterAC', 0);
  }

  // Display
  if (settings.keepDisplayOn) {
    addSetting('displayOffAfterAC', 0);
  }

  // Activate last
  cmds.push(`powercfg /setactive ${customGuid}`);

  // ── Step 4: Run commands ──────────────────────────────────────────────────────
  const isAdmin = await checkIsAdmin();
  console.log(`[PowerPlan:Custom] isAdmin=${isAdmin} — running ${cmds.length} commands`);
  let applyResult = { ok: true, failed: [] };

  if (isAdmin) {
    const failed = [];
    for (const cmd of cmds) {
      try {
        const args = cmd.split(' ').slice(1);
        await runPowercfg(...args);
      } catch (e) {
        failed.push(cmd);
        console.error(`[PowerPlan:Custom] cmd FAILED: ${cmd} — ${e.message}`);
      }
    }
    // Fix: ok must reflect real outcome — same correction as in applyPowerProfile().
    applyResult = { ok: failed.length === 0, failed };
  } else {
    applyResult = await runElevatedCommands(cmds);
    if (applyResult.cancelled) {
      console.warn(`[PowerPlan:Custom] UAC cancelled`);
      return { success: false, cancelled: true, error: 'Admin permission was canceled. No system changes were made.' };
    }
    if (!applyResult.ok) {
      console.error(`[PowerPlan:Custom] elevation failed: ${applyResult.error}`);
      return { success: false, error: applyResult.error || 'Elevation failed.' };
    }
  }

  console.log(`[PowerPlan:Custom] activated GUID=${customGuid}`);

  // ── Step 5: Verify ────────────────────────────────────────────────────────────
  const activeResult = await getActivePowerScheme();
  const activeGuid   = (activeResult.scheme?.guid ?? '').toLowerCase();
  console.log(`[PowerPlan:Custom] verify active GUID=${activeGuid}`);

  const verified = activeResult.success && activeGuid === customGuid;
  console.log(`[PowerPlan:Custom] success/fail=${verified ? 'success' : 'fail'}`);

  // ── Step 6: Persist ───────────────────────────────────────────────────────────
  const updatedState = loadState(); // re-read to avoid clobbering concurrent writes
  const customPlan = {
    guid:                customGuid,
    name:                cleanName,
    createdAt:           updatedState.customPlan?.createdAt || Date.now(),
    lastAppliedSettings: settings,
  };
  saveState({ ...updatedState, customPlan });
  console.log(`[PowerPlan:Custom] persisted custom plan metadata guid=${customGuid} name="${cleanName}"`);

  if (!verified) {
    return {
      success: false,
      error: `Custom plan created but verification failed — active=${activeGuid}, expected=${customGuid}`,
      guid:  customGuid,
      name:  cleanName,
    };
  }

  return {
    success:      true,
    verified:     true,
    guid:         customGuid,
    name:         cleanName,
    activeScheme: activeResult.scheme,
    failedCmds:   applyResult.failed ?? [],
  };
}

/**
 * Return stored custom plan metadata ({ guid, name, createdAt, lastAppliedSettings }) or null.
 */
function getCustomPlanMeta() {
  return loadState().customPlan ?? null;
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
          // active.success && active.scheme guard above ensures this is a real read.
          verifySucceeded: true,
        });
        console.log(
          `[PowerPlan] previousPlanGuid captured: ${active.scheme.guid}` +
          ` (name: "${active.scheme.name}") — will restore here on revert`
        );
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
    console.log(
      `[PowerPlan] premium plan applied: profileId=${profileId}` +
      ` guid=${result.activeScheme?.guid || '(unknown)'} — appliedByApp=true recorded`
    );
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
