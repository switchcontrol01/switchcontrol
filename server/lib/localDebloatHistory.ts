/**
 * Local JSON-file-backed debloat history store.
 *
 * Used ONLY when running in no-DB mode (the packaged Electron desktop app,
 * where there is no reachable Postgres database). Without this, every
 * `/api/debloat/apply` and `/api/debloat/restore` call was a no-op for
 * history purposes, and `GET /api/debloat/history` always returned an
 * empty array — so the "Debloat History" panel never showed anything,
 * even right after successfully applying items.
 *
 * Row shape mirrors the Postgres `debloat_applied_items` table exactly so
 * the client's `HistoryEntry` type works identically regardless of backend.
 */

import fs from "fs";
import path from "path";
import { ensureDesktopDataDir } from "./localDesktopDataDir";

export interface LocalHistoryEntry {
  id: number;
  user_id?: string | null;
  item_id: string;
  item_name: string;
  action: string;
  status: string;
  role: string | null;
  level: string | null;
  verification: string;
  restart_req: boolean;
  signout_req: boolean;
  applied_at: string;
}

const MAX_ENTRIES = 500;

function getFilePath(): string {
  return path.join(ensureDesktopDataDir(), "debloat-history.json");
}

function readAll(): LocalHistoryEntry[] {
  try {
    const file = getFilePath();
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e: any) {
    console.warn("[LocalDebloatHistory] Failed to read history file — returning []:", e.message);
    return [];
  }
}

function writeAll(entries: LocalHistoryEntry[]): void {
  try {
    fs.writeFileSync(getFilePath(), JSON.stringify(entries, null, 2), "utf-8");
  } catch (e: any) {
    console.error("[LocalDebloatHistory] Failed to write history file:", e.message);
  }
}

export function appendLocalHistoryEntry(entry: Omit<LocalHistoryEntry, "id" | "applied_at">): void {
  const entries = readAll();
  const nextId = entries.length > 0 ? Math.max(...entries.map(e => e.id)) + 1 : 1;
  entries.unshift({
    ...entry,
    id: nextId,
    applied_at: new Date().toISOString(),
  });
  writeAll(entries.slice(0, MAX_ENTRIES));
}

export function getLocalHistory(limit = 100, userId?: string): LocalHistoryEntry[] {
  return readAll()
    .filter(entry => !userId || entry.user_id === userId)
    .sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime())
    .slice(0, limit);
}
