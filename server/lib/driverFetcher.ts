/**
 * Driver version auto-fetcher.
 *
 * Queries vendor release pages daily and upserts results into the
 * driver_fetch_cache table.  Every fetcher is isolated — a failure in one
 * vendor never blocks the others.  The driver-database route merges cache rows
 * on top of the static DATABASE baseline; admin overrides win above everything.
 *
 * Merge order: static DATABASE < driverFetchCache < driverDbOverrides
 *
 * ── Official sources (verified from Replit datacenter IPs, 2026-11) ─────────
 *
 *  NVIDIA GPU       gfwsl.geforce.com driver lookup JSON (backs nvidia.com/Download)
 *  AMD GPU          amd.com Radeon RX download page — needs a browser UA
 *  AMD Chipset      amd.com AM5 chipset download page — needs a browser UA
 *  Intel GPU/Chipset/Network/Bluetooth
 *                   intel.com download center <meta name="DownloadVersion"> —
 *                   returns 403 to spoofed browser UAs; honest client UA works
 *  Realtek Network  Cloudflare JS-challenge on all Realtek pages; MS Update Catalog
 *                   requires client-side ActiveX/scripting — not accessible server-side
 *  Realtek Audio    Same block as Realtek Network
 */

import { db } from "../db";
import { driverFetchCache, type DriverFetchCache } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  parseAmdAdrenalinPage,
  parseAmdChipsetPage,
  parseIntelDownloadPage,
  parseNvidiaLookup,
} from "./driverSourceParsers";

// ── Shared fetch helpers ───────────────────────────────────────────────────────

/**
 * Browser UA — AMD's CDN drops non-browser clients (connection timeout).
 * Intel's CDN is the opposite: it returns 403 to spoofed browser UAs from
 * datacenter IPs, but serves the page to an honest client identifier.
 */
const UA_BROWSER = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
};

const UA_CLIENT = {
  "User-Agent": "SwitchControl-DriverIntel/1.0 (+https://switchcontrol.org)",
  Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
};

const FETCH_TIMEOUT_MS = 20_000;

function signal(): AbortSignal {
  return AbortSignal.timeout(FETCH_TIMEOUT_MS);
}

interface FetchResult {
  latest: string;
  releaseDate?: string;
  releaseNotes?: string;
  source: string;
}

