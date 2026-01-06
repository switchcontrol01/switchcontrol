CREATE TABLE "ai_scans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settings_id" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"summary" text NOT NULL,
	"recommendations" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applied_tweaks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settings_id" varchar NOT NULL,
	"tweak_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settings_id" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"page" text NOT NULL,
	"result" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" text DEFAULT 'Premium' NOT NULL,
	"email" text DEFAULT 'user@example.com',
	"license_status" text DEFAULT 'Active' NOT NULL,
	"tweaks_applied" integer DEFAULT 0 NOT NULL,
	"services_disabled" integer DEFAULT 0 NOT NULL,
	"cleaners_run" integer DEFAULT 0 NOT NULL,
	"startup_apps_disabled" integer DEFAULT 0 NOT NULL,
	"last_scan" timestamp,
	"used_ram_gb" real DEFAULT 9.5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar DEFAULT 'replit' NOT NULL,
	"provider_user_id" varchar,
	"email" varchar,
	"password_hash" varchar,
	"google_id" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"is_premium" boolean DEFAULT false NOT NULL,
	"stripe_customer_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");