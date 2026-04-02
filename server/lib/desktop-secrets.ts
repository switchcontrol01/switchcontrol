/**
 * Desktop-only secret bootstrap for packaged Electron backend mode.
 *
 * This module MUST be imported first in server/index.ts — before ANY module
 * that reads JWT_SECRET or SESSION_SECRET from process.env.
 *
 * When ELECTRON_BACKEND=1 and a required secret is absent, this module:
 *   1. Checks for a persisted secrets file in the app's userData directory.
 *   2. If not found, generates cryptographically strong random secrets.
 *   3. Saves them to disk so they survive restarts (sessions stay valid).
 *   4. Injects them into process.env before jwt.ts or session middleware loads.
 *
 * This logic is ONLY active when ELECTRON_BACKEND=1.
 * Web production mode is completely unaffected — its fatal secret checks
 * remain in place and no fallback is provided there.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

const IS_ELECTRON_BACKEND = process.env.ELECTRON_BACKEND === "1";

if (IS_ELECTRON_BACKEND) {
  bootstrapDesktopSecrets();
}

function resolveSecretsDir(): string {
  // Prefer the path explicitly passed from the Electron main process
  // (backend-launcher.js injects ELECTRON_USER_DATA = app.getPath('userData'))
  if (process.env.ELECTRON_USER_DATA) {
    return process.env.ELECTRON_USER_DATA;
  }

  // Fallback: standard per-platform app-data locations
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "SwitchControl");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "SwitchControl");
  }
  // Linux / fallback
  return path.join(os.homedir(), ".switchcontrol");
}

function bootstrapDesktopSecrets(): void {
  const secretsDir = resolveSecretsDir();
  const secretsFile = path.join(secretsDir, "desktop-secrets.json");

  console.log("[DesktopSecrets] ELECTRON_BACKEND mode — bootstrapping secrets");
  console.log("[DesktopSecrets] Secrets file path:", secretsFile);

  let jwtSecret: string | null = process.env.JWT_SECRET || null;
  let sessionSecret: string | null = process.env.SESSION_SECRET || null;

  // If both are already set via environment, nothing to do
  if (jwtSecret && sessionSecret) {
    console.log("[DesktopSecrets] JWT_SECRET: from environment");
    console.log("[DesktopSecrets] SESSION_SECRET: from environment");
    return;
  }

  // Try loading from persisted file
  let persisted: Record<string, string> = {};
  if (fs.existsSync(secretsFile)) {
    try {
      const raw = fs.readFileSync(secretsFile, "utf-8");
      persisted = JSON.parse(raw);
      console.log("[DesktopSecrets] Loaded persisted secrets from:", secretsFile);
    } catch (err: any) {
      console.warn("[DesktopSecrets] Failed to read secrets file, will regenerate:", err.message);
      persisted = {};
    }
  }

  let needsSave = false;

  if (!jwtSecret) {
    if (persisted.JWT_SECRET && persisted.JWT_SECRET.length >= 64) {
      jwtSecret = persisted.JWT_SECRET;
      console.log("[DesktopSecrets] JWT_SECRET: loaded from persisted file");
    } else {
      jwtSecret = crypto.randomBytes(48).toString("hex"); // 96 hex chars = 384 bits
      persisted.JWT_SECRET = jwtSecret;
      needsSave = true;
      console.log("[DesktopSecrets] JWT_SECRET: generated new random secret");
    }
    process.env.JWT_SECRET = jwtSecret;
  } else {
    console.log("[DesktopSecrets] JWT_SECRET: from environment");
  }

  if (!sessionSecret) {
    if (persisted.SESSION_SECRET && persisted.SESSION_SECRET.length >= 64) {
      sessionSecret = persisted.SESSION_SECRET;
      console.log("[DesktopSecrets] SESSION_SECRET: loaded from persisted file");
    } else {
      sessionSecret = crypto.randomBytes(48).toString("hex"); // 96 hex chars = 384 bits
      persisted.SESSION_SECRET = sessionSecret;
      needsSave = true;
      console.log("[DesktopSecrets] SESSION_SECRET: generated new random secret");
    }
    process.env.SESSION_SECRET = sessionSecret;
  } else {
    console.log("[DesktopSecrets] SESSION_SECRET: from environment");
  }

  // Persist to disk if we generated anything new
  if (needsSave) {
    try {
      fs.mkdirSync(secretsDir, { recursive: true });
      fs.writeFileSync(secretsFile, JSON.stringify(persisted, null, 2), {
        encoding: "utf-8",
        mode: 0o600, // owner read/write only
      });
      console.log("[DesktopSecrets] Secrets saved to:", secretsFile);
    } catch (err: any) {
      // Non-fatal: secrets are still in process.env for this session,
      // they'll just be regenerated on next launch
      console.warn("[DesktopSecrets] Could not persist secrets file:", err.message);
      console.warn("[DesktopSecrets] Sessions will not survive app restart.");
    }
  }

  console.log("[DesktopSecrets] Bootstrap complete — JWT_SECRET and SESSION_SECRET are set");
}
