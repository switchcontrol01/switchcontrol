import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, isNoDbMode } from "../db";
import { storage } from "../storage";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

export type CleanMode = "safe" | "advanced";
export type CleanCategory = "storage" | "privacy" | "latency" | "performance";
export type CleanItemRisk = "safe" | "moderate" | "advanced";
export type CleanStatus = "cleaned" | "partial" | "nothing" | "failed" | "verification-failed" | "unsupported";

export interface CleanItemDef {
  id: string;
  name: string;
  description: string;
  category: CleanCategory;
  risk: CleanItemRisk;
  impactRam: number;
  impactBootSec: number;
  requiresAdmin: boolean;
  requiresRestart: boolean;
  estimateBasis: string;
  diskBased: boolean;
}

// ── Canonical item registry ───────────────────────────────────────────────────

const ITEM_REGISTRY: CleanItemDef[] = [
  {
    id: "windows_temp",
    name: "Windows Temp Files",
    description: "System (%WINDIR%\\Temp) and user (%TEMP%) temporary files. Safe to delete — Windows recreates them as needed.",
    category: "storage",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from system and user temp directories.",
    diskBased: true,
  },
  {
    id: "update_downloads",
    name: "Windows Update Download Cache",
    description: "Downloaded update packages in SoftwareDistribution\\Download. Safe after updates complete — Windows re-downloads if needed.",
    category: "storage",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes from SoftwareDistribution\\Download.",
    diskBased: true,
  },
  {
    id: "crash_dumps",
    name: "Crash Dumps",
    description: "Memory minidumps and kernel crash artifacts from previous crashes. No value after investigation.",
    category: "storage",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Minidump and LiveKernelReports folders.",
    diskBased: true,
  },
  {
    id: "wer_reports",
    name: "Windows Error Reports",
    description: "Archived error and crash reports stored by Windows Error Reporting. Not needed after submission.",
    category: "storage",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from WER report archive folders.",
    diskBased: true,
  },
  {
    id: "thumbcache",
    name: "Thumbnail Cache",
    description: "Explorer thumbnail database files. Windows rebuilds on demand. Clears stale previews.",
    category: "privacy",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes of thumbcache_*.db files.",
    diskBased: true,
  },
  {
    id: "recent_files",
    name: "Recent Files List",
    description: "Shell shortcut (.lnk) files in the Recent folder. Clears the quick-access recent list.",
    category: "privacy",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file count of .lnk files in Recent folder.",
    diskBased: false,
  },
  {
    id: "discord_cache",
    name: "Discord Cache",
    description: "Discord web cache, code cache, and GPU cache. Discord rebuilds automatically — safe to wipe.",
    category: "latency",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Discord cache directories.",
    diskBased: true,
  },
  {
    id: "steam_htmlcache",
    name: "Browser & Web Caches",
    description: "Steam HTML cache and Windows INet cache. Rebuilt on next use — no data loss.",
    category: "latency",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Steam htmlcache and INetCache.",
    diskBased: true,
  },
  {
    id: "shader_cache",
    name: "GPU Shader Caches",
    description: "NVIDIA DXCache, GLCache, AMD DxCache, and D3D shader caches. Recompiled on next game launch. Moderate risk — may cause stutters on first run after cleaning.",
    category: "latency",
    risk: "moderate",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from GPU shader cache directories.",
    diskBased: true,
  },
  {
    id: "anticheat_temp",
    name: "Anti-Cheat Temp Files",
    description: "EasyAntiCheat, Vanguard, and BattlEye temp directories. Re-created on game launch.",
    category: "latency",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from known anti-cheat temp folders.",
    diskBased: true,
  },
  {
    id: "dns_cache",
    name: "DNS Cache",
    description: "DNS resolver cache (in-memory). Flushed via ipconfig /flushdns. May briefly slow name resolution on first requests after cleaning.",
    category: "latency",
    risk: "safe",
    impactRam: 4,
    impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Count of cached DNS entries. RAM estimate is conservative (4MB max).",
    diskBased: false,
  },
  {
    id: "dead_startup_entries",
    name: "Dead Startup Entries",
    description: "Registry startup entries pointing to executables that no longer exist. Each entry adds a small boot-time lookup cost.",
    category: "performance",
    risk: "safe",
    impactRam: 0, impactBootSec: 0.3,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Per-entry boot overhead: ~0.3s conservative estimate per dead entry.",
    diskBased: false,
  },
  {
    id: "event_logs_old",
    name: "Non-Critical Event Log Archives",
    description: "Archived Windows event log files (excluding System, Application, Security, Setup). Safe on most systems.",
    category: "performance",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes from non-critical .evtx log files.",
    diskBased: true,
  },
];

// ── Mode filtering ────────────────────────────────────────────────────────────

function getItemsForMode(mode: CleanMode): CleanItemDef[] {
  if (mode === "advanced") return ITEM_REGISTRY;
  return ITEM_REGISTRY.filter(i => i.risk === "safe");
}

// ── DB init ───────────────────────────────────────────────────────────────────

