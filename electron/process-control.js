/**
 * process-control.js — Backend engine for Process Control feature
 *
 * NEVER imported by the renderer. Main.js requires this and registers IPC handlers.
 *
 * DESIGN PRINCIPLES (from user spec corrections):
 *   • Discord is protected (gaming app)
 *   • Microsoft Corporation does NOT protect everything — only when category is
 *     System Core, Audio, Network, Security, or unknown critical path
 *   • CPU from Get-Process is cumulative CPU time, NOT live percentage —
 *     we label it honestly as cpuTimeCumulative and do NOT fake it into %
 *   • toDisableStartup is REMOVED for v1 (not implemented, don't promise it)
 *   • Safe stop uses an ALLOWLIST of known disposable patterns, not a blocklist
 *   • Extreme mode: Main rebuilds plan from latest scan, validates IDs —
 *     never accepts raw plan from renderer (renderer can be compromised)
 *   • No recurring timers. Scan on demand only.
 *   • Double-check isProtected before every single Stop-Process.
 */

'use strict';

const psLimiter = require('./powershell-limiter');

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { APPDATA_DIR } = require('./user-data-paths');

const HISTORY_FILE = path.join(APPDATA_DIR, 'process-control-history.json');
const CACHE_TTL_MS = 30_000;

// ── Protected process names (lowercase, no .exe) ───────────────────────────────────────
const PROTECTED_NAMES = new Set([
  // Windows core
  'system', 'registry', 'idle', 'smss', 'csrss', 'wininit', 'winlogon',
  'services', 'lsass', 'svchost', 'dwm', 'fontdrvhost', 'runtimebroker',
  'searchhost', 'audiosrv', 'audioendpointbuilder', 'audiodg',
  'sessionmanager', 'crss', 'init', 'logonui', 'sihost', 'shellExperienceHost',
  'startmenuexperiencehost', 'textinputhost', 'securityhealthsystray',
  'ctfmon', 'taskhostw', 'conhost', 'dllhost',
  // Nahimic / audio
  'nahimic', 'nahimic32', 'nahimic3', 'nahimicwindowsapp',
  // NVIDIA
  'nvcontainer', 'nvdisplay.container', 'nvidia container',
  // AMD
  'amdow', 'amddvr', 'amdsoftware',
  // Intel
  'igfxem', 'igfxhk', 'igfxtray',
  // Gaming launchers
  'steam', 'steamwebhelper', 'epicgameslauncher', 'epicwebhelper',
  'riotclientservices', 'agent', 'battlenet', 'blizzard', 'eaapp', 'eadesktop',
  'valorant', 'valorant-win64-shipping',
  // Discord — ADDED per user request (gaming app, must be protected)
  'discord', 'discordptb', 'discordcanary', 'discorddevelopment',
  'discordupdater', 'update', // Discord updater
  // Anti-cheat
  'vgc', 'vgk', 'vanguard', 'vgtray',
  'easyanticheat', 'eac', 'easyanticheat.exe',
  'battleye', 'bec', 'battleyelauncher',
  // Browsers — moderate, not protected, but listed for reference
]);

// ── Safe-stop allowlist (v1) ─────────────────────────────────────────────
// ONLY these patterns are safe to stop in v1. Everything else gets lower_priority.
const SAFE_STOP_ALLOWLIST = [
  'updater', 'update', 'autoupdate', 'crashpad', 'crashhandler',
  'crashreporter', 'webhelper', 'helper', 'adobeupdater',
  'teams_updater', 'teamsupdate', 'onedriveupdate',
  'dropboxupdate', 'googleupdate', 'chromeupdate',
  'edgeupdate', 'firefoxupdate', 'operaupdate',
  'nvidiaupdate', 'geforce_experience', 'nvidiashare',
  'msedgewebview2', 'backgroundtaskhost',
  'searchindexer', // Windows search — safe to stop temporarily
];

// ── Publisher checks ──────────────────────────────────────────────────────────────────
// Microsoft Corporation does NOT protect everything.
// It only protects when the process category is System Core, Audio, Network, Security,
// or an unknown critical path.
const TRUSTED_LAUNCHER_PUBLISHERS = [
  'valve corporation',
  'epic games',
  'riot games',
  'blizzard entertainment',
  'electronic arts',
  'ubisoft',
  'discord',
];

