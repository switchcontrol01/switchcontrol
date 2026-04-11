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
  ];

  for (const sql of migrations) {
    await pool.query(sql);
  }

  console.log('[DeviceBinding] Schema columns verified/created.');
}
