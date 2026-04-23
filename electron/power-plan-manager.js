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
      const newState = { ...loadState(), schemeGuids: { ...(loadState().schemeGuids || {}), [profileId]: orphanGuid } };
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
    // Non-admin path: write a proper standalone PS1 script and elevate it.
    // NOTE: runElevatedCommands() wraps each entry with "& ${cmd}" which is
    // only valid for executable invocations — not for PS variable assignments,
    // regex operations, or conditional blocks.  We therefore write a proper
    // script file and Start-Process it ourselves.
    const scriptId   = `sc_pp_dup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const resultPath = path.join(os.tmpdir(), `${scriptId}.txt`);
    const scriptPath = path.join(os.tmpdir(), `${scriptId}.ps1`);
    const safeResultPath = resultPath.replace(/'/g, "''");
    const safeScName     = profile.scName.replace(/'/g, "''");
    const safeScDesc     = (profile.scDesc || 'SwitchControl managed power plan').replace(/'/g, "''");

    const scriptLines = [
      `$ErrorActionPreference = 'Continue'`,
      `try {`,
      `  $raw = & powercfg /duplicatescheme ${baseGuid} 2>&1`,
      `  $out = ($raw | Out-String).Trim()`,
      `  $m   = [regex]::Match($out, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')`,
      `  if ($m.Success) {`,
      `    $guid = $m.Value.ToLower()`,
      `    & powercfg /changename $guid '${safeScName}' '${safeScDesc}' | Out-Null`,
      `    [System.IO.File]::WriteAllText('${safeResultPath}', $guid)`,
      `  }`,
      `} catch { }`,
    ];

    try {
      fs.writeFileSync(scriptPath, scriptLines.join('\r\n'), 'utf8');
      const launchCmd = [
        `Start-Process powershell`,
        `-ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File','${scriptPath.replace(/'/g, "''")}')`,
        `-Verb RunAs -Wait`,
      ].join(' ');
      await new Promise((resolve) => {
        execFile(
          'powershell',
          ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', launchCmd],
          { timeout: 60_000, windowsHide: true },
          () => resolve()   // resolve regardless — result is in resultPath
        );
      });
    } catch (e) {
      console.warn(`[PowerPlan] Non-admin: elevated duplicate script launch failed — ${e.message}`);
    } finally {
      try { fs.unlinkSync(scriptPath); } catch {}
    }

    const deadline = Date.now() + 5000;
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

  // ── Step 3: Build and run setting commands ─────────────────────────────────
  const settingCmds = [];
  for (const [key, value] of Object.entries(profile.settings)) {
    const def = SETTING_DEFS[key];
    if (!def) continue;
    settingCmds.push(`powercfg /setacvalueindex ${schemeGuid} ${def.subgroup} ${def.setting} ${value}`);
    settingCmds.push(`powercfg /setdcvalueindex ${schemeGuid} ${def.subgroup} ${def.setting} ${value}`);
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
    applyResult = { ok: true, failed };
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
    console.warn(`[PowerPlan]   ${failedSettings.length} setting cmd(s) failed:`, failedSettings);
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

  // Priority 1: power-plans.json schemeGuids
  try {
    const storedGuids = Object.values(loadState().schemeGuids || {});
    storedGuids.forEach(g => g && confirmedGuids.add(String(g).toLowerCase()));
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
  activatePlanByGuid,
  listSchemesForFrontend,
  getActivePowerScheme,
  getStoredSchemeGuids,
  deleteAllScPlans,
  verifyRevertClean,
  restoreBuiltinPlanNames,
};
