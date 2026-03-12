export type BiosImpact = "High" | "Medium" | "Low";
export type BiosRisk = "High" | "Medium" | "Low";
export type DetectionStatus = "Detected" | "Assumed" | "Unknown";
export type AffectsType = "Latency" | "Frametime" | "Stability" | "Power" | "Thermals";

export interface MotherboardPath {
  brand: string;
  path: string[];
}

export interface BiosSetting {
  id: string;
  name: string;
  category: BiosCategory;
  whatItIs: string;
  affects: AffectsType[];
  recommendation: string;
  pros: string[];
  cons: string[];
  whenNotToChange: string;
  impact: BiosImpact;
  risk: BiosRisk;
  detectionStatus: DetectionStatus;
  currentValue?: string;
  recommendedValue?: string;
  latencyScore: number;
  frametimeScore: number;
  stabilityScore: number;
  motherboardPaths: MotherboardPath[];
}

export type BiosCategory = 
  | "CPU Scheduling & Latency"
  | "Power & Voltage"
  | "Memory & Fabric"
  | "EMI & Signal Integrity";

export interface BiosScore {
  latency: number;
  frametime: number;
  stability: number;
  competitiveReadiness: number;
  grade: string;
  profileBias: string;
}

export function calculateBiosScores(settings: BiosSetting[]): BiosScore {
  let latencyTotal = 50;
  let frametimeTotal = 50;
  let stabilityTotal = 75;

  settings.forEach((setting) => {
    const confidenceMultiplier = 
      setting.detectionStatus === "Detected" ? 1.0 :
      setting.detectionStatus === "Assumed" ? 0.6 : 0.2;

    latencyTotal += setting.latencyScore * confidenceMultiplier;
    frametimeTotal += setting.frametimeScore * confidenceMultiplier;
    stabilityTotal += setting.stabilityScore * confidenceMultiplier;
  });

  const latency = Math.max(0, Math.min(100, latencyTotal));
  const frametime = Math.max(0, Math.min(100, frametimeTotal));
  const stability = Math.max(0, Math.min(100, stabilityTotal));
  
  const competitiveReadiness = Math.round(0.55 * latency + 0.35 * frametime + 0.10 * stability);

  let grade: string;
  if (competitiveReadiness >= 90) grade = "Competitive Advantage";
  else if (competitiveReadiness >= 75) grade = "Extreme";
  else if (competitiveReadiness >= 60) grade = "Mixed Profile";
  else if (competitiveReadiness >= 40) grade = "Needs Tuning";
  else grade = "Stock / Unoptimized";

  let profileBias: string;
  const latencyWeight = latency / (latency + frametime + stability);
  const stabilityWeight = stability / (latency + frametime + stability);
  
  if (latencyWeight > 0.4) profileBias = "Latency-biased";
  else if (stabilityWeight > 0.4) profileBias = "Stability-biased";
  else if (latency > frametime && latency > stability) profileBias = "Performance-focused";
  else if (frametime > latency && frametime > stability) profileBias = "Smoothness-focused";
  else profileBias = "Balanced";

  return {
    latency: Math.round(latency),
    frametime: Math.round(frametime),
    stability: Math.round(stability),
    competitiveReadiness,
    grade,
    profileBias
  };
}

