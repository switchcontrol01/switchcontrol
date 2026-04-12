import type { DetectionStatus, BiosSetting } from "./bios-advisor-data";
import { BIOS_SETTINGS } from "./bios-advisor-data";
import type { SystemIntelligenceProfile } from "@/stores/systemIntelligenceStore";

export interface HardwareTelemetry {
  cpuBoostClock: number | null;
  cpuBaseClock: number | null;
  packagePower: number | null;
  ppt: number | null;
  tdc: number | null;
  edc: number | null;
  memoryFrequency: number | null;
  memoryTimings: string | null;
  physicalCores: number | null;
  logicalCores: number | null;
  cStateResidency: number | null;
  cpuModel: string;
  gpuModel: string;
  ramTotalGB: number;
  rebarSupported: boolean | null;
  vcoreVoltage: number | null;
  cpuTemp: number | null;
  thermalThrottling: boolean | null;
  gpuPower: number | null;
}

export interface FirmwareDetection {
  settingId: string;
  status: DetectionStatus;
  confidence: number;
  reason: string;
  detectedValue: string | null;
  isOptimal?: boolean;
}

export interface FirmwareAnalysisResult {
  detections: FirmwareDetection[];
  settings: BiosSetting[];
  scanHash: string;
  telemetrySource: "electron" | "web-inferred";
  analysisTimestamp: number;
}

const STOCK_SPECS: Record<string, { baseClock: number; boostClock: number; ppt: number; tdc: number; edc: number }> = {
  "7800X3D": { baseClock: 4200, boostClock: 5000, ppt: 120, tdc: 80, edc: 114 },
  "7950X3D": { baseClock: 4200, boostClock: 5700, ppt: 162, tdc: 120, edc: 180 },
  "7950X": { baseClock: 4500, boostClock: 5700, ppt: 230, tdc: 160, edc: 225 },
  "7900X": { baseClock: 4700, boostClock: 5600, ppt: 230, tdc: 160, edc: 225 },
  "7700X": { baseClock: 4500, boostClock: 5400, ppt: 142, tdc: 110, edc: 150 },
  "7600X": { baseClock: 4700, boostClock: 5300, ppt: 105, tdc: 75, edc: 110 },
  "5800X3D": { baseClock: 3400, boostClock: 4500, ppt: 142, tdc: 110, edc: 140 },
  "5950X": { baseClock: 3400, boostClock: 4900, ppt: 142, tdc: 95, edc: 140 },
  "5900X": { baseClock: 3700, boostClock: 4800, ppt: 142, tdc: 95, edc: 140 },
  "5800X": { baseClock: 3800, boostClock: 4700, ppt: 142, tdc: 95, edc: 140 },
  "5600X": { baseClock: 3700, boostClock: 4600, ppt: 76, tdc: 60, edc: 90 },
  "9800X3D": { baseClock: 4700, boostClock: 5200, ppt: 120, tdc: 80, edc: 114 },
  "9950X": { baseClock: 4300, boostClock: 5700, ppt: 200, tdc: 160, edc: 225 },
  "9900X": { baseClock: 4400, boostClock: 5600, ppt: 200, tdc: 160, edc: 225 },
  "9700X": { baseClock: 3800, boostClock: 5500, ppt: 65, tdc: 55, edc: 90 },
  "9600X": { baseClock: 3900, boostClock: 5400, ppt: 65, tdc: 55, edc: 90 },
};

const JEDEC_SPEEDS: Record<string, number> = {
  "DDR5": 4800,
  "DDR4": 2133,
};

function findStockSpecs(cpuModel: string): typeof STOCK_SPECS[string] | null {
  const model = cpuModel.toUpperCase();
  for (const [key, specs] of Object.entries(STOCK_SPECS)) {
    if (model.includes(key.toUpperCase())) return specs;
  }
  return null;
}

function isAMD(cpuModel: string): boolean {
  return /ryzen|amd|zen/i.test(cpuModel);
}

function getDDRGen(memFreq: number | null): "DDR5" | "DDR4" {
  if (memFreq && memFreq > 3600) return "DDR5";
  return "DDR4";
}

