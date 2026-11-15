const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'switchcontrol-preset-recovery-'));
process.env.APPDATA = appData;

let irqValue = null;
const shared = require('../ps-shared');
shared.queryPS = async (command) => {
  if (!command.includes("'IRQ8Priority'")) return '';
  return irqValue === null ? '' : String(irqValue);
};
shared.runPS = async (command) => {
  if (command.includes('Remove-ItemProperty') && command.includes("'IRQ8Priority'")) {
    irqValue = null;
    return;
  }
  const match = command.match(/-Name 'IRQ8Priority' -Value (\d+)/);
  if (match) irqValue = Number(match[1]);
};
shared.checkIsAdmin = async () => true;
shared.runElevated = async (command) => {
  await shared.runPS(command);
  return { ok: true };
};

const { APPDATA_DIR, PRESET_STATE_FILE, PRESET_LOG_FILE } = require('../user-data-paths');
const { applyPresetValue, reapplyAppliedPresetValues, resetPresetValue } =
  require('../preset-tweak-executor');
const IRQ_PROFILE = 'irq-optimization-profile';

function resetFixture() {
  fs.rmSync(appData, { recursive: true, force: true });
  fs.mkdirSync(appData, { recursive: true });
  irqValue = null;
}

test('verified preset intent survives a Windows reset and restores only with premium active', async () => {
  resetFixture();
  const applied = await applyPresetValue(IRQ_PROFILE, 'gaming');
  assert.equal(applied.ok, true);
  assert.equal(applied.persisted, true);
  assert.equal(irqValue, 1);
  assert.equal(JSON.parse(fs.readFileSync(PRESET_STATE_FILE, 'utf8')).appliedOptions[IRQ_PROFILE], 'gaming');

  // Simulate Windows removing the registry override during a reboot.
  irqValue = null;
  const inactive = await reapplyAppliedPresetValues(false);
  assert.equal(inactive.skipped.some(item => item.tweakId === IRQ_PROFILE && item.reason === 'premium_not_verified_active'), true);
  assert.equal(irqValue, null, 'an unverified entitlement must not write a premium preset');

  const restored = await reapplyAppliedPresetValues(true);
  assert.deepEqual(restored.reapplied.map(item => [item.tweakId, item.optionId]), [[IRQ_PROFILE, 'gaming']]);
  assert.equal(irqValue, 1);

  const reverted = await resetPresetValue(IRQ_PROFILE);
  assert.equal(reverted.ok, true);
  assert.equal(reverted.persisted, true);
  assert.equal(irqValue, null);
  assert.equal(
    Object.hasOwn(JSON.parse(fs.readFileSync(PRESET_STATE_FILE, 'utf8')).appliedOptions, IRQ_PROFILE),
    false,
    'a verified user revert must remove the startup target',
  );
});

test('legacy verified apply logs migrate the last selected preset target', async () => {
  resetFixture();
  fs.mkdirSync(APPDATA_DIR, { recursive: true });
  fs.writeFileSync(PRESET_STATE_FILE, JSON.stringify({
    originalValues: { [IRQ_PROFILE]: { optionId: 'balanced', capturedAt: '2026-11-15T00:00:00.000Z' } },
  }));
  fs.writeFileSync(PRESET_LOG_FILE, JSON.stringify([
    { tweakId: IRQ_PROFILE, action: 'apply', success: true, newOptionId: 'gaming' },
    { tweakId: IRQ_PROFILE, action: 'apply', success: true, newOptionId: 'streaming' },
  ]));

  const restored = await reapplyAppliedPresetValues(true);
  assert.deepEqual(restored.reapplied.map(item => item.optionId), ['gaming']);
  assert.equal(irqValue, 1);
  assert.equal(JSON.parse(fs.readFileSync(PRESET_STATE_FILE, 'utf8')).appliedOptions[IRQ_PROFILE], 'gaming');
});

test.after(() => {
  fs.rmSync(appData, { recursive: true, force: true });
});
