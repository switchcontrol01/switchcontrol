/**
 * Shared resolver for the packaged Electron desktop app's local data directory.
 *
 * Mirrors the logic in `desktop-secrets.ts` and Electron's own
 * `electron/user-data-paths.js`, so every server-side module that needs to
 * persist data to disk in no-DB (Electron) mode agrees on the same folder:
 *
 *   Windows: %APPDATA%\SwitchControl
 *   macOS:   ~/Library/Application Support/SwitchControl
 *   Linux:   ~/.switchcontrol
 *
 * Prefers `ELECTRON_USER_DATA` (injected by `electron/backend-launcher.js`
 * from `app.getPath('userData')`) when available.
 */

import fs from "fs";
import path from "path";
import os from "os";

export function resolveDesktopDataDir(): string {
  if (process.env.ELECTRON_USER_DATA) {
    return process.env.ELECTRON_USER_DATA;
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "SwitchControl");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "SwitchControl");
  }
  return path.join(os.homedir(), ".switchcontrol");
}

export function ensureDesktopDataDir(): string {
  const dir = resolveDesktopDataDir();
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e: any) {
    console.warn("[LocalDesktopDataDir] Failed to create dir:", e.message);
  }
  return dir;
}