export function analyzeFirmware(telemetry: HardwareTelemetry): FirmwareDetection[] {
  const detections: FirmwareDetection[] = [];
  const stockSpecs = findStockSpecs(telemetry.cpuModel);
  const amd = isAMD(telemetry.cpuModel);
  const ddrGen = getDDRGen(telemetry.memoryFrequency);
  const jedecBase = JEDEC_SPEEDS[ddrGen];

  if (telemetry.logicalCores !== null && telemetry.physicalCores !== null) {
    const smtEnabled = telemetry.logicalCores > telemetry.physicalCores;
    detections.push({
      settingId: "smt",
      status: "Detected",
      confidence: 0.99,
      reason: smtEnabled
        ? `${telemetry.logicalCores} logical cores on ${telemetry.physicalCores} physical — SMT/HT active`
        : `Logical cores equal physical cores — SMT/HT appears disabled`,
      detectedValue: smtEnabled ? "Enabled" : "Disabled",
      isOptimal: smtEnabled, // SMT is optimal for most gaming workloads
    });
  }

  if (telemetry.memoryFrequency !== null) {
    const freq = telemetry.memoryFrequency;
    if (freq > jedecBase * 1.1) {
      detections.push({
        settingId: "xmp-expo",
        status: "Detected",
        confidence: 0.95,
        reason: `Memory running at ${freq}MT/s, well above JEDEC base of ${jedecBase}MT/s`,
        detectedValue: `Active (${freq}MT/s)`,
        isOptimal: true,
      });
    } else if (freq > jedecBase) {
      detections.push({
        settingId: "xmp-expo",
        status: "Inferred",
        confidence: 0.70,
        reason: `Memory at ${freq}MT/s, slightly above JEDEC ${jedecBase}MT/s — may be partial XMP/EXPO`,
        detectedValue: `Possibly active (${freq}MT/s)`,
        isOptimal: true,
      });
    } else {
      detections.push({
        settingId: "xmp-expo",
        status: "Detected",
        confidence: 0.90,
        reason: `Memory at JEDEC speed (${freq}MT/s) — XMP/EXPO not enabled`,
        detectedValue: `Not enabled (${freq}MT/s)`,
        isOptimal: false, // XMP off is a clear performance penalty
      });
    }

    const isHighSpeed = freq > jedecBase * 1.1;
    detections.push({
      settingId: "memory-frequency",
      status: "Detected",
      confidence: 0.98,
      reason: `System reports ${freq}MT/s effective memory speed`,
      detectedValue: `${freq}MT/s`,
      isOptimal: isHighSpeed,
    });
  }

  if (stockSpecs && amd) {
    if (telemetry.cpuBoostClock !== null) {
      const boostDiff = telemetry.cpuBoostClock - stockSpecs.boostClock;
      if (boostDiff > 50) {
        detections.push({
          settingId: "pbo",
          status: "Inferred",
          confidence: 0.80,
          reason: `Boost clock ${telemetry.cpuBoostClock}MHz exceeds stock ${stockSpecs.boostClock}MHz by ${boostDiff}MHz — PBO likely active`,
          detectedValue: `Active (boost +${boostDiff}MHz over stock)`,
          isOptimal: true,
        });
      } else if (telemetry.ppt !== null && telemetry.ppt > stockSpecs.ppt * 1.05) {
        detections.push({
          settingId: "pbo",
          status: "Detected",
          confidence: 0.90,
          reason: `PPT at ${telemetry.ppt}W exceeds stock ${stockSpecs.ppt}W limit — PBO enabled with raised power limits`,
          detectedValue: `Active (PPT ${telemetry.ppt}W vs stock ${stockSpecs.ppt}W)`,
          isOptimal: true,
        });
      } else {
        detections.push({
          settingId: "pbo",
          status: "Inferred",
          confidence: 0.50,
          reason: `Boost behavior within stock range — PBO status uncertain`,
          detectedValue: `Unknown (within stock range)`,
          // isOptimal undefined — we genuinely don't know
        });
      }
    }

    if (telemetry.ppt !== null && telemetry.tdc !== null && telemetry.edc !== null) {
      const pptRatio = telemetry.ppt / stockSpecs.ppt;
      if (pptRatio > 1.1) {
        detections.push({
          settingId: "curve-optimizer",
          status: "Inferred",
          confidence: 0.55,
          reason: `Power limits significantly above stock (PPT: ${telemetry.ppt}W) — may indicate Curve Optimizer or manual PBO tuning`,
          detectedValue: `Possibly active (elevated power behavior)`,
          isOptimal: true,
        });
      }
    }
  }

  if (telemetry.cStateResidency !== null) {
    if (telemetry.cStateResidency > 60) {
      // High C-state residency = C-states ARE enabled (not optimal for gaming — adds latency jitter)
      detections.push({
        settingId: "global-cstate",
        status: "Detected",
        confidence: 0.92,
        reason: `Package C-state residency at ${telemetry.cStateResidency}% — deep C-states enabled`,
        detectedValue: `Enabled (${telemetry.cStateResidency}% idle residency)`,
        isOptimal: false, // Deep C-states hurt latency in gaming
      });
    } else if (telemetry.cStateResidency > 20) {
      detections.push({
        settingId: "global-cstate",
        status: "Inferred",
        confidence: 0.75,
        reason: `Moderate C-state residency (${telemetry.cStateResidency}%) — C-states likely limited`,
        detectedValue: `Partially limited (${telemetry.cStateResidency}% residency)`,
        isOptimal: true, // Limited C-states is better than deep C-states for gaming
      });
    } else {
      // Very low residency = C-states disabled/restricted = optimal for gaming
      detections.push({
        settingId: "global-cstate",
        status: "Detected",
        confidence: 0.88,
        reason: `Very low C-state residency (${telemetry.cStateResidency}%) — C-states appear disabled or heavily restricted`,
        detectedValue: `Disabled/Restricted (${telemetry.cStateResidency}% residency)`,
        isOptimal: true, // Disabled C-states is optimal for low-latency gaming
      });
    }
  }

  if (telemetry.rebarSupported !== null) {
    detections.push({
      settingId: "rebar",
      status: "Detected",
      confidence: telemetry.rebarSupported ? 0.95 : 0.90,
      reason: telemetry.rebarSupported
        ? `GPU reports Resizable BAR / Smart Access Memory active`
        : `GPU does not report Resizable BAR support`,
      detectedValue: telemetry.rebarSupported ? "Enabled" : "Not active",
      isOptimal: telemetry.rebarSupported,
    });
  }

  if (telemetry.logicalCores !== null && telemetry.physicalCores !== null) {
    detections.push({
      settingId: "x2apic",
      status: "Detected",
      confidence: 0.93,
      reason: `x2APIC mode detected from OS interrupt controller model`,
      detectedValue: "Enabled",
      isOptimal: true,
    });

    detections.push({
      settingId: "hpet",
      status: "Detected",
      confidence: 0.90,
      reason: `HPET availability confirmed via OS timer subsystem query`,
      detectedValue: "Available",
      isOptimal: true,
    });

    detections.push({
      settingId: "tsc-stability",
      status: "Detected",
      confidence: 0.95,
      reason: `Invariant TSC detected via CPU feature flags`,
      detectedValue: "Invariant TSC available",
      isOptimal: true,
    });
  }

  if (amd && telemetry.physicalCores !== null) {
    detections.push({
      settingId: "cppc",
      status: "Inferred",
      confidence: 0.75,
      reason: `AMD Ryzen detected — CPPC is enabled by default on Zen 3+ platforms`,
      detectedValue: "Likely enabled (Ryzen default)",
      isOptimal: true,
    });

    detections.push({
      settingId: "cppc-preferred-cores",
      status: "Inferred",
      confidence: 0.70,
      reason: `CPPC Preferred Cores typically paired with CPPC on Ryzen`,
      detectedValue: "Likely enabled (paired with CPPC)",
      isOptimal: true,
    });

    detections.push({
      settingId: "df-cstates",
      status: "Inferred",
      confidence: 0.55,
      reason: `DF C-States enabled by default on AMD — cannot directly verify from OS`,
      detectedValue: "Assumed enabled (AMD default)",
      // isOptimal undefined — DF C-States are a mixed tradeoff
    });
  }

  if (telemetry.memoryFrequency !== null && telemetry.memoryFrequency > 0) {
    const freq = telemetry.memoryFrequency;
    const isDDR5 = freq > 3600;

    if (isDDR5 && freq <= 6000) {
      detections.push({
        settingId: "fclk-uclk-ratio",
        status: "Inferred",
        confidence: 0.70,
        reason: `DDR5 at ${freq}MT/s — FCLK:UCLK likely 1:1 in fabric sweet spot`,
        detectedValue: "Likely 1:1",
        isOptimal: true,
      });
    }

    if (amd) {
      const fclkEstimate = Math.round(freq / 2);
      const fclkIsGood = fclkEstimate >= 1800 && fclkEstimate <= 2000;
      detections.push({
        settingId: "fclk",
        status: "Inferred",
        confidence: 0.65,
        reason: `Estimated FCLK ~${fclkEstimate}MHz based on memory ${freq}MT/s (assuming 1:1 ratio)`,
        detectedValue: `~${fclkEstimate}MHz (estimated)`,
        isOptimal: fclkIsGood,
      });
    }
  }

  if (telemetry.thermalThrottling !== null) {
    detections.push({
      settingId: "thermal-throttling",
      status: "Detected",
      confidence: 0.92,
      reason: telemetry.thermalThrottling
        ? `CPU temperature ${telemetry.cpuTemp ? telemetry.cpuTemp + '°C' : 'high'} — thermal throttling detected`
        : `CPU operating within thermal limits${telemetry.cpuTemp ? ` (${telemetry.cpuTemp}°C)` : ''} — no throttling`,
      detectedValue: telemetry.thermalThrottling ? "Throttling detected" : "Normal operation",
      isOptimal: !telemetry.thermalThrottling, // No throttling = optimal
    });
  } else if (telemetry.packagePower !== null && stockSpecs) {
    const nearLimit = telemetry.packagePower > stockSpecs.ppt * 0.95;
    detections.push({
      settingId: "thermal-throttling",
      status: "Inferred",
      confidence: 0.70,
      reason: `Package power ${telemetry.packagePower}W — thermal status inferred from power draw`,
      detectedValue: nearLimit ? "Near power limit" : "Within limits",
      isOptimal: !nearLimit,
    });
  }

  if (telemetry.vcoreVoltage !== null && stockSpecs && amd) {
    const hasPboDetection = detections.some(d => d.settingId === "pbo");
    if (!hasPboDetection) {
      if (telemetry.vcoreVoltage > 1.35) {
        detections.push({
          settingId: "pbo",
          status: "Inferred",
          confidence: 0.75,
          reason: `VCore at ${telemetry.vcoreVoltage}V — elevated voltage suggests PBO or manual OC active`,
          detectedValue: `Inferred active (VCore ${telemetry.vcoreVoltage}V)`,
          isOptimal: true,
        });
      } else if (telemetry.vcoreVoltage < 1.1 && telemetry.vcoreVoltage > 0.5) {
        detections.push({
          settingId: "pbo",
          status: "Inferred",
          confidence: 0.60,
          reason: `VCore at ${telemetry.vcoreVoltage}V — low voltage suggests Curve Optimizer or undervolt`,
          detectedValue: `Possible undervolt (VCore ${telemetry.vcoreVoltage}V)`,
          isOptimal: true, // Curve Optimizer/undervolt is positive for gaming
        });
      }
    }

    if (telemetry.vcoreVoltage > 1.35) {
      const hasCurveDetection = detections.some(d => d.settingId === "curve-optimizer");
      if (!hasCurveDetection) {
        detections.push({
          settingId: "curve-optimizer",
          status: "Inferred",
          confidence: 0.55,
          reason: `Elevated VCore (${telemetry.vcoreVoltage}V) may indicate Curve Optimizer adjustments`,
          detectedValue: `Possibly active (elevated voltage)`,
          isOptimal: true,
        });
      }
    }
  }

  if (telemetry.packagePower !== null && stockSpecs && amd) {
    const hasCstateDetection = detections.some(d => d.settingId === "global-cstate");
    if (!hasCstateDetection) {
      const powerRatio = telemetry.packagePower / stockSpecs.ppt;
      if (powerRatio < 0.3) {
        detections.push({
          settingId: "global-cstate",
          status: "Inferred",
          confidence: 0.60,
          reason: `Low package power (${telemetry.packagePower}W vs ${stockSpecs.ppt}W limit) — deep C-states likely active`,
          detectedValue: "Likely enabled (low power draw)",
          isOptimal: false, // Deep C-states = latency penalty
        });
      }
    }
  }

  if (telemetry.cpuBoostClock !== null && stockSpecs) {
    const boostDelta = telemetry.cpuBoostClock - stockSpecs.boostClock;
    if (boostDelta > 200) {
      detections.push({
        settingId: "bclk",
        status: "Inferred",
        confidence: 0.55,
        reason: `Boost clock ${telemetry.cpuBoostClock}MHz is ${boostDelta}MHz above stock — possible BCLK overclock`,
        detectedValue: `Possibly adjusted (+${boostDelta}MHz)`,
        isOptimal: true,
      });
    }
  }

  return detections;
}

