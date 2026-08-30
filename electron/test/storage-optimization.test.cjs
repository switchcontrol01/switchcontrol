const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const moduleUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'client', 'src', 'lib', 'storageOptimization.ts'),
).href;
const storageSource = fs.readFileSync(path.join(__dirname, '..', 'storage-helper.js'), 'utf8');

const NOW = Date.parse('2026-08-30T12:00:00.000Z');
const ssd = {
  letter: 'C',
  mediaType: 'SSD',
  busType: 'NVMe',
  trimEnabled: true,
};

test('recent Windows Optimize Drives run overrides stale SwitchControl history', async () => {
  const { getStorageOptimizationRecommendation } = await import(moduleUrl);
  const recommendation = getStorageOptimizationRecommendation(
    {
      ...ssd,
      optimization: {
        lastRunAt: '2026-08-29T09:00:00.000Z',
        lastTaskResult: 0,
        scheduleEnabled: true,
        status: 'available',
        source: 'windows-scheduled-task',
      },
    },
    [{
      drive_letter: 'C',
      optimize_type: 'trim',
      status: 'success',
      ran_at: '2026-07-03T09:00:00.000Z',
    }],
    NOW,
  );

  assert.equal(recommendation.days, 1);
  assert.equal(recommendation.lastRunSource, 'windows');
  assert.equal(recommendation.due, false);
  assert.equal(recommendation.action, 'TRIM is up to date');
});

test('opening the app repeatedly cannot make TRIM become recommended', async () => {
  const { getStorageOptimizationRecommendation } = await import(moduleUrl);
  const drive = {
    ...ssd,
    optimization: {
      lastRunAt: '2026-08-29T09:00:00.000Z',
      lastTaskResult: 0,
      scheduleEnabled: true,
      status: 'available',
      source: 'windows-scheduled-task',
    },
  };

  for (let launch = 0; launch < 10; launch += 1) {
    assert.equal(getStorageOptimizationRecommendation(drive, [], NOW).due, false);
  }
});

test('failed and mismatched app runs are not treated as successful optimization', async () => {
  const { getStorageOptimizationRecommendation } = await import(moduleUrl);
  const recommendation = getStorageOptimizationRecommendation(ssd, [
    { drive_letter: 'C', optimize_type: 'trim', status: 'failed', ran_at: '2026-08-29T09:00:00.000Z' },
    { drive_letter: 'D', optimize_type: 'trim', status: 'success', ran_at: '2026-08-29T09:00:00.000Z' },
  ], NOW);

  assert.equal(recommendation.lastRunAt, null);
  assert.equal(recommendation.due, false);
  assert.equal(recommendation.action, 'TRIM status unavailable');
});

test('TRIM-disabled SSD never recommends a ReTrim operation', async () => {
  const { getStorageOptimizationRecommendation } = await import(moduleUrl);
  const recommendation = getStorageOptimizationRecommendation(
    { ...ssd, trimEnabled: false },
    [],
    NOW,
  );

  assert.equal(recommendation.due, false);
  assert.equal(recommendation.action, 'TRIM is disabled in Windows');
});

test('native storage probe reads Windows ScheduledDefrag state', () => {
  assert.match(storageSource, /Get-ScheduledTaskInfo/);
  assert.match(storageSource, /LastRunTime\.ToUniversalTime\(\)\.ToString\('o'\)/);
  assert.match(storageSource, /lastTaskResult/);
  assert.match(storageSource, /ConvertTo-Json -InputObject @\(\$result\)/);
});