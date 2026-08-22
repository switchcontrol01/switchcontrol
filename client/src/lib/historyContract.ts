import type { HistoryItem } from "@/lib/store";

export type HistoryCategory =
  | "tweak"
  | "slider"
  | "preset"
  | "network"
  | "power-plan"
  | "startup"
  | "nic"
  | "non-revertible"
  | "summary";

export interface HistoryMetadata {
  category: HistoryCategory;
  targetId?: string;
  restoreValue?: number | string | null;
  restoreTarget?: Record<string, unknown>;
  reversible?: boolean;
  reason?: string;
}

const PREFIX = "SC_HISTORY_V1:";

export function encodeHistoryNotes(notes: string | undefined, metadata?: HistoryMetadata): string | undefined {
  if (!metadata) return notes;
  const envelope = encodeURIComponent(JSON.stringify(metadata));
  return `${notes ?? ""}${notes ? " | " : ""}${PREFIX}${envelope}`;
}

export function readHistoryMetadata(item: Pick<HistoryItem, "notes">): HistoryMetadata | null {
  const match = item.notes?.match(new RegExp(`${PREFIX}([^\\s]+)`));
  if (!match) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    if (!parsed || typeof parsed !== "object" || typeof parsed.category !== "string") return null;
    return parsed as HistoryMetadata;
  } catch {
    return null;
  }
}

export function displayHistoryNotes(notes?: string): string | undefined {
  if (!notes) return notes;
  const visible = notes.split(` | ${PREFIX}`)[0].trim();
  return visible || undefined;
}

export function isValidTargetId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
}