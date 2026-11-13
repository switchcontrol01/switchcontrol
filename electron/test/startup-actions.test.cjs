const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const helper = require('../startup-entry');

const location = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';
const name = 'AMDNoiseSuppression';
const command = '"C:\\WINDOWS\\system32\\AMD\\ANR\\AMDNoiseSuppression.exe"';
const entry = helper.resolveStartupEntry(location, name);

test('the screenshot HKLM Run entry resolves to the correct native source', () => {
  assert.equal(entry.source, 'registry-hklm');
  assert.equal(entry.registryKey, 'HKLM:');
  assert.equal(entry.registryName, name);
});
test('HKCU and WMI hive syntax are handled without defaulting unknown sources to HKCU', () => {
  assert.equal(helper.resolveStartupEntry(location.replace('HKLM:', 'HKCU'), name).source, 'registry-hkcu');
  assert.equal(helper.resolveStartupEntry(location.replace('HKLM:', 'HKEY_LOCAL_MACHINE'), name).source, 'registry-hklm');
  for (const value of ['', 'Startup', location + 'Once', 'HKU:\\Unknown\\Run']) {
    assert.equal(helper.resolveStartupEntry(value, name).source, null);
  }
});
test('quoted executable paths and their arguments are preserved', () => {
  assert.deepEqual(helper.parseStartupCommand('"C:\\Program Files\\Example\\App.exe" --quiet --profile "A B"'), {
    executable: 'C:\\Program Files\\Example\\App.exe', arguments: '--quiet --profile "A B"',
  });
  assert.equal(helper.parseStartupCommand(command).executable, 'C:\\WINDOWS\\system32\\AMD\\ANR\\AMDNoiseSuppression.exe');
  assert.equal(helper.parseStartupCommand('C:\\Tools\\App.exe --quiet').arguments, '--quiet');
});
test('malformed commands and control-character names are rejected', () => {
  for (const value of ['', 'app.exe', '"%ProgramFiles%\\App.exe"', '"C:\\Temp\\..\\App.exe"', 'C:\\x.exe\nbad']) {
    assert.equal(helper.parseStartupCommand(value), null);
  }
  assert.equal(helper.resolveStartupEntry(location, "name\nbad").source, null);
});
test('delay task IDs are stable and do not collide across hives or sanitized names', () => {
  assert.equal(helper.makeDelayTaskName(name, 'HKLM:'), entry.taskName);
  assert.notEqual(helper.makeDelayTaskName(name, 'HKCU:'), entry.taskName);
  assert.notEqual(helper.makeDelayTaskName('A/B', 'HKLM:'), helper.makeDelayTaskName('AB', 'HKLM:'));
});
test('Enable and Disable write and verify their actual Windows states', () => {
  for (const [enabled, flag] of [[true, 2], [false, 3]]) {
    const script = helper.buildSetEnabledScript(entry, enabled);
    assert.match(script, new RegExp(`\\[byte\\[\\]\\]\\(${flag},0`));
    assert.match(script, /StartupApproved\\Run/);
    assert.match(script, /Get-ItemProperty[\s\S]*Windows did not confirm/);
    assert.match(script, /SCSTARTUP_ENABLED:OK/);
    assert.ok(script.indexOf('Set-ItemProperty') < script.indexOf('Unregister-ScheduledTask'));
    assert.match(script, /previousBytes/);
    assert.match(script, /previousTaskXml/);
  }
});
test('Delay registers a verified task and disables the immediate launch instead of double-launching', () => {
  const parsed = helper.parseStartupCommand(command);
  const script = helper.buildSetDelayScript(entry, parsed.executable, parsed.arguments, 'PT2M');
  assert.match(script, /Register-ScheduledTask/);
  assert.match(script, /\$trigger\.Delay = 'PT2M'/);
  assert.match(script, /WorkingDirectory 'C:\\WINDOWS\\system32\\AMD\\ANR'/);
  assert.match(script, /\$disabled = \[byte\[\]\]\(3,0/);
  assert.match(script, /SCSTARTUP_DELAY:OK/);
  assert.ok(script.indexOf('Register-ScheduledTask -TaskName') < script.indexOf('Set-ItemProperty'));
  assert.match(script, /Export-ScheduledTask/);
  assert.match(script, /rollbackBytes/);
  assert.match(script, /-Xml \$previousTaskXml/);
});
test('all four UI delays are supported and other durations cannot be injected', () => {
  for (const delay of ['PT30S', 'PT1M', 'PT2M', 'PT5M']) {
    assert.match(helper.buildSetDelayScript(entry, 'C:\\Tools\\App.exe', '', delay), new RegExp(delay));
  }
  assert.throws(() => helper.buildSetDelayScript(entry, 'C:\\Tools\\App.exe', '', "PT2M'; bad"), /offered delay/);
});
test('user tasks stay user-scoped, machine tasks use a locale-independent group, and neither is elevated', () => {
  const user = helper.resolveStartupEntry(location.replace('HKLM:', 'HKCU:'), name);
  const script = helper.buildSetDelayScript(user, 'C:\\Tools\\App.exe', '--quiet', 'PT1M');
  assert.match(script, /AtLogOn -User \$user/);
  assert.match(script, /-LogonType Interactive -RunLevel Limited/);
  assert.ok(script.indexOf('AtLogOn -User $user') < script.indexOf("$trigger.Delay = 'PT1M'"));
  const machine = helper.buildSetDelayScript(entry, 'C:\\Tools\\App.exe', '', 'PT1M');
  assert.match(machine, /-GroupId 'S-1-5-32-545' -RunLevel Limited/);
  assert.doesNotMatch(machine, /-LogonType Group|RunLevel Highest/);
  assert.match(machine, /ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/);
  assert.match(machine, /DontStopIfGoingOnBatteries/);
});
test('delay metadata can be read back after a scan or page revisit', () => {
  const script = helper.buildSetDelayScript(entry, 'C:\\Tools\\App.exe', '', 'PT5M');
  assert.match(script, /NotePropertyName delayIso -NotePropertyValue 'PT5M'/);
  const status = helper.buildStartupStatusScript([{ ...entry, approvedPath: helper.startupApprovedPath(entry.registryKey) }]);
  assert.match(status, /registryKey = \$entry.registryKey/);
  assert.match(status, /delayIso = \$delayIso/);
});
test('root-drive executable paths retain a valid absolute working directory', () => {
  assert.match(helper.buildSetDelayScript(entry, 'C:\\App.exe', '', 'PT1M'), /WorkingDirectory 'C:\\'/);
});
test('matching legacy delay tasks are cancelled safely and preserved for rollback', () => {
  for (const script of [
    helper.buildSetEnabledScript(entry, false),
    helper.buildSetDelayScript(entry, 'C:\\Tools\\App.exe', '', 'PT2M'),
  ]) {
    assert.match(script, /SC-Delay-AMDNoiseSuppression/);
    assert.match(script, /-not \$legacy\.Description/);
    assert.match(script, /legacy\.Actions\[0\]\.Execute -eq/);
    assert.match(script, /legacyTaskXml/);
    assert.match(script, /-Xml \$legacyTaskXml/);
  }
});

function loadHandlers(output = 'SCSTARTUP_ENABLED:OK', platform = 'win32', busy = false) {
  const handlers = new Map();
  const scripts = [];
  let releases = 0;
  const actualRequire = createRequire(path.resolve('electron/security-helper.js'));
  vm.runInNewContext(fs.readFileSync('electron/security-helper.js', 'utf8'), {
    require(id) {
      if (id === 'electron') return { ipcMain: { handle: (key, fn) => handlers.set(key, fn), removeHandler() {} }, shell: {} };
      if (id === './powershell-limiter') return { tryAcquire: () => busy ? null : {}, release: () => releases++ };
      if (id === 'child_process') return { execFile(_file, args, _options, callback) {
        const script = args[args.length - 1]; scripts.push(script);
        if (output instanceof Error) callback(output, '', 'Access is denied.');
        else callback(null, typeof output === 'function' ? output(script) : output, '');
      } };
      return actualRequire(id);
    },
    process: { platform, env: {} }, console, Buffer, module: { exports: {} }, exports: {},
    __dirname: path.resolve('electron'), setTimeout, clearTimeout,
  });
  return { call: (key, params) => handlers.get(key)(null, params), scripts, get releases() { return releases; } };
}
test('the actual Disable IPC accepts the fixed UI contract and verifies Windows output', async () => {
  const h = loadHandlers();
  const result = await h.call('startup:setEnabled', { name, location, enabled: false });
  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(result.enabled, false);
  assert.match(h.scripts[0], /HKLM:\\SOFTWARE/);
  assert.equal(h.releases, 1);
});
test('the actual Delay IPC retains arguments, schedules the selected duration and reports verification', async () => {
  const h = loadHandlers('SCSTARTUP_DELAY:OK');
  const result = await h.call('startup:setDelay', { name, location, command: command + ' --quiet', delayIso: 'PT2M' });
  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(result.delayIso, 'PT2M');
  assert.match(h.scripts[0], /-Argument '--quiet'/);
  assert.equal(h.releases, 1);
});
test('native failures, missing verification, and busy state never report success', async () => {
  const failure = loadHandlers(new Error('denied'));
  assert.equal((await failure.call('startup:setEnabled', { name, location, enabled: false })).ok, false);
  assert.equal(failure.releases, 1);
  const missing = loadHandlers('not confirmed');
  assert.equal((await missing.call('startup:setEnabled', { name, location, enabled: false })).ok, false);
  const busy = loadHandlers('', 'win32', true);
  assert.equal((await busy.call('startup:setDelay', { name, location, command, delayIso: 'PT1M' })).reason, 'busy');
  assert.equal(busy.scripts.length, 0);
});
test('unsupported hosts or sources do not execute a mutation', async () => {
  const linux = loadHandlers('', 'linux');
  assert.equal((await linux.call('startup:setEnabled', { name, location, enabled: false })).reason, 'not-windows');
  const invalid = loadHandlers();
  assert.equal((await invalid.call('startup:setDelay', { name, location: 'Unknown', command, delayIso: 'PT1M' })).ok, false);
  assert.equal(invalid.scripts.length, 0);
});
test('startup scanning passes real source and persisted delay status to the UI', async () => {
  const h = loadHandlers(script => script.includes('Win32_StartupCommand')
    ? JSON.stringify([{ Name: name, Command: command, Location: location }])
    : JSON.stringify([{ registryName: name, registryKey: 'HKLM:', enabled: false, delayIso: 'PT2M' }]));
  const result = await h.call('security:getStartupApps');
  assert.equal(result.available, true);
  assert.equal(result.data[0].source, 'registry-hklm');
  assert.equal(result.data[0].enabled, false);
  assert.equal(result.data[0].delayIso, 'PT2M');
});
test('the UI sends the right payload, exposes real failures, and keeps the delay menu visible', () => {
  const source = fs.readFileSync('client/src/components/security/SecurityStartupTab.tsx', 'utf8');
  assert.match(source, /setEnabled\(\{ name: item\.name, location: item\.location, enabled \}\)/);
  assert.match(source, /command: item\.command, location: item\.location, delayIso: iso/);
  assert.match(source, /r\?\.ok && r\?\.verified/);
  assert.match(source, /r\?\.error/);
  assert.match(source, /Cancel delay/);
  assert.doesNotMatch(source, /absolute top-full/);
});
test('the new native helper is included in the packaged Windows application', () => {
  const pkg = JSON.parse(fs.readFileSync('electron/package.json', 'utf8'));
  assert.ok(pkg.build.files.includes('startup-entry.js'));
});

let StartupTab;
test.before(async () => {
  const React = require('react');
  const { build } = require('esbuild');
  const Module = require('node:module');
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const result = await build({
    entryPoints: [path.resolve('client/src/components/security/SecurityStartupTab.tsx')],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'lucide-react'],
    plugins: [{
      name: 'startup-ui-boundaries',
      setup(build) {
        build.onResolve({ filter: /^@\// }, args => ({ path: args.path, namespace: 'fixture' }));
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
          if (args.path.endsWith('/motion')) return { contents: 'export const motion={div:"div"}; export const AnimatePresence=({children})=>children;', loader: 'js' };
          if (args.path.endsWith('/utils')) return { contents: 'export const cn=(...args)=>args.filter(Boolean).join(" ");', loader: 'js' };
          const name = args.path.endsWith('/button') ? 'Button' : args.path.endsWith('/badge') ? 'Badge' : 'GlassCard';
          const tag = name === 'Button' ? 'button' : name === 'Badge' ? 'span' : 'div';
          return { contents: `import React from 'react'; export const ${name}=({children,...props})=>React.createElement('${tag}',props,children);`, loader: 'js' };
        });
      },
    }],
  });
  const file = path.resolve('electron/test/.startup-ui.cjs');
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = Module._nodeModulePaths(path.dirname(file));
  compiled._compile(result.outputFiles[0].text, file);
  StartupTab = compiled.exports.SecurityStartupTab;
});

