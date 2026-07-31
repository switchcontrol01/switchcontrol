'use strict';
/**
 * file-icon.js — single home for ALL icon-resolution logic.
 *
 * Exports:
 *   getIconDataUrlForPath(rawPath, cacheKey?)   — simple path → data URL (used by
 *                                                  appIcons:forPath IPC, Process Manager,
 *                                                  Startup)
 *   extractExecutablePath(raw)                  — strips quotes / trailing args from a
 *                                                  raw command string or registry value
 *   expandEnvVars(str)                          — expands %WINDIR% tokens
 *   EXE_SCAN_MAX_DEPTH / EXE_SCAN_MAX_FILES /
 *   EXE_SCAN_SKIP_DIRS                          — bounded recursive scan constants
 *   collectExeFilesRecursive(rootDir)           — bounded .exe walker
 *   resolveIconPath(app)                        — advanced resolver used by Debloater
 *                                                  (DisplayIcon → InstallLocation scan
 *                                                  → uninstall string)
 *
 * debloat-helper.js imports the advanced utilities from here instead of
 * defining them locally, keeping a single implementation.
 */

const { app, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── Shared cache directory ────────────────────────────────────────────────────
// Persistent across restarts (userData). Falls back to tmpdir at very early
// startup before Electron's userData path is available.
// debloat-helper.js has its OWN equivalent (for its appId-keyed cache) so the
// two cache-key namespaces (sha1-of-path here, appId there) never collide.
function getIconCacheDir() {
  try {
    return path.join(app.getPath('userData'), 'icon-cache');
  } catch {
    return path.join(os.tmpdir(), 'switchcontrol-icon-cache');
  }
}

// ── Environment variable expansion ────────────────────────────────────────────
// Expands Windows-style %VAR% tokens found in registry values and DisplayIcon
// strings. Falls back to process.env (mirrors the Win32 environment block).
function expandEnvVars(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/%([^%]+)%/g, (match, key) => {
    const val = process.env[key] ?? process.env[key.toUpperCase()];
    return val !== undefined ? val : match; // leave unexpanded tokens as-is
  });
}

// ── Recursive .exe collector (bounded) ───────────────────────────────────────
// Walks an InstallLocation directory looking for .exe files. Bounded by
// MAX_DEPTH and MAX_FILES so a pathological folder tree can never hang the
// icon lookup. Skips folders that are extremely unlikely to contain the
// main app exe.
const EXE_SCAN_MAX_DEPTH = 4;
const EXE_SCAN_MAX_FILES = 400;
const EXE_SCAN_SKIP_DIRS = /^(\$plugins.*|temp|tmp|logs?|cache|locale?s?|lang(uages)?|redist|vcredist|\.git)$/i;

function collectExeFilesRecursive(rootDir) {
  const results = [];
  function walk(dir, depth) {
    if (depth > EXE_SCAN_MAX_DEPTH || results.length >= EXE_SCAN_MAX_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= EXE_SCAN_MAX_FILES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXE_SCAN_SKIP_DIRS.test(entry.name)) continue;
        walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
        results.push({ full, rel: path.relative(rootDir, full) });
      }
    }
  }
  walk(rootDir, 0);
  return results;
}

// ── Advanced icon path resolver (used by Debloater / Installed Apps) ──────────
// Priority:
//   1. DisplayIcon registry value (expand env vars, strip icon index)
//   2. Best-match exe in InstallLocation (recursive, bounded, scored)
//   3. Exe extracted from QuietUninstallString / UninstallString
// This lives in file-icon.js so it can be reused by any future caller without
// creating a dependency on debloat-helper.js's full scan/uninstall pipeline.
function resolveIconPath(app) {
  // ── 1. DisplayIcon ──────────────────────────────────────────────────────────
  let raw = String(app.displayIcon || '').trim();
  // Handle both quoted and unquoted forms, then strip trailing ,N icon index:
  //   "C:\Prog\app.exe",0  →  C:\Prog\app.exe
  //   C:\Prog\app.exe,-1   →  C:\Prog\app.exe
  const qm = raw.match(/^"([^"]+)"(?:,\s*-?\d+)?\s*$/);
  if (qm) {
    raw = qm[1];
  } else {
    raw = raw.replace(/,\s*-?\d+\s*$/, '').trim();
  }
  raw = expandEnvVars(raw);
  if (raw.length > 4 && fs.existsSync(raw)) return raw;

  // ── 2. Best exe in InstallLocation (recursive, bounded) ────────────────────
  const loc = expandEnvVars(String(app.installLocation || '').trim());
  if (loc && loc.length > 3 && fs.existsSync(loc)) {
    try {
      const entries = collectExeFilesRecursive(loc);
      if (entries.length > 0) {
        const appNameNorm = String(app.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const scored = entries.map(({ full, rel }) => {
          const fname = path.basename(full);
          const base = path.basename(fname, '.exe').toLowerCase().replace(/[^a-z0-9]/g, '');
          let score = 0;
          if (base === appNameNorm) score = 100;
          else if (appNameNorm.startsWith(base) || base.startsWith(appNameNorm)) score = 50;
          else if (appNameNorm.length >= 4 && (appNameNorm.includes(base) || base.includes(appNameNorm.slice(0, 4)))) score = 25;
          score -= base.length * 0.1;
          score -= (rel.split(path.sep).length - 1) * 5;
          if (/update|uninstall|unins0|setup|helper|crash|report|launcher|installer|redist|vcredist/i.test(fname)) score -= 40;
          return { full, score };
        });
        scored.sort((a, b) => b.score - a.score);
        const best = scored[0].full;
        if (fs.existsSync(best)) return best;
      }
    } catch {}
  }

  // ── 3. Extract exe from uninstall strings ──────────────────────────────────
  for (const s of [String(app.quietUninstall || ''), String(app.uninstallString || '')]) {
    const us = expandEnvVars(s.trim());
    if (!us || us.length < 4) continue;
    const qm2 = us.match(/^"([^"]+\.exe)"/i);
    if (qm2 && fs.existsSync(qm2[1])) return qm2[1];
    const um = us.match(/^([A-Za-z]:[^\s,;]+\.exe)/i);
    if (um && fs.existsSync(um[1])) return um[1];
  }
  return null;
}

