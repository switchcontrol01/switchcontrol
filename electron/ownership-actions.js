'use strict';

/**
 * Keep ownership aligned with a confirmed user operation. A successful revert
 * must release app ownership; an unverified revert must retain it for recovery.
 */
function recordOwnershipAfterAction(store, scopeKey, action, result) {
  if (!store || !scopeKey || !result?.success) return false;

  if (action === 'revert') {
    if (result.verified !== true) return false;
    store.recordRevert(scopeKey);
    return true;
  }

  store.recordApply(scopeKey, {
    appliedValue: true,
    verificationState: result.verified === true ? 'verified' : 'unverified',
  });
  return true;
}

/**
 * Release a legacy toggle's ownership when a more specific slider now owns the
 * same Windows setting. Keep its baseline/history record; only stop treating
 * the toggle as the active target.
 */
function clearOwnedTweakTarget(store, scopeKey) {
  if (!store || !scopeKey || typeof store.getOwnershipRecord !== 'function' ||
      typeof store.recordRevert !== 'function') {
    return { ok: false, error: 'Ownership store is unavailable.' };
  }

  const record = store.getOwnershipRecord(scopeKey);
  if (!record || record.appliedByApp !== true) {
    return { ok: true, cleared: false };
  }

  store.recordRevert(scopeKey);
  return { ok: true, cleared: true };
}

module.exports = { recordOwnershipAfterAction, clearOwnedTweakTarget };
