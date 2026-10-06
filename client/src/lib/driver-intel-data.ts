/**
 * Driver Intelligence types and pure scan logic.
 *
 * The UI only recommends opening official vendor tools/pages. It never installs
 * drivers or flashes firmware. Unknown hardware/version data remains unknown.
 */

import { compareDriverVersions } from "@shared/driverVersion";
import type { DriverVersionComparison } from "@shared/driverVersion";
import type { SystemIntelligenceProfile } from "@/stores/systemIntelligenceStore";

export { compareDriverVersions };
export type { DriverVersionComparison, SystemIntelligenceProfile };

export type ComponentHealth =
  | "healthy"
  | "newer"
  | "outdated"
  | "critical"
  | "unknown"
  | "scanning";

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

export type VendorAppKey =
  | "nvidia"
  | "amd"
  | "intel"
  | "samsung-magician"
  | "crucial-storage-executive"
  | "wd-dashboard";

export interface UpdateAction {
  label: string;
  url: string;
  note?: string;
  appKey?: VendorAppKey;
  appLabel?: string;
}

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
  title: string;
  device: string;
  vendorKey: string | null;
  current: string | null;
  latest: string | null;
  releaseDate?: string | null;
  releaseNotes?: string | null;
  knownIssues?: string[];
  health: ComponentHealth;
  safety: SafetyLevel;
  action: UpdateAction | null;
  candidateAction?: UpdateAction | null;
  rationale: string;
}

export interface DriverDbEntry {
  latest: string;
  releaseDate?: string;
  releaseNotes?: string;
  knownIssues?: string[];
  safety: SafetyLevel;
  disabled?: boolean;
  hotfix?: boolean;
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

export interface HealthScore {
  overall: number;
  subscores: { kind: ComponentKind; label: string; score: number }[];
}

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
  network: {
    intel: "https://www.intel.com/content/www/us/en/download-center/home.html",
    realtek:
      "https://www.realtek.com/en/component/zoo/category/network-interface-controllers-10-100-1000m-gigabit-ethernet-pci-express-software",
    killer:
      "https://www.intel.com/content/www/us/en/support/products/199328/wireless/killer-networking.html",
    qualcomm: "https://www.qualcomm.com/support/software-center",
    mediatek: "https://www.mediatek.com/blog/wi-fi-bluetooth-drivers",
    marvell: "https://www.marvell.com/support/",
  },
  audio: {
    nvidia: "https://www.nvidia.com/Download/index.aspx",
    amd: "https://www.amd.com/en/support",
    intel: "https://www.intel.com/content/www/us/en/download-center/home.html",
    realtek:
      "https://www.realtek.com/en/component/zoo/category/pc-audio-codecs-high-definition-audio-codecs-software",
    steelseries: "https://steelseries.com/gg",
    creative: "https://us.creative.com/p/software",
    logitech: "https://www.logitechg.com/en-us/innovation/g-hub.html",
  },
  bluetooth: {
    intel: "https://www.intel.com/content/www/us/en/download-center/home.html",
    realtek:
      "https://www.realtek.com/en/component/zoo/category/bluetooth-software",
    qualcomm: "https://www.qualcomm.com/support/software-center",
    mediatek: "https://www.mediatek.com/blog/wi-fi-bluetooth-drivers",
  },
} as const;

