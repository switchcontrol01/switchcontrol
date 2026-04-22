-- Delete orphaned global-state rows (they have no user_id and belong to nobody)
DELETE FROM "applied_tweaks";
DELETE FROM "history_entries";
DELETE FROM "ai_scans";
DELETE FROM "user_settings";
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "user_id" varchar NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id");
