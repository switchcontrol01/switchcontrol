/**
 * tweak-registry.ts — Canonical source of truth for all tweak definitions.
 *
 * Every tweak lives here exactly once, with its full metadata including:
 *  - supported: whether this tweak can be executed on modern Windows
 *  - requiresAdmin: whether UAC elevation is needed
 *  - premium: computed from shared/tweak-tiers (single source for gating logic)
 *
 * Derived exports (HKCU_TOGGLE_IDS, ADMIN_TOGGLE_IDS, SLIDER_IDS,
 * UNSUPPORTED_MAP) replace the hardcoded arrays that previously lived in
 * use-tweak-executor.ts and elsewhere.
 */

import { isPremiumTweakById } from "@shared/tweak-tiers";
export type { TweakLevel, TweakCategory } from "@shared/tweak-tiers";

// ── Scalar types ──────────────────────────────────────────────────────────────

export type RiskLevel = "Safe" | "Moderate" | "Risky";
export type ImpactLevel = "None" | "Low" | "Medium" | "High";
export type TweakControlType = "toggle" | "slider";

// ── Compound types ────────────────────────────────────────────────────────────

export interface TweakExpected {
  cpu?: ImpactLevel;
  gpu?: ImpactLevel;
  ram?: ImpactLevel;
  disk?: ImpactLevel;
  network?: ImpactLevel;
  latency?: ImpactLevel;
  stabilityRisk?: ImpactLevel;
}

export interface SliderPreset {
  value: number;
  label: string;
  description?: string;
  isDefault?: boolean;
  isRecommended?: boolean;
}

export interface SliderConfig {
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  recommendedValue?: number;
  unit?: string;
  stepped?: boolean;
  presets?: SliderPreset[];
  safeMin?: number;
  safeMax?: number;
  cautionLabel?: string;
  extremeMin?: number;
  extremeMax?: number;
  extremeLabel?: string;
}

export interface TweakDetailsConfig {
  registryPath?: string;
  registryName?: string;
  registryType?: string;
  whoShouldAvoid?: string;
  technicalNote?: string;
}

// ── Core registry type ────────────────────────────────────────────────────────

export interface RegistryTweak {
  id: string;
  title: string;
  description: string;
  impact: string[];
  expected: TweakExpected;
  category: import("@shared/tweak-tiers").TweakCategory;
  level: import("@shared/tweak-tiers").TweakLevel;
  risk: RiskLevel;
  controlType?: TweakControlType;
  sliderConfig?: SliderConfig;
  detailsConfig?: TweakDetailsConfig;
  whoShouldAvoid?: string;
  requiresReboot?: boolean;
  requiresAgent?: boolean;

  // ── Registry metadata fields ──────────────────────────────────────────────
  /** true = fully supported. false = cannot be applied on modern Windows. */
  supported: boolean;
  /** Human-readable reason shown in the UI when supported === false. */
  unsupportedReason?: string;
  /** true = UAC elevation required to apply/revert this tweak. */
  requiresAdmin: boolean;
  /** true = premium subscription required. Computed from shared/tweak-tiers. */
  premium: boolean;
}

// ── Base definitions (premium added below via map) ────────────────────────────

type BaseTweak = Omit<RegistryTweak, "premium">;

