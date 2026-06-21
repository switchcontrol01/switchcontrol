/**
 * driverIntelStore.ts
 *
 * Lazy-loaded scan store for Driver Intelligence.
 *
 * Design (per architecture review):
 *  - LAZY: nothing scans at app startup. A scan only runs when the page asks
 *    for it (scan() / rescan()). The dashboard's startup path is untouched.
 *  - CACHED: once a scan completes it is cached with `scannedAt`. Re-opening
 *    the page shows the cached result instantly ("Scanned X ago — Rescan")
 *    instead of re-running probes. A TTL marks the cache stale, not invalid.
 *  - STATE MACHINE: one consistent path — idle → scanning → ready | partial.
 *    "partial" means the scan succeeded but some fields are still unknown.
 *    A field failing to resolve degrades that single component to "unknown";
 *    it never blanks the page or flips the whole view to an error layout.
 */

import { create } from "zustand";
import {
  type DriverComponent,
  type DriverDatabase,
  type DriverNewsItem,
  type HealthScore,
  LOCAL_DB_FALLBACK,
  SCAN_STEPS,
  computeHealthScore,
  detectGpuVendor,
  detectCpuVendor,
  detectMoboVendor,
  detectSsdVendor,
  detectNetworkVendor,
  detectAudioVendor,
  detectBluetoothVendor,
  resolveHealth,
  gpuAction,
  chipsetAction,
  biosAction,
  ssdAction,
  networkAction,
  audioAction,
  bluetoothAction,
} from "@/lib/driver-intel-data";
import {
  useSystemIntelligenceStore,
  type SystemIntelligenceProfile,
} from "@/stores/systemIntelligenceStore";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — after this the cache is "stale" (still shown)

export type ScanPhase = "idle" | "scanning" | "ready" | "partial" | "error";

interface DriverIntelState {
  phase: ScanPhase;
  /** Current scan step index (for the overlay). */
  stepIndex: number;
  components: DriverComponent[];
  score: HealthScore | null;
  news: DriverNewsItem[];
  dbVersion: string | null;
  scannedAt: number | null;
  /** True when the cloud DB couldn't be reached and we used the bundled copy. */
  usedLocalDb: boolean;
  /** True when one or more components stayed "unknown". */
  hadPartial: boolean;
  error: string | null;

  scan: (force?: boolean) => Promise<void>;
  rescan: () => Promise<void>;
}

// ── Cloud DB fetch (resilient) ────────────────────────────────────────────────

async function fetchDatabase(): Promise<{ db: DriverDatabase; local: boolean }> {
  try {
    const { cloudApiGet } = await import("@/lib/cloud-api");
    const db = await cloudApiGet<DriverDatabase>("/driver-intel/database");
    if (db && db.gpu) return { db, local: false };
  } catch {
    /* fall through to local */
  }
  return { db: LOCAL_DB_FALLBACK, local: true };
}

async function fetchNews(): Promise<DriverNewsItem[]> {
  try {
    const { cloudApiGet } = await import("@/lib/cloud-api");
    const res = await cloudApiGet<{ items: DriverNewsItem[] }>("/driver-intel/news");
    if (res?.items) return res.items;
  } catch {
    /* ignore — news is non-critical */
  }
  return [];
}

// ── Hardware acquisition (electron → system intelligence → web fallback) ───────

interface RawHardware {
  profile: SystemIntelligenceProfile | null;
  gpuName: string | null;
  cpuBrand: string | null;
  moboMaker: string | null;
  moboModel: string | null;
  biosVendor: string | null;
  biosVersion: string | null;
  biosDate: string | null;
  ssdName: string | null;
  netName: string | null;
  btName: string | null;
  monitor: string | null;
}