const SECURITY_PUBLISHERS = [
  'easy anti-cheat',
  'battleye innovations',
  'vgc',
];

const HARDWARE_PUBLISHERS = [
  'nvidia corporation',
  'advanced micro devices',
  'intel corporation',
];

// ── Module state ──────────────────────────────────────────────────────────────────────────────────
let _lastScan = null;
let _lastBeforeAfter = null;
let _scanInFlight = false;

// ── isProtected ──────────────────────────────────────────────────────────────────────────────────
function isProtected(proc) {
  const name = (proc.ProcessName || proc.name || '').toLowerCase().replace(/\.exe$/, '');
  const publisher = (proc.Company || proc.publisher || '').toLowerCase();

  // 1. Name match — always protected
  if (PROTECTED_NAMES.has(name)) return true;
  if (PROTECTED_NAMES.has(name.replace(/\d+$/, ''))) return true; // svchost1, svchost2, etc.

  // 2. Anti-cheat / security publishers — always protected
  for (const sp of SECURITY_PUBLISHERS) {
    if (publisher.includes(sp)) return true;
  }

  // 3. Trusted launcher publishers — always protected
  for (const lp of TRUSTED_LAUNCHER_PUBLISHERS) {
    if (publisher.includes(lp)) return true;
  }

  // 4. Hardware vendors — always protected (audio/GPU drivers)
  for (const hp of HARDWARE_PUBLISHERS) {
    if (publisher.includes(hp)) return true;
  }

  // 5. Microsoft — ONLY protect when category is System Core, Audio, Network, Security
  if (publisher.includes('microsoft corporation') || publisher.includes('microsoft')) {
    const cat = _guessCategory(name);
    const isCriticalCategory =
      cat === 'System Core' ||
      cat === 'Audio / Voice' ||
      cat === 'Network / VPN' ||
      cat === 'Unknown / Review';
    if (isCriticalCategory) return true;
    // Microsoft apps like Teams, Edge helpers, YourPhone = NOT protected by publisher alone
    return false;
  }

  // 6. Unknown publisher + unknown path — protect (better safe)
  if (!publisher && !proc.Path) return true;

  return false;
}

function _guessCategory(name) {
  const n = name.toLowerCase();
  if (n.includes('audio') || n.includes('sound') || n.includes('nahimic')) return 'Audio / Voice';
  if (n.includes('net') || n.includes('vpn') || n.includes('firewall')) return 'Network / VPN';
  if (n.includes('svchost') || n.includes('lsass') || n.includes('csrss') || n.includes('services') || n.includes('wininit')) return 'System Core';
  return 'Unknown / Review';
}

