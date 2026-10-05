  /**
   * driver-intel-data.ts
   *
   * Types + pure logic for Driver Intelligence.
   *
   * Core principles (per architecture review):
   *  - Detect-and-redirect: we NEVER auto-install or flash anything. The update
   *    action either launches an installed vendor tool or opens the official
   *    vendor page. No third-party links.
   *  - Cloud database for version comparison; never live-scrape.
   *  - Per-field fallback: any component we can't fully detect degrades to
   *    "unknown" gracefully without breaking the others.
   */
  
  import type { SystemIntelligenceProfile } from "@/stores/systemIntelligenceStore";
  import {
    compareDriverVersions,
    type DriverVersionComparison,
  } from "@shared/driverVersion";
  
  // ── Status model ──────────────────────────────────────────────────────────────
  
  export type ComponentHealth =
    | "healthy" // up to date / nothing to do
    | "newer" // installed version is ahead of the database reference
    | "outdated" // newer version available
    | "critical" // significantly behind or known-bad
    | "unknown" // could not determine (no data)
    | "scanning"; // mid-scan
  
  export type ComponentKind =
    | "gpu"
    | "cpu"
    | "chipset"
    | "motherboard"
    | "bios"
    | "ssd"
    | "network"
    | "audio"
    | "bluetooth"
    | "monitor";
  
  export type SafetyLevel = "safe" | "caution" | "critical";
  
  /** Fixed allowlist of detectable/launchable official vendor tools (Electron). */
  export type VendorAppKey =
    | "nvidia"
    | "amd"
    | "intel"
    | "samsung-magician"
    | "crucial-storage-executive"
    | "wd-dashboard";
  
  /** How a component's update is delivered (detect-and-redirect only). */
  export interface UpdateAction {
    /** Primary CTA label when the vendor app is NOT installed (opens the page). */
    label: string;
    /** Official vendor URL to open. */
    url: string;
    /** Optional note shown under the button (e.g. "Opens NVIDIA App if installed"). */
    note?: string;
    /**
     * If set, the desktop app will try to detect + launch this installed vendor
     * tool first, falling back to `url` when it isn't installed.
     */
    appKey?: VendorAppKey;
    /** CTA label to show when the vendor app IS detected as installed. */
    appLabel?: string;
  }
  
  /** A recorded driver/firmware change (server-persisted, user-scoped). */
  export interface DriverHistoryItem {
    id: string;
    component: string;
    componentLabel?: string | null;
    vendor?: string | null;
    fromVersion?: string | null;
    toVersion: string;
    action: string;
    packageName?: string | null;
    rollbackAvailable: boolean;
    rollbackMeta?: Record<string, unknown> | null;
    createdAt: string;
  }
  
  export interface DriverComponent {
    kind: ComponentKind;
    /** Display name, e.g. "Graphics", "BIOS / Firmware". */
    title: string;
    /** Detected hardware label, e.g. "NVIDIA GeForce RTX 4070". */
    device: string;
    /** Detected vendor key, e.g. "nvidia". */
    vendorKey: string | null;
    /** Currently installed version / firmware (best-effort). */
    current: string | null;
    /** Latest known version from the cloud DB. */
    latest: string | null;
    /** Release date of latest. */
    releaseDate?: string | null;
    /** Short release-note summary. */
    releaseNotes?: string | null;
    /** Known issues for the latest version. */
    knownIssues?: string[];
    /** Resolved health. */
    health: ComponentHealth;
    /** Update safety guidance. */
    safety: SafetyLevel;
    /** The update / action to take (detect-and-redirect). null when healthy/unknown. */
    action: UpdateAction | null;
    /** Dormant official action, enabled only after a verified older result. */
    candidateAction?: UpdateAction | null;
    /** Why this status — one human sentence for the panel. */
    rationale: string;
  }

  export type { DriverVersionComparison };
  export { compareDriverVersions };
  
  // ── Official vendor pages (no third-party links) ──────────────────────────────
  
  export const OFFICIAL_URLS = {
    nvidiaApp: "https://www.nvidia.com/en-us/software/nvidia-app/",
    nvidiaDrivers: "https://www.nvidia.com/Download/index.aspx",
    amdDrivers: "https://www.amd.com/en/support",
    intelDsa: "https://www.intel.com/content/www/us/en/support/detect.html",
    amdChipset: "https://www.amd.com/en/support/chipsets",
    intelChipset:
      "https://www.intel.com/content/www/us/en/download/19347/chipset-inf-utility.html",
    bios: {
      gigabyte: "https://www.gigabyte.com/Support",
      asus: "https://www.asus.com/support/",
      msi: "https://www.msi.com/support",
      asrock: "https://www.asrock.com/support/index.asp",
    },
    ssd: {
      samsung: "https://www.samsung.com/semiconductor/minisite/ssd/download/tools/",
      crucial: "https://www.crucial.com/support/storage-executive",
      wd: "https://support-en.wd.com/downloads.html",
      kingston: "https://www.kingston.com/en/support/technical/ssdmanager",
      hynix: "https://www.skhynix.com/consumer-storage/",
      kioxia: "https://personal.kioxia.com/en-us/support.html",
      seagate: "https://www.seagate.com/support/software/toolkit/",
      adata: "https://www.adata.com/en/microsite/toolbox/",
      corsair: "https://www.corsair.com/us/en/s/downloads",
      sabrent: "https://sabrent.com/pages/downloads",
      patriot: "https://www.patriotmemory.com/pages/support",
      lexar: "https://www.lexar.com/support/",
      pny: "https://www.pny.com/support",
      teamgroup: "https://www.teamgroupinc.com/en/software.php",
      silicon_power: "https://www.silicon-power.com/web/software",
      transcend: "https://www.transcend-info.com/support/software/",
    },
    bluetooth: {
      intel: "https://www.intel.com/content/www/us/en/download-center/home.html",
      realtek: "https://www.realtek.com/en/component/zoo/category/bluetooth-software",
      qualcomm: "https://www.qualcomm.com/support/software-center",
      mediatek: "https://www.mediatek.com/blog/wi-fi-bluetooth-drivers",
    },
    network: {
      intel: "https://www.intel.com/content/www/us/en/download-center/home.html",
      realtek: "https://www.realtek.com/en/component/zoo/category/network-interface-controllers-10-100-1000m-gigabit-ethernet-pci-express-software",
      killer: "https://www.intel.com/content/www/us/en/support/products/199328/wireless/killer-networking.html",
      qualcomm: "https://www.qualcomm.com/support/software-center",
      mediatek: "https://www.mediatek.com/blog/wi-fi-bluetooth-drivers",
      marvell: "https://www.marvell.com/support/",
    },
    audio: {
      nvidia: "https://www.nvidia.com/Download/index.aspx",
      amd: "https://www.amd.com/en/support",
      intel: "https://www.intel.com/content/www/us/en/download-center/home.html",
      realtek: "https://www.realtek.com/en/component/zoo/category/pc-audio-codecs-high-definition-audio-codecs-software",
      steelseries: "https://steelseries.com/gg",
      creative: "https://us.creative.com/p/software",
      logitech: "https://www.logitechg.com/en-us/innovation/g-hub.html",
    },
  } as const;
  
  // ── Cloud DB types (mirror of server payload) ─────────────────────────────────
  
  export interface DriverDbEntry {
    latest: string;
    releaseDate?: string;
    releaseNotes?: string;
    knownIssues?: string[];
    safety: SafetyLevel;
  }
  
  export interface DriverDatabase {
    dbVersion: string;
    updatedAt: string;
    gpu: Record<string, DriverDbEntry>;
    chipset: Record<string, DriverDbEntry>;
    bios: Record<string, DriverDbEntry>;
    ssd: Record<string, DriverDbEntry>;
    network: Record<string, DriverDbEntry>;
    audio: Record<string, DriverDbEntry>;
    bluetooth: Record<string, DriverDbEntry>;
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
   * Bundled local fallback database — used when the cloud is unreachable.
   * Keep this conservative; the server copy is the source of truth.
   */
  export const LOCAL_DB_FALLBACK: DriverDatabase = {
    dbVersion: "local",
    updatedAt: "bundled",
    gpu: {
      nvidia: { latest: "596.99", releaseDate: "2026-06-10", safety: "safe" },
      amd: { latest: "26.8.1", releaseDate: "2026-06-10", safety: "safe" },
      intel: { latest: "32.0.101.8974", releaseDate: "2026-05-28", safety: "safe" },
    },
    chipset: {
      amd: { latest: "23.205.114.203", safety: "safe" },
      intel: { latest: "10.1.20658.8883", safety: "safe" },
    },
    bios: {
      gigabyte: { latest: "F10", safety: "caution" },
      asus: { latest: "2604", safety: "caution" },
      msi: { latest: "7E12v1H", safety: "caution" },
      asrock: { latest: "3.10", safety: "caution" },
    },
    ssd: {
      samsung: { latest: "4B2QJXD7", safety: "caution" },
      crucial: { latest: "P9CR40A", safety: "caution" },
      wd: { latest: "731120WD", safety: "caution" },
      kingston: { latest: "EIFK51.6", safety: "caution" },
      hynix: { latest: "11001C20", safety: "caution" },
      kioxia: { latest: "FFFFFFFF", safety: "caution" },
      seagate: { latest: "VBM23C1Q", safety: "caution" },
      adata: { latest: "RC101C0", safety: "caution" },
      corsair: { latest: "SCSTE251", safety: "caution" },
      sabrent: { latest: "RKT3P5L1", safety: "caution" },
      patriot: { latest: "ECFM22.2", safety: "caution" },
      lexar: { latest: "V3.14", safety: "caution" },
      pny: { latest: "CS2140.003", safety: "caution" },
      teamgroup: { latest: "ETAS32.6", safety: "caution" },
      silicon_power: { latest: "EDFM64.9", safety: "caution" },
      transcend: { latest: "S9FM01.8", safety: "caution" },
    },
    network: {
      intel: { latest: "31.2.2", safety: "safe" },
      realtek: { latest: "11.20.0610", safety: "safe" },
      killer: { latest: "3.1.1456", safety: "caution" },
      qualcomm: { latest: "3.3.0.814", safety: "safe" },
      mediatek: { latest: "3.3.0.314", safety: "safe" },
      marvell: { latest: "3.1.17.172", safety: "safe" },
    },
    audio: {
      nvidia: {
        latest: "Bundled with NVIDIA display driver",
        releaseNotes: "NVIDIA High Definition Audio is delivered with the official display driver package.",
        safety: "safe",
      },
      amd: {
        latest: "Bundled with AMD display driver",
        releaseNotes: "AMD High Definition Audio is delivered with the official Adrenalin display driver package.",
        safety: "safe",
      },
      intel: {
        latest: "Bundled with Intel platform/display package",
        releaseNotes: "Intel Display Audio and Smart Sound Technology packages are supplied through Intel or the system manufacturer.",
        safety: "safe",
      },
      realtek: { latest: "6.0.9670.1", safety: "safe" },
      steelseries: { latest: "GG 90.0", safety: "caution" },
      creative: { latest: "6.0.105", safety: "caution" },
      logitech: { latest: "G HUB 2026.4", safety: "caution" },
    },
    bluetooth: {
      intel: { latest: "24.60.0", safety: "safe" },
      realtek: { latest: "1.8.1061", safety: "safe" },
      qualcomm: { latest: "12.0.0.900", safety: "safe" },
      mediatek: { latest: "3.3.0.501", safety: "safe" },
    },
  };
  
  // ── Vendor detection ──────────────────────────────────────────────────────────
  
  function lc(s: string | null | undefined): string {
    return (s ?? "").toLowerCase();
  }
  
  export function detectGpuVendor(name: string | null): string | null {
    const s = lc(name);
    if (!s) return null;
    if (s.includes("nvidia") || s.includes("geforce") || s.includes("rtx") || s.includes("gtx"))
      return "nvidia";
    if (s.includes("radeon") || s.includes("amd") || /\brx\s?\d/.test(s)) return "amd";
    if (s.includes("intel") || s.includes("arc") || s.includes("iris") || s.includes("uhd"))
      return "intel";
    return null;
  }
  
  export function detectCpuVendor(brand: string | null): string | null {
    const s = lc(brand);
    if (!s) return null;
    if (s.includes("amd") || s.includes("ryzen") || s.includes("threadripper")) return "amd";
    if (s.includes("intel") || s.includes("core")) return "intel";
    return null;
  }
  
  export function detectMoboVendor(manufacturer: string | null): string | null {
    const s = lc(manufacturer);
    if (!s) return null;
    if (s.includes("gigabyte") || s.includes("aorus")) return "gigabyte";
    if (s.includes("asus") || s.includes("rog") || s.includes("tuf")) return "asus";
    if (s.includes("msi") || s.includes("micro-star")) return "msi";
    if (s.includes("asrock")) return "asrock";
    return null;
  }
  
  export function detectSsdVendor(name: string | null): string | null {
    const s = lc(name);
    if (!s) return null;
    if (s.includes("samsung")) return "samsung";
    if (s.includes("crucial") || s.includes("micron")) return "crucial";
    if (s.includes("wd") || s.includes("western digital") || s.includes("sandisk")) return "wd";
    if (s.includes("kingston")) return "kingston";
    // SK Hynix — OEM/consumer model prefixes: HFS*, SHGP*, BC501/BC711, PC711/PC801, SH*
    if (s.includes("hynix") || s.includes("skhynix") || s.includes("sk hynix")) return "hynix";
    // Kioxia (formerly Toshiba BG/KG series) — "toshiba" alone would catch HDDs, so require SSD markers
    if (s.includes("kioxia")) return "kioxia";
    if (s.includes("toshiba") && (s.includes("nvme") || s.includes("ssd") || /\bkg\d/.test(s) || /\bbg\d/.test(s))) return "kioxia";
    // Seagate / FireCuda / Barracuda
    if (s.includes("seagate") || s.includes("firecuda") || s.includes("barracuda")) return "seagate";
    // ADATA / XPG / Spectrix
    if (s.includes("adata") || s.includes("xpg") || s.includes("spectrix")) return "adata";
    // Corsair (CSSD-* model prefix is their SSD line)
    if (s.includes("corsair") || /\bcssd[-_]/.test(s)) return "corsair";
    // Sabrent (Rocket NVMe line)
    if (s.includes("sabrent")) return "sabrent";
    // Patriot
    if (s.includes("patriot")) return "patriot";
    // Inland (Micro Center house brand)
    if (s.includes("inland")) return "hynix"; // Inland drives use SK Hynix controllers/flash
    // Lexar
    if (s.includes("lexar")) return "lexar";
    // PNY (CS2140, CS3140 are NVMe lines)
    if (s.includes(" pny") || s.startsWith("pny") || s.includes("cs2140") || s.includes("cs3140")) return "pny";
    // TeamGroup / T-Force
    if (s.includes("teamgroup") || s.includes("t-force") || s.includes("team mp")) return "teamgroup";
    // Silicon Power
    if (s.includes("silicon power")) return "silicon_power";
    // Transcend (TS###MTS / TS###GMTS prefix)
    if (s.includes("transcend")) return "transcend";
    return null;
  }
  
  export function detectNetworkVendor(name: string | null): string | null {
    const s = lc(name);
    if (!s) return null;
    if (s.includes("killer")) return "killer";
    if (s.includes("intel")) return "intel";
    if (s.includes("realtek")) return "realtek";
    if (s.includes("qualcomm") || s.includes("fastconnect") || s.includes("qca") || s.includes("atheros")) return "qualcomm";
    if (s.includes("mediatek") || s.includes("mt79") || s.includes("mt76")) return "mediatek";
    if (s.includes("marvell") || s.includes("aquantia") || s.includes("aqtion")) return "marvell";
    return null;
  }
  
  export function detectAudioVendor(name: string | null): string | null {
    const s = lc(name);
    if (!s) return null;
    if (s.includes("nvidia")) return "nvidia";
    if (s.includes("amd") || s.includes("radeon")) return "amd";
    if (s.includes("intel") || s.includes("display audio") || s.includes("smart sound")) return "intel";
    if (s.includes("realtek")) return "realtek";
    if (s.includes("steelseries")) return "steelseries";
    if (s.includes("creative") || s.includes("sound blaster")) return "creative";
    if (s.includes("logitech")) return "logitech";
    return null;
  }
  
  export function detectBluetoothVendor(name: string | null): string | null {
    const s = lc(name);
    if (!s) return null;
    if (s.includes("intel")) return "intel";
    if (s.includes("realtek")) return "realtek";
    if (s.includes("qualcomm") || s.includes("qca") || s.includes("atheros")) return "qualcomm";
    if (s.includes("mediatek") || s.includes("mt79") || s.includes("mt76")) return "mediatek";
    return null;
  }
  
  // ── Health resolution ─────────────────────────────────────────────────────────
  
  /** Compare a detected current version against the cloud latest. */
  export function resolveHealth(
    current: string | null,
    entry: DriverDbEntry | null,
  ): ComponentHealth {
    if (!entry) return "unknown";
    if (!current) return "unknown";
    if (!current.trim()) return "unknown";
    const comparison = compareDriverVersions(current, entry.latest);
    if (comparison === "newer") return "newer";
    if (comparison === "same") return "healthy";
    if (comparison === "unknown") return "unknown";
    if (entry.safety === "critical") return "critical";
    return "outdated";
  }

  /**
   * Native driver versions are loaded after the hardware scan. Recalculate the
   * status here so a newer installed version cannot retain a provisional
   * "outdated" state from component assembly.
   */
  export function applyInstalledVersion(
    component: DriverComponent,
    current: string,
  ): DriverComponent {
    const comparable = usesComparableVersionNamespace(component, current);
    const health = comparable
      ? resolveHealth(
          current,
          component.latest
            ? {
                latest: component.latest,
                releaseDate: component.releaseDate ?? undefined,
                releaseNotes: component.releaseNotes ?? undefined,
                knownIssues: component.knownIssues,
                safety: component.safety,
              }
            : null,
        )
      : "unknown";
    const rationale =
      health === "newer"
        ? `Installed version ${current} is newer than our database's latest known version ${component.latest}. No downgrade is recommended.`
        : health === "healthy" && component.latest
          ? `Installed version ${current} matches the latest known version ${component.latest}.`
          : !comparable && component.latest && compareDriverVersions(current, component.latest) !== "unknown"
            ? `Installed version ${current} and database reference ${component.latest} use different vendor version schemes, so SwitchControl will not guess which is newer.`
          : component.rationale;
    return {
      ...component,
      current,
      health,
      action:
        health === "outdated" || health === "critical"
          ? component.action ?? component.candidateAction ?? null
          : null,
      rationale,
    };
  }

  function versionPartCount(value: string | null): number {
    return value ? [...value.matchAll(/\d+/g)].length : 0;
  }

  /**
   * A numeric shape alone does not prove two values share a namespace. AMD's
   * Display-class registry value (32.0.x.x), for example, cannot be compared
   * with an Adrenalin package release (26.8.1). Keep the allowlist narrow.
   */
  function usesComparableVersionNamespace(
    component: DriverComponent,
    current: string,
  ): boolean {
    if (!component.latest) return false;
    const currentParts = versionPartCount(current);
    const latestParts = versionPartCount(component.latest);

    if (component.kind === "gpu") {
      if (component.vendorKey === "nvidia") {
        return currentParts === 2 && latestParts === 2;
      }
      if (component.vendorKey === "intel") {
        return currentParts === 4 && latestParts === 4;
      }
      if (component.vendorKey === "amd") {
        return currentParts === 3 && latestParts === 3;
      }
      return false;
    }

    // Other native values are currently generic category slots rather than
    // identity-bound device records. A Wi-Fi version, for example, must never
    // be compared with the independently selected Ethernet card/vendor.
    return false;
  }
  
  export interface HealthScore {
    overall: number;
    subscores: { kind: ComponentKind; label: string; score: number }[];
  }
  
  const HEALTH_POINTS: Record<ComponentHealth, number> = {
    healthy: 100,
    newer: 100,
    unknown: 75, // unknown ≠ broken; partial credit so the score isn't punished by probe luck
    outdated: 55,
    critical: 25,
    scanning: 75,
  };
  
  export function computeHealthScore(components: DriverComponent[]): HealthScore {
    const subscores = components.map((c) => ({
      kind: c.kind,
      label: c.title,
      score: HEALTH_POINTS[c.health],
    }));
    const overall =
      subscores.length === 0
        ? 0
        : Math.round(subscores.reduce((s, x) => s + x.score, 0) / subscores.length);
    return { overall, subscores };
  }
  
  // ── Detect-and-redirect action builders ───────────────────────────────────────
  
  export function gpuAction(vendor: string | null): UpdateAction | null {
    switch (vendor) {
      case "nvidia":
        return {
          label: "Download from NVIDIA",
          appKey: "nvidia",
          appLabel: "Open NVIDIA App",
          url: OFFICIAL_URLS.nvidiaApp,
          note: "Launches the NVIDIA App if installed, otherwise opens the official download.",
        };
      case "amd":
        return {
          label: "Download from AMD",
          appKey: "amd",
          appLabel: "Open AMD Software",
          url: OFFICIAL_URLS.amdDrivers,
          note: "Launches AMD Adrenalin if installed, otherwise opens the official support page.",
        };
      case "intel":
        return {
          label: "Open Intel Driver Assistant",
          appKey: "intel",
          appLabel: "Open Intel Driver Assistant",
          url: OFFICIAL_URLS.intelDsa,
          note: "Launches Intel's Driver & Support Assistant if installed, otherwise opens it online.",
        };
      default:
        return null;
    }
  }
  
  export function chipsetAction(vendor: string | null): UpdateAction | null {
    if (vendor === "amd")
      return { label: "Open AMD Chipset page", url: OFFICIAL_URLS.amdChipset, note: "Official AMD chipset drivers." };
    if (vendor === "intel")
      return {
        label: "Open Intel Chipset page",
        appKey: "intel",
        appLabel: "Open Intel Driver Assistant",
        url: OFFICIAL_URLS.intelChipset,
        note: "Launches Intel's Driver & Support Assistant if installed, otherwise opens the chipset utility.",
      };
    return null;
  }
  
  export function biosAction(vendor: string | null): UpdateAction | null {
    const url = vendor && (OFFICIAL_URLS.bios as Record<string, string>)[vendor];
    if (!url) return null;
    return {
      label: "Open manufacturer page",
      url,
      note: "We never flash BIOS automatically — this opens the official support page only.",
    };
  }
  
  export function ssdAction(vendor: string | null): UpdateAction | null {
    const url = vendor && (OFFICIAL_URLS.ssd as Record<string, string>)[vendor];
    if (!url) return null;
    const SSD_APP: Record<string, { appKey: VendorAppKey; appLabel: string }> = {
      samsung: { appKey: "samsung-magician", appLabel: "Open Samsung Magician" },
      crucial: { appKey: "crucial-storage-executive", appLabel: "Open Storage Executive" },
      wd: { appKey: "wd-dashboard", appLabel: "Open WD Dashboard" },
    };
    const app = vendor ? SSD_APP[vendor] : undefined;
    return {
      label: "Open SSD utility page",
      url,
      note: app
        ? "Launches the manufacturer's SSD tool if installed, otherwise opens the firmware page."
        : "Official manufacturer firmware utility.",
      ...(app ?? {}),
    };
  }
  
  export function networkAction(vendor: string | null): UpdateAction | null {
    const url = vendor && (OFFICIAL_URLS.network as Record<string, string>)[vendor];
    if (!url) return null;
    if (vendor === "intel" || vendor === "killer")
      return {
        label: "Open driver page",
        appKey: "intel",
        appLabel: "Open Intel Driver Assistant",
        url,
        note: "Launches Intel's Driver & Support Assistant if installed, otherwise opens the driver page.",
      };
    return { label: "Open driver page", url, note: "Official network driver download." };
  }
  
  export function audioAction(vendor: string | null): UpdateAction | null {
    const url = vendor && (OFFICIAL_URLS.audio as Record<string, string>)[vendor];
    if (!url) return null;
    return { label: "Open driver page", url, note: "Official audio driver download." };
  }
  
  export function bluetoothAction(vendor: string | null): UpdateAction | null {
    const url = vendor && (OFFICIAL_URLS.bluetooth as Record<string, string>)[vendor];
    if (!url) return null;
    return { label: "Open driver page", url, note: "Official Bluetooth driver download." };
  }
  
  // ── Scan step definition ──────────────────────────────────────────────────────
  
  export interface ScanStep {
    id: string;
    label: string;
    /** Rough weight for the progress bar. */
    weight: number;
  }
  
  // UI labels remain source strings and are translated by their consumers.
  export const SCAN_STEPS: ScanStep[] = [
    { id: "hardware", label: "Checking hardware…", weight: 1 },
    { id: "firmware", label: "Reading firmware…", weight: 1 },
    { id: "drivers", label: "Reading installed drivers…", weight: 1 },
    { id: "cloud", label: "Comparing cloud database…", weight: 1 },
    { id: "analysis", label: "Running analysis…", weight: 1 },
    { id: "build", label: "Building recommendations…", weight: 1 },
  ];
  
  // ── Display helpers ───────────────────────────────────────────────────────────
  
  export const HEALTH_META: Record<
    ComponentHealth,
    { label: string; color: string; glow: string }
  > = {
    healthy: { label: "Up to date", color: "#34d399", glow: "rgba(52,211,153,0.45)" },
    newer: { label: "Newer than database", color: "#22d3ee", glow: "rgba(34,211,238,0.45)" },
    outdated: { label: "Update available", color: "#fbbf24", glow: "rgba(251,191,36,0.45)" },
    critical: { label: "Action needed", color: "#f87171", glow: "rgba(248,113,113,0.5)" },
    unknown: { label: "Not detected", color: "#94a3b8", glow: "rgba(148,163,184,0.3)" },
    scanning: { label: "Scanning…", color: "#00D4FF", glow: "rgba(0,212,255,0.5)" },
  };
  
  export const KIND_TITLES: Record<ComponentKind, string> = {
    gpu: "Graphics",
    cpu: "Processor",
    chipset: "Chipset",
    motherboard: "Motherboard",
    bios: "BIOS / Firmware",
    ssd: "Storage",
    network: "Network",
    audio: "Audio",
    bluetooth: "Bluetooth",
    monitor: "Display",
  };
  
  /** Number of distinct components that are not healthy/unknown. */
  export function countActionable(components: DriverComponent[]): number {
    return components.filter((c) => c.health === "outdated" || c.health === "critical").length;
  }
  
  export type { SystemIntelligenceProfile };
  