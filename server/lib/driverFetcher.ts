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
 * ── Vendor accessibility notes (Replit datacenter IPs, 2026-07) ──────────────
 *
 *  NVIDIA GPU       developer.nvidia.com/vulkan-driver — static HTML, no bot gate
 *  AMD GPU          amd.com product page — static HTML, publicly accessible
 *  AMD Chipset      amd.com/en/support/downloads/drivers.html — static, accessible
 *  Intel GPU        intel.com download center — requires XHR headers to unlock 200
 *  Intel Chipset    intel.com download center — same XHR unlock
 *  Intel Network    intel.com download center — same XHR unlock
 *  Intel Bluetooth  intel.com download center — same XHR unlock
 *  Realtek Network  Cloudflare JS-challenge on all Realtek pages; MS Update Catalog
 *                   requires client-side ActiveX/scripting — not accessible server-side
 *  Realtek Audio    Same block as Realtek Network
 */

import { db } from "../db";
import { driverFetchCache, type DriverFetchCache } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// ── Shared fetch helpers ───────────────────────────────────────────────────────

/** Standard browser UA — passes most User-Agent checks. */
const UA_BROWSER = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.google.com/",
};

/**
 * XHR headers — unlock Intel's download center pages.
 * Intel returns HTTP 403 to plain browser UA from datacenter IPs, but
 * returns 200 with full HTML when these XHR-style headers are present.
 */
