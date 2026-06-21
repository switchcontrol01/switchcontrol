/**
 * Driver version auto-fetcher.
 *
 * Queries vendor APIs / release pages daily and upserts results into the
 * driver_fetch_cache table.  Every fetcher is isolated: a failure in one
 * vendor never blocks the others.  The /api/driver-intel/database endpoint
 * merges cache rows on top of the static DATABASE baseline, then lets admin
 * overrides win on top of everything.
 *
 * Merge order: static DATABASE < driverFetchCache < driverDbOverrides
 */

import { db } from "../db";
import { driverFetchCache, type DriverFetchCache } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// ── Shared fetch helpers ───────────────────────────────────────────────────────

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const FETCH_TIMEOUT_MS = 20_000;

function timeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

interface FetchResult {
  latest: string;
  releaseDate?: string;
  releaseNotes?: string;
  source: string;
}

// ── Vendor fetchers ────────────────────────────────────────────────────────────

/**
 * NVIDIA Game Ready Driver — uses the official NVIDIA gfwsl JSON API.
 * Reliable public endpoint used by many community tools.
 * pfid=1001 = GeForce desktop family (RTX/GTX). The GRD version is the same
 * for all modern consumer cards.
 */
async function fetchNvidiaGpu(): Promise<FetchResult> {
  const url =
    "https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php" +
    "?func=DriverManualLookup&pfid=1001&osid=57&langid=1&isWhql=1&dch=1&sort1=0&numberOfResults=1";
  const r = await fetch(url, { headers: UA, signal: timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json: any = await r.json();
  if (!json.Success || !json.IDS?.[0]?.downloadInfo?.Version) {
    throw new Error("Unexpected NVIDIA API response shape");
  }
  const info = json.IDS[0].downloadInfo;
  const version: string = info.Version; // e.g. "576.80"
  // ReleaseDateTime: "2026.06.10 16:14" → "2026-06-10"
  const releaseDate: string | undefined = info.ReleaseDateTime
    ? info.ReleaseDateTime.slice(0, 10).replace(/\./g, "-")
    : undefined;
  return {
    latest: version,
    releaseDate,
    source: "nvidia-gfwsl-api",
  };
}

/**
 * AMD Adrenalin GPU driver — scrapes AMD's support RSS feed.
 * AMD's web app is a React SPA so HTML scraping is fragile; the RSS feed is
 * more stable and server-rendered.
 */
async function fetchAmdGpu(): Promise<FetchResult> {
  // AMD publishes a support RSS; titles contain "Adrenalin Edition X.Y.Z".
  const url = "https://www.amd.com/en/support/downloads/drivers.html/graphics/radeon-rx/radeon-rx-7000-series/amd-radeon-rx-7900-xtx.html";
  const r = await fetch(url, { headers: UA, signal: timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  // Look for version patterns like "25.6.1" or "25.10.1" in the page
  const versionMatch =
    html.match(/Adrenalin(?:\s+Edition)?\s+(\d{2,}\.\d+\.\d+)/i) ||
    html.match(/"version"\s*:\s*"(\d{2,}\.\d+\.\d+)"/) ||
    html.match(/(\d{2,}\.\d+\.\d+)\s*(?:WHQL|Release)/i);
  if (!versionMatch) throw new Error("AMD version not found in page");

  // Look for a date nearby
  const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})/);
  return {
    latest: versionMatch[1],
    releaseDate: dateMatch?.[1],
    source: "amd-downloads-page",
  };
}

/**
 * Intel Arc / Iris Xe GPU driver — scrapes Intel's Arc driver download page.
 * The version appears in the page heading and meta description.
 */
async function fetchIntelGpu(): Promise<FetchResult> {
  const url =
    "https://www.intel.com/content/www/us/en/download/785597/intel-arc-iris-xe-graphics-windows.html";
  const r = await fetch(url, { headers: UA, signal: timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  // Intel GPU driver version looks like "32.0.101.6790" (4-part) or "101.6790" (2-part)
  const m =
    html.match(/(\d{2,3}\.\d+\.\d+\.\d{4})/i) ||
    html.match(/Version[^0-9]*(\d{2,3}\.\d+\.\d+\.\d{4})/i);
  if (!m) throw new Error("Intel GPU version not found");

  const dateM = html.match(/(\d{4}-\d{2}-\d{2})/);
  return {
    latest: m[1],
    releaseDate: dateM?.[1],
    source: "intel-download-center",
  };
}

/**
 * Intel Chipset Device Software — scrapes the Intel chipset download page.
 */
async function fetchIntelChipset(): Promise<FetchResult> {
  const url =
    "https://www.intel.com/content/www/us/en/download/19347/intel-chipset-device-software-inf-utility.html";
  const r = await fetch(url, { headers: UA, signal: timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  // Chipset version looks like "10.1.19444.8378"
  const m = html.match(/(\d{1,2}\.\d+\.\d{5,}\.\d+)/);
  if (!m) throw new Error("Intel Chipset version not found");

  const dateM = html.match(/(\d{4}-\d{2}-\d{2})/);
  return {
    latest: m[1],
    releaseDate: dateM?.[1],
    source: "intel-download-center",
  };
}

/**
 * AMD Chipset driver — scrapes AMD's chipset software download page.
 */
async function fetchAmdChipset(): Promise<FetchResult> {
  const url =
    "https://www.amd.com/en/support/downloads/drivers.html/chipset/amd-socket-am5/amd-x670e-chipset.html";
  const r = await fetch(url, { headers: UA, signal: timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  // AMD chipset version: "7.10.13.408" or similar
  const m =
    html.match(/(\d+\.\d+\.\d+\.\d+)/) ||
    html.match(/Chipset[^0-9]*(\d+\.\d+\.\d+)/i);
  if (!m) throw new Error("AMD Chipset version not found");

  const dateM = html.match(/(\d{4}-\d{2}-\d{2})/);
  return {
    latest: m[1],
    releaseDate: dateM?.[1],
    source: "amd-downloads-page",
  };
}

/**
 * Intel Network Adapter driver — scrapes Intel's network adapter download page.
 */
async function fetchIntelNetwork(): Promise<FetchResult> {
  const url =
    "https://www.intel.com/content/www/us/en/download/18293/intel-network-adapter-driver-for-windows-10.html";
  const r = await fetch(url, { headers: UA, signal: timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  // Version like "29.3" or "29.3.1"
  const m = html.match(/Version[^0-9]*(\d{2,}\.\d+(?:\.\d+)?)\b/i) ||
    html.match(/\b(\d{2,}\.\d+)\s+\(/);
  if (!m) throw new Error("Intel Network version not found");

  const dateM = html.match(/(\d{4}-\d{2}-\d{2})/);
  return {
    latest: m[1],
    releaseDate: dateM?.[1],
    source: "intel-download-center",
  };
}

// ── Fetch registry ─────────────────────────────────────────────────────────────

interface VendorFetchSpec {
  category: string;
  vendorKey: string;
  fetcher: () => Promise<FetchResult>;
}

const VENDOR_FETCHERS: VendorFetchSpec[] = [
  { category: "gpu", vendorKey: "nvidia", fetcher: fetchNvidiaGpu },
  { category: "gpu", vendorKey: "amd", fetcher: fetchAmdGpu },
  { category: "gpu", vendorKey: "intel", fetcher: fetchIntelGpu },
  { category: "chipset", vendorKey: "intel", fetcher: fetchIntelChipset },
  { category: "chipset", vendorKey: "amd", fetcher: fetchAmdChipset },
  { category: "network", vendorKey: "intel", fetcher: fetchIntelNetwork },
];

// ── Upsert helpers ─────────────────────────────────────────────────────────────

async function upsertCache(
  category: string,
  vendorKey: string,
  result: Partial<FetchResult> & { error?: string },
) {
  const values = {
    category,
    vendorKey,
    latest: result.latest ?? null,
    releaseDate: result.releaseDate ?? null,
    releaseNotes: result.releaseNotes ?? null,
    source: result.source ?? null,
    fetchedAt: new Date(),
    error: result.error ?? null,
  };
  await db
    .insert(driverFetchCache)
    .values(values)
    .onConflictDoUpdate({
      target: [driverFetchCache.category, driverFetchCache.vendorKey],
      set: values,
    });
}

// ── Main run ───────────────────────────────────────────────────────────────────

let lastRunAt: Date | null = null;
let lastRunResults: Record<string, "ok" | "error"> = {};

export async function runDriverFetch(): Promise<void> {
  console.log("[DriverFetch] Starting driver version fetch run…");
  const results: Record<string, "ok" | "error"> = {};

  await Promise.allSettled(
    VENDOR_FETCHERS.map(async ({ category, vendorKey, fetcher }) => {
      const key = `${category}:${vendorKey}`;
      try {
        const result = await fetcher();
        await upsertCache(category, vendorKey, result);
        console.log(`[DriverFetch] ✓ ${key} → ${result.latest}`);
        results[key] = "ok";
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        console.warn(`[DriverFetch] ✗ ${key} — ${msg}`);
        // Preserve the last successful latest; only update error + timestamp.
        try {
          const existing = await db
            .select()
            .from(driverFetchCache)
            .where(
              and(
                eq(driverFetchCache.category, category),
                eq(driverFetchCache.vendorKey, vendorKey),
              ),
            );
          if (existing.length) {
            await db
              .insert(driverFetchCache)
              .values({
                category,
                vendorKey,
                latest: existing[0].latest,
                releaseDate: existing[0].releaseDate,
                releaseNotes: existing[0].releaseNotes,
                source: existing[0].source,
                fetchedAt: new Date(),
                error: msg,
              })
              .onConflictDoUpdate({
                target: [driverFetchCache.category, driverFetchCache.vendorKey],
                set: { fetchedAt: new Date(), error: msg },
              });
          } else {
            await upsertCache(category, vendorKey, { error: msg });
          }
        } catch (dbErr) {
          console.error(`[DriverFetch] DB write failed for ${key}:`, dbErr);
        }
        results[key] = "error";
      }
    }),
  );

  lastRunAt = new Date();
  lastRunResults = results;
  const ok = Object.values(results).filter((v) => v === "ok").length;
  const total = VENDOR_FETCHERS.length;
  console.log(`[DriverFetch] Run complete — ${ok}/${total} succeeded`);
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

const FETCH_INTERVAL_MS = 24 * 60 * 60 * 1_000; // 24 hours
const STARTUP_DELAY_MS = 60_000; // wait 60s after boot before first fetch

let _timer: ReturnType<typeof setTimeout> | null = null;

export function initDriverFetchScheduler(): void {
  if (_timer) return; // already started
  console.log(`[DriverFetch] Scheduler started — first run in ${STARTUP_DELAY_MS / 1000}s, then every 24h`);
  _timer = setTimeout(function tick() {
    runDriverFetch().catch((e) =>
      console.error("[DriverFetch] Unhandled error in run:", e),
    );
    _timer = setTimeout(tick, FETCH_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

// ── Status / cache read (used by the route layer) ─────────────────────────────

export function getFetchSchedulerStatus() {
  return {
    lastRunAt: lastRunAt?.toISOString() ?? null,
    lastRunResults,
    nextRunInMs: _timer ? FETCH_INTERVAL_MS : null,
    vendorCount: VENDOR_FETCHERS.length,
    vendors: VENDOR_FETCHERS.map((v) => `${v.category}:${v.vendorKey}`),
  };
}

export async function loadFetchCache(): Promise<DriverFetchCache[]> {
  try {
    return await db.select().from(driverFetchCache);
  } catch {
    return [];
  }
}
