export type SystemLoadState =
  | "live"
  | "warming"
  | "unsupported"
  | "stale"
  | "paused"
  | "unavailable";

export interface SystemLoadMeasurement {
  state: SystemLoadState;
  source: string | null;
  sampledAt: number | null;
  ageMs: number | null;
  cpuUsagePct: number | null;
  cpuCoreCount: number | null;
  ramUsedGb: number | null;
  ramTotalGb: number | null;
  ramUsagePct: number | null;
  processCount: number | null;
  cpuRamSampledAt: number | null;
  processesSampledAt: number | null;
  reason: string;
}

export const EMPTY_SYSTEM_LOAD: SystemLoadMeasurement = {
  state: "warming",
  source: null,
  sampledAt: null,
  ageMs: null,
  cpuUsagePct: null,
  cpuCoreCount: null,
  ramUsedGb: null,
  ramTotalGb: null,
  ramUsagePct: null,
  processCount: null,
  cpuRamSampledAt: null,
  processesSampledAt: null,
  reason: "Waiting for a complete local Windows telemetry sample.",
};

const CPU_RAM_MAX_AGE_MS = 30_000;
const PROCESS_MAX_AGE_MS = 120_000;

function finiteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validTimestamp(value: unknown, now: number): value is number {
  return finiteInRange(value, 1, now + 5_000);
}

/**
 * Accepts only a complete local Electron snapshot with real values and source
 * timestamps. It deliberately never falls back to server/browser telemetry.
 */
export function normalizeSystemLoad(
  raw: any,
  now = Date.now(),
): SystemLoadMeasurement {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_SYSTEM_LOAD, state: "unsupported", reason: "Local Windows telemetry is not available in this environment." };
  }

  const cpuRamSampledAt = raw.cpuRamSampledAt ?? raw.sampledAt;
  const processesSampledAt = raw.processesSampledAt ?? raw.processes?.sampledAt;
  const cpuUsagePct = raw.cpu?.usagePct;
  const cpuCoreCount = raw.cpu?.coreCount;
  const ramUsedGb = raw.ram?.usedGb;
  const ramTotalGb = raw.ram?.totalGb;
  const ramUsagePct = raw.ram?.usagePct;
  const processCount = raw.processes?.total;

  if (raw.collectionState === "warming") {
    return { ...EMPTY_SYSTEM_LOAD, state: "warming", reason: "Waiting for the first local Windows telemetry sample." };
  }
  if (raw.collectionState === "unavailable") {
    return { ...EMPTY_SYSTEM_LOAD, state: "unavailable", reason: "Local Windows telemetry is unavailable." };
  }

  const valuesValid =
    finiteInRange(cpuUsagePct, 0, 100) &&
    finiteInRange(cpuCoreCount, 1, 4096) &&
    Number.isInteger(cpuCoreCount) &&
    finiteInRange(ramUsedGb, 0, 1_000_000) &&
    finiteInRange(ramTotalGb, 0.01, 1_000_000) &&
    ramUsedGb <= ramTotalGb &&
    finiteInRange(ramUsagePct, 0, 100) &&
    finiteInRange(processCount, 1, 100_000) &&
    Number.isInteger(processCount);

  if (!valuesValid) {
    return {
      ...EMPTY_SYSTEM_LOAD,
      state: raw.demandMode === "paused" ? "paused" : "unavailable",
      reason: "One or more local Windows readings are missing or invalid.",
    };
  }

  if (
    !validTimestamp(cpuRamSampledAt, now) ||
    !validTimestamp(processesSampledAt, now)
  ) {
    return { ...EMPTY_SYSTEM_LOAD, state: "unavailable", reason: "Windows telemetry sample timestamps are missing or invalid." };
  }

  const ageMs = Math.max(now - cpuRamSampledAt, now - processesSampledAt);
  const stale =
    now - cpuRamSampledAt > CPU_RAM_MAX_AGE_MS ||
    now - processesSampledAt > PROCESS_MAX_AGE_MS;
  const state: SystemLoadState =
    raw.demandMode === "paused" ? "paused" : stale ? "stale" : "live";

  return {
    state,
    source: "Local Windows system telemetry",
    sampledAt: Math.min(cpuRamSampledAt, processesSampledAt),
    ageMs,
    cpuUsagePct,
    cpuCoreCount,
    ramUsedGb,
    ramTotalGb,
    ramUsagePct,
    processCount,
    cpuRamSampledAt,
    processesSampledAt,
    reason:
      state === "paused" ? "Telemetry collection is paused on this screen." :
      state === "stale" ? "The latest complete local sample is older than expected." :
      "Current readings from this Windows device.",
  };
}

export interface NativeCounterSample {
  sampledAt: number;
  source: "Windows PerfOS";
  dpcPct: number;
  interruptPct: number;
  pageFaultsPerSec: number;
}

export interface CounterSampleValidation {
  valid: boolean;
  sample?: NativeCounterSample;
  reason?: string;
}

export function validateCounterSample(
  value: any,
  now = Date.now(),
  maxAgeMs = 10_000,
): CounterSampleValidation {
  if (!value || typeof value !== "object") return { valid: false, reason: "No Windows counter sample was received." };
  const { sampledAt, source, dpcPct, interruptPct, pageFaultsPerSec } = value;
  if (source !== "Windows PerfOS") return { valid: false, reason: "The counter source is not recognized." };
  if (!validTimestamp(sampledAt, now) || now - sampledAt > maxAgeMs) {
    return { valid: false, reason: "The Windows counter sample is stale or has an invalid timestamp." };
  }
  if (
    !finiteInRange(dpcPct, 0, 100) ||
    !finiteInRange(interruptPct, 0, 100) ||
    !finiteInRange(pageFaultsPerSec, 0, 10_000_000)
  ) {
    return { valid: false, reason: "Windows returned a missing or out-of-range counter value." };
  }
  return {
    valid: true,
    sample: { sampledAt, source, dpcPct, interruptPct, pageFaultsPerSec },
  };
}

export function summarizeCounterSamples(samples: NativeCounterSample[]) {
  if (samples.length === 0) return null;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    sampleCount: samples.length,
    startedAt: Math.min(...samples.map((sample) => sample.sampledAt)),
    endedAt: Math.max(...samples.map((sample) => sample.sampledAt)),
    meanDpcPct: mean(samples.map((sample) => sample.dpcPct)),
    peakDpcPct: Math.max(...samples.map((sample) => sample.dpcPct)),
    meanInterruptPct: mean(samples.map((sample) => sample.interruptPct)),
    peakInterruptPct: Math.max(...samples.map((sample) => sample.interruptPct)),
    meanPageFaultsPerSec: mean(samples.map((sample) => sample.pageFaultsPerSec)),
    peakPageFaultsPerSec: Math.max(...samples.map((sample) => sample.pageFaultsPerSec)),
  };
}
