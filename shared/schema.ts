import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, jsonb, serial, primaryKey, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  tier: text("tier").notNull().default("Premium"),
  email: text("email"),
  licenseStatus: text("license_status").notNull().default("Active"),
  tweaksApplied: integer("tweaks_applied").notNull().default(0),
  servicesDisabled: integer("services_disabled").notNull().default(0),
  cleanersRun: integer("cleaners_run").notNull().default(0),
  startupAppsDisabled: integer("startup_apps_disabled").notNull().default(0),
  lastScan: timestamp("last_scan"),
  usedRamGb: real("used_ram_gb"),
});

export const appliedTweaks = pgTable("applied_tweaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingsId: varchar("settings_id").notNull(),
  tweakId: text("tweak_id").notNull(),
  enabled: boolean("enabled").notNull().default(false),
}, (t) => ({
  settingsIdIdx: index("applied_tweaks_settings_id_idx").on(t.settingsId),
}));

export const historyEntries = pgTable("history_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingsId: varchar("settings_id").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  action: text("action").notNull(),
  page: text("page").notNull(),
  result: text("result").notNull(),
  notes: text("notes"),
}, (t) => ({
  settingsIdIdx: index("history_entries_settings_id_idx").on(t.settingsId),
  timestampIdx:  index("history_entries_timestamp_idx").on(t.timestamp),
}));

export const aiScans = pgTable("ai_scans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingsId: varchar("settings_id").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  summary: text("summary").notNull(),
  recommendations: jsonb("recommendations").notNull(),
}, (t) => ({
  settingsIdIdx: index("ai_scans_settings_id_idx").on(t.settingsId),
}));

// ── Network tweak persistence ─────────────────────────────────────────────────
// PK is composite (user_id, tweak_id) so each user owns their own state row.
// For databases that still have the old single-column tweak_id PK, the startup
// migration in server/routes/networkTweaks.ts drops the old constraint and adds
// the composite PK before the application begins serving requests.
export const networkTweakState = pgTable("network_tweak_state", {
  tweakId:    text("tweak_id").notNull(),
  userId:     text("user_id").notNull().default("__legacy__"),
  status:     text("status").notNull().default("idle"),
  lastResult: jsonb("last_result"),
  appliedAt:  timestamp("applied_at", { withTimezone: true }),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.tweakId] }),
}));

export const networkTweakLog = pgTable("network_tweak_log", {
  id:        serial("id").primaryKey(),
  userId:    text("user_id").notNull().default("__legacy__"),
  tweakId:   text("tweak_id").notNull(),
  action:    text("action").notNull(),
  success:   boolean("success").notNull().default(false),
  verified:  boolean("verified").notNull().default(false),
  message:   text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx:    index("network_tweak_log_user_id_idx").on(t.userId),
  createdAtIdx: index("network_tweak_log_created_at_idx").on(t.createdAt),
}));

// ── Driver Intelligence history / restore points ─────────────────────────────
// User-scoped log of driver/firmware version changes the user recorded. A
// "restore point" is simply an entry whose rollbackMeta captures enough detail
// (version/date/package) to find and reinstall a previous driver from the
// vendor. We NEVER store driver binaries — only metadata pointing at them.
export const driverHistory = pgTable("driver_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  /** Component kind: gpu | chipset | ssd | network | audio | bios | bluetooth. */
  component: text("component").notNull(),
  /** Human label e.g. "NVIDIA GeForce RTX 4070". */
  componentLabel: text("component_label"),
  vendor: text("vendor"),
  fromVersion: text("from_version"),
  toVersion: text("to_version").notNull(),
  /** update | restore | note */
  action: text("action").notNull().default("update"),
  /** Vendor package / installer name this change came from, if known. */
  packageName: text("package_name"),
  /** True when enough metadata exists to guide a rollback. */
  rollbackAvailable: boolean("rollback_available").notNull().default(false),
  /** Free-form metadata: prior version, release date, download hints, notes. */
  rollbackMeta: jsonb("rollback_meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx: index("driver_history_user_id_idx").on(t.userId),
  createdAtIdx: index("driver_history_created_at_idx").on(t.createdAt),
}));

// ── Driver version auto-fetch cache ───────────────────────────────────────────
// Written by server/lib/driverFetcher.ts on a daily schedule.
// One row per (category, vendorKey) — upserted on each successful / failed fetch.
export const driverFetchCache = pgTable("driver_fetch_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(),
  vendorKey: text("vendor_key").notNull(),
  latest: text("latest"),
  releaseDate: text("release_date"),
  releaseNotes: text("release_notes"),
  source: text("source"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  /** Non-null when the last fetch attempt errored — latest is stale. */
  error: text("error"),
}, (t) => ({
  uniq: uniqueIndex("driver_fetch_cache_vendor_idx").on(t.category, t.vendorKey),
}));

export type DriverFetchCache = typeof driverFetchCache.$inferSelect;

// ── Driver DB admin overrides / hotfixes / emergency disables ─────────────────
// Admin-curated layer on top of the static reference DB in routes/driverIntel.ts.
// One row per (category, vendorKey). Lets admins push a hotfix version, correct
// metadata, or emergency-disable a known-bad driver without a redeploy.
export const driverDbOverrides = pgTable("driver_db_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** gpu | chipset | bios | ssd | network | audio | bluetooth */
  category: text("category").notNull(),
  /** Normalised vendor key, e.g. "nvidia", "gigabyte". */
  vendorKey: text("vendor_key").notNull(),
  /** Override the latest known version (optional). */
  latest: text("latest"),
  releaseDate: text("release_date"),
  releaseNotes: text("release_notes"),
  /** safe | caution | critical */
  safety: text("safety"),
  /** Emergency-disable: tells clients NOT to recommend this driver. */
  disabled: boolean("disabled").notNull().default(false),
  /** Flags an out-of-band hotfix entry. */
  isHotfix: boolean("is_hotfix").notNull().default(false),
  /** Admin note shown to users (e.g. why a driver is disabled). */
  note: text("note"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  vendorKeyIdx: uniqueIndex("driver_db_overrides_vendor_idx").on(t.category, t.vendorKey),
}));

