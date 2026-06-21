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

// ── Status model ──────────────────────────────────────────────────────────────

export type ComponentHealth =
  | "healthy" // up to date / nothing to do
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

/** How a component's update is delivered (detect-and-redirect only). */
export interface UpdateAction {
  /** Primary CTA label. */
  label: string;
  /** Official vendor URL to open. */
  url: string;
  /** Optional note shown under the button (e.g. "Opens NVIDIA App if installed"). */
  note?: string;
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
  /** Why this status — one human sentence for the panel. */
  rationale: string;
}

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
  },
  bluetooth: {
    intel: "https://www.intel.com/content/www/us/en/download-center/home.html",
    realtek:
      "https://www.realtek.com/en/component/zoo/category/bluetooth-software",
  },
  network: {
    intel: "https://www.intel.com/content/www/us/en/download-center/home.html",
    realtek: "https://www.realtek.com/en/component/zoo/category/network-interface-controllers-10-100-1000m-gigabit-ethernet-pci-express-software",
    killer: "https://www.intel.com/content/www/us/en/support/products/199328/wireless/killer-networking.html",
  },
  audio: {
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
    nvidia: { latest: "576.80", releaseDate: "2026-06-10", safety: "safe" },
    amd: { latest: "25.6.1", releaseDate: "2026-06-04", safety: "safe" },
    intel: { latest: "32.0.101.6790", releaseDate: "2026-05-28", safety: "safe" },
  },
  chipset: {
    amd: { latest: "7.10.13.408", safety: "safe" },
    intel: { latest: "10.1.19444.8378", safety: "safe" },
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
  },
  network: {
    intel: { latest: "29.3", safety: "safe" },
    realtek: { latest: "11.20.0610", safety: "safe" },
    killer: { latest: "3.1.1456", safety: "caution" },
  },
  audio: {
    realtek: { latest: "6.0.9670.1", safety: "safe" },
    steelseries: { latest: "GG 90.0", safety: "caution" },
    creative: { latest: "6.0.105", safety: "caution" },
    logitech: { latest: "G HUB 2026.4", safety: "caution" },
  },
  bluetooth: {
    intel: { latest: "23.60.0", safety: "safe" },
    realtek: { latest: "1.8.1061", safety: "safe" },
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
  return null;
}

export function detectNetworkVendor(name: string | null): string | null {
  const s = lc(name);
  if (!s) return null;
  if (s.includes("killer")) return "killer";
  if (s.includes("intel")) return "intel";
  if (s.includes("realtek")) return "realtek";
  return null;
}

export function detectAudioVendor(name: string | null): string | null {
  const s = lc(name);
  if (!s) return null;
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
  return null;
}

// ── Health resolution ─────────────────────────────────────────────────────────

/**
 * Compare a detected current version against the cloud latest.
 * Returns a coarse health when we have enough info. Version strings across
 * vendors are not numerically comparable, so we use a conservative rule:
 *  - no current  → unknown (we can still show "latest available")
 *  - exact match → healthy
 *  - mismatch    → outdated (or critical if DB marks it critical)
 */
export function resolveHealth(
  current: string | null,
  entry: DriverDbEntry | null,
): ComponentHealth {
  if (!entry) return current ? "healthy" : "unknown";
  if (!current) return "unknown";
  const a = current.trim().toLowerCase();
  const b = entry.latest.trim().toLowerCase();
  if (!a) return "unknown";
  if (a === b || a.includes(b) || b.includes(a)) return "healthy";
  if (entry.safety === "critical") return "critical";
  return "outdated";
}

export interface HealthScore {
  overall: number;
  subscores: { kind: ComponentKind; label: string; score: number }[];
}

const HEALTH_POINTS: Record<ComponentHealth, number> = {
  healthy: 100,
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
        label: "Open NVIDIA App",
        url: OFFICIAL_URLS.nvidiaApp,
        note: "Launches the NVIDIA App if installed, otherwise opens the official download.",
      };
    case "amd":
      return {
        label: "Open AMD Software",
        url: OFFICIAL_URLS.amdDrivers,
        note: "Launches AMD Adrenalin if installed, otherwise opens the official support page.",
      };
    case "intel":
      return {
        label: "Open Intel Driver Assistant",
        url: OFFICIAL_URLS.intelDsa,
        note: "Opens Intel's official Driver & Support Assistant.",
      };
    default:
      return null;
  }
}

export function chipsetAction(vendor: string | null): UpdateAction | null {
  if (vendor === "amd")
    return { label: "Open AMD Chipset page", url: OFFICIAL_URLS.amdChipset, note: "Official AMD chipset drivers." };
  if (vendor === "intel")
    return { label: "Open Intel Chipset page", url: OFFICIAL_URLS.intelChipset, note: "Official Intel chipset utility." };
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
  return { label: "Open SSD utility page", url, note: "Official manufacturer firmware utility." };
}

export function networkAction(vendor: string | null): UpdateAction | null {
  const url = vendor && (OFFICIAL_URLS.network as Record<string, string>)[vendor];
  if (!url) return null;
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
