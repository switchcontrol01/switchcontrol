-- Migration: add user_id column to app_booster_* tables
-- Safe for production: each block is guarded so it only runs when needed.
-- NOTE: We intentionally do NOT add composite PKs here — the deployment
-- migration system handles PK diffs incorrectly (it generates ADD CONSTRAINT
-- before ADD COLUMN). Keeping simple PKs avoids that failure path entirely.

-- ── app_booster_games ────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_booster_games' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE app_booster_games ADD COLUMN user_id TEXT;
    UPDATE app_booster_games SET user_id = '__legacy__' WHERE user_id IS NULL;
    ALTER TABLE app_booster_games ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint

-- ── app_booster_state ────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_booster_state' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE app_booster_state ADD COLUMN user_id TEXT;
    UPDATE app_booster_state SET user_id = '__legacy__' WHERE user_id IS NULL;
    ALTER TABLE app_booster_state ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint

-- ── app_booster_history ──────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_booster_history' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE app_booster_history ADD COLUMN user_id TEXT;
    UPDATE app_booster_history SET user_id = '__legacy__' WHERE user_id IS NULL;
    ALTER TABLE app_booster_history ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;
