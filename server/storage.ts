import {
  userSettings,
  appliedTweaks,
  historyEntries,
  aiScans,
  users,
  adminLogs,
  stripeWebhookEvents,
  type UserSettings,
  type InsertUserSettings,
  type AppliedTweak,
  type InsertAppliedTweak,
  type HistoryEntry,
  type InsertHistoryEntry,
  type AIScan,
  type InsertAIScan,
  type User,
  type AdminLog,
  type InsertAdminLog,
  type StripeWebhookEvent,
  type InsertStripeWebhookEvent,
} from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import { db, isNoDbMode } from "./db";
import { eq, desc, and, ilike, or, count, sql as drizzleSql } from "drizzle-orm";

export interface ListUsersOpts {
  limit?: number;
  offset?: number;
  search?: string;
  plan?: string;
  stripeCustomerId?: string;
  deviceId?: string;
  hasInstalledApp?: boolean;
}

export interface SetPlanOpts {
  plan: "free" | "trial" | "premium" | null;
  trialDurationHours?: number;
  reason?: string;
  grantedByAdminId?: string;
  resetHasUsedTrial?: boolean;
}

export interface IStorage {
  getOrCreateSettings(userId: string): Promise<UserSettings>;
  updateSettings(id: string, data: Partial<InsertUserSettings>): Promise<UserSettings>;
  
  getTweaks(settingsId: string): Promise<AppliedTweak[]>;
  setTweak(settingsId: string, tweakId: string, enabled: boolean): Promise<AppliedTweak>;
  resetTweaks(settingsId: string): Promise<void>;
  
  getHistory(settingsId: string, limit?: number): Promise<HistoryEntry[]>;
  addHistory(entry: InsertHistoryEntry): Promise<HistoryEntry>;
  clearHistory(settingsId: string): Promise<void>;
  
  getLatestAIScan(settingsId: string): Promise<AIScan | undefined>;
  addAIScan(scan: InsertAIScan): Promise<AIScan>;

  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  updateUserStripeInfo(userId: string, data: { stripeCustomerId?: string; isPremium?: boolean }): Promise<User>;
  setUserPremium(userId: string, isPremium: boolean): Promise<User>;
  markPremiumUnlockSeen(userId: string): Promise<User>;
  markPremiumTourSeen(userId: string): Promise<User>;
  markTrialActivationSeen(userId: string): Promise<User>;
  markTrialTourSeen(userId: string): Promise<User>;
  updateUserActivity(userId: string, data: { lastLoginAt?: Date; lastAppActiveAt?: Date; hasInstalledApp?: boolean }): Promise<void>;

  // Device binding
  bindPremiumDevice(userId: string, deviceId: string, signature?: string): Promise<User>;
  clearPremiumDevice(userId: string): Promise<User>;
  findUserByBoundDeviceId(deviceId: string): Promise<User | undefined>;
  updateDeviceLastSeen(userId: string, deviceId: string): Promise<void>;

  // Admin
  listUsers(opts: ListUsersOpts): Promise<{ users: User[]; total: number }>;
  countAdmins(): Promise<number>;
  bootstrapFirstAdmin(userId: string): Promise<{ granted: boolean; user?: User }>;
  setUserPlan(userId: string, opts: SetPlanOpts): Promise<User>;
  extendTrial(userId: string, extraHours: number): Promise<User>;
  resetUserFlags(userId: string, flags: { onboarding?: boolean; premiumTour?: boolean; premiumUnlock?: boolean }): Promise<User>;
  deleteUser(userId: string): Promise<void>;
  setUserAdmin(userId: string, isAdmin: boolean): Promise<User>;
  addAdminLog(log: Omit<InsertAdminLog, "id" | "createdAt">): Promise<AdminLog>;
  getAdminLogs(opts: { targetUserId?: string; limit?: number; offset?: number }): Promise<AdminLog[]>;

