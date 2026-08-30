const FACTORY_RESET_CONFIRMATION = 'RESET_SWITCHCONTROL_DATA';
const RESET_EXIT_HANDOFF_DELAY_MS = 1000;
const PRESERVED_RESET_FILES = ['device-id.json'];

function log(logger, level, ...args) {
  const method = typeof logger?.[level] === 'function'
    ? logger[level]
    : logger?.log;
  if (typeof method === 'function') method.call(logger, ...args);
}

/**
 * Create the app:resetData IPC handler.
 *
 * The reset work must finish before the handler returns, but relaunch/exit must
 * happen on a later turn. Otherwise Electron can terminate the renderer before
 * ipcRenderer.invoke receives the handler's result.
 */
function createFactoryResetHandler({
  app,
  fs,
  path,
  logger = console,
  schedule = setTimeout,
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

    const preservedFiles = [...PRESERVED_RESET_FILES];
    const deletionFailures = [];

    try {
      const userDataPath = app.getPath('userData');
      log(logger, 'log', '[Reset] Clearing userData directory:', userDataPath);
      const entries = fs.readdirSync(userDataPath);

      for (const entry of entries) {
        if (PRESERVED_RESET_FILES.includes(entry)) {
          log(logger, 'log', '[Reset] Preserving:', entry);
          continue;
        }

        const fullPath = path.join(userDataPath, entry);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } catch (error) {
          const failure = {
            entry,
            path: fullPath,
            error: error?.message || String(error),
          };
          deletionFailures.push(failure);
          log(logger, 'error', '[Reset] Could not delete:', fullPath, failure.error);
        }
      }

      if (deletionFailures.length > 0) {
        const message =
          `Factory reset could not remove ${deletionFailures.length} item(s). ` +
          'Close other SwitchControl processes and try again.';
        log(logger, 'error', '[Reset] Failed with deletion errors:', deletionFailures);
        return {
          ok: false,
          error: 'delete_failed',
          message,
          startedAt,
          preservedFiles,
          failures: deletionFailures,
        };
      }

      const result = {
        ok: true,
        startedAt,
        preservedFiles,
        failures: [],
        relaunchScheduled: true,
      };

      // Do not call app.relaunch/app.exit until after the structured result has
      // been returned through the IPC machinery. The delay is bounded and gives
      // the renderer a chance to clear its auth cookies before the relaunch.
      try {
        relaunchScheduled = true;
        schedule(() => {
          try {
            log(logger, 'log', '[Reset] userData cleared — relaunching app');
            app.relaunch();
            app.exit(0);
          } catch (error) {
            log(logger, 'error', '[Reset] Relaunch/exit handoff failed:', error);
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
          preservedFiles,
          failures: [],
        };
      }

      log(logger, 'log', '[Reset] Complete; relaunch scheduled', {
        startedAt,
        preservedFiles,
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
        preservedFiles,
        failures: deletionFailures,
      };
    }
  };
}

module.exports = {
  FACTORY_RESET_CONFIRMATION,
  PRESERVED_RESET_FILES,
  RESET_EXIT_HANDOFF_DELAY_MS,
  createFactoryResetHandler,
};