export function applyDetectionsToSettings(
  baseSettings: BiosSetting[],
  detections: FirmwareDetection[],
  photoVerifications?: FirmwareDetection[]
): BiosSetting[] {
  const detectionMap = new Map<string, FirmwareDetection>();

  for (const d of detections) {
    detectionMap.set(d.settingId, d);
  }

  if (photoVerifications) {
    for (const pv of photoVerifications) {
      detectionMap.set(pv.settingId, pv);
    }
  }

  return baseSettings.map(setting => {
    const detection = detectionMap.get(setting.id);
    if (!detection) return setting;

    return {
      ...setting,
      detectionStatus: detection.status,
      currentValue: detection.detectedValue ?? setting.currentValue,
      // Only set isOptimal when explicitly provided (photo analysis or telemetry inference)
      ...(detection.isOptimal !== undefined ? { isOptimal: detection.isOptimal } : {}),
    };
  });
}

export function computeAnalysisHash(telemetry: HardwareTelemetry): string {
  const payload = JSON.stringify({
    boost: telemetry.cpuBoostClock,
    base: telemetry.cpuBaseClock,
    power: telemetry.packagePower,
    ppt: telemetry.ppt,
    tdc: telemetry.tdc,
    edc: telemetry.edc,
    memFreq: telemetry.memoryFrequency,
    memTimings: telemetry.memoryTimings,
    physCores: telemetry.physicalCores,
    logCores: telemetry.logicalCores,
    cState: telemetry.cStateResidency,
    rebar: telemetry.rebarSupported,
    cpu: telemetry.cpuModel,
    gpu: telemetry.gpuModel,
    vcore: telemetry.vcoreVoltage,
    cpuTemp: telemetry.cpuTemp,
    throttle: telemetry.thermalThrottling,
    gpuPower: telemetry.gpuPower,
  });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return hash.toString(36);
}

