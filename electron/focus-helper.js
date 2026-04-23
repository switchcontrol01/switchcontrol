/**
 * focus-helper.js
 * Real Focus Mode system actions via PowerShell + registry
 * Safety: never kills critical OS processes, all actions fully reversible
 */

const { ipcMain } = require('electron');
const { execFile } = require('child_process');
const psLimiter = require('./powershell-limiter');

// ── Safety constants ───────────────────────────────────────────────────────────

// Critical processes: NEVER touch these under any circumstances
const PROCESS_DENYLIST = new Set([
  'svchost', 'lsass', 'csrss', 'wininit', 'winlogon', 'services', 'smss',
  'System', 'Registry', 'MemCompression', 'ntoskrnl', 'dwm', 'explorer',
  'audiodg', 'spoolsv', 'wuauclt', 'MsMpEng', 'taskhostw', 'RuntimeBroker',
  'ctfmon', 'sihost', 'fontdrvhost', 'conhost', 'dllhost',
  // Anti-cheat/game security (never suspend)
  'EasyAntiCheat', 'vgtray', 'VALORANT', 'BattlEye', 'EAC',
  // Driver services
  'igfxEM', 'nvdisplay', 'atieclxx',
  // SwitchControl itself
  'SwitchControl', 'electron',
]);

// Known overlay processes (safe to kill — they auto-restart)
const OVERLAY_TARGETS = [
  'DiscordOverlayHelper', 'overlay_host_process', 'OverlayAgent',
  'GameOverlayUI',       // Steam overlay
  'GameBar', 'GameBarFTServer', 'Xbox', // Xbox Game Bar
];

// Known non-essential background processes (safe to de-prioritize)
const BACKGROUND_TARGETS = [
  'Discord', 'Spotify', 'OneDrive', 'Teams', 'Slack', 'zoom',
  'chrome', 'msedge', 'firefox', 'opera',
  'EpicGamesLauncher', 'UbisoftConnect', 'GalaxyClient',
  'AmazonSendToKindle', 'Dropbox', 'googledrivesync',
  'SearchApp', 'SearchHost', 'StartMenuExperienceHost',
  'MicrosoftEdgeUpdate', 'GoogleUpdate', 'SteamWebHelper',
];

// High-performance power plan GUID
const HP_PLAN_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

// Known game process names for trigger detection
const KNOWN_GAME_PROCESSES = [
  'csgo', 'cs2', 'VALORANT-Win64-Shipping', 'FortniteClient-Win64-Shipping',
  'R5Apex', 'RainbowSix', 'ModernWarfare', 'Warzone', 'GTA5', 'RocketLeague',
  'eldenring', 'Cyberpunk2077', 'HogwartsLegacy', 'AlanWake2',
  'overwatch', 'Overwatch', 'dota2', 'tf2', 'hl2', 'portal2',
  'minecraft', 'javaw', 'Fallout4', 'SkyrimSE', 'witcher3',
  'destiny2', 'EscapeFromTarkov', 'DayZ', 'PubgClient',
];

// ── PowerShell executor ────────────────────────────────────────────────────────
// Uses execFile (not exec) + windowsHide:true so no shell or console window
// is ever visible to the user, even briefly.
// Diagnostic counter — every powershell.exe spawn from this file increments this.
let _focus_psCount = 0;

function ps(script) {
  const id = ++_focus_psCount;
  const t0 = Date.now();
  console.log(`[PS:focus-helper] #${id} ps() SPAWN ts=${t0}`);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
       '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { timeout: 8000, windowsHide: true },
      (err, stdout, stderr) => {
        console.log(`[PS:focus-helper] #${id} ps() ${err ? 'FAIL' : 'OK'} ${Date.now() - t0}ms`);
        if (err) {
          resolve({ ok: false, output: '', error: err.message });
        } else {
          resolve({ ok: true, output: (stdout || '').trim(), error: (stderr || '').trim() });
        }
      }
    );
  });
}

// ── Action implementations ─────────────────────────────────────────────────────

