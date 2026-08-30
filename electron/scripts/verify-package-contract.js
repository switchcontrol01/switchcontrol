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
  if (!Array.isArray(electronBuild.files) || !electronBuild.files.includes('debloat-contract.cjs')) {
    failures.push('Electron build must include debloat-contract.cjs in its packaged files');
  }
  if (!Array.isArray(electronBuild.files) || !electronBuild.files.includes('process-count.js')) {
    failures.push('Electron build must include process-count.js in its packaged files');
  }
}

// Generated inputs consumed by electron/package.json and runtime paths in
// main.js/backend-launcher.js.
[
  'dist/index.cjs',
  'dist-electron/index.html',
  'electron/build/icon.ico',
  'electron/bin',
].forEach(exists);

// Every desktop page must remain available as a renderer chunk. This catches
// accidental eager imports as well as a build that silently drops a route.
// The check runs against the generated renderer input, before electron-builder
// copies it into the packaged resources directory.
const desktopChunkPrefixes = [
  'Home',
  'Tweaks',
  'NetworkTweaks',
  'SystemCleaner',
  'Settings',
  'PowerPlan',
  'Debloater',
  'StartupApps',
  'NicTuning',
  'BiosAdvisor',
  'AiAdvisor',
  'DriverIntelligence',
  'LatencyAnalyzer',
  'Security',
  'History',
  'ProcessManager',
];
const rendererAssetsDir = path.join(ROOT_DIR, 'dist-electron', 'assets');
if (fs.existsSync(rendererAssetsDir)) {
  const rendererAssets = fs.readdirSync(rendererAssetsDir);
  for (const prefix of desktopChunkPrefixes) {
    if (!rendererAssets.some(name => name.startsWith(`${prefix}-`) && name.endsWith('.js'))) {
      failures.push(`Missing demand-loaded desktop route chunk: ${prefix}`);
    }
  }
  const routeChunkBytes = rendererAssets
    .filter(name => desktopChunkPrefixes.some(prefix => name.startsWith(`${prefix}-`)))
    .reduce((total, name) => total + fs.statSync(path.join(rendererAssetsDir, name)).size, 0);
  const rendererIndex = path.join(ROOT_DIR, 'dist-electron', 'index.html');
  let initialEntryBytes = 0;
  if (fs.existsSync(rendererIndex)) {
    const html = fs.readFileSync(rendererIndex, 'utf8');
    const entryMatch = html.match(/src=["'](?:\.\/)?(assets\/[^"']+\.js)["']/);
    if (entryMatch) {
      const entryPath = path.join(ROOT_DIR, 'dist-electron', entryMatch[1]);
      if (fs.existsSync(entryPath)) initialEntryBytes = fs.statSync(entryPath).size;
    }
  }
  console.log(`  initial renderer entry: ${(initialEntryBytes / 1024).toFixed(0)} KiB`);
  console.log(`  deferred desktop route chunks: ${desktopChunkPrefixes.length} (${(routeChunkBytes / 1024).toFixed(0)} KiB)`);
}

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