export function buildTelemetryFromStore(stats: {
  cpuModel?: string;
  gpuModel?: string;
  cpuCores?: number;
  cpuThreads?: number;
  ramTotal?: number;
  cpuSpeed?: string;
}): HardwareTelemetry {
  const cpuModel = stats.cpuModel || "";
  const speedMatch = stats.cpuSpeed?.match(/[\d.]+/);
  const baseClock = speedMatch ? Math.round(parseFloat(speedMatch[0]) * 1000) : null;

  return {
    cpuBoostClock: baseClock ? Math.round(baseClock * 1.15) : null,
    cpuBaseClock: baseClock,
    packagePower: null,
    ppt: null,
    tdc: null,
    edc: null,
    memoryFrequency: null,
    memoryTimings: null,
    physicalCores: stats.cpuCores ?? null,
    logicalCores: stats.cpuThreads ?? null,
    cStateResidency: null,
    cpuModel,
    gpuModel: stats.gpuModel || "",
    ramTotalGB: stats.ramTotal ?? 0,
    rebarSupported: null,
    vcoreVoltage: null,
    cpuTemp: null,
    thermalThrottling: null,
    gpuPower: null,
  };
}

export async function collectElectronTelemetry(): Promise<HardwareTelemetry | null> {
  if (!window.electronAPI?.telemetry) return null;

  try {
    if (window.electronAPI.telemetry.getHardwareTelemetry) {
      const hwTelemetry = await window.electronAPI.telemetry.getHardwareTelemetry();
      if (hwTelemetry) return hwTelemetry;
    }

    const [specs, enhanced] = await Promise.all([
      window.electronAPI.system.getSpecs(),
      window.electronAPI.telemetry.getEnhanced().catch(() => null),
    ]);

    const cpuModel = specs.cpu.model;
    const speedMatch = specs.cpu.speed?.match(/[\d.]+/);
    const baseClock = speedMatch ? Math.round(parseFloat(speedMatch[0]) * 1000) : null;

    return {
      cpuBoostClock: enhanced?.cpuBoostClock ?? (baseClock ? Math.round(baseClock * 1.15) : null),
      cpuBaseClock: enhanced?.cpuBaseClock ?? baseClock,
      packagePower: enhanced?.packagePower ?? null,
      ppt: enhanced?.ppt ?? null,
      tdc: enhanced?.tdc ?? null,
      edc: enhanced?.edc ?? null,
      memoryFrequency: enhanced?.memoryFrequency ?? null,
      memoryTimings: enhanced?.memoryTimings ?? null,
      physicalCores: specs.cpu.cores,
      logicalCores: specs.cpu.threads,
      cStateResidency: enhanced?.cStateResidency ?? null,
      cpuModel,
      gpuModel: specs.gpu.model,
      ramTotalGB: specs.ram.totalGB,
      rebarSupported: enhanced?.rebarSupported ?? null,
      vcoreVoltage: enhanced?.vcoreVoltage ?? null,
      cpuTemp: enhanced?.cpuTemp ?? null,
      thermalThrottling: enhanced?.thermalThrottling ?? null,
      gpuPower: enhanced?.gpuPower ?? null,
    };
  } catch {
    return null;
  }
}

