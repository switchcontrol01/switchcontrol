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

module.exports = { recordOwnershipAfterAction };
