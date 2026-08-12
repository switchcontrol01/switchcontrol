/**
 * scalabilityMigration.ts
 *
 * Applies all performance/scalability DB changes that cannot be expressed as
 * Drizzle schema-only changes (i.e. changes that must be applied to an existing
 * live database that was never dropped + re-created from scratch).
 *
 * Safe to run multiple times — every statement uses IF NOT EXISTS or is
 * idempotent in Postgres.  Runs at server startup, after the pool is ready.
 */

import { pool } from '../db';

const MIGRATIONS: string[] = [
  // ── Permanent device history table ────────────────────────────────────────
  // One row per (user_id, device_id). Upserted on every device heartbeat so
  // the admin Device Inspector can find a device even after clearPremiumDevice
  // nulls the users table columns. Safe to run repeatedly — IF NOT EXISTS.
  `CREATE TABLE IF NOT EXISTS device_records (
     id               SERIAL PRIMARY KEY,
     user_id          TEXT NOT NULL,
     device_id        TEXT NOT NULL,
     email            TEXT,
     first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     last_app_version TEXT,
     last_platform    TEXT,
     last_ip_hash     TEXT,
     trial_used       BOOLEAN NOT NULL DEFAULT FALSE,
     trial_started_at TIMESTAMPTZ,
     trial_ended_at   TIMESTAMPTZ,
     premium_seen     BOOLEAN NOT NULL DEFAULT FALSE,
     admin_grant_seen BOOLEAN NOT NULL DEFAULT FALSE,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS device_records_user_device_idx
     ON device_records (user_id, device_id)`,

  `CREATE INDEX IF NOT EXISTS device_records_device_id_idx
     ON device_records (device_id)`,

  // ── Backfill: recover device IDs currently stored on the users table ──────
  // Covers any device that is still bound or was last-seen at server startup.
  // ON CONFLICT DO NOTHING = fully idempotent; safe on every restart.
  `INSERT INTO device_records
       (user_id, device_id, email, first_seen_at, last_seen_at,
        last_app_version, last_platform,
        trial_used, trial_started_at, trial_ended_at,
        premium_seen, admin_grant_seen, created_at, updated_at)
     SELECT
       u.id,
       u.premium_bound_device_id,
       u.email,
       COALESCE(u.premium_bound_at, NOW()),
       COALESCE(u.premium_device_last_seen_at, u.premium_bound_at, NOW()),
       u.app_version,
       u.platform,
       COALESCE(u.has_used_trial, FALSE),
       u.trial_started_at,
       u.trial_ends_at,
       COALESCE(u.is_premium, FALSE),
       (u.trial_granted_by_admin_id IS NOT NULL),
       NOW(),
       NOW()
     FROM users u
     WHERE u.premium_bound_device_id IS NOT NULL
     ON CONFLICT (user_id, device_id) DO NOTHING`,

  `INSERT INTO device_records
       (user_id, device_id, email, first_seen_at, last_seen_at,
        last_app_version, last_platform,
        trial_used, trial_started_at, trial_ended_at,
        premium_seen, admin_grant_seen, created_at, updated_at)
     SELECT
       u.id,
       u.premium_last_seen_device_id,
       u.email,
       COALESCE(u.premium_device_last_seen_at, NOW()),
       COALESCE(u.premium_device_last_seen_at, NOW()),
       u.app_version,
       u.platform,
       COALESCE(u.has_used_trial, FALSE),
       u.trial_started_at,
       u.trial_ends_at,
       COALESCE(u.is_premium, FALSE),
       (u.trial_granted_by_admin_id IS NOT NULL),
       NOW(),
       NOW()
     FROM users u
     WHERE u.premium_last_seen_device_id IS NOT NULL
     ON CONFLICT (user_id, device_id) DO NOTHING`,

  // ── Indexes ────────────────────────────────────────────────────────────────
  // appliedTweaks.settingsId — used by every "get tweaks for this user" query.
  `CREATE INDEX IF NOT EXISTS applied_tweaks_settings_id_idx
     ON applied_tweaks (settings_id)`,

  // historyEntries.settingsId — most common query in the app; table is append-only.
  `CREATE INDEX IF NOT EXISTS history_entries_settings_id_idx
     ON history_entries (settings_id)`,

  // historyEntries.timestamp — needed for the per-user pruning DELETE subquery.
  `CREATE INDEX IF NOT EXISTS history_entries_timestamp_idx
     ON history_entries (timestamp)`,

  // aiScans.settingsId — getLatestAIScan is called on every dashboard load.
  `CREATE INDEX IF NOT EXISTS ai_scans_settings_id_idx
     ON ai_scans (settings_id)`,

  // networkTweakLog.userId — per-user log lookups + the pruning job.
  `CREATE INDEX IF NOT EXISTS network_tweak_log_user_id_idx
     ON network_tweak_log (user_id)`,

  // networkTweakLog.createdAt — age-based pruning query.
  `CREATE INDEX IF NOT EXISTS network_tweak_log_created_at_idx
     ON network_tweak_log (created_at)`,

  // ── Remove placeholder defaults ───────────────────────────────────────────
  // These were left over from early development; real users should never see
  // "user@example.com" or 9.5 GB as their stored email / RAM.
  `ALTER TABLE user_settings
     ALTER COLUMN email DROP DEFAULT`,

  `ALTER TABLE user_settings
     ALTER COLUMN used_ram_gb DROP DEFAULT`,

  // ── Fix used_ram_gb NOT NULL constraint ────────────────────────────────────
  // The column was created with NOT NULL in an older schema version. The
  // migration above then dropped its DEFAULT, leaving it NOT NULL with no
  // fallback — every insert that omits used_ram_gb now fails with:
  //   "null value in column used_ram_gb violates not-null constraint"
  // The Drizzle schema declares it nullable (no .notNull()), so bring the DB
  // in line: drop NOT NULL and restore DEFAULT 0 so inserts of new rows work
  // without callers having to supply a value.
  `ALTER TABLE user_settings
     ALTER COLUMN used_ram_gb DROP NOT NULL`,

  `ALTER TABLE user_settings
     ALTER COLUMN used_ram_gb SET DEFAULT 0`,
];

export async function runScalabilityMigration(): Promise<void> {
  if (!pool) return;

  let applied = 0;
  for (const statement of MIGRATIONS) {
    try {
      await pool.query(statement);
      applied++;
    } catch (err: any) {
      // "column does not exist" on DROP DEFAULT is fine — column was already
      // nullable/no-default; skip.  Any other error is surfaced as a warning
      // but does NOT abort startup — a missing index is never fatal.
      if (err.message?.includes('does not exist') || err.code === '42703') {
        continue;
      }
      console.warn(
        `[Scalability] Non-fatal migration warning: ${err.message} | SQL: ${statement.slice(0, 80)}…`
      );
    }
  }

  console.log(`[Scalability] Migration complete — ${applied}/${MIGRATIONS.length} statements applied.`);
}