// ── Permanent device history ──────────────────────────────────────────────────
// One row per (userId, deviceId) pair — upserted on every device contact.
// Survives clearPremiumDevice, rebinds, plan changes, and backend restarts.
// Source of truth for Admin Device Inspector.
export const deviceRecords = pgTable("device_records", {
  id:               serial("id").primaryKey(),
  userId:           text("user_id").notNull(),
  deviceId:         text("device_id").notNull(),
  email:            text("email"),
  firstSeenAt:      timestamp("first_seen_at",  { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:       timestamp("last_seen_at",   { withTimezone: true }).notNull().defaultNow(),
  lastAppVersion:   text("last_app_version"),
  lastPlatform:     text("last_platform"),
  lastIpHash:       text("last_ip_hash"),
  trialUsed:        boolean("trial_used").notNull().default(false),
  trialStartedAt:   timestamp("trial_started_at",  { withTimezone: true }),
  trialEndedAt:     timestamp("trial_ended_at",    { withTimezone: true }),
  premiumSeen:      boolean("premium_seen").notNull().default(false),
  adminGrantSeen:   boolean("admin_grant_seen").notNull().default(false),
  // 64-char SHA-256 hardware fingerprint (MachineGuid-derived) — survives app
  // reinstalls, so trial/premium history can be correlated across device-ID
  // regenerations. Historical rows won't have it (accepted gap).
  deviceFingerprint: varchar("device_fingerprint", { length: 64 }),
  // One-time migration linkage: the pre-permanent random device ID whose
  // history was carried onto this row (see storage.migrateLegacyDeviceId).
  legacyDeviceId:   text("legacy_device_id"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  deviceIdIdx:    index("device_records_device_id_idx").on(t.deviceId),
  userDeviceUniq: uniqueIndex("device_records_user_device_idx").on(t.userId, t.deviceId),
  fingerprintIdx: index("device_records_fingerprint_idx").on(t.deviceFingerprint),
}));

export type DeviceRecord = typeof deviceRecords.$inferSelect;

// ── Free-user premium promo popup state ──────────────────────────────────────
// Server-side launch counter keyed by the permanent hardware fingerprint —
// deliberately NEVER stored client-side, so uninstalling the app, deleting
// %appdata%, or factory-resetting cannot reset the cadence or the lockout.
// locked_out is permanent once true (device has used a trial / seen premium).
export const promoPopupState = pgTable("promo_popup_state", {
  deviceFingerprint: varchar("device_fingerprint", { length: 64 }).primaryKey(),
  launchCount:       integer("launch_count").notNull().default(0),
  nextThreshold:     integer("next_threshold").notNull().default(30),
  lockedOut:         boolean("locked_out").notNull().default(false),
  lockedOutReason:   text("locked_out_reason"),
  lastShownAt:       timestamp("last_shown_at", { withTimezone: true }),
  shownCount:        integer("shown_count").notNull().default(0),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PromoPopupState = typeof promoPopupState.$inferSelect;

export const userSettingsRelations = relations(userSettings, ({ many }) => ({
  appliedTweaks: many(appliedTweaks),
  historyEntries: many(historyEntries),
  aiScans: many(aiScans),
}));

export const appliedTweaksRelations = relations(appliedTweaks, ({ one }) => ({
  settings: one(userSettings, {
    fields: [appliedTweaks.settingsId],
    references: [userSettings.id],
  }),
}));

export const historyEntriesRelations = relations(historyEntries, ({ one }) => ({
  settings: one(userSettings, {
    fields: [historyEntries.settingsId],
    references: [userSettings.id],
  }),
}));

export const aiScansRelations = relations(aiScans, ({ one }) => ({
  settings: one(userSettings, {
    fields: [aiScans.settingsId],
    references: [userSettings.id],
  }),
}));

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({ id: true });
export const insertAppliedTweakSchema = createInsertSchema(appliedTweaks).omit({ id: true });
export const insertHistoryEntrySchema = createInsertSchema(historyEntries).omit({ id: true, timestamp: true });
export const insertAIScanSchema = createInsertSchema(aiScans).omit({ id: true, timestamp: true });
export const insertDriverHistorySchema = createInsertSchema(driverHistory).omit({ id: true, createdAt: true });
export const insertDriverDbOverrideSchema = createInsertSchema(driverDbOverrides).omit({ id: true, updatedAt: true });

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type AppliedTweak = typeof appliedTweaks.$inferSelect;
export type InsertAppliedTweak = z.infer<typeof insertAppliedTweakSchema>;
export type HistoryEntry = typeof historyEntries.$inferSelect;
export type InsertHistoryEntry = z.infer<typeof insertHistoryEntrySchema>;
export type AIScan = typeof aiScans.$inferSelect;
export type InsertAIScan = z.infer<typeof insertAIScanSchema>;
export type DriverHistory = typeof driverHistory.$inferSelect;
export type InsertDriverHistory = z.infer<typeof insertDriverHistorySchema>;
export type DriverDbOverride = typeof driverDbOverrides.$inferSelect;
export type InsertDriverDbOverride = z.infer<typeof insertDriverDbOverrideSchema>;

export * from "./models/auth";