// ── classifyProcess ──────────────────────────────────────────────────────────────────────────────────
function classifyProcess(raw) {
  const name = (raw.ProcessName || raw.name || '').toLowerCase().replace(/\.exe$/, '');
  const publisher = (raw.Company || raw.publisher || '') || '';
  const pathStr = (raw.Path || raw.path || '') || '';
  const memoryMb = Math.round((raw.WorkingSet || raw.memoryMb || 0) / (1024 * 1024));
  const cpuTimeCumulative = raw.CPU || raw.cpuTimeCumulative || 0; // HONEST: cumulative time, NOT %

  const protectedFlag = isProtected(raw);

  if (protectedFlag) {
    let cat = 'System Core';
    if (name.includes('steam') || name.includes('epic') || name.includes('riot') || name.includes('battlenet') || name.includes('blizzard') || name.includes('ea')) {
      cat = 'Gaming / Launchers';
    } else if (name.includes('audio') || name.includes('nahimic') || name.includes('nvcontainer') || name.includes('audiodg')) {
      cat = 'Audio / Voice';
    } else if (name.includes('discord')) {
      cat = 'Audio / Voice'; // Discord = audio/voice for gaming
    }

    return {
      pid: raw.Id || raw.pid || 0,
      name: raw.ProcessName || raw.name || name,
      displayName: raw.ProcessName || raw.name || name,
      path: pathStr || null,
      publisher: publisher || null,
      cpuTimeCumulative,
      memoryMb,
      category: cat,
      safety: 'protected',
      reason: 'Critical system, gaming launcher, audio/voice, or anti-cheat process',
      recommendedAction: 'none',
      canStop: false,
      canLowerPriority: false,
      isProtected: true,
      risk: 'protected',
      impactScore: 0,
    };
  }

  // Classification by name patterns
  let category = 'Background Apps';
  let safety = 'moderate';
  let recommendedAction = 'lower_priority';
  let reason = 'General background process';

  // Browser / Electron
  if (/chrome|firefox|msedge|brave|opera|vivaldi|arc/.test(name)) {
    category = 'Browser / Electron';
    safety = 'moderate';
    recommendedAction = 'lower_priority';
    reason = 'Browser process — may have active tabs or downloads';
  }
  // Update helpers / disposable
  else if (SAFE_STOP_ALLOWLIST.some(p => name.includes(p))) {
    category = 'Vendor Utilities';
    safety = 'safe';
    recommendedAction = 'stop_process';
    reason = 'Known update helper or disposable background task';
  }
  // Windows bloat
  else if (/yourphone|people|msteams.*background|gamingservices.*|cortana|searchui|onedrive/.test(name)) {
    category = 'Windows Optional';
    safety = 'safe';
    recommendedAction = 'stop_process';
    reason = 'Windows optional component — safe to stop';
  }
  // Unknown
  else if (!publisher && !pathStr) {
    category = 'Unknown / Review';
    safety = 'unknown';
    recommendedAction = 'review_only';
    reason = 'Unknown publisher and path — requires review';
  }

  // impactScore: weighted by memory (we don't have honest CPU %)
  const impactScore = Math.min(100, Math.round((memoryMb / 200) * 100));

  const canStop = safety === 'safe' && recommendedAction === 'stop_process';
  const canLowerPriority = safety !== 'protected' && safety !== 'unknown';

  return {
    pid: raw.Id || raw.pid || 0,
    name: raw.ProcessName || raw.name || name,
    displayName: raw.ProcessName || raw.name || name,
    path: pathStr || null,
    publisher: publisher || null,
    cpuTimeCumulative,
    memoryMb,
    category,
    safety,
    reason,
    recommendedAction,
    canStop,
    canLowerPriority,
    isProtected: false,
    risk: safety,
    impactScore,
  };
}

// ── scan ───────────────────────────────────────────────────────────────────────────────────────────────────────────
async function scan() {
  // 1. Cache check
  if (_lastScan && Date.now() - _lastScan.timestamp < CACHE_TTL_MS) {
    console.log('[ProcessControl:Scan] cache hit — returning cached result');
    return _lastScan;
  }

  // 2. Single-flight guard
  if (_scanInFlight) {
    console.log('[ProcessControl:Scan] scan already in flight — waiting');
    // Wait up to 20s for in-flight scan
    let waited = 0;
    while (_scanInFlight && waited < 20_000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }
    if (_lastScan) return _lastScan;
  }

  _scanInFlight = true;
  const startMs = Date.now();

  try {
    // 3. Run PowerShell command
    const psCmd = `
      $procs = Get-Process | Select-Object Id, ProcessName, Path, @{N='WorkingSet';E={[math]::Round($_.WorkingSet64)}}, @{N='CPU';E={if ($_.CPU) { [math]::Round($_.CPU, 2) } else { 0 }}}, @{N='Company';E={$_.Company}};
      ConvertTo-Json -Compress -Depth 3 $procs
    `;

    const slot = psLimiter.tryAcquire({ file: 'process-control.js', fn: 'scan', reason: 'process-scan' });
    if (!slot) {
      console.warn('[ProcessControl:Scan] psLimiter busy — returning cache or empty');
      _scanInFlight = false;
      return _lastScan || _safeEmptyResult();
    }
    let result;
    try {
      result = await _runPowerShell(psCmd, 15_000);
    } finally {
      psLimiter.release(slot);
    }
    let rawProcs = [];
    try {
      rawProcs = JSON.parse(result.stdout);
      if (!Array.isArray(rawProcs)) rawProcs = [rawProcs];
    } catch (e) {
      console.error('[ProcessControl:Scan] JSON parse failed:', e.message);
      return _safeEmptyResult();
    }

    // 4. Classify
    const processes = rawProcs.map(classifyProcess);
    const protectedCount = processes.filter(p => p.isProtected).length;
    const backgroundProcesses = processes.filter(p => !p.isProtected).length;

    // 5. Summary scores (honest — no fake CPU %)
    const nonProtected = processes.filter(p => !p.isProtected);
    const backgroundLoadScore = nonProtected.length > 0
      ? Math.min(100, Math.round(nonProtected.reduce((s, p) => s + p.memoryMb, 0) / 20))
      : 0;

    const startupWeightScore = Math.min(100, nonProtected.filter(p => p.category === 'Startup Weight').length * 15);

    const safeStoppable = nonProtected.filter(p => p.safety === 'safe' && p.recommendedAction === 'stop_process');
    const estimatedReductionPotential = nonProtected.length > 0
      ? Math.round(safeStoppable.reduce((s, p) => s + p.impactScore, 0) / nonProtected.length)
      : 0;

    const scanResult = {
      timestamp: Date.now(),
      totalProcesses: processes.length,
      backgroundProcesses,
      protectedCount,
      backgroundLoadScore,
      startupWeightScore,
      estimatedReductionPotential,
      processes,
      scanDurationMs: Date.now() - startMs,
    };

    _lastScan = scanResult;
    console.log(`[ProcessControl:Scan] complete — total=${processes.length} protected=${protectedCount} safe=${safeStoppable.length} duration=${scanResult.scanDurationMs}ms`);
    return scanResult;
  } catch (err) {
    console.error('[ProcessControl:Scan] error:', err.message);
    const empty = _safeEmptyResult();
    empty.error = err.message;
    return empty;
  } finally {
    _scanInFlight = false;
  }
}