// ── Simple exe-path extractor ─────────────────────────────────────────────────
// Strips leading/trailing quotes and trailing arguments from raw path strings
// BEFORE the security validation (isSupportedIconPath) runs. This handles:
//   "C:\Program Files\App\app.exe" --minimized  →  C:\Program Files\App\app.exe
//   C:\Windows\system32\app.exe /args            →  C:\Windows\system32\app.exe
//   C:\path\app.exe                              →  C:\path\app.exe  (unchanged)
//
// Mirrors debloat-helper.js's parseUninstallString quoted/unquoted exe-extraction
// branches, simplified for path-only extraction (no MSI GUID or args needed).
// cacheKey in getIconDataUrlForPath is intentionally kept as the ORIGINAL raw
// input so cache keys remain stable if two slightly different raw strings clean
// to the same exe.
function extractExecutablePath(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  // Quoted: "C:\path\app.exe" [args]
  const qm = trimmed.match(/^"([^"]+)"/);
  if (qm) return qm[1];
  // Unquoted, ends in .exe before first space-separated arg
  const em = trimmed.match(/^(.*?\.(?:exe|dll|ico|scr|cpl))\b/i);
  if (em) return em[1];
  return trimmed; // fall back to the raw string as-is
}

// ── Security guard ────────────────────────────────────────────────────────────
// Called AFTER extractExecutablePath cleans the raw input. Enforces:
//   - absolute path (no relative, no UNC guessing)
//   - length bounds
//   - narrow extension allowlist
//   - physical existence on disk
// Do NOT weaken these constraints — they are the security boundary.
function isSupportedIconPath(filePath) {
  return typeof filePath === 'string'
    && filePath.length > 3
    && filePath.length <= 2048
    && path.isAbsolute(filePath)
    && /\.(?:exe|dll|ico|scr|cpl)$/i.test(filePath)
    && fs.existsSync(filePath);
}

// ── Main entry point ──────────────────────────────────────────────────────────
// rawPath   — the value received from the IPC call; may contain quotes or
//             trailing arguments (e.g. from a startup registry command string).
// cacheKey  — defaults to rawPath (not the cleaned path) so cache keys are
//             stable even if two slightly different raw strings clean to the
//             same exe.
async function getIconDataUrlForPath(rawPath, cacheKey = rawPath) {
  if (process.platform !== 'win32') return null;

  // Clean raw input before the security check so quoted / arg-containing
  // strings don't fail fs.existsSync with the decoration still attached.
  const filePath = extractExecutablePath(rawPath);
  if (!isSupportedIconPath(filePath)) return null;

  const cacheDir = getIconCacheDir();
  try {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  } catch {}

  const key = crypto.createHash('sha1').update(String(cacheKey)).digest('hex');
  const cacheFile = path.join(cacheDir, `${key}.png`);
  try {
    if (fs.existsSync(cacheFile)) {
      return `data:image/png;base64,${fs.readFileSync(cacheFile).toString('base64')}`;
    }
  } catch {}

  try {
    const image = await shell.getFileIcon(filePath, { size: 'large' });
    if (!image || image.isEmpty()) return null;
    const buffer = image.toPNG();
    try { fs.writeFileSync(cacheFile, buffer); } catch {}
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

module.exports = {
  getIconDataUrlForPath,
  extractExecutablePath,
  expandEnvVars,
  EXE_SCAN_MAX_DEPTH,
  EXE_SCAN_MAX_FILES,
  EXE_SCAN_SKIP_DIRS,
  collectExeFilesRecursive,
  resolveIconPath,
};