/** Bundled fallback for offline scans; the cloud database remains authoritative. */
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
      releaseNotes: "NVIDIA High Definition Audio ships with its display driver.",
      safety: "safe",
    },
    amd: {
      latest: "Bundled with AMD display driver",
      releaseNotes: "AMD High Definition Audio ships with Adrenalin.",
      safety: "safe",
    },
    intel: {
      latest: "Bundled with Intel platform/display package",
      releaseNotes: "Intel audio packages are supplied by Intel or the system maker.",
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

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

export function detectGpuVendor(name: string | null | undefined): string | null {
  const value = normalize(name);
  if (!value) return null;
  if (/nvidia|geforce|\brtx\b|\bgtx\b/.test(value)) return "nvidia";
  if (/radeon|\bamd\b|\brx\s?\d/.test(value)) return "amd";
  if (/intel|\barc\b|\biris\b|\buhd\b/.test(value)) return "intel";
  return null;
}

export function detectCpuVendor(name: string | null | undefined): string | null {
  const value = normalize(name);
  if (!value) return null;
  if (/amd|ryzen|threadripper/.test(value)) return "amd";
  if (/intel|core/.test(value)) return "intel";
  return null;
}

export function detectMoboVendor(name: string | null | undefined): string | null {
  const value = normalize(name);
  if (!value) return null;
  if (/gigabyte|aorus/.test(value)) return "gigabyte";
  if (/asus|rog|tuf/.test(value)) return "asus";
  if (/msi|micro-star/.test(value)) return "msi";
  if (/asrock/.test(value)) return "asrock";
  return null;
}

export function detectSsdVendor(name: string | null | undefined): string | null {
  const value = normalize(name);
  if (!value) return null;
  if (value.includes("samsung")) return "samsung";
  if (/crucial|micron/.test(value)) return "crucial";
  if (/\bwd\b|western digital|sandisk/.test(value)) return "wd";
  if (value.includes("kingston")) return "kingston";
  if (/hynix|inland/.test(value)) return "hynix";
  if (/kioxia|toshiba.*(?:nvme|ssd|\bkg\d|\bbg\d)/.test(value)) return "kioxia";
  if (/seagate|firecuda|barracuda/.test(value)) return "seagate";
  if (/adata|xpg|spectrix/.test(value)) return "adata";
  if (/corsair|\bcssd[-_]/.test(value)) return "corsair";
  if (value.includes("sabrent")) return "sabrent";
  if (value.includes("patriot")) return "patriot";
  if (/lexar/.test(value)) return "lexar";
  if (/pny|cs2140|cs3140/.test(value)) return "pny";
  if (/teamgroup|t-force|team mp/.test(value)) return "teamgroup";
  if (value.includes("silicon power")) return "silicon_power";
  if (value.includes("transcend")) return "transcend";
  return null;
}

export function detectNetworkVendor(name: string | null | undefined): string | null {
  const value = normalize(name);
  if (!value) return null;
  if (value.includes("killer")) return "killer";
  if (value.includes("intel")) return "intel";
  if (value.includes("realtek")) return "realtek";
  if (/qualcomm|fastconnect|\bqca|atheros/.test(value)) return "qualcomm";
  if (/mediatek|mt79|mt76/.test(value)) return "mediatek";
  if (/marvell|aquantia|aqtion/.test(value)) return "marvell";
  return null;
}

export function detectAudioVendor(name: string | null | undefined): string | null {
  const value = normalize(name);
  if (!value) return null;
  if (value.includes("nvidia")) return "nvidia";
  if (/amd|radeon/.test(value)) return "amd";
  if (/intel|display audio|smart sound/.test(value)) return "intel";
  if (value.includes("realtek")) return "realtek";
  if (value.includes("steelseries")) return "steelseries";
  if (/creative|sound blaster/.test(value)) return "creative";
  if (value.includes("logitech")) return "logitech";
  return null;
}

export function detectBluetoothVendor(name: string | null | undefined): string | null {
  const value = normalize(name);
  if (!value) return null;
  if (value.includes("intel")) return "intel";
  if (value.includes("realtek")) return "realtek";
  if (/qualcomm|\bqca|atheros/.test(value)) return "qualcomm";
  if (/mediatek|mt79|mt76/.test(value)) return "mediatek";
  return null;
}

export function resolveHealth(
  current: string | null | undefined,
  entry: DriverDbEntry | null | undefined,
): ComponentHealth {
  if (!current?.trim() || !entry?.latest) return "unknown";
  const comparison = compareDriverVersions(current, entry.latest);
  if (comparison === "newer") return "newer";
  if (comparison === "same") return "healthy";
  if (comparison === "unknown") return "unknown";
  return entry.safety === "critical" ? "critical" : "outdated";
}

function versionPartCount(value: string | null | undefined): number {
  return value ? Array.from(value.matchAll(/\d+/g)).length : 0;
}

/** Only compare numeric versions known to share a vendor version namespace. */
function usesComparableVersionNamespace(
  component: DriverComponent,
  current: string,
): boolean {
  if (!component.latest) return false;
  const currentParts = versionPartCount(current);
  const latestParts = versionPartCount(component.latest);

  if (component.kind !== "gpu") return false;
  if (component.vendorKey === "nvidia") return currentParts === 2 && latestParts === 2;
  if (component.vendorKey === "intel") return currentParts === 4 && latestParts === 4;
  if (component.vendorKey === "amd") return currentParts === 3 && latestParts === 3;
  return false;
}

export function applyInstalledVersion(
  component: DriverComponent,
  current: string,
): DriverComponent {
  const comparable = usesComparableVersionNamespace(component, current);
  const entry = component.latest
    ? {
        latest: component.latest,
        releaseDate: component.releaseDate ?? undefined,
        releaseNotes: component.releaseNotes ?? undefined,
        knownIssues: component.knownIssues,
        safety: component.safety,
      }
    : null;
  const health = comparable ? resolveHealth(current, entry) : "unknown";
  const versionComparison = component.latest
    ? compareDriverVersions(current, component.latest)
    : "unknown";

  const rationale =
    health === "newer"
      ? `Installed version ${current} is newer than our database's latest known version ${component.latest}. No downgrade is recommended.`
      : health === "healthy" && component.latest
        ? `Installed version ${current} matches the latest known version ${component.latest}.`
        : !comparable && component.latest && versionComparison !== "unknown"
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

const HEALTH_POINTS: Record<ComponentHealth, number> = {
  healthy: 100,
  newer: 100,
  unknown: 75,
  outdated: 55,
  critical: 25,
  scanning: 75,
};

export function computeHealthScore(components: DriverComponent[]): HealthScore {
  const subscores = components.map((component) => ({
    kind: component.kind,
    label: component.title,
    score: HEALTH_POINTS[component.health] ?? HEALTH_POINTS.unknown,
  }));
  const overall = subscores.length
    ? Math.round(subscores.reduce((total, item) => total + item.score, 0) / subscores.length)
    : 0;
  return { overall, subscores };
}

export function gpuAction(vendor: string | null): UpdateAction | null {
  if (vendor === "nvidia") {
    return {
      label: "Download from NVIDIA",
      appKey: "nvidia",
      appLabel: "Open NVIDIA App",
      url: OFFICIAL_URLS.nvidiaApp,
      note: "Launches the NVIDIA App if installed, otherwise opens the official download.",
    };
  }
  if (vendor === "amd") {
    return {
      label: "Download from AMD",
      appKey: "amd",
      appLabel: "Open AMD Software",
      url: OFFICIAL_URLS.amdDrivers,
      note: "Launches AMD Adrenalin if installed, otherwise opens the official support page.",
    };
  }
  if (vendor === "intel") {
    return {
      label: "Open Intel Driver Assistant",
      appKey: "intel",
      appLabel: "Open Intel Driver Assistant",
      url: OFFICIAL_URLS.intelDsa,
      note: "Launches Intel's Driver & Support Assistant if installed, otherwise opens it online.",
    };
  }
  return null;
}

export function chipsetAction(vendor: string | null): UpdateAction | null {
  if (vendor === "amd") {
    return { label: "Open AMD Chipset page", url: OFFICIAL_URLS.amdChipset };
  }
  if (vendor === "intel") {
    return {
      label: "Open Intel Chipset page",
      appKey: "intel",
      appLabel: "Open Intel Driver Assistant",
      url: OFFICIAL_URLS.intelChipset,
    };
  }
  return null;
}

export function biosAction(vendor: string | null): UpdateAction | null {
  const url = vendor && OFFICIAL_URLS.bios[vendor as keyof typeof OFFICIAL_URLS.bios];
  return url
    ? {
        label: "Open manufacturer page",
        url,
        note: "We never flash BIOS automatically — this opens the official support page only.",
      }
    : null;
}

export function ssdAction(vendor: string | null): UpdateAction | null {
  const url = vendor && OFFICIAL_URLS.ssd[vendor as keyof typeof OFFICIAL_URLS.ssd];
  if (!url) return null;
  const app =
    vendor === "samsung"
      ? { appKey: "samsung-magician" as const, appLabel: "Open Samsung Magician" }
      : vendor === "crucial"
        ? { appKey: "crucial-storage-executive" as const, appLabel: "Open Storage Executive" }
        : vendor === "wd"
          ? { appKey: "wd-dashboard" as const, appLabel: "Open WD Dashboard" }
          : {};
  return { label: "Open SSD utility page", url, ...app };
}

export function networkAction(vendor: string | null): UpdateAction | null {
  const url = vendor && OFFICIAL_URLS.network[vendor as keyof typeof OFFICIAL_URLS.network];
  if (!url) return null;
  return vendor === "intel" || vendor === "killer"
    ? {
        label: "Open driver page",
        appKey: "intel",
        appLabel: "Open Intel Driver Assistant",
        url,
      }
    : { label: "Open driver page", url };
}

export function audioAction(vendor: string | null): UpdateAction | null {
  const url = vendor && OFFICIAL_URLS.audio[vendor as keyof typeof OFFICIAL_URLS.audio];
  return url ? { label: "Open driver page", url } : null;
}

export function bluetoothAction(vendor: string | null): UpdateAction | null {
  const url = vendor && OFFICIAL_URLS.bluetooth[vendor as keyof typeof OFFICIAL_URLS.bluetooth];
  return url ? { label: "Open driver page", url } : null;
}

export interface ScanStep {
  id: string;
  label: string;
  weight: number;
}

export const SCAN_STEPS: ScanStep[] = [
  { id: "hardware", label: "Checking hardware…", weight: 1 },
  { id: "firmware", label: "Reading firmware…", weight: 1 },
  { id: "drivers", label: "Reading installed drivers…", weight: 1 },
  { id: "cloud", label: "Comparing cloud database…", weight: 1 },
  { id: "analysis", label: "Running analysis…", weight: 1 },
  { id: "build", label: "Building recommendations…", weight: 1 },
];

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

/** Keep rendering safe if runtime data contains an unrecognized health value. */
export function getHealthMeta(health: string | null | undefined) {
  if (health && Object.prototype.hasOwnProperty.call(HEALTH_META, health)) {
    return HEALTH_META[health as ComponentHealth];
  }
  return HEALTH_META.unknown;
}

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

export function countActionable(components: DriverComponent[]): number {
  return components.filter(
    (component) => component.health === "outdated" || component.health === "critical",
  ).length;
}