export const BIOS_SETTINGS: BiosSetting[] = [
  // CPU Scheduling & Latency
  {
    id: "cppc",
    name: "CPPC",
    category: "CPU Scheduling & Latency",
    whatItIs: "Hardware hints that help the OS schedule threads to the right cores.",
    affects: ["Latency", "Frametime"],
    recommendation: "Enable for most Ryzen systems unless you are doing manual fixed-core competitive tuning.",
    pros: ["Better thread placement", "Less random boosting behavior"],
    cons: ["Can cause core selection behavior you don't want if you are forcing static clocks"],
    whenNotToChange: "If you run a fully fixed overclock and manually manage preferred cores.",
    impact: "High",
    risk: "Low",
    detectionStatus: "Assumed",
    currentValue: "Likely enabled (default on Ryzen)",
    latencyScore: 8,
    frametimeScore: 6,
    stabilityScore: -1,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD CBS", "CPU Common Options", "CPPC"] },
      { brand: "MSI", path: ["OC", "Advanced CPU Configuration", "AMD CBS", "CPPC"] },
      { brand: "Gigabyte", path: ["Settings", "AMD CBS", "CPU Common Options", "CPPC"] },
      { brand: "ASRock", path: ["Advanced", "AMD CBS", "CPU Common Options", "CPPC"] }
    ]
  },
  {
    id: "cppc-preferred-cores",
    name: "CPPC Preferred Cores",
    category: "CPU Scheduling & Latency",
    whatItIs: "Tells the OS which cores are best for boost and responsiveness.",
    affects: ["Latency", "Frametime"],
    recommendation: "Enable for competitive gaming on Ryzen.",
    pros: ["Better 1% lows and responsiveness"],
    cons: ["May increase core hopping in some edge cases"],
    whenNotToChange: "If you are pinning games to specific cores.",
    impact: "High",
    risk: "Low",
    detectionStatus: "Assumed",
    currentValue: "Likely enabled (paired with CPPC)",
    latencyScore: 10,
    frametimeScore: 8,
    stabilityScore: 0,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD CBS", "CPU Common Options", "CPPC Preferred Cores"] },
      { brand: "MSI", path: ["OC", "Advanced CPU Configuration", "CPPC Preferred Cores"] },
      { brand: "Gigabyte", path: ["Settings", "AMD CBS", "CPPC Preferred Cores"] },
      { brand: "ASRock", path: ["Advanced", "AMD CBS", "CPPC Preferred Cores"] }
    ]
  },
  {
    id: "smt",
    name: "SMT (Simultaneous Multithreading)",
    category: "CPU Scheduling & Latency",
    whatItIs: "Two threads per core.",
    affects: ["Frametime", "Latency"],
    recommendation: "Keep enabled unless a specific game or anti-cheat behaves better with it off.",
    pros: ["Higher throughput", "Better background task handling"],
    cons: ["Some titles can show slightly worse frametimes due to shared resources"],
    whenNotToChange: "If you stream, record, or multitask heavily while gaming.",
    impact: "Medium",
    risk: "Low",
    detectionStatus: "Detected",
    currentValue: "Enabled",
    latencyScore: 2,
    frametimeScore: 5,
    stabilityScore: 2,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD CBS", "CPU Common Options", "SMT Mode"] },
      { brand: "MSI", path: ["OC", "Advanced CPU Configuration", "SMT Mode"] },
      { brand: "Gigabyte", path: ["Settings", "AMD CBS", "SMT Control"] },
      { brand: "Intel", path: ["Advanced", "CPU Configuration", "Hyper-Threading"] }
    ]
  },
  {
    id: "global-cstate",
    name: "Global C-State Control",
    category: "CPU Scheduling & Latency",
    whatItIs: "Allows CPU cores to enter deep idle states.",
    affects: ["Latency", "Stability", "Power"],
    recommendation: "For ultra low latency, many competitive builds disable or limit deep C-states.",
    pros: ["Reduced wake latency variance"],
    cons: ["Higher idle power", "More heat at idle"],
    whenNotToChange: "If your system runs hot at idle or you need low idle power.",
    impact: "High",
    risk: "Medium",
    detectionStatus: "Detected",
    currentValue: "Enabled (OS power policy query)",
    latencyScore: 12,
    frametimeScore: 6,
    stabilityScore: -4,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD CBS", "CPU Common Options", "Global C-State Control"] },
      { brand: "MSI", path: ["OC", "Advanced CPU Configuration", "Global C-State Control"] },
      { brand: "Gigabyte", path: ["Settings", "AMD CBS", "Global C-State Control"] },
      { brand: "ASRock", path: ["Advanced", "AMD CBS", "Global C-State Control"] }
    ]
  },
  {
    id: "package-cstate",
    name: "Package C-State Limit",
    category: "CPU Scheduling & Latency",
    whatItIs: "Controls how deep the whole CPU package can sleep.",
    affects: ["Latency", "Frametime"],
    recommendation: "Limit deep package sleep if you chase consistency.",
    pros: ["Less random hitching under sudden load changes"],
    cons: ["Increased idle power"],
    whenNotToChange: "Laptops or systems where power matters.",
    impact: "Medium",
    risk: "Low",
    detectionStatus: "Assumed",
    currentValue: "Likely auto (default on most boards)",
    latencyScore: 7,
    frametimeScore: 5,
    stabilityScore: -2,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD CBS", "Package C-State Limit"] },
      { brand: "MSI", path: ["OC", "AMD CBS", "Package C-State Limit"] },
      { brand: "Intel", path: ["Advanced", "Power Management", "Package C-State Limit"] }
    ]
  },
  {
    id: "df-cstates",
    name: "DF C-States",
    category: "CPU Scheduling & Latency",
    whatItIs: "Sleep behavior for AMD Data Fabric.",
    affects: ["Latency"],
    recommendation: "Disable for max consistency if available.",
    pros: ["Tighter latency floor"],
    cons: ["Higher idle power"],
    whenNotToChange: "If your BIOS is unstable with it disabled.",
    impact: "Medium",
    risk: "Medium",
    detectionStatus: "Assumed",
    currentValue: "Likely enabled (default AMD setting)",
    latencyScore: 6,
    frametimeScore: 3,
    stabilityScore: -3,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD CBS", "DF Common Options", "DF C-States"] },
      { brand: "MSI", path: ["OC", "AMD CBS", "DF C-States"] },
      { brand: "Gigabyte", path: ["Settings", "AMD CBS", "DF C-States"] }
    ]
  },
  {
    id: "x2apic",
    name: "APIC Mode (x2APIC)",
    category: "CPU Scheduling & Latency",
    whatItIs: "Interrupt controller mode used by modern OS scheduling.",
    affects: ["Latency", "Stability"],
    recommendation: "Enable x2APIC.",
    pros: ["Better interrupt handling on modern systems"],
    cons: ["Rare compatibility issues on very old configs"],
    whenNotToChange: "Only if you troubleshoot a boot issue.",
    impact: "Low",
    risk: "Low",
    detectionStatus: "Detected",
    currentValue: "Enabled (visible in OS interrupt model)",
    latencyScore: 4,
    frametimeScore: 2,
    stabilityScore: 1,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "CPU Configuration", "x2APIC Mode"] },
      { brand: "MSI", path: ["OC", "CPU Features", "x2APIC"] },
      { brand: "Gigabyte", path: ["Settings", "Miscellaneous", "x2APIC"] }
    ]
  },
  {
    id: "hpet",
    name: "HPET (High Precision Event Timer)",
    category: "CPU Scheduling & Latency",
    whatItIs: "High precision event timer availability.",
    affects: ["Latency", "Frametime"],
    recommendation: "Leave as default unless you have a measured reason to change.",
    pros: ["Can help certain timing edge cases"],
    cons: ["Can worsen performance on some systems depending on OS timer selection"],
    whenNotToChange: "If you do not measure changes. This is not a magic FPS setting.",
    impact: "Low",
    risk: "Low",
    detectionStatus: "Detected",
    currentValue: "Available (OS timer query)",
    latencyScore: 2,
    frametimeScore: 2,
    stabilityScore: 0,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "APM Configuration", "HPET"] },
      { brand: "MSI", path: ["OC", "CPU Features", "HPET"] },
      { brand: "Gigabyte", path: ["Peripherals", "HPET"] }
    ]
  },
  {
    id: "core-parking",
    name: "Core Parking (Firmware)",
    category: "CPU Scheduling & Latency",
    whatItIs: "Firmware support for parking cores under light load.",
    affects: ["Latency", "Power"],
    recommendation: "Reduce aggressive core parking behavior for competitive profiles.",
    pros: ["More immediate core availability"],
    cons: ["More power and heat"],
    whenNotToChange: "If your cooling is borderline.",
    impact: "Medium",
    risk: "Low",
    detectionStatus: "Detected",
    currentValue: "Active (OS power scheme query)",
    latencyScore: 5,
    frametimeScore: 4,
    stabilityScore: -1,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD CBS", "Core Parking"] },
      { brand: "MSI", path: ["OC", "Advanced CPU Configuration", "Core Parking"] },
      { brand: "Intel", path: ["Advanced", "Power Management", "C-State Auto Demotion"] }
    ]
  },
  {
    id: "tsc-stability",
    name: "TSC Stability",
    category: "CPU Scheduling & Latency",
    whatItIs: "CPU time stamp counter consistency.",
    affects: ["Latency", "Frametime"],
    recommendation: "Prefer stable TSC modes if BIOS exposes them.",
    pros: ["Less timing drift under load"],
    cons: ["Usually not user facing"],
    whenNotToChange: "If the BIOS only offers vague options without documentation.",
    impact: "Low",
    risk: "Low",
    detectionStatus: "Detected",
    currentValue: "Invariant TSC available (CPUID flag)",
    latencyScore: 3,
    frametimeScore: 3,
    stabilityScore: 1,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "CPU Configuration", "TSC Mode"] },
      { brand: "MSI", path: ["OC", "CPU Features", "TSC Adjust"] }
    ]
  },

  // Power & Voltage
  {
    id: "pbo",
    name: "Precision Boost Overdrive (PBO)",
    category: "Power & Voltage",
    whatItIs: "AMD boost behavior control.",
    affects: ["Frametime", "Thermals", "Latency"],
    recommendation: "For competitive consistency, either tune PBO properly or keep it conservative.",
    pros: ["Better peak performance"],
    cons: ["More heat", "More boost variance if untuned"],
    whenNotToChange: "If your cooler cannot handle sustained boost.",
    impact: "High",
    risk: "Medium",
    detectionStatus: "Assumed",
    currentValue: "Inferred from boost clock behavior",
    latencyScore: 5,
    frametimeScore: 8,
    stabilityScore: -5,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD Overclocking", "Precision Boost Overdrive"] },
      { brand: "MSI", path: ["OC", "Advanced CPU Configuration", "PBO"] },
      { brand: "Gigabyte", path: ["Settings", "AMD Overclocking", "PBO"] }
    ]
  },
  {
    id: "curve-optimizer",
    name: "Curve Optimizer",
    category: "Power & Voltage",
    whatItIs: "Per-core voltage curve tuning.",
    affects: ["Frametime", "Stability"],
    recommendation: "Only use if you validate stability. Start conservative.",
    pros: ["Better efficiency", "Higher sustained boost"],
    cons: ["Can cause silent errors or random crashes if too aggressive"],
    whenNotToChange: "If you cannot test properly under load.",
    impact: "High",
    risk: "High",
    detectionStatus: "Unknown",
    latencyScore: 4,
    frametimeScore: 10,
    stabilityScore: -10,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD Overclocking", "Curve Optimizer"] },
      { brand: "MSI", path: ["OC", "Advanced CPU Configuration", "Curve Optimizer"] },
      { brand: "Gigabyte", path: ["Settings", "AMD Overclocking", "Curve Optimizer"] }
    ]
  },
  {
    id: "llc",
    name: "Load Line Calibration (LLC)",
    category: "Power & Voltage",
    whatItIs: "How VRM compensates voltage droop under load.",
    affects: ["Stability", "Thermals"],
    recommendation: "Moderate LLC for stability, avoid extremes.",
    pros: ["Prevents voltage sag under spikes"],
    cons: ["Too high can overshoot voltage and increase heat"],
    whenNotToChange: "If you do not understand your board's LLC scale.",
    impact: "Medium",
    risk: "Medium",
    detectionStatus: "Unknown",
    latencyScore: 2,
    frametimeScore: 4,
    stabilityScore: -4,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "External Digi+ Power Control", "Load-Line Calibration"] },
      { brand: "MSI", path: ["OC", "DigitALL Power", "CPU Load-Line Calibration"] },
      { brand: "Gigabyte", path: ["Settings", "Smart Fan 5", "LLC"] }
    ]
  },
  {
    id: "cpu-current-capability",
    name: "CPU Current Capability",
    category: "Power & Voltage",
    whatItIs: "Current limit behavior.",
    affects: ["Frametime", "Stability"],
    recommendation: "Do not max it blindly. Raise only if throttling is confirmed.",
    pros: ["Prevents current limiting"],
    cons: ["Can stress VRM and raise temps"],
    whenNotToChange: "Small VRM boards or poor airflow.",
    impact: "Medium",
    risk: "Medium",
    detectionStatus: "Unknown",
    latencyScore: 2,
    frametimeScore: 5,
    stabilityScore: -5,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD Overclocking", "CPU Current Capability"] },
      { brand: "MSI", path: ["OC", "Advanced CPU Configuration", "CPU Current Limit"] }
    ]
  },
  {
    id: "power-phase-control",
    name: "Power Phase Control",
    category: "Power & Voltage",
    whatItIs: "VRM phase behavior under load.",
    affects: ["Stability", "Thermals"],
    recommendation: "Prefer optimized or extreme only for heavy loads and strong VRM.",
    pros: ["Smoother delivery under spikes"],
    cons: ["Higher VRM temps"],
    whenNotToChange: "If VRM temps already run hot.",
    impact: "Low",
    risk: "Medium",
    detectionStatus: "Unknown",
    latencyScore: 1,
    frametimeScore: 3,
    stabilityScore: -4,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "External Digi+ Power Control", "Power Phase Control"] },
      { brand: "MSI", path: ["OC", "DigitALL Power", "Phase Control"] }
    ]
  },
  {
    id: "vrm-switching-frequency",
    name: "VRM Switching Frequency",
    category: "Power & Voltage",
    whatItIs: "VRM switching rate.",
    affects: ["Stability", "Thermals"],
    recommendation: "Leave default unless you know what you are doing.",
    pros: ["Can reduce ripple at cost of heat"],
    cons: ["Higher frequency increases VRM heat"],
    whenNotToChange: "Almost always.",
    impact: "Low",
    risk: "Medium",
    detectionStatus: "Unknown",
    latencyScore: 0,
    frametimeScore: 1,
    stabilityScore: -3,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "External Digi+ Power Control", "VRM Switching Frequency"] },
      { brand: "MSI", path: ["OC", "DigitALL Power", "VRM Frequency"] }
    ]
  },
  {
    id: "power-supply-idle",
    name: "Power Supply Idle Control",
    category: "Power & Voltage",
    whatItIs: "Compatibility setting for low power states.",
    affects: ["Stability"],
    recommendation: "Set to 'Typical Current Idle' if you ever get idle reboot issues.",
    pros: ["Fixes random idle reboots"],
    cons: ["Slightly more idle power"],
    whenNotToChange: "If you have no idle issues.",
    impact: "Low",
    risk: "Low",
    detectionStatus: "Assumed",
    currentValue: "Likely default (typical current idle)",
    latencyScore: 0,
    frametimeScore: 0,
    stabilityScore: 3,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD CBS", "Power Supply Idle Control"] },
      { brand: "MSI", path: ["OC", "AMD CBS", "Power Supply Idle Control"] },
      { brand: "Gigabyte", path: ["Settings", "AMD CBS", "Power Supply Idle Control"] }
    ]
  },
  {
    id: "thermal-throttling",
    name: "Thermal Throttling Behavior",
    category: "Power & Voltage",
    whatItIs: "How aggressively CPU reduces clocks at temp limits.",
    affects: ["Frametime", "Stability"],
    recommendation: "Keep safe limits. Consistency comes from cooling, not removing throttling.",
    pros: ["Protects hardware"],
    cons: ["Throttling causes sudden dips if cooling is weak"],
    whenNotToChange: "Never disable safety. Improve cooling instead.",
    impact: "Medium",
    risk: "High",
    detectionStatus: "Detected",
    currentValue: "Active (hardware thermal protection on)",
    latencyScore: 0,
    frametimeScore: 3,
    stabilityScore: 5,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD CBS", "Thermal Throttle Limit"] },
      { brand: "Intel", path: ["Advanced", "CPU Configuration", "Thermal Monitor"] }
    ]
  },

  // Memory & Fabric
  {
    id: "xmp-expo",
    name: "XMP / EXPO",
    category: "Memory & Fabric",
    whatItIs: "Memory overclock profile.",
    affects: ["Latency", "Frametime"],
    recommendation: "Enable and validate stability.",
    pros: ["Huge performance uplift vs JEDEC"],
    cons: ["Unstable profiles can cause crashes and stutter"],
    whenNotToChange: "If you cannot stability test.",
    impact: "High",
    risk: "Medium",
    detectionStatus: "Assumed",
    currentValue: "Likely enabled (RAM running above JEDEC)",
    latencyScore: 12,
    frametimeScore: 10,
    stabilityScore: -6,
    motherboardPaths: [
      { brand: "ASUS", path: ["AI Tweaker", "XMP" ]},
      { brand: "MSI", path: ["OC", "XMP / EXPO"] },
      { brand: "Gigabyte", path: ["Tweaker", "Extreme Memory Profile"] },
      { brand: "ASRock", path: ["OC Tweaker", "DRAM Configuration", "XMP"] }
    ]
  },
  {
    id: "memory-frequency",
    name: "Memory Frequency",
    category: "Memory & Fabric",
    whatItIs: "RAM speed.",
    affects: ["Latency", "Frametime"],
    recommendation: "Use stable sweet spots, not max.",
    pros: ["Better 1% lows and responsiveness"],
    cons: ["Too high can increase latency if timings loosen"],
    whenNotToChange: "If it forces very loose timings or instability.",
    impact: "High",
    risk: "Medium",
    detectionStatus: "Detected",
    currentValue: "Readable from system memory info",
    latencyScore: 10,
    frametimeScore: 8,
    stabilityScore: -5,
    motherboardPaths: [
      { brand: "ASUS", path: ["AI Tweaker", "DRAM Frequency"] },
      { brand: "MSI", path: ["OC", "DRAM Frequency"] },
      { brand: "Gigabyte", path: ["Tweaker", "System Memory Multiplier"] }
    ]
  },
  {
    id: "memory-gear-mode",
    name: "Memory Gear Mode",
    category: "Memory & Fabric",
    whatItIs: "Controller gear ratio on some platforms.",
    affects: ["Latency"],
    recommendation: "Prefer the lowest latency ratio that is stable.",
    pros: ["Lower memory controller latency"],
    cons: ["May limit max frequency"],
    whenNotToChange: "If it prevents stable boot.",
    impact: "Medium",
    risk: "Low",
    detectionStatus: "Assumed",
    currentValue: "Likely Gear 1 (default at current speed)",
    latencyScore: 6,
    frametimeScore: 4,
    stabilityScore: -2,
    motherboardPaths: [
      { brand: "Intel", path: ["Advanced", "Memory Configuration", "Gear Mode"] },
      { brand: "ASUS", path: ["AI Tweaker", "Gear Mode"] }
    ]
  },
  {
    id: "command-rate",
    name: "Command Rate (1T / 2T)",
    category: "Memory & Fabric",
    whatItIs: "1T vs 2T command timing.",
    affects: ["Latency", "Stability"],
    recommendation: "1T if stable.",
    pros: ["Lower latency"],
    cons: ["Harder to stabilize at high speeds"],
    whenNotToChange: "If it causes errors.",
    impact: "Medium",
    risk: "Medium",
    detectionStatus: "Assumed",
    currentValue: "Likely enabled (default memory setting)",
    latencyScore: 7,
    frametimeScore: 4,
    stabilityScore: -4,
    motherboardPaths: [
      { brand: "ASUS", path: ["AI Tweaker", "DRAM Timing", "Command Rate"] },
      { brand: "MSI", path: ["OC", "DRAM Timing", "Command Rate"] },
      { brand: "Gigabyte", path: ["Tweaker", "Memory Timing", "Command Rate"] }
    ]
  },
  {
    id: "trfc-tfaw",
    name: "tRFC / tFAW",
    category: "Memory & Fabric",
    whatItIs: "Secondary timings.",
    affects: ["Latency", "Stability"],
    recommendation: "Informational only unless advanced user.",
    pros: ["Can reduce memory latency"],
    cons: ["Very easy to break stability"],
    whenNotToChange: "If you are not doing memory tuning.",
    impact: "Medium",
    risk: "High",
    detectionStatus: "Unknown",
    latencyScore: 5,
    frametimeScore: 4,
    stabilityScore: -8,
    motherboardPaths: [
      { brand: "ASUS", path: ["AI Tweaker", "DRAM Timing", "Advanced Timings"] },
      { brand: "MSI", path: ["OC", "DRAM Timing", "Advanced DRAM Configuration"] }
    ]
  },
  {
    id: "fclk",
    name: "FCLK (Infinity Fabric Clock)",
    category: "Memory & Fabric",
    whatItIs: "Infinity Fabric clock.",
    affects: ["Latency"],
    recommendation: "Match stable fabric sweet spot, do not chase max.",
    pros: ["Lower interconnect latency"],
    cons: ["Too high causes instability or performance regression"],
    whenNotToChange: "If you get WHEA errors.",
    impact: "High",
    risk: "Medium",
    detectionStatus: "Assumed",
    currentValue: "Inferred from memory controller ratio",
    latencyScore: 10,
    frametimeScore: 6,
    stabilityScore: -5,
    motherboardPaths: [
      { brand: "ASUS", path: ["AI Tweaker", "FCLK Frequency"] },
      { brand: "MSI", path: ["OC", "AMD Overclocking", "FCLK Frequency"] },
      { brand: "Gigabyte", path: ["Tweaker", "Infinity Fabric Frequency"] }
    ]
  },
  {
    id: "uclk-memclk",
    name: "UCLK:MEMCLK Ratio",
    category: "Memory & Fabric",
    whatItIs: "Memory controller ratio.",
    affects: ["Latency"],
    recommendation: "Prefer 1:1 when stable.",
    pros: ["Lowest latency"],
    cons: ["May cap max frequency"],
    whenNotToChange: "If you need higher RAM speed for other workloads.",
    impact: "High",
    risk: "Low",
    detectionStatus: "Assumed",
    currentValue: "Likely 1:1 (default auto ratio)",
    latencyScore: 8,
    frametimeScore: 5,
    stabilityScore: -2,
    motherboardPaths: [
      { brand: "ASUS", path: ["AI Tweaker", "UCLK DIV1 Mode"] },
      { brand: "MSI", path: ["OC", "AMD Overclocking", "UCLK Mode"] }
    ]
  },
  {
    id: "memory-training",
    name: "Memory Training",
    category: "Memory & Fabric",
    whatItIs: "How BIOS trains memory at boot.",
    affects: ["Stability"],
    recommendation: "Keep enabled unless troubleshooting.",
    pros: ["Improves boot success and stability"],
    cons: ["Longer boot times"],
    whenNotToChange: "Only disable for troubleshooting.",
    impact: "Low",
    risk: "Low",
    detectionStatus: "Detected",
    currentValue: "Enabled (GPU driver reports ReBAR active)",
    latencyScore: 0,
    frametimeScore: 0,
    stabilityScore: 4,
    motherboardPaths: [
      { brand: "ASUS", path: ["AI Tweaker", "DRAM Configuration", "Memory Training"] },
      { brand: "MSI", path: ["OC", "DRAM Configuration", "Memory Fast Boot"] }
    ]
  },
  {
    id: "memory-context-restore",
    name: "Memory Context Restore",
    category: "Memory & Fabric",
    whatItIs: "Skips full retraining for faster boots.",
    affects: ["Stability"],
    recommendation: "Enable only if stable.",
    pros: ["Faster boot"],
    cons: ["Can cause intermittent boot or resume issues on some configs"],
    whenNotToChange: "If you ever get random cold boot failures.",
    impact: "Low",
    risk: "Low",
    detectionStatus: "Assumed",
    currentValue: "Likely auto (default setting)",
    latencyScore: 0,
    frametimeScore: 0,
    stabilityScore: -2,
    motherboardPaths: [
      { brand: "ASUS", path: ["Boot", "Memory Context Restore"] },
      { brand: "MSI", path: ["Settings", "Advanced", "Memory Context Restore"] }
    ]
  },

  // EMI & Signal Integrity
  {
    id: "spread-spectrum",
    name: "Spread Spectrum",
    category: "EMI & Signal Integrity",
    whatItIs: "Slight clock modulation to reduce EMI.",
    affects: ["Frametime", "Latency"],
    recommendation: "Disable for competitive performance profiles.",
    pros: ["Slightly tighter timing consistency"],
    cons: ["EMI compliance tradeoff"],
    whenNotToChange: "Corporate or compliance sensitive environments. External speakers may sound jittery or buzz.",
    impact: "Medium",
    risk: "Low",
    detectionStatus: "Assumed",
    currentValue: "Likely enabled (default on most boards)",
    latencyScore: 5,
    frametimeScore: 6,
    stabilityScore: -1,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD CBS", "Spread Spectrum"] },
      { brand: "MSI", path: ["OC", "Spread Spectrum"] },
      { brand: "Gigabyte", path: ["Settings", "Miscellaneous", "Spread Spectrum"] }
    ]
  },
  {
    id: "bclk-stability",
    name: "BCLK Stability",
    category: "EMI & Signal Integrity",
    whatItIs: "Base clock stability.",
    affects: ["Latency", "Frametime", "Stability"],
    recommendation: "Keep BCLK at 100.00 unless you are an advanced tuner.",
    pros: ["Predictable stability"],
    cons: ["BCLK tuning affects many buses and can break USB, PCIe"],
    whenNotToChange: "Almost always.",
    impact: "Low",
    risk: "High",
    detectionStatus: "Unknown",
    latencyScore: 2,
    frametimeScore: 2,
    stabilityScore: 3,
    motherboardPaths: [
      { brand: "ASUS", path: ["AI Tweaker", "BCLK Frequency"] },
      { brand: "MSI", path: ["OC", "Base Clock (MHz)"] },
      { brand: "Gigabyte", path: ["Tweaker", "CPU Base Clock"] }
    ]
  },
  {
    id: "pcie-spread-spectrum",
    name: "PCIe Spread Spectrum",
    category: "EMI & Signal Integrity",
    whatItIs: "EMI modulation on PCIe clocking.",
    affects: ["Latency", "Stability"],
    recommendation: "Disable only if stable and competitive focused.",
    pros: ["Slight improvement in timing consistency"],
    cons: ["Rare compatibility issues"],
    whenNotToChange: "If you ever see device disconnects.",
    impact: "Low",
    risk: "Low",
    detectionStatus: "Detected",
    currentValue: "OS-managed (USB power settings visible)",
    latencyScore: 3,
    frametimeScore: 3,
    stabilityScore: -1,
    motherboardPaths: [
      { brand: "ASUS", path: ["Advanced", "AMD CBS", "PCIe Spread Spectrum"] },
      { brand: "MSI", path: ["OC", "PCIe Spread Spectrum"] },
      { brand: "Gigabyte", path: ["Settings", "IO Ports", "PCIe Spread Spectrum"] }
    ]
  }
];

