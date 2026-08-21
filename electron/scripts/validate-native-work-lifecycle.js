'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const electronDir = path.resolve(__dirname, '..');
const psShared = fs.readFileSync(path.join(electronDir, 'ps-shared.js'), 'utf8');
const main = fs.readFileSync(path.join(electronDir, 'main.js'), 'utf8');

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing section start: ${startMarker}`);
  assert.notEqual(end, -1, `missing section end: ${endMarker}`);
  return source.slice(start, end);
}

// The semaphore must wrap the complete elevated lifecycle. A release inside
// the wscript callback would incorrectly free the slot before the child ends.
const runElevated = section(psShared, 'async function runElevated(', 'async function runElevatedCommands(');
const runElevatedCommands = section(psShared, 'async function runElevatedCommands(', 'module.exports');
for (const [name, source] of [['runElevated', runElevated], ['runElevatedCommands', runElevatedCommands]]) {
  assert.match(source, /return _withPsSemaphore\(async \(\) => \{/,
    `${name} must acquire one permit around its full lifecycle`);
  assert.match(source, /finally \{\s*[\s\S]*cleanup\(\);/,
    `${name} must clean temporary files on every completion path`);
  assert.doesNotMatch(source, /await _withPsSemaphore\(\(\) => new Promise/,
    `${name} must not release the permit immediately after launching wscript`);
}

// These are the expensive direct-probe paths. Each must have an in-flight
// guard so overlapping IPC calls share one native operation.
for (const marker of [
  'telemetry:getMemoryDetails',
  'telemetry:getGpu',
  'telemetry:refreshDeepHardware',
  'system:getAllDisks',
]) {
  const start = main.indexOf(`ipcMain.handle('${marker}'`);
  assert.notEqual(start, -1, `missing IPC handler: ${marker}`);
  const next = main.indexOf('\n  ipcMain.handle(', start + 1);
  const source = main.slice(start, next === -1 ? undefined : next);
  if (marker === 'system:getAllDisks') {
    assert.match(main, /function readDiskSizesOnce\(\)/,
      `${marker} must use the shared disk probe helper`);
    assert.match(source, /readDiskSizesOnce\(\)/,
      `${marker} must join the shared disk probe promise`);
  } else {
    assert.match(source, /InFlight/, `${marker} must expose an in-flight guard`);
    assert.match(source, /return _\w+InFlight/, `${marker} must join the in-flight promise`);
  }
}

// Generic promise-sharing check: concurrent callers get the same work, while
// a later call after settlement starts a fresh operation.
let calls = 0;
let inFlight = null;
function probeOnce() {
  if (inFlight) return inFlight;
  inFlight = new Promise(resolve => {
    calls += 1;
    setTimeout(() => resolve({ calls }), 5);
  }).finally(() => { inFlight = null; });
  return inFlight;
}

(async () => {
  const [a, b, c] = await Promise.all([probeOnce(), probeOnce(), probeOnce()]);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  assert.equal(calls, 1, 'concurrent callers must share one probe');
  await probeOnce();
  assert.equal(calls, 2, 'a later caller must be able to start a fresh probe');
  console.log('[native-work-validation] lifecycle and single-flight checks passed');
})().catch(error => {
  console.error('[native-work-validation] failed:', error.message);
  process.exitCode = 1;
});