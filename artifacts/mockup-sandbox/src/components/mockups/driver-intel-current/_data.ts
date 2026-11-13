export type ComponentKind = "gpu" | "cpu" | "chipset" | "motherboard" | "bios" | "ssd" | "network" | "audio" | "bluetooth" | "monitor";
export interface DriverComponent {
  kind: ComponentKind; title: string; device: string;
  vendorKey: string | null; current: string | null; latest: string | null;
  health: string; rationale: string;
}
export interface HealthScore { overall: number; subscores: { kind: ComponentKind; label: string; score: number }[]; }
export const getHealthMeta = (health: string | null | undefined) => {
  const states: Record<string, { label: string; color: string; glow: string }> = {
    healthy: { label: "Up to date", color: "#34d399", glow: "rgba(52,211,153,.45)" },
    working: { label: "Working", color: "#34d399", glow: "rgba(52,211,153,.45)" },
    newer: { label: "Newer than database", color: "#22d3ee", glow: "rgba(34,211,238,.45)" },
    outdated: { label: "Update available", color: "#fbbf24", glow: "rgba(251,191,36,.45)" },
    critical: { label: "Action needed", color: "#f87171", glow: "rgba(248,113,113,.5)" },
    scanning: { label: "Scanning…", color: "#00D4FF", glow: "rgba(0,212,255,.5)" },
  };
  return states[health ?? ""] ?? { label: "Not verified", color: "#94a3b8", glow: "rgba(148,163,184,.3)" };
};
export const sampleComponents: DriverComponent[] = [
  { kind: "cpu", title: "Processor", device: "AMD Ryzen 7 9800X3D", vendorKey: "amd", current: null, latest: null, health: "working", rationale: "Windows confirms the processor is present. No comparable processor driver version was reported." },
  { kind: "monitor", title: "Display", device: "AORUS FO27Q3 · 2560 × 1440", vendorKey: "gigabyte", current: null, latest: null, health: "working", rationale: "Display hardware is detected; a monitor firmware version is not verified." },
  { kind: "gpu", title: "Graphics", device: "AMD Radeon RX 7800 XT", vendorKey: "amd", current: null, latest: "25.11.1", health: "unknown", rationale: "Installed driver version could not be verified. Confirm the version in AMD Software before updating." },
  { kind: "ssd", title: "Storage", device: "Samsung SSD 990 PRO 2TB", vendorKey: "samsung", current: null, latest: null, health: "unknown", rationale: "No comparable installed firmware version was found. Check the drive maker's official utility." },
  { kind: "network", title: "Network", device: "Realtek Gaming 2.5GbE", vendorKey: "realtek", current: null, latest: "11.20.0610", health: "unknown", rationale: "A network adapter is present, but its installed driver version is not verified." },
  { kind: "chipset", title: "Chipset", device: "AMD X870E platform", vendorKey: "amd", current: null, latest: null, health: "unknown", rationale: "Platform detected. A current comparable chipset-package version was not verified." },
  { kind: "audio", title: "Audio", device: "Realtek USB Audio", vendorKey: "realtek", current: null, latest: null, health: "unknown", rationale: "Audio hardware detected; no verified installed driver version to compare." },
  { kind: "bluetooth", title: "Bluetooth", device: "MediaTek Wi-Fi 7 Bluetooth", vendorKey: "mediatek", current: null, latest: null, health: "unknown", rationale: "Bluetooth device detected; the installed version remains unverified." },
];
export const sampleScore: HealthScore = {
  overall: 83,
  subscores: sampleComponents.map(component => ({ kind: component.kind, label: component.title, score: component.health === "working" ? 100 : 75 })),
};
