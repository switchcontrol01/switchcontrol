const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const TWEAK_STATE_FILE = path.join(process.env.APPDATA || '', 'SwitchControl', 'tweak-state.json');

function ensureStateDir() {
  const dir = path.dirname(TWEAK_STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadState() {
  try {
    ensureStateDir();
    if (fs.existsSync(TWEAK_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(TWEAK_STATE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[TweakExecutor] Failed to load state:', e);
  }
  return { appliedTweaks: {}, lastSync: null };
}

function saveState(state) {
  try {
    ensureStateDir();
    fs.writeFileSync(TWEAK_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[TweakExecutor] Failed to save state:', e);
  }
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    const psCommand = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '\\"')}"`;
    exec(psCommand, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[TweakExecutor] PowerShell error:', stderr || error.message);
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

const TIER_A_TWEAKS = {
  'gaming-mode': {
    name: 'Game Mode',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -Value 1 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -Value 0 -Type DWord -Force`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "AutoGameModeEnabled" -ErrorAction SilentlyContinue).AutoGameModeEnabled -eq 1`,
  },
  'notifications': {
    name: 'Disable Notifications',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" -Name "ToastEnabled" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" -Name "ToastEnabled" -Value 1 -Type DWord -Force`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" -Name "ToastEnabled" -ErrorAction SilentlyContinue).ToastEnabled -eq 0`,
  },
  'copilot': {
    name: 'Disable Copilot',
    apply: `New-Item -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Force | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Name "TurnOffWindowsCopilot" -Value 1 -Type DWord -Force`,
    revert: `Remove-ItemProperty -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Name "TurnOffWindowsCopilot" -ErrorAction SilentlyContinue`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" -Name "TurnOffWindowsCopilot" -ErrorAction SilentlyContinue).TurnOffWindowsCopilot -eq 1`,
  },
  'cortana': {
    name: 'Disable Cortana',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search" -Name "CortanaConsent" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search" -Name "CortanaConsent" -Value 1 -Type DWord -Force`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search" -Name "CortanaConsent" -ErrorAction SilentlyContinue).CortanaConsent -eq 0`,
  },
  'search-highlights': {
    name: 'Disable Search Highlights',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings" -Name "IsDynamicSearchBoxEnabled" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings" -Name "IsDynamicSearchBoxEnabled" -Value 1 -Type DWord -Force`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings" -Name "IsDynamicSearchBoxEnabled" -ErrorAction SilentlyContinue).IsDynamicSearchBoxEnabled -eq 0`,
  },
  'storage-sense': {
    name: 'Disable Storage Sense',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy" -Name "01" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy" -Name "01" -Value 1 -Type DWord -Force`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy" -Name "01" -ErrorAction SilentlyContinue)."01" -eq 0`,
  },
  'compact-explorer': {
    name: 'Compact Explorer View',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "UseCompactMode" -Value 1 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "UseCompactMode" -Value 0 -Type DWord -Force`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "UseCompactMode" -ErrorAction SilentlyContinue).UseCompactMode -eq 1`,
  },
  'recent-files': {
    name: 'Disable Recent Files',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "Start_TrackDocs" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "Start_TrackDocs" -Value 1 -Type DWord -Force`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "Start_TrackDocs" -ErrorAction SilentlyContinue).Start_TrackDocs -eq 0`,
  },
  'xbox-bar': {
    name: 'Disable Xbox Game Bar',
    apply: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 0 -Type DWord -Force; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Value 0 -Type DWord -Force`,
    revert: `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 1 -Type DWord -Force; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Value 1 -Type DWord -Force`,
    check: `(Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -ErrorAction SilentlyContinue).AppCaptureEnabled -eq 0`,
  },
  'hibernation': {
    name: 'Disable Hibernation',
    apply: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power" -Name "HibernateEnabled" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue`,
    revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power" -Name "HibernateEnabled" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue`,
    check: `(Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power" -Name "HibernateEnabled" -ErrorAction SilentlyContinue).HibernateEnabled -eq 0`,
    requiresAdmin: true,
  },
};

async function executeTweak(tweakId, action) {
  const tweak = TIER_A_TWEAKS[tweakId];
  
  if (!tweak) {
    return { success: true, message: 'Simulated', requiresReboot: false, error: null };
  }

  const command = action === 'apply' ? tweak.apply : tweak.revert;
  
  try {
    console.log(`[TweakExecutor] Executing ${action} for ${tweakId}`);
    await runPowerShell(command);
    
    const state = loadState();
    state.appliedTweaks[tweakId] = action === 'apply';
    state.lastSync = new Date().toISOString();
    saveState(state);
    
    return {
      success: true,
      message: `${tweak.name} ${action === 'apply' ? 'enabled' : 'disabled'}`,
      requiresReboot: false,
      error: null,
    };
  } catch (error) {
    console.error(`[TweakExecutor] Failed to ${action} ${tweakId}:`, error);
    return {
      success: false,
      message: null,
      requiresReboot: false,
      error: error.message || 'Failed to execute tweak',
    };
  }
}

async function checkTweakStatus(tweakId) {
  const tweak = TIER_A_TWEAKS[tweakId];
  
  if (!tweak) {
    return { tweakId, applied: false, error: null };
  }

  try {
    const result = await runPowerShell(tweak.check);
    const applied = result.toLowerCase() === 'true';
    return { tweakId, applied, error: null };
  } catch (error) {
    return { tweakId, applied: false, error: error.message };
  }
}

function getLocalState() {
  return loadState();
}

function getTweakInfo() {
  return Object.entries(TIER_A_TWEAKS).map(([id, tweak]) => ({
    id,
    name: tweak.name,
    tier: 'A',
    requiresAdmin: tweak.requiresAdmin || false,
  }));
}

module.exports = {
  executeTweak,
  checkTweakStatus,
  getLocalState,
  getTweakInfo,
  TIER_A_TWEAKS,
};
