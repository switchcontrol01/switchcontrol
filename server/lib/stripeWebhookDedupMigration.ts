/**
 * stripeWebhookDedupMigration.ts
 *
 * Guarantees Stripe webhook events are recorded at most once per event_id.
 * Stripe redelivers the same event (same event.id) on retries; without a DB-level
 * uniqueness guarantee, concurrent or retried deliveries can create duplicate rows
 * in the admin Stripe-events panel.
 *
 * Order matters: existing duplicates are removed BEFORE the unique index is created,
 * otherwise index creation would fail on legacy data. Idempotent — safe to run on
 * every startup.
 */

import { pool } from '../db';

export async function runStripeWebhookDedupMigration(): Promise<void> {
  if (!pool) return;

  const migrations = [
    // 1. Remove pre-existing duplicates, keeping one physical row per event_id.
    //    ctid is a guaranteed-unique physical row identifier, so this is safe
    //    even when processed_at is null or tied.
    `DELETE FROM stripe_webhook_events a
       USING stripe_webhook_events b
      WHERE a.event_id = b.event_id
        AND a.ctid > b.ctid`,
    // 2. Enforce uniqueness going forward (enables ON CONFLICT DO NOTHING).
    `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_stripe_webhook_events_event_id"
       ON stripe_webhook_events (event_id)`,
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (err: any) {
      console.error(
        '[StripeWebhookDedup] Migration failed:',
        err.message,
        '\nSQL:',
        sql.slice(0, 120),
      );
      throw err;
    }
  }

  console.log('[StripeWebhookDedup] event_id uniqueness verified/created.');
}