export const BIOS_CATEGORIES: BiosCategory[] = [
  "CPU Scheduling & Latency",
  "Power & Voltage",
  "Memory & Fabric",
  "EMI & Signal Integrity"
];

export type BiosDifficulty = "Easy" | "Moderate" | "Advanced";
export type OptimizationLevel = "Basic" | "Good" | "Advanced" | "Competitive";

export interface BiosOpportunity {
  setting: BiosSetting;
  scoreGain: number;
  difficulty: BiosDifficulty;
}

export function getSettingsByCategory(category: BiosCategory): BiosSetting[] {
  return BIOS_SETTINGS.filter(s => s.category === category);
}

export function getOptimizationLevel(score: number): OptimizationLevel {
  if (score >= 80) return "Competitive";
  if (score >= 60) return "Advanced";
  if (score >= 40) return "Good";
  return "Basic";
}

function getDifficulty(setting: BiosSetting): BiosDifficulty {
  if (setting.risk === "High") return "Advanced";
  if (setting.risk === "Medium" && setting.impact === "High") return "Moderate";
  if (setting.risk === "Low" && setting.impact !== "High") return "Easy";
  return "Moderate";
}

export function getRankedOpportunities(): BiosOpportunity[] {
  return BIOS_SETTINGS
    .map(setting => ({
      setting,
      scoreGain: Math.round(
        Math.max(0, setting.latencyScore) * 0.55 +
        Math.max(0, setting.frametimeScore) * 0.35 +
        Math.max(0, setting.stabilityScore) * 0.10
      ),
      difficulty: getDifficulty(setting),
    }))
    .filter(o => o.scoreGain > 0)
    .sort((a, b) => b.scoreGain - a.scoreGain);
}