/**
 * NOTIFICATIONS — Toggle via registry + Focus Assist
 * Key: HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\PushNotifications
 * Value: ToastEnabled (DWORD) 1=on, 0=off
 */
async function setNotificationsEnabled(enabled) {
  const val = enabled ? 1 : 0;
  const result = await ps(`
    $key = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PushNotifications'
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name 'ToastEnabled' -Value ${val} -Type DWord -Force
    $verify = Get-ItemPropertyValue -Path $key -Name 'ToastEnabled' -ErrorAction SilentlyContinue
    Write-Output "ToastEnabled=$verify"
  `);
  const verified = result.output.includes(`ToastEnabled=${val}`);
  return { ok: verified, action: 'notifications', enabled, result };
}

async function getPreviousNotificationState() {
  const result = await ps(`
    $key = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PushNotifications'
    $val = Get-ItemPropertyValue -Path $key -Name 'ToastEnabled' -ErrorAction SilentlyContinue
    if ($null -eq $val) { Write-Output "1" } else { Write-Output $val }
  `);
  return parseInt(result.output.trim()) !== 0;
}

/**
 * OVERLAYS — Kill overlay processes (they auto-restart on next game/app launch)
 */
async function killOverlays() {
  const killed = [];
  const failed = [];

  for (const target of OVERLAY_TARGETS) {
    const result = await ps(`
      $procs = Get-Process -Name '${target}' -ErrorAction SilentlyContinue
      if ($procs) {
        $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        Write-Output "killed:${target}"
      } else {
        Write-Output "notfound:${target}"
      }
    `);
    if (result.output.includes(`killed:${target}`)) killed.push(target);
    else failed.push({ name: target, notFound: true });
  }

  return { ok: true, action: 'overlays', killed, failed };
}

/**
 * BACKGROUND APPS — Lower priority of non-essential processes to BelowNormal
 * Completely safe: processes continue running, just deprioritized
 * Revert: Restore to Normal priority
 */
async function setBackgroundAppPriority(priority) {
  // priority: 'BelowNormal' to suppress, 'Normal' to restore
  const deprioritized = [];

  for (const target of BACKGROUND_TARGETS) {
    const result = await ps(`
      $procs = Get-Process -Name '${target}' -ErrorAction SilentlyContinue
      if ($procs) {
        $procs | ForEach-Object {
          try { $_.PriorityClass = '${priority}'; Write-Output "ok:${target}" }
          catch { Write-Output "fail:${target}" }
        }
      }
    `);
    if (result.output.includes(`ok:${target}`)) deprioritized.push(target);
  }

  return { ok: true, action: 'backgroundApps', priority, deprioritized };
}

/**
 * POWER LOCK — Switch power plan to High Performance
 * Stores previous plan for revert
 */
async function getCurrentPowerPlan() {
  const result = await ps(`
    $plan = powercfg /getactivescheme
    $guid = ($plan -split ' ')[3]
    Write-Output $guid
  `);
  return result.output.trim() || 'balanced';
}

async function setPowerPlan(guid) {
  const result = await ps(`
    powercfg /setactive ${guid}
    $active = powercfg /getactivescheme
    Write-Output $active
  `);
  const verified = result.output.toLowerCase().includes(guid.toLowerCase());
  return { ok: verified, action: 'powerLock', plan: guid, result };
}

/**
 * INPUT LOCKDOWN — Suppress Win key via registry policy
 * Key: HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer
 * Value: NoWinKeys (DWORD) 1=block, 0=allow
 * Note: Requires Explorer restart to take full effect; does not block Ctrl+Shift+Esc
 */
async function setInputLockdown(enabled) {
  const val = enabled ? 1 : 0;
  const result = await ps(`
    $key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer'
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name 'NoWinKeys' -Value ${val} -Type DWord -Force
    $verify = Get-ItemPropertyValue -Path $key -Name 'NoWinKeys' -ErrorAction SilentlyContinue
    Write-Output "NoWinKeys=$verify"
  `);
  const verified = result.output.includes(`NoWinKeys=${val}`);
  return { ok: verified, action: 'inputLockdown', enabled, result };
}

