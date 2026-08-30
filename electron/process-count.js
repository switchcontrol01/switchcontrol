'use strict';

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * Select a trustworthy Windows process count.
 *
 * systeminformation is preferred because it provides running + total counts.
 * Its Windows CIM parser can, however, return all=0 when process metadata
 * parsing fails. In that case the caller supplies the count-only Get-Process
 * result as raw text.
 */
function selectProcessCount(systemInformationCount, rawNativeCount) {
  const systemTotal = positiveInteger(systemInformationCount?.total);
  const systemRunning = positiveInteger(systemInformationCount?.running);
  if (systemTotal != null && systemTotal > 0) {
    return {
      source: 'systeminformation',
      count: {
        running: systemRunning != null ? systemRunning : 0,
        total: systemTotal,
      },
    };
  }

  const nativeTotal = Number.parseInt(String(rawNativeCount ?? '').trim(), 10);
  if (Number.isSafeInteger(nativeTotal) && nativeTotal > 0) {
    return {
      source: 'Get-Process',
      count: { running: nativeTotal, total: nativeTotal },
    };
  }

  return {
    source: 'unavailable',
    count: { running: 0, total: 0 },
  };
}

module.exports = { selectProcessCount };