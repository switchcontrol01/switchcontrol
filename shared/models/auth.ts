import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
// Identity is stored as (provider, providerUserId) - email is optional.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider").notNull().default("replit"),
  providerUserId: varchar("provider_user_id"),
  email: varchar("email"),
  passwordHash: varchar("password_hash"),
  googleId: varchar("google_id"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),

  // Stripe billing
  isPremium: boolean("is_premium").notNull().default(false),
  stripeCustomerId: varchar("stripe_customer_id"),
  premiumActivatedAt: timestamp("premium_activated_at"),

  // Admin-managed plan ('free' | 'trial' | 'premium' | null means fall back to isPremium)
  plan: text("plan").default("free"),
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  trialDurationHours: real("trial_duration_hours"),
  trialGrantedByAdminId: varchar("trial_granted_by_admin_id"),
  trialReason: text("trial_reason"),
  hasUsedTrial: boolean("has_used_trial").notNull().default(false),

  // Admin flag
  isAdmin: boolean("is_admin").notNull().default(false),

  // Premium device binding (desktop app only)
  premiumBoundDeviceId: varchar("premium_bound_device_id"),
  premiumBoundAt: timestamp("premium_bound_at"),
  premiumLastSeenDeviceId: varchar("premium_last_seen_device_id"),
  premiumDeviceLastSeenAt: timestamp("premium_device_last_seen_at"),

  // Onboarding
  hasSeenPremiumUnlock: boolean("has_seen_premium_unlock").notNull().default(false),
  hasSeenPremiumTour: boolean("has_seen_premium_tour").notNull().default(false),
  premiumFirstSeenAt: timestamp("premium_first_seen_at"),
  hasSeenTrialActivation: boolean("has_seen_trial_activation").notNull().default(false),
  hasSeenTrialTour: boolean("has_seen_trial_tour").notNull().default(false),
  trialActivatedAt: timestamp("trial_activated_at"),

  // Activity
  lastLoginAt: timestamp("last_login_at"),
  lastAppActiveAt: timestamp("last_app_active_at"),
  hasInstalledApp: boolean("has_installed_app").notNull().default(false),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin audit log — every plan/admin action is recorded here
export const adminLogs = pgTable("admin_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull(),
  targetUserId: varchar("target_user_id").notNull(),
  action: text("action").notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Stripe webhook events log — persisted for admin visibility
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at").defaultNow(),
}, (table) => [
  // Stripe redelivers the same event.id on retries — record each event once.
  uniqueIndex("UQ_stripe_webhook_events_event_id").on(table.eventId),
]);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type AdminLog = typeof adminLogs.$inferSelect;
export type InsertAdminLog = typeof adminLogs.$inferInsert;
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type InsertStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;
