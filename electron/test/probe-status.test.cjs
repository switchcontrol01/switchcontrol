const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  PROBE_STATUS,
  classifyPowerShellFailure,
  statusLabel,
} = require('../probe-status');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const securitySource = fs.readFileSync(path.join(__dirname, '..', 'security-helper.js'), 'utf8');

test('classifies native PowerShell failures into user-actionable states', () => {
  assert.equal(
    classifyPowerShellFailure(new Error('The term Get-PnpDevice is not recognized as the name of a cmdlet')),
    PROBE_STATUS.UNSUPPORTED,
  );
  assert.equal(
    classifyPowerShellFailure(new Error('Access is denied')),
    PROBE_STATUS.PERMISSION_DENIED,
  );
  assert.equal(
    classifyPowerShellFailure(new Error('Invalid namespace root/wmi')),
    PROBE_STATUS.PROVIDER_UNAVAILABLE,
  );
  assert.equal(
    classifyPowerShellFailure(Object.assign(new Error('Command timed out'), { killed: true })),
    PROBE_STATUS.TEMPORARILY_FAILED,
  );
});

test('status labels remain explicit instead of collapsing to generic errors', () => {
  assert.equal(statusLabel(PROBE_STATUS.UNSUPPORTED), 'Unsupported on this Windows edition');
  assert.equal(statusLabel(PROBE_STATUS.PERMISSION_DENIED), 'Permission denied');
  assert.equal(statusLabel(PROBE_STATUS.PROVIDER_UNAVAILABLE), 'Driver/provider unavailable');
  assert.equal(statusLabel(PROBE_STATUS.TEMPORARILY_FAILED), 'Probe temporarily failed');
});

test('Bluetooth probe is compatible with Windows PowerShell 5.1', () => {
  assert.doesNotMatch(mainSource, /FriendlyName\s*\?\?/);
  assert.match(mainSource, /Get-Command Get-PnpDevice/);
  assert.match(mainSource, /IsNullOrWhiteSpace\(\$friendly\)/);
  assert.match(mainSource, /system:getBluetoothDevice/);
});

test('newer Windows cmdlets are checked before security probes execute', () => {
  assert.match(securitySource, /knownCmdlets = \[/);
  assert.match(securitySource, /Get-Command \$\{cmdlet\}/);
  assert.match(securitySource, /probeStatus = classifyPowerShellFailure/);
  assert.doesNotMatch(securitySource, /reason: 'error'/);
});

test('display detection retains an Electron high-DPI baseline and hot-plug hooks', () => {
  assert.match(mainSource, /getElectronDisplaySnapshot/);
  assert.match(mainSource, /scaleFactor:/);
  assert.match(mainSource, /workArea:/);
  assert.match(mainSource, /display-added/);
  assert.match(mainSource, /display-removed/);
  assert.match(mainSource, /display-metrics-changed/);
  assert.match(mainSource, /Get-SwitchControlCim/);
});