
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

export interface Tweak {
  id: string;
  title: string;
  description: string;
  category: TweakCategory;
  level: TweakLevel;
  risk: RiskLevel;
  requiresAgent?: boolean;
  requiresReboot?: boolean;
}

export const TWEAKS_DATA: Tweak[] = [
  // System and Power
  { id: "hibernation", title: "Disable Hibernation", description: "Frees up storage space equal to RAM size.", category: "System and Power", level: "Recommended", risk: "Safe" },
  { id: "fast-startup", title: "Disable Fast Startup", description: "Ensures clean boot state every time.", category: "System and Power", level: "Experimental", risk: "Risky" },
  { id: "energy-logging", title: "Disable Energy Logging", description: "Stops extensive power event logging.", category: "System and Power", level: "Advanced", risk: "Safe" },
  { id: "maintenance", title: "Disable Maintenance", description: "Prevents automatic maintenance tasks.", category: "System and Power", level: "Recommended", risk: "Safe" },
  { id: "bg-apps", title: "Disable Background Apps", description: "Prevents apps from running in background.", category: "System and Power", level: "Recommended", risk: "Safe" },
  { id: "core-isolation", title: "Disable Core Isolation", description: "Disables VBS/HVCI for performance.", category: "System and Power", level: "Experimental", risk: "Risky", requiresReboot: true },
  { id: "vbs", title: "Disable VBS", description: "Virtualization Based Security.", category: "System and Power", level: "Experimental", risk: "Risky", requiresReboot: true },
  { id: "hyper-v", title: "Disable Hyper-V", description: "Disables virtualization platform.", category: "System and Power", level: "Advanced", risk: "Moderate", requiresReboot: true },
  { id: "p-states", title: "Disable P-States", description: "Forces CPU to max frequency.", category: "System and Power", level: "Experimental", risk: "Risky", requiresAgent: true },
  { id: "notifications", title: "Disable Notifications", description: "Suppress system toasts and sounds.", category: "System and Power", level: "Recommended", risk: "Safe" },
  
  // Memory and Storage
  { id: "mem-opt", title: "Optimize Memory Settings", description: "Adjusts memory management strategies.", category: "Memory and Storage", level: "Recommended", risk: "Safe" },
  { id: "large-system-cache", title: "Disable Large System Cache", description: "Prioritizes programs over file cache.", category: "Memory and Storage", level: "Advanced", risk: "Safe" },
  { id: "page-combining", title: "Disable Page Combining", description: "Reduces CPU usage for memory compression.", category: "Memory and Storage", level: "Advanced", risk: "Safe" },
  { id: "prefetch", title: "Disable Prefetch", description: "Reduces disk I/O on SSDs.", category: "Memory and Storage", level: "Advanced", risk: "Safe" },
  { id: "superfetch", title: "Disable SysMain/Superfetch", description: "Reduces background disk usage.", category: "Memory and Storage", level: "Advanced", risk: "Safe" },
  { id: "storage-sense", title: "Disable Storage Sense", description: "Prevents auto-deletion of files.", category: "Memory and Storage", level: "Recommended", risk: "Safe" },

  // Privacy
  { id: "telemetry", title: "Disable Telemetry", description: "Reduces data sending to Microsoft.", category: "Privacy and Telemetry", level: "Advanced", risk: "Safe" },
  { id: "nvidia-telemetry", title: "Disable NVIDIA Telemetry", description: "Stops NVIDIA driver analytics.", category: "Privacy and Telemetry", level: "Advanced", risk: "Safe" },
  { id: "copilot", title: "Disable Copilot", description: "Removes AI assistant integration.", category: "Privacy and Telemetry", level: "Recommended", risk: "Safe" },
  { id: "cortana", title: "Disable Cortana", description: "Removes legacy assistant.", category: "Privacy and Telemetry", level: "Recommended", risk: "Safe" },
  { id: "search-highlights", title: "Disable Search Highlights", description: "Removes web content from search.", category: "Privacy and Telemetry", level: "Recommended", risk: "Safe" },

  // Gaming
  { id: "gaming-mode", title: "Enable Gaming Mode", description: "Windows Game Mode prioritization.", category: "Gaming and Latency", level: "Recommended", risk: "Safe" },
  { id: "tune-priority", title: "Tune Priority", description: "Adjusts Win32PrioritySeparation.", category: "Gaming and Latency", level: "Advanced", risk: "Moderate" },
  { id: "irq-priority", title: "Optimize IRQ Priority", description: "Sets high priority for GPU/Net.", category: "Gaming and Latency", level: "Experimental", risk: "Risky", requiresAgent: true },
  { id: "synth-timers", title: "Disable Synthetic Timers", description: "Reduces latency overhead.", category: "Gaming and Latency", level: "Experimental", risk: "Risky" },
  { id: "timer-res", title: "Timer Resolution", description: "Sets system timer to 0.5ms.", category: "Gaming and Latency", level: "Advanced", risk: "Safe", requiresAgent: true },

  // GPU
  { id: "desktop-comp", title: "Disable Desktop Composition", description: "Legacy tweak for DWM.", category: "GPU and Graphics", level: "Experimental", risk: "Moderate" },
  { id: "hdcp", title: "Disable HDCP", description: "Removes copy protection checks.", category: "GPU and Graphics", level: "Experimental", risk: "Risky" },
  { id: "preemption", title: "Enable Preemption", description: "Allows GPU context switching.", category: "GPU and Graphics", level: "Advanced", risk: "Safe" },
  
  // Network
  { id: "bluetooth", title: "Disable Bluetooth", description: "Stops Bluetooth services.", category: "Network", level: "Recommended", risk: "Moderate" },
  { id: "wifi", title: "Disable Wi-Fi", description: "Stops WLAN services.", category: "Network", level: "Recommended", risk: "Moderate" },
  
  // Debloat
  { id: "xbox-bar", title: "Remove Xbox Game Bar", description: "Removes overlay features.", category: "Debloat and Apps", level: "Recommended", risk: "Safe" },
  { id: "xbox-services", title: "Disable Xbox Services", description: "Stops background Xbox tasks.", category: "Debloat and Apps", level: "Advanced", risk: "Moderate" },
  { id: "fax-printer", title: "Disable Fax & Printer", description: "Stops spooler services.", category: "Debloat and Apps", level: "Advanced", risk: "Safe" },

  // UX
  { id: "compact-explorer", title: "Enable Compact Explorer", description: "Reduces whitespace in File Explorer.", category: "Windows UX", level: "Recommended", risk: "Safe" },
  { id: "recent-files", title: "Hide Recent Files", description: "Clears Quick Access history.", category: "Windows UX", level: "Recommended", risk: "Safe" },
];

export interface SystemStats {
  cpuName: string;
  cpuCores: number;
  cpuThreads: number;
  gpuName: string;
  totalRamGb: number;
  usedRamGb: number;
  diskName: string;
  diskUsedGb: number;
  diskTotalGb: number;
  vramGb: number;
}

export const MOCK_STATS: SystemStats = {
  cpuName: "AMD Ryzen 7 9800X3D",
  cpuCores: 8,
  cpuThreads: 16,
  gpuName: "AMD Radeon RX 7800 XT",
  totalRamGb: 32,
  usedRamGb: 9.5,
  diskName: "Samsung 990 PRO (C:)",
  diskUsedGb: 450,
  diskTotalGb: 2048,
  vramGb: 16
};
