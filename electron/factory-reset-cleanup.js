const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RETRY_COUNT = 50;
const RETRY_DELAY_MS = 200;
const DELETE_RETRY_COUNT = 10;
const DELETE_RETRY_DELAY_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Windows can report EPERM for a live process that belongs to another
    // user/session. Treat that as alive; only ESRCH means it is gone.
    return error?.code === 'EPERM';
  }
}

async function waitForParentExit(pid) {
  for (let attempt = 0; attempt < RETRY_COUNT; attempt += 1) {
    if (!isProcessRunning(pid)) return true;
    await sleep(RETRY_DELAY_MS);
  }
  return !isProcessRunning(pid);
}

async function removeEntry(fullPath) {
  let lastError = null;
  for (let attempt = 0; attempt < DELETE_RETRY_COUNT; attempt += 1) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      return null;
    } catch (error) {
      lastError = error;
      await sleep(DELETE_RETRY_DELAY_MS);
    }
  }
  return lastError;
}

async function cleanupUserData({ userDataPath, preservedFiles = [] }) {
  const failures = [];
  let entries;
  try {
    entries = fs.readdirSync(userDataPath);
  } catch (error) {
    return {
      ok: false,
      error: 'read_failed',
      message: `Factory reset could not read the app data directory: ${error?.message || String(error)}`,
      failures: [],
    };
  }

  for (const entry of entries) {
    if (preservedFiles.includes(entry)) continue;
    const fullPath = path.join(userDataPath, entry);
    const error = await removeEntry(fullPath);
    if (error) {
      failures.push({
        entry,
        path: fullPath,
        error: error?.message || String(error),
      });
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      error: 'delete_failed',
      message:
        `Factory reset could not remove ${failures.length} item(s) after SwitchControl closed. ` +
        'Close other SwitchControl processes and try again.',
      failures,
    };
  }

  return { ok: true, failures: [] };
}

function launchApplication({ execPath, execArgs = [], cwd }) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(execPath, execArgs, {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
    cwd: cwd || undefined,
    env,
  });
  child.unref();
}

async function main(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid factory reset cleanup payload.');
  }

  const parentExited = await waitForParentExit(Number(payload.parentPid));
  if (!parentExited) {
    throw new Error('SwitchControl did not close before cleanup timed out.');
  }

  const result = await cleanupUserData(payload);
  if (!result.ok) {
    process.stderr.write(`${result.message}\n`);
    return 1;
  }

  launchApplication(payload);
  return 0;
}

if (require.main === module) {
  let payload;
  try {
    payload = JSON.parse(process.argv[2] || '');
  } catch (error) {
    process.stderr.write(`Invalid factory reset cleanup payload: ${error?.message || String(error)}\n`);
    process.exitCode = 1;
  }

  if (payload) {
    main(payload)
      .then((code) => {
        process.exitCode = code;
      })
      .catch((error) => {
        process.stderr.write(`Factory reset cleanup failed: ${error?.message || String(error)}\n`);
        process.exitCode = 1;
      });
  }
}

module.exports = {
  cleanupUserData,
  isProcessRunning,
  waitForParentExit,
};