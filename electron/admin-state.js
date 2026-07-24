/**
 * admin-state.js
 *
 * Single source of truth for process-level admin elevation status.
 *
 * main.js calls setAdminState() once at startup after checkWindowsAdmin()
 * resolves.  Executor modules (power-plan-manager, tweak-executor, nic-executor)
 * read getAdminState() instead of each spawning their own redundant PowerShell
 * IsInRole check — which would otherwise run 3-4 times per session for a value
 * that is invariant for the entire process lifetime (requireAdministrator manifest).
 *
 * getAdminState() returns null until main.js calls setAdminState(), so callers
 * that might be invoked before startup completes should fall back to their own
 * lightweight check when the value is null.
 */

'use strict';

let _isAdmin = null;

function setAdminState(val) {
  _isAdmin = Boolean(val);
}

function getAdminState() {
  return _isAdmin;
}

module.exports = { setAdminState, getAdminState };