async function getPreviousInputLockState() {
  const result = await ps(`
    $key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer'
    $val = Get-ItemPropertyValue -Path $key -Name 'NoWinKeys' -ErrorAction SilentlyContinue
    if ($null -eq $val) { Write-Output "0" } else { Write-Output $val }
  `);
  return parseInt(result.output.trim()) === 1;
}

/**
 * VERIFY — Check current system state for each toggle
 */
async function verifyState() {
  const result = await ps(`
    # Notifications
    $notifKey = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PushNotifications'
    $toastEnabled = (Get-ItemPropertyValue -Path $notifKey -Name 'ToastEnabled' -ErrorAction SilentlyContinue)
    $notifOff = ($null -ne $toastEnabled -and $toastEnabled -eq 0)

    # Power plan
    $activePlan = (powercfg /getactivescheme)
    $isHighPerf = $activePlan -like '*${HP_PLAN_GUID}*'

    # Input lockdown
    $inputKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer'
    $noWinKeys = (Get-ItemPropertyValue -Path $inputKey -Name 'NoWinKeys' -ErrorAction SilentlyContinue)
    $inputLocked = ($null -ne $noWinKeys -and $noWinKeys -eq 1)

    # Active overlay procs
    $overlayProcs = @('DiscordOverlayHelper','GameOverlayUI','GameBar') | 
      ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue }
    $overlaysRunning = ($overlayProcs | Measure-Object).Count -gt 0

    Write-Output "notificationsOff=$notifOff|powerHighPerf=$isHighPerf|inputLocked=$inputLocked|overlaysRunning=$overlaysRunning"
  `);

  const line = result.output;
  const parse = (key) => {
    const m = line.match(new RegExp(`${key}=(True|False|true|false)`, 'i'));
    return m ? m[1].toLowerCase() === 'true' : null;
  };

  return {
    ok: result.ok,
    verified: {
      notificationsOff: parse('notificationsOff'),
      powerHighPerf: parse('powerHighPerf'),
      inputLocked: parse('inputLocked'),
      overlaysRunning: parse('overlaysRunning'),
    },
    raw: line,
  };
}

// ── Trigger monitor ────────────────────────────────────────────────────────────

// triggerIntervalId removed — trigger polling now uses a safe async loop (_triggerLoop)
let triggerCallback = null;
let lastTriggerState = {
  gameProcess: null,
  fullscreen: false,
  controllerConnected: false,
  headsetConnected: false,
};
let enabledTriggers = {};
let triggerWindow = null; // renderer window for sending events
let _isSeedPoll = false;  // true for the very first poll — establishes baseline without firing

// Safe async trigger loop — replaces setInterval so each poll only starts after
// the previous one fully completes (including all PowerShell trigger checks).
// Set _triggerLoopActive = false to stop cleanly between polls.
let _triggerLoopActive = false;
let _triggerLoopGen   = 0; // increments on restart to orphan old loop iterations

