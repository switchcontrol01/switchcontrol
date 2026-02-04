
export type RiskLevel = "Safe" | "Moderate" | "Risky";
export type TweakLevel = "Recommended" | "Advanced" | "Experimental";
export type TweakCategory = 
  | "System and Power"
  | "Memory and Storage"
  | "Privacy and Telemetry"
  | "Gaming and Latency"
  | "Input"
  | "GPU and Graphics"
  | "Network"
  | "Debloat and Apps"
  | "Windows UX";

export type ImpactLevel = "None" | "Low" | "Medium" | "High";

export interface TweakExpected {
  cpu?: ImpactLevel;
  gpu?: ImpactLevel;
  ram?: ImpactLevel;
  disk?: ImpactLevel;
  network?: ImpactLevel;
  latency?: ImpactLevel;
  stabilityRisk?: ImpactLevel;
}

export interface Tweak {
  id: string;
  title: string;
  description: string;
  impact: string[];
  expected: TweakExpected;
  category: TweakCategory;
  level: TweakLevel;
  risk: RiskLevel;
  requiresAgent?: boolean;
  requiresReboot?: boolean;
}

export const TWEAKS_DATA: Tweak[] = [
  // System and Power
  { 
    id: "hibernation", 
    title: "Disable Hibernation", 
    description: "Disables hibernate and removes hiberfil.sys to free disk space.",
    impact: [
      "Frees disk space roughly equal to installed RAM",
      "Hibernate option removed from power menu and laptop lid actions",
      "Faster shutdown storage footprint with no hibernate file writes"
    ],
    expected: { disk: "High", ram: "None", cpu: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "System and Power", 
    level: "Recommended", 
    risk: "Safe" 
  },
  { 
    id: "fast-startup", 
    title: "Disable Fast Startup", 
    description: "Ensures clean boot state every time by disabling hybrid shutdown.",
    impact: [
      "Forces full shutdown instead of hybrid hibernate",
      "Can fix driver/boot issues caused by stale state",
      "Slightly longer boot times in exchange for cleaner restarts"
    ],
    expected: { disk: "Low", cpu: "None", ram: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "System and Power", 
    level: "Experimental", 
    risk: "Risky" 
  },
  { 
    id: "energy-logging", 
    title: "Disable Energy Logging", 
    description: "Reduces power diagnostics and event logging related to energy usage.",
    impact: [
      "Fewer power diagnostic logs and background writes",
      "Slight reduction in event logging overhead",
      "May reduce data available for battery/power troubleshooting"
    ],
    expected: { disk: "Low", cpu: "Low", ram: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "System and Power", 
    level: "Advanced", 
    risk: "Safe" 
  },
  { 
    id: "maintenance", 
    title: "Disable Maintenance", 
    description: "Disables scheduled automatic maintenance tasks that run in the background.",
    impact: [
      "Reduces background CPU/disk spikes from maintenance schedules",
      "Less unexpected activity while gaming or recording",
      "Some maintenance tasks (like cleanup/diagnostics) may not run automatically"
    ],
    expected: { cpu: "Low", disk: "Low", ram: "None", gpu: "None", network: "None", latency: "Low", stabilityRisk: "Low" },
    category: "System and Power", 
    level: "Recommended", 
    risk: "Safe" 
  },
  { 
    id: "bg-apps", 
    title: "Disable Background Apps", 
    description: "Prevents Store apps and some UWP apps from running in the background.",
    impact: [
      "Reduces background CPU/network usage from apps you are not using",
      "Can improve idle stability and reduce random spikes",
      "Some apps won't update/refresh in the background until opened"
    ],
    expected: { cpu: "Low", ram: "Low", network: "Low", disk: "Low", gpu: "None", latency: "Low", stabilityRisk: "Low" },
    category: "System and Power", 
    level: "Recommended", 
    risk: "Safe" 
  },
  { 
    id: "core-isolation", 
    title: "Disable Core Isolation", 
    description: "Disables VBS/HVCI memory integrity for potential performance gains.",
    impact: [
      "Can reduce virtualization-based security overhead",
      "May improve performance in some CPU-bound scenarios",
      "Risk: reduces security protections against kernel-level attacks"
    ],
    expected: { cpu: "Medium", ram: "Low", gpu: "None", disk: "None", network: "None", latency: "Low", stabilityRisk: "Medium" },
    category: "System and Power", 
    level: "Experimental", 
    risk: "Risky", 
    requiresReboot: true 
  },
  { 
    id: "vbs", 
    title: "Disable VBS", 
    description: "Disables Virtualization Based Security entirely.",
    impact: [
      "Removes VBS overhead from system",
      "Can improve performance in certain workloads",
      "Risk: significantly reduces security against advanced threats"
    ],
    expected: { cpu: "Medium", ram: "Low", gpu: "None", disk: "None", network: "None", latency: "Low", stabilityRisk: "High" },
    category: "System and Power", 
    level: "Experimental", 
    risk: "Risky", 
    requiresReboot: true 
  },
  { 
    id: "hyper-v", 
    title: "Disable Hyper-V", 
    description: "Turns off Microsoft Hyper-V and related virtualization components.",
    impact: [
      "Can reduce virtualization overhead and background services",
      "Improves compatibility with some anti-cheat and performance tweaks",
      "Disables VMs, WSL2 virtualization features, and some sandbox functions"
    ],
    expected: { cpu: "Low", ram: "Low", gpu: "None", disk: "None", network: "None", latency: "Low", stabilityRisk: "Medium" },
    category: "System and Power", 
    level: "Advanced", 
    risk: "Moderate", 
    requiresReboot: true 
  },
  { 
    id: "p-states", 
    title: "Disable P-States", 
    description: "Forces CPU to run at maximum frequency by disabling power states.",
    impact: [
      "Eliminates frequency scaling delays",
      "May improve latency consistency in some games",
      "Risk: significantly increases power usage and heat output"
    ],
    expected: { cpu: "High", latency: "Medium", ram: "None", gpu: "None", disk: "None", network: "None", stabilityRisk: "High" },
    category: "System and Power", 
    level: "Experimental", 
    risk: "Risky", 
    requiresAgent: true 
  },
  { 
    id: "notifications", 
    title: "Disable Notifications", 
    description: "Suppresses Windows toast notifications and notification sounds.",
    impact: [
      "Removes popups that can interrupt aim/recording",
      "Reduces notification-related background triggers",
      "You may miss important system/security notifications"
    ],
    expected: { cpu: "None", ram: "None", disk: "None", network: "None", gpu: "None", latency: "Low", stabilityRisk: "Low" },
    category: "System and Power", 
    level: "Recommended", 
    risk: "Safe" 
  },
  
  // Memory and Storage
  { 
    id: "mem-opt", 
    title: "Optimize Memory Settings", 
    description: "Applies memory manager tuning aimed at lower latency and steadier frametimes.",
    impact: [
      "May reduce stutters caused by memory trimming/management behavior",
      "Can improve frametime consistency in CPU bound scenarios",
      "Risk: overly aggressive settings can reduce stability on some systems"
    ],
    expected: { ram: "Medium", cpu: "Low", latency: "Medium", disk: "None", network: "None", gpu: "None", stabilityRisk: "Medium" },
    category: "Memory and Storage", 
    level: "Recommended", 
    risk: "Safe" 
  },
  { 
    id: "large-system-cache", 
    title: "Disable Large System Cache", 
    description: "Changes caching behavior to prioritize programs over file cache behavior.",
    impact: [
      "Can reduce file cache pressure in some workloads",
      "May improve responsiveness in certain memory-heavy scenarios",
      "Risk: can reduce file caching efficiency depending on usage"
    ],
    expected: { ram: "Medium", disk: "Low", cpu: "Low", latency: "Low", gpu: "None", network: "None", stabilityRisk: "Medium" },
    category: "Memory and Storage", 
    level: "Advanced", 
    risk: "Safe" 
  },
  { 
    id: "page-combining", 
    title: "Disable Page Combining", 
    description: "Disables Windows memory page combining (memory deduplication).",
    impact: [
      "Reduces CPU work spent merging identical memory pages",
      "Can lower micro-stutter during heavy multitasking",
      "Slightly higher RAM usage in exchange for lower background CPU activity"
    ],
    expected: { cpu: "Low", ram: "Low", latency: "Low", disk: "None", network: "None", gpu: "None", stabilityRisk: "Low" },
    category: "Memory and Storage", 
    level: "Advanced", 
    risk: "Safe" 
  },
  { 
    id: "prefetch", 
    title: "Disable Prefetch", 
    description: "Disables Prefetch behavior that tries to speed up app launches using disk patterns.",
    impact: [
      "Reduces disk I/O related to prefetch data generation",
      "Can improve consistency on NVMe systems by removing background prefetch writes",
      "May slightly slow some app launch times after cold boot"
    ],
    expected: { disk: "Medium", cpu: "Low", ram: "None", gpu: "None", network: "None", latency: "Low", stabilityRisk: "Low" },
    category: "Memory and Storage", 
    level: "Advanced", 
    risk: "Safe" 
  },
  { 
    id: "superfetch", 
    title: "Disable SysMain/Superfetch", 
    description: "Disables SysMain preloading and predictive caching behavior.",
    impact: [
      "Reduces background disk usage and service activity",
      "Can improve consistency on fast NVMe systems by removing prefetch noise",
      "May slightly slow app launch times after cold boot on some PCs"
    ],
    expected: { disk: "Medium", cpu: "Low", ram: "Low", latency: "Low", gpu: "None", network: "None", stabilityRisk: "Low" },
    category: "Memory and Storage", 
    level: "Advanced", 
    risk: "Safe" 
  },
  { 
    id: "storage-sense", 
    title: "Disable Storage Sense", 
    description: "Disables automatic storage cleanup and file deletion routines.",
    impact: [
      "Prevents automatic deletion of temporary files and recycle cleanup",
      "More predictable storage behavior for creators and gamers",
      "You must manually manage disk cleanup"
    ],
    expected: { disk: "None", cpu: "None", ram: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "Memory and Storage", 
    level: "Recommended", 
    risk: "Safe" 
  },

  // Privacy
  { 
    id: "telemetry", 
    title: "Disable Telemetry", 
    description: "Reduces Windows diagnostic data collection and related scheduled tasks.",
    impact: [
      "Fewer background telemetry tasks and data uploads",
      "Slight reduction in background CPU/network activity",
      "Some Windows feedback/diagnostics features may be limited"
    ],
    expected: { cpu: "Low", network: "Low", disk: "Low", ram: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", 
    level: "Advanced", 
    risk: "Safe" 
  },
  { 
    id: "nvidia-telemetry", 
    title: "Disable NVIDIA Telemetry", 
    description: "Disables NVIDIA telemetry and analytics scheduled tasks/services.",
    impact: [
      "Reduces NVIDIA background telemetry tasks",
      "Slight reduction in background CPU/disk activity",
      "No effect on GPU performance features themselves"
    ],
    expected: { cpu: "Low", disk: "Low", ram: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", 
    level: "Advanced", 
    risk: "Safe" 
  },
  { 
    id: "copilot", 
    title: "Disable Copilot", 
    description: "Disables Windows Copilot integration and entry points.",
    impact: [
      "Removes Copilot UI and background integration hooks",
      "Reduces distractions and potential background activity",
      "Does not affect core Windows functionality"
    ],
    expected: { cpu: "Low", ram: "Low", disk: "None", network: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", 
    level: "Recommended", 
    risk: "Safe" 
  },
  { 
    id: "cortana", 
    title: "Disable Cortana", 
    description: "Disables legacy Cortana components and entry points.",
    impact: [
      "Removes old assistant background components",
      "Reduces legacy search/assistant hooks",
      "No downside for most Windows 11 users"
    ],
    expected: { cpu: "Low", ram: "Low", network: "None", disk: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", 
    level: "Recommended", 
    risk: "Safe" 
  },
  { 
    id: "search-highlights", 
    title: "Disable Search Highlights", 
    description: "Disables online search highlight content and suggested web cards.",
    impact: [
      "Removes extra web content from search UI",
      "Reduces background fetches related to highlights",
      "Cleaner, faster-feeling search experience"
    ],
    expected: { network: "Low", cpu: "Low", disk: "None", ram: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Privacy and Telemetry", 
    level: "Recommended", 
    risk: "Safe" 
  },

  // Gaming
  { 
    id: "gaming-mode", 
    title: "Enable Gaming Mode", 
    description: "Enables Windows Game Mode prioritization for games.",
    impact: [
      "Prioritizes the game process and reduces background update interference",
      "Can improve consistency during gameplay on some systems",
      "May not help in every title, but usually low risk"
    ],
    expected: { latency: "Low", cpu: "Low", gpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Low" },
    category: "Gaming and Latency", 
    level: "Recommended", 
    risk: "Safe" 
  },
  { 
    id: "tune-priority", 
    title: "Tune Priority", 
    description: "Adjusts foreground vs background scheduling preference for snappier input response.",
    impact: [
      "Can improve responsiveness of the active game/app",
      "May reduce background task priority while gaming",
      "Risk: heavy background workloads can feel slower (streams/encodes/downloads)"
    ],
    expected: { latency: "Medium", cpu: "None", gpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Medium" },
    category: "Gaming and Latency", 
    level: "Advanced", 
    risk: "Moderate" 
  },
  { 
    id: "irq-priority", 
    title: "Optimize IRQ Priority", 
    description: "Sets high priority for GPU and network interrupt handling.",
    impact: [
      "Can reduce latency for GPU and network operations",
      "May improve responsiveness in competitive games",
      "Risk: incorrect settings can cause instability"
    ],
    expected: { latency: "Medium", gpu: "Low", network: "Low", cpu: "None", ram: "None", disk: "None", stabilityRisk: "High" },
    category: "Gaming and Latency", 
    level: "Experimental", 
    risk: "Risky", 
    requiresAgent: true 
  },
  { 
    id: "synth-timers", 
    title: "Disable Synthetic Timers", 
    description: "Reduces latency overhead from virtualized timer sources.",
    impact: [
      "Can reduce timer-related latency in some scenarios",
      "May improve consistency in time-sensitive applications",
      "Risk: can cause issues with virtualization features"
    ],
    expected: { latency: "Low", cpu: "Low", ram: "None", gpu: "None", disk: "None", network: "None", stabilityRisk: "Medium" },
    category: "Gaming and Latency", 
    level: "Experimental", 
    risk: "Risky" 
  },
  { 
    id: "timer-res", 
    title: "Timer Resolution", 
    description: "Requests a lower system timer resolution to improve timing precision.",
    impact: [
      "Can reduce input latency in some scenarios",
      "May improve frametime consistency in some games",
      "Risk: increases power usage and can raise CPU wakeups"
    ],
    expected: { latency: "High", cpu: "Low", gpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Medium" },
    category: "Gaming and Latency", 
    level: "Advanced", 
    risk: "Safe", 
    requiresAgent: true 
  },

  // GPU
  { 
    id: "desktop-comp", 
    title: "Disable Desktop Composition", 
    description: "Legacy tweak targeting Desktop Window Manager behavior (not recommended on modern Windows).",
    impact: [
      "Can cause visual glitches or broken transparency effects",
      "May reduce GPU composition overhead in rare legacy scenarios",
      "Risk: can worsen stability or performance on Windows 10/11 (Experimental)"
    ],
    expected: { gpu: "Medium", latency: "Low", cpu: "Low", ram: "None", disk: "None", network: "None", stabilityRisk: "High" },
    category: "GPU and Graphics", 
    level: "Experimental", 
    risk: "Moderate" 
  },
  { 
    id: "hdcp", 
    title: "Disable HDCP", 
    description: "Removes HDCP copy protection checks for display output.",
    impact: [
      "Can fix display issues with certain monitors/capture cards",
      "Allows capture of protected content on some setups",
      "Risk: some streaming services may not work"
    ],
    expected: { gpu: "None", latency: "None", cpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Medium" },
    category: "GPU and Graphics", 
    level: "Experimental", 
    risk: "Risky" 
  },
  { 
    id: "preemption", 
    title: "Enable Preemption", 
    description: "Adjusts GPU scheduling behavior for smoother context switching (varies by driver).",
    impact: [
      "Can improve responsiveness during GPU context switching",
      "May reduce hitching when overlays or capture tools are active",
      "Risk: effect depends heavily on GPU/driver and may do nothing"
    ],
    expected: { gpu: "Low", latency: "Low", cpu: "None", ram: "None", disk: "None", network: "None", stabilityRisk: "Medium" },
    category: "GPU and Graphics", 
    level: "Advanced", 
    risk: "Safe" 
  },
  
  // Network
  { 
    id: "bluetooth", 
    title: "Disable Bluetooth", 
    description: "Stops Bluetooth services and disables Bluetooth device support.",
    impact: [
      "Reduces background services and device polling",
      "Removes Bluetooth input/audio support while enabled",
      "Can help avoid interference if you only use wired peripherals"
    ],
    expected: { cpu: "Low", network: "None", disk: "None", ram: "None", gpu: "None", latency: "Low", stabilityRisk: "Low" },
    category: "Network", 
    level: "Recommended", 
    risk: "Moderate" 
  },
  { 
    id: "wifi", 
    title: "Disable Wi-Fi", 
    description: "Disables WLAN services and Wi-Fi network support.",
    impact: [
      "Removes Wi-Fi to ensure only Ethernet is used",
      "Reduces wireless scanning/background network polling",
      "No Wi-Fi connectivity until re-enabled"
    ],
    expected: { network: "High", cpu: "Low", disk: "None", ram: "None", gpu: "None", latency: "None", stabilityRisk: "Low" },
    category: "Network", 
    level: "Recommended", 
    risk: "Moderate" 
  },
  
  // Debloat
  { 
    id: "xbox-bar", 
    title: "Remove Xbox Game Bar", 
    description: "Disables Xbox Game Bar overlays and background capture hooks.",
    impact: [
      "Removes overlay and background recording components",
      "Can reduce random overlay-related stutters or input delay",
      "Disables Win+G and built-in capture features"
    ],
    expected: { cpu: "Low", gpu: "Low", ram: "Low", latency: "Low", disk: "None", network: "None", stabilityRisk: "Low" },
    category: "Debloat and Apps", 
    level: "Recommended", 
    risk: "Safe" 
  },
  { 
    id: "xbox-services", 
    title: "Disable Xbox Services", 
    description: "Disables Xbox related background services and tasks.",
    impact: [
      "Reduces background tasks tied to Xbox features",
      "Can reduce Game Bar, Xbox app, and related service activity",
      "Xbox login/game services may break for Microsoft Store titles"
    ],
    expected: { cpu: "Low", ram: "Low", network: "Low", disk: "None", gpu: "None", latency: "Low", stabilityRisk: "Medium" },
    category: "Debloat and Apps", 
    level: "Advanced", 
    risk: "Moderate" 
  },
  { 
    id: "fax-printer", 
    title: "Disable Fax & Printer", 
    description: "Disables printing-related services including spooler components.",
    impact: [
      "Reduces background services if you never print",
      "Removes printer discovery and print queue functionality",
      "Can slightly reduce service overhead on clean gaming builds"
    ],
    expected: { cpu: "Low", ram: "None", disk: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "Medium" },
    category: "Debloat and Apps", 
    level: "Advanced", 
    risk: "Safe" 
  },

  // UX
  { 
    id: "compact-explorer", 
    title: "Enable Compact Explorer", 
    description: "Reduces whitespace in File Explorer for denser file listing.",
    impact: [
      "Shows more files per screen in File Explorer",
      "More efficient use of screen real estate",
      "No performance impact, purely visual preference"
    ],
    expected: { cpu: "None", ram: "None", disk: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "None" },
    category: "Windows UX", 
    level: "Recommended", 
    risk: "Safe" 
  },
  { 
    id: "recent-files", 
    title: "Hide Recent Files", 
    description: "Clears and disables 'Recent files' style history in Quick Access.",
    impact: [
      "Reduces Explorer history tracking",
      "Cleaner privacy and less file activity logging",
      "No performance risk, purely UI/privacy focused"
    ],
    expected: { disk: "Low", cpu: "None", ram: "None", gpu: "None", network: "None", latency: "None", stabilityRisk: "None" },
    category: "Windows UX", 
    level: "Recommended", 
    risk: "Safe" 
  },
];

export interface SystemStats {
  cpuName: string;
  cpuCores: number;
  cpuThreads: number;
  cpuSpeed: string;
  gpuName: string;
  gpuVendor: string;
  totalRamGb: number;
  usedRamGb: number;
  freeRamGb: number;
  diskName: string;
  diskUsedGb: number;
  diskTotalGb: number;
  vramGb: number;
  osName: string;
  osVersion: string;
  osArch: string;
  hostname: string;
}

export const MOCK_STATS: SystemStats = {
  cpuName: "Unavailable",
  cpuCores: 0,
  cpuThreads: 0,
  cpuSpeed: "Unavailable",
  gpuName: "Unavailable",
  gpuVendor: "Unavailable",
  totalRamGb: 0,
  usedRamGb: 0,
  freeRamGb: 0,
  diskName: "Unavailable",
  diskUsedGb: 0,
  diskTotalGb: 0,
  vramGb: 0,
  osName: "Unavailable",
  osVersion: "Unavailable",
  osArch: "Unavailable",
  hostname: "Unavailable"
};

export interface AIRecommendation {
  id: string;
  action: string;
  tag: "Safe" | "Advanced" | "Requires local agent";
}

export interface AIScanResult {
  timestamp: string;
  summary: string;
  recommendations: AIRecommendation[];
  optimized?: boolean;
}