function _safeEmptyResult() {
  return {
    timestamp: Date.now(),
    totalProcesses: 0,
    backgroundProcesses: 0,
    protectedCount: 0,
    backgroundLoadScore: 0,
    startupWeightScore: 0,
    estimatedReductionPotential: 0,
    processes: [],
    scanDurationMs: 0,
    error: true,
  };
}

function _runPowerShell(cmd, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    execFile('powershell', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass', '-Command', cmd,
    ], {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

// ── buildPlan (dry-run preview) ───────────────────────────────────────────────────────────────────────────────────
function buildPlan(scanResult, profile) {
  if (!scanResult || !scanResult.processes) {
    return { toStop: [], toLowerPriority: [], protected: [], profile, estimatedRamFreedMb: 0, estimatedCpuReduction: 0 };
  }

  const all = scanResult.processes;
  const neverTouchCats = new Set(['System Core', 'Audio / Voice', 'Network / VPN', 'Gaming / Launchers']);

  // Safe: only safe-stoppable processes
  let candidates = [];
  if (profile === 'safe') {
    candidates = all.filter(p =>
      !p.isProtected &&
      p.safety === 'safe' &&
      p.recommendedAction === 'stop_process' &&
      !neverTouchCats.has(p.category)
    );
  }
  // Competitive: safe + moderate lower_priority
  else if (profile === 'competitive') {
    const safeStop = all.filter(p =>
      !p.isProtected &&
      p.safety === 'safe' &&
      p.recommendedAction === 'stop_process' &&
      !neverTouchCats.has(p.category)
    );
    const moderateLower = all.filter(p =>
      !p.isProtected &&
      p.safety === 'moderate' &&
      p.recommendedAction === 'lower_priority' &&
      !neverTouchCats.has(p.category)
    );
    candidates = [...safeStop, ...moderateLower];
  }
  // Extreme: competitive + Windows Optional moderate
  else if (profile === 'extreme') {
    const safeStop = all.filter(p =>
      !p.isProtected &&
      p.safety === 'safe' &&
      p.recommendedAction === 'stop_process' &&
      !neverTouchCats.has(p.category)
    );
    const moderateLower = all.filter(p =>
      !p.isProtected &&
      p.safety === 'moderate' &&
      p.recommendedAction === 'lower_priority' &&
      !neverTouchCats.has(p.category)
    );
    const windowsOpt = all.filter(p =>
      !p.isProtected &&
      p.category === 'Windows Optional' &&
      p.safety === 'moderate' &&
      !neverTouchCats.has(p.category)
    );
    candidates = [...safeStop, ...moderateLower, ...windowsOpt];
  }

  // Final safety net: isProtected double-check
  const toStop = candidates.filter(p => p.recommendedAction === 'stop_process' && !isProtected(p));
  const toLowerPriority = candidates.filter(p => p.recommendedAction === 'lower_priority' && !isProtected(p));
  const protectedList = all.filter(p => p.isProtected || isProtected(p));

  const estimatedRamFreedMb = toStop.reduce((s, p) => s + p.memoryMb, 0);
  const estimatedCpuReduction = 0; // Honest: we cannot estimate from cumulative CPU time

  const plan = {
    toStop,
    toLowerPriority,
    protected: protectedList,
    profile,
    estimatedRamFreedMb,
    estimatedCpuReduction,
  };

  console.log(`[ProcessControl:Plan] profile=${profile} toStop=${toStop.length} toLowerPriority=${toLowerPriority.length} protected=${protectedList.length}`);
  return plan;
}

// ── applyPlan ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function applyPlan(plan) {
  console.log(`[ProcessControl:Apply] starting profile=${plan.profile}`);

  const before = {
    processCount: _lastScan?.totalProcesses || 0,
    backgroundLoad: _lastScan?.backgroundLoadScore || 0,
    startupWeight: _lastScan?.startupWeightScore || 0,
  };

  const stopped = [];
  const priorityLowered = [];
  const errors = [];

  // Stop processes
  for (const proc of plan.toStop) {
    // DOUBLE-CHECK isProtected before every single action
    if (isProtected({ ProcessName: proc.name, Company: proc.publisher, Path: proc.path })) {
      console.log(`[ProcessControl:Apply] SKIPPED protected process ${proc.name} (pid=${proc.pid})`);
      continue;
    }

    const slotStop = psLimiter.tryAcquire({ file: 'process-control.js', fn: 'applyPlan:stop', reason: 'stop-process' });
    if (!slotStop) {
      errors.push({ name: proc.name, pid: proc.pid, error: 'System is busy, try again shortly.' });
      continue;
    }
    try {
      await _runPowerShell(`Stop-Process -Id ${proc.pid} -Force -ErrorAction Stop`, 5_000);
      stopped.push(proc.name);
      console.log(`[ProcessControl:Apply] stopped ${proc.name} (pid=${proc.pid})`);
    } catch (err) {
      errors.push({ name: proc.name, pid: proc.pid, error: err.message });
      console.error(`[ProcessControl:Apply] failed to stop ${proc.name} (pid=${proc.pid}): ${err.message}`);
    } finally {
      psLimiter.release(slotStop);
    }
  }

  // Lower priority
  for (const proc of plan.toLowerPriority) {
    if (isProtected({ ProcessName: proc.name, Company: proc.publisher, Path: proc.path })) {
      console.log(`[ProcessControl:Apply] SKIPPED protected process ${proc.name} (pid=${proc.pid})`);
      continue;
    }

    const slotLower = psLimiter.tryAcquire({ file: 'process-control.js', fn: 'applyPlan:lower', reason: 'lower-priority' });
    if (!slotLower) {
      errors.push({ name: proc.name, pid: proc.pid, error: 'System is busy, try again shortly.' });
      continue;
    }
    try {
      await _runPowerShell(`(Get-Process -Id ${proc.pid} -ErrorAction Stop).PriorityClass = 'BelowNormal'`, 5_000);
      priorityLowered.push(proc.name);
      console.log(`[ProcessControl:Apply] lowered priority ${proc.name} (pid=${proc.pid})`);
    } catch (err) {
      errors.push({ name: proc.name, pid: proc.pid, error: err.message });
      console.error(`[ProcessControl:Apply] failed to lower priority ${proc.name} (pid=${proc.pid}): ${err.message}`);
    } finally {
      psLimiter.release(slotLower);
    }
  }

  // Wait 2s, then lightweight rescan
  await new Promise(r => setTimeout(r, 2_000));
  let afterScan = null;
  try {
    afterScan = await scan();
  } catch (e) {
    console.error('[ProcessControl:Apply] post-action rescan failed:', e.message);
  }

  const after = {
    processCount: afterScan?.totalProcesses || before.processCount - stopped.length,
    backgroundLoad: afterScan?.backgroundLoadScore || Math.max(0, before.backgroundLoad - plan.toStop.reduce((s, p) => s + p.impactScore * 0.5, 0)),
    startupWeight: afterScan?.startupWeightScore || before.startupWeight,
  };

  const ramFreedMb = plan.toStop.reduce((s, p) => s + p.memoryMb, 0);

  const beforeAfter = {
    processCountBefore: before.processCount,
    processCountAfter: after.processCount,
    backgroundLoadBefore: before.backgroundLoad,
    backgroundLoadAfter: after.backgroundLoad,
    startupWeightBefore: before.startupWeight,
    startupWeightAfter: after.startupWeight,
    ramFreedMb,
    cpuReductionCumulative: 0, // Honest: we don't measure live CPU %
    actionsApplied: stopped.length + priorityLowered.length,
    restorable: stopped.length > 0 || priorityLowered.length > 0,
  };

  _lastBeforeAfter = beforeAfter;

  // Save restore record atomically
  const record = {
    appliedAt: new Date().toISOString(),
    profile: plan.profile,
    actionsApplied: { stopped, priorityLowered },
    restorable: beforeAfter.restorable,
  };
  _atomicWriteJson(HISTORY_FILE, record);

  console.log(`[ProcessControl:Apply] complete — stopped=${stopped.length} priorityLowered=${priorityLowered.length} errors=${errors.length}`);
  return beforeAfter;
}

// ── restoreLast ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function restoreLast() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return { ok: false, reason: 'No restore point found' };
  }

  let record;
  try {
    record = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (e) {
    return { ok: false, reason: 'Restore file is corrupted' };
  }

  const restored = [];
  const failed = [];

  // Restore priority changes
  for (const name of record.actionsApplied?.priorityLowered || []) {
    const slotRestore = psLimiter.tryAcquire({ file: 'process-control.js', fn: 'restoreLast:priority', reason: 'restore-priority' });
    if (!slotRestore) {
      failed.push({ name, action: 'priority_restore', reason: 'System is busy, try again shortly.' });
      continue;
    }
    try {
      // Find process by name and restore to Normal
      await _runPowerShell(`$p = Get-Process -Name '${name.replace(/'/g, "''")}' -ErrorAction SilentlyContinue; if ($p) { $p.PriorityClass = 'Normal' }`, 5_000);
      restored.push({ name, action: 'priority_restored' });
      console.log(`[ProcessControl:Restore] restored priority for ${name}`);
    } catch (err) {
      failed.push({ name, action: 'priority_restore', reason: err.message });
      console.error(`[ProcessControl:Restore] failed to restore priority for ${name}: ${err.message}`);
    } finally {
      psLimiter.release(slotRestore);
    }
  }

  // Cannot restart stopped processes automatically — log what we cannot do
  for (const name of record.actionsApplied?.stopped || []) {
    failed.push({ name, action: 'restart', reason: 'Process restart requires manual relaunch or known safe path' });
  }

  return {
    ok: true,
    restored,
    failed,
    record,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ── terminate (individual process kill with protected check) ───────────────────────────────
async function terminate(pid) {
  // Find the process in the latest scan
  const proc = _lastScan?.processes?.find(p => p.pid === pid);
  if (!proc) {
    return { ok: false, error: 'Process not found in latest scan. Run a scan first.' };
  }

  // DOUBLE-CHECK isProtected before any termination
  if (isProtected({ ProcessName: proc.name, Company: proc.publisher, Path: proc.path })) {
    return { ok: false, error: 'Cannot terminate protected process: ' + proc.name };
  }

  const slot = psLimiter.tryAcquire({ file: 'process-control.js', fn: 'terminate', reason: 'terminate-process' });
  if (!slot) return { ok: false, error: 'System is busy, try again shortly.' };
  try {
    await _runPowerShell(`Stop-Process -Id ${pid} -Force -ErrorAction Stop`, 5_000);
    console.log(`[ProcessControl:Terminate] stopped pid=${pid} name=${proc.name}`);
    return { ok: true, name: proc.name, pid };
  } catch (err) {
    console.error(`[ProcessControl:Terminate] failed pid=${pid}:`, err.message);
    return { ok: false, error: err.message, name: proc.name, pid };
  } finally {
    psLimiter.release(slot);
  }
}

function getLastResult() {
  return {
    scan: _lastScan,
    beforeAfter: _lastBeforeAfter,
  };
}

function getProtectedList() {
  return Array.from(PROTECTED_NAMES);
}

function _atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpFile = filePath + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, filePath);
}

// ── Exports ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
module.exports = {
  scan,
  buildPlan,
  applyPlan,
  restoreLast,
  getLastResult,
  getProtectedList,
  isProtected,
  terminate,
  PROTECTED_NAMES,
};