async function _triggerLoop(gen) {
  while (_triggerLoopActive && gen === _triggerLoopGen && triggerCallback) {
    await pollTriggers();
    if (_triggerLoopActive && gen === _triggerLoopGen) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  console.log(`[FocusHelper] trigger async loop gen=${gen} exited`);
}

async function pollTriggers() {
  if (!triggerCallback) return;
  const _token = psLimiter.tryAcquire({ file: 'focus-helper.js', fn: 'pollTriggers', reason: 'trigger-poll' });
  if (!_token) return; // previous poll still in flight — loop will retry after 5s sleep

  try {

  // Consume the seed flag: first poll only records state, never fires callbacks.
  const isSeed = _isSeedPoll;
  _isSeedPoll = false;

  // Game launch trigger
  if (enabledTriggers.game_launch) {
    const result = await ps(`
      $gameProcs = @(${KNOWN_GAME_PROCESSES.map(g => `'${g}'`).join(',')})
      $found = $gameProcs | ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue } | Select-Object -First 1
      if ($found) { Write-Output "game:$($found.ProcessName)" } else { Write-Output "game:none" }
    `);
    const line = result.output;
    const match = line.match(/^game:(.+)$/);
    const current = match && match[1] !== 'none' ? match[1] : null;
    if (current && !lastTriggerState.gameProcess) {
      lastTriggerState.gameProcess = current;
      if (!isSeed) triggerCallback('game_launch', { processName: current });
    } else if (!current) {
      lastTriggerState.gameProcess = null;
    }
  }

  // Fullscreen trigger
  if (enabledTriggers.fullscreen) {
    const result = await ps(`
      Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinUtil {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, ref RECT r);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int idx);
    public struct RECT { public int L,T,R,B; }
    public static bool IsFullscreen() {
        var hwnd = GetForegroundWindow();
        if(hwnd == IntPtr.Zero) return false;
        var r = new RECT();
        GetWindowRect(hwnd, ref r);
        int sw = GetSystemMetrics(0); int sh = GetSystemMetrics(1);
        return (r.R - r.L) >= sw && (r.B - r.T) >= sh;
    }
}
'@ -ErrorAction SilentlyContinue
      try { if ([WinUtil]::IsFullscreen()) { Write-Output "fullscreen:true" } else { Write-Output "fullscreen:false" } }
      catch { Write-Output "fullscreen:false" }
    `);
    const isFullscreen = result.output.includes('fullscreen:true');
    if (isFullscreen && !lastTriggerState.fullscreen) {
      lastTriggerState.fullscreen = true;
      if (!isSeed) triggerCallback('fullscreen', {});
    } else if (!isFullscreen) {
      lastTriggerState.fullscreen = false;
    }
  }

  // Controller connected trigger
  if (enabledTriggers.controller) {
    const result = await ps(`
      $ctrl = Get-PnpDevice -Class 'HIDClass' -Status 'OK' -ErrorAction SilentlyContinue | 
        Where-Object { $_.FriendlyName -match 'Gamepad|Controller|Xbox|DualShock|DualSense|XINPUT' } |
        Select-Object -First 1
      if ($ctrl) { Write-Output "ctrl:$($ctrl.FriendlyName)" } else { Write-Output "ctrl:none" }
    `);
    const hasController = !result.output.includes('ctrl:none');
    if (hasController && !lastTriggerState.controllerConnected) {
      lastTriggerState.controllerConnected = true;
      if (!isSeed) triggerCallback('controller', {});
    } else if (!hasController) {
      lastTriggerState.controllerConnected = false;
    }
  }

  // Headset trigger
  if (enabledTriggers.headset) {
    const result = await ps(`
      $audio = Get-PnpDevice -Class 'AudioEndpoint' -Status 'OK' -ErrorAction SilentlyContinue |
        Where-Object { $_.FriendlyName -match 'Headset|Headphones|HyperX|SteelSeries|Logitech|Razer|Corsair|Astro|Turtle Beach' } |
        Select-Object -First 1
      if ($audio) { Write-Output "headset:$($audio.FriendlyName)" } else { Write-Output "headset:none" }
    `);
    const hasHeadset = !result.output.includes('headset:none');
    if (hasHeadset && !lastTriggerState.headsetConnected) {
      lastTriggerState.headsetConnected = true;
      if (!isSeed) triggerCallback('headset', {});
    } else if (!hasHeadset) {
      lastTriggerState.headsetConnected = false;
    }
  }

  } finally {
    psLimiter.release(_token);
  }
}

// ── IPC handlers ───────────────────────────────────────────────────────────────

ipcMain.handle('focus:apply', async (event, { settings, previousState }) => {
  const results = {};
  const applied = {};

  try {
    if (settings.notifications) {
      const prev = await getPreviousNotificationState();
      applied.notifications_prev = prev;
      const r = await setNotificationsEnabled(false);
      results.notifications = r;
    }

    if (settings.overlays) {
      const r = await killOverlays();
      results.overlays = r;
    }

    if (settings.backgroundApps) {
      const r = await setBackgroundAppPriority('BelowNormal');
      results.backgroundApps = r;
    }

    if (settings.powerLock) {
      const prev = await getCurrentPowerPlan();
      applied.powerLock_prev = prev;
      const r = await setPowerPlan(HP_PLAN_GUID);
      results.powerLock = r;
    }

    if (settings.inputLockdown) {
      const prev = await getPreviousInputLockState();
      applied.inputLockdown_prev = prev;
      const r = await setInputLockdown(true);
      results.inputLockdown = r;
    }

    const verification = await verifyState();

    return {
      ok: true,
      results,
      applied,
      verification,
    };
  } catch (err) {
    return { ok: false, error: err.message, results };
  }
});

ipcMain.handle('focus:revert', async (event, { settings, previousState }) => {
  const results = {};

  try {
    if (settings.notifications) {
      const prevEnabled = previousState?.notifications_prev !== false;
      const r = await setNotificationsEnabled(prevEnabled);
      results.notifications = r;
    }

    if (settings.backgroundApps) {
      const r = await setBackgroundAppPriority('Normal');
      results.backgroundApps = r;
    }

    if (settings.powerLock) {
      const prevPlan = previousState?.powerLock_prev || 'balanced';
      // Try to restore previous plan; fall back to balanced if unknown
      const restorePlan = prevPlan.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
        ? prevPlan.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)[0]
        : '381b4222-f694-41f0-9685-ff5bb260df2e'; // Balanced
      const r = await setPowerPlan(restorePlan);
      results.powerLock = r;
    }

    if (settings.inputLockdown) {
      const r = await setInputLockdown(false);
      results.inputLockdown = r;
    }

    const verification = await verifyState();

    return { ok: true, results, verification };
  } catch (err) {
    return { ok: false, error: err.message, results };
  }
});