async function initTable() {
  if (isNoDbMode || !db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cleaner_history (
      id            SERIAL PRIMARY KEY,
      user_id       TEXT NOT NULL DEFAULT '__legacy__',
      scan_mode     TEXT NOT NULL DEFAULT 'safe',
      item_ids      JSONB NOT NULL DEFAULT '[]',
      bytes_removed BIGINT NOT NULL DEFAULT 0,
      files_removed INT NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'cleaned',
      scan_results  JSONB,
      clean_results JSONB,
      errors        INT NOT NULL DEFAULT 0,
      ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add user_id to any pre-existing table
  await db.execute(sql`ALTER TABLE cleaner_history ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '__legacy__'`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cleaner_scan_history (
      id              SERIAL PRIMARY KEY,
      user_id         TEXT NOT NULL DEFAULT '__legacy__',
      scan_mode       TEXT NOT NULL DEFAULT 'safe',
      total_bytes     BIGINT NOT NULL DEFAULT 0,
      total_files     INT NOT NULL DEFAULT 0,
      found_count     INT NOT NULL DEFAULT 0,
      category_totals JSONB,
      ran_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`ALTER TABLE cleaner_scan_history ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '__legacy__'`);
}

initTable().catch(e => console.error("[Cleaner] table init failed:", e.message));

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/cleaner/categories?mode=safe|advanced
router.get("/categories", (req, res) => {
  const mode = (req.query.mode as CleanMode) ?? "safe";
  const items = getItemsForMode(mode);
  const categories: Record<CleanCategory, any[]> = {
    storage: [], privacy: [], latency: [], performance: [],
  };
  for (const item of items) {
    const { id, name, description, category, risk, impactRam, impactBootSec,
      requiresAdmin, requiresRestart, estimateBasis, diskBased } = item;
    categories[category].push({
      id, name, description, category, risk, impactRam, impactBootSec,
      requiresAdmin, requiresRestart, estimateBasis, diskBased,
      defaultSelected: risk === "safe",
    });
  }
  res.json({ ok: true, mode, categories });
});

// POST /api/cleaner/scan
// Body: { mode, electronResults }
router.post("/scan", async (req: any, res) => {
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  const { mode = "safe", electronResults = {} } = req.body as {
    mode?: CleanMode;
    electronResults?: Record<string, { sizeBytes?: number; fileCount?: number; found?: boolean; error?: string }>;
  };

  const items = getItemsForMode(mode as CleanMode);
  const findings: Record<string, any> = {};

  let totalBytes = 0;
  let totalFiles = 0;

  for (const item of items) {
    const er = electronResults[item.id];
    if (!er) {
      findings[item.id] = {
        id: item.id, sizeBytes: 0, fileCount: 0, found: false,
        scanStatus: "pending", impactBootSec: 0, impactRamMb: 0,
      };
      continue;
    }

    const sizeBytes = er.sizeBytes ?? 0;
    const fileCount = er.fileCount ?? 0;
    const found     = er.found ?? (fileCount > 0 || sizeBytes > 0);
    const hasError  = !!er.error;

    let impactBootSec = 0, impactRamMb = 0;
    if (item.id === "dead_startup_entries" && found) impactBootSec = +(fileCount * item.impactBootSec).toFixed(1);
    if (item.id === "dns_cache" && found) impactRamMb = Math.min(item.impactRam, fileCount > 0 ? 4 : 0);
    if (item.diskBased) { totalBytes += sizeBytes; totalFiles += fileCount; }

    findings[item.id] = {
      id: item.id, sizeBytes, fileCount, found,
      scanStatus: hasError ? "error" : "scanned",
      error: er.error, impactBootSec, impactRamMb,
    };
  }

  const categoryTotals: Record<string, { sizeBytes: number; fileCount: number; itemCount: number }> = {
    storage: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
    privacy: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
    latency: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
    performance: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
  };
  for (const item of items) {
    const f = findings[item.id];
    if (f?.found) {
      categoryTotals[item.category].sizeBytes += f.sizeBytes ?? 0;
      categoryTotals[item.category].fileCount += f.fileCount ?? 0;
      categoryTotals[item.category].itemCount += 1;
    }
  }

  const totalBootSec = Object.values(findings).reduce((a: number, f: any) => a + (f.impactBootSec ?? 0), 0);
  const totalRamMb   = Object.values(findings).reduce((a: number, f: any) => a + (f.impactRamMb ?? 0), 0);
  const foundCount   = Object.values(findings).filter((f: any) => f.found).length;

  // Persist scan summary to scan history
  if (!isNoDbMode && db) {
    db.execute(sql`
      INSERT INTO cleaner_scan_history
        (user_id, scan_mode, total_bytes, total_files, found_count, category_totals)
      VALUES
        (${userId}, ${mode}, ${totalBytes}, ${totalFiles}, ${foundCount}, ${JSON.stringify(categoryTotals)})
    `).catch(e => console.warn("[Cleaner] scan history insert failed:", e.message));
  }

  res.json({
    ok: true, mode, findings, categoryTotals,
    summary: {
      totalBytes, totalFiles,
      totalBootSec: +totalBootSec.toFixed(1),
      totalRamMb, foundCount,
    },
  });
});

// POST /api/cleaner/clean
router.post("/clean", async (req: any, res) => {
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  const { mode = "safe", itemIds = [], electronResults = {} } = req.body as {
    mode?: CleanMode;
    itemIds?: string[];
    electronResults?: Record<string, { bytesRemoved?: number; filesRemoved?: number; failed?: number; error?: string }>;
  };

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ ok: false, error: "No items specified" });
  }

  const results: Record<string, {
    id: string; status: CleanStatus;
    bytesRemoved: number; filesRemoved: number; error?: string;
  }> = {};

  let totalBytesRemoved = 0, totalFilesRemoved = 0, errors = 0;

  for (const itemId of itemIds) {
    const def = ITEM_REGISTRY.find(i => i.id === itemId);
    if (!def) {
      results[itemId] = { id: itemId, status: "unsupported", bytesRemoved: 0, filesRemoved: 0 };
      continue;
    }

    const er = electronResults[itemId];
    let status: CleanStatus = "cleaned";
    let bytesRemoved = 0, filesRemoved = 0;
    let error: string | undefined;

    if (er) {
      bytesRemoved = er.bytesRemoved ?? 0;
      filesRemoved = er.filesRemoved ?? 0;
      const failed = er.failed ?? 0;
      error        = er.error;

      if (error || (failed > 0 && filesRemoved === 0)) { status = "failed"; errors++; }
      else if (filesRemoved === 0 && bytesRemoved === 0) status = "nothing";
      else if (failed > 0) status = "partial";
      else status = "cleaned";
    }

    totalBytesRemoved += bytesRemoved;
    totalFilesRemoved += filesRemoved;
    results[itemId] = { id: itemId, status, bytesRemoved, filesRemoved, error };
  }

  if (!isNoDbMode && db) {
    await db.execute(sql`
      INSERT INTO cleaner_history
        (user_id, scan_mode, item_ids, bytes_removed, files_removed, status, clean_results, errors)
      VALUES
        (${userId}, ${mode}, ${JSON.stringify(itemIds)}, ${totalBytesRemoved}, ${totalFilesRemoved},
         ${errors > 0 ? "partial" : "cleaned"}, ${JSON.stringify(results)}, ${errors})
    `).catch(e => console.error("[Cleaner] history insert failed:", e.message));
  }

  const successCount = Object.values(results).filter(r => r.status === "cleaned" || r.status === "partial").length;
  const nothingCount = Object.values(results).filter(r => r.status === "nothing").length;

  storage.getOrCreateSettings(userId).then(s => storage.addHistory({
    settingsId: s.id,
    action: `Cleaner: ${successCount} item${successCount !== 1 ? "s" : ""} cleaned`,
    page: "Cleaner",
    result: errors > 0 ? "Partial" : successCount > 0 ? "Cleaned" : "Nothing Found",
    notes: `${totalFilesRemoved} file${totalFilesRemoved !== 1 ? "s" : ""} removed, ${(totalBytesRemoved / 1024 / 1024).toFixed(1)} MB freed`,
  })).catch(() => {});

  res.json({
    ok: true, results,
    summary: { totalBytesRemoved, totalFilesRemoved, successCount, nothingCount, errors },
  });
});

