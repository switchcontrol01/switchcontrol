#!/usr/bin/env node
/**
 * Verify the single Electron packaging contract before electron-builder runs.
 *
 * This intentionally checks the generated inputs and the runtime paths used by
 * main.js/backend-launcher.js. It does not build or mutate any files.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ELECTRON_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(ELECTRON_DIR, '..');
const failures = [];

function exists(relativePath) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(fullPath)) failures.push(`Missing required path: ${relativePath}`);
}

function readJson(relativePath) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    failures.push(`Could not read ${relativePath}: ${error.message}`);
    return null;
  }
}

const rootPackage = readJson('package.json');
const electronPackage = readJson('electron/package.json');
const electronBuild = electronPackage?.build;

if (rootPackage?.version !== electronPackage?.version) {
  failures.push(`Version mismatch: root=${rootPackage?.version ?? 'missing'} electron=${electronPackage?.version ?? 'missing'}`);
}

if (!electronBuild) {
  failures.push('electron/package.json does not contain the authoritative build configuration');
} else {
  if (electronBuild.appId !== 'com.switchcontrol.app') {
    failures.push(`Unexpected Electron appId: ${electronBuild.appId}`);
  }
  if (electronBuild.productName !== 'SwitchControl') {
    failures.push(`Unexpected productName: ${electronBuild.productName}`);
  }
  if (electronBuild.directories?.output !== 'dist') {
    failures.push(`Electron output must be electron/dist, got ${electronBuild.directories?.output ?? 'missing'}`);
  }
  if (!Array.isArray(electronBuild.extraResources)) {
    failures.push('Electron build must declare extraResources explicitly');
  }
}

// Generated inputs consumed by electron/package.json and runtime paths in
// main.js/backend-launcher.js.
[
  'dist/index.cjs',
  'dist-electron/index.html',
  'dist-electron/index.html',
  'electron/build/icon.ico',
  'electron/bin',
].forEach(exists);

if (failures.length > 0) {
  console.error('[package-contract] FAIL');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('[package-contract] PASS');
console.log('  authoritative config: electron/package.json#build');
console.log('  renderer input: dist-electron -> packaged resources/dist');
console.log('  backend input: dist/index.cjs -> packaged resources/dist/index.cjs');
console.log('  runtime appId: com.switchcontrol.app');