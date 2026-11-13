'use strict';

/**
 * Share concurrent read-only probes, without caching completed results.
 * A busy limiter is scheduling feedback, not a missing Windows capability.
 * Never use this for writes/actions: every requested write must remain explicit.
 */
function createSharedReadProbe(probe, { maxBusyRetries = 20, retryDelayMs = 400 } = {}) {
  let pending = null;
  return (...args) => {
    if (pending) return pending;
    pending = (async () => {
      for (let attempt = 0; ; attempt++) {
        const result = await probe(...args);
        const busy = result?.available === false &&
          result.reason === 'temporarily_failed' &&
          /\bbusy\b/i.test(result.detail || '');
        if (!busy || attempt >= maxBusyRetries) return result;
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    })().finally(() => { pending = null; });
    return pending;
  };
}

module.exports = { createSharedReadProbe };
