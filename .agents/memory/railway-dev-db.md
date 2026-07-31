---
name: Railway dev database schema state
description: What schema the Railway dev DB has, what was added, and how to apply future schema changes without drizzle-kit push (which requires a TTY).
---

**DB URL pattern:** Railway PostgreSQL, host `tokaido.proxy.rlwy.net:18609`, database `railway`.

**drizzle-kit push is broken in non-TTY shells** (Replit ShellExec). It hangs on `promptNamedWithSchemasConflict` even with `--force`. The workaround is to run raw SQL via the `pg` Pool directly in a node -e script.

**Pattern that works:**
```js
DATABASE_URL="..." node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// run ALTER TABLE / CREATE TABLE statements in a loop, re-throw on failure
pool.end();
"
```

**Schema state after the permanent-device-ID + promo-popup work:**
- All base tables present (`users`, `device_records`, `user_settings`, `sessions`, etc.)
- New columns added: `users.legacy_device_id VARCHAR(255)`, `device_records.device_fingerprint VARCHAR(64)`, `device_records.legacy_device_id TEXT`
- New table: `promo_popup_state` (PK: `device_fingerprint`, columns: `launch_count`, `next_threshold`, `locked_out`, `locked_out_reason`, `last_shown_at`, `shown_count`, `created_at`, `updated_at`)
- New indexes: `users_legacy_device_id_idx`, `device_records_fingerprint_idx`

**Why:** drizzle-kit push requires TTY for name-conflict prompts; raw SQL bypasses this entirely and is safe for additive migrations.

**How to apply future schema changes:** Write the statements as `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` and run via node -e with DATABASE_URL set. Always use IF NOT EXISTS so the script is re-runnable.