async function mountUI(api, overrides = {}) {
  const React = require('react');
  const { create, act } = require('react-test-renderer');
  globalThis.window = { electronAPI: { startup: api } };
  const item = { name, command, location, publisher: null, category: 'system', impact: 'low', recommendation: 'keep', source: entry.source, enabled: true, ...overrides };
  let renderer;
  await act(async () => { renderer = create(React.createElement(StartupTab, { startupItems: [item], hasSecurity: true, scanning: false, onRefresh: async () => {} })); });
  await act(async () => renderer.root.findByProps({ 'data-testid': 'startup-row-amdnoisesuppression' }).props.onClick());
  return {
    renderer,
    async click(id) { await act(async () => renderer.root.findByProps({ 'data-testid': id }).props.onClick()); },
    async close() { await act(async () => renderer.unmount()); },
    json() { return JSON.stringify(renderer.toJSON()); },
  };
}

test('actual UI Delay selection sends the original command and shows the selected duration', async () => {
  const { act } = require('react-test-renderer');
  let payload;
  const h = await mountUI({ setDelay: async value => { payload = value; return { ok: true, verified: true }; } });
  try {
    await h.click(`btn-delay-${name}`);
    const option = h.renderer.root.findAllByType('button').find(node => node.props.children === '2 minutes');
    assert.ok(option, 'delay menu exposes the selected duration in normal row layout');
    await act(async () => option.props.onClick());
    assert.deepEqual(payload, { name, command, location, delayIso: 'PT2M' });
    assert.match(h.json(), /2 minutes/);
    assert.match(h.json(), /Immediate launch is disabled/);
    assert.match(h.json(), /confirmed by Windows/);
  } finally { await h.close(); }
});

