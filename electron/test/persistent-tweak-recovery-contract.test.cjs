const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const tweakExecutor = require("../tweak-executor");
const networkExecutor = require("../network-tweak-executor");

const read = (relativePath) => fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");

test("the named persistent Windows toggles are connected to owned-target recovery", () => {
  assert.deepEqual(tweakExecutor.PERSISTENT_REAPPLY_TWEAK_IDS, [
    "bg-apps",
    "ntfs-last-access",
    "tcp-no-delay",
    "timer-res",
    "tune-priority",
  ]);
  assert.equal(typeof tweakExecutor.reapplyOwnedPersistentTweaks, "function");
  assert.equal(typeof networkExecutor.reapplyOwnedNetworkTweaks, "function");
});

test("timer resolution records and verifies its applied state for restart recovery", () => {
  const source = read("electron/tweak-executor.js");
  const start = source.indexOf("if (tweak._special === 'timer-res') {", source.indexOf("async function executeTweak("));
  const end = source.indexOf("\n  if (tweak._special === 'nvidia-telemetry')", start);
  assert.ok(start >= 0 && end > start, "timer handler should exist");
  const handler = source.slice(start, end);
  assert.match(handler, /const verified = ok && verification\.verified === true/);
  assert.match(handler, /await _updateState\(state => \{ state\.tweaks\[tweakId\] = expectedApplied; \}\)/);
  assert.match(handler, /verified,\s+unsupported:/);
});

test("background-app status comes from Windows, not a surviving app marker", () => {
  const source = read("electron/tweak-executor.js");
  const start = source.indexOf("'bg-apps': {");
  const end = source.indexOf("\n  'disable-fso':", start);
  assert.ok(start >= 0 && end > start, "background-app tweak should exist");
  const definition = source.slice(start, end);
  assert.match(definition, /GlobalUserDisabled/);
  assert.match(definition, /\(\$k -eq 1\)/);
  assert.doesNotMatch(definition, /\(\$m -eq 1\) -or \(\$mc -eq 1\)/);
});

test("owned target recovery is periodic and refreshes network UI state", () => {
  const app = read("client/src/App.tsx");
  const main = read("electron/main.js");
  assert.match(app, /api\.reconcileOwnedTargets\(premiumIsActive === true\)/);
  assert.match(app, /setInterval\(\(\) => void reconcile\(\), 90_000\)/);
  assert.match(app, /result\.sliders\?\.unchanged/);
  assert.match(app, /result\.toggles\?\.unchanged/);
  assert.match(app, /result\.network\?\.unchanged/);
  assert.match(app, /setTweak\("tune-priority", item\.value === 38\)/);
  assert.match(app, /sc:net-reconciled/);
  assert.match(main, /ipcMain\.handle\('tweak:reconcileOwnedTargets'/);
});

test("Nagle uses one canonical owner for both network and Tweaks surfaces", () => {
  const main = read("electron/main.js");
  const executor = read("electron/tweak-executor.js");
  assert.match(main, /tweakExecutor\.executeTweakWithOwnership\('tcp-no-delay', ipcAction/);
  assert.match(executor, /record\.itemId === 'tcp-nagle'/);
  assert.match(executor, /recordRevert\(legacyNagle\.scopeKey\)/);
  assert.match(executor, /TcpNoDelay","TcpAckFrequency/);
});

test("priority and timer controls use one persisted target across toggle and slider surfaces", () => {
  const main = read("electron/main.js");
  const sliderHook = read("client/src/hooks/use-slider-tweak.ts");
  const toggleHook = read("client/src/hooks/use-tweak-executor.ts");
  assert.match(main, /win32-priority-sep', 'tune-priority/);
  assert.match(main, /timer-resolution-slider', 'timer-res/);
  assert.match(main, /setAppliedSliderTarget\(sliderId, target\)/);
  assert.match(sliderHook, /setTweak\('tune-priority', confirmedValue === 38\)/);
  assert.match(toggleHook, /PRIORITY_SLIDER_ID, priorityValue/);
});
