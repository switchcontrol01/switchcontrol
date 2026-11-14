'use strict';

/**
 * Reconcile explicit, verified app-owned targets after Windows or a driver
 * changes them. This intentionally does not adopt settings from the OS: only
 * a persisted ownership record with a confirmed baseline and applied target
 * is eligible.
 */
async function reconcileOwnedTargets({
  records,
  itemType,
  premiumActive,
  allowedIds,
  premiumRequiredIds,
  readCurrent,
  applyTarget,
}) {
  if (!Array.isArray(records) || typeof readCurrent !== 'function' || typeof applyTarget !== 'function') {
    throw new TypeError('Invalid owned-tweak recovery dependencies.');
  }

  const reapplied = [];
  const unchanged = [];
  const skipped = [];
  const failed = [];
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const premiumRequired = premiumRequiredIds
    ? new Set(premiumRequiredIds)
    : (allowed || null);

  for (const record of records) {
    if (!record || record.itemType !== itemType) continue;
    const tweakId = record.itemId;
    if (typeof tweakId !== 'string' || !tweakId || (allowed && !allowed.has(tweakId))) continue;

    if (!record.appliedByApp || record.appliedValue !== true || !record.baselineCaptured ||
        !['verified', 'unverified'].includes(record.verificationState)) {
      skipped.push({ tweakId, reason: 'no_verified_app_owned_target' });
      continue;
    }
    if (premiumActive !== true && (!premiumRequired || premiumRequired.has(tweakId))) {
      skipped.push({ tweakId, reason: 'premium_not_verified_active' });
      continue;
    }

    let current;
    try {
      current = await readCurrent(tweakId);
    } catch (error) {
      failed.push({ tweakId, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    if (!current || current.verified !== true || typeof current.applied !== 'boolean') {
      failed.push({ tweakId, error: current?.error || 'Current Windows state could not be verified.' });
      continue;
    }
    if (current.applied) {
      unchanged.push({ tweakId });
      continue;
    }

    let applied;
    try {
      applied = await applyTarget(tweakId);
    } catch (error) {
      failed.push({ tweakId, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (!applied?.success || applied.verified !== true) {
      failed.push({ tweakId, error: applied?.error || applied?.message || 'The apply operation was not verified.' });
      continue;
    }

    try {
      const after = await readCurrent(tweakId);
      if (after?.verified === true && after.applied === true) {
        reapplied.push({ tweakId });
      } else {
        failed.push({ tweakId, error: after?.error || 'Windows did not retain the target after recovery.' });
      }
    } catch (error) {
      failed.push({ tweakId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { reapplied, unchanged, skipped, failed };
}

module.exports = { reconcileOwnedTargets };
