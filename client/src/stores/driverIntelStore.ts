/**
 * driverIntelStore.ts
 *
 * Lazy-loaded scan store for Driver Intelligence.
 *
 * Design (per architecture review):
 *  - LAZY: nothing scans at app startup. A scan only runs when the page asks
 *    for it (scan() / rescan()). The dashboard's startup path is untouched.
 *  - CACHED: once a scan completes it is cached with `scannedAt`. Re-opening
 *    the page shows the cached result instantly ("Scanned X ago, Rescan")
 *    instead of re-running probes. A TTL marks the cache stale, not invalid.
 *  - STATE MACHINE: one consistent path, idle → scanning → ready | partial.
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

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min, after this the cache is "stale" (still shown)

export type ScanPhase = "idle" | "scanning" | "ready" | "partial" | "error";

interface DriverIntelState {
  phase: ScanPhase;
  /** Current scan step index (for the overlay). */
  stepIndex: number;
  components: DriverComponent[];
  score: HealthScore | null;
  news: DriverNewsItem[];
  dbVersion: string | null;
  /** Cloud DB publish date (ISO/display). Used for the staleness banner. */
  dbUpdatedAt: string | null;
  scannedAt: number | null;
  /** True when the cloud DB couldn't be reached and we used the bundled copy. */
  usedLocalDb: boolean;
  /** True when one or more components stayed "unknown". */
  hadPartial: boolean;
  error: string | null;

  scan: (force?: boolean) => Promise<void>;
  rescan: () => Promise<void>;
  /**
   * Invalidates any in-flight scan (bumps the internal token so its
   * step-cadence loop and pending `set()` calls stop on their next check)
   * and, if a scan was still running, resets phase back to "idle" so a
   * later re-open of the page starts a clean scan rather than getting stuck
   * on "scanning" forever. Called from the Driver Intelligence page's
   * unmount cleanup.
   */
  cancelScan: () => void;
}

// ── Cloud DB fetch (resilient) ────────────────────────────────────────────────

