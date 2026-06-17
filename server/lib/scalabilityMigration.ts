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
