import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tier: text("tier").notNull().default("Premium"),
  email: text("email").default("user@example.com"),
  licenseStatus: text("license_status").notNull().default("Active"),
  tweaksApplied: integer("tweaks_applied").notNull().default(0),
  servicesDisabled: integer("services_disabled").notNull().default(0),
  cleanersRun: integer("cleaners_run").notNull().default(0),
  startupAppsDisabled: integer("startup_apps_disabled").notNull().default(0),
  lastScan: timestamp("last_scan"),
  usedRamGb: real("used_ram_gb").notNull().default(9.5),
});

export const appliedTweaks = pgTable("applied_tweaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingsId: varchar("settings_id").notNull(),
  tweakId: text("tweak_id").notNull(),
  enabled: boolean("enabled").notNull().default(false),
});

export const historyEntries = pgTable("history_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingsId: varchar("settings_id").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  action: text("action").notNull(),
  page: text("page").notNull(),
  result: text("result").notNull(),
  notes: text("notes"),
});

export const aiScans = pgTable("ai_scans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingsId: varchar("settings_id").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  summary: text("summary").notNull(),
  recommendations: jsonb("recommendations").notNull(),
});

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

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type AppliedTweak = typeof appliedTweaks.$inferSelect;
export type InsertAppliedTweak = z.infer<typeof insertAppliedTweakSchema>;
export type HistoryEntry = typeof historyEntries.$inferSelect;
export type InsertHistoryEntry = z.infer<typeof insertHistoryEntrySchema>;
export type AIScan = typeof aiScans.$inferSelect;
export type InsertAIScan = z.infer<typeof insertAIScanSchema>;

export * from "./models/auth";
