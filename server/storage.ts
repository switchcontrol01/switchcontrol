import { 
  userSettings, 
  appliedTweaks, 
  historyEntries, 
  aiScans,
  type UserSettings, 
  type InsertUserSettings,
  type AppliedTweak,
  type InsertAppliedTweak,
  type HistoryEntry,
  type InsertHistoryEntry,
  type AIScan,
  type InsertAIScan
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

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
}

export class DatabaseStorage implements IStorage {
  async getOrCreateSettings(): Promise<UserSettings> {
    const [existing] = await db.select().from(userSettings).limit(1);
    if (existing) return existing;
    
    const [created] = await db.insert(userSettings).values({}).returning();
    return created;
  }

  async updateSettings(id: string, data: Partial<InsertUserSettings>): Promise<UserSettings> {
    const [updated] = await db
      .update(userSettings)
      .set(data)
      .where(eq(userSettings.id, id))
      .returning();
    return updated;
  }

  async getTweaks(settingsId: string): Promise<AppliedTweak[]> {
    return db.select().from(appliedTweaks).where(eq(appliedTweaks.settingsId, settingsId));
  }

  async setTweak(settingsId: string, tweakId: string, enabled: boolean): Promise<AppliedTweak> {
    const [existing] = await db
      .select()
      .from(appliedTweaks)
      .where(and(eq(appliedTweaks.settingsId, settingsId), eq(appliedTweaks.tweakId, tweakId)));

    if (existing) {
      const [updated] = await db
        .update(appliedTweaks)
        .set({ enabled })
        .where(eq(appliedTweaks.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(appliedTweaks)
      .values({ settingsId, tweakId, enabled })
      .returning();
    return created;
  }

  async resetTweaks(settingsId: string): Promise<void> {
    await db.delete(appliedTweaks).where(eq(appliedTweaks.settingsId, settingsId));
  }

  async getHistory(settingsId: string, limit = 50): Promise<HistoryEntry[]> {
    return db
      .select()
      .from(historyEntries)
      .where(eq(historyEntries.settingsId, settingsId))
      .orderBy(desc(historyEntries.timestamp))
      .limit(limit);
  }

  async addHistory(entry: InsertHistoryEntry): Promise<HistoryEntry> {
    const [created] = await db.insert(historyEntries).values(entry).returning();
    return created;
  }

  async clearHistory(settingsId: string): Promise<void> {
    await db.delete(historyEntries).where(eq(historyEntries.settingsId, settingsId));
  }

  async getLatestAIScan(settingsId: string): Promise<AIScan | undefined> {
    const [scan] = await db
      .select()
      .from(aiScans)
      .where(eq(aiScans.settingsId, settingsId))
      .orderBy(desc(aiScans.timestamp))
      .limit(1);
    return scan;
  }

  async addAIScan(scan: InsertAIScan): Promise<AIScan> {
    const [created] = await db.insert(aiScans).values(scan).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
