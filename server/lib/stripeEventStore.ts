/**
 * stripeEventStore.ts
 *
 * Persistent idempotency store for Stripe webhook events.
 * Uses a single Postgres table (stripe_processed_events) so deduplication
 * survives process restarts and multi-instance deployments.
 *
 * The table is created automatically on first use; no manual migration needed.
 */

import { pool } from '../db';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stripe_processed_events (
    event_id  VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

let initialized = false;

async function ensureTable(): Promise<void> {
  if (initialized || !pool) return;
  await pool.query(CREATE_TABLE_SQL);
  initialized = true;
}

/**
 * Returns true if this Stripe event ID has already been processed.
 * If the database is unavailable (NO-DB mode), always returns false
 * so the handler still runs — idempotency relies on the write being safe to repeat.
 */
export async function isEventAlreadyProcessed(eventId: string): Promise<boolean> {
  if (!pool) return false;
  await ensureTable();
  const result = await pool.query(
    'SELECT 1 FROM stripe_processed_events WHERE event_id = $1',
    [eventId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Marks a Stripe event ID as processed.
 * Uses ON CONFLICT DO NOTHING so concurrent writes are safe.
 */
export async function markEventProcessed(eventId: string): Promise<void> {
  if (!pool) return;
  await ensureTable();
  await pool.query(
    'INSERT INTO stripe_processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [eventId]
  );
}

/**
 * Atomically claims a Stripe event for processing.
 *
 * Attempts to INSERT the event ID. Returns true if this delivery is the first
 * (row was inserted), false if the event was already processed (ON CONFLICT).
 *
 * Use this as the SOLE idempotency gate BEFORE any side effects, rather than
 * the SELECT-then-INSERT (isEventAlreadyProcessed → markEventProcessed) pattern.
 * That pattern has a TOCTOU gap: two concurrent deliveries of the same event can
 * both pass the SELECT before either commits the INSERT, causing side effects to
 * run twice. The INSERT here is atomic — the database unique constraint ensures
 * exactly one concurrent delivery wins the race.
 *
 * In NO-DB mode (pool unavailable) always returns true; handlers must be safe to
 * repeat in that mode by design.
 *
 * @returns true  — event claimed; proceed with all side effects
 *          false — duplicate delivery; skip immediately
 */
export async function tryClaimEvent(eventId: string): Promise<boolean> {
  if (!pool) return true;
  await ensureTable();
  const result = await pool.query(
    'INSERT INTO stripe_processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [eventId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Clean up old Stripe event records (older than 30 days).
 * Keeps enough history for debugging recent payment issues.
 * Safe to run periodically (e.g., on startup or via a scheduled job).
 */
export async function cleanupOldStripeEvents(daysToKeep = 30): Promise<number> {
  if (!pool) return 0;
  await ensureTable();
  const result = await pool.query(
    `DELETE FROM stripe_processed_events WHERE processed_at < NOW() - INTERVAL '${daysToKeep} days'`
  );
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) {
    console.log(`[StripeEventStore] Cleaned up ${deleted} event records older than ${daysToKeep} days`);
  }
  return deleted;
}
