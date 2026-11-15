const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createSharedReadProbe } = require('../shared-read-probe');

const busy = { available: false, reason: 'temporarily_failed', detail: 'The PowerShell probe queue is busy.' };
const available = { available: true, data: { realtimeProtection: true, firewallEnabled: true } };

test('mount and Smart Scan share an in-flight protection result', async () => {
  let finish, calls = 0;
  const probe = createSharedReadProbe(() => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  });
  const mount = probe(), scan = probe();
  assert.equal(mount, scan);
  assert.equal(calls, 1);
  finish(available);
  const [a, b] = await Promise.all([mount, scan]);
  assert.equal(a, available);
  assert.equal(b, available);
});

test('completed reads are not cached and explicit refresh collects fresh evidence', async () => {
  let calls = 0;
  const probe = createSharedReadProbe(async () => ({ available: true, data: ++calls }));
  assert.equal((await probe()).data, 1);
  assert.equal((await probe()).data, 2);
});

test('transient capacity pressure waits and retries for all concurrent consumers', async () => {
  let calls = 0;
  const probe = createSharedReadProbe(async () => ++calls < 3 ? busy : available,
    { maxBusyRetries: 3, retryDelayMs: 0 });
  const results = await Promise.all([probe(), probe()]);
  assert.equal(calls, 3);
  assert.ok(results.every(result => result === available));
});

test('persistent capacity pressure remains unavailable after a bounded wait', async () => {
  let calls = 0;
  const probe = createSharedReadProbe(async () => { calls++; return busy; },
    { maxBusyRetries: 2, retryDelayMs: 0 });
  assert.equal(await probe(), busy);
  assert.equal(calls, 3);
});

test('unsupported, denied and failed probes do not become healthy or endlessly retry', async () => {
  for (const result of [
    { available: false, reason: 'unsupported' },
    { available: false, reason: 'permission_denied' },
    { available: false, reason: 'temporarily_failed', detail: 'Windows returned invalid probe data.' },
  ]) {
    let calls = 0;
    const probe = createSharedReadProbe(async () => { calls++; return result; });
    assert.equal(await probe(), result);
    assert.equal(calls, 1);
  }
});

test('a rejected read clears the shared promise so a later scan can recover', async () => {
  let calls = 0;
  const probe = createSharedReadProbe(async () => {
    if (++calls === 1) throw new Error('probe failed');
    return available;
  });
  await assert.rejects(probe(), /probe failed/);
  assert.equal(await probe(), available);
});

test('all Smart Scan read stages share probes; destructive actions do not', () => {
  const source = fs.readFileSync('electron/security-helper.js', 'utf8');
  assert.ok(source.includes("['IsTamperProtected']"), 'Tamper Protection uses Defender state, not policy source');
  assert.ok(!source.includes('$mp.TamperProtectionSource'), 'policy source must not be interpreted as enabled/disabled');
  assert.ok(source.includes("if ($tamperValue -is [bool])"), 'native booleans retain their value');
  assert.ok(source.includes('TamperProtectionRegistryValue'), 'registry fallback preserves the raw Windows value for explicit mapping');
  assert.ok(source.includes('parseTamperProtectionRegistryValue(mpData?.TamperProtectionRegistryValue)'), 'registry fallback uses explicit state mapping');
  assert.ok(source.includes("typeof directTamperValue === 'boolean'"), 'explicit Defender state takes precedence over the registry');
  assert.ok(source.includes("if ($tamperText -match '^(false|0|no|off)$')"), 'false strings must parse as off, not as PowerShell truthy strings');
  assert.ok(!source.includes('[bool]$tamperProp.Value'), 'do not cast a non-empty "False" string to true');
  for (const channel of ['getStatus', 'getAdvancedProtection', 'getStartupApps', 'getProcessDetails', 'getTopProcesses']) {
    assert.ok(source.includes(`registerSharedRead('security:${channel}'`));
  }
  assert.ok(source.includes("ipcMain.handle('security:runDefenderAction'"));
  assert.ok(source.includes("ipcMain.handle('security:setDefenderOption'"));
  const packaged = JSON.parse(fs.readFileSync('electron/package.json', 'utf8'));
  assert.ok(packaged.build.files.includes('shared-read-probe.js'));
});

test('Tweaks reuses startup Tamper Protection status instead of probing on every visit', () => {
  const tweaks = fs.readFileSync('client/src/components/tweaks/TweaksList.tsx', 'utf8');
  const app = fs.readFileSync('client/src/App.tsx', 'utf8');
  assert.ok(tweaks.includes('const conditionsRefreshing = isElectron && !conditionsChecked'));
  assert.ok(!tweaks.includes('api.security.getStatus'), 'Tweaks navigation must not start another Windows query');
  assert.ok(!tweaks.includes('window.addEventListener("focus"'), 'focus changes must not start another Windows query');
  assert.ok(app.includes('electronAPI?.security?.getStatus?.()'), 'startup reconciliation remains the source of the shared status');
});

test('actual protection IPC shares the successful Windows result during the reported race', async () => {
  const file = path.resolve('electron/security-helper.js');
  const localRequire = createRequire(file);
  const handlers = new Map();
  let acquisitions = 0, releases = 0, psCalls = 0;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    process: { platform: 'win32' },
    console: { log() {}, warn() {} },
    setTimeout, clearTimeout,
    require(name) {
      if (name === 'electron') return {
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler() {} },
        shell: {},
      };
      if (name === './powershell-limiter') return {
        tryAcquire() { acquisitions++; return {}; },
        release() { releases++; },
      };
      if (name === 'child_process') return { execFile(_exe, args, _options, callback) {
        psCalls++;
        const data = args.at(-1).includes('Get-NetFirewallProfile')
          ? { profiles: [{ Name: 'Public', Enabled: true }], activeCategories: ['Public'] }
          : { RealTimeProtectionEnabled: true, AntispywareEnabled: true, TamperProtectionEnabled: true, DefenderAvailable: true };
        queueMicrotask(() => callback(null, JSON.stringify(data), ''));
      } };
      return localRequire(name);
    },
  }, { filename: file });
  const getStatus = handlers.get('security:getStatus');
  const pageRead = getStatus(), smartScanRead = getStatus();
  assert.equal(pageRead, smartScanRead);
  const [pageResult, scanResult] = await Promise.all([pageRead, smartScanRead]);
  assert.equal(scanResult, pageResult);
  assert.equal(scanResult.available, true);
  assert.equal(scanResult.data.realtimeProtection, true);
  assert.equal(scanResult.data.firewallEnabled, true);
  assert.equal(acquisitions, 1);
  assert.equal(releases, 1);
  assert.equal(psCalls, 2, 'one Defender query and one firewall query, shared by both callers');
});