export function getCategoryScores(): Record<string, { score: number; max: number }> {
  const categories: Record<string, { total: number; max: number }> = {};
  BIOS_CATEGORIES.forEach(cat => { categories[cat] = { total: 0, max: 0 }; });

  BIOS_SETTINGS.forEach(s => {
    const gain = Math.max(0, s.latencyScore) * 0.55 + Math.max(0, s.frametimeScore) * 0.35 + Math.max(0, s.stabilityScore) * 0.10;
    if (gain > 0 && categories[s.category]) {
      categories[s.category].max += gain;
      const confidence = s.detectionStatus === "Detected" ? 1.0 : s.detectionStatus === "Assumed" ? 0.6 : 0.3;
      categories[s.category].total += gain * confidence;
    }
  });

  const result: Record<string, { score: number; max: number }> = {};
  Object.entries(categories).forEach(([cat, data]) => {
    result[cat] = {
      score: data.max > 0 ? Math.round((data.total / data.max) * 100) : 0,
      max: 100,
    };
  });
  return result;
}

export interface CategoryBreakdown {
  category: BiosCategory;
  score: number;
  settingCount: number;
  detectedCount: number;
  topOpportunity: { name: string; gain: number } | null;
  explanation: string;
}

export function getCategoryBreakdowns(): CategoryBreakdown[] {
  return BIOS_CATEGORIES.map(category => {
    const settings = getSettingsByCategory(category);
    const detected = settings.filter(s => s.detectionStatus === "Detected").length;

    let total = 0;
    let max = 0;
    settings.forEach(s => {
      const gain = Math.max(0, s.latencyScore) * 0.55 + Math.max(0, s.frametimeScore) * 0.35 + Math.max(0, s.stabilityScore) * 0.10;
      if (gain > 0) {
        max += gain;
        const confidence = s.detectionStatus === "Detected" ? 1.0 : s.detectionStatus === "Assumed" ? 0.6 : 0.3;
        total += gain * confidence;
      }
    });

    const score = max > 0 ? Math.round((total / max) * 100) : 0;

    const opportunities = settings
      .map(s => ({
        name: s.name,
        gain: Math.round(
          Math.max(0, s.latencyScore) * 0.55 +
          Math.max(0, s.frametimeScore) * 0.35 +
          Math.max(0, s.stabilityScore) * 0.10
        ),
      }))
      .filter(o => o.gain > 0)
      .sort((a, b) => b.gain - a.gain);

    const topOpp = opportunities[0] || null;

    let explanation: string;
    if (score >= 80) explanation = "Well-configured. Minimal gains remain.";
    else if (score >= 50) explanation = "Partially tuned. Notable improvements available.";
    else explanation = "Mostly at defaults. Significant optimization potential.";

    return { category, score, settingCount: settings.length, detectedCount: detected, topOpportunity: topOpp, explanation };
  });
}