const UA_XHR = {
  ...UA_BROWSER,
  Accept: "application/json",
  "X-Requested-With": "XMLHttpRequest",
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

// ── Vendor fetchers ────────────────────────────────────────────────────────────

/**
 * NVIDIA Game Ready Driver — scrapes the NVIDIA Vulkan driver developer page.
 *
 * This static page at developer.nvidia.com/vulkan-driver is publicly
 * accessible from any IP without bot-protection. It lists the current
 * minimum required Windows display driver version for each Vulkan release.
 *
 * The highest version-shaped number (format NNN.NN or NNN.NNN in the
 * 550–700 range) is the most recent GRD/Studio driver recommendation.
 *
 * Why NOT the GFWSL API: gfwsl.geforce.com returns Success:"0" (no results)
 * for all pfid/osid combinations from datacenter IPs — it is server-blocked.
 * Why NOT the security advisory page: it contains SVG path coordinates that
 * match the same regex pattern (e.g. 976.81, 656.26 are bezier values).
 */
async function fetchNvidiaGpu(): Promise<FetchResult> {
  const r = await fetch("https://developer.nvidia.com/vulkan-driver", {
    headers: UA_BROWSER,
    signal: signal(),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  // Collect clean Windows GRD version numbers.
  // Plausible range for 2024–2027: 550.xx – 700.xx.
  // Exclude matches inside SVG path data attributes (d="M... N.NN ...").
  // The vulkan page is plain HTML — no SVG — so this regex is sufficient.
  const versions = [
    ...html.matchAll(/\b(5[5-9]\d\.\d{2,3}|6\d{2}\.\d{2,3}|7[01]\d\.\d{2,3})\b/g),
  ].map((m) => m[1]);

  if (!versions.length) {
    throw new Error("NVIDIA version not found on vulkan-driver page");
  }

  // Sort descending — highest version number = most recent driver.
  versions.sort((a, b) => parseFloat(b) - parseFloat(a));
  const latest = versions[0];

  const dateM = html.match(/(\d{4}-\d{2}-\d{2})/);
  return { latest, releaseDate: dateM?.[1], source: "nvidia-vulkan-developer-page" };
}

/**
 * AMD Adrenalin GPU driver — AMD's RX 7000-series product download page.
 * Server-rendered, no bot-gate, stable URL.
 */
async function fetchAmdGpu(): Promise<FetchResult> {
  const url =
    "https://www.amd.com/en/support/downloads/drivers.html/graphics/radeon-rx/radeon-rx-7000-series/amd-radeon-rx-7900-xtx.html";
  const r = await fetch(url, { headers: UA_BROWSER, signal: signal() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  const versionMatch =
    html.match(/Adrenalin(?:\s+Edition)?\s+(\d{2,}\.\d+\.\d+)/i) ||
    html.match(/"version"\s*:\s*"(\d{2,}\.\d+\.\d+)"/) ||
    html.match(/(\d{2,}\.\d+\.\d+)\s*(?:WHQL|Release)/i);
  if (!versionMatch) throw new Error("AMD GPU version not found in page");

  const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})/);
  return {
    latest: versionMatch[1],
    releaseDate: dateMatch?.[1],
    source: "amd-downloads-page",
  };
}

/**
 * Intel Arc / Iris Xe GPU driver — Intel download center page 785597.
 *
 * Intel's download center serves HTTP 403 to plain browser requests from
 * datacenter IPs. Adding XHR-style headers (X-Requested-With + JSON Accept)
 * unlocks a 200 response with full HTML. The canonical version string is
 * embedded in a <meta content="32.0.101.XXXX"> attribute on the page.
 */
async function fetchIntelGpu(): Promise<FetchResult> {
  const url =
    "https://www.intel.com/content/www/us/en/download/785597/intel-arc-iris-xe-graphics-windows.html";
  const r = await fetch(url, { headers: UA_XHR, signal: signal() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  // Meta content holds the version string: content="32.0.101.8864"
  const m =
    html.match(/content="[^"]*?(\d{2,3}\.\d+\.\d+\.\d{4,})[^"]*"/) ||
    html.match(/(\d{2,3}\.\d+\.\d+\.\d{4,})/);
  if (!m) throw new Error("Intel GPU version not found in meta content");

  const dateM = html.match(/(\d{4}-\d{2}-\d{2})/);
  return { latest: m[1], releaseDate: dateM?.[1], source: "intel-download-center" };
}

/**
 * Intel Chipset Device Software (INF Utility) — download page 19347.
 * Same XHR-header unlock as GPU. Version format: 10.1.XXXXX.XXXX.
 */
async function fetchIntelChipset(): Promise<FetchResult> {
  const url =
    "https://www.intel.com/content/www/us/en/download/19347/intel-chipset-device-software-inf-utility.html";
  const r = await fetch(url, { headers: UA_XHR, signal: signal() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  const m =
    html.match(/content="[^"]*?(\d{1,2}\.\d+\.\d{5,}\.\d+)[^"]*"/) ||
    html.match(/(\d{1,2}\.\d+\.\d{5,}\.\d+)/);
  if (!m) throw new Error("Intel Chipset version not found");

  const dateM = html.match(/(\d{4}-\d{2}-\d{2})/);
  return { latest: m[1], releaseDate: dateM?.[1], source: "intel-download-center" };
}

/**
 * AMD Chipset Software — AMD's general driver download landing page.
 *
 * All per-chipset product URLs (e.g. /chipset/amd-socket-am5/…) return 404.
 * The general page at /support/downloads/drivers.html returns 200 and embeds
 * the current AMD chipset software version in 4-part format (e.g. 23.212.7.108).
 */
async function fetchAmdChipset(): Promise<FetchResult> {
  const url = "https://www.amd.com/en/support/downloads/drivers.html";
  const r = await fetch(url, { headers: UA_BROWSER, signal: signal() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  // AMD chipset version format: YY.DDD.M.PATCH — e.g. 23.212.7.108
  const m =
    html.match(/\b(\d{2}\.\d{3}\.\d+\.\d+)\b/) ||
    html.match(/\b(\d+\.\d+\.\d+\.\d{3,})\b/);
  if (!m) throw new Error("AMD Chipset version not found on download page");

  const dateM = html.match(/(\d{4}-\d{2}-\d{2})/);
  return { latest: m[1], releaseDate: dateM?.[1], source: "amd-downloads-page" };
}

/**
 * Intel Network Adapter driver — download page 18293.
 * XHR-header unlock; version format: 31.2.2 (2–3 part, major ≥ 2 digits).
 */
async function fetchIntelNetwork(): Promise<FetchResult> {
  const url =
    "https://www.intel.com/content/www/us/en/download/18293/intel-network-adapter-driver-for-windows-10.html";
  const r = await fetch(url, { headers: UA_XHR, signal: signal() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  const m =
    html.match(/content="[^"]*?(\d{2,}\.\d+(?:\.\d+)?)[^"]*"/) ||
    html.match(/\b(\d{2,}\.\d+(?:\.\d+)?)\b/);
  if (!m) throw new Error("Intel Network version not found");

  const dateM = html.match(/(\d{4}-\d{2}-\d{2})/);
  return { latest: m[1], releaseDate: dateM?.[1], source: "intel-download-center" };
}

/**
 * Intel Wireless Bluetooth driver — download page 18649.
 * Same XHR unlock. Version format: 24.50.0 (3-part, major ≥ 2 digits).
 */
async function fetchIntelBluetooth(): Promise<FetchResult> {
  const url =
    "https://www.intel.com/content/www/us/en/download/18649/intel-wireless-bluetooth-for-windows-10-and-windows-11.html";
  const r = await fetch(url, { headers: UA_XHR, signal: signal() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  const m =
    html.match(/content="[^"]*?(\d{2,}\.\d+\.\d+)[^"]*"/) ||
    html.match(/Version[^0-9]*(\d{2,}\.\d+\.\d+)/i) ||
    html.match(/"softwareVersion"\s*:\s*"(\d{2,}\.\d+\.\d+)"/);
  if (!m) throw new Error("Intel Bluetooth version not found");

  const dateM = html.match(/(\d{4}-\d{2}-\d{2})/);
  return { latest: m[1], releaseDate: dateM?.[1], source: "intel-download-center" };
}

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