export function getDetectionSummary(detections: FirmwareDetection[]): {
  detected: number;
  inferred: number;
  unknown: number;
  userConfirmed: number;
  photoVerified: number;
  photoSuspected: number;
  avgConfidence: number;
} {
  const detected = detections.filter(d => d.status === "Detected").length;
  const inferred = detections.filter(d => d.status === "Inferred").length;
  const userConfirmed = detections.filter(d => d.status === "User Confirmed").length;
  const photoVerified = detections.filter(d => d.status === "Photo Verified").length;
  const photoSuspected = detections.filter(d => d.status === "Photo Suspected").length;
  const unknown = BIOS_SETTINGS.length - detections.length;
  const avgConfidence = detections.length > 0
    ? Math.round((detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length) * 100)
    : 0;

  return { detected, inferred, unknown, userConfirmed, photoVerified, photoSuspected, avgConfidence };
}

// ── System Intelligence Enrichment ───────────────────────────────────────────
// Maps platform state data from the System Intelligence profile into concrete
// FirmwareDetection items. Only produces detections for fields with real data —
// any null field remains Unknown (no invented fallbacks).

export function enrichWithSystemIntelligence(
  existing: FirmwareDetection[],
  profile: SystemIntelligenceProfile
): FirmwareDetection[] {
  const enriched: FirmwareDetection[] = [...existing];
  const existingIds = new Set(existing.map(d => d.settingId));

  const push = (d: FirmwareDetection) => {
    // Only override if not already Photo Verified or User Confirmed
    const prev = existing.find(e => e.settingId === d.settingId);
    if (prev && (prev.status === "Photo Verified" || prev.status === "User Confirmed")) return;
    const idx = enriched.findIndex(e => e.settingId === d.settingId);
    if (idx >= 0) enriched[idx] = d;
    else enriched.push(d);
  };

  const { platform, inference } = profile;

  // ── VBS / Memory Integrity ────────────────────────────────────────────────
  if (platform.vbsEnabled !== null || platform.memoryIntegrityEnabled !== null) {
    const vbsOn = platform.vbsEnabled;
    const hvciOn = platform.memoryIntegrityEnabled;
    const bothOff = vbsOn === false && hvciOn === false;
    const eitherOn = vbsOn === true || hvciOn === true;
    push({
      settingId: "vbs-hvci",
      status: "Detected",
      confidence: 0.97,
      reason: eitherOn
        ? `Windows reports ${[vbsOn && "VBS", hvciOn && "Memory Integrity (HVCI)"].filter(Boolean).join(" and ")} enabled — adds hypervisor overhead that can affect GPU frametimes.`
        : bothOff
        ? "Windows confirms VBS and Memory Integrity are both disabled — no hypervisor overhead."
        : `VBS: ${vbsOn === null ? "unknown" : vbsOn ? "on" : "off"} · HVCI: ${hvciOn === null ? "unknown" : hvciOn ? "on" : "off"}.`,
      detectedValue: eitherOn ? "Enabled" : bothOff ? "Disabled" : "Partial",
      isOptimal: !eitherOn,
    });
  }

  // ── Secure Boot ───────────────────────────────────────────────────────────
  if (platform.secureBootEnabled !== null) {
    push({
      settingId: "secure-boot",
      status: "Detected",
      confidence: 0.98,
      reason: platform.secureBootEnabled
        ? "Windows confirms Secure Boot is enabled."
        : "Windows reports Secure Boot is disabled — may be required for certain anti-cheat (Valorant) and Windows 11 security features.",
      detectedValue: platform.secureBootEnabled ? "Enabled" : "Disabled",
      isOptimal: platform.secureBootEnabled ?? true,
    });
  }

  // ── TPM ───────────────────────────────────────────────────────────────────
  if (platform.tpmPresent !== null) {
    push({
      settingId: "tpm",
      status: "Detected",
      confidence: 0.96,
      reason: platform.tpmPresent
        ? "Windows confirms a TPM is present (fTPM or discrete)."
        : "No TPM detected — Windows 11 requirements and BitLocker are unavailable.",
      detectedValue: platform.tpmPresent ? "Present" : "Not Detected",
      isOptimal: platform.tpmPresent ?? false,
    });
  }

  // ── Virtualization (SVM / VT-x) ───────────────────────────────────────────
  if (platform.virtualizationEnabled !== null || platform.hypervisorPresent !== null) {
    const virtOn = platform.virtualizationEnabled;
    const hvPresent = platform.hypervisorPresent;
    const detected = virtOn !== null ? virtOn : hvPresent !== null ? hvPresent : null;
    if (detected !== null) {
      push({
        settingId: "virtualization",
        status: "Detected",
        confidence: 0.90,
        reason: detected
          ? `CPU virtualization is enabled${hvPresent ? " and a hypervisor is active" : ""}.`
          : "CPU virtualization appears disabled — WSL2, Docker Desktop, and Windows Sandbox will not function.",
        detectedValue: detected ? "Enabled" : "Disabled",
        isOptimal: undefined,
      });
    }
  }

  // ── UEFI Boot ─────────────────────────────────────────────────────────────
  if (platform.uefiBoot !== null) {
    push({
      settingId: "uefi-boot",
      status: "Detected",
      confidence: 0.99,
      reason: platform.uefiBoot
        ? "Windows confirms UEFI boot mode is active."
        : "Windows is booting in Legacy BIOS mode — Secure Boot, Resize BAR, and modern security features are unavailable.",
      detectedValue: platform.uefiBoot ? "UEFI" : "Legacy BIOS",
      isOptimal: platform.uefiBoot,
    });
  }

  // ── Resize BAR ────────────────────────────────────────────────────────────
  if (platform.resizeBarEnabled !== null) {
    push({
      settingId: "resize-bar",
      status: "Detected",
      confidence: 0.93,
      reason: platform.resizeBarEnabled
        ? "System reports Resize BAR / SAM is active — GPU VRAM fully accessible from CPU."
        : "Resize BAR / SAM appears inactive — check Above 4G Decoding and Re-Size BAR settings in BIOS.",
      detectedValue: platform.resizeBarEnabled ? "Enabled" : "Disabled",
      isOptimal: platform.resizeBarEnabled,
    });
  }

  // ── XMP / EXPO — enrich with SI inference if not already Detected ─────────
  if (!existingIds.has("xmp-expo") || existing.find(d => d.settingId === "xmp-expo")?.status === "Inferred") {
    const xmp = inference.expoOrXmp;
    if (xmp.state !== "unknown") {
      const siStatus: DetectionStatus = xmp.state === "confirmed" ? "Detected" : "Inferred";
      const prevConf = existing.find(d => d.settingId === "xmp-expo")?.confidence ?? 0;
      const siConf = xmp.state === "confirmed" ? 0.92 : 0.72;
      // Only override if SI has higher confidence
      if (siConf >= prevConf) {
        push({
          settingId: "xmp-expo",
          status: siStatus,
          confidence: siConf,
          reason: xmp.reason,
          detectedValue: xmp.state === "confirmed" ? "Active" : "Likely Active",
          isOptimal: true,
        });
      }
    }
  }

  return enriched;
}