async function acquireHardware(): Promise<RawHardware> {
  // Ensure the shared system-intelligence profile is loaded (lazy — only now).
  const sip = useSystemIntelligenceStore.getState();
  if (!sip.profile) {
    try {
      // Cap at 6s — phase=A (CPU/GPU/RAM) lands in ~5s on most machines.
      // phase=full (baseboard/bios) can take 7-13s on AMD WMI systems;
      // waiting for it here blocks the entire Driver Intel page. Partial
      // data shows now; the user hits Rescan once hardware finishes.
      await Promise.race([
        sip.fetch(),
        new Promise<void>((r) => setTimeout(r, 6_000)),
      ]);
    } catch {
      /* per-field fallback handles nulls */
    }
  }
  const p = useSystemIntelligenceStore.getState().profile;

  // Best discrete GPU controller.
  let gpuName: string | null = null;
  if (p?.gpu.controllers.length) {
    const discrete = p.gpu.controllers.find((c) =>
      /nvidia|geforce|rtx|gtx|radeon|amd|rx |arc/i.test(`${c.vendor ?? ""} ${c.name ?? ""}`),
    );
    gpuName = (discrete ?? p.gpu.controllers[0]).name ?? null;
  }

  const ssdName = p?.storage.layout.find((d) => d.type === "NVMe" || /ssd/i.test(d.type ?? ""))?.name
    ?? p?.storage.layout[0]?.name
    ?? null;

  const net = p?.network.interfaces.find((n) => n.operstate === "up" && !n.internal)
    ?? p?.network.interfaces[0];

  // Bluetooth vendor almost always tracks the Wi-Fi/combo card vendor.
  const wifi = p?.network.interfaces.find((n) => n.wifi);
  const btName = wifi?.name ?? net?.name ?? null;

  const monitor = p?.gpu.displays.find((d) => d.main)?.model
    ?? p?.gpu.displays[0]?.model
    ?? null;

  return {
    profile: p ?? null,
    gpuName,
    cpuBrand: p?.cpu.brand ?? null,
    moboMaker: p?.baseboard.manufacturer ?? null,
    moboModel: p?.baseboard.model ?? null,
    biosVendor: p?.bios.vendor ?? null,
    biosVersion: p?.bios.version ?? null,
    biosDate: p?.bios.releaseDate ?? null,
    ssdName,
    netName: net?.name ?? null,
    btName,
    monitor,
  };
}

// ── Component assembly ─────────────────────────────────────────────────────────