const BASE: BaseTweak[] = [

  // ── System and Power ───────────────────────────────────────────────────────

  {
    id: "hibernation",
    title: "Disable Hibernation",
    description: "Disables hibernate and removes hiberfil.sys to free disk space.",
    impact: [
      "Frees disk space roughly equal to installed RAM",
      "Hibernate option removed from power menu and laptop lid actions",
      "Faster shutdown storage footprint with no hibernate file writes",
    ],
    expected: { disk: "High", ram: "None", cpu: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "System and Power", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "fast-startup",
    title: "Disable Fast Startup",
    description: "Ensures clean boot state every time by disabling hybrid shutdown.",
    impact: [
      "Forces full shutdown instead of hybrid hibernate",
      "Can fix driver/boot issues caused by stale state",
      "Slightly longer boot times in exchange for cleaner restarts",
    ],
    expected: { disk: "Low", cpu: "None", ram: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "System and Power", level: "Experimental", risk: "Risky",
    supported: true, requiresAdmin: true,
  },
  {
    id: "energy-logging",
    title: "Disable Energy Logging",
    description: "Reduces power diagnostics and event logging related to energy usage.",
    impact: [
      "Fewer power diagnostic logs and background writes",
      "Slight reduction in event logging overhead",
      "May reduce data available for battery/power troubleshooting",
    ],
    expected: { disk: "Low", cpu: "Low", ram: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "System and Power", level: "Advanced", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "maintenance",
    title: "Disable Maintenance",
    description: "Disables scheduled automatic maintenance tasks that run in the background.",
    impact: [
      "Reduces background CPU/disk spikes from maintenance schedules",
      "Less unexpected activity while gaming or recording",
      "Some maintenance tasks (like cleanup/diagnostics) may not run automatically",
    ],
    expected: { cpu: "Low", disk: "Low", ram: "None", gpu: "None", network: "None", latency: "Low", stabilityRisk: "Low" },
    category: "System and Power", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "bg-apps",
    title: "Disable Background Apps",
    description: "Prevents Store apps and some UWP apps from running in the background.",
    impact: [
      "Reduces background CPU/network usage from apps you are not using",
      "Can improve idle stability and reduce random spikes",
      "Some apps won't update/refresh in the background until opened",
    ],
    expected: { cpu: "Low", ram: "Low", network: "Low", disk: "Low", gpu: "None", latency: "Low", stabilityRisk: "Low" },
    category: "System and Power", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },
  {
    id: "core-isolation",
    title: "Disable Core Isolation",
    description: "Disables VBS/HVCI memory integrity for potential performance gains.",
    impact: [
      "Can reduce virtualization-based security overhead",
      "May improve performance in some CPU-bound scenarios",
      "Risk: reduces security protections against kernel-level attacks",
    ],
    expected: { cpu: "Medium", ram: "Low", gpu: "None", disk: "None", network: "None", latency: "Low", stabilityRisk: "Medium" },
    category: "System and Power", level: "Experimental", risk: "Risky",
    requiresReboot: true, supported: true, requiresAdmin: true,
  },
  {
    id: "vbs",
    title: "Disable VBS",
    description: "Disables Virtualization Based Security entirely.",
    impact: [
      "Removes VBS overhead from system",
      "Can improve performance in certain workloads",
      "Risk: significantly reduces security against advanced threats",
    ],
    expected: { cpu: "Medium", ram: "Low", gpu: "None", disk: "None", network: "None", latency: "Low", stabilityRisk: "High" },
    category: "System and Power", level: "Experimental", risk: "Risky",
    requiresReboot: true, supported: true, requiresAdmin: true,
  },
  {
    id: "hyper-v",
    title: "Disable Hyper-V",
    description: "Turns off Microsoft Hyper-V and related virtualization components.",
    impact: [
      "Can reduce virtualization overhead and background services",
      "Improves compatibility with some anti-cheat and performance tweaks",
      "Disables VMs, WSL2 virtualization features, and some sandbox functions",
    ],
    expected: { cpu: "Low", ram: "Low", gpu: "None", disk: "None", network: "None", latency: "Low", stabilityRisk: "Medium" },
    category: "System and Power", level: "Advanced", risk: "Moderate",
    requiresReboot: true, supported: true, requiresAdmin: true,
  },
  {
    id: "p-states",
    title: "Disable P-States",
    description: "Forces CPU to run at maximum frequency by disabling power states.",
    impact: [
      "Eliminates frequency scaling delays",
      "May improve latency consistency in some games",
      "Risk: significantly increases power usage and heat output",
    ],
    expected: { cpu: "High", latency: "Medium", ram: "None", gpu: "None", disk: "None", network: "None", stabilityRisk: "High" },
    category: "System and Power", level: "Experimental", risk: "Risky",
    requiresAgent: true,
    supported: false,
    unsupportedReason: "Requires a runtime agent process for CPU P-state control. Cannot be applied persistently via registry.",
    requiresAdmin: true,
  },
  {
    id: "notifications",
    title: "Disable Notifications",
    description: "Suppresses Windows toast notifications and notification sounds.",
    impact: [
      "Removes popups that can interrupt aim/recording",
      "Reduces notification-related background triggers",
      "You may miss important system/security notifications",
    ],
    expected: { cpu: "None", ram: "None", disk: "None", network: "None", gpu: "None", latency: "Low", stabilityRisk: "Low" },
    category: "System and Power", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },
  {
    id: "power-throttling",
    title: "Disable Power Throttling",
    description: "Prevents Windows from throttling CPU power to background processes when on AC power. Ensures consistent CPU performance for all tasks rather than letting Windows demote background threads.",
    impact: [
      "Stops Windows from silently throttling CPU frequency for background apps",
      "Ensures background compile jobs, streaming encoders, and game launchers get full CPU",
      "Slightly higher idle power draw — negligible on desktops, more noticeable on laptops",
      "Does not affect foreground app priority — only removes background demotion",
    ],
    expected: { cpu: "Medium", gpu: "None", ram: "None", disk: "None", network: "None", latency: "Low", stabilityRisk: "Low" },
    category: "System and Power", level: "Advanced", risk: "Safe",
    whoShouldAvoid: "Laptop users on battery who care about battery life.",
    detailsConfig: {
      registryPath: "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling",
      registryName: "PowerThrottlingOff",
      registryType: "DWORD",
      technicalNote: "Sets PowerThrottlingOff = 1 globally. Power throttling was introduced in Windows 10 1709 and uses EcoQoS / Quality of Service hints to demote background thread CPU priority.",
    },
    supported: true, requiresAdmin: true,
  },
  {
    id: "pcie-link-state",
    title: "Disable PCIe Link State Power Management",
    description: "Prevents PCIe from entering low-power states — eliminates micro-stutters caused by GPU/NVMe power transitions.",
    impact: [
      "Removes PCIe link-state transition latency affecting GPU and NVMe",
      "Can smooth frametime spikes in games that stress VRAM bandwidth",
      "Increases idle power consumption slightly — negligible on desktops",
    ],
    expected: { latency: "Medium", gpu: "Low", disk: "Low", cpu: "None", ram: "None", network: "None", stabilityRisk: "Low" },
    category: "System and Power", level: "Advanced", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "disable-auto-restart-apps",
    title: "Disable Auto-Restart Apps After Sign-In",
    description: "Prevents Windows from automatically reopening Store apps, Edge, and other registered apps after you sign in or restart. Windows 10/11 silently restarts apps that were open during your last sign-out. Disabling this keeps sign-in clean and avoids unwanted processes launching in the background before you are ready.",
    impact: [
      "Cleaner startup — no apps silently relaunch",
      "Slightly faster usable desktop after sign-in",
    ],
    expected: { cpu: "None", gpu: "None", ram: "None", disk: "None", network: "None", latency: "None", stabilityRisk: "None" },
    category: "System and Power", level: "Advanced", risk: "Safe",
    whoShouldAvoid: "Users who rely on apps automatically restoring after sign-in (e.g. always-running Slack, Teams, or media players).",
    detailsConfig: {
      registryPath: "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon",
      registryName: "RestartApps",
      registryType: "DWORD",
      technicalNote: "RestartApps=0 suppresses the RegisterApplicationRestart-based auto-relaunch at Winlogon. Requires admin (HKLM). Affects apps that called RegisterApplicationRestart() — primarily Store apps and certain Microsoft apps.",
    },
    supported: true, requiresAdmin: true,
  },

  // ── Memory and Storage ────────────────────────────────────────────────────

  {
    id: "mem-opt",
    title: "Optimize Memory Settings",
    description: "Applies memory manager tuning aimed at lower latency and steadier frametimes.",
    impact: [
      "May reduce stutters caused by memory trimming/management behavior",
      "Can improve frametime consistency in CPU bound scenarios",
      "Risk: overly aggressive settings can reduce stability on some systems",
    ],
    expected: { ram: "Medium", cpu: "Low", latency: "Medium", disk: "None", network: "None", gpu: "None", stabilityRisk: "Medium" },
    category: "Memory and Storage", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "large-system-cache",
    title: "Disable Large System Cache",
    description: "Changes caching behavior to prioritize programs over file cache behavior.",
    impact: [
      "Can reduce file cache pressure in some workloads",
      "May improve responsiveness in certain memory-heavy scenarios",
      "Risk: can reduce file caching efficiency depending on usage",
    ],
    expected: { ram: "Medium", disk: "Low", cpu: "Low", latency: "Low", gpu: "None", network: "None", stabilityRisk: "Medium" },
    category: "Memory and Storage", level: "Advanced", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "page-combining",
    title: "Disable Page Combining",
    description: "Disables Windows memory page combining (memory deduplication).",
    impact: [
      "Reduces CPU work spent merging identical memory pages",
      "Can lower micro-stutter during heavy multitasking",
      "Slightly higher RAM usage in exchange for lower background CPU activity",
    ],
    expected: { cpu: "Low", ram: "Low", latency: "Low", disk: "None", network: "None", gpu: "None", stabilityRisk: "Low" },
    category: "Memory and Storage", level: "Advanced", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "prefetch",
    title: "Disable Prefetch",
    description: "Disables Prefetch behavior that tries to speed up app launches using disk patterns.",
    impact: [
      "Reduces disk I/O related to prefetch data generation",
      "Can improve consistency on NVMe systems by removing background prefetch writes",
      "May slightly slow some app launch times after cold boot",
    ],
    expected: { disk: "Medium", cpu: "Low", ram: "None", gpu: "None", network: "None", latency: "Low", stabilityRisk: "Low" },
    category: "Memory and Storage", level: "Advanced", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "superfetch",
    title: "Disable SysMain/Superfetch",
    description: "Disables SysMain preloading and predictive caching behavior.",
    impact: [
      "Reduces background disk usage and service activity",
      "Can improve consistency on fast NVMe systems by removing prefetch noise",
      "May slightly slow app launch times after cold boot on some PCs",
    ],
    expected: { disk: "Medium", cpu: "Low", ram: "Low", latency: "Low", gpu: "None", network: "None", stabilityRisk: "Low" },
    category: "Memory and Storage", level: "Advanced", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "storage-sense",
    title: "Disable Storage Sense",
    description: "Disables automatic storage cleanup and file deletion routines.",
    impact: [
      "Prevents automatic deletion of temporary files and recycle cleanup",
      "More predictable storage behavior for creators and gamers",
      "You must manually manage disk cleanup",
    ],
    expected: { disk: "None", cpu: "None", ram: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "Memory and Storage", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },
  {
    id: "ntfs-last-access",
    title: "Disable NTFS Last Access Updates",
    description: "Stops the NTFS driver from updating the 'last access' timestamp every time a file is read. This eliminates thousands of silent write operations on read-heavy workloads.",
    impact: [
      "Eliminates write amplification from read-only file access (indexing, game asset streaming)",
      "Reduces disk I/O overhead on SSDs and HDDs during sequential read workloads",
      "Last accessed timestamps are no longer updated in file metadata",
      "Tools that rely on last-access timestamps (rare) may not work correctly",
    ],
    expected: { disk: "Medium", cpu: "Low", ram: "None", gpu: "None", network: "None", latency: "Low", stabilityRisk: "Low" },
    category: "Memory and Storage", level: "Advanced", risk: "Safe",
    whoShouldAvoid: "Users running backup software that depends on last-access timestamps for incremental backups.",
    detailsConfig: {
      registryPath: "HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem",
      registryName: "NtfsDisableLastAccessUpdate",
      registryType: "DWORD",
      technicalNote: "Sets NtfsDisableLastAccessUpdate = 1. This is the registry equivalent of 'fsutil behavior set DisableLastAccess 1'. Takes effect immediately without a reboot.",
    },
    supported: true, requiresAdmin: true,
  },
  {
    id: "win-search-index",
    title: "Disable Windows Search Indexing",
    description: "Stops the Windows Search indexing service — eliminates background disk I/O from content indexing.",
    impact: [
      "Removes constant low-level disk activity from the WSearch indexer process",
      "Can reduce SSD write amplification and background I/O spikes during gaming",
      "File search via Explorer becomes slower as results are no longer pre-indexed",
    ],
    expected: { disk: "High", cpu: "Low", ram: "Low", gpu: "None", network: "None", latency: "Low", stabilityRisk: "Low" },
    category: "Memory and Storage", level: "Advanced", risk: "Safe",
    supported: true, requiresAdmin: true,
  },

  // ── Privacy and Telemetry ─────────────────────────────────────────────────

  {
    id: "telemetry",
    title: "Disable Telemetry",
    description: "Reduces Windows diagnostic data collection and related scheduled tasks.",
    impact: [
      "Fewer background telemetry tasks and data uploads",
      "Slight reduction in background CPU/network activity",
      "Some Windows feedback/diagnostics features may be limited",
    ],
    expected: { cpu: "Low", network: "Low", disk: "Low", ram: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", level: "Advanced", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "nvidia-telemetry",
    title: "Disable NVIDIA Telemetry",
    description: "Disables NVIDIA telemetry and analytics scheduled tasks/services.",
    impact: [
      "Reduces NVIDIA background telemetry tasks",
      "Slight reduction in background CPU/disk activity",
      "No effect on GPU performance features themselves",
    ],
    expected: { cpu: "Low", disk: "Low", ram: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", level: "Advanced", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "copilot",
    title: "Disable Copilot",
    description: "Disables Windows Copilot integration and entry points.",
    impact: [
      "Removes Copilot UI and background integration hooks",
      "Reduces distractions and potential background activity",
      "Does not affect core Windows functionality",
    ],
    expected: { cpu: "Low", ram: "Low", disk: "None", network: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },
  {
    id: "cortana",
    title: "Disable Cortana",
    description: "Disables legacy Cortana components and entry points.",
    impact: [
      "Removes old assistant background components",
      "Reduces legacy search/assistant hooks",
      "No downside for most Windows 11 users",
    ],
    expected: { cpu: "Low", ram: "Low", network: "None", disk: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },
  {
    id: "search-highlights",
    title: "Disable Search Highlights",
    description: "Disables online search highlight content and suggested web cards.",
    impact: [
      "Removes extra web content from search UI",
      "Reduces background fetches related to highlights",
      "Cleaner, faster-feeling search experience",
    ],
    expected: { network: "Low", cpu: "Low", disk: "None", ram: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },
  {
    id: "disable-delivery-opt",
    title: "Disable Delivery Optimization",
    description: "Stops Windows from using your bandwidth to upload Windows Update data to other PCs on the internet.",
    impact: [
      "Prevents unexpected background upload activity during gameplay",
      "Eliminates bandwidth sharing to Microsoft's P2P update network",
      "Updates still download normally — only upload sharing is disabled",
    ],
    expected: { network: "Low", cpu: "Low", disk: "None", ram: "None", gpu: "None", latency: "Low", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "disable-wer",
    title: "Disable Windows Error Reporting",
    description: "Disables the Windows Error Reporting service and crash data collection.",
    impact: [
      "Eliminates WER background disk writes and upload activity after crashes",
      "Reduces service overhead from WerSvc sitting in memory",
      "Crash dump data will not be sent to Microsoft — no local debugging impact",
    ],
    expected: { cpu: "Low", disk: "Low", network: "Low", ram: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", level: "Advanced", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "disable-activity-history",
    title: "Disable Activity History",
    description: "Disables Windows Timeline and Activity Feed — stops local and cloud activity recording.",
    impact: [
      "Stops Windows logging app/document/activity history in the background",
      "Prevents uploading activity data to Microsoft account",
      "Windows Timeline and Jump List history features no longer populate",
    ],
    expected: { cpu: "Low", disk: "Low", network: "Low", ram: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: true,
  },

  // ── Gaming and Latency ────────────────────────────────────────────────────

  {
    id: "gaming-mode",
    title: "Enable Gaming Mode",
    description: "Enables Windows Game Mode prioritization for games.",
    impact: [
      "Prioritizes the game process and reduces background update interference",
      "Can improve consistency during gameplay on some systems",
      "May not help in every title, but usually low risk",
    ],
    expected: { latency: "Low", cpu: "Low", gpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Low" },
    category: "Gaming and Latency", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },
  {
    id: "tune-priority",
    title: "Tune Priority",
    description: "Adjusts foreground vs background scheduling preference for snappier input response.",
    impact: [
      "Can improve responsiveness of the active game/app",
      "May reduce background task priority while gaming",
      "Risk: heavy background workloads can feel slower (streams/encodes/downloads)",
    ],
    expected: { latency: "Medium", cpu: "None", gpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Medium" },
    category: "Gaming and Latency", level: "Advanced", risk: "Moderate",
    supported: true, requiresAdmin: true,
  },
  {
    id: "irq-priority",
    title: "Optimize IRQ Priority",
    description: "Sets high priority for GPU and network interrupt handling.",
    impact: [
      "Can reduce latency for GPU and network operations",
      "May improve responsiveness in competitive games",
      "Risk: incorrect settings can cause instability",
    ],
    expected: { latency: "Medium", gpu: "Low", network: "Low", cpu: "None", ram: "None", disk: "None", stabilityRisk: "High" },
    category: "Gaming and Latency", level: "Experimental", risk: "Risky",
    requiresAgent: true,
    supported: false,
    unsupportedReason: "Requires kernel-level interrupt affinity control not accessible from user-mode.",
    requiresAdmin: true,
  },
  {
    id: "synth-timers",
    title: "Disable Synthetic Timers",
    description: "Reduces latency overhead from virtualized timer sources.",
    impact: [
      "Can reduce timer-related latency in some scenarios",
      "May improve consistency in time-sensitive applications",
      "Risk: can cause issues with virtualization features",
    ],
    expected: { latency: "Low", cpu: "Low", ram: "None", gpu: "None", disk: "None", network: "None", stabilityRisk: "Medium" },
    category: "Gaming and Latency", level: "Experimental", risk: "Risky",
    requiresReboot: true, supported: true, requiresAdmin: true,
  },
  {
    id: "timer-res",
    title: "Timer Resolution",
    description: "Requests a lower system timer resolution to improve timing precision.",
    impact: [
      "Can reduce input latency in some scenarios",
      "May improve frametime consistency in some games",
      "Risk: increases power usage and can raise CPU wakeups",
    ],
    expected: { latency: "High", cpu: "Low", gpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Medium" },
    category: "Gaming and Latency", level: "Advanced", risk: "Safe",
    requiresAgent: true,
    supported: false,
    unsupportedReason: "Timer resolution requires a persistent runtime process. The effect resets on process exit. Requires agent.",
    requiresAdmin: false,
  },
  {
    id: "disable-fso",
    title: "Disable Fullscreen Optimizations",
    description: "Forces games to use true exclusive fullscreen instead of DWM-managed borderless mode.",
    impact: [
      "Can reduce GPU scheduling overhead introduced by DWM interception",
      "Ensures lower input latency in latency-sensitive titles that respond to exclusive FS mode",
      "Some capture tools or Alt-Tab behavior may feel different",
    ],
    expected: { latency: "Low", gpu: "Low", cpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Low" },
    category: "Gaming and Latency", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },
  {
    id: "usb-selective-suspend",
    title: "Disable USB Selective Suspend",
    description: "Prevents Windows from suspending USB ports to save power — eliminates USB-induced latency spikes.",
    impact: [
      "Eliminates brief stutter or missed input caused by USB device wakeup latency",
      "Keeps mice, keyboards, and controllers in fully-active state at all times",
      "Small increase in idle power draw — minimal on desktop systems",
    ],
    expected: { latency: "Medium", cpu: "None", ram: "None", disk: "None", gpu: "None", network: "None", stabilityRisk: "Low" },
    category: "Gaming and Latency", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: true,
  },
  {
    id: "mmcss-gaming",
    title: "Optimize MMCSS for Gaming",
    description: "Sets Multimedia Class Scheduler SystemResponsiveness to 0 and tunes the Games task profile for maximum CPU allocation.",
    impact: [
      "Removes background CPU reservation — game gets more of every scheduler quantum",
      "Raises GPU priority hint for the Games MMCSS task to 8",
      "Risk: background workloads (streams, encodes) may be starved under load",
    ],
    expected: { latency: "Medium", cpu: "Medium", gpu: "Low", ram: "None", disk: "None", network: "None", stabilityRisk: "Medium" },
    category: "Gaming and Latency", level: "Advanced", risk: "Moderate",
    supported: true, requiresAdmin: true,
  },

  // ── Input ─────────────────────────────────────────────────────────────────

  {
    id: "disable-pointer-precision",
    title: "Disable Enhanced Pointer Precision",
    description: "Turns off Windows mouse acceleration so pointer movement maps 1:1 to physical motion.",
    impact: [
      "Removes variable mouse acceleration — pointer moves exactly as far as you move the mouse",
      "Critical for consistent aiming in FPS games — muscle memory becomes reliable",
      "Takes full effect at next login; does not affect hardware DPI setting",
    ],
    expected: { latency: "Low", cpu: "None", ram: "None", disk: "None", gpu: "None", network: "None", stabilityRisk: "None" },
    category: "Input", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },

  // ── GPU and Graphics ──────────────────────────────────────────────────────

  {
    id: "desktop-comp",
    title: "Disable Desktop Composition",
    description: "Legacy tweak targeting Desktop Window Manager behavior (not recommended on modern Windows).",
    impact: [
      "Can cause visual glitches or broken transparency effects",
      "May reduce GPU composition overhead in rare legacy scenarios",
      "Risk: can worsen stability or performance on Windows 10/11 (Experimental)",
    ],
    expected: { gpu: "Medium", latency: "Low", cpu: "Low", ram: "None", disk: "None", network: "None", stabilityRisk: "High" },
    category: "GPU and Graphics", level: "Experimental", risk: "Moderate",
    supported: false,
    unsupportedReason: "Desktop Window Manager cannot be disabled on Windows 10/11. This is a legacy Windows XP/Vista feature.",
    requiresAdmin: true,
  },
  {
    id: "hdcp",
    title: "Disable HDCP",
    description: "Removes HDCP copy protection checks for display output.",
    impact: [
      "Can fix display issues with certain monitors/capture cards",
      "Allows capture of protected content on some setups",
      "Risk: some streaming services may not work",
    ],
    expected: { gpu: "None", latency: "None", cpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Medium" },
    category: "GPU and Graphics", level: "Experimental", risk: "Risky",
    supported: false,
    unsupportedReason: "HDCP enforcement is controlled at hardware/driver level and cannot be reliably toggled via software.",
    requiresAdmin: true,
  },
  {
    id: "preemption",
    title: "Enable Hardware GPU Scheduling",
    description: "Enables Hardware Accelerated GPU Scheduling (HwSchMode), allowing the GPU to manage its own memory and scheduling.",
    impact: [
      "Can reduce CPU overhead from GPU scheduling on supported drivers",
      "May improve frame pacing and reduce hitching in some titles",
      "Risk: effect varies by GPU and driver — may do nothing or cause issues on older hardware",
    ],
    expected: { gpu: "Low", latency: "Low", cpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Medium" },
    category: "GPU and Graphics", level: "Advanced", risk: "Safe",
    requiresReboot: true, supported: true, requiresAdmin: true,
  },
  {
    id: "disable-mpo",
    title: "Disable Multi-Plane Overlay",
    description: "Disables DWM Multi-Plane Overlay — fixes black screen flickers and stutter issues on many setups.",
    impact: [
      "Eliminates black screen flashes and DWM stutter caused by MPO on some GPU/driver combos",
      "Recommended if you see flickering, black frames, or screen corruption in games",
      "DWM handles composition differently without MPO — no user-visible downside on most systems",
    ],
    expected: { gpu: "Low", latency: "Low", cpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Low" },
    category: "GPU and Graphics", level: "Advanced", risk: "Safe",
    requiresReboot: true, supported: true, requiresAdmin: true,
  },

  // ── Network ───────────────────────────────────────────────────────────────

  {
    id: "bluetooth",
    title: "Disable Bluetooth",
    description: "Stops Bluetooth services and disables Bluetooth device support.",
    impact: [
      "Reduces background services and device polling",
      "Removes Bluetooth input/audio support while enabled",
      "Can help avoid interference if you only use wired peripherals",
    ],
    expected: { cpu: "Low", network: "None", disk: "None", ram: "None", gpu: "None", latency: "Low", stabilityRisk: "Low" },
    category: "Network", level: "Recommended", risk: "Moderate",
    supported: true, requiresAdmin: true,
  },
  {
    id: "wifi",
    title: "Disable Wi-Fi",
    description: "Disables WLAN services and Wi-Fi network support.",
    impact: [
      "Removes Wi-Fi to ensure only Ethernet is used",
      "Reduces wireless scanning/background network polling",
      "No Wi-Fi connectivity until re-enabled — not recommended for general users",
    ],
    expected: { network: "High", cpu: "Low", disk: "None", ram: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Network", level: "Advanced", risk: "Moderate",
    supported: true, requiresAdmin: true,
  },

  // ── Debloat and Apps ──────────────────────────────────────────────────────

  {
    id: "xbox-bar",
    title: "Remove Xbox Game Bar",
    description: "Disables Xbox Game Bar overlays and background capture hooks.",
    impact: [
      "Removes overlay and background recording components",
      "Can reduce random overlay-related stutters or input delay",
      "Disables Win+G and built-in capture features",
    ],
    expected: { cpu: "Low", gpu: "Low", ram: "Low", latency: "Low", disk: "None", network: "None", stabilityRisk: "Low" },
    category: "Debloat and Apps", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },
  {
    id: "xbox-services",
    title: "Disable Xbox Services",
    description: "Disables Xbox related background services and tasks.",
    impact: [
      "Reduces background tasks tied to Xbox features",
      "Can reduce Game Bar, Xbox app, and related service activity",
      "Xbox login/game services may break for Microsoft Store titles",
    ],
    expected: { cpu: "Low", ram: "Low", network: "Low", disk: "None", gpu: "None", latency: "Low", stabilityRisk: "Medium" },
    category: "Debloat and Apps", level: "Advanced", risk: "Moderate",
    supported: true, requiresAdmin: true,
  },
  {
    id: "fax-printer",
    title: "Disable Fax & Printer",
    description: "Disables printing-related services including spooler components.",
    impact: [
      "Reduces background services if you never print",
      "Removes printer discovery and print queue functionality",
      "Can slightly reduce service overhead on clean gaming builds",
    ],
    expected: { cpu: "Low", ram: "None", disk: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Medium" },
    category: "Debloat and Apps", level: "Advanced", risk: "Safe",
    supported: true, requiresAdmin: true,
  },

  // ── Windows UX ────────────────────────────────────────────────────────────

  {
    id: "compact-explorer",
    title: "Enable Compact Explorer",
    description: "Reduces whitespace in File Explorer for denser file listing.",
    impact: [
      "Shows more files per screen in File Explorer",
      "More efficient use of screen real estate",
      "No performance impact, purely visual preference",
    ],
    expected: { cpu: "None", ram: "None", disk: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "None" },
    category: "Windows UX", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },
  {
    id: "recent-files",
    title: "Hide Recent Files",
    description: "Clears and disables 'Recent files' style history in Quick Access.",
    impact: [
      "Reduces Explorer history tracking",
      "Cleaner privacy and less file activity logging",
      "No performance risk, purely UI/privacy focused",
    ],
    expected: { disk: "Low", cpu: "None", ram: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "None" },
    category: "Windows UX", level: "Recommended", risk: "Safe",
    supported: true, requiresAdmin: false,
  },
  {
    id: "disable-transparency",
    title: "Disable Transparency Effects",
    description: "Turns off frosted-glass blur/transparency effects in the taskbar, Start menu, and Action Center. Reduces DWM GPU compositing work and can improve responsiveness on low-VRAM systems.",
    impact: [
      "Reduces DWM (Desktop Window Manager) GPU compositing overhead",
      "Taskbar, Start, and notification panel become solid-color instead of translucent",
      "Can reduce micro-stutters on GPUs with limited VRAM or weak video encoders",
      "Purely visual — no effect on game performance on modern discrete GPUs",
    ],
    expected: { gpu: "Low", cpu: "None", ram: "None", disk: "None", network: "None", latency: "None", stabilityRisk: "None" },
    category: "Windows UX", level: "Recommended", risk: "Safe",
    whoShouldAvoid: "Nobody — this is purely cosmetic and fully reversible.",
    detailsConfig: {
      registryPath: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
      registryName: "EnableTransparency",
      registryType: "DWORD",
      technicalNote: "Sets EnableTransparency = 0 in Personalize. Takes effect immediately via Personalization settings. No restart needed.",
    },
    supported: true, requiresAdmin: false,
  },
  {
    id: "disable-animations",
    title: "Disable Window Animations",
    description: "Turns off minimize/maximize/open/close window animations and visual transitions. Makes the desktop feel more instant and reduces DWM work per frame.",
    impact: [
      "Windows open and close instantly instead of animating",
      "Taskbar previews and tooltip fades are disabled",
      "Reduces DWM frame compositing budget on low-end systems",
      "Noticeably faster-feeling desktop responsiveness on older hardware",
    ],
    expected: { gpu: "Low", cpu: "Low", ram: "None", disk: "None", network: "None", latency: "Low", stabilityRisk: "None" },
    category: "Windows UX", level: "Recommended", risk: "Safe",
    whoShouldAvoid: "Nobody — this is a purely visual preference and is fully reversible.",
    detailsConfig: {
      registryPath: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects",
      registryName: "VisualFXSetting",
      registryType: "DWORD",
      technicalNote: "Sets VisualFXSetting = 3 (Custom/Minimum) and MinAnimate = 0 under HKCU\\Control Panel\\Desktop\\WindowMetrics. No restart needed.",
    },
    supported: true, requiresAdmin: false,
  },
  {
    id: "show-file-extensions",
    title: "Show File Extensions",
    description: "Forces Windows Explorer to display file extensions (.exe, .dll, .bat, .ps1) in file names. Hidden by default on Windows. Exposing extensions is a basic security measure — it reveals when a file named 'document.pdf.exe' is actually an executable. Also improves clarity when working with multiple file types.",
    impact: [
      "Reduces risk of opening disguised malicious files",
      "Improves file type awareness in Explorer",
    ],
    expected: { cpu: "None", gpu: "None", ram: "None", disk: "None", network: "None", latency: "None", stabilityRisk: "None" },
    category: "Windows UX", level: "Recommended", risk: "Safe",
    whoShouldAvoid: "Nobody. This is a visibility-only change that does not affect system behavior.",
    detailsConfig: {
      registryPath: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
      registryName: "HideFileExt",
      registryType: "DWORD",
      technicalNote: "HideFileExt=0 means extensions ARE shown (the key name is inverted). Windows Explorer is restarted automatically when this tweak is applied to take effect immediately.",
    },
    supported: true, requiresAdmin: false,
  },
  {
    id: "explorer-separate-process",
    title: "Explorer — Separate Process per Window",
    description: "Launches each Explorer folder window in its own process instead of sharing the default Explorer host process. If one folder window crashes, it closes only that window without bringing down the taskbar, desktop, or other open folders. Useful on systems where Explorer crashes are common, or for developers who work with many folders.",
    impact: [
      "Isolates Explorer crashes to single windows",
      "Prevents a single folder crash from killing the taskbar",
    ],
    expected: { cpu: "Low", gpu: "None", ram: "None", disk: "None", network: "None", latency: "None", stabilityRisk: "None" },
    category: "Windows UX", level: "Advanced", risk: "Safe",
    whoShouldAvoid: "Users with limited RAM — each separate Explorer window uses slightly more memory as a standalone process.",
    detailsConfig: {
      registryPath: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
      registryName: "SeparateProcess",
      registryType: "DWORD",
      technicalNote: "SeparateProcess=1. Each folder window spawns a new explorer.exe process. The taskbar remains in the original process. Applies to newly opened windows — existing windows use the old mode until closed.",
    },
    supported: true, requiresAdmin: false,
  },

  // ── Slider tweaks ─────────────────────────────────────────────────────────

  {
    id: "win32-priority-sep",
    title: "Foreground / Background Priority Balance",
    description: "Adjusts how aggressively Windows favors the active foreground application for CPU scheduler quanta. This is the Win32PrioritySeparation DWORD — a real 6-bit bitfield controlling quantum type, quantum length, and foreground boost. Only stepped presets based on real values are exposed — no fake percentage scale.",
    impact: [
      "Foreground-biased presets give the active app more of every CPU scheduler quantum",
      "Higher foreground priority can reduce input latency and improve frame consistency in games",
      "Aggressive settings may starve background tasks (encoders, downloads) during heavy loads",
      "Changes take effect immediately — no restart required",
    ],
    expected: { latency: "Medium", cpu: "Medium", gpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Low" },
    category: "Gaming and Latency", level: "Advanced", risk: "Moderate",
    controlType: "slider",
    whoShouldAvoid: "Video editors, streamers, and developers who run CPU-intensive background tasks alongside foreground apps.",
    sliderConfig: {
      min: 0, max: 3, step: 1, defaultValue: 2, recommendedValue: 26, stepped: true,
      presets: [
        { value: 2,  label: "Balanced (Default)",      description: "Windows default for workstations. Variable quanta, short, foreground boost.",       isDefault: true },
        { value: 22, label: "Favor Foreground",        description: "Fixed quanta, foreground boost. More CPU time for the active window.",               isRecommended: false },
        { value: 26, label: "Gaming (Recommended)",    description: "Fixed short quanta, foreground boost. Common gaming/low-latency recommendation.",    isRecommended: true },
        { value: 38, label: "Maximum Foreground Bias", description: "Fixed long quanta, foreground boost. Most aggressive foreground prioritization.",    isRecommended: false },
      ],
    },
    detailsConfig: {
      registryPath: "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl",
      registryName: "Win32PrioritySeparation",
      registryType: "DWORD",
      technicalNote: "6-bit bitfield: bits[1:0] = priority boost, bits[3:2] = quantum type (fixed/variable), bits[5:4] = quantum length (short/long). Valid gaming preset 26 = 011010 binary.",
    },
    supported: true, requiresAdmin: true,
  },
  {
    id: "mouse-queue-size",
    title: "Mouse Input Queue Depth",
    description: "Disabled for safety: modifying the mouclass kernel driver queue (MouseDataQueueSize) can leave the system with no mouse input, requiring Safe Mode recovery. The latency benefit is negligible and does not justify the risk.",
    impact: [
      "DISABLED — this tweak has been removed from SwitchControl due to unrecoverable input-loss risk",
      "A bad value in the mouclass driver requires Safe Mode registry recovery",
      "The latency reduction is marginal and not worth the stability risk",
    ],
    expected: { latency: "None", cpu: "None", ram: "None", disk: "None", gpu: "None", network: "None", stabilityRisk: "Low" },
    category: "Input", level: "Advanced", risk: "Risky",
    requiresReboot: true, controlType: "slider",
    whoShouldAvoid: "Everyone — this tweak is disabled.",
    sliderConfig: {
      min: 4, max: 16, step: 1, defaultValue: 16, recommendedValue: 16, unit: "entries",
      safeMin: 4, safeMax: 16, cautionLabel: "Disabled — cannot be applied",
    },
    detailsConfig: {
      registryPath: "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters",
      registryName: "MouseDataQueueSize",
      registryType: "DWORD",
      technicalNote: "Controls the mouclass.sys kernel driver input queue. DISABLED in SwitchControl v1.0.2+ due to unrecoverable input-loss risk on certain hardware configurations.",
    },
    supported: false, requiresAdmin: true,
    unsupportedReason: "Disabled for safety: a bad value in the mouclass kernel driver can leave the system with no mouse input, requiring Safe Mode recovery.",
  },
  {
    id: "kbd-queue-size",
    title: "Keyboard Input Queue Depth",
    description: "Disabled for safety: modifying the kbdclass kernel driver queue (KeyboardDataQueueSize) can leave the system with no keyboard input, requiring Safe Mode recovery. This is not reversible through the UI if input stops working.",
    impact: [
      "DISABLED — this tweak has been removed from SwitchControl due to unrecoverable input-loss risk",
      "A bad value in the kbdclass driver requires Safe Mode registry recovery",
      "The latency reduction is marginal and not worth the stability risk",
    ],
    expected: { latency: "None", cpu: "None", ram: "None", disk: "None", gpu: "None", network: "None", stabilityRisk: "Low" },
    category: "Input", level: "Advanced", risk: "Risky",
    requiresReboot: true, controlType: "slider",
    whoShouldAvoid: "Everyone — this tweak is disabled.",
    sliderConfig: {
      min: 4, max: 16, step: 1, defaultValue: 16, recommendedValue: 16, unit: "entries",
      safeMin: 4, safeMax: 16, cautionLabel: "Disabled — cannot be applied",
    },
    detailsConfig: {
      registryPath: "HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters",
      registryName: "KeyboardDataQueueSize",
      registryType: "DWORD",
      technicalNote: "Controls the kbdclass.sys kernel driver queue. DISABLED in SwitchControl v1.0.2+ due to unrecoverable input-loss risk on certain hardware configurations.",
    },
    supported: false, requiresAdmin: true,
    unsupportedReason: "Disabled for safety: a bad value in the kbdclass kernel driver can leave the system with no keyboard input, requiring Safe Mode recovery.",
  },
  {
    id: "sys-responsiveness",
    title: "MMCSS System Responsiveness",
    description: "Controls what percentage of CPU time the Multimedia Class Scheduler Service (MMCSS) reserves for background non-multimedia tasks. 0% gives everything to foreground multimedia/gaming. 20% is the Windows default. Setting to 0 is the standard gaming recommendation — it does not require a restart.",
    impact: [
      "0% gives MMCSS full CPU reservation authority to games and audio — the standard gaming setting",
      "20% is the Windows default — balanced for general desktop use",
      "Setting above 20% reserves more CPU for background tasks, useful for production workloads",
      "Takes effect when the next MMCSS-registered app (game, audio, video) starts — no restart needed",
    ],
    expected: { latency: "Medium", cpu: "Medium", gpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Low" },
    category: "Gaming and Latency", level: "Advanced", risk: "Safe",
    controlType: "slider",
    whoShouldAvoid: "Audio producers and video editors who run background renders — setting to 0 may starve background encoder processes.",
    sliderConfig: {
      min: 0, max: 100, step: 10, defaultValue: 20, recommendedValue: 0, unit: "%",
      safeMin: 0, safeMax: 50, cautionLabel: "Above 50% reserves significant CPU for background tasks",
    },
    detailsConfig: {
      registryPath: "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile",
      registryName: "SystemResponsiveness",
      registryType: "DWORD",
      technicalNote: "MMCSS (Multimedia Class Scheduler) uses this value to determine how much CPU bandwidth to yield to non-multimedia threads. A value of 0 means MMCSS games tasks may claim all available CPU time.",
    },
    supported: true, requiresAdmin: true,
  },
  {
    id: "net-throttle-index",
    title: "Network Throttling Index",
    description: "Controls multimedia-oriented network packet throttling behavior in MMCSS. When set to the default (10), Windows limits network throughput for multimedia apps. Disabling it (0xFFFFFFFF) removes this limit — the standard recommendation for gaming and low-latency workloads.",
    impact: [
      "Disabled (4294967295): removes multimedia network throttling — full bandwidth available at all times",
      "Default (10): Windows limits multimedia app throughput to prevent network floods",
      "Higher values increase throttling — useful for bandwidth-constrained media production environments",
      "Does not affect browser or general Windows network traffic — only MMCSS-registered processes",
    ],
    expected: { network: "Medium", latency: "Low", cpu: "None", ram: "None", disk: "None", gpu: "None", stabilityRisk: "Low" },
    category: "Gaming and Latency", level: "Advanced", risk: "Safe",
    controlType: "slider",
    whoShouldAvoid: "Users on shared or bandwidth-constrained networks where unrestricted game network traffic could cause issues.",
    sliderConfig: {
      min: 0, max: 3, step: 1, defaultValue: 10, recommendedValue: 4294967295, stepped: true,
      presets: [
        { value: 4294967295, label: "Disabled (Gaming)",  description: "No throttling — full network bandwidth available for MMCSS processes.", isRecommended: true },
        { value: 10,         label: "Standard (Default)", description: "Windows default — limits multimedia process network throughput to ~10 packets/ms.", isDefault: true },
        { value: 50,         label: "Moderate",           description: "Moderate throttling — suitable for multimedia production environments." },
        { value: 100,        label: "Heavy",              description: "Heavy throttling — limits multimedia process bandwidth significantly." },
      ],
    },
    detailsConfig: {
      registryPath: "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile",
      registryName: "NetworkThrottlingIndex",
      registryType: "DWORD",
      technicalNote: "0xFFFFFFFF (4294967295) is the special value that disables throttling entirely. Any other value is treated as a packets-per-millisecond limit for MMCSS-registered network activity.",
    },
    supported: true, requiresAdmin: true,
  },
  {
    id: "menu-show-delay",
    title: "Menu Show Delay",
    description: "Controls the delay in milliseconds before Windows shows cascading menus when you hover over them. The default is 400ms. Setting to 0 makes menus appear instantly on hover. This is stored in HKCU and does not require admin or a restart.",
    impact: [
      "0ms makes menus open instantly when hovered — feels much more responsive",
      "400ms is the Windows default — deliberate delay before cascading sub-menus open",
      "No performance impact — purely a responsiveness and UX preference",
      "Takes effect immediately — no restart needed",
    ],
    expected: { cpu: "None", gpu: "None", ram: "None", disk: "None", network: "None", latency: "None", stabilityRisk: "None" },
    category: "Windows UX", level: "Advanced", risk: "Safe",
    controlType: "slider",
    whoShouldAvoid: "Nobody — this is a purely cosmetic and reversible change.",
    sliderConfig: {
      min: 0, max: 400, step: 50, defaultValue: 400, recommendedValue: 0, unit: "ms",
    },
    detailsConfig: {
      registryPath: "HKCU\\Control Panel\\Desktop",
      registryName: "MenuShowDelay",
      registryType: "REG_SZ",
      technicalNote: "Stored as a string (REG_SZ) despite being a numeric value. Windows reads it as a decimal integer. No admin rights needed. Effect is immediate.",
    },
    supported: true, requiresAdmin: false,
  },
  {
    id: "hung-app-timeout",
    title: "Hung Application Timeout",
    description: "Controls how many milliseconds Windows waits before declaring a non-responding application 'hung' and offering to close it. The default is 5000ms. Reducing this makes the 'Not Responding' dialog appear faster when an app freezes, allowing quicker recovery. Raising it gives apps more time before Windows marks them as hung.",
    impact: [
      "Lower values: the 'End Task' dialog appears faster when apps freeze — quicker recovery",
      "Default 5000ms means you wait 5 seconds before Windows offers to force-close a frozen app",
      "Recommendation of 2000ms is a common usability improvement without risking false positives",
      "No performance impact — only affects how quickly the Not Responding state triggers",
    ],
    expected: { cpu: "None", gpu: "None", ram: "None", disk: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "Windows UX", level: "Advanced", risk: "Safe",
    controlType: "slider",
    whoShouldAvoid: "Users running very heavy apps (large game levels, complex spreadsheets) that may legitimately take >2s to respond to a message pump.",
    sliderConfig: {
      min: 1000, max: 15000, step: 500, defaultValue: 5000, recommendedValue: 2000, unit: "ms",
      safeMin: 1500, safeMax: 10000, cautionLabel: "Below 1500ms risks false 'Not Responding' on legitimately busy apps",
    },
    detailsConfig: {
      registryPath: "HKCU\\Control Panel\\Desktop",
      registryName: "HungAppTimeout",
      registryType: "REG_SZ",
      technicalNote: "Stored as a string (REG_SZ). Windows reads it as a decimal millisecond value. Takes effect after re-login or Windows Explorer restart.",
    },
    supported: true, requiresAdmin: false,
  },
  {
    id: "low-level-hooks-timeout",
    title: "Low-Level Hook Timeout",
    description: "Controls how long Windows waits for a low-level keyboard or mouse hook to process an input event before timing it out. Antivirus software, screen readers, macros, and recording tools install these hooks. A slow hook adds input latency system-wide. Lowering this timeout forces Windows to give up on slow hooks faster.",
    impact: [
      "Reduces input stutter from slow hook consumers",
      "Prevents blocked keyboard/mouse events from affecting game frame timing",
    ],
    expected: { cpu: "None", gpu: "None", ram: "None", disk: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "Input", level: "Advanced", risk: "Moderate",
    controlType: "slider",
    whoShouldAvoid: "Users who rely on accessibility software (screen readers, eye-tracking, voice control) or macro programs that install keyboard/mouse hooks.",
    sliderConfig: {
      min: 500, max: 20000, step: 500, defaultValue: 5000, recommendedValue: 1000, unit: "ms",
      safeMin: 1000, safeMax: 15000, cautionLabel: "Values below 1000ms may cause legitimate hooks (e.g. screen readers, accessibility tools) to malfunction.",
      extremeMin: 500, extremeLabel: "Values at or below 500ms are very aggressive. Security software or assistive technology may break.",
    },
    detailsConfig: {
      registryPath: "HKCU\\Control Panel\\Desktop",
      registryName: "LowLevelHooksTimeout",
      registryType: "REG_SZ",
      technicalNote: "Stored as REG_SZ string. Windows reads it as a decimal millisecond value. Takes effect immediately — no restart required. Affects WH_KEYBOARD_LL and WH_MOUSE_LL hooks globally.",
    },
    supported: true, requiresAdmin: false,
  },
  {
    id: "wait-to-kill-app",
    title: "Shutdown App Kill Timeout",
    description: "Controls how many milliseconds Windows waits for an application to respond to the shutdown signal (WM_QUERYENDSESSION) before forcibly terminating it. The Windows default of 20 seconds makes shutdown feel slow. Setting 5000ms is a good balance — most apps save state within 2-3 seconds.",
    impact: [
      "Significantly faster Windows shutdown",
      "Reduces time spent waiting on hung or slow-closing applications",
    ],
    expected: { cpu: "None", gpu: "None", ram: "None", disk: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "Windows UX", level: "Advanced", risk: "Moderate",
    controlType: "slider",
    whoShouldAvoid: "Users running database servers, audio workstations, or video editors locally — these apps need time to flush buffers during shutdown.",
    sliderConfig: {
      min: 1000, max: 20000, step: 1000, defaultValue: 20000, recommendedValue: 5000, unit: "ms",
      safeMin: 2000, safeMax: 20000, cautionLabel: "Values below 2000ms risk force-killing apps before they finish writing data to disk. Use with caution.",
      extremeMin: 1000, extremeLabel: "1000ms is very aggressive. Any app that doesn't respond instantly will be force-killed. Only use if you always close apps before shutdown.",
    },
    detailsConfig: {
      registryPath: "HKCU\\Control Panel\\Desktop",
      registryName: "WaitToKillAppTimeout",
      registryType: "REG_SZ",
      technicalNote: "Stored as REG_SZ string. Windows reads it as a decimal millisecond value. Takes effect on next shutdown. The companion key WaitToKillServiceTimeout (HKLM) controls service shutdown separately.",
    },
    supported: true, requiresAdmin: false,
  },
];

// ── Build final registry with computed premium field ──────────────────────────

export const REGISTRY: RegistryTweak[] = BASE.map(t => ({
  ...t,
  premium: isPremiumTweakById(t.id),
}));

// ── Derived classification arrays ─────────────────────────────────────────────

const supportedToggles = REGISTRY.filter(t => t.supported && t.controlType !== "slider");
const supportedSliders = REGISTRY.filter(t => t.supported && t.controlType === "slider");

/** IDs of supported HKCU (non-admin) toggle tweaks. */
export const HKCU_TOGGLE_IDS: string[] = supportedToggles
  .filter(t => !t.requiresAdmin)
  .map(t => t.id);

/** IDs of supported admin-elevation toggle tweaks. */
export const ADMIN_TOGGLE_IDS: string[] = supportedToggles
  .filter(t => t.requiresAdmin)
  .map(t => t.id);

/** IDs of all supported slider tweaks (admin + HKCU mixed). */
export const SLIDER_IDS: readonly string[] = supportedSliders.map(t => t.id);

/** Map of unsupported tweak IDs → human-readable reason string. */
export const UNSUPPORTED_MAP: Record<string, string> = Object.fromEntries(
  REGISTRY
    .filter(t => !t.supported && t.unsupportedReason)
    .map(t => [t.id, t.unsupportedReason!])
);

// ── Lookup helpers ────────────────────────────────────────────────────────────

/** Get a single tweak by ID. Returns undefined if not found. */
export function getTweak(id: string): RegistryTweak | undefined {
  return REGISTRY.find(t => t.id === id);
}

/** All tweaks including unsupported (for display in the UI). */
export const TWEAKS_DATA: RegistryTweak[] = REGISTRY;

/** Backward-compatible type alias. */
export type Tweak = RegistryTweak;
