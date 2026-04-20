#!/usr/bin/env node
/**
 * generate-latest-yml.js
 * ----------------------
 * Generates latest.yml for the electron-updater generic provider.
 *
 * electron-builder only writes latest.yml when it performs its own publish
 * upload (requires cloud credentials at build time). Since we upload
 * separately via release.js, this script fills the gap: it reads the built
 * installer from dist/, computes the SHA-512 hash electron-updater expects,
 * and writes a correctly-formatted latest.yml into dist/.
 *
 * Usage (called automatically by release.js when latest.yml is absent):
 *   node scripts/generate-latest-yml.js
 *
 * Or manually before `npm run release`:
 *   node scripts/generate-latest-yml.js
 *
 * Trust model note:
 *   The sha512 in latest.yml is what electron-updater verifies against the
 *   downloaded binary. The field must be a base64-encoded SHA-512 of the
 *   full installer binary. Do not modify this value manually.
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

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;
const productName = pkg.build?.productName || 'SwitchControl';

if (!version) {
  console.error('ERROR: Could not read version from electron/package.json.');
  process.exit(1);
}

// ── Find the installer ────────────────────────────────────────────────────────
// Strict selection: we match only the canonical installer filename that
// electron-builder produces for this product/version combination.
// If multiple .exe files exist we fail loudly rather than guessing.

const distFiles = fs.readdirSync(distDir);
const exeFiles = distFiles.filter(f => f.endsWith('.exe') && !f.endsWith('.exe.blockmap'));

if (exeFiles.length === 0) {
  console.error('ERROR: No installer (.exe) found in dist/. Run `npm run dist:win` first.');
  process.exit(1);
}

// Prefer the exact product+version filename that electron-builder generates.
// e.g. "SwitchControl Setup 1.0.0.exe"
const expectedName = `${productName} Setup ${version}.exe`;
let exeFile;

if (exeFiles.includes(expectedName)) {
  exeFile = expectedName;
} else if (exeFiles.length === 1) {
  // Only one .exe present — use it but warn that the name is unexpected.
  exeFile = exeFiles[0];
  console.warn(`WARN: Expected installer "${expectedName}" but found "${exeFile}".`);
  console.warn('      Proceeding with the single available installer.');
} else {
  // Multiple .exe files and none matches the expected name — fail deterministically.
  console.error(`ERROR: Multiple installer .exe files found in dist/ and none matches expected name:`);
  console.error(`  Expected : ${expectedName}`);
  console.error(`  Found    :`);
  for (const f of exeFiles) console.error(`    ${f}`);
  console.error('Remove the unexpected .exe files or rename the correct one, then retry.');
  process.exit(1);
}

// ── Compute SHA-512 (base64) — verified by electron-updater on download ───────

const exePath  = path.join(distDir, exeFile);
const exeBuf   = fs.readFileSync(exePath);
const sha512   = crypto.createHash('sha512').update(exeBuf).digest('base64');
const byteSize = exeBuf.length;

// ── Write latest.yml ──────────────────────────────────────────────────────────
//
// Format must match exactly what electron-updater expects for a generic provider:
//   https://www.electron.build/configuration/publish#genericserveroptions
//
// Notes:
//   - `url` and `path` use the raw filename (spaces are fine; updater URL-encodes them)
//   - `sha512` is the base64-encoded SHA-512 of the full installer binary
//   - `size` is the file size in bytes
//   - `releaseDate` is ISO 8601 UTC

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

// stable.yml — compat shim for legacy builds that shipped with channel='stable'.
// Those builds request stable.yml instead of latest.yml from the update host.
// Keeping an identical copy is harmless. Remove this if you confirm no such
// builds are in the wild.
const stableYmlPath = path.join(distDir, 'stable.yml');
fs.writeFileSync(stableYmlPath, yml, 'utf8');

console.log(`Generated dist/latest.yml`);
console.log(`Generated dist/stable.yml  (compat shim — identical copy of latest.yml)`);
console.log(`  version  : ${version}`);
console.log(`  product  : ${productName}`);
console.log(`  file     : ${exeFile}`);
console.log(`  size     : ${(byteSize / 1024 / 1024).toFixed(1)} MB  (${byteSize} bytes)`);
console.log(`  sha512   : ${sha512.slice(0, 24)}...`);
console.log(`  date     : ${releaseDate}`);
