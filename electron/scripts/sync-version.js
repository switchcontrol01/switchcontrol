#!/usr/bin/env node
/**
 * sync-version.js
 * ---------------
 * Validates that root/package.json and electron/package.json carry the
 * same version string. Exits with code 1 if they differ so build pipelines
 * can catch the mismatch before a release goes out.
 *
 * Usage:
 *   node scripts/sync-version.js
 *
 * Called automatically by the release workflow before building artifacts.
 * Run manually at any time to verify version alignment.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const rootPkgPath     = path.join(__dirname, '..', '..', 'package.json');
const electronPkgPath = path.join(__dirname, '..', 'package.json');

function readVersion(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found: ${filePath}`);
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!pkg.version) {
    console.error(`ERROR: No "version" field in ${filePath}`);
    process.exit(1);
  }
  return pkg.version;
}

const rootVersion     = readVersion(rootPkgPath);
const electronVersion = readVersion(electronPkgPath);

if (rootVersion !== electronVersion) {
  console.error('\nERROR: Version mismatch between packages!\n');
  console.error(`  root/package.json     : ${rootVersion}`);
  console.error(`  electron/package.json : ${electronVersion}`);
  console.error('\nFix: update both files to the same version before building or releasing.');
  console.error('The canonical version lives in root/package.json; keep electron/package.json in sync.\n');
  process.exit(1);
}

console.log(`Version sync OK: ${rootVersion}`);
