/**
 * extreme-labs-data.ts
 *
 * Tweak definitions for Extreme Labs — advanced latency and delay tuning.
 * All copy is honest and hardware-dependent. No fake marketing.
 */

export type RiskBadge = "Safe" | "Moderate" | "Risky" | "High";
export type ImpactBadge = "None" | "Low" | "Medium" | "High";

export interface ExtremeTweak {
  id: string;
  name: string;
  category: ExtremeCategory;
  risk: RiskBadge;
  impact: ImpactBadge;
  requiresRestart: boolean;
  description: string;
  whatItChanges: string;
  whatMayBreak: string;
  currentState: string;
  afterState?: string;
  // Maps to existing tweak-registry id for toggle execution
  registryTweakId?: string;
  // Maps to slider tweak if applicable
  sliderTweakId?: string;
  // Maps to preset tweak if applicable
  presetTweakId?: string;
  // Maps to NIC property key for adapter-level tuning
  nicPropertyKey?: string;
  // Risk areas this tweak may affect
  riskAreas: RiskArea[];
}

export type ExtremeCategory =
  | "Latency Core"
  | "Scheduler / CPU"
  | "Gaming / Capture"
  | "Network Latency"
  | "Service Weight"
  | "Startup / Vendor Weight";

export type RiskArea =
  | "Audio / Mic"
  | "Network"
  | "Anti-cheat"
  | "Windows login"
  | "Updates"
  | "GPU driver tools";

export const EXTREME_CATEGORIES: ExtremeCategory[] = [
  "Latency Core",
  "Scheduler / CPU",
  "Gaming / Capture",
  "Network Latency",
  "Service Weight",
  "Startup / Vendor Weight",
];

export const RISK_AREAS: RiskArea[] = [
  "Audio / Mic",
  "Network",
  "Anti-cheat",
  "Windows login",
  "Updates",
  "GPU driver tools",
];

