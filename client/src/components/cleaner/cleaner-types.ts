// ── Shared types & helpers for System Cleaner components ──────────────────────
// Extracted to break circular dependencies between cleaner components.

export interface ScanSummary {
  totalBytes: number;
  totalFiles: number;
  totalBootSec: number;
  totalRamMb: number;
  foundCount: number;
}

export interface ScanHistoryEntry {
  id: number;
  scan_mode: string;
  total_bytes: number;
  total_files: number;
  found_count: number;
  category_totals?: Record<string, { sizeBytes: number; fileCount: number; itemCount: number }>;
  ran_at: string;
}

export interface HistoryEntry {
  id: number;
  scan_mode: string;
  item_ids: string[];
  bytes_removed: number;
  files_removed: number;
  status: string;
  errors: number;
  ran_at: string;
  clean_results?: Record<string, { id: string; status: string; bytesRemoved: number; filesRemoved: number }>;
}

export interface ScanFinding {
  id: string;
  sizeBytes: number;
  fileCount: number;
  found: boolean;
  scanStatus: string;
}

export interface CleanItemDef {
  id: string;
  name: string;
  category: string;
  diskBased: boolean;
}

export function fmtBytes(b: number): string {
  if (b === 0) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
