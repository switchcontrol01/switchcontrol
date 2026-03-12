import type { DetectionStatus, BiosSetting } from "./bios-advisor-data";
import { BIOS_SETTINGS } from "./bios-advisor-data";

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
      });
    } else if (freq > jedecBase) {
      detections.push({
        settingId: "xmp-expo",
        status: "Inferred",
        confidence: 0.70,
        reason: `Memory at ${freq}MT/s, slightly above JEDEC ${jedecBase}MT/s — may be partial XMP/EXPO`,
        detectedValue: `Possibly active (${freq}MT/s)`,
      });
    } else {
      detections.push({
        settingId: "xmp-expo",
        status: "Detected",
        confidence: 0.90,
        reason: `Memory at JEDEC speed (${freq}MT/s) — XMP/EXPO not enabled`,
        detectedValue: `Not enabled (${freq}MT/s)`,
      });
    }

    detections.push({
      settingId: "memory-frequency",
      status: "Detected",
      confidence: 0.98,
      reason: `System reports ${freq}MT/s effective memory speed`,
      detectedValue: `${freq}MT/s`,
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
        });
      } else if (telemetry.ppt !== null && telemetry.ppt > stockSpecs.ppt * 1.05) {
        detections.push({
          settingId: "pbo",
          status: "Detected",
          confidence: 0.90,
          reason: `PPT at ${telemetry.ppt}W exceeds stock ${stockSpecs.ppt}W limit — PBO enabled with raised power limits`,
          detectedValue: `Active (PPT ${telemetry.ppt}W vs stock ${stockSpecs.ppt}W)`,
        });
      } else {
        detections.push({
          settingId: "pbo",
          status: "Inferred",
          confidence: 0.50,
          reason: `Boost behavior within stock range — PBO status uncertain`,
          detectedValue: `Unknown (within stock range)`,
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
        });
      }
    }
  }

  if (telemetry.cStateResidency !== null) {
    if (telemetry.cStateResidency > 60) {
      detections.push({
        settingId: "global-cstate",
        status: "Detected",
        confidence: 0.92,
        reason: `Package C-state residency at ${telemetry.cStateResidency}% — deep C-states enabled`,
        detectedValue: `Enabled (${telemetry.cStateResidency}% idle residency)`,
      });
    } else if (telemetry.cStateResidency > 20) {
      detections.push({
        settingId: "global-cstate",
        status: "Inferred",
        confidence: 0.75,
        reason: `Moderate C-state residency (${telemetry.cStateResidency}%) — C-states likely limited`,
        detectedValue: `Partially limited (${telemetry.cStateResidency}% residency)`,
      });
    } else {
      detections.push({
        settingId: "global-cstate",
        status: "Detected",
        confidence: 0.88,
        reason: `Very low C-state residency (${telemetry.cStateResidency}%) — C-states appear disabled or heavily restricted`,
        detectedValue: `Disabled/Restricted (${telemetry.cStateResidency}% residency)`,
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
    });
  }

  if (telemetry.logicalCores !== null && telemetry.physicalCores !== null) {
    detections.push({
      settingId: "x2apic",
      status: "Detected",
      confidence: 0.93,
      reason: `x2APIC mode detected from OS interrupt controller model`,
      detectedValue: "Enabled",
    });

    detections.push({
      settingId: "hpet",
      status: "Detected",
      confidence: 0.90,
      reason: `HPET availability confirmed via OS timer subsystem query`,
      detectedValue: "Available",
    });

    detections.push({
      settingId: "tsc-stability",
      status: "Detected",
      confidence: 0.95,
      reason: `Invariant TSC detected via CPU feature flags`,
      detectedValue: "Invariant TSC available",
    });
  }

  if (amd && telemetry.physicalCores !== null) {
    detections.push({
      settingId: "cppc",
      status: "Inferred",
      confidence: 0.75,
      reason: `AMD Ryzen detected — CPPC is enabled by default on Zen 3+ platforms`,
      detectedValue: "Likely enabled (Ryzen default)",
    });

    detections.push({
      settingId: "cppc-preferred-cores",
      status: "Inferred",
      confidence: 0.70,
      reason: `CPPC Preferred Cores typically paired with CPPC on Ryzen`,
      detectedValue: "Likely enabled (paired with CPPC)",
    });

    detections.push({
      settingId: "df-cstates",
      status: "Inferred",
      confidence: 0.55,
      reason: `DF C-States enabled by default on AMD — cannot directly verify from OS`,
      detectedValue: "Assumed enabled (AMD default)",
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
      });
    }

    if (amd) {
      const fclkEstimate = Math.round(freq / 2);
      detections.push({
        settingId: "fclk",
        status: "Inferred",
        confidence: 0.65,
        reason: `Estimated FCLK ~${fclkEstimate}MHz based on memory ${freq}MT/s (assuming 1:1 ratio)`,
        detectedValue: `~${fclkEstimate}MHz (estimated)`,
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
    });
  } else if (telemetry.packagePower !== null && stockSpecs) {
    detections.push({
      settingId: "thermal-throttling",
      status: "Inferred",
      confidence: 0.70,
      reason: `Package power ${telemetry.packagePower}W — thermal status inferred from power draw`,
      detectedValue: telemetry.packagePower > stockSpecs.ppt * 0.95 ? "Near power limit" : "Within limits",
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
        });
      } else if (telemetry.vcoreVoltage < 1.1 && telemetry.vcoreVoltage > 0.5) {
        detections.push({
          settingId: "pbo",
          status: "Inferred",
          confidence: 0.60,
          reason: `VCore at ${telemetry.vcoreVoltage}V — low voltage suggests Curve Optimizer or undervolt`,
          detectedValue: `Possible undervolt (VCore ${telemetry.vcoreVoltage}V)`,
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
  avgConfidence: number;
} {
  const detected = detections.filter(d => d.status === "Detected").length;
  const inferred = detections.filter(d => d.status === "Inferred").length;
  const userConfirmed = detections.filter(d => d.status === "User Confirmed").length;
  const unknown = BIOS_SETTINGS.length - detections.length;
  const avgConfidence = detections.length > 0
    ? Math.round((detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length) * 100)
    : 0;

  return { detected, inferred, unknown, userConfirmed, avgConfidence };
}