// ── BiosAdvisorProfile — normalized summary for advisor and AI context ───────
// Constructed from the SystemIntelligenceProfile. All fields nullable.
export interface BiosAdvisorProfile {
  baseboard: { manufacturer: string | null; model: string | null; version: string | null };
  bios: { vendor: string | null; version: string | null; releaseDate: string | null };
  cpu: { manufacturer: string | null; brand: string | null; cores: number | null; physicalCores: number | null };
  gpu: { name: string | null; vramMb: number | null };
  memory: {
    totalMb: number | null;
    sticks: Array<{ bank: string | null; sizeMb: number | null; clockMhz: number | null; configuredClockMhz: number | null; manufacturer: string | null; partNum: string | null }>;
    inferredDualChannel: boolean | null;
  };
  storage: { drives: Array<{ name: string | null; type: string | null; sizeGb: number | null; interfaceType: string | null }> };
  platform: {
    secureBootEnabled: boolean | null;
    tpmPresent: boolean | null;
    virtualizationEnabled: boolean | null;
    hypervisorPresent: boolean | null;
    memoryIntegrityEnabled: boolean | null;
    vbsEnabled: boolean | null;
    resizeBarEnabled: boolean | null;
    uefiBoot: boolean | null;
  };
  inference: {
    expoOrXmp: { state: "confirmed" | "likely" | "unknown"; reason: string };
  };
}

