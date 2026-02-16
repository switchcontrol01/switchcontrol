const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TWEAK_STATE_FILE = path.join(process.env.APPDATA || '', 'SwitchControl', 'tweak-state.json');
const TWEAK_LOG_FILE = path.join(process.env.APPDATA || '', 'SwitchControl', 'tweak-log.txt');

function ensureStateDir() {
  const dir = path.dirname(TWEAK_STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function logAction(action, tweakId, result) {
  try {
    ensureStateDir();
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${action} ${tweakId}: ${JSON.stringify(result)}\n`;
    fs.appendFileSync(TWEAK_LOG_FILE, logLine);
  } catch (e) {
    console.error('[TweakExecutor] Failed to log:', e);
  }
}

function getWindowsBuild() {
  try {
    return os.release();
  } catch (e) {
    return 'unknown';
  }
}

function loadState() {
  try {
    ensureStateDir();
    if (fs.existsSync(TWEAK_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(TWEAK_STATE_FILE, 'utf8'));
      return {
        meta: data.meta || { windowsBuild: getWindowsBuild(), lastVerified: null },
        tweaks: data.tweaks || {},
      };
    }
  } catch (e) {
    console.error('[TweakExecutor] Failed to load state:', e);
  }
  return { 
    meta: { windowsBuild: getWindowsBuild(), lastVerified: null },
    tweaks: {} 
  };
}

function saveState(state) {
  try {
    ensureStateDir();
    state.meta.windowsBuild = getWindowsBuild();
    state.meta.lastVerified = new Date().toISOString();
    fs.writeFileSync(TWEAK_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[TweakExecutor] Failed to save state:', e);
  }
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    const wrappedCommand = `try { ${command}; exit 0 } catch { Write-Error $_.Exception.Message; exit 1 }`;
    
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', wrappedCommand], { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        const errorMsg = stderr?.trim() || stdout?.trim() || error.message;
        console.error('[TweakExecutor] PowerShell error:', errorMsg);
        reject(new Error(errorMsg));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function checkPowerShell(command) {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { timeout: 10000 }, (error, stdout) => {
      if (error) {
        resolve(false);
      } else {
        const result = stdout.trim().toLowerCase();
        resolve(result === 'true');
      }
    });
  });
}

// Tier A tweaks - safe, user-level, no admin required
const TIER_A_TWEAKS = {
  'gaming-mode': {
    name: 'Game Mode',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -Value 1 -Type DWord -Force -ErrorAction Stop`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -Value 0 -Type DWord -Force -ErrorAction Stop`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -ErrorAction SilentlyContinue).AutoGameModeEnabled -eq 1`,
    requiresAdmin: false,
    requiresReboot: false,
  },
  'notifications': {
    name: 'Disable Notifications',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" -Name "ToastEnabled" -Value 0 -Type DWord -Force -ErrorAction Stop`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" -Name "ToastEnabled" -Value 1 -Type DWord -Force -ErrorAction Stop`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" -Name "ToastEnabled" -ErrorAction SilentlyContinue).ToastEnabled -eq 0`,
    requiresAdmin: false,
    requiresReboot: false,
  },
  'copilot': {
    name: 'Disable Copilot',
    apply: `New-Item -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Force -ErrorAction Stop | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Name "TurnOffWindowsCopilot" -Value 1 -Type DWord -Force -ErrorAction Stop`,
    revert: `Remove-ItemProperty -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Name "TurnOffWindowsCopilot" -ErrorAction Stop`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Name "TurnOffWindowsCopilot" -ErrorAction SilentlyContinue).TurnOffWindowsCopilot -eq 1`,
    requiresAdmin: false,
    requiresReboot: false,
  },
  'cortana': {
    name: 'Disable Cortana',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search" -Name "CortanaConsent" -Value 0 -Type DWord -Force -ErrorAction Stop`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search" -Name "CortanaConsent" -Value 1 -Type DWord -Force -ErrorAction Stop`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search" -Name "CortanaConsent" -ErrorAction SilentlyContinue).CortanaConsent -eq 0`,
    requiresAdmin: false,
    requiresReboot: false,
  },
  'search-highlights': {
    name: 'Disable Search Highlights',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings" -Name "IsDynamicSearchBoxEnabled" -Value 0 -Type DWord -Force -ErrorAction Stop`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings" -Name "IsDynamicSearchBoxEnabled" -Value 1 -Type DWord -Force -ErrorAction Stop`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings" -Name "IsDynamicSearchBoxEnabled" -ErrorAction SilentlyContinue).IsDynamicSearchBoxEnabled -eq 0`,
    requiresAdmin: false,
    requiresReboot: false,
  },
  'storage-sense': {
    name: 'Disable Storage Sense',
    apply: `New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy" -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy" -Name "01" -Value 0 -Type DWord -Force -ErrorAction Stop`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy" -Name "01" -Value 1 -Type DWord -Force -ErrorAction Stop`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy" -Name "01" -ErrorAction SilentlyContinue)."01" -eq 0`,
    requiresAdmin: false,
    requiresReboot: false,
  },
  'compact-explorer': {
    name: 'Compact Explorer View',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "UseCompactMode" -Value 1 -Type DWord -Force -ErrorAction Stop`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "UseCompactMode" -Value 0 -Type DWord -Force -ErrorAction Stop`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "UseCompactMode" -ErrorAction SilentlyContinue).UseCompactMode -eq 1`,
    requiresAdmin: false,
    requiresReboot: false,
  },
  'recent-files': {
    name: 'Disable Recent Files',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "Start_TrackDocs" -Value 0 -Type DWord -Force -ErrorAction Stop`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "Start_TrackDocs" -Value 1 -Type DWord -Force -ErrorAction Stop`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "Start_TrackDocs" -ErrorAction SilentlyContinue).Start_TrackDocs -eq 0`,
    requiresAdmin: false,
    requiresReboot: false,
  },
  'xbox-bar': {
    name: 'Disable Xbox Game Bar',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 0 -Type DWord -Force -ErrorAction Stop; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Value 0 -Type DWord -Force -ErrorAction Stop`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 1 -Type DWord -Force -ErrorAction Stop; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Value 1 -Type DWord -Force -ErrorAction Stop`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -ErrorAction SilentlyContinue).AppCaptureEnabled -eq 0`,
    requiresAdmin: false,
    requiresReboot: false,
  },
};

// Tier B tweaks - require admin elevation
const TIER_B_TWEAKS = {
  'hibernation': {
    name: 'Disable Hibernation',
    apply: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power" -Name "HibernateEnabled" -Value 0 -Type DWord -Force -ErrorAction Stop`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power" -Name "HibernateEnabled" -Value 1 -Type DWord -Force -ErrorAction Stop`,
    check: `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power" -Name "HibernateEnabled" -ErrorAction SilentlyContinue).HibernateEnabled -eq 0`,
    requiresAdmin: true,
    requiresReboot: true,
  },
};

