CREATE TABLE "device_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"email" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_app_version" text,
	"last_platform" text,
	"last_ip_hash" text,
	"trial_used" boolean DEFAULT false NOT NULL,
	"trial_started_at" timestamp with time zone,
	"trial_ended_at" timestamp with time zone,
	"premium_seen" boolean DEFAULT false NOT NULL,
	"admin_grant_seen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_db_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"vendor_key" text NOT NULL,
	"latest" text,
	"release_date" text,
	"release_notes" text,
	"safety" text,
	"disabled" boolean DEFAULT false NOT NULL,
	"is_hotfix" boolean DEFAULT false NOT NULL,
	"note" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_fetch_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"vendor_key" text NOT NULL,
	"latest" text,
	"release_date" text,
	"release_notes" text,
	"source" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "driver_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"component" text NOT NULL,
	"component_label" text,
	"vendor" text,
	"from_version" text,
	"to_version" text NOT NULL,
	"action" text DEFAULT 'update' NOT NULL,
	"package_name" text,
	"rollback_available" boolean DEFAULT false NOT NULL,
	"rollback_meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_tweak_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT '__legacy__' NOT NULL,
	"tweak_id" text NOT NULL,
	"action" text NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_tweak_state" (
	"tweak_id" text NOT NULL,
	"user_id" text DEFAULT '__legacy__' NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_result" jsonb,
	"applied_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "network_tweak_state_user_id_tweak_id_pk" PRIMARY KEY("user_id","tweak_id")
);
--> statement-breakpoint
CREATE TABLE "admin_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" varchar NOT NULL,
	"target_user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"previous_value" jsonb,
	"new_value" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "email" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "used_ram_gb" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "used_ram_gb" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "user_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" text DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_duration_hours" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_granted_by_admin_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "has_used_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_bound_device_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_bound_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_last_seen_device_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_device_last_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "device_signature" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "app_version" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "has_seen_trial_activation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "has_seen_trial_tour" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_activated_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_app_active_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "has_installed_app" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_records_device_id_idx" ON "device_records" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_records_user_device_idx" ON "device_records" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_db_overrides_vendor_idx" ON "driver_db_overrides" USING btree ("category","vendor_key");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_fetch_cache_vendor_idx" ON "driver_fetch_cache" USING btree ("category","vendor_key");--> statement-breakpoint
CREATE INDEX "driver_history_user_id_idx" ON "driver_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "driver_history_created_at_idx" ON "driver_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "network_tweak_log_user_id_idx" ON "network_tweak_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_tweak_log_created_at_idx" ON "network_tweak_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_admin_logs_admin_user_id" ON "admin_logs" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "IDX_admin_logs_target_user_id" ON "admin_logs" USING btree ("target_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_stripe_webhook_events_event_id" ON "stripe_webhook_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "ai_scans_settings_id_idx" ON "ai_scans" USING btree ("settings_id");--> statement-breakpoint
CREATE INDEX "applied_tweaks_settings_id_idx" ON "applied_tweaks" USING btree ("settings_id");--> statement-breakpoint
CREATE INDEX "history_entries_settings_id_idx" ON "history_entries" USING btree ("settings_id");--> statement-breakpoint
CREATE INDEX "history_entries_timestamp_idx" ON "history_entries" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_users_provider_providerUserId" ON "users" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_users_google_id" ON "users" USING btree ("google_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_users_stripe_customer_id" ON "users" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_users_premium_bound_device_id" ON "users" USING btree ("premium_bound_device_id");--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id");