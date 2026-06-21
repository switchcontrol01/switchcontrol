/**
 * driver-apps-helper.js
 *
 * Smart vendor-app detection + launch for Driver Intelligence.
 *
 * Detect-and-redirect policy: we NEVER download, install or flash anything.
 * This module only answers two questions for a fixed allowlist of official
 * vendor tools:
 *   1. Is the vendor's own app installed on this machine?  (detect)
 *   2. Launch it.                                          (launch)
 *
 * Security model:
 *   - The renderer may only pass an `appKey` from APP_CATALOG (a fixed
 *     allowlist). It can NEVER pass a file path. Main resolves the executable
 *     path itself from the catalog's candidate locations, so a compromised
 *     renderer cannot use this to launch arbitrary executables.
 *   - Launch only ever runs a path that (a) maps to a catalog entry AND
 *     (b) actually exists on disk under one of that entry's known locations
 *     or the Windows "App Paths" registry value for its exact exe name.
 */

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const { execFile } = require('child_process');

const PF = process.env['ProgramFiles'] || 'C:\\Program Files';
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

/**
 * Fixed allowlist of official vendor tools. Each entry lists one or more
 * candidate executables (preferred first). `display` is shown in the UI.
 */
const APP_CATALOG = {
  nvidia: {
    display: 'NVIDIA App',
    candidates: [
      { name: 'NVIDIA App', exe: path.join(PF, 'NVIDIA Corporation', 'NVIDIA App', 'CEF', 'NVIDIA App.exe') },
      { name: 'GeForce Experience', exe: path.join(PF, 'NVIDIA Corporation', 'NVIDIA GeForce Experience', 'NVIDIA GeForce Experience.exe') },
    ],
    appPaths: ['NVIDIA App.exe', 'NVIDIA GeForce Experience.exe'],
  },
  amd: {
    display: 'AMD Software',
    candidates: [
      { name: 'AMD Software: Adrenalin Edition', exe: path.join(PF, 'AMD', 'CNext', 'CNext', 'RadeonSoftware.exe') },
    ],
    appPaths: ['RadeonSoftware.exe'],
  },
  intel: {
    display: 'Intel Driver & Support Assistant',
    candidates: [
      { name: 'Intel Driver & Support Assistant', exe: path.join(PF86, 'Intel', 'Driver and Support Assistant', 'DSATray.exe') },
    ],
    appPaths: ['DSATray.exe'],
  },
  'samsung-magician': {
    display: 'Samsung Magician',
    candidates: [
      { name: 'Samsung Magician', exe: path.join(PF, 'Samsung', 'Samsung Magician', 'SamsungMagician.exe') },
    ],
    appPaths: ['SamsungMagician.exe'],
  },
  'crucial-storage-executive': {
    display: 'Crucial Storage Executive',
    candidates: [
      { name: 'Crucial Storage Executive', exe: path.join(PF86, 'Crucial', 'Crucial Storage Executive', 'Crucial Storage Executive.exe') },
    ],
    appPaths: ['Crucial Storage Executive.exe'],
  },
  'wd-dashboard': {
    display: 'WD Dashboard',
    candidates: [
      { name: 'WD Dashboard', exe: path.join(PF, 'Western Digital', 'Dashboard', 'WDDashboard.exe') },
    ],
    appPaths: ['WDDashboard.exe'],
  },
};

function isKnownAppKey(key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(APP_CATALOG, key);
}

/** Query HKLM "App Paths\<exe>" default value via reg.exe. Returns a path or null. */
function queryAppPath(exeName) {
  return new Promise((resolve) => {
    const key = `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`;
    execFile('reg', ['query', key, '/ve'], { timeout: 4000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      // Default value line looks like:  (Default)    REG_SZ    C:\...\foo.exe
      const m = stdout.match(/REG_SZ\s+(.+)/i);
      const p = m ? m[1].trim().replace(/^"|"$/g, '') : null;
      resolve(p || null);
    });
  });
}

/**
 * Resolve the first existing executable path for an appKey.
 * Checks known candidate locations first (fast, no spawn), then falls back to
 * the Windows App Paths registry for each candidate exe name.
 * @returns {Promise<{ path: string, display: string, name: string } | null>}
 */
async function resolveInstalled(appKey) {
  if (process.platform !== 'win32') return null;
  if (!isKnownAppKey(appKey)) return null;
  const entry = APP_CATALOG[appKey];

  for (const c of entry.candidates) {
    try {
      if (c.exe && fs.existsSync(c.exe)) {
        return { path: c.exe, display: entry.display, name: c.name };
      }
    } catch { /* keep checking */ }
  }

  for (const exeName of entry.appPaths || []) {
    const p = await queryAppPath(exeName);
    try {
      if (p && fs.existsSync(p)) {
        return { path: p, display: entry.display, name: exeName.replace(/\.exe$/i, '') };
      }
    } catch { /* keep checking */ }
  }

  return null;
}

/**
 * Detect whether a vendor app is installed.
 * @returns {Promise<{ installed: boolean, appKey: string, display: string }>}
 */
async function detect(appKey) {
  const entry = isKnownAppKey(appKey) ? APP_CATALOG[appKey] : null;
  const found = await resolveInstalled(appKey);
  return {
    installed: !!found,
    appKey: isKnownAppKey(appKey) ? appKey : null,
    display: found ? found.name : entry ? entry.display : null,
  };
}

/**
 * Launch a vendor app if installed. Resolves the path internally — the caller
 * never supplies a path.
 * @returns {Promise<{ launched: boolean, reason?: string, display?: string }>}
 */
async function launch(appKey) {
  const found = await resolveInstalled(appKey);
  if (!found) return { launched: false, reason: 'not-installed' };
  try {
    const err = await shell.openPath(found.path);
    if (err) {
      console.warn('[driver-apps] openPath error:', err);
      return { launched: false, reason: 'launch-failed' };
    }
    return { launched: true, display: found.name };
  } catch (e) {
    console.warn('[driver-apps] launch threw:', e?.message);
    return { launched: false, reason: 'launch-failed' };
  }
}

module.exports = { detect, launch, isKnownAppKey, APP_CATALOG };
