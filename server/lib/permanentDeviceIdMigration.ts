/**
 * permanentDeviceIdMigration.ts
 *
 * Schema support for the permanent MachineGuid-derived device identity and the
 * free-user premium promo popup:
 *
 *   1. users.legacy_device_id            — the pre-1.2.6 random device ID this
 *      account's device history was keyed to before the permanent fingerprint
 *      replaced it. Written once by storage.migrateLegacyDeviceId() so the
 *      linkage is auditable. Safe to remove ~6 months after rollout, once
 *      telemetry shows near-zero devices still reporting an old-format ID.
 *   2. device_records.legacy_device_id   — same linkage, per device row.
 *   3. device_records.device_fingerprint — 64-char SHA-256 hardware fingerprint
 *      recorded alongside the device ID on every contact going forward. Lets
 *      the promo lockout check correlate trial/premium history across app
 *      reinstalls. Historical rows won't have it — accepted gap.
 *   4. promo_popup_state                 — server-side launch counter keyed by
 *      hardware fingerprint (never client-side, so it can't be reset by
 *      uninstall/%appdata% deletion/factory reset).
 *
 * Runs once on server startup — safe to call multiple times.
 */

import { isCoreSchemaReady, pool } from '../db';

export async function runPermanentDeviceIdMigration(): Promise<void> {
  if (!pool) return;
  if (!await isCoreSchemaReady()) return;

  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_device_id VARCHAR(255)`,
    `CREATE INDEX IF NOT EXISTS users_legacy_device_id_idx ON users (legacy_device_id)`,
    `ALTER TABLE device_records ADD COLUMN IF NOT EXISTS legacy_device_id TEXT`,
    `ALTER TABLE device_records ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(64)`,
    `CREATE INDEX IF NOT EXISTS device_records_fingerprint_idx ON device_records (device_fingerprint)`,
    `CREATE TABLE IF NOT EXISTS promo_popup_state (
      device_fingerprint VARCHAR(64) PRIMARY KEY,
      launch_count       INTEGER NOT NULL DEFAULT 0,
      next_threshold     INTEGER NOT NULL DEFAULT 30,
      locked_out         BOOLEAN NOT NULL DEFAULT FALSE,
      locked_out_reason  TEXT,
      last_shown_at      TIMESTAMPTZ,
      shown_count        INTEGER NOT NULL DEFAULT 0,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (err: any) {
      console.error(
        '[PermanentDeviceId] Migration failed:',
        err.message,
        '\nSQL:',
        sql.slice(0, 120)
      );
      // Re-throw: partial migrations are worse than startup failure.
      throw err;
    }
  }

  console.log('[PermanentDeviceId] Schema columns/tables verified/created.');
}
