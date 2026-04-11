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
