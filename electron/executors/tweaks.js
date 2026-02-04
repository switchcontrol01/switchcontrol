const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const RESULT_CONTRACT = {
  success: (message, requiresReboot = false) => ({
    success: true,
    requiresReboot,
    message,
    error: null
  }),
  failure: (error) => ({
    success: false,
    requiresReboot: false,
    message: null,
    error: typeof error === 'string' ? error : error.message
  })
};

function execPowerShell(command) {
  return new Promise((resolve, reject) => {
    const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '\\"')}"`;
    exec(psCommand, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function setRegistryValue(keyPath, valueName, value, type = 'REG_DWORD') {
  return new Promise((resolve, reject) => {
    const command = `reg add "${keyPath}" /v "${valueName}" /t ${type} /d ${value} /f`;
    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function deleteRegistryValue(keyPath, valueName) {
  return new Promise((resolve, reject) => {
    const command = `reg delete "${keyPath}" /v "${valueName}" /f`;
    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error && !stderr.includes('does not exist')) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function getRegistryValue(keyPath, valueName) {
  return new Promise((resolve, reject) => {
    const command = `reg query "${keyPath}" /v "${valueName}"`;
    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        resolve(null);
      } else {
        const match = stdout.match(/REG_\w+\s+(.+)/);
        resolve(match ? match[1].trim() : null);
      }
    });
  });
}

const TIER_A_TWEAKS = {
  'gaming-mode': {
    name: 'Enable Game Mode',
    apply: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\GameBar',
          'AutoGameModeEnabled',
          1
        );
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\GameBar',
          'AllowAutoGameMode',
          1
        );
        return RESULT_CONTRACT.success('Game Mode enabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    revert: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\GameBar',
          'AutoGameModeEnabled',
          0
        );
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\GameBar',
          'AllowAutoGameMode',
          0
        );
        return RESULT_CONTRACT.success('Game Mode disabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    check: async () => {
      const value = await getRegistryValue(
        'HKCU\\Software\\Microsoft\\GameBar',
        'AutoGameModeEnabled'
      );
      return value === '0x1' || value === '1';
    }
  },

  'notifications': {
    name: 'Disable Notifications',
    apply: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications',
          'ToastEnabled',
          0
        );
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings',
          'NOC_GLOBAL_SETTING_TOASTS_ENABLED',
          0
        );
        return RESULT_CONTRACT.success('Notifications disabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    revert: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications',
          'ToastEnabled',
          1
        );
        await deleteRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings',
          'NOC_GLOBAL_SETTING_TOASTS_ENABLED'
        );
        return RESULT_CONTRACT.success('Notifications enabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    check: async () => {
      const value = await getRegistryValue(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications',
        'ToastEnabled'
      );
      return value === '0x0' || value === '0';
    }
  },

  'copilot': {
    name: 'Disable Copilot',
    apply: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot',
          'TurnOffWindowsCopilot',
          1
        );
        return RESULT_CONTRACT.success('Copilot disabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    revert: async () => {
      try {
        await deleteRegistryValue(
          'HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot',
          'TurnOffWindowsCopilot'
        );
        return RESULT_CONTRACT.success('Copilot enabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    check: async () => {
      const value = await getRegistryValue(
        'HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot',
        'TurnOffWindowsCopilot'
      );
      return value === '0x1' || value === '1';
    }
  },

  'cortana': {
    name: 'Disable Cortana',
    apply: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search',
          'CortanaConsent',
          0
        );
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search',
          'AllowCortana',
          0
        );
        return RESULT_CONTRACT.success('Cortana disabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    revert: async () => {
      try {
        await deleteRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search',
          'CortanaConsent'
        );
        await deleteRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search',
          'AllowCortana'
        );
        return RESULT_CONTRACT.success('Cortana enabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    check: async () => {
      const value = await getRegistryValue(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search',
        'AllowCortana'
      );
      return value === '0x0' || value === '0';
    }
  },

  'search-highlights': {
    name: 'Disable Search Highlights',
    apply: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings',
          'IsDynamicSearchBoxEnabled',
          0
        );
        return RESULT_CONTRACT.success('Search Highlights disabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    revert: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings',
          'IsDynamicSearchBoxEnabled',
          1
        );
        return RESULT_CONTRACT.success('Search Highlights enabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    check: async () => {
      const value = await getRegistryValue(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings',
        'IsDynamicSearchBoxEnabled'
      );
      return value === '0x0' || value === '0';
    }
  },

  'storage-sense': {
    name: 'Disable Storage Sense',
    apply: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy',
          '01',
          0
        );
        return RESULT_CONTRACT.success('Storage Sense disabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    revert: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy',
          '01',
          1
        );
        return RESULT_CONTRACT.success('Storage Sense enabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    check: async () => {
      const value = await getRegistryValue(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy',
        '01'
      );
      return value === '0x0' || value === '0';
    }
  },

  'compact-explorer': {
    name: 'Enable Compact Explorer',
    apply: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced',
          'UseCompactMode',
          1
        );
        return RESULT_CONTRACT.success('Compact Explorer enabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    revert: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced',
          'UseCompactMode',
          0
        );
        return RESULT_CONTRACT.success('Compact Explorer disabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    check: async () => {
      const value = await getRegistryValue(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced',
        'UseCompactMode'
      );
      return value === '0x1' || value === '1';
    }
  },

  'recent-files': {
    name: 'Hide Recent Files',
    apply: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer',
          'ShowRecent',
          0
        );
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer',
          'ShowFrequent',
          0
        );
        return RESULT_CONTRACT.success('Recent Files hidden');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    revert: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer',
          'ShowRecent',
          1
        );
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer',
          'ShowFrequent',
          1
        );
        return RESULT_CONTRACT.success('Recent Files shown');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    check: async () => {
      const value = await getRegistryValue(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer',
        'ShowRecent'
      );
      return value === '0x0' || value === '0';
    }
  },

  'xbox-bar': {
    name: 'Disable Xbox Game Bar',
    apply: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR',
          'AppCaptureEnabled',
          0
        );
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\GameBar',
          'UseNexusForGameBarEnabled',
          0
        );
        await setRegistryValue(
          'HKCU\\System\\GameConfigStore',
          'GameDVR_Enabled',
          0
        );
        return RESULT_CONTRACT.success('Xbox Game Bar disabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    revert: async () => {
      try {
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR',
          'AppCaptureEnabled',
          1
        );
        await setRegistryValue(
          'HKCU\\Software\\Microsoft\\GameBar',
          'UseNexusForGameBarEnabled',
          1
        );
        await setRegistryValue(
          'HKCU\\System\\GameConfigStore',
          'GameDVR_Enabled',
          1
        );
        return RESULT_CONTRACT.success('Xbox Game Bar enabled');
      } catch (e) {
        return RESULT_CONTRACT.failure(e);
      }
    },
    check: async () => {
      const value = await getRegistryValue(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR',
        'AppCaptureEnabled'
      );
      return value === '0x0' || value === '0';
    }
  },

  'hibernation': {
    name: 'Disable Hibernation',
    apply: async () => {
      try {
        await execPowerShell('powercfg /hibernate off');
        return RESULT_CONTRACT.success('Hibernation disabled (hiberfil.sys will be removed)');
      } catch (e) {
        if (e.message.includes('Access is denied')) {
          return RESULT_CONTRACT.failure('Administrator privileges required to disable hibernation');
        }
        return RESULT_CONTRACT.failure(e);
      }
    },
    revert: async () => {
      try {
        await execPowerShell('powercfg /hibernate on');
        return RESULT_CONTRACT.success('Hibernation enabled');
      } catch (e) {
        if (e.message.includes('Access is denied')) {
          return RESULT_CONTRACT.failure('Administrator privileges required to enable hibernation');
        }
        return RESULT_CONTRACT.failure(e);
      }
    },
    check: async () => {
      try {
        const result = await execPowerShell('powercfg /a');
        const isDisabled = result.toLowerCase().includes('hibernation has not been enabled') ||
                           result.toLowerCase().includes('hibernate is not available');
        return isDisabled;
      } catch (e) {
        return false;
      }
    }
  }
};

function getStateFilePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'tweak-state.json');
}

function loadState() {
  try {
    const filePath = getStateFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('[TweakExecutor] Failed to load state:', e);
  }
  return { appliedTweaks: {}, lastSync: null };
}

function saveState(state) {
  try {
    const filePath = getStateFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[TweakExecutor] Failed to save state:', e);
  }
}

async function executeTweak(tweakId, action) {
  const tweak = TIER_A_TWEAKS[tweakId];
  if (!tweak) {
    return RESULT_CONTRACT.failure(`Unknown tweak: ${tweakId}`);
  }

  if (action !== 'apply' && action !== 'revert') {
    return RESULT_CONTRACT.failure(`Invalid action: ${action}. Use 'apply' or 'revert'.`);
  }

  console.log(`[TweakExecutor] ${action} ${tweakId}`);
  
  const result = await tweak[action]();
  
  if (result.success) {
    const state = loadState();
    state.appliedTweaks[tweakId] = action === 'apply';
    state.lastSync = new Date().toISOString();
    saveState(state);
  }

  return result;
}

async function checkTweakStatus(tweakId) {
  const tweak = TIER_A_TWEAKS[tweakId];
  if (!tweak || !tweak.check) {
    return { tweakId, applied: false, error: 'Unknown tweak or no check available' };
  }

  try {
    const applied = await tweak.check();
    return { tweakId, applied, error: null };
  } catch (e) {
    return { tweakId, applied: false, error: e.message };
  }
}

async function syncAllTweakStates() {
  const results = {};
  for (const tweakId of Object.keys(TIER_A_TWEAKS)) {
    results[tweakId] = await checkTweakStatus(tweakId);
  }
  
  const state = loadState();
  for (const [tweakId, status] of Object.entries(results)) {
    if (!status.error) {
      state.appliedTweaks[tweakId] = status.applied;
    }
  }
  state.lastSync = new Date().toISOString();
  saveState(state);
  
  return results;
}

function getLocalState() {
  return loadState();
}

function getTweakInfo() {
  return Object.entries(TIER_A_TWEAKS).map(([id, tweak]) => ({
    id,
    name: tweak.name,
    tier: 'A'
  }));
}

module.exports = {
  executeTweak,
  checkTweakStatus,
  syncAllTweakStates,
  getLocalState,
  getTweakInfo,
  TIER_A_TWEAKS
};
