-- Migration: add user_id column to app_booster_* tables and convert PKs
-- Safe for production: each step is idempotent via IF NOT EXISTS / DO $$ guards.
-- Execution order: nullable add → backfill → NOT NULL → drop old PK → new composite PK

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

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_booster_games_pkey' AND contype = 'p'
  ) THEN
    ALTER TABLE app_booster_games DROP CONSTRAINT app_booster_games_pkey;
    ALTER TABLE app_booster_games ADD PRIMARY KEY (user_id, slug);
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

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_booster_state_pkey' AND contype = 'p'
  ) THEN
    ALTER TABLE app_booster_state DROP CONSTRAINT app_booster_state_pkey;
    ALTER TABLE app_booster_state ADD PRIMARY KEY (user_id, game_slug);
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
