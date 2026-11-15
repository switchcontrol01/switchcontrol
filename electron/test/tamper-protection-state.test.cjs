const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTamperProtectionRegistryValue } = require('../tamper-protection-state');

test('explicit Windows Tamper Protection registry states map to on or off', () => {
  for (const value of [0, '0', 4, '4']) {
    assert.equal(parseTamperProtectionRegistryValue(value), false, `${value} means off`);
  }
  for (const value of [1, '1', 5, '5']) {
    assert.equal(parseTamperProtectionRegistryValue(value), true, `${value} means on`);
  }
});

test('unknown registry values remain unverified instead of becoming enabled', () => {
  for (const value of [null, undefined, '', 'unknown', 2, 3, 6, -1]) {
    assert.equal(parseTamperProtectionRegistryValue(value), null);
  }
});
