const FACTORY_RESET_CONFIRMATION = 'RESET_SWITCHCONTROL_DATA';
const RESET_EXIT_HANDOFF_DELAY_MS = 1000;
const PRESERVED_RESET_FILES = ['device-id.json'];
const FACTORY_RESET_CLEANUP_SCRIPT = 'factory-reset-cleanup.js';

function log(logger, level, ...args) {
  const method = typeof logger?.[level] === 'function'
    ? logger[level]
    : logger?.log;
  if (typeof method === 'function') method.call(logger, ...args);
}

/**
 * Create the app:resetData IPC handler.
 *
 * The reset handler schedules a detached cleanup helper and returns before the
 * current Electron process exits. The helper waits for this process to release
 * Chromium's profile locks, removes the profile, and launches a clean process.
 */
function createFactoryResetHandler({
  app,
  fs,
  path,
  logger = console,
  schedule = setTimeout,
  spawn = require('child_process').spawn,
  processRef = process,
  handoffDelayMs = RESET_EXIT_HANDOFF_DELAY_MS,
} = {}) {
  if (!app || !fs || !path) {
    throw new TypeError('createFactoryResetHandler requires app, fs, and path');
  }

  let relaunchScheduled = false;

  return async function handleFactoryReset(_event, confirmation) {
    const startedAt = new Date().toISOString();
    log(logger, 'log', `[Reset] START at=${startedAt}`);

    if (confirmation !== FACTORY_RESET_CONFIRMATION) {
      log(logger, 'warn', '[Reset] Rejected: missing or incorrect confirmation token');
      return {
        ok: false,
        error: 'confirmation_required',
        message: 'Factory reset requires a valid confirmation token.',
        startedAt,
      };
    }

    if (relaunchScheduled) {
      return {
        ok: false,
        error: 'reset_already_scheduled',
        message: 'A factory reset is already being finalized.',
        startedAt,
      };
    }

    try {
      const userDataPath = app.getPath('userData');
      const cleanupScript = path.join(__dirname, FACTORY_RESET_CLEANUP_SCRIPT);
      const relaunchArgs = (processRef.argv || [])
        .slice(1)
        .filter((arg) => arg !== '--factory-reset-cleanup');
      const cleanupPayload = JSON.stringify({
        parentPid: processRef.pid,
        userDataPath,
        preservedFiles: PRESERVED_RESET_FILES,
        execPath: processRef.execPath,
        execArgs: relaunchArgs,
        cwd: processRef.cwd ? processRef.cwd() : undefined,
      });

      log(
        logger,
        'log',
        '[Reset] Scheduling cleanup after the current Electron process exits:',
        userDataPath,
      );
      const cleanupProcess = spawn(
        processRef.execPath,
        [cleanupScript, cleanupPayload],
        {
          detached: true,
          windowsHide: true,
          stdio: 'ignore',
          env: {
            ...processRef.env,
            ELECTRON_RUN_AS_NODE: '1',
          },
        },
      );
      if (!cleanupProcess || typeof cleanupProcess.unref !== 'function') {
        throw new Error('The reset cleanup process could not be started.');
      }
      cleanupProcess.unref();

      const result = {
        ok: true,
        startedAt,
        preservedFiles: [...PRESERVED_RESET_FILES],
        failures: [],
        relaunchScheduled: true,
      };

      // The cleanup helper waits for this process to exit before touching
      // Chromium's locked profile folders. Do not call app.relaunch here:
      // starting a second Electron instance while this one still owns the
      // profile recreates the same deletion race.
      try {
        relaunchScheduled = true;
        schedule(() => {
          try {
            log(logger, 'log', '[Reset] Handoff complete — exiting for cleanup');
            app.exit(0);
          } catch (error) {
            log(logger, 'error', '[Reset] Exit handoff failed:', error);
          }
        }, handoffDelayMs);
      } catch (error) {
        relaunchScheduled = false;
        const message = `Factory reset could not schedule the app relaunch: ${error?.message || String(error)}`;
        log(logger, 'error', '[Reset] Scheduling failed:', error);
        return {
          ok: false,
          error: 'relaunch_schedule_failed',
          message,
          startedAt,
          preservedFiles: [...PRESERVED_RESET_FILES],
          failures: [],
        };
      }

      log(logger, 'log', '[Reset] Cleanup helper scheduled', {
        startedAt,
        preservedFiles: PRESERVED_RESET_FILES,
        handoffDelayMs,
      });
      return result;
    } catch (error) {
      const message = `Factory reset could not complete: ${error?.message || String(error)}`;
      log(logger, 'error', '[Reset] Error:', error);
      return {
        ok: false,
        error: 'reset_failed',
        message,
        startedAt,
        preservedFiles: [...PRESERVED_RESET_FILES],
        failures: [],
      };
    }
  };
}

module.exports = {
  FACTORY_RESET_CONFIRMATION,
  PRESERVED_RESET_FILES,
  RESET_EXIT_HANDOFF_DELAY_MS,
  FACTORY_RESET_CLEANUP_SCRIPT,
  createFactoryResetHandler,
};