const ALL_TWEAKS = { ...TIER_A_TWEAKS, ...TIER_B_TWEAKS };

async function verifyTweak(tweakId) {
  const tweak = ALL_TWEAKS[tweakId];
  if (!tweak) return { applied: false, verified: false };
  
  try {
    const applied = await checkPowerShell(tweak.check);
    return { applied, verified: true };
  } catch (e) {
    return { applied: false, verified: false };
  }
}

async function executeTweak(tweakId, action) {
  const tweak = ALL_TWEAKS[tweakId];
  
  // Unknown tweak - return simulated
  if (!tweak) {
    const result = { 
      success: true, 
      message: 'Simulated (not a system tweak)', 
      requiresReboot: false, 
      requiresAdmin: false,
      error: null 
    };
    logAction(action, tweakId, result);
    return result;
  }

  // Check if admin required but not available
  if (tweak.requiresAdmin) {
    const result = {
      success: false,
      message: null,
      requiresReboot: tweak.requiresReboot,
      requiresAdmin: true,
      error: 'This tweak requires administrator privileges. Run SwitchControl as Administrator.',
    };
    logAction(action, tweakId, result);
    return result;
  }

  const command = action === 'apply' ? tweak.apply : tweak.revert;
  
  try {
    console.log(`[TweakExecutor] Executing ${action} for ${tweakId}`);
    await runPowerShell(command);
    
    // Verify the change took effect
    const verification = await verifyTweak(tweakId);
    const expectedState = action === 'apply';
    
    if (verification.verified && verification.applied === expectedState) {
      const state = loadState();
      state.tweaks[tweakId] = action === 'apply';
      saveState(state);
      
      const result = {
        success: true,
        verified: true,
        message: `${tweak.name} ${action === 'apply' ? 'enabled' : 'disabled'} (verified)`,
        requiresReboot: tweak.requiresReboot,
        requiresAdmin: false,
        error: null,
      };
      logAction(action, tweakId, result);
      return result;
    } else if (!verification.verified) {
      const result = {
        success: false,
        verified: false,
        message: null,
        requiresReboot: false,
        requiresAdmin: false,
        error: 'Unable to verify change. Registry access may be restricted.',
      };
      logAction(action, tweakId, result);
      return result;
    } else {
      const result = {
        success: false,
        verified: true,
        message: null,
        requiresReboot: false,
        requiresAdmin: false,
        error: 'Change was blocked by system policy or antivirus.',
      };
      logAction(action, tweakId, result);
      return result;
    }
  } catch (error) {
    console.error(`[TweakExecutor] Failed to ${action} ${tweakId}:`, error);
    
    let errorMsg = error.message || 'Failed to execute tweak';
    if (errorMsg.includes('access is not allowed') || errorMsg.includes('Access denied')) {
      errorMsg = 'Requires administrator privileges to modify this setting.';
    } else if (errorMsg.includes('does not exist')) {
      errorMsg = 'Registry path not found. This setting may not apply to your Windows version.';
    }
    
    const result = {
      success: false,
      verified: false,
      message: null,
      requiresReboot: false,
      requiresAdmin: errorMsg.includes('administrator'),
      error: errorMsg,
    };
    logAction(action, tweakId, result);
    return result;
  }
}

async function checkTweakStatus(tweakId) {
  const tweak = ALL_TWEAKS[tweakId];
  
  if (!tweak) {
    return { tweakId, applied: false, error: null };
  }

  try {
    const applied = await checkPowerShell(tweak.check);
    return { tweakId, applied, error: null };
  } catch (error) {
    return { tweakId, applied: false, error: error.message };
  }
}

function getLocalState() {
  const state = loadState();
  return {
    appliedTweaks: state.tweaks,
    lastSync: state.meta.lastVerified,
    windowsBuild: state.meta.windowsBuild,
  };
}

function getTweakInfo() {
  return Object.entries(ALL_TWEAKS).map(([id, tweak]) => ({
    id,
    name: tweak.name,
    tier: TIER_A_TWEAKS[id] ? 'A' : 'B',
    requiresAdmin: tweak.requiresAdmin,
    requiresReboot: tweak.requiresReboot,
  }));
}

module.exports = {
  executeTweak,
  checkTweakStatus,
  verifyTweak,
  getLocalState,
  getTweakInfo,
  TIER_A_TWEAKS,
  TIER_B_TWEAKS,
};