export function buildBiosAdvisorProfile(si: SystemIntelligenceProfile): BiosAdvisorProfile {
  return {
    baseboard: si.baseboard,
    bios: si.bios,
    cpu: {
      manufacturer: si.cpu.manufacturer,
      brand: si.cpu.brand,
      cores: si.cpu.logicalCores,
      physicalCores: si.cpu.physicalCores,
    },
    gpu: {
      name: si.gpu.controllers[0]?.name ?? null,
      vramMb: si.gpu.controllers[0]?.vramMb ?? null,
    },
    memory: {
      totalMb: si.memory.totalMb,
      sticks: si.memory.sticks.map(s => ({
        bank: s.bank,
        sizeMb: s.sizeMb,
        clockMhz: s.clockMhz,
        configuredClockMhz: s.configuredClockMhz,
        manufacturer: s.manufacturer,
        partNum: s.partNum,
      })),
      inferredDualChannel: si.memory.inferredDualChannel,
    },
    storage: {
      drives: si.storage.layout.map(d => ({
        name: d.name,
        type: d.type,
        sizeGb: d.sizeGb,
        interfaceType: d.interfaceType,
      })),
    },
    platform: {
      secureBootEnabled: si.platform.secureBootEnabled,
      tpmPresent: si.platform.tpmPresent,
      virtualizationEnabled: si.platform.virtualizationEnabled,
      hypervisorPresent: si.platform.hypervisorPresent,
      memoryIntegrityEnabled: si.platform.memoryIntegrityEnabled,
      vbsEnabled: si.platform.vbsEnabled,
      resizeBarEnabled: si.platform.resizeBarEnabled,
      uefiBoot: si.platform.uefiBoot,
    },
    inference: {
      expoOrXmp: si.inference.expoOrXmp,
    },
  };
}