ipcMain.handle('focus:verify', async () => {
  const result = await verifyState();
  return result;
});

ipcMain.handle('focus:startTriggerMonitor', async (event, { triggers }) => {
  enabledTriggers = Object.fromEntries(
    Object.entries(triggers).filter(([, v]) => v)
  );
  lastTriggerState = { gameProcess: null, fullscreen: false, controllerConnected: false, headsetConnected: false };
  triggerWindow = event.sender;

  // Stop any previously running loop before starting a new one
  _triggerLoopActive = false;

  const activeTriggerCount = Object.values(enabledTriggers).filter(Boolean).length;
  if (activeTriggerCount === 0) return { ok: true, monitoring: false };

  triggerCallback = (triggerId, meta) => {
    try {
      event.sender.send('focus:triggerFired', { triggerId, meta, timestamp: Date.now() });
    } catch {}
  };

  // Start safe async loop — next poll only begins after previous one fully completes
  _isSeedPoll = true;  // first poll only records baseline — does not fire callbacks
  _triggerLoopActive = true;
  _triggerLoopGen++;
  console.log(`[FocusHelper] trigger async loop gen=${_triggerLoopGen} started (${activeTriggerCount} trigger(s))`);
  _triggerLoop(_triggerLoopGen); // fire-and-forget

  return { ok: true, monitoring: true, triggers: enabledTriggers };
});

ipcMain.handle('focus:stopTriggerMonitor', async () => {
  _triggerLoopActive = false; // signals the loop to exit after current poll completes
  triggerCallback = null;
  console.log('[FocusHelper] trigger async loop stop requested');
  return { ok: true };
});

// Schedule trigger check — runs every minute, called externally if schedule trigger enabled
ipcMain.handle('focus:checkSchedule', async (event, { hour, minute }) => {
  const now = new Date();
  const matches = now.getHours() === hour && now.getMinutes() === minute;
  return { ok: true, matches };
});

console.log('[FocusHelper] IPC handlers registered');