  // Admin stats & operations
  getAdminStats(): Promise<{
    totalUsers: number;
    premiumUsers: number;
    trialUsers: number;
    freeUsers: number;
    adminCount: number;
    deviceLockedUsers: number;
    totalStripeEvents: number;
  }>;
  getTrialsExpiring(hours: number): Promise<User[]>;

  // Stripe webhook events
  addStripeWebhookEvent(event: Omit<InsertStripeWebhookEvent, "id" | "processedAt">): Promise<StripeWebhookEvent>;
  getStripeWebhookEvents(limit?: number, offset?: number): Promise<StripeWebhookEvent[]>;
}

class MockStorage implements IStorage {
  private mockSettingsMap: Map<string, UserSettings> = new Map();
  private mockTweaksMap: Map<string, Map<string, AppliedTweak>> = new Map();
  private mockHistoryMap: Map<string, HistoryEntry[]> = new Map();
  private mockAiScansMap: Map<string, AIScan[]> = new Map();
  private _tweaksPersistPath: string | null = null;

  constructor() {
    const userDataDir = process.env.ELECTRON_USER_DATA;
    if (userDataDir) {
      this._tweaksPersistPath = path.join(userDataDir, "tweaks-state.json");
      this._loadTweaksFromDisk();
    }
  }

  private _loadTweaksFromDisk(): void {
    if (!this._tweaksPersistPath) return;
    try {
      if (!fs.existsSync(this._tweaksPersistPath)) return;
      const raw = fs.readFileSync(this._tweaksPersistPath, "utf-8");
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      for (const [settingsId, tweaks] of Object.entries(data)) {
        const tweakMap = new Map<string, AppliedTweak>();
        if (tweaks && typeof tweaks === "object" && !Array.isArray(tweaks)) {
          for (const [tweakId, tweak] of Object.entries(tweaks as Record<string, unknown>)) {
            tweakMap.set(tweakId, tweak as AppliedTweak);
          }
        }
        this.mockTweaksMap.set(settingsId, tweakMap);
      }
      let total = 0;
      for (const m of this.mockTweaksMap.values()) total += m.size;
      console.log(`[MockStorage] Loaded ${total} persisted tweak(s) from disk`);
    } catch (e: any) {
      console.warn("[MockStorage] Failed to load tweaks from disk:", e.message);
    }
  }

