const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const moduleUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'client', 'src', 'lib', 'storageOptimization.ts'),
).href;
const storageSource = fs.readFileSync(path.join(__dirname, '..', 'storage-helper.js'), 'utf8');
const storageUiSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'client', 'src', 'components', 'StorageHealthSection.tsx'),
  'utf8',
);

const NOW = Date.parse('2026-08-30T12:00:00.000Z');
const ssd = {
  letter: 'C',
  mediaType: 'SSD',
  busType: 'NVMe',
  trimEnabled: true,
};

test('global Windows task history never overrides per-drive SwitchControl history', async () => {
  const { getStorageOptimizationRecommendation } = await import(moduleUrl);
  const recommendation = getStorageOptimizationRecommendation(
    {
      ...ssd,
      optimization: {
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

  assert.equal(recommendation.days, 58);
  assert.equal(recommendation.lastRunSource, 'switchcontrol');
  assert.equal(recommendation.due, false);
  assert.equal(recommendation.action, 'Windows automatic optimization is enabled');
});

test('newer per-volume Windows optimization evidence overrides stale app history', async () => {
  const { getStorageOptimizationRecommendation } = await import(moduleUrl);
  const recommendation = getStorageOptimizationRecommendation(
    {
      ...ssd,
      optimization: {
        scheduleEnabled: true,
        status: 'available',
        source: 'windows-scheduled-task',
        lastRunAt: '2026-08-30T04:26:00.000Z',
        lastRunOperation: 'trim',
        lastRunSource: 'windows-defrag-event-log',
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

  assert.equal(recommendation.days, 0);
  assert.equal(recommendation.lastRunSource, 'windows');
  assert.equal(recommendation.lastRunLabel, 'Windows');
  assert.equal(recommendation.lastRunAt, '2026-08-30T04:26:00.000Z');
  assert.equal(recommendation.due, false);
});

test('future or untrusted native timestamps cannot override valid app history', async () => {
  const { getStorageOptimizationRecommendation } = await import(moduleUrl);
  const recommendation = getStorageOptimizationRecommendation(
    {
      ...ssd,
      optimization: {
        scheduleEnabled: true,
        status: 'available',
        source: 'windows-scheduled-task',
        lastRunAt: '2026-09-30T04:26:00.000Z',
        lastRunOperation: 'trim',
        lastRunSource: null,
      },
    },
    [{
      drive_letter: 'C',
      optimize_type: 'trim',
      status: 'success',
      ran_at: '2026-08-29T09:00:00.000Z',
    }],
    NOW,
  );
  assert.equal(recommendation.lastRunSource, 'switchcontrol');
  assert.equal(recommendation.days, 1);
});

test('opening the app repeatedly cannot make TRIM become recommended', async () => {
  const { getStorageOptimizationRecommendation } = await import(moduleUrl);
  const drive = {
    ...ssd,
    optimization: {
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
  assert.match(storageUiSource, /if \(!recommendation\.due\)\s*\{/);
  assert.match(storageUiSource, /\{rec\.due && \(\s*<motion\.button/);
});

test('unavailable native status cannot expose the optimization action', async () => {
  const { getStorageOptimizationRecommendation } = await import(moduleUrl);
  const recommendation = getStorageOptimizationRecommendation(
    {
      ...ssd,
      optimization: {
        scheduleEnabled: null,
        status: 'unavailable',
        source: 'windows-scheduled-task',
      },
    },
    [],
    NOW,
  );

  assert.equal(recommendation.due, false);
  assert.equal(recommendation.action, 'TRIM status unavailable');
});

test('native storage probe keeps ScheduledDefrag global and reads per-volume success events', () => {
  assert.match(storageSource, /String\.raw`/);
  assert.match(storageSource, /-TaskPath '\\Microsoft\\Windows\\Defrag\\'/);
  assert.doesNotMatch(storageSource, /Get-ScheduledTaskInfo/);
  assert.doesNotMatch(storageSource, /LastRunTime/);
  assert.match(storageSource, /Get-WinEvent -FilterHashtable/);
  assert.match(storageSource, /ProviderName = 'Microsoft-Windows-Defrag'/);
  assert.match(storageSource, /Id = 258/);
  assert.match(storageSource, /lastRunSource = \$\(if .*'windows-defrag-event-log'/);
  assert.match(storageSource, /ConvertTo-Json -InputObject @\(\$result\)/);
  assert.match(storageUiSource, />SwitchControl History</);
});