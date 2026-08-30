'use strict';

/**
 * Stable status vocabulary for native Windows probes.
 *
 * A missing value is not enough information for a UI. These statuses keep
 * unsupported commands, denied access, unavailable providers, and transient
 * failures distinguishable all the way from the main process to the renderer.
 */
const PROBE_STATUS = Object.freeze({
  OK: 'ok',
  UNSUPPORTED: 'unsupported',
  PERMISSION_DENIED: 'permission_denied',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  TEMPORARILY_FAILED: 'temporarily_failed',
});

const PROBE_STATUS_LABELS = Object.freeze({
  [PROBE_STATUS.OK]: 'Available',
  [PROBE_STATUS.UNSUPPORTED]: 'Unsupported on this Windows edition',
  [PROBE_STATUS.PERMISSION_DENIED]: 'Permission denied',
  [PROBE_STATUS.PROVIDER_UNAVAILABLE]: 'Driver/provider unavailable',
  [PROBE_STATUS.TEMPORARILY_FAILED]: 'Probe temporarily failed',
});

function classifyPowerShellFailure(error, stderr = '') {
  const text = `${error?.message || ''} ${stderr || ''}`.trim();
  const lower = text.toLowerCase();

  if (
    error?.killed ||
    error?.code === 'ETIMEDOUT' ||
    error?.signal === 'SIGTERM' ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  ) {
    return PROBE_STATUS.TEMPORARILY_FAILED;
  }
  if (
    lower.includes('access is denied') ||
    lower.includes('permission denied') ||
    lower.includes('unauthorizedaccess') ||
    lower.includes('unauthorized access') ||
    lower.includes('requested registry access is not allowed')
  ) {
    return PROBE_STATUS.PERMISSION_DENIED;
  }
  if (
    lower.includes('not recognized as the name of a cmdlet') ||
    lower.includes('commandnotfoundexception') ||
    lower.includes('is not recognized') ||
    lower.includes('cannot find the cmdlet')
  ) {
    return PROBE_STATUS.UNSUPPORTED;
  }
  if (
    lower.includes('invalid namespace') ||
    lower.includes('invalid class') ||
    lower.includes('provider load failure') ||
    lower.includes('provider is not capable') ||
    lower.includes('class not registered') ||
    lower.includes('wbem_e_')
  ) {
    return PROBE_STATUS.PROVIDER_UNAVAILABLE;
  }
  return PROBE_STATUS.TEMPORARILY_FAILED;
}

function statusLabel(status, detail = '') {
  const label = PROBE_STATUS_LABELS[status] || PROBE_STATUS_LABELS[PROBE_STATUS.TEMPORARILY_FAILED];
  return detail ? `${label}: ${detail}` : label;
}

function isProbeStatus(value) {
  return Object.values(PROBE_STATUS).includes(value);
}

module.exports = {
  PROBE_STATUS,
  PROBE_STATUS_LABELS,
  classifyPowerShellFailure,
  statusLabel,
  isProbeStatus,
};