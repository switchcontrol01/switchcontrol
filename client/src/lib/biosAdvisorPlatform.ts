/**
 * biosAdvisorPlatform.ts
 *
 * Platform availability metadata for BIOS settings.
 * Kept separate from bios-advisor-data.ts to avoid bloating the data file.
 *
 * Platform scopes:
 *  "all"          — universally applicable, appears in every BIOS
 *  "amd"          — AMD CPU systems only (both desktop and laptop where supported)
 *  "amd-desktop"  — AMD desktop systems; rarely exposed in laptop/OEM BIOS
 *  "intel"        — Intel CPU systems only
 *  "desktop"      — Desktop systems of any brand (OEM laptops often lack these options)
 */

export type PlatformScope = "all" | "amd" | "amd-desktop" | "intel" | "desktop";

export interface PlatformAvailability {
  /** Which CPU/platform this setting applies to */
  scope: PlatformScope;
  /**
   * True when the setting almost never appears in laptop or OEM BIOS menus,
   * even if the hardware technically supports it.
   */
  notAvailableOnLaptop: boolean;
  /**
   * Short note shown as a tooltip/badge when the platform doesn't match.
   * Keep to ≤ 80 chars.
   */
  platformNote?: string;
}

/** Settings not listed here default to { scope: "all", notAvailableOnLaptop: false } */
export const BIOS_PLATFORM: Record<string, PlatformAvailability> = {
  /* ── CPU Scheduling & Latency ─────────────────────────────────────── */
  "cppc": {
    scope: "amd",
    notAvailableOnLaptop: false,
    platformNote: "AMD Collaborative Power and Performance Control — AMD CPUs only",
  },
  "cppc-preferred-cores": {
    scope: "amd",
    notAvailableOnLaptop: false,
    platformNote: "AMD preferred-core scheduling — AMD CPUs only",
  },
  "smt": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "global-cstate": {
    scope: "amd",
    notAvailableOnLaptop: true,
    platformNote: "AMD C-State option — usually hidden in OEM/laptop BIOS",
  },
  "package-cstate": {
    scope: "all",
    notAvailableOnLaptop: true,
    platformNote: "Laptop BIOS rarely exposes this; power policy is managed by OEM firmware",
  },
  "df-cstates": {
    scope: "amd",
    notAvailableOnLaptop: true,
    platformNote: "AMD Data Fabric C-States — typically absent in OEM/laptop BIOS",
  },
  "x2apic": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "hpet": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "core-parking": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "tsc-stability": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "hyper-threading": {
    scope: "intel",
    notAvailableOnLaptop: false,
    platformNote: "Intel Hyper-Threading — Intel CPUs only",
  },

  /* ── Power & Voltage ──────────────────────────────────────────────── */
  "pbo": {
    scope: "amd-desktop",
    notAvailableOnLaptop: true,
    platformNote: "Precision Boost Overdrive — desktop AMD only; most laptop BIOS hides this",
  },
  "curve-optimizer": {
    scope: "amd-desktop",
    notAvailableOnLaptop: true,
    platformNote: "Per-core voltage tuning — desktop AMD only; not exposed in OEM laptop BIOS",
  },
  "power-limit": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "thermal-limit": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "thermal-interface": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "fan-curve": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "oc-profile": {
    scope: "desktop",
    notAvailableOnLaptop: true,
    platformNote: "Overclock profiles — typically unavailable on laptop/OEM BIOS",
  },

  /* ── Memory & Fabric ──────────────────────────────────────────────── */
  "xmp-expo": {
    scope: "all",
    notAvailableOnLaptop: false,
    platformNote: "XMP (Intel) / EXPO (AMD) — available on most desktop boards; some laptops support XMP",
  },
  "mem-timing": {
    scope: "desktop",
    notAvailableOnLaptop: true,
    platformNote: "Manual memory timings — rarely accessible in laptop/OEM BIOS",
  },
  "mem-clk": {
    scope: "desktop",
    notAvailableOnLaptop: true,
    platformNote: "Memory clock override — usually locked in laptop/OEM systems",
  },
  "mem-channels": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "fclk": {
    scope: "amd",
    notAvailableOnLaptop: true,
    platformNote: "AMD Infinity Fabric clock — desktop AMD; usually fixed in laptop BIOS",
  },
  "gear-mode": {
    scope: "intel",
    notAvailableOnLaptop: false,
    platformNote: "Intel Gear mode for high-speed memory — Intel CPUs only",
  },

  /* ── EMI & Signal Integrity ───────────────────────────────────────── */
  "pcie-aspm": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "pcie-gen": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "usb-pwr-mgmt": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "nvme-power": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "spread-spectrum": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "erp-ready": {
    scope: "all",
    notAvailableOnLaptop: false,
  },

  /* ── Platform & Security ──────────────────────────────────────────── */
  "secure-boot": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "csm": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "ftpm-ptpm": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "vbs-hvci": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
  "above-4g-bar": {
    scope: "desktop",
    notAvailableOnLaptop: true,
    platformNote: "Above 4G decoding / Resizable BAR — desktop boards; less common on laptops",
  },
  "iommu": {
    scope: "all",
    notAvailableOnLaptop: false,
  },
};

/**
 * Returns the platform availability record for a setting ID.
 * Falls back to a safe universal default if no entry is defined.
 */
export function getPlatformAvailability(settingId: string): PlatformAvailability {
  return BIOS_PLATFORM[settingId] ?? { scope: "all", notAvailableOnLaptop: false };
}

/**
 * Returns true if the chassis type string indicates a laptop / portable device.
 * Uses the systeminformation `chassisType` string which maps to SMBIOS chassis types.
 */
export function isLaptopChassisType(chassisType: string | null | undefined): boolean {
  if (!chassisType) return false;
  const lower = chassisType.toLowerCase();
  const laptopKeywords = [
    "notebook", "portable", "laptop", "sub-notebook", "sub notebook",
    "handheld", "tablet", "convertible", "detachable",
  ];
  return laptopKeywords.some(kw => lower.includes(kw));
}

/**
 * Infer CPU vendor from a CPU model/brand string (e.g. "AMD Ryzen 9 5900X").
 */
export function detectCpuVendor(cpuString: string | null | undefined): "amd" | "intel" | "unknown" {
  if (!cpuString) return "unknown";
  const lower = cpuString.toLowerCase();
  if (lower.includes("amd") || lower.includes("ryzen") || lower.includes("epyc") || lower.includes("threadripper")) return "amd";
  if (lower.includes("intel") || lower.includes("core i") || lower.includes("xeon") || lower.includes("celeron") || lower.includes("pentium")) return "intel";
  return "unknown";
}

/**
 * Given detected platform info, returns true if a setting is considered
 * unsupported/unlikely for the current user's hardware.
 */
export function isSettingUnsupported(
  settingId: string,
  platform: { isLaptop: boolean; cpuVendor: "amd" | "intel" | "unknown" },
): boolean {
  const avail = getPlatformAvailability(settingId);

  if (platform.isLaptop && avail.notAvailableOnLaptop) return true;

  if (platform.cpuVendor !== "unknown") {
    if (avail.scope === "amd" || avail.scope === "amd-desktop") {
      if (platform.cpuVendor === "intel") return true;
    }
    if (avail.scope === "intel") {
      if (platform.cpuVendor === "amd") return true;
    }
    if (avail.scope === "amd-desktop" && platform.isLaptop) return true;
  }

  return false;
}