export const EXTREME_TWEAKS: ExtremeTweak[] = [
  // ── Latency Core ────────────────────────────────────────────────────────────
  {
    id: "pci-msi-mode-extreme",
    name: "PCI MSI Mode",
    category: "Latency Core",
    risk: "Risky",
    impact: "Medium",
    requiresRestart: true,
    description: "Enables Message Signaled Interrupts across all compatible PCI devices — GPUs, NICs, storage controllers, and USB controllers. Reduces interrupt latency at the hardware level.",
    whatItChanges: "Sets MSISupported = 1 in the interrupt management registry key for each compatible PCI device. Per-device backup captured before apply.",
    whatMayBreak: "May cause instability if a device driver doesn't fully support MSI mode. Revert restores original per-device values. Requires a restart to take effect.",
    currentState: "Legacy line-based interrupts (device default)",
    afterState: "Message Signaled Interrupts enabled per device",
    registryTweakId: "pci-msi-mode",
    riskAreas: ["GPU driver tools", "Network"],
  },
  {
    id: "global-timer-resolution",
    name: "Global Timer Resolution Requests",
    category: "Latency Core",
    risk: "Moderate",
    impact: "Low",
    requiresRestart: false,
    description: "Reduces scheduling delay by holding the system timer resolution at 0.5ms while SwitchControl is running.",
    whatItChanges: "Holds system timer resolution at 0.5ms via a background agent. Effect resets when SwitchControl exits.",
    whatMayBreak: "Can increase CPU wakeups and slightly raise idle power draw.",
    currentState: "System default (15.6ms)",
    afterState: "Resolution lowered to 0.5ms",
    registryTweakId: "timer-res",
    riskAreas: ["Network"],
  },
  {
    id: "dynamic-tick",
    name: "Dynamic Tick Disable",
    category: "Latency Core",
    risk: "Moderate",
    impact: "Medium",
    requiresRestart: true,
    description: "Disables dynamic clock tick for more consistent timer interrupts. Hardware-dependent.",
    whatItChanges: "Forces constant tick rate instead of adaptive via BCDEdit.",
    whatMayBreak: "May increase power consumption on laptops. Can worsen latency on some systems.",
    currentState: "Dynamic tick enabled",
    afterState: "Constant tick rate",
    registryTweakId: "synth-timers",
    riskAreas: ["Network"],
  },
  {
    id: "hpet-disable",
    name: "Disable HPET Platform Clock",
    category: "Latency Core",
    risk: "Safe",
    impact: "Low",
    requiresRestart: true,
    description: "Disables HPET as the platform clock source via BCDEdit. May improve latency consistency on some systems.",
    whatItChanges: "Sets useplatformclock to No in BCD store.",
    whatMayBreak: "Some systems rely on HPET. If system won't boot, use recovery media to revert: bcdedit /set useplatformclock Yes",
    currentState: "HPET may be active",
    afterState: "HPET disabled as platform clock",
    registryTweakId: "hpet-disable",
    riskAreas: [],
  },

  // ── Scheduler / CPU ───────────────────────────────────────────────────────────
  {
    id: "win32-priority-separation",
    name: "Win32PrioritySeparation Profile",
    category: "Scheduler / CPU",
    risk: "Moderate",
    impact: "Medium",
    requiresRestart: true,
    description: "Adjusts foreground/background scheduling bias. May reduce scheduling delay on some systems.",
    whatItChanges: "Changes how the scheduler balances foreground vs background threads.",
    whatMayBreak: "Can starve background tasks. May worsen latency on some systems.",
    currentState: "System default",
    afterState: "Foreground-biased scheduling",
    sliderTweakId: "win32PrioritySeparation",
    riskAreas: ["Network", "Anti-cheat"],
  },
  {
    id: "system-responsiveness",
    name: "System Responsiveness Profile",
    category: "Scheduler / CPU",
    risk: "Moderate",
    impact: "Medium",
    requiresRestart: false,
    description: "Tunes Multimedia Class Scheduler responsiveness. May improve input latency.",
    whatItChanges: "Adjusts how much CPU the scheduler reserves for multimedia threads.",
    whatMayBreak: "Can reduce throughput for background transcoding or streaming.",
    currentState: "Default (20%)",
    afterState: "Lowered reservation",
    sliderTweakId: "SystemResponsiveness",
    riskAreas: ["Audio / Mic", "Network"],
  },
  {
    id: "power-throttling-extreme",
    name: "Power Throttling Off",
    category: "Scheduler / CPU",
    risk: "Moderate",
    impact: "Medium",
    requiresRestart: false,
    description: "Disables CPU power throttling for background processes on AC power.",
    whatItChanges: "Prevents Windows from demoting background thread priority.",
    whatMayBreak: "Higher idle power usage. Minimal risk on desktops.",
    currentState: "Throttling enabled",
    afterState: "Throttling disabled",
    registryTweakId: "power-throttling",
    riskAreas: ["Updates"],
  },

  // ── Gaming / Capture ────────────────────────────────────────────────────────
  {
    id: "disable-game-dvr",
    name: "Disable GameDVR",
    category: "Gaming / Capture",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Disables Windows Game DVR background recording. May reduce background CPU usage.",
    whatItChanges: "Stops background recording and broadcast services via registry.",
    whatMayBreak: "Cannot use Xbox Game Bar recording or broadcasting.",
    currentState: "Game DVR enabled",
    afterState: "Game DVR disabled",
    registryTweakId: "disable-game-dvr",
    riskAreas: [],
  },
  {
    id: "disable-xbox-capture",
    name: "Disable Xbox Capture",
    category: "Gaming / Capture",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Disables Xbox background capture services. May free background CPU cycles.",
    whatItChanges: "Stops Xbox background capture pipeline via registry.",
    whatMayBreak: "Xbox capture features unavailable.",
    currentState: "Capture enabled",
    afterState: "Capture disabled",
    // Own distinct registryTweakId so apply/revert/ownership tracking are
    // independent from disable-game-dvr. Previously both pointed to "disable-game-dvr"
    // which caused reverting one to affect the other's ownership record.
    registryTweakId: "disable-xbox-capture",
    riskAreas: [],
  },
  {
    id: "windowed-games-opt",
    name: "Optimizations for Windowed Games",
    category: "Gaming / Capture",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Enables OS-level optimizations for windowed and borderless games.",
    whatItChanges: "Enables flip model presentation and reduced compositor overhead via DirectX user preferences.",
    whatMayBreak: "May conflict with some third-party overlays.",
    currentState: "Default",
    afterState: "Optimizations enabled",
    registryTweakId: "optimize-windowed-games",
    riskAreas: ["GPU driver tools"],
  },
  {
    id: "fortnite-priority-booster",
    name: "Fortnite Priority Booster",
    category: "Gaming / Capture",
    risk: "Moderate",
    impact: "Medium",
    requiresRestart: false,
    description: "Sets FortniteClient-Win64-Shipping.exe to High CPU priority via Windows IFEO engine. Effect is immediate on next game launch.",
    whatItChanges: "Adds an IFEO PerfOptions key with CpuPriorityClass = 3 (High) for the Fortnite client executable.",
    whatMayBreak: "Only affects Fortnite. Other apps and system stability are unaffected. Removing the key reverts to normal priority on next launch.",
    currentState: "Normal priority",
    afterState: "High priority",
    presetTweakId: "fortnite-high-priority",
    riskAreas: [],
  },

  // ── Network Latency ───────────────────────────────────────────────────────────
  {
    id: "network-throttling-index",
    name: "Network Throttling Index",
    category: "Network Latency",
    risk: "Moderate",
    impact: "Medium",
    requiresRestart: false,
    description: "Reduces Windows multimedia scheduler network throttling. May improve network responsiveness.",
    whatItChanges: "Reduces throttling applied to network traffic during multimedia playback.",
    whatMayBreak: "Can increase jitter during video streaming. May worsen latency on some systems.",
    currentState: "Throttling active",
    afterState: "Throttling reduced",
    sliderTweakId: "NetworkThrottlingIndex",
    riskAreas: ["Network", "Audio / Mic"],
  },
  {
    id: "tcp-no-delay",
    name: "TCP NoDelay / TcpAckFrequency",
    category: "Network Latency",
    risk: "Moderate",
    impact: "Medium",
    requiresRestart: true,
    description: "Reduces TCP buffering delay. May improve network latency for real-time applications.",
    whatItChanges: "Disables Nagle algorithm and reduces ACK delay via TCP stack registry.",
    whatMayBreak: "Can increase packet overhead on slow connections. Requires restart.",
    currentState: "Nagle enabled",
    afterState: "Nagle disabled",
    registryTweakId: "tcp-no-delay",
    riskAreas: ["Network"],
  },
  {
    id: "rss-enable",
    name: "RSS (Receive Side Scaling)",
    category: "Network Latency",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Enables distributing network processing across CPU cores via network adapter.",
    whatItChanges: "Enables RSS on the primary physical network adapter.",
    whatMayBreak: "No known issues on modern hardware. Some very old NICs may not support it.",
    currentState: "Adapter-dependent",
    afterState: "RSS enabled",
    nicPropertyKey: "rss",
    riskAreas: ["Network"],
  },
  {
    id: "interrupt-moderation",
    name: "Interrupt Moderation",
    category: "Network Latency",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Controls how network adapter coalesces interrupts. Disabling may reduce latency at cost of CPU.",
    whatItChanges: "Disables interrupt moderation on the primary physical network adapter.",
    whatMayBreak: "Higher CPU usage during heavy network load. Some adapters do not support this property.",
    currentState: "Driver default",
    afterState: "Moderation disabled",
    nicPropertyKey: "interruptModeration",
    riskAreas: ["Network"],
  },
  {
    id: "eee-disable",
    name: "Disable EEE / Green Ethernet",
    category: "Network Latency",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Disables Energy Efficient Ethernet which can add latency by powering down link segments.",
    whatItChanges: "Disables EEE on the primary physical network adapter.",
    whatMayBreak: "Slightly higher power usage on Ethernet port. Minimal impact.",
    currentState: "May be enabled",
    afterState: "EEE disabled",
    nicPropertyKey: "eee",
    riskAreas: ["Network"],
  },
  {
    id: "flow-control",
    name: "Flow Control",
    category: "Network Latency",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Sets 802.3x pause frame handling. Disabling can reduce latency on high-speed links.",
    whatItChanges: "Disables flow control on the primary physical network adapter.",
    whatMayBreak: "May cause dropped packets during congestion on some switches.",
    currentState: "Driver default",
    afterState: "Flow control disabled",
    nicPropertyKey: "flowControl",
    riskAreas: ["Network"],
  },

  // ── Service Weight ──────────────────────────────────────────────────────────
  {
    id: "windows-search-disable",
    name: "Disable Windows Search",
    category: "Service Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Disables Windows Search indexing service. Reduces background disk and CPU load.",
    whatItChanges: "Stops and disables the WSearch service.",
    whatMayBreak: "Windows search and file indexing will not work. Start menu search may be slower.",
    currentState: "Service running",
    afterState: "Service disabled",
    registryTweakId: "win-search-index",
    riskAreas: ["Updates"],
  },
  {
    id: "sysmain-disable",
    name: "Disable SysMain (SuperFetch)",
    category: "Service Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Disables SysMain which preloads frequently used applications. Reduces background disk load.",
    whatItChanges: "Stops and disables the SysMain service.",
    whatMayBreak: "Applications may take slightly longer to open after reboot.",
    currentState: "Service running",
    afterState: "Service disabled",
    registryTweakId: "superfetch",
    riskAreas: [],
  },
  {
    id: "print-spooler-disable",
    name: "Disable Print Spooler",
    category: "Service Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Disables the Print Spooler service. Reduces attack surface and background CPU.",
    whatItChanges: "Stops and disables the Spooler service.",
    whatMayBreak: "Printing will not work. Re-enable when you need to print.",
    currentState: "Service running",
    afterState: "Service disabled",
    registryTweakId: "fax-printer",
    riskAreas: ["Windows login"],
  },
  {
    id: "xbox-services-disable",
    name: "Disable Xbox Services",
    category: "Service Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Disables Xbox background services that run even when not gaming.",
    whatItChanges: "Stops and disables Xbox Live Auth, Game Save, GIP, and NetApi services.",
    whatMayBreak: "Xbox Live features, Game Bar, and Xbox app will not work.",
    currentState: "Services running",
    afterState: "Services disabled",
    registryTweakId: "xbox-services",
    riskAreas: [],
  },
  {
    id: "bluetooth-disable",
    name: "Disable Bluetooth Services",
    category: "Service Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Disables Bluetooth support services when no devices are paired.",
    whatItChanges: "Stops and disables Bluetooth Support and A2DP services.",
    whatMayBreak: "Bluetooth devices will not work. Re-enable to use Bluetooth again.",
    currentState: "Services running",
    afterState: "Services disabled",
    registryTweakId: "bluetooth",
    riskAreas: ["Audio / Mic"],
  },

  // ── Startup / Vendor Weight ─────────────────────────────────────────────────
  {
    id: "edge-update-disable",
    name: "Disable Edge Update Services",
    category: "Startup / Vendor Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Disables Microsoft Edge background updater services.",
    whatItChanges: "Stops and disables MicrosoftEdgeUpdate services and scheduled tasks.",
    whatMayBreak: "Edge will not auto-update. Manually update via Windows Update.",
    currentState: "Updater running",
    afterState: "Updater disabled",
    registryTweakId: "edge-update",
    riskAreas: ["Updates"],
  },
  {
    id: "adobe-updater-disable",
    name: "Disable Adobe Updater",
    category: "Startup / Vendor Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Disables Adobe Creative Cloud background updater services.",
    whatItChanges: "Stops and disables Adobe Update Service and related scheduled tasks.",
    whatMayBreak: "Adobe apps will not auto-update. Manually update via Creative Cloud.",
    currentState: "Updater running",
    afterState: "Updater disabled",
    registryTweakId: "adobe-updater",
    riskAreas: ["Updates"],
  },
  {
    id: "teams-startup-disable",
    name: "Disable Teams Background Startup",
    category: "Startup / Vendor Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Prevents Microsoft Teams from starting at boot.",
    whatItChanges: "Removes Teams from startup registry and disables background process.",
    whatMayBreak: "Teams will not auto-start. Launch manually when needed.",
    currentState: "Auto-starts at boot",
    afterState: "Manual start only",
    registryTweakId: "teams-startup",
    riskAreas: [],
  },
  {
    id: "vendor-updaters-disable",
    name: "Disable Vendor Update Helpers",
    category: "Startup / Vendor Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Disables common OEM and hardware vendor background updaters.",
    whatItChanges: "Detects and disables known vendor updater services (Dell, HP, Lenovo, NVIDIA, AMD, Intel).",
    whatMayBreak: "Hardware drivers and vendor utilities may not auto-update. Check vendor websites periodically.",
    currentState: "May be running",
    afterState: "Updaters disabled",
    registryTweakId: "vendor-updaters",
    riskAreas: ["Updates", "GPU driver tools"],
  },
];