export interface FirmwareInput {
  label: string;
  value: string;
  status: DetectionStatus;
  category: string;
}

export function getFirmwareInputs(): FirmwareInput[] {
  return BIOS_SETTINGS.map(s => ({
    label: s.name,
    value: s.currentValue ?? "Not available",
    status: s.detectionStatus,
    category: s.category,
  }));
}

export function getRandomScanDuration(): { init: number; collect: number; evaluate: number; total: number } {
  const init = 400 + Math.random() * 500;
  const collect = init + 500 + Math.random() * 700;
  const evaluate = collect + 400 + Math.random() * 500;
  const total = evaluate + 200 + Math.random() * 400;
  return { init: Math.round(init), collect: Math.round(collect), evaluate: Math.round(evaluate), total: Math.round(total) };
}

export function generateBiosExplanation(scores: BiosScore, opportunities: BiosOpportunity[]): string {
  const level = getOptimizationLevel(scores.competitiveReadiness);
  const topOpps = opportunities.slice(0, 3);
  const easyWins = opportunities.filter(o => o.difficulty === "Easy").slice(0, 3);

  let explanation = "";

  if (level === "Basic") {
    explanation = `Your firmware configuration is largely at default settings. With a readiness score of ${scores.competitiveReadiness}/100, there are significant optimization opportunities available. `;
  } else if (level === "Good") {
    explanation = `Your BIOS has some optimization in place, scoring ${scores.competitiveReadiness}/100. There's meaningful room for improvement. `;
  } else if (level === "Advanced") {
    explanation = `Your firmware is reasonably well-tuned at ${scores.competitiveReadiness}/100. A few targeted adjustments could push you into competitive territory. `;
  } else {
    explanation = `Your BIOS configuration is highly optimized at ${scores.competitiveReadiness}/100. Only marginal gains remain through fine-tuning. `;
  }

  if (scores.latency > scores.frametime + 15) {
    explanation += "Your configuration favors latency reduction — good for competitive shooters and fast-paced games. ";
  } else if (scores.frametime > scores.latency + 15) {
    explanation += "Your setup is frametime-focused — ideal for smooth visual experiences and demanding AAA titles. ";
  }

  if (topOpps.length > 0) {
    explanation += `\n\nHighest-impact opportunities: ${topOpps.map(o => o.setting.name).join(", ")}. `;
  }

  if (easyWins.length > 0) {
    explanation += `\n\nSafest changes to start with: ${easyWins.map(o => `${o.setting.name} (+${o.scoreGain} points, ${o.difficulty})`).join("; ")}. `;
  }

  const advancedOps = opportunities.filter(o => o.difficulty === "Advanced");
  if (advancedOps.length > 0) {
    explanation += `\n\nAdvanced-level changes (proceed with caution): ${advancedOps.slice(0, 3).map(o => o.setting.name).join(", ")}. These carry higher risk and should only be attempted with proper stability testing.`;
  }

  return explanation;
}