function buildComponents(hw: RawHardware, db: DriverDatabase): DriverComponent[] {
  const out: DriverComponent[] = [];

  // GPU — installed driver version isn't available via systeminformation, so
  // current stays null (we surface "latest available" + open the vendor app).
  const gpuVendor = detectGpuVendor(hw.gpuName);
  const gpuEntry = gpuVendor ? db.gpu[gpuVendor] ?? null : null;
  out.push({
    kind: "gpu",
    title: "Graphics",
    device: hw.gpuName ?? "Unknown GPU",
    vendorKey: gpuVendor,
    current: null,
    latest: gpuEntry?.latest ?? null,
    releaseDate: gpuEntry?.releaseDate ?? null,
    releaseNotes: gpuEntry?.releaseNotes ?? null,
    knownIssues: gpuEntry?.knownIssues,
    health: gpuVendor ? "outdated" : "unknown",
    safety: gpuEntry?.safety ?? "safe",
    action: gpuAction(gpuVendor),
    rationale: gpuVendor
      ? `Latest ${gpuVendor.toUpperCase()} driver is ${gpuEntry?.latest ?? "unknown"}. Open the vendor app to verify your installed version and update safely.`
      : "Could not identify the GPU vendor. Open your GPU control panel to check for updates.",
  });

  // CPU — informational; no "driver" to update, microcode ships via BIOS.
  const cpuVendor = detectCpuVendor(hw.cpuBrand);
  out.push({
    kind: "cpu",
    title: "Processor",
    device: hw.cpuBrand ?? "Unknown CPU",
    vendorKey: cpuVendor,
    current: hw.cpuBrand ?? null,
    latest: null,
    health: hw.cpuBrand ? "healthy" : "unknown",
    safety: "safe",
    action: null,
    rationale: hw.cpuBrand
      ? "CPU microcode updates are delivered through BIOS updates — see the BIOS / Firmware card."
      : "CPU not detected.",
  });

  // Chipset
  const chipVendor = cpuVendor; // chipset vendor tracks CPU platform
  const chipEntry = chipVendor ? db.chipset[chipVendor] ?? null : null;
  out.push({
    kind: "chipset",
    title: "Chipset",
    device: chipVendor ? `${chipVendor.toUpperCase()} platform` : "Unknown chipset",
    vendorKey: chipVendor,
    current: null,
    latest: chipEntry?.latest ?? null,
    releaseNotes: chipEntry?.releaseNotes ?? null,
    knownIssues: chipEntry?.knownIssues,
    health: chipVendor ? "outdated" : "unknown",
    safety: chipEntry?.safety ?? "safe",
    action: chipsetAction(chipVendor),
    rationale: chipVendor
      ? `Latest ${chipVendor.toUpperCase()} chipset package is ${chipEntry?.latest ?? "unknown"}. Improves power management and core scheduling.`
      : "Chipset vendor unknown.",
  });

  // BIOS / firmware
  const moboVendor = detectMoboVendor(hw.moboMaker);
  const biosEntry = moboVendor ? db.bios[moboVendor] ?? null : null;
  const biosHealth = resolveHealth(hw.biosVersion, biosEntry);
  out.push({
    kind: "bios",
    title: "BIOS / Firmware",
    device:
      [hw.moboMaker, hw.moboModel].filter(Boolean).join(" ") || "Unknown motherboard",
    vendorKey: moboVendor,
    current: hw.biosVersion ?? null,
    latest: biosEntry?.latest ?? null,
    releaseDate: biosEntry?.releaseDate ?? null,
    releaseNotes: biosEntry?.releaseNotes ?? null,
    knownIssues: biosEntry?.knownIssues,
    health: biosHealth === "healthy" && !hw.biosVersion ? "unknown" : biosHealth,
    safety: biosEntry?.safety ?? "caution",
    action: biosAction(moboVendor),
    rationale: hw.biosVersion
      ? `Installed BIOS ${hw.biosVersion}${biosEntry ? `; latest reference is ${biosEntry.latest}` : ""}. We never flash automatically — only open the manufacturer page.`
      : "BIOS version not detected. Open the manufacturer page to check.",
  });

  // SSD firmware
  const ssdVendor = detectSsdVendor(hw.ssdName);
  const ssdEntry = ssdVendor ? db.ssd[ssdVendor] ?? null : null;
  out.push({
    kind: "ssd",
    title: "Storage",
    device: hw.ssdName ?? "Unknown drive",
    vendorKey: ssdVendor,
    current: null,
    latest: ssdEntry?.latest ?? null,
    releaseNotes: ssdEntry?.releaseNotes ?? null,
    health: ssdVendor ? "outdated" : "unknown",
    safety: ssdEntry?.safety ?? "caution",
    action: ssdAction(ssdVendor),
    rationale: ssdVendor
      ? `Use the official ${ssdVendor} utility to check SSD firmware and update safely.`
      : hw.ssdName
        ? "Drive detected; firmware updates are handled by the manufacturer utility."
        : "No drive detected.",
  });

  // Network
  const netVendor = detectNetworkVendor(hw.netName);
  const netEntry = netVendor ? db.network[netVendor] ?? null : null;
  out.push({
    kind: "network",
    title: "Network",
    device: hw.netName ?? "Unknown adapter",
    vendorKey: netVendor,
    current: null,
    latest: netEntry?.latest ?? null,
    releaseNotes: netEntry?.releaseNotes ?? null,
    knownIssues: netEntry?.knownIssues,
    health: netVendor ? "outdated" : "unknown",
    safety: netEntry?.safety ?? "safe",
    action: networkAction(netVendor),
    rationale: netVendor
      ? `Latest ${netVendor} network driver is ${netEntry?.latest ?? "unknown"}. Affects RSS, interrupt moderation and latency.`
      : hw.netName
        ? "Adapter detected; check the vendor page for driver updates."
        : "No active network adapter detected.",
  });

  // Audio — systeminformation does not expose audio device names reliably.
  // We do NOT pass any unrelated data (e.g. GPU display model) into detectAudioVendor
  // because that will never match and would always produce "unknown" silently.
  // Instead we are honest: audio detection is not wired to a real data source yet.
  // A future iteration can add a Win32_SoundDevice PowerShell probe here.
  const audioVendor: string | null = null;
  const audioEntry = null;
  out.push({
    kind: "audio",
    title: "Audio",
    device: "Audio device",
    vendorKey: audioVendor,
    current: null,
    latest: audioEntry,
    releaseNotes: null,
    health: "unknown" as const,
    safety: "safe" as const,
    action: null,
    rationale:
      "Audio hardware detection is not yet available. Most AM4/AM5 and Intel desktop boards ship Realtek UAD — visit your motherboard manufacturer's support page to check for the latest audio driver.",
  });

  // Bluetooth — vendor tracks the Wi-Fi/combo card.
  const btVendor = detectBluetoothVendor(hw.btName);
  const btEntry = btVendor ? db.bluetooth[btVendor] ?? null : null;
  out.push({
    kind: "bluetooth",
    title: "Bluetooth",
    device: btVendor ? `${btVendor} Bluetooth` : "Bluetooth adapter",
    vendorKey: btVendor,
    current: null,
    latest: btEntry?.latest ?? null,
    releaseNotes: btEntry?.releaseNotes ?? null,
    health: btVendor ? "outdated" : "unknown",
    safety: btEntry?.safety ?? "safe",
    action: bluetoothAction(btVendor),
    rationale: btVendor
      ? `Latest ${btVendor} Bluetooth driver is ${btEntry?.latest ?? "unknown"}. Updating can fix pairing drops and audio stutter on BT headsets.`
      : "Bluetooth adapter vendor not detected. Check your Wi-Fi/Bluetooth card's vendor page.",
  });

  // Display / monitor — informational.
  out.push({
    kind: "monitor",
    title: "Display",
    device: hw.monitor ?? "Unknown display",
    vendorKey: null,
    current: hw.monitor ?? null,
    latest: null,
    health: hw.monitor ? "healthy" : "unknown",
    safety: "safe",
    action: null,
    rationale: hw.monitor
      ? "Display detected. Monitor firmware updates (if any) come from the display manufacturer."
      : "No display info available.",
  });

  return out;
}