// Group tweaks by category
export function getTweaksByCategory(category: ExtremeCategory): ExtremeTweak[] {
  return EXTREME_TWEAKS.filter((t) => t.category === category);
}

// Get all NIC-backed tweaks
export function getNicTweaks(): ExtremeTweak[] {
  return EXTREME_TWEAKS.filter((t) => t.nicPropertyKey);
}

// Get all registry-backed tweaks
export function getRegistryTweaks(): ExtremeTweak[] {
  return EXTREME_TWEAKS.filter((t) => t.registryTweakId);
}

// Get all slider-backed tweaks
export function getSliderTweaks(): ExtremeTweak[] {
  return EXTREME_TWEAKS.filter((t) => t.sliderTweakId);
}

// Get risk color for badges
export function getRiskColor(risk: RiskBadge): string {
  switch (risk) {
    case "Safe": return "#22c55e";
    case "Moderate": return "#f59e0b";
    case "Risky": return "#ef4444";
    case "High": return "#dc2626";
    default: return "#6B7380";
  }
}

// Get impact color for badges
export function getImpactColor(impact: ImpactBadge): string {
  switch (impact) {
    case "None": return "#6B7380";
    case "Low": return "#22c55e";
    case "Medium": return "#f59e0b";
    case "High": return "#ef4444";
    default: return "#6B7380";
  }
}
