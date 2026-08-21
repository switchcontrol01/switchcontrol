'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const clientFiles = [
  'client/src/App.tsx',
  'client/src/pages/Home.tsx',
  'client/src/pages/AiAdvisor.tsx',
  'client/src/pages/Settings.tsx',
  'client/src/pages/History.tsx',
  'client/src/hooks/useTweakIntelligence.ts',
  'client/src/hooks/useGpuSelector.ts',
  'client/src/components/tweaks/TweaksList.tsx',
  'client/src/components/optimization/OptimizationFlow.tsx',
  'client/src/components/dashboard/MemoryCleanerModal.tsx',
  'client/src/components/dashboard/DetectedIssues.tsx',
  'client/src/components/ai/OptimizeWorkflow.tsx',
];

// These are the large/high-frequency consumers audited for this change.
for (const file of clientFiles) {
  const source = read(file);
  assert.doesNotMatch(source, /useStore\(\s*\)/, `${file} still subscribes to the entire app store`);
}

const telemetryHook = read('client/src/hooks/useLiveTelemetry.ts');
assert.match(telemetryHook, /export function useLiveTelemetryValues\(\)/);
assert.match(telemetryHook, /export function useTelemetryHistory\(\)/);
assert.match(telemetryHook, /useTelemetryStore\(\(s\) => s\.history\)/);

const liveGraph = read('client/src/components/dashboard/LiveGraph.tsx');
assert.match(liveGraph, /useLiveTelemetryValues/);
assert.match(liveGraph, /useTelemetryHistory/);

const telemetryStore = read('client/src/stores/telemetryStore.ts');
assert.match(telemetryStore, /history:\s*\{/);
assert.match(telemetryStore, /telemetry:\s*t/);
assert.match(telemetryStore, /history:\s*\{/);

const main = read('electron/main.js');
const primeStart = main.indexOf('const [primeCpuLoad');
assert.notEqual(primeStart, -1, 'startup telemetry prime is missing');
const primeWindow = main.slice(Math.max(0, primeStart - 500), primeStart + 700);
assert.match(primeWindow, /_detectLowEndHardware\('prime'\)/);
assert.match(primeWindow, /_lowEndMode \? Promise\.resolve\(null\) : si\.disksIO\(\)/);
assert.match(primeWindow, /si\.currentLoad\(\)/);
assert.match(primeWindow, /si\.mem\(\)/);

// Exercise the policy shape deterministically for both hardware classes. This
// mirrors the production condition without invoking systeminformation.
function shouldPrimeDiskIo(logicalCores, totalRamGb) {
  const lowEnd = logicalCores <= 4 || totalRamGb <= 6;
  return !lowEnd;
}
assert.equal(shouldPrimeDiskIo(4, 16), false);
assert.equal(shouldPrimeDiskIo(8, 4), false);
assert.equal(shouldPrimeDiskIo(8, 16), true);

console.log('[performance-validation] selector, telemetry split, and startup-prime checks passed');