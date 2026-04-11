import { 
  userSettings, 
  appliedTweaks, 
  historyEntries, 
  aiScans,
  users,
  adminLogs,
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
} from "@shared/schema";
import { db, isNoDbMode } from "./db";
import { eq, desc, and, ilike, or, count, sql as drizzleSql } from "drizzle-orm";

export interface ListUsersOpts {
  limit?: number;
  offset?: number;
  search?: string;
  plan?: string;
}

export interface SetPlanOpts {
  plan: "free" | "trial" | "premium" | null;
  trialDurationHours?: number;
  reason?: string;
  grantedByAdminId?: string;
  resetHasUsedTrial?: boolean;
}

export interface IStorage {
  getOrCreateSettings(): Promise<UserSettings>;
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
  updateUserActivity(userId: string, data: { lastLoginAt?: Date; lastAppActiveAt?: Date; hasInstalledApp?: boolean }): Promise<void>;

  // Device binding
  bindPremiumDevice(userId: string, deviceId: string): Promise<User>;
  clearPremiumDevice(userId: string): Promise<User>;

  // Admin
  listUsers(opts: ListUsersOpts): Promise<{ users: User[]; total: number }>;
  countAdmins(): Promise<number>;
  setUserPlan(userId: string, opts: SetPlanOpts): Promise<User>;
  extendTrial(userId: string, extraHours: number): Promise<User>;
  resetUserFlags(userId: string, flags: { onboarding?: boolean; premiumTour?: boolean; premiumUnlock?: boolean }): Promise<User>;
  deleteUser(userId: string): Promise<void>;
  setUserAdmin(userId: string, isAdmin: boolean): Promise<User>;
  addAdminLog(log: Omit<InsertAdminLog, "id" | "createdAt">): Promise<AdminLog>;
  getAdminLogs(opts: { targetUserId?: string; limit?: number; offset?: number }): Promise<AdminLog[]>;
}

class MockStorage implements IStorage {
  private mockSettings: UserSettings = {
    id: "mock-settings-id",
    tier: "Premium",
    email: "demo@example.com",
    licenseStatus: "Active",
    tweaksApplied: 0,
    servicesDisabled: 0,
    cleanersRun: 0,
    startupAppsDisabled: 0,
    usedRamGb: 8.5,
    lastScan: null,
  };
  private mockTweaks: Map<string, AppliedTweak> = new Map();
  private mockHistory: HistoryEntry[] = [];
  private mockAiScans: AIScan[] = [];

  async getOrCreateSettings(): Promise<UserSettings> {
    return this.mockSettings;
  }

  async updateSettings(id: string, data: Partial<InsertUserSettings>): Promise<UserSettings> {
    this.mockSettings = { ...this.mockSettings, ...data };
    return this.mockSettings;
  }

  async getTweaks(settingsId: string): Promise<AppliedTweak[]> {
    return Array.from(this.mockTweaks.values());
  }

  async setTweak(settingsId: string, tweakId: string, enabled: boolean): Promise<AppliedTweak> {
    const tweak: AppliedTweak = {
      id: `mock-tweak-${tweakId}`,
      settingsId,
      tweakId,
      enabled,
    };
    this.mockTweaks.set(tweakId, tweak);
    return tweak;
  }

  async resetTweaks(settingsId: string): Promise<void> {
    this.mockTweaks.clear();
  }

  async getHistory(settingsId: string, limit = 50): Promise<HistoryEntry[]> {
    return this.mockHistory.slice(0, limit);
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
    this.mockHistory.unshift(historyEntry);
    return historyEntry;
  }

  async clearHistory(settingsId: string): Promise<void> {
    this.mockHistory = [];
  }

  async getLatestAIScan(settingsId: string): Promise<AIScan | undefined> {
    return this.mockAiScans[0];
  }

  async addAIScan(scan: InsertAIScan): Promise<AIScan> {
    const aiScan: AIScan = {
      id: `mock-scan-${Date.now()}`,
      settingsId: scan.settingsId,
      summary: scan.summary,
      recommendations: scan.recommendations as any,
      timestamp: new Date(),
    };
    this.mockAiScans.unshift(aiScan);
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

  async updateUserActivity(userId: string, data: { lastLoginAt?: Date; lastAppActiveAt?: Date; hasInstalledApp?: boolean }): Promise<void> {
    // no-op in mock mode
  }

  async bindPremiumDevice(_userId: string, _deviceId: string): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async clearPremiumDevice(_userId: string): Promise<User> {
    throw new Error("Database not available in NO-DB mode");
  }

  async listUsers(opts: ListUsersOpts): Promise<{ users: User[]; total: number }> {
    return { users: [], total: 0 };
  }

  async countAdmins(): Promise<number> {
    return 0;
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
}

export class DatabaseStorage implements IStorage {
  async getOrCreateSettings(): Promise<UserSettings> {
    const [existing] = await db!.select().from(userSettings).limit(1);
    if (existing) return existing;
    
    const [created] = await db!.insert(userSettings).values({}).returning();
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

  async setUserPlan(userId: string, opts: SetPlanOpts): Promise<User> {
    const now = new Date();
    let updateData: Partial<User> = { updatedAt: now };

    if (opts.plan === "premium") {
      updateData.plan = "premium";
      updateData.isPremium = true;
      updateData.trialEndsAt = null;
      updateData.trialStartedAt = null;
    } else if (opts.plan === "trial") {
      const hours = opts.trialDurationHours ?? 72;
      const trialEndsAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
      updateData.plan = "trial";
      updateData.trialStartedAt = now;
      updateData.trialEndsAt = trialEndsAt;
      updateData.trialDurationHours = hours;
      updateData.trialGrantedByAdminId = opts.grantedByAdminId ?? null;
      updateData.trialReason = opts.reason ?? null;
      updateData.hasUsedTrial = true;
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
    // Intentionally preserve adminLogs for audit trail — targetUserId is varchar, no FK constraint
    await db!.delete(users).where(eq(users.id, userId));
  }

  async countAdmins(): Promise<number> {
    const [{ value }] = await db!
      .select({ value: count() })
      .from(users)
      .where(eq(users.isAdmin, true));
    return Number(value);
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

  async bindPremiumDevice(userId: string, deviceId: string): Promise<User> {
    const [updated] = await db!
      .update(users)
      .set({
        premiumBoundDeviceId: deviceId,
        premiumBoundAt: new Date(),
        premiumLastSeenDeviceId: deviceId,
        updatedAt: new Date(),
      })
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
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }
}

export const storage: IStorage = isNoDbMode ? new MockStorage() : new DatabaseStorage();
