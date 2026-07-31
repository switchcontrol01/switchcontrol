import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

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
  // Stored as integer hours (not float) — float rounding on values like
  // 71.999999 would cause off-by-seconds bugs in trial-expiry date math.
  // Treat as informational only at runtime; use trialEndsAt for all
  // expiry comparisons.
  trialDurationHours: integer("trial_duration_hours"),
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
  // HMAC signature for device-id header verification (cryptographic device binding)
  deviceSignature: varchar("device_signature"),
  // One-time migration linkage: the pre-1.2.6 random device ID this account's
  // device history was keyed to before the permanent MachineGuid-derived ID
  // replaced it (see storage.migrateLegacyDeviceId). Safe to remove ~6 months
  // after rollout once telemetry shows near-zero old-format IDs.
  legacyDeviceId: varchar("legacy_device_id"),
  // Last-reported desktop app version / OS platform for the bound/last-seen device
  appVersion: varchar("app_version"),
  platform: varchar("platform"),

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
}, (table) => [
  // ── Identity uniqueness ───────────────────────────────────────────────────
  // Without these, a race condition (double-click login, retried OAuth
  // callback, concurrent tabs) can silently insert duplicate user rows.
  // A DB-level unique constraint turns those races into a rejected insert
  // rather than a corrupt duplicate that app-level code never detects.
  uniqueIndex("UQ_users_provider_providerUserId").on(table.provider, table.providerUserId),

  // NULL is treated as distinct by Postgres unique indexes, so these are
  // safe even when the columns are nullable — two NULL rows don't conflict.
  uniqueIndex("UQ_users_email").on(table.email),
  uniqueIndex("UQ_users_google_id").on(table.googleId),

  // ── Billing uniqueness ────────────────────────────────────────────────────
  // Prevents the same Stripe customer being attached to two user accounts.
  // Without this, webhook handling is ambiguous: which user gets credited?
  uniqueIndex("UQ_users_stripe_customer_id").on(table.stripeCustomerId),

  // ── Device-binding uniqueness ─────────────────────────────────────────────
  // Enforces the "one premium device per account" invariant at the DB level.
  // Without this, the same physical device ID can be bound as the premium
  // device on multiple accounts simultaneously — defeating license enforcement.
  uniqueIndex("UQ_users_premium_bound_device_id").on(table.premiumBoundDeviceId),
]);

// Admin audit log — every plan/admin action is recorded here.
// adminUserId and targetUserId reference users.id so orphaned audit records
// (pointing at deleted/non-existent users) are prevented at the DB level.
// The default ON DELETE RESTRICT means you cannot delete a user who appears
// in the audit log — intentional for an audit trail.
export const adminLogs = pgTable("admin_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id")
    .notNull()
    .references(() => users.id),
  targetUserId: varchar("target_user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Lookup indexes so audit queries by admin or by target user are fast.
  index("IDX_admin_logs_admin_user_id").on(table.adminUserId),
  index("IDX_admin_logs_target_user_id").on(table.targetUserId),
]);

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