  private _saveTweaksToDisk(): void {
    if (!this._tweaksPersistPath) return;
    try {
      const data: Record<string, Record<string, AppliedTweak>> = {};
      for (const [settingsId, tweakMap] of this.mockTweaksMap) {
        data[settingsId] = Object.fromEntries(tweakMap);
      }
      fs.writeFileSync(this._tweaksPersistPath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e: any) {
      console.warn("[MockStorage] Failed to save tweaks to disk:", e.message);
    }
  }

  private getOrInitSettings(userId: string): UserSettings {
    if (!this.mockSettingsMap.has(userId)) {
      this.mockSettingsMap.set(userId, {
        id: `mock-settings-${userId}`,
        userId,
        tier: "Premium",
        email: "demo@example.com",
        licenseStatus: "Active",
        tweaksApplied: 0,
        servicesDisabled: 0,
        cleanersRun: 0,
        startupAppsDisabled: 0,
        usedRamGb: 8.5,
        lastScan: null,
      });
    }
    return this.mockSettingsMap.get(userId)!;
  }

  async getOrCreateSettings(userId: string): Promise<UserSettings> {
    return this.getOrInitSettings(userId);
  }

  async updateSettings(id: string, data: Partial<InsertUserSettings>): Promise<UserSettings> {
    for (const [userId, settings] of this.mockSettingsMap) {
      if (settings.id === id) {
        const updated = { ...settings, ...data };
        this.mockSettingsMap.set(userId, updated);
        return updated;
      }
    }
    throw new Error(`Settings not found: ${id}`);
  }

  async getTweaks(settingsId: string): Promise<AppliedTweak[]> {
    const tweaks = this.mockTweaksMap.get(settingsId);
    return tweaks ? Array.from(tweaks.values()) : [];
  }

  async setTweak(settingsId: string, tweakId: string, enabled: boolean): Promise<AppliedTweak> {
    if (!this.mockTweaksMap.has(settingsId)) {
      this.mockTweaksMap.set(settingsId, new Map());
    }
    const tweak: AppliedTweak = {
      id: `mock-tweak-${settingsId}-${tweakId}`,
      settingsId,
      tweakId,
      enabled,
    };
    this.mockTweaksMap.get(settingsId)!.set(tweakId, tweak);
    this._saveTweaksToDisk();
    return tweak;
  }

  async resetTweaks(settingsId: string): Promise<void> {
    this.mockTweaksMap.delete(settingsId);
    this._saveTweaksToDisk();
  }

  async getHistory(settingsId: string, limit = 50): Promise<HistoryEntry[]> {
    return (this.mockHistoryMap.get(settingsId) || []).slice(0, limit);
  }

  async addHistory(entry: InsertHistoryEntry): Promise<HistoryEntry> {
    const historyEntry: HistoryEntry = {
      id: `mock-history-${Date.now()}`,
      settingsId: entry.settingsId,
      action: entry.action,
      page: entry.page,
      result: entry.result || "Simulated",
      notes: entry.notes || null,
      timestamp: new Date(),
    };
    if (!this.mockHistoryMap.has(entry.settingsId)) {
      this.mockHistoryMap.set(entry.settingsId, []);
    }
    this.mockHistoryMap.get(entry.settingsId)!.unshift(historyEntry);
    return historyEntry;
  }

  async clearHistory(settingsId: string): Promise<void> {
    this.mockHistoryMap.delete(settingsId);
  }

  async getLatestAIScan(settingsId: string): Promise<AIScan | undefined> {
    return (this.mockAiScansMap.get(settingsId) || [])[0];
  }

  async addAIScan(scan: InsertAIScan): Promise<AIScan> {
    const aiScan: AIScan = {
      id: `mock-scan-${Date.now()}`,
      settingsId: scan.settingsId,
      summary: scan.summary,
      recommendations: scan.recommendations as any,
      timestamp: new Date(),
    };
    if (!this.mockAiScansMap.has(scan.settingsId)) {
      this.mockAiScansMap.set(scan.settingsId, []);
    }
    this.mockAiScansMap.get(scan.settingsId)!.unshift(aiScan);
    return aiScan;
  }

  async getUser(id: string): Promise<User | undefined> {
    return undefined;
  }

  async getUserByEmail(_email: string): Promise<User | undefined> {
    return undefined;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    return undefined;
  }

  async updateUserStripeInfo(userId: string, data: { stripeCustomerId?: string; isPremium?: boolean }): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async setUserPremium(userId: string, isPremium: boolean): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async markPremiumUnlockSeen(userId: string): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async markPremiumTourSeen(userId: string): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async markTrialActivationSeen(userId: string): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async markTrialTourSeen(userId: string): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async updateUserActivity(userId: string, data: { lastLoginAt?: Date; lastAppActiveAt?: Date; hasInstalledApp?: boolean }): Promise<void> {
    // no-op in mock mode
  }

  async bindPremiumDevice(_userId: string, _deviceId: string): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async clearPremiumDevice(_userId: string): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async findUserByBoundDeviceId(_deviceId: string): Promise<User | undefined> {
    return undefined;
  }

  async updateDeviceLastSeen(_userId: string, _deviceId: string): Promise<void> {
    // no-op in mock mode
  }

  async listUsers(opts: ListUsersOpts): Promise<{ users: User[]; total: number }> {
    return { users: [], total: 0 };
  }

  async countAdmins(): Promise<number> {
    return 0;
  }

  async bootstrapFirstAdmin(userId: string): Promise<{ granted: boolean; user?: User }> {
    throw new Error("Database not available in NO-DB mode");
  }

  async setUserPlan(userId: string, opts: SetPlanOpts): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async extendTrial(userId: string, extraHours: number): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async resetUserFlags(userId: string, flags: { onboarding?: boolean; premiumTour?: boolean; premiumUnlock?: boolean }): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async deleteUser(userId: string): Promise<void> {
    throw new Error("Database not available in NO-DB mode");
  }

  async setUserAdmin(userId: string, isAdmin: boolean): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async addAdminLog(log: Omit<InsertAdminLog, "id" | "createdAt">): Promise<AdminLog> {
    throw new Error("Database not available in NO-DB mode");
  }

  async getAdminLogs(opts: { targetUserId?: string; limit?: number; offset?: number }): Promise<AdminLog[]> {
    return [];
  }

  async getAdminStats(): Promise<any> {
    return {
      totalUsers: 0,
      premiumUsers: 0,
      trialUsers: 0,
      freeUsers: 0,
      adminCount: 0,
      deviceLockedUsers: 0,
      totalStripeEvents: 0,
    };
  }

  async getTrialsExpiring(_hours: number): Promise<User[]> {
    return [];
  }

  async addStripeWebhookEvent(_event: Omit<InsertStripeWebhookEvent, "id" | "processedAt">): Promise<StripeWebhookEvent> {
    throw new Error("Database not available in NO-DB mode");
  }

  async getStripeWebhookEvents(_limit?: number, _offset?: number): Promise<StripeWebhookEvent[]> {
    return [];
  }
}

export class DatabaseStorage implements IStorage {
  async getOrCreateSettings(userId: string): Promise<UserSettings> {
    const [existing] = await db!
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    if (existing) return existing;

    const [created] = await db!
      .insert(userSettings)
      .values({ userId })
      .returning();
    return created;
  }