async function fetchDatabase(): Promise<{ db: DriverDatabase; local: boolean }> {
  try {
    const { cloudApiGet } = await import("@/lib/cloud-api");
    const cloudDb = await cloudApiGet<DriverDatabase>("/driver-intel/database");
    if (cloudDb && cloudDb.gpu) {
      const cats = ["gpu", "chipset", "bios", "ssd", "network", "audio", "bluetooth"] as const;
      const merged: DriverDatabase = { ...cloudDb };
      for (const cat of cats) {
        merged[cat] = { ...(LOCAL_DB_FALLBACK[cat] as Record<string, unknown>), ...(cloudDb[cat] ?? {}) } as typeof cloudDb[typeof cat];
      }
      return { db: merged, local: false };
    }
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
    /* ignore, news is non-critical */
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
  audioName: string | null;
  monitor: string | null;
  probeStatuses: Record<string, NativeProbeStatus>;
}

function nativeProbeHint(status: NativeProbeStatus | undefined): string | null {
  if (!status || status === "ok") return null;
  switch (status) {
    case "unsupported":
      return "Unsupported on this Windows edition.";
    case "permission_denied":
      return "Permission denied by Windows.";
    case "provider_unavailable":
      return "Driver/provider unavailable.";
    case "temporarily_failed":
      return "Probe temporarily failed; try scanning again.";
    default:
      return null;
  }
}

async function acquireHardware(): Promise<RawHardware> {
  // Ensure the shared system-intelligence profile is loaded (lazy, only now).
  const sip = useSystemIntelligenceStore.getState();
  if (!sip.profile) {
    try {
      // Cap at 6s, phase=A (CPU/GPU/RAM) lands in ~5s on most machines.
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

  // SSD, prefer NVMe, then any SSD entry from the profile.
  let ssdName: string | null =
    p?.storage.layout.find((d) => d.type === "NVMe" || /ssd/i.test(d.type ?? ""))?.name
    ?? p?.storage.layout[0]?.name
    ?? null;

  // Network / Bluetooth, si.networkInterfaces() returns Windows interface LABELS
  // ("Ethernet", "Wi-Fi") not chip descriptions. Those labels are useless for
  // vendor detection (detectNetworkVendor("Ethernet") = null). We always prefer
  // the Electron IPC path which calls Get-NetAdapter → InterfaceDescription and
  // returns the actual chip model (e.g. "Realtek Gaming 2.5GbE Family Controller").
  // si data is kept only as a last-resort hint for the non-Electron web path.
  let netName: string | null = null;
  let btName: string | null = null;
  const probeStatuses: Record<string, NativeProbeStatus> = {};

  // Audio, from phase=full si.audio() (Win32_SoundDevice).
  let audioName: string | null = p?.audio?.devices?.[0]?.name ?? null;

  // Motherboard, from profile baseboard (set only when si.baseboard() succeeds).
  // On AMD/WMI-broken systems si.baseboard() times out → null. Extract as mutable
  // so the IPC fallback below can update it before the return value is built.
  let moboMaker: string | null = p?.baseboard.manufacturer ?? null;
  let moboModel: string | null = p?.baseboard.model ?? null;

  // ── Electron IPC fallbacks ─────────────────────────────────────────────────
  // On AMD systems WMI calls frequently time out even with generous limits.
  // These fallbacks talk directly to Windows APIs through existing IPC channels.
  // Web mode: window.electronAPI is undefined, conditions are false, no-op.
  const eApi = typeof window !== "undefined" ? (window as any).electronAPI : null;

  // Network: ALWAYS query nic.getAdapters in Electron, si networkInterfaces()
  // gives interface labels ("Ethernet"/"Wi-Fi"), not chip models. nic.getAdapters
  // calls Get-NetAdapter which returns InterfaceDescription (the actual chip name
  // needed for vendor detection). Runs unconditionally; no-op on web.
  if (eApi?.nic?.getAdapters) {
    try {
      const res = await eApi.nic.getAdapters();
      if (res?.adapters?.length) {
        // Prefer an Up non-virtual non-BT physical adapter for the network chip name
        const active =
          res.adapters.find(
            (a: any) =>
              a.status === "Up" &&
              !/loopback|virtual|vpn|tap|wfp|pseudo|bluetooth/i.test(a.description),
          ) ??
          res.adapters.find(
            (a: any) => !/loopback|virtual|vpn|tap|wfp|pseudo/i.test(a.description),
          );
        if (active) netName = active.description || active.name;
        // Wireless adapter hints at BT combo card (Intel AX200/210, Killer,
        // Realtek RTL8852 etc. share the chip for Wi-Fi + BT)
        const wirelessAdapter = res.adapters.find((a: any) =>
          /wireless|wi-fi|wifi|802\.11|ax\d{3}|killer/i.test(a.description),
        );
        if (wirelessAdapter) btName = wirelessAdapter.description;
      }
    } catch { /* ignore, IPC unavailable */ }
  }

  // Bluetooth: dedicated PnP radio query is more accurate than guessing from
  // the wireless NIC list. Get-PnpDevice -Class Bluetooth returns the actual
  // Bluetooth radio name (e.g. "Intel(R) Wireless Bluetooth(R)") which
  // directly carries the vendor string needed by detectBluetoothVendor().
  // Overwrites the NIC-based btName when the radio name is available.
  if (eApi?.system?.getBluetoothDevice) {
    try {
      const res = await eApi.system.getBluetoothDevice();
      if (res?.status) probeStatuses.bluetooth = res.status;
      if (res?.name) btName = res.name;
    } catch { /* ignore */ }
  }

  // Web fallback (no eApi): use si interface names as best-effort hints.
  // Vendor detection will likely return null but at least shows an adapter name.
  if (!netName && !eApi) {
    const net =
      p?.network.interfaces.find((n) => n.operstate === "up" && !n.internal) ??
      p?.network.interfaces[0];
    const wifi = p?.network.interfaces.find((n) => n.wifi);
    netName = net?.name ?? null;
    btName = wifi?.name ?? net?.name ?? null;
  }

  // Storage: storage:getVolumes → Get-Volume with disk model (fast PowerShell)
  if (eApi?.storage?.getVolumes && !ssdName) {
    try {
      const res = await eApi.storage.getVolumes();
      if (res?.ok && res.volumes?.length) {
        // Prefer NVMe by busType, then SSD by mediaType, then first with a model.
        const best =
          res.volumes.find((v: any) => v.busType === "NVMe" || /nvme/i.test(v.model ?? ""))
          ?? res.volumes.find((v: any) => /ssd|solid.state/i.test(v.mediaType ?? ""))
          ?? res.volumes.find((v: any) => v.model);
        if (best?.model) ssdName = best.model;
      }
    } catch { /* ignore */ }
  }

  // Audio: system:getAudioDevice → Get-PnpDevice MEDIA (PnP, not WMI, fast on AMD)
  if (eApi?.system?.getAudioDevice && !audioName) {
    try {
      const res = await eApi.system.getAudioDevice();
      if (res?.status) probeStatuses.audio = res.status;
      if (res?.name) audioName = res.name;
    } catch { /* ignore */ }
  }

  // Motherboard: system:getMotherboard → registry HKLM:\HARDWARE\DESCRIPTION\System\BIOS
  // Instant read, no WMI. Needed so Realtek audio inference works when si.baseboard() times out.
  if (eApi?.system?.getMotherboard && !moboMaker && !moboModel) {
    try {
      const res = await eApi.system.getMotherboard();
      if (res?.status) probeStatuses.motherboard = res.status;
      if (res?.manufacturer) moboMaker = res.manufacturer;
      if (res?.model) moboModel = res.model;
    } catch { /* ignore */ }
  }

  const monitor = p?.gpu.displays.find((d) => d.main)?.model
    ?? p?.gpu.displays[0]?.model
    ?? null;

  return {
    profile: p ?? null,
    gpuName,
    cpuBrand: p?.cpu.brand ?? null,
    moboMaker,
    moboModel,
    biosVendor: p?.bios.vendor ?? null,
    biosVersion: p?.bios.version ?? null,
    biosDate: p?.bios.releaseDate ?? null,
    ssdName,
    netName,
    btName,
    audioName,
    monitor,
    probeStatuses,
  };
}

// ── Component assembly ─────────────────────────────────────────────────────────

function buildComponents(hw: RawHardware, db: DriverDatabase): DriverComponent[] {
  const out: DriverComponent[] = [];
  const audioProbeHint = nativeProbeHint(hw.probeStatuses.audio);
  const bluetoothProbeHint = nativeProbeHint(hw.probeStatuses.bluetooth);
  const motherboardProbeHint = nativeProbeHint(hw.probeStatuses.motherboard);

  // GPU, installed driver version isn't available via systeminformation, so
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

  // CPU, informational; no "driver" to update, microcode ships via BIOS.
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
      ? "CPU microcode updates are delivered through BIOS updates, see the BIOS / Firmware card."
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
      ? `Installed BIOS ${hw.biosVersion}${biosEntry ? `; latest reference is ${biosEntry.latest}` : ""}. We never flash automatically, only open the manufacturer page.${motherboardProbeHint ? ` ${motherboardProbeHint}` : ""}`
      : `BIOS version not detected. Open the manufacturer page to check.${motherboardProbeHint ? ` ${motherboardProbeHint}` : ""}`,
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

  // Audio, sourced from si.audio() in phase=full (Win32_SoundDevice on Windows).
  // Fallback: infer from motherboard manufacturer, >95% of consumer gaming boards
  // ship Realtek HD Audio (SupremeFX on ASUS ROG is also a Realtek codec under the hood).
  const rawAudioName = hw.audioName;
  let audioVendor: string | null = detectAudioVendor(rawAudioName);
  let audioDeviceName: string | null = rawAudioName;
  if (!audioVendor) {
    const moboStr = ((hw.moboMaker ?? "") + " " + (hw.moboModel ?? "")).toLowerCase();
    if (/asus|rog|tuf|msi|gigabyte|aorus|asrock|amd|intel|hp |dell|lenovo|nuc/.test(moboStr)) {
      audioVendor = "realtek";
      audioDeviceName = rawAudioName ?? "Realtek HD Audio (inferred from motherboard)";
    }
  }
  const audioEntry = audioVendor ? db.audio[audioVendor] ?? null : null;
  const audioVendorLabel = audioVendor
    ? audioVendor.charAt(0).toUpperCase() + audioVendor.slice(1)
    : null;
  out.push({
    kind: "audio",
    title: "Audio",
    device: audioDeviceName ?? "Audio device",
    vendorKey: audioVendor,
    current: null,
    latest: audioEntry?.latest ?? null,
    releaseNotes: audioEntry?.releaseNotes ?? null,
    health: audioVendor ? "outdated" : "unknown",
    safety: audioEntry?.safety ?? ("safe" as const),
    action: audioAction(audioVendor),
    rationale: audioVendor
      ? `Latest ${audioVendorLabel} audio driver is ${audioEntry?.latest ?? "available on the vendor page"}.${audioDeviceName?.includes("inferred") ? " Detected from your motherboard model." : ""} Use the link below to update from the official source.${audioProbeHint ? ` ${audioProbeHint}` : ""}`
      : `Audio device not detected. Visit your motherboard manufacturer's support page to check for the latest audio driver.${audioProbeHint ? ` ${audioProbeHint}` : ""}`,
  });

  // Bluetooth, vendor tracks the Wi-Fi/combo card.
  const btVendor = detectBluetoothVendor(hw.btName);
  const btEntry = btVendor ? db.bluetooth[btVendor] ?? null : null;
  out.push({
    kind: "bluetooth",
    title: "Bluetooth",
    device: btVendor ? `${btVendor.charAt(0).toUpperCase()}${btVendor.slice(1)} Bluetooth` : "Bluetooth adapter",
    vendorKey: btVendor,
    current: null,
    latest: btEntry?.latest ?? null,
    releaseNotes: btEntry?.releaseNotes ?? null,
    health: btVendor ? "outdated" : "unknown",
    safety: btEntry?.safety ?? "safe",
    action: bluetoothAction(btVendor),
    rationale: btVendor
      ? `Latest ${btVendor} Bluetooth driver is ${btEntry?.latest ?? "unknown"}. Updating can fix pairing drops and audio stutter on BT headsets.${bluetoothProbeHint ? ` ${bluetoothProbeHint}` : ""}`
      : `Bluetooth adapter vendor not detected. Check your Wi-Fi/Bluetooth card's vendor page.${bluetoothProbeHint ? ` ${bluetoothProbeHint}` : ""}`,
  });

  // Display / monitor, informational.
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

// Monotonic token guarding the step-cadence loop below. Navigating away from
// the Driver Intelligence page mid-scan doesn't abort the in-flight network
// fetches (cheap, and their result is still useful to cache), but it does stop
// the animated stepIndex ticker from continuing to `set()` on a page nobody is
// looking at. Bumped by every scan() call so a superseded/abandoned run's loop
// exits on its next iteration instead of running to completion.
let _scanToken = 0;

export const useDriverIntelStore = create<DriverIntelState>((set, get) => ({
  phase: "idle",
  stepIndex: 0,
  components: [],
  score: null,
  news: [],
  dbVersion: null,
  dbUpdatedAt: null,
  scannedAt: null,
  usedLocalDb: false,
  hadPartial: false,
  error: null,

  scan: async (force = false) => {
    const st = get();
    // Lazy + cached: skip if we already have a fresh result and nobody forced.
    // "partial" counts as data, per-field fallback often lands here, and we
    // must NOT re-run the scan every visit just because some fields are unknown.
    if (!force && hasData(st.phase) && st.scannedAt && Date.now() - st.scannedAt < CACHE_TTL_MS) {
      return;
    }
    if (st.phase === "scanning") return;

    const token = ++_scanToken;
    set({ phase: "scanning", stepIndex: 0, error: null });

    try {
      // Kick off async work and the visible step cadence together.
      const dbPromise = fetchDatabase();
      const newsPromise = fetchNews();
      const hwPromise = acquireHardware();

      // Drive the step labels (≈ 2.4s minimum so the flow reads as deliberate,
      // never longer than needed once data is back). Bails out early if a
      // newer scan() call has superseded this one.
      for (let i = 0; i < SCAN_STEPS.length; i++) {
        if (token !== _scanToken) return;
        set({ stepIndex: i });
        await delay(380);
      }
      if (token !== _scanToken) return;

      const [{ db, local }, news, hw] = await Promise.all([dbPromise, newsPromise, hwPromise]);
      if (token !== _scanToken) return;

      const components = buildComponents(hw, db);
      const score = computeHealthScore(components);
      const hadPartial = components.some((c) => c.health === "unknown");

      set({
        phase: hadPartial ? "partial" : "ready",
        components,
        score,
        news,
        dbVersion: db.dbVersion,
        dbUpdatedAt: db.updatedAt,
        usedLocalDb: local,
        hadPartial,
        scannedAt: Date.now(),
        stepIndex: SCAN_STEPS.length - 1,
      });
    } catch (err: any) {
      if (token !== _scanToken) return;
      // Even a hard failure keeps a usable page: build from whatever we have.
      try {
        const components = buildComponents(await acquireHardware(), LOCAL_DB_FALLBACK);
        if (token !== _scanToken) return;
        set({
          phase: "partial",
          components,
          score: computeHealthScore(components),
          usedLocalDb: true,
          hadPartial: true,
          scannedAt: Date.now(),
        });
      } catch {
        if (token !== _scanToken) return;
        set({ phase: "error", error: err?.message ?? "Scan failed" });
      }
    }
  },

  rescan: async () => {
    await get().scan(true);
  },

  cancelScan: () => {
    _scanToken++;
    if (get().phase === "scanning") {
      set({ phase: "idle", stepIndex: 0 });
    }
  },
}));

// "ready" and "partial" both mean the page has data to show.
export function hasData(phase: ScanPhase): boolean {
  return phase === "ready" || phase === "partial";
}