test('actual UI Disable cancels the displayed delayed state only after verified success', async () => {
  let payload;
  const h = await mountUI({ setEnabled: async value => { payload = value; return { ok: true, verified: true }; } }, { enabled: false, delayIso: 'PT2M' });
  try {
    await h.click(`btn-disable-${name}`);
    assert.deepEqual(payload, { name, location, enabled: false });
    assert.match(h.json(), /Disabled — confirmed by Windows/);
    assert.doesNotMatch(h.json(), /Immediate launch is disabled/);
  } finally { await h.close(); }
});

test('actual UI Cancel delay enables the normal startup path', async () => {
  const { act } = require('react-test-renderer');
  let payload;
  const h = await mountUI({ setEnabled: async value => { payload = value; return { ok: true, verified: true }; } }, { enabled: false, delayIso: 'PT1M' });
  try {
    const cancel = h.renderer.root.findAllByType('button').find(node => node.props.children === 'Cancel delay');
    await act(async () => cancel.props.onClick());
    assert.equal(payload.enabled, true);
    assert.match(h.json(), /Enabled — confirmed by Windows/);
    assert.doesNotMatch(h.json(), /Immediate launch is disabled/);
  } finally { await h.close(); }
});

test('actual UI keeps the old state and exposes an actionable native error on failure', async () => {
  const h = await mountUI({ setEnabled: async () => ({ ok: false, error: 'Access denied. Run as administrator.' }) });
  try {
    await h.click(`btn-disable-${name}`);
    assert.match(h.json(), /Access denied\. Run as administrator/);
    assert.doesNotMatch(h.json(), /Disabled — confirmed by Windows/);
    assert.equal(h.renderer.root.findByProps({ 'data-testid': `btn-disable-${name}` }).props.disabled, false);
  } finally { await h.close(); }
});
