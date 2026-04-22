/**
 * deviceBindingMigration.ts
 *
 * Adds premium device binding columns to the users table if they don't exist.
 * Runs once on server startup — safe to call multiple times.
 */

import { pool } from '../db';

export async function runDeviceBindingMigration(): Promise<void> {
  if (!pool) return;

  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_bound_device_id VARCHAR(255)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_bound_at TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_last_seen_device_id VARCHAR(255)`,
    // trial_duration_hours was integer but must be real to support sub-hour durations (1m, 30m)
    `DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'trial_duration_hours'
        AND data_type = 'integer'
      ) THEN
        ALTER TABLE users ALTER COLUMN trial_duration_hours TYPE real USING trial_duration_hours::real;
      END IF;
    END $$`,
  ];

  for (const sql of migrations) {
    await pool.query(sql);
  }

  console.log('[DeviceBinding] Schema columns verified/created.');
}
