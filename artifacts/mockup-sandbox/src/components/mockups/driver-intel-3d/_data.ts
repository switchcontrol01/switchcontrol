export type ComponentHealth =
  | "healthy"
  | "working"
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

export const HEALTH_META: Record<
  ComponentHealth,
  { label: string; color: string; glow: string }
> = {
  healthy: { label: "Up to date", color: "#34d399", glow: "rgba(52,211,153,0.45)" },
  working: { label: "Working", color: "#34d399", glow: "rgba(52,211,153,0.45)" },
  newer: { label: "Newer than database", color: "#22d3ee", glow: "rgba(34,211,238,0.45)" },
  outdated: { label: "Update available", color: "#fbbf24", glow: "rgba(251,191,36,0.45)" },
  critical: { label: "Action needed", color: "#f87171", glow: "rgba(248,113,113,0.5)" },
  unknown: { label: "Not verified", color: "#94a3b8", glow: "rgba(148,163,184,0.3)" },
  scanning: { label: "Scanning…", color: "#00D4FF", glow: "rgba(0,212,255,0.5)" },
};

/** Keep rendering safe if runtime data contains an unrecognized health value. */
export function getHealthMeta(health: string | null | undefined) {
  if (health && Object.prototype.hasOwnProperty.call(HEALTH_META, health)) {
    return HEALTH_META[health as ComponentHealth];
  }
  return HEALTH_META.unknown;
}


export const previewComponents: DriverComponent[] = [
  {
    "kind": "gpu",
    "title": "Graphics",
    "device": "AMD Radeon RX 7800 XT",
    "current": null,
    "latest": "25.11.1",
    "health": "unknown",
    "rationale": "Installed driver version could not be verified. Confirm the version in AMD Software before updating.",
    "vendorKey": null,
    "safety": "safe",
    "action": null
  },
  {
    "kind": "cpu",
    "title": "Processor",
    "device": "AMD Ryzen 7 9800X3D",
    "current": "Detected",
    "latest": null,
    "health": "working",
    "rationale": "Processor detected. Windows manages the processor driver; chipset support is listed separately.",
    "vendorKey": null,
    "safety": "safe",
    "action": null
  },
  {
    "kind": "chipset",
    "title": "Chipset",
    "device": "AMD X870E platform",
    "current": null,
    "latest": "8.02.18.1026",
    "health": "unknown",
    "rationale": "AMD chipset package detected as a candidate. Installed package version is not verified.",
    "vendorKey": null,
    "safety": "safe",
    "action": null
  },
  {
    "kind": "ssd",
    "title": "Storage",
    "device": "Samsung SSD 990 PRO 2TB",
    "current": null,
    "latest": "4B2QJXD7",
    "health": "unknown",
    "rationale": "Firmware version is not verified. Use Samsung Magician to check the installed version.",
    "vendorKey": null,
    "safety": "safe",
    "action": null
  },
  {
    "kind": "network",
    "title": "Network",
    "device": "Realtek Gaming 2.5GbE",
    "current": null,
    "latest": "10.75.826.2025",
    "health": "unknown",
    "rationale": "Physical Ethernet adapter detected. Installed driver version is not verified.",
    "vendorKey": null,
    "safety": "safe",
    "action": null
  },
  {
    "kind": "audio",
    "title": "Audio",
    "device": "Realtek USB Audio",
    "current": null,
    "latest": "6.3.9600.2390",
    "health": "unknown",
    "rationale": "Audio device detected. Confirm the motherboard-specific package on the official support page.",
    "vendorKey": null,
    "safety": "safe",
    "action": null
  },
  {
    "kind": "bluetooth",
    "title": "Bluetooth",
    "device": "MediaTek Wi-Fi 7 Bluetooth",
    "current": null,
    "latest": "1.1040.0.482",
    "health": "unknown",
    "rationale": "Bluetooth adapter detected. Installed version is not verified.",
    "vendorKey": null,
    "safety": "safe",
    "action": null
  },
  {
    "kind": "monitor",
    "title": "Display",
    "device": "AORUS FO27Q3 · 2560 × 1440",
    "current": "Detected",
    "latest": null,
    "health": "working",
    "rationale": "Display is working. Driver updates are managed through Windows and the display manufacturer.",
    "vendorKey": null,
    "safety": "safe",
    "action": null
  }
];
export const previewScore: HealthScore = { overall:83, subscores: previewComponents.map(c => ({kind:c.kind,label:c.title,score:c.health === "working" ? 100 : 75})) };
export interface HealthScore { overall: number; subscores: {kind:ComponentKind;label:string;score:number}[]; }