// POST /api/cleaner/verify
router.post("/verify", (req, res) => {
  const { electronResults = {} } = req.body as {
    electronResults?: Record<string, { sizeBytes?: number; fileCount?: number; found?: boolean }>;
  };

  const verifications: Record<string, { id: string; verified: boolean; remainingBytes: number }> = {};
  for (const [id, er] of Object.entries(electronResults)) {
    const stillPresent = (er.sizeBytes ?? 0) > 0 || (er.fileCount ?? 0) > 0;
    verifications[id] = { id, verified: !stillPresent, remainingBytes: er.sizeBytes ?? 0 };
  }
  res.json({ ok: true, verifications });
});

// GET /api/cleaner/history
router.get("/history", async (req: any, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, history: [] });
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  try {
    const rows = await db.execute<{
      id: number; scan_mode: string; item_ids: any; bytes_removed: number;
      files_removed: number; status: string; errors: number; ran_at: string; clean_results: any;
    }>(sql`SELECT id, scan_mode, item_ids, bytes_removed, files_removed, status, errors, ran_at, clean_results
           FROM cleaner_history WHERE user_id = ${userId} ORDER BY ran_at DESC LIMIT 50`);
    res.json({ ok: true, history: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/cleaner/scan-history
router.get("/scan-history", async (req: any, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, history: [] });
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  try {
    const rows = await db.execute<{
      id: number; scan_mode: string; total_bytes: number; total_files: number;
      found_count: number; category_totals: any; ran_at: string;
    }>(sql`SELECT id, scan_mode, total_bytes, total_files, found_count, category_totals, ran_at
           FROM cleaner_scan_history WHERE user_id = ${userId} ORDER BY ran_at ASC LIMIT 30`);
    res.json({ ok: true, history: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