// ── Step animation helper ─────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const useDriverIntelStore = create<DriverIntelState>((set, get) => ({
  phase: "idle",
  stepIndex: 0,
  components: [],
  score: null,
  news: [],
  dbVersion: null,
  scannedAt: null,
  usedLocalDb: false,
  hadPartial: false,
  error: null,

  scan: async (force = false) => {
    const st = get();
    // Lazy + cached: skip if we already have a fresh result and nobody forced.
    // "partial" counts as data — per-field fallback often lands here, and we
    // must NOT re-run the scan every visit just because some fields are unknown.
    if (!force && hasData(st.phase) && st.scannedAt && Date.now() - st.scannedAt < CACHE_TTL_MS) {
      return;
    }
    if (st.phase === "scanning") return;

    set({ phase: "scanning", stepIndex: 0, error: null });

    try {
      // Kick off async work and the visible step cadence together.
      const dbPromise = fetchDatabase();
      const newsPromise = fetchNews();
      const hwPromise = acquireHardware();

      // Drive the step labels (≈ 2.4s minimum so the flow reads as deliberate,
      // never longer than needed once data is back).
      for (let i = 0; i < SCAN_STEPS.length; i++) {
        set({ stepIndex: i });
        await delay(380);
      }

      const [{ db, local }, news, hw] = await Promise.all([dbPromise, newsPromise, hwPromise]);

      const components = buildComponents(hw, db);
      const score = computeHealthScore(components);
      const hadPartial = components.some((c) => c.health === "unknown");

      set({
        phase: hadPartial ? "partial" : "ready",
        components,
        score,
        news,
        dbVersion: db.dbVersion,
        usedLocalDb: local,
        hadPartial,
        scannedAt: Date.now(),
        stepIndex: SCAN_STEPS.length - 1,
      });
    } catch (err: any) {
      // Even a hard failure keeps a usable page: build from whatever we have.
      try {
        const components = buildComponents(await acquireHardware(), LOCAL_DB_FALLBACK);
        set({
          phase: "partial",
          components,
          score: computeHealthScore(components),
          usedLocalDb: true,
          hadPartial: true,
          scannedAt: Date.now(),
        });
      } catch {
        set({ phase: "error", error: err?.message ?? "Scan failed" });
      }
    }
  },

  rescan: async () => {
    await get().scan(true);
  },
}));

// "ready" and "partial" both mean the page has data to show.
export function hasData(phase: ScanPhase): boolean {
  return phase === "ready" || phase === "partial";
}
