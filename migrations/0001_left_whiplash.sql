ALTER TABLE "users" ADD COLUMN "has_seen_premium_unlock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_first_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_activated_at" timestamp;