  async updateSettings(id: string, data: Partial<InsertUserSettings>): Promise<UserSettings> {
    const [updated] = await db!
      .update(userSettings)
      .set(data)
      .where(eq(userSettings.id, id))
      .returning();
    return updated;
  }

  async getTweaks(settingsId: string): Promise<AppliedTweak[]> {
    return db!.select().from(appliedTweaks).where(eq(appliedTweaks.settingsId, settingsId));
  }

  async setTweak(settingsId: string, tweakId: string, enabled: boolean): Promise<AppliedTweak> {
    const [existing] = await db!
      .select()
      .from(appliedTweaks)
      .where(and(eq(appliedTweaks.settingsId, settingsId), eq(appliedTweaks.tweakId, tweakId)));

    if (existing) {
      const [updated] = await db!
        .update(appliedTweaks)
        .set({ enabled })
        .where(eq(appliedTweaks.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db!
      .insert(appliedTweaks)
      .values({ settingsId, tweakId, enabled })
      .returning();
    return created;
  }

  async resetTweaks(settingsId: string): Promise<void> {
    await db!.delete(appliedTweaks).where(eq(appliedTweaks.settingsId, settingsId));
  }

  async getHistory(settingsId: string, limit = 50): Promise<HistoryEntry[]> {
    return db!
      .select()
      .from(historyEntries)
      .where(eq(historyEntries.settingsId, settingsId))
      .orderBy(desc(historyEntries.timestamp))
      .limit(limit);
  }

  async addHistory(entry: InsertHistoryEntry): Promise<HistoryEntry> {
    const [created] = await db!.insert(historyEntries).values(entry).returning();
    // Hard cap: keep only the 500 most-recent history entries per user.
    // Without this, history_entries grows unboundedly and degrades over time.
    // The DELETE runs after the INSERT so the new row is always kept.
    await db!.execute(
      sql`DELETE FROM history_entries
          WHERE settings_id = ${entry.settingsId}
            AND id NOT IN (
              SELECT id FROM history_entries
              WHERE settings_id = ${entry.settingsId}
              ORDER BY timestamp DESC
              LIMIT 500
            )`
    );
    return created;
  }

  async clearHistory(settingsId: string): Promise<void> {
    await db!.delete(historyEntries).where(eq(historyEntries.settingsId, settingsId));
  }

  async getLatestAIScan(settingsId: string): Promise<AIScan | undefined> {
    const [scan] = await db!
      .select()
      .from(aiScans)
      .where(eq(aiScans.settingsId, settingsId))
      .orderBy(desc(aiScans.timestamp))
      .limit(1);
    return scan;
  }

  async addAIScan(scan: InsertAIScan): Promise<AIScan> {
    const [created] = await db!.insert(aiScans).values(scan).returning();
    // Keep only the 20 most-recent AI scans per user — JSONB recommendations
    // can be large and this table grows with every advisor session.
    await db!.execute(
      sql`DELETE FROM ai_scans
          WHERE settings_id = ${scan.settingsId}
            AND id NOT IN (
              SELECT id FROM ai_scans
              WHERE settings_id = ${scan.settingsId}
              ORDER BY timestamp DESC
              LIMIT 20
            )`
    );
    return created;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db!.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db!.select().from(users).where(ilike(users.email, email));
    return user;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const [user] = await db!.select().from(users).where(eq(users.stripeCustomerId, customerId));
    return user;
  }

  async updateUserStripeInfo(userId: string, data: { stripeCustomerId?: string; isPremium?: boolean }): Promise<User> {
    const [updated] = await db!
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async setUserPremium(userId: string, isPremium: boolean): Promise<User> {
    const planValue = isPremium ? "premium" : "free";
    const [updated] = await db!
      .update(users)
      .set({ isPremium, plan: planValue, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async markPremiumUnlockSeen(userId: string): Promise<User> {
    const [updated] = await db!
      .update(users)
      .set({ hasSeenPremiumUnlock: true, premiumFirstSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async markPremiumTourSeen(userId: string): Promise<User> {
    const [updated] = await db!
      .update(users)
      .set({ hasSeenPremiumTour: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async markTrialActivationSeen(userId: string): Promise<User> {
    const [updated] = await db!
      .update(users)
      .set({ hasSeenTrialActivation: true, trialActivatedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async markTrialTourSeen(userId: string): Promise<User> {
    const [updated] = await db!
      .update(users)
      .set({ hasSeenTrialTour: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async updateUserActivity(userId: string, data: { lastLoginAt?: Date; lastAppActiveAt?: Date; hasInstalledApp?: boolean }): Promise<void> {
    await db!
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async listUsers(opts: ListUsersOpts): Promise<{ users: User[]; total: number }> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const conditions: any[] = [];

    if (opts.search) {
      const term = `%${opts.search}%`;
      conditions.push(
        or(
          ilike(users.email, term),
          ilike(users.firstName, term),
          ilike(users.lastName, term)
        )
      );
    }

    if (opts.plan === "premium") {
      conditions.push(
        or(eq(users.plan, "premium"), eq(users.isPremium, true))
      );
    } else if (opts.plan === "trial") {
      conditions.push(eq(users.plan, "trial"));
    } else if (opts.plan === "free") {
      conditions.push(
        and(
          or(eq(users.plan, "free"), drizzleSql`${users.plan} IS NULL`),
          eq(users.isPremium, false)
        )
      );
    }

    if (opts.stripeCustomerId) {
      conditions.push(eq(users.stripeCustomerId, opts.stripeCustomerId));
    }

    if (opts.deviceId) {
      conditions.push(
        or(
          eq(users.premiumBoundDeviceId, opts.deviceId),
          eq(users.premiumLastSeenDeviceId, opts.deviceId)
        )
      );
    }

    if (opts.hasInstalledApp === true) {
      conditions.push(eq(users.hasInstalledApp, true));
    } else if (opts.hasInstalledApp === false) {
      conditions.push(eq(users.hasInstalledApp, false));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ value: total }] = await db!
      .select({ value: count() })
      .from(users)
      .where(whereClause);

    const rows = await db!
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return { users: rows, total: Number(total) };
  }

  /**
   * Set a user's plan. Trials are admin-granted only (via /api/admin/users/:id/plan
   * or /api/admin/users/:id/set-trial). There is no public self-activation route.
   * hasUsedTrial is tracked for policy/audit. Multiple admin grants are
   * intentionally allowed unless a one-trial-per-user guard is enabled elsewhere.
   */
  async setUserPlan(userId: string, opts: SetPlanOpts): Promise<User> {
    const now = new Date();
    let updateData: Partial<User> = { updatedAt: now };

    if (opts.plan === "premium") {
      updateData.plan = "premium";
      updateData.isPremium = true;
      updateData.trialEndsAt = null;
      updateData.trialStartedAt = null;
      // Reset the unlock animation flag so it always replays when premium is
      // (re-)granted, matching the behaviour of the trial activation reset.
      updateData.hasSeenPremiumUnlock = false;
    } else if (opts.plan === "trial") {
      const hours = opts.trialDurationHours ?? 72;
      const trialEndsAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
      updateData.plan = "trial";
      // Always clear the isPremium boolean when granting a trial so that
      // resolveEffectivePlan never returns "premium" for a trial user.
      // A stale isPremium=true (e.g. from a previous Stripe grant) would
      // shadow the "trial" plan and cause the trial flow to never trigger.
      updateData.isPremium = false;
      updateData.trialStartedAt = now;
      updateData.trialEndsAt = trialEndsAt;
      updateData.trialDurationHours = hours;
      updateData.trialGrantedByAdminId = opts.grantedByAdminId ?? null;
      updateData.trialReason = opts.reason ?? null;
      updateData.hasUsedTrial = true;
      // Reset the "seen" flags so the trial activation animation and tour
      // always replay when a trial is (re-)granted, even if the user has
      // been through them before on a previous trial grant.
      updateData.hasSeenTrialActivation = false;
      updateData.hasSeenTrialTour = false;
    } else if (opts.plan === "free" || opts.plan === null) {
      updateData.plan = "free";
      updateData.isPremium = false;
      updateData.trialEndsAt = null;
      updateData.trialStartedAt = null;
      updateData.trialGrantedByAdminId = null;
      updateData.trialReason = null;
      updateData.trialDurationHours = null;
      if (opts.resetHasUsedTrial) updateData.hasUsedTrial = false;
    }

    const [updated] = await db!
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async extendTrial(userId: string, extraHours: number): Promise<User> {
    const existing = await this.getUser(userId);
    if (!existing) throw new Error("User not found");
    const now = new Date();
    const base = existing.trialEndsAt && existing.trialEndsAt > now
      ? existing.trialEndsAt
      : now;
    const newEnd = new Date(base.getTime() + extraHours * 3600_000);
    const [updated] = await db!
      .update(users)
      .set({ trialEndsAt: newEnd, plan: "trial", hasUsedTrial: true, updatedAt: now })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async resetUserFlags(userId: string, flags: { onboarding?: boolean; premiumTour?: boolean; premiumUnlock?: boolean }): Promise<User> {
    const updateData: Partial<User> = { updatedAt: new Date() };
    if (flags.onboarding) updateData.premiumFirstSeenAt = null;
    if (flags.premiumTour) updateData.hasSeenPremiumTour = false;
    if (flags.premiumUnlock) updateData.hasSeenPremiumUnlock = false;
    const [updated] = await db!
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async deleteUser(userId: string): Promise<void> {
    if (!db) throw new Error("Database not available");

    // Best-effort cleanup: every table is deleted independently.
    // If any table does not exist (42P01) or any FK row is missing, we log and continue.
    // The user row MUST be deleted at the end regardless.
    const cleanup = async (label: string, fn: () => Promise<any>) => {
      try { await fn(); } catch (e: any) { console.log(`[deleteUser] ${label} skipped: ${e?.message || e}`); }
    };

    let settingsId: string | null = null;
    await cleanup("user_settings lookup", async () => {
      const [settings] = await db.select({ id: userSettings.id }).from(userSettings).where(eq(userSettings.userId, userId));
      if (settings) settingsId = settings.id;
    });

    if (settingsId) {
      await cleanup("appliedTweaks", () => db.delete(appliedTweaks).where(eq(appliedTweaks.settingsId, settingsId)));
      await cleanup("historyEntries", () => db.delete(historyEntries).where(eq(historyEntries.settingsId, settingsId)));
      await cleanup("aiScans", () => db.delete(aiScans).where(eq(aiScans.settingsId, settingsId)));
      await cleanup("userSettings", () => db.delete(userSettings).where(eq(userSettings.id, settingsId)));
    }

    await cleanup("focus_sessions", () => db.execute(drizzleSql`DELETE FROM "focus_sessions" WHERE user_id = ${userId}`));
    await cleanup("sessions", () => db.execute(drizzleSql`DELETE FROM sessions WHERE (sess->'passport'->>'user') = ${userId}`));
    await cleanup("admin_logs", () => db.execute(drizzleSql`
      UPDATE admin_logs
         SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"targetDeleted":true}'::jsonb
       WHERE target_user_id = ${userId}
    `));

    await db.delete(users).where(eq(users.id, userId));
  }

  async countAdmins(): Promise<number> {
    const [{ value }] = await db!
      .select({ value: count() })
      .from(users)
      .where(eq(users.isAdmin, true));
    return Number(value);
  }

  async bootstrapFirstAdmin(userId: string): Promise<{ granted: boolean; user?: User }> {
    // Use a session-level advisory lock to serialize concurrent first-admin bootstrap
    // attempts. pg_advisory_xact_lock blocks until no other transaction holds the same
    // lock, so only one caller can check-and-grant at a time. The lock is released
    // automatically when the transaction commits or rolls back.
    // The two-argument form (int, int) avoids any bigint/int4 ambiguity.
    return await db!.transaction(async (tx) => {
      await tx.execute(drizzleSql`SELECT pg_advisory_xact_lock(74112, 90841)`);
      const [{ value }] = await tx
        .select({ value: count() })
        .from(users)
        .where(eq(users.isAdmin, true));
      const adminCount = Number(value);
      if (adminCount > 0) {
        return { granted: false };
      }
      const [updated] = await tx
        .update(users)
        .set({ isAdmin: true, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      return { granted: true, user: updated };
    });
  }

  async setUserAdmin(userId: string, isAdmin: boolean): Promise<User> {
    const [updated] = await db!
      .update(users)
      .set({ isAdmin, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async addAdminLog(log: Omit<InsertAdminLog, "id" | "createdAt">): Promise<AdminLog> {
    const [created] = await db!
      .insert(adminLogs)
      .values(log)
      .returning();
    return created;
  }

  async getAdminLogs(opts: { targetUserId?: string; limit?: number; offset?: number }): Promise<AdminLog[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const where = opts.targetUserId ? eq(adminLogs.targetUserId, opts.targetUserId) : undefined;

    return db!
      .select()
      .from(adminLogs)
      .where(where)
      .orderBy(desc(adminLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async bindPremiumDevice(userId: string, deviceId: string, signature?: string): Promise<User> {
    const updateData: Partial<typeof users.$inferInsert> = {
      premiumBoundDeviceId: deviceId,
      premiumBoundAt: new Date(),
      premiumLastSeenDeviceId: deviceId,
      updatedAt: new Date(),
    };
    if (signature) {
      updateData.deviceSignature = signature;
    }
    const [updated] = await db!
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async clearPremiumDevice(userId: string): Promise<User> {
    const [updated] = await db!
      .update(users)
      .set({
        premiumBoundDeviceId: null,
        premiumBoundAt: null,
        premiumLastSeenDeviceId: null,
        deviceSignature: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async findUserByBoundDeviceId(deviceId: string): Promise<User | undefined> {
    const [user] = await db!
      .select()
      .from(users)
      .where(eq(users.premiumBoundDeviceId, deviceId))
      .limit(1);
    return user;
  }

  async updateDeviceLastSeen(userId: string, deviceId: string): Promise<void> {
    await db!
      .update(users)
      .set({
        premiumLastSeenDeviceId: deviceId,
        premiumDeviceLastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  // ─── Admin stats & operations ─────────────────────────────────────────────

  async getAdminStats(): Promise<{
    totalUsers: number;
    premiumUsers: number;
    trialUsers: number;
    freeUsers: number;
    adminCount: number;
    deviceLockedUsers: number;
    totalStripeEvents: number;
  }> {
    const [{ totalUsers }] = await db!
      .select({ totalUsers: count() })
      .from(users);

    const [{ premiumUsers }] = await db!
      .select({ premiumUsers: count() })
      .from(users)
      .where(or(eq(users.plan, "premium"), eq(users.isPremium, true)));

    const [{ trialUsers }] = await db!
      .select({ trialUsers: count() })
      .from(users)
      .where(eq(users.plan, "trial"));

    const [{ freeUsers }] = await db!
      .select({ freeUsers: count() })
      .from(users)
      .where(
        and(
          or(eq(users.plan, "free"), drizzleSql`${users.plan} IS NULL`),
          eq(users.isPremium, false)
        )
      );

    const [{ adminCount }] = await db!
      .select({ adminCount: count() })
      .from(users)
      .where(eq(users.isAdmin, true));

    const [{ deviceLockedUsers }] = await db!
      .select({ deviceLockedUsers: count() })
      .from(users)
      .where(drizzleSql`${users.premiumBoundDeviceId} IS NOT NULL`);

    let totalStripeEvents = 0;
    try {
      const [row] = await db!
        .select({ totalStripeEvents: count() })
        .from(stripeWebhookEvents);
      totalStripeEvents = Number(row.totalStripeEvents);
    } catch {
      // table may not exist yet in this environment — return 0 gracefully
    }

    return {
      totalUsers: Number(totalUsers),
      premiumUsers: Number(premiumUsers),
      trialUsers: Number(trialUsers),
      freeUsers: Number(freeUsers),
      adminCount: Number(adminCount),
      deviceLockedUsers: Number(deviceLockedUsers),
      totalStripeEvents,
    };
  }

  async getTrialsExpiring(hours: number): Promise<User[]> {
    const cutoff = new Date(Date.now() + hours * 3600_000);
    return db!
      .select()
      .from(users)
      .where(
        and(
          eq(users.plan, "trial"),
          drizzleSql`${users.trialEndsAt} <= ${cutoff}`,
          drizzleSql`${users.trialEndsAt} > NOW()`
        )
      )
      .orderBy(users.trialEndsAt);
  }

  // ─── Stripe webhook events ──────────────────────────────────────────────────

  async addStripeWebhookEvent(event: Omit<InsertStripeWebhookEvent, "id" | "processedAt">): Promise<StripeWebhookEvent> {
    // Idempotent by Stripe event id: Stripe redelivers the same event.id on retries.
    // The unique index on event_id makes this race-safe (a concurrent duplicate
    // delivery hits the conflict instead of inserting a second row). On conflict the
    // insert returns nothing, so we fetch and return the row already on record.
    const [created] = await db!
      .insert(stripeWebhookEvents)
      .values(event)
      .onConflictDoNothing({ target: stripeWebhookEvents.eventId })
      .returning();
    if (created) return created;

    const [existing] = await db!
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, event.eventId))
      .limit(1);
    if (!existing) {
      // Unreachable in practice: a conflict means the row exists. If we ever land
      // here it signals a broken invariant (e.g. row deleted between insert+select).
      throw new Error(`[Stripe] addStripeWebhookEvent: conflict on event ${event.eventId} but no existing row found`);
    }
    return existing;
  }

  async getStripeWebhookEvents(limit = 20, offset = 0): Promise<StripeWebhookEvent[]> {
    return db!
      .select()
      .from(stripeWebhookEvents)
      .orderBy(desc(stripeWebhookEvents.processedAt))
      .limit(limit)
      .offset(offset);
  }
}

export const storage: IStorage = isNoDbMode ? new MockStorage() : new DatabaseStorage();