async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  const r = await fetch(url, { headers, signal: signal() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// ── Vendor fetchers ────────────────────────────────────────────────────────────
// Each fetcher reads one official vendor source and uses a strict parser that
// only accepts explicitly labelled releases (see driverSourceParsers.ts).

/** NVIDIA's official driver lookup service (backs nvidia.com/Download). */
async function fetchNvidiaGpu(): Promise<FetchResult> {
  // psid 131 / pfid 1066 = GeForce RTX desktop; osID 57 = Windows 10/11 64-bit.
  // Game Ready drivers are unified, so one current product returns the branch.
  const url =
    "https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php" +
    "?func=DriverManualLookup&psid=131&pfid=1066&osID=57&languageCode=1033&beta=0&isWHQL=1" +
    "&dltype=-1&dch=1&upCRD=0&qnf=0&sort1=0&numberOfResults=5";
  const r = await fetch(url, {
    headers: { ...UA_CLIENT, Accept: "application/json" },
    signal: signal(),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { ...parseNvidiaLookup(await r.json()), source: "nvidia-driver-lookup" };
}

/** AMD Adrenalin — official Radeon RX download page. */
async function fetchAmdGpu(): Promise<FetchResult> {
  const html = await fetchText(
    "https://www.amd.com/en/support/downloads/drivers.html/graphics/radeon-rx/radeon-rx-7000-series/amd-radeon-rx-7900-xtx.html",
    UA_BROWSER,
  );
  return { ...parseAmdAdrenalinPage(html), source: "amd-downloads-page" };
}

/** AMD Chipset Drivers — official AM5 chipset page (same package for AM4). */
async function fetchAmdChipset(): Promise<FetchResult> {
  const html = await fetchText(
    "https://www.amd.com/en/support/downloads/drivers.html/chipsets/am5/x670e.html",
    UA_BROWSER,
  );
  return { ...parseAmdChipsetPage(html), source: "amd-chipset-page" };
}

async function fetchIntelDownload(id: string, label: string): Promise<FetchResult> {
  const html = await fetchText(
    `https://www.intel.com/content/www/us/en/download/${id}.html`,
    UA_CLIENT,
  );
  return { ...parseIntelDownloadPage(html, label), source: "intel-download-center" };
}

const fetchIntelGpu = () =>
  fetchIntelDownload("785597/intel-arc-graphics-windows", "Intel Arc & Iris Xe Graphics driver");
const fetchIntelChipset = () =>
  fetchIntelDownload("19347/chipset-inf-utility", "Intel Chipset Device Software");
const fetchIntelNetwork = () =>
  fetchIntelDownload("18293/intel-network-adapter-driver-for-windows-10", "Intel Ethernet Adapter package");
const fetchIntelBluetooth = () =>
  fetchIntelDownload(
    "18649/intel-wireless-bluetooth-drivers-for-windows-10-and-windows-11",
    "Intel Wireless Bluetooth package",
  );

/**
 * Realtek PCIe GbE LAN driver — NOT ACCESSIBLE from server-side.
 *
 * All realtek.com pages serve a Cloudflare JS-challenge ("Oops!") to
 * datacenter IPs regardless of User-Agent. The Microsoft Update Catalog
 * requires client-side ActiveX/scripting to render results. No server-
 * accessible alternative source was found that carries a reliable Realtek
 * GbE driver version number.
 *
 * The static DATABASE baseline version is served to end-users. This fetch
 * will fail every run; the error is logged and the last good DB value kept.
 */
async function fetchRealtekNetwork(): Promise<FetchResult> {
  throw new Error(
    "Realtek website is protected by Cloudflare JS-challenge on datacenter IPs " +
    "and the MS Update Catalog requires client-side scripting — no server-accessible source available",
  );
}

/**
 * Realtek HD Audio codec driver — same block as Realtek Network.
 * See fetchRealtekNetwork for full explanation.
 */
async function fetchRealtekAudio(): Promise<FetchResult> {
  throw new Error(
    "Realtek website is protected by Cloudflare JS-challenge on datacenter IPs " +
    "and the MS Update Catalog requires client-side scripting — no server-accessible source available",
  );
}

// ── Fetch registry ─────────────────────────────────────────────────────────────

interface VendorFetchSpec {
  category: string;
  vendorKey: string;
  fetcher: () => Promise<FetchResult>;
}

const VENDOR_FETCHERS: VendorFetchSpec[] = [
  { category: "gpu",       vendorKey: "nvidia",  fetcher: fetchNvidiaGpu },
  { category: "gpu",       vendorKey: "amd",     fetcher: fetchAmdGpu },
  { category: "gpu",       vendorKey: "intel",   fetcher: fetchIntelGpu },
  { category: "chipset",   vendorKey: "intel",   fetcher: fetchIntelChipset },
  { category: "chipset",   vendorKey: "amd",     fetcher: fetchAmdChipset },
  { category: "network",   vendorKey: "intel",   fetcher: fetchIntelNetwork },
  { category: "network",   vendorKey: "realtek", fetcher: fetchRealtekNetwork },
  { category: "audio",     vendorKey: "realtek", fetcher: fetchRealtekAudio },
  { category: "bluetooth", vendorKey: "intel",   fetcher: fetchIntelBluetooth },
];

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function upsertCache(
  category: string,
  vendorKey: string,
  values: {
    latest?: string | null;
    releaseDate?: string | null;
    releaseNotes?: string | null;
    source?: string | null;
    error?: string | null;
  },
) {
  const row = {
    category,
    vendorKey,
    latest: values.latest ?? null,
    releaseDate: values.releaseDate ?? null,
    releaseNotes: values.releaseNotes ?? null,
    source: values.source ?? null,
    fetchedAt: new Date(),
    error: values.error ?? null,
  };
  await db
    .insert(driverFetchCache)
    .values(row)
    .onConflictDoUpdate({
      target: [driverFetchCache.category, driverFetchCache.vendorKey],
      set: row,
    });
}

// ── Main run ───────────────────────────────────────────────────────────────────

let lastRunAt: Date | null = null;
let lastRunResults: Record<string, "ok" | "error"> = {};
/**
 * Keeps a successful refresh usable when the optional persistence table is
 * unavailable (Electron/no-DB mode, or a deployment waiting for migration).
 * The database remains the durable source whenever it is available.
 */
const runtimeFetchCache = new Map<string, DriverFetchCache>();
let cachePersistenceUnavailable = false;

function cacheKey(category: string, vendorKey: string): string {
  return `${category}:${vendorKey}`;
}

function runtimeRow(
  category: string,
  vendorKey: string,
  values: Partial<Pick<DriverFetchCache, "latest" | "releaseDate" | "releaseNotes" | "source" | "error">>,
): DriverFetchCache {
  const previous = runtimeFetchCache.get(cacheKey(category, vendorKey));
  const row = {
    id: previous?.id ?? `runtime-${category}-${vendorKey}`,
    category,
    vendorKey,
    latest: values.latest ?? previous?.latest ?? null,
    releaseDate: values.releaseDate ?? previous?.releaseDate ?? null,
    releaseNotes: values.releaseNotes ?? previous?.releaseNotes ?? null,
    source: values.source ?? previous?.source ?? null,
    fetchedAt: new Date(),
    error: values.error ?? null,
  } as DriverFetchCache;
  runtimeFetchCache.set(cacheKey(category, vendorKey), row);
  return row;
}

function mergeRuntimeRows(rows: DriverFetchCache[]): DriverFetchCache[] {
  const byKey = new Map(
    [...runtimeFetchCache.values(), ...rows].map((row) => [
      cacheKey(row.category, row.vendorKey),
      row,
    ]),
  );
  return [...byKey.values()];
}

async function persistCache(
  category: string,
  vendorKey: string,
  values: Parameters<typeof upsertCache>[2],
): Promise<void> {
  runtimeRow(category, vendorKey, values);
  if (cachePersistenceUnavailable || !db) return;
  try {
    await upsertCache(category, vendorKey, values);
  } catch (err: any) {
    cachePersistenceUnavailable = true;
    console.warn(
      `[DriverFetch] Persistent cache unavailable; using runtime cache: ${err?.message ?? String(err)}`,
    );
  }
}

export async function runDriverFetch(): Promise<void> {
  console.log("[DriverFetch] Starting driver version fetch run…");
  const results: Record<string, "ok" | "error"> = {};

  await Promise.allSettled(
    VENDOR_FETCHERS.map(async ({ category, vendorKey, fetcher }) => {
      const key = `${category}:${vendorKey}`;
      try {
        const result = await fetcher();
        await persistCache(category, vendorKey, {
          latest: result.latest,
          releaseDate: result.releaseDate,
          releaseNotes: result.releaseNotes,
          source: result.source,
          error: null,
        });
        console.log(`[DriverFetch] ✓ ${key} → ${result.latest}`);
        results[key] = "ok";
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        console.warn(`[DriverFetch] ✗ ${key} — ${msg}`);

        // On error: preserve the last successful latest version and only
        // update the error message + fetchedAt timestamp.
        try {
          let existing: DriverFetchCache[] = [];
          if (!cachePersistenceUnavailable && db) {
            try {
              existing = await db
                .select()
                .from(driverFetchCache)
                .where(
                  and(
                    eq(driverFetchCache.category, category),
                    eq(driverFetchCache.vendorKey, vendorKey),
                  ),
                );
            } catch {
              // A missing/unavailable cache table is expected in a fresh
              // deployment. Do not retry the same failing query for every
              // vendor in this run.
              cachePersistenceUnavailable = true;
            }
          }

          const previous = existing[0] ?? runtimeFetchCache.get(cacheKey(category, vendorKey));
          if (previous?.latest) {
            // Row exists with a good version — keep it, just update error + time.
            await persistCache(category, vendorKey, {
              latest: previous.latest,
              releaseDate: previous.releaseDate,
              releaseNotes: previous.releaseNotes,
              source: previous.source,
              error: msg,
            });
          } else {
            // No previous good row — write error-only row.
            await persistCache(category, vendorKey, { error: msg });
          }
        } catch (dbErr) {
          console.error(`[DriverFetch] Cache write failed for ${key}:`, dbErr);
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
/** Wait 60 s after boot so the DB + server are fully initialised first. */
const STARTUP_DELAY_MS = 60_000;

let _timer: ReturnType<typeof setTimeout> | null = null;

export function initDriverFetchScheduler(): void {
  if (_timer) return; // idempotent — only one scheduler per process
  console.log(
    `[DriverFetch] Scheduler started — first run in ${STARTUP_DELAY_MS / 1000}s, then every 24h`,
  );
  _timer = setTimeout(function tick() {
    runDriverFetch().catch((e) =>
      console.error("[DriverFetch] Unhandled error in scheduled run:", e),
    );
    _timer = setTimeout(tick, FETCH_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

// ── Status (used by the route layer) ──────────────────────────────────────────

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
  if (!db || cachePersistenceUnavailable) {
    return [...runtimeFetchCache.values()];
  }
  try {
    const rows = await db.select().from(driverFetchCache);
    return mergeRuntimeRows(rows);
  } catch (err: any) {
    cachePersistenceUnavailable = true;
    console.warn(
      `[DriverFetch] Persistent cache unavailable; serving runtime cache: ${err?.message ?? String(err)}`,
    );
    return [...runtimeFetchCache.values()];
  }
}