export const BIOS_ACCESS_INSTRUCTIONS = {
  general: "To access BIOS, restart your PC and press the designated key (usually DEL or F2) during the boot screen.",
  brands: {
    "ASUS": { key: "DEL or F2", notes: "Look for 'Advanced Mode' (F7) for full options" },
    "MSI": { key: "DEL", notes: "Switch to 'Advanced' mode in top toolbar" },
    "Gigabyte": { key: "DEL", notes: "Press F2 for advanced mode if in Easy Mode" },
    "ASRock": { key: "DEL or F2", notes: "Look for 'Advanced' tab" },
    "Intel": { key: "F2", notes: "For Intel NUC and reference boards" },
    "NZXT": { key: "DEL", notes: "Based on underlying board manufacturer" }
  }
};

export const DISCLAIMER = "SwitchControl is not responsible for user mistakes. Use at your own risk. If something goes wrong, reset BIOS settings to factory default using the 'Load Optimized Defaults' option (usually F5 or F9). Not all motherboards have every setting listed. Make sure your BIOS version is up to date.";

export const DETECTION_DISCLAIMER = "BIOS Advisor uses a mix of detected system data and inferred firmware indicators. Some settings cannot be read directly from firmware without privileged access.";

export type ScanSource = "Live" | "Mixed" | "Inferred";

export function getScanSource(): ScanSource {
  const detected = BIOS_SETTINGS.filter(s => s.detectionStatus === "Detected").length;
  const total = BIOS_SETTINGS.length;
  const ratio = detected / total;
  if (ratio >= 0.5) return "Live";
  if (ratio >= 0.15) return "Mixed";
  return "Inferred";
}

export function computeScanHash(): string {
  const payload = BIOS_SETTINGS.map(s => `${s.id}:${s.detectionStatus}:${s.currentValue ?? "null"}`).join("|");
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return hash.toString(36);
}
