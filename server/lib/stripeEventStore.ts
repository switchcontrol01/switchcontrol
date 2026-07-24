/**
 * stripeEventStore.ts
 *
 * Persistent idempotency store for Stripe webhook events.
 * Uses a single Postgres table (stripe_processed_events) so deduplication
 * survives process restarts and multi-instance deployments.
 *
 * The table is created automatically on first use; no manual migration needed.
 *
 * ## Idempotency pattern
 * Use `tryClaimEvent` as the SOLE gate before any side effects.
 * The old two-step pattern (SELECT → INSERT) had a TOCTOU race and has been
 * removed — `isEventAlreadyProcessed` and `markEventProcessed` no longer exist.
 *
 * ## NO-DB mode
 * When `pool` is null (no database configured), `tryClaimEvent` always returns
 * true so handlers still run. This degrades idempotency to "duplicate deliveries
 * reprocess everything" — acceptable for local dev, not for production. A WARN
 * is logged once at first use so silent degradation is visible in logs.
 */

import { pool } from '../db';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stripe_processed_events (
    event_id  VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

// Cache the in-flight creation promise so concurrent cold-start callers all
// await the same query instead of racing to run CREATE TABLE simultaneously.
// (Two concurrent CREATE TABLE IF NOT EXISTS calls can still throw a
// duplicate-object error under Postgres READ COMMITTED in some versions.)
let initPromise: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (!pool) return;
  if (!initPromise) {
    initPromise = pool.query(CREATE_TABLE_SQL).then(() => {});
  }
  return initPromise;
}

// Warn once when operating without DB-backed idempotency so silent degradation
// is visible in logs — payments code running without a dedup guarantee is a
// meaningfully different risk posture that should never go unnoticed.
let _noDbWarnedOnce = false;
function warnNoDb(caller: string) {
  if (_noDbWarnedOnce) return;
  _noDbWarnedOnce = true;
  console.warn(
    `[StripeEventStore] WARNING: pool unavailable — ${caller} running in NO-DB mode. ` +
    'Stripe webhook idempotency is NOT guaranteed; duplicate deliveries will reprocess.'
  );
}

/**
 * Atomically claims a Stripe event for processing.
 *
 * Attempts to INSERT the event ID. Returns true if this delivery is the first
 * (row was inserted), false if the event was already processed (ON CONFLICT).
 *
 * Use this as the SOLE idempotency gate BEFORE any side effects. The INSERT is
 * atomic — the database unique constraint ensures exactly one concurrent
 * delivery wins the race. The old SELECT-then-INSERT pattern (removed) had a
 * TOCTOU gap where two concurrent deliveries could both pass the SELECT before
 * either committed, causing side effects to run twice.
 *
 * In NO-DB mode (pool unavailable) always returns true; handlers must be safe
 * to repeat in that mode by design. A one-time WARN is logged.
 *
 * @returns true  — event claimed; proceed with all side effects
 *          false — duplicate delivery; skip immediately
 */
export async function tryClaimEvent(eventId: string): Promise<boolean> {
  if (!pool) { warnNoDb('tryClaimEvent'); return true; }
  await ensureTable();
  const result = await pool.query(
    'INSERT INTO stripe_processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [eventId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Clean up old Stripe event records (older than `daysToKeep` days).
 * Keeps enough history for debugging recent payment issues.
 * Safe to run periodically (e.g., on startup or via a scheduled job).
 */
export async function cleanupOldStripeEvents(daysToKeep = 30): Promise<number> {
  if (!pool) return 0;
  await ensureTable();
  // Use a parameterised interval so daysToKeep is never string-interpolated into
  // SQL — consistent with every other query in this file and safe against future
  // callers that pass the value from external input.
  const result = await pool.query(
    `DELETE FROM stripe_processed_events WHERE processed_at < NOW() - $1 * INTERVAL '1 day'`,
    [daysToKeep]
  );
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) {
    console.log(`[StripeEventStore] Cleaned up ${deleted} event records older than ${daysToKeep} days`);
  }
  return deleted;
}
