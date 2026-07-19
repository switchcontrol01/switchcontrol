  import { Router, Request, Response } from "express";
  import { db } from "../db";
  import {
    driverHistory,
    insertDriverHistorySchema,
    driverDbOverrides,
    insertDriverDbOverrideSchema,
    type DriverDbOverride,
  } from "@shared/schema";
  import { eq, and, desc } from "drizzle-orm";
  import { requireJwt } from "../middleware/requireCloudAuth";
  import { requireAdmin } from "../middleware/requireAdmin";
  import {
    loadFetchCache,
    getFetchSchedulerStatus,
    runDriverFetch,
  } from "../lib/driverFetcher";
  
  /**
   * Driver Intelligence — cloud driver / firmware reference database.
   *
   * This is a SERVER-MAINTAINED static database of latest known driver and
   * firmware versions. It is NEVER live-scraped from vendor sites at request
   * time. The client compares the user's locally-detected versions against
   * this database to decide healthy / outdated / critical.
   *
   * The endpoint exposes reference data only (no user data), so it is left
   * unauthenticated for resilience — the Driver Intelligence page itself is
   * premium-gated on the client. If the cloud is unreachable, the client
   * falls back to its bundled local copy.
   */
  
  const driverIntelRouter = Router();
  
  export type SafetyLevel = "safe" | "caution" | "critical";
  
  export interface DriverDbEntry {
    /** Latest known version / firmware / BIOS string. */
    latest: string;
    /** Human release date (ISO or display). */
    releaseDate?: string;
    /** Short release-note summary. */
    releaseNotes?: string;
    /** Known bugs / regressions worth surfacing. */
    knownIssues?: string[];
    /** Update safety guidance. */
    safety: SafetyLevel;
    /** Emergency-disabled by an admin — clients should warn, not recommend. */
    disabled?: boolean;
    /** True when this entry is an out-of-band hotfix override. */
    hotfix?: boolean;
  }
  
  export interface DriverNewsItem {
    id: string;
    vendor: string;
    category: string;
    title: string;
    summary: string;
    date: string;
    safety: SafetyLevel;
  }
  
  /**
   * Versioned database. `dbVersion` lets the client invalidate its cache when
   * the server data changes. Keys are normalised vendor identifiers.
   */
  const DATABASE = {
    dbVersion: "2026.06.1",
    updatedAt: "2026-06-15",
  
    gpu: {
      nvidia: {
        latest: "576.80",
        releaseDate: "2026-06-10",
        releaseNotes:
          "Game Ready driver. Adds optimisations for recent titles, fixes a DPC latency regression present in 575.x, improves DLSS frame generation stability.",
        knownIssues: [
          "Some users report idle clock fluctuations on multi-monitor high-refresh setups.",
        ],
        safety: "safe",
      } as DriverDbEntry,
      amd: {
        latest: "25.6.1",
        releaseDate: "2026-06-04",
        releaseNotes:
          "Adrenalin Edition. Performance uplift in DX12 titles, fixes for AFMF stutter, improved Radeon Anti-Lag compatibility.",
        knownIssues: ["Anti-Lag may be disabled in select anti-cheat titles."],
        safety: "safe",
      } as DriverDbEntry,
      intel: {
        latest: "32.0.101.6790",
        releaseDate: "2026-05-28",
        releaseNotes:
          "Arc & Iris Xe driver. Game optimisations and DX11 overhead reductions, several application-crash fixes.",
        safety: "safe",
      } as DriverDbEntry,
    },
  
    chipset: {
      amd: {
        latest: "7.10.13.408",
        releaseDate: "2026-05-20",
        releaseNotes:
          "AMD Chipset driver bundle. Updated power plan behaviour, preferred-core (CPPC) scheduling refinements, USB stability fixes.",
        knownIssues: [],
        safety: "safe",
      } as DriverDbEntry,
      intel: {
        latest: "10.1.19444.8378",
        releaseDate: "2026-04-30",
        releaseNotes:
          "Intel Chipset Device Software. Refreshes device identification for current platforms.",
        safety: "safe",
      } as DriverDbEntry,
    },
  
    bios: {
      // Keyed by motherboard manufacturer; latest is illustrative reference.
      gigabyte: {
        latest: "F10",
        releaseDate: "2026-05-12",
        releaseNotes:
          "AGESA ComboAM5 1.2.0.3 — improved memory training, stability for high-frequency EXPO kits, security microcode update.",
        knownIssues: [],
        safety: "caution",
      } as DriverDbEntry,
      asus: {
        latest: "2604",
        releaseDate: "2026-05-08",
        releaseNotes:
          "Updated AGESA microcode, improved fan-curve handling, resolved sporadic POST delay with certain NVMe drives.",
        safety: "caution",
      } as DriverDbEntry,
      msi: {
        latest: "7E12v1H",
        releaseDate: "2026-04-22",
        releaseNotes:
          "Memory compatibility improvements and updated CPU microcode.",
        safety: "caution",
      } as DriverDbEntry,
      asrock: {
        latest: "3.10",
        releaseDate: "2026-04-18",
        releaseNotes: "AGESA update, improved cold-boot reliability.",
        safety: "caution",
      } as DriverDbEntry,
    },
  
    ssd: {
      samsung: {
        latest: "4B2QJXD7",
        releaseNotes:
          "Endurance and power-state stability firmware via Samsung Magician.",
        safety: "caution",
      } as DriverDbEntry,
      crucial: {
        latest: "P9CR40A",
        releaseNotes: "Performance consistency firmware via Crucial Storage Executive.",
        safety: "caution",
      } as DriverDbEntry,
      wd: {
        latest: "731120WD",
        releaseNotes: "Thermal and latency improvements via WD Dashboard.",
        safety: "caution",
      } as DriverDbEntry,
      kingston: {
        latest: "EIFK51.6",
        releaseNotes: "Stability firmware via Kingston SSD Manager.",
        safety: "caution",
      } as DriverDbEntry,
    },
  
    network: {
      intel: {
        latest: "29.3",
        releaseDate: "2026-05-15",
        releaseNotes:
          "Intel Ethernet/Wi-Fi driver. RSS and interrupt-moderation tuning, latency improvements, security fixes.",
        knownIssues: [],
        safety: "safe",
      } as DriverDbEntry,
      realtek: {
        latest: "11.20.0610",
        releaseDate: "2026-06-10",
        releaseNotes:
          "Realtek LAN driver. Reduced CPU overhead at high throughput, fixes for wake-on-LAN.",
        safety: "safe",
      } as DriverDbEntry,
      killer: {
        latest: "3.1.1456",
        releaseDate: "2026-05-02",
        releaseNotes:
          "Killer Performance Suite. Improved traffic prioritisation, lower latency under load.",
        knownIssues: ["Killer Control Center can increase idle CPU; optional install."],
        safety: "caution",
      } as DriverDbEntry,
      qualcomm: {
        latest: "3.3.0.814",
        releaseDate: "2026-05-10",
        releaseNotes:
          "Qualcomm FastConnect driver. Improved Wi-Fi 7 throughput, reduced latency, connection stability fixes.",
        safety: "safe",
      } as DriverDbEntry,
      mediatek: {
        latest: "3.3.0.314",
        releaseDate: "2026-04-20",
        releaseNotes:
          "MediaTek Wi-Fi driver. Connection stability and throughput improvements.",
        safety: "safe",
      } as DriverDbEntry,
      marvell: {
        latest: "3.1.17.172",
        releaseDate: "2026-03-15",
        releaseNotes:
          "Marvell/Aquantia network driver. Multi-gigabit stability and wake-on-LAN fixes.",
        safety: "safe",
      } as DriverDbEntry,
    },
  
    audio: {
      realtek: {
        latest: "6.0.9670.1",
        releaseDate: "2026-05-19",
        releaseNotes:
          "Realtek HD/UAD audio. DPC latency reductions, fixes for crackle on certain motherboards.",
        safety: "safe",
      } as DriverDbEntry,
      steelseries: {
        latest: "GG 90.0",
        releaseNotes: "SteelSeries Sonar / GG engine update.",
        safety: "caution",
      } as DriverDbEntry,
      creative: {
        latest: "6.0.105",
        releaseNotes: "Sound Blaster Command engine update.",
        safety: "caution",
      } as DriverDbEntry,
      logitech: {
        latest: "G HUB 2026.4",
        releaseNotes: "Logitech G HUB driver/firmware bundle.",
        safety: "caution",
      } as DriverDbEntry,
    },
  
    bluetooth: {
      intel: {
        latest: "23.60.0",
        releaseDate: "2026-05-15",
        releaseNotes: "Intel Bluetooth driver. Connection stability and pairing fixes.",
        safety: "safe",
      } as DriverDbEntry,
      realtek: {
        latest: "1.8.1061",
        releaseNotes: "Realtek Bluetooth driver update.",
        safety: "safe",
      } as DriverDbEntry,
      qualcomm: {
        latest: "12.0.0.900",
        releaseDate: "2026-05-08",
        releaseNotes:
          "Qualcomm Bluetooth driver. Fixes pairing drops, audio stutter on BT headsets, and LE Audio stability.",
        safety: "safe",
      } as DriverDbEntry,
      mediatek: {
        latest: "3.3.0.501",
        releaseDate: "2026-04-12",
        releaseNotes: "MediaTek Bluetooth driver. Connection and audio streaming improvements.",
        safety: "safe",
      } as DriverDbEntry,
    },
  };
  
  const NEWS: DriverNewsItem[] = [
    {
      id: "news-nv-57680",
      vendor: "NVIDIA",
      category: "GPU",
      title: "NVIDIA released Game Ready 576.80",
      summary:
        "Fixes a DPC latency regression from the 575 branch and improves frame-generation stability.",
      date: "2026-06-10",
      safety: "safe",
    },
    {
      id: "news-amd-chipset-710",
      vendor: "AMD",
      category: "Chipset",
      title: "AMD chipset 7.10 available",
      summary:
        "Preferred-core scheduling refinements and USB stability fixes for AM5 platforms.",
      date: "2026-05-20",
      safety: "safe",
    },
    {
      id: "news-giga-f10",
      vendor: "Gigabyte",
      category: "BIOS",
      title: "Gigabyte F10 BIOS (AGESA 1.2.0.3)",
      summary:
        "Improved memory training for high-frequency EXPO kits and a security microcode update.",
      date: "2026-05-12",
      safety: "caution",
    },
    {
      id: "news-intel-lan-293",
      vendor: "Intel",
      category: "Network",
      title: "Intel LAN/Wi-Fi 29.3 update",
      summary: "RSS and interrupt-moderation tuning with measurable latency improvements.",
      date: "2026-05-15",
      safety: "safe",
    },
    {
      id: "news-realtek-audio",
      vendor: "Realtek",
      category: "Audio",
      title: "Realtek UAD audio 6.0.9670.1",
      summary: "DPC latency reductions and crackle fixes on select motherboards.",
      date: "2026-05-19",
      safety: "safe",
    },
  ];
  
  // Categories an override row can target — keys present on DATABASE.
  const OVERRIDE_CATEGORIES = [
    "gpu",
    "chipset",
    "bios",
    "ssd",
    "network",
    "audio",
    "bluetooth",
  ] as const;
  type OverrideCategory = (typeof OVERRIDE_CATEGORIES)[number];
  
  /**
   * Build the merged driver database.
   *
   * Layer order (later layers win):
   *   1. Static DATABASE  — hardcoded baseline, always present
   *   2. driverFetchCache — auto-fetched daily from vendor APIs/pages
   *   3. driverDbOverrides — admin corrections / hotfixes / emergency-disables
   *
   * This means:
   *  - Auto-fetched versions automatically surface to users.
   *  - Admins can still push a correction or emergency-disable on top.
   */
  function buildMergedDb(
    fetchRows: import("@shared/schema").DriverFetchCache[],
    overrideRows: DriverDbOverride[],
  ) {
    const merged: any = JSON.parse(JSON.stringify(DATABASE));
    let newestStamp: string | null = null;
  
    // ── Layer 2: auto-fetched cache ──────────────────────────────────────────
    for (const row of fetchRows) {
      const cat = row.category as OverrideCategory;
      if (!OVERRIDE_CATEGORIES.includes(cat)) continue;
      // Only apply if the fetch succeeded (no error + has a version).
      if (row.error || !row.latest) continue;
      const bucket = merged[cat] ?? (merged[cat] = {});
      const existing: DriverDbEntry | undefined = bucket[row.vendorKey];
      const entry: DriverDbEntry = existing ? { ...existing } : { latest: row.latest, safety: "safe" };
      entry.latest = row.latest;
      if (row.releaseDate) entry.releaseDate = row.releaseDate;
      if (row.releaseNotes) entry.releaseNotes = row.releaseNotes;
      bucket[row.vendorKey] = entry;
  
      const stamp = row.fetchedAt instanceof Date ? row.fetchedAt.toISOString() : null;
      if (stamp && (!newestStamp || stamp > newestStamp)) newestStamp = stamp;
    }
  
    // ── Layer 3: admin overrides ──────────────────────────────────────────────
    for (const row of overrideRows) {
      const cat = row.category as OverrideCategory;
      if (!OVERRIDE_CATEGORIES.includes(cat)) continue;
      const bucket = merged[cat] ?? (merged[cat] = {});
      const existing: DriverDbEntry | undefined = bucket[row.vendorKey];
      const entry: DriverDbEntry = existing
        ? { ...existing }
        : { latest: row.latest ?? "unknown", safety: "safe" };
  
      if (row.latest) entry.latest = row.latest;
      if (row.releaseDate) entry.releaseDate = row.releaseDate;
      if (row.releaseNotes) entry.releaseNotes = row.releaseNotes;
      if (row.safety === "safe" || row.safety === "caution" || row.safety === "critical") {
        entry.safety = row.safety;
      }
      if (row.isHotfix) entry.hotfix = true;
  
      if (row.disabled) {
        entry.disabled = true;
        entry.safety = "critical";
        const advisory = `⚠ Admin advisory: ${row.note?.trim() || "This driver has been flagged as problematic. Do not update to it."}`;
        entry.knownIssues = [advisory, ...(entry.knownIssues ?? [])];
      } else if (row.note?.trim()) {
        entry.knownIssues = [row.note.trim(), ...(entry.knownIssues ?? [])];
      }
  
      bucket[row.vendorKey] = entry;
  
      const stamp = row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null;
      if (stamp && (!newestStamp || stamp > newestStamp)) newestStamp = stamp;
    }
  
    // Advance the advertised updatedAt so the 30-day staleness banner reflects
    // the most recent data (whether from auto-fetch or admin curation).
    if (newestStamp && newestStamp.slice(0, 10) > merged.updatedAt) {
      merged.updatedAt = newestStamp.slice(0, 10);
    }
    return merged;
  }
  
  async function loadOverrides(): Promise<DriverDbOverride[]> {
    try {
      return await db.select().from(driverDbOverrides);
    } catch {
      return [];
    }
  }
  
  // GET /api/driver-intel/database — full reference DB (fetch cache + admin overrides)
  driverIntelRouter.get("/database", async (_req: Request, res: Response) => {
    const [fetchRows, overrideRows] = await Promise.all([
      loadFetchCache(),
      loadOverrides(),
    ]);
    // Short cache: auto-fetched data refreshes daily; overrides can change any time.
    res.set("Cache-Control", "public, max-age=300");
    res.json(buildMergedDb(fetchRows, overrideRows));
  });
  
  // GET /api/driver-intel/news — driver news feed
  driverIntelRouter.get("/news", (_req: Request, res: Response) => {
    res.set("Cache-Control", "public, max-age=3600");
    res.json({ items: NEWS, updatedAt: DATABASE.updatedAt });
  });
  
  // ── Driver history / restore points (user-scoped, authenticated) ──────────────
  
  const MAX_HISTORY = 200;
  
  // GET /api/driver-intel/history — current user's driver change timeline
  driverIntelRouter.get(
    "/history",
    requireJwt,
    async (req: Request, res: Response) => {
      const userId = req.cloudUser?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      try {
        const rows = await db
          .select()
          .from(driverHistory)
          .where(eq(driverHistory.userId, userId))
          .orderBy(desc(driverHistory.createdAt))
          .limit(MAX_HISTORY);
        res.json({ items: rows });
      } catch (err: any) {
        res.status(500).json({ error: "Failed to load history" });
      }
    },
  );
  
  // POST /api/driver-intel/history — record a driver change / restore point
  driverIntelRouter.post(
    "/history",
    requireJwt,
    async (req: Request, res: Response) => {
      const userId = req.cloudUser?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      // Server owns userId — never trust a client-provided one.
      const parsed = insertDriverHistorySchema
        .omit({ userId: true })
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid history entry" });
      }
      try {
        const [row] = await db
          .insert(driverHistory)
          .values({ ...parsed.data, userId })
          .returning();
        res.status(201).json(row);
      } catch (err: any) {
        res.status(500).json({ error: "Failed to save history" });
      }
    },
  );
  
  // DELETE /api/driver-intel/history/:id — remove one of the user's own entries
  driverIntelRouter.delete(
    "/history/:id",
    requireJwt,
    async (req: Request, res: Response) => {
      const userId = req.cloudUser?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      try {
        const deleted = await db
          .delete(driverHistory)
          .where(
            and(
              eq(driverHistory.id, req.params.id),
              eq(driverHistory.userId, userId),
            ),
          )
          .returning({ id: driverHistory.id });
        if (deleted.length === 0) {
          return res.status(404).json({ error: "Not found" });
        }
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: "Failed to delete history" });
      }
    },
  );
  
  // ── Admin: driver database control plane (admin-only) ─────────────────────────
  
  // GET /api/driver-intel/admin/fetch-status — auto-fetch scheduler status + cache rows
  driverIntelRouter.get(
    "/admin/fetch-status",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const schedulerStatus = getFetchSchedulerStatus();
        const cacheRows = await loadFetchCache();
        res.json({ ...schedulerStatus, cache: cacheRows });
      } catch (err) {
        res.status(500).json({ error: "Failed to load fetch status" });
      }
    },
  );
  
  // POST /api/driver-intel/admin/fetch-now — trigger an immediate fetch run
  driverIntelRouter.post(
    "/admin/fetch-now",
    requireAdmin,
    async (_req: Request, res: Response) => {
      // Fire-and-forget — the fetch can take up to 20s per vendor.
      runDriverFetch().catch((e) =>
        console.error("[driverIntel] manual fetch-now error:", e),
      );
      res.json({ ok: true, message: "Fetch triggered — results will appear in fetch-status within ~30s." });
    },
  );
  
  // GET /api/driver-intel/admin/overview — DB freshness, vendor statuses, stats
  driverIntelRouter.get(
    "/admin/overview",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const [fetchRows, overrides] = await Promise.all([loadFetchCache(), loadOverrides()]);
        const merged = buildMergedDb(fetchRows, overrides);
  
        const ageDays = Math.floor(
          (Date.now() - new Date(merged.updatedAt).getTime()) / 86_400_000,
        );
  
        // Per-vendor status across every category in the merged DB.
        const vendors: Array<{
          category: string;
          vendorKey: string;
          latest: string;
          safety: SafetyLevel;
          disabled: boolean;
          hotfix: boolean;
          overridden: boolean;
        }> = [];
        for (const cat of OVERRIDE_CATEGORIES) {
          const bucket = merged[cat] ?? {};
          for (const [vendorKey, entry] of Object.entries(bucket) as [
            string,
            DriverDbEntry,
          ][]) {
            vendors.push({
              category: cat,
              vendorKey,
              latest: entry.latest,
              safety: entry.safety,
              disabled: !!entry.disabled,
              hotfix: !!entry.hotfix,
              overridden: overrides.some(
                (o) => o.category === cat && o.vendorKey === vendorKey,
              ),
            });
          }
        }
  
        res.json({
          dbVersion: merged.dbVersion,
          updatedAt: merged.updatedAt,
          baseUpdatedAt: DATABASE.updatedAt,
          ageDays,
          stale: ageDays > 30,
          stats: {
            vendorCount: vendors.length,
            overrideCount: overrides.length,
            hotfixCount: overrides.filter((o) => o.isHotfix).length,
            disabledCount: overrides.filter((o) => o.disabled).length,
          },
          vendors,
        });
      } catch (err) {
        console.error("[driverIntel] admin overview error:", err);
        res.status(500).json({ error: "Failed to load overview" });
      }
    },
  );
  
  // GET /api/driver-intel/admin/overrides — list raw override rows
  driverIntelRouter.get(
    "/admin/overrides",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const rows = await db
          .select()
          .from(driverDbOverrides)
          .orderBy(desc(driverDbOverrides.updatedAt));
        res.json({ items: rows });
      } catch (err) {
        res.status(500).json({ error: "Failed to load overrides" });
      }
    },
  );
  
  // POST /api/driver-intel/admin/overrides — upsert an override / hotfix / disable
  driverIntelRouter.post(
    "/admin/overrides",
    requireAdmin,
    async (req: Request, res: Response) => {
      const admin = (req as any).adminUser as { id: string } | undefined;
      const parsed = insertDriverDbOverrideSchema
        .omit({ updatedBy: true })
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid override" });
      }
      if (!OVERRIDE_CATEGORIES.includes(parsed.data.category as OverrideCategory)) {
        return res.status(400).json({ error: "Unknown category" });
      }
      try {
        // Normalise the merge key server-side so it always lines up with the
        // database keys the scanner/UI use, regardless of admin input casing.
        const category = parsed.data.category.trim().toLowerCase();
        const vendorKey = parsed.data.vendorKey.trim().toLowerCase();
        const values = { ...parsed.data, category, vendorKey, updatedBy: admin?.id ?? null };
        // Atomic upsert — one override per (category, vendorKey). The unique index
        // backs ON CONFLICT, so concurrent writes can't create duplicate rows.
        const { id: _omit, ...updateSet } = { ...values, updatedAt: new Date() } as any;
        const [row] = await db
          .insert(driverDbOverrides)
          .values(values)
          .onConflictDoUpdate({
            target: [driverDbOverrides.category, driverDbOverrides.vendorKey],
            set: updateSet,
          })
          .returning();
        res.status(201).json(row);
      } catch (err) {
        console.error("[driverIntel] upsert override error:", err);
        res.status(500).json({ error: "Failed to save override" });
      }
    },
  );
  
  // DELETE /api/driver-intel/admin/overrides/:id — remove an override
  driverIntelRouter.delete(
    "/admin/overrides/:id",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const deleted = await db
          .delete(driverDbOverrides)
          .where(eq(driverDbOverrides.id, req.params.id))
          .returning({ id: driverDbOverrides.id });
        if (deleted.length === 0) {
          return res.status(404).json({ error: "Not found" });
        }
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: "Failed to delete override" });
      }
    },
  );
  
  export default driverIntelRouter;
  