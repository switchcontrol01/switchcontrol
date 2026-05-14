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
  // Maps to existing tweak-registry id for actual execution
  registryTweakId?: string;
  // Maps to slider tweak if applicable
  sliderTweakId?: string;
  // Risk areas this tweak may affect
  riskAreas: RiskArea[];
  // Whether this is review-only (no apply button)
  reviewOnly?: boolean;
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
    id: "global-timer-resolution",
    name: "Global Timer Resolution Requests",
    category: "Latency Core",
    risk: "Moderate",
    impact: "Low",
    requiresRestart: false,
    description: "May reduce scheduling delay on some systems when applications request lower timer resolution.",
    whatItChanges: "Allows processes to request 0.5ms timer resolution instead of default 15.6ms.",
    whatMayBreak: "Can increase CPU wakeups and slightly raise idle power draw.",
    currentState: "System default (15.6ms)",
    afterState: "Resolution lowered on request",
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
    whatItChanges: "Forces constant tick rate instead of adaptive.",
    whatMayBreak: "May increase power consumption on laptops. Can worsen latency on some systems.",
    currentState: "Dynamic tick enabled",
    afterState: "Constant tick rate",
    riskAreas: ["Network"],
  },
  {
    id: "hpet-review",
    name: "HPET / UsePlatformClock Review",
    category: "Latency Core",
    risk: "Safe",
    impact: "None",
    requiresRestart: false,
    description: "Review only. HPET configuration is system-dependent and often set correctly by BIOS.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
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
    id: "mmcss-no-lazy",
    name: "MMCSS NoLazyMode",
    category: "Scheduler / CPU",
    risk: "Risky",
    impact: "High",
    requiresRestart: true,
    description: "Disables MMCSS lazy scheduling. Hardware-dependent. Can increase CPU wakeups.",
    whatItChanges: "Forces immediate thread scheduling for MMCSS-registered processes.",
    whatMayBreak: "Can cause audio glitches or increase power draw. Requires restart.",
    currentState: "Lazy mode enabled",
    afterState: "Lazy mode disabled",
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
    whatItChanges: "Stops background recording and broadcast services.",
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
    whatItChanges: "Stops Xbox background capture pipeline.",
    whatMayBreak: "Xbox capture features unavailable.",
    currentState: "Capture enabled",
    afterState: "Capture disabled",
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
    whatItChanges: "Enables flip model presentation and reduced compositor overhead.",
    whatMayBreak: "May conflict with some third-party overlays.",
    currentState: "Default",
    afterState: "Optimizations enabled",
    registryTweakId: "optimize-windowed-games",
    riskAreas: ["GPU driver tools"],
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
    whatItChanges: "Disables Nagle algorithm and reduces ACK delay.",
    whatMayBreak: "Can increase packet overhead on slow connections. Requires restart.",
    currentState: "Nagle enabled",
    afterState: "Nagle disabled",
    riskAreas: ["Network"],
  },
  {
    id: "rss-enable",
    name: "RSS (Receive Side Scaling)",
    category: "Network Latency",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Enables distributing network processing across CPU cores.",
    whatItChanges: "Enables RSS if supported by network adapter.",
    whatMayBreak: "No known issues on modern hardware.",
    currentState: "Adapter-dependent",
    afterState: "RSS enabled",
    riskAreas: ["Network"],
  },
  {
    id: "interrupt-moderation-review",
    name: "Interrupt Moderation Review",
    category: "Network Latency",
    risk: "Safe",
    impact: "None",
    requiresRestart: false,
    description: "Review only. Interrupt moderation is set by network adapter driver.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: [],
  },
  {
    id: "eee-review",
    name: "EEE / Green Ethernet Review",
    category: "Network Latency",
    risk: "Safe",
    impact: "None",
    requiresRestart: false,
    description: "Review only. Energy Efficient Ethernet can add latency on some adapters.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: [],
  },
  {
    id: "flow-control-review",
    name: "Flow Control Review",
    category: "Network Latency",
    risk: "Safe",
    impact: "None",
    requiresRestart: false,
    description: "Review only. Flow control can add latency on some high-speed links.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: [],
  },

  // ── Service Weight ──────────────────────────────────────────────────────────
  {
    id: "windows-search-review",
    name: "Windows Search",
    category: "Service Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Review only. Windows Search indexing can add background disk load.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: ["Updates"],
  },
  {
    id: "sysmain-review",
    name: "SysMain (SuperFetch)",
    category: "Service Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Review only. SysMain preloads frequently used applications.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: [],
  },
  {
    id: "print-spooler-review",
    name: "Print Spooler",
    category: "Service Weight",
    risk: "Safe",
    impact: "None",
    requiresRestart: false,
    description: "Review only. Print Spooler is a known security surface.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: ["Windows login"],
  },
  {
    id: "xbox-services-review",
    name: "Xbox Services",
    category: "Service Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Review only. Xbox services run in background even when not gaming.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: [],
  },
  {
    id: "bluetooth-services-review",
    name: "Bluetooth Services",
    category: "Service Weight",
    risk: "Safe",
    impact: "None",
    requiresRestart: false,
    description: "Review only. Bluetooth services may run when no devices are paired.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: [],
  },

  // ── Startup / Vendor Weight ─────────────────────────────────────────────────
  {
    id: "edge-update-review",
    name: "Edge Update Services",
    category: "Startup / Vendor Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Review only. Edge updater runs in background.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: ["Updates"],
  },
  {
    id: "adobe-updater-review",
    name: "Adobe Updater",
    category: "Startup / Vendor Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Review only. Adobe Creative Cloud updater runs in background.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: ["Updates"],
  },
  {
    id: "teams-startup-review",
    name: "Teams Background Startup",
    category: "Startup / Vendor Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Review only. Teams may start at boot even when not used.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: [],
  },
  {
    id: "vendor-helpers-review",
    name: "Vendor Update Helpers",
    category: "Startup / Vendor Weight",
    risk: "Safe",
    impact: "Low",
    requiresRestart: false,
    description: "Review only. OEM and hardware vendor updaters may run at boot.",
    whatItChanges: "No change — diagnostic review only.",
    whatMayBreak: "Nothing — this is read-only review.",
    currentState: "Review current setting",
    reviewOnly: true,
    riskAreas: ["Updates", "GPU driver tools"],
  },
];

// Group tweaks by category
export function getTweaksByCategory(category: ExtremeCategory): ExtremeTweak[] {
  return EXTREME_TWEAKS.filter((t) => t.category === category);
}

// Get all review-only tweaks
export function getReviewOnlyTweaks(): ExtremeTweak[] {
  return EXTREME_TWEAKS.filter((t) => t.reviewOnly);
}

// Get all actionable tweaks (non-review-only)
export function getActionableTweaks(): ExtremeTweak[] {
  return EXTREME_TWEAKS.filter((t) => !t.reviewOnly);
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
