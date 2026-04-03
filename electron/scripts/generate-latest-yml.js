#!/usr/bin/env node
/**
 * generate-latest-yml.js
 * ----------------------
 * Generates latest.yml for the electron-updater generic provider.
 *
 * electron-builder only writes latest.yml when it performs an actual publish
 * upload (requires cloud credentials at build time).  Since we upload
 * separately via release.js, this script fills the gap: it reads the built
 * installer from dist/, computes the SHA-512 hash electron-updater expects,
 * and writes a correctly-formatted latest.yml into dist/.
 *
 * Usage (called automatically by release.js when latest.yml is absent):
 *   node scripts/generate-latest-yml.js
 *
 * Or run manually before `npm run release`:
 *   node scripts/generate-latest-yml.js
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const distDir  = path.join(__dirname, '..', 'dist');
const pkgPath  = path.join(__dirname, '..', 'package.json');

// ── Sanity checks ─────────────────────────────────────────────────────────────

if (!fs.existsSync(distDir)) {
  console.error('ERROR: dist/ not found. Run `npm run dist:win` first.');
  process.exit(1);
}

if (!fs.existsSync(pkgPath)) {
  console.error('ERROR: electron/package.json not found.');
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
if (!version) {
  console.error('ERROR: Could not read version from electron/package.json.');
  process.exit(1);
}

// ── Find the installer ────────────────────────────────────────────────────────

const distFiles = fs.readdirSync(distDir);
const exeFile = distFiles.find(f => f.endsWith('.exe') && !f.endsWith('.exe.blockmap'));

if (!exeFile) {
  console.error('ERROR: No installer (.exe) found in dist/. Run `npm run dist:win` first.');
  process.exit(1);
}

// ── Compute SHA-512 (base64) — this is what electron-updater verifies ─────────

const exePath  = path.join(distDir, exeFile);
const exeBuf   = fs.readFileSync(exePath);
const sha512   = crypto.createHash('sha512').update(exeBuf).digest('base64');
const byteSize = exeBuf.length;

// ── Write latest.yml ──────────────────────────────────────────────────────────
//
// Format must match exactly what electron-updater expects:
//   https://www.electron.build/configuration/publish#genericserveroptions
//
// Notes:
//   - `url` and `path` use the raw filename (spaces are fine; updater URL-encodes them)
//   - `sha512` is base64-encoded SHA-512 of the full installer binary
//   - `size` is file size in bytes

const releaseDate = new Date().toISOString();

const yml = [
  `version: ${version}`,
  `files:`,
  `  - url: ${exeFile}`,
  `    sha512: ${sha512}`,
  `    size: ${byteSize}`,
  `path: ${exeFile}`,
  `sha512: ${sha512}`,
  `releaseDate: '${releaseDate}'`,
  '',
].join('\n');

const ymlPath = path.join(distDir, 'latest.yml');
fs.writeFileSync(ymlPath, yml, 'utf8');

// Also write stable.yml — backward-compat shim for 1.0.0 builds that had
// autoUpdater.channel = "stable" hardcoded (looks for stable.yml on R2).
// Safe to keep forever; uploading an identical copy is harmless.
const stableYmlPath = path.join(distDir, 'stable.yml');
fs.writeFileSync(stableYmlPath, yml, 'utf8');

console.log(`Generated dist/latest.yml`);
console.log(`Generated dist/stable.yml  (compat shim for v1.0.0 channel=stable)`);
console.log(`  version  : ${version}`);
console.log(`  file     : ${exeFile}`);
console.log(`  size     : ${(byteSize / 1024 / 1024).toFixed(1)} MB`);
console.log(`  sha512   : ${sha512.slice(0, 24)}...`);
console.log(`  date     : ${releaseDate}`);
