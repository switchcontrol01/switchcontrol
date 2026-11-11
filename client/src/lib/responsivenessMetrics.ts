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
      state: raw.demandMode === "paused" || raw.collectionPaused === true ? "paused" : "unavailable",
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
    raw.demandMode === "paused" || raw.collectionPaused === true ? "paused" : stale ? "stale" : "live";

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

export interface DriverInventoryRow {
  name: string;
  description: string;
  type: string;
  state: string;
}

export interface AudioDeviceInventory {
  name: string;
  manufacturer: string;
  status: string;
}

export interface MeasuredCapture {
  schemaVersion: 2;
  id: string;
  label: string;
  timestamp: number;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  sampleCount: number;
  completion: "completed" | "in_progress" | "failed" | "cancelled";
  source: "Windows PerfOS";
  scope: "system-wide";
  avgDpcPct: number;
  avgIntrPct: number;
  peakDpcPct: number;
  peakIntrPct: number;
  avgPageFaultsSec: number;
  peakPageFaultsSec: number;
  samples: NativeCounterSample[];
  drivers: DriverInventoryRow[];
  audioDevices: AudioDeviceInventory[];
  isAdmin: boolean;
}

export const MIN_COMPARISON_SAMPLES = 8;

export function createMeasuredCapture(
  samples: NativeCounterSample[],
  metadata: {
    label?: string;
    completion?: MeasuredCapture["completion"];
    drivers?: DriverInventoryRow[];
    audioDevices?: AudioDeviceInventory[];
    isAdmin?: boolean;
  } = {},
): MeasuredCapture | null {
  if (!Array.isArray(samples)) return null;
  for (let index = 0; index < samples.length; index++) {
    const parsed = validateCounterSample(samples[index], Date.now(), Infinity);
    if (!parsed.valid || (index > 0 && samples[index].sampledAt <= samples[index - 1].sampledAt)) return null;
  }
  const summary = summarizeCounterSamples(samples);
  if (!summary) return null;
  return {
    schemaVersion: 2,
    id: `capture-${summary.startedAt}-${summary.sampleCount}`,
    label: metadata.label?.trim() || "Measured capture",
    timestamp: summary.endedAt,
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    durationSec: (summary.endedAt - summary.startedAt) / 1000,
    sampleCount: summary.sampleCount,
    completion: metadata.completion ?? "in_progress",
    source: "Windows PerfOS",
    scope: "system-wide",
    avgDpcPct: summary.meanDpcPct,
    avgIntrPct: summary.meanInterruptPct,
    peakDpcPct: summary.peakDpcPct,
    peakIntrPct: summary.peakInterruptPct,
    avgPageFaultsSec: summary.meanPageFaultsPerSec,
    peakPageFaultsSec: summary.peakPageFaultsPerSec,
    samples: samples.map((sample) => ({ ...sample })),
    drivers: (metadata.drivers ?? []).map(({ name, description, type, state }) => ({ name, description, type, state })),
    audioDevices: (metadata.audioDevices ?? []).map(({ name, manufacturer, status }) => ({ name, manufacturer, status })),
    isAdmin: metadata.isAdmin === true,
  };
}

export function validateStoredCapture(value: any): MeasuredCapture | null {
  if (
    !value || value.schemaVersion !== 2 ||
    value.source !== "Windows PerfOS" || value.scope !== "system-wide" ||
    value.completion !== "completed" || !Array.isArray(value.samples) ||
    value.samples.length < MIN_COMPARISON_SAMPLES ||
    value.samples.length !== value.sampleCount ||
    !finiteInRange(value.endedAt, 1, Date.now() + 5_000)
  ) return null;

  const samples: NativeCounterSample[] = [];
  for (const raw of value.samples) {
    const parsed = validateCounterSample(raw, value.endedAt, Infinity);
    if (!parsed.valid || !parsed.sample) return null;
    if (samples.length && parsed.sample.sampledAt <= samples[samples.length - 1].sampledAt) return null;
    samples.push(parsed.sample);
  }
  const capture = createMeasuredCapture(samples, {
    label: typeof value.label === "string" ? value.label.slice(0, 60) : undefined,
    completion: "completed",
    drivers: Array.isArray(value.drivers) ? value.drivers.filter(isDriverInventoryRow) : [],
    audioDevices: Array.isArray(value.audioDevices) ? value.audioDevices.filter(isAudioDeviceInventory) : [],
    isAdmin: value.isAdmin === true,
  });
  if (!capture) return null;
  const fields = ["startedAt", "endedAt", "durationSec", "sampleCount", "avgDpcPct", "avgIntrPct", "peakDpcPct", "peakIntrPct", "avgPageFaultsSec", "peakPageFaultsSec"] as const;
  if (fields.some((field) => typeof value[field] !== "number" || Math.abs(value[field] - capture[field]) > 0.000001)) return null;
  return capture;
}

export function isDriverInventoryRow(value: any): value is DriverInventoryRow {
  return !!value && ["name", "description", "type", "state"].every((key) => typeof value[key] === "string");
}

export function isAudioDeviceInventory(value: any): value is AudioDeviceInventory {
  return !!value && ["name", "manufacturer", "status"].every((key) => typeof value[key] === "string");
}

export function createMeasurementReport(capture: MeasuredCapture | null) {
  if (!capture || capture.sampleCount === 0 || capture.samples.length !== capture.sampleCount) return null;
  capture = createMeasuredCapture(capture.samples, {
    label: capture.label,
    completion: capture.completion,
    drivers: capture.drivers,
    audioDevices: capture.audioDevices,
    isAdmin: capture.isAdmin,
  });
  if (!capture) return null;
  return {
    tool: "SwitchControl Latency Analyzer",
    schemaVersion: 2,
    scope: capture.scope,
    source: capture.source,
    completion: capture.completion,
    testLabel: capture.label,
    startedAt: new Date(capture.startedAt).toISOString(),
    endedAt: new Date(capture.endedAt).toISOString(),
    collectionSpanSec: capture.durationSec,
    sampleCount: capture.sampleCount,
    units: { dpc: "% CPU time", interrupt: "% CPU time", pageFaults: "total faults/sec" },
    summary: {
      meanDpcPct: capture.avgDpcPct,
      peakDpcPct: capture.peakDpcPct,
      meanInterruptPct: capture.avgIntrPct,
      peakInterruptPct: capture.peakIntrPct,
      meanPageFaultsPerSec: capture.avgPageFaultsSec,
      peakPageFaultsPerSec: capture.peakPageFaultsSec,
    },
    samples: capture.samples,
    inventory: { drivers: capture.drivers, audioDevices: capture.audioDevices },
    limitations: [
      "Page faults/sec includes soft and hard faults; it does not measure disk paging delay.",
      "System-wide counters do not identify a responsible driver.",
      "Scheduler dispatch delay, per-driver execution times, audio dropout risk, gaming performance, and input-to-display latency are not measured.",
    ],
  };
}

export type MeasurementReport = NonNullable<ReturnType<typeof createMeasurementReport>>;

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function measurementReportToCsv(report: MeasurementReport): string {
  const rows: unknown[][] = [
    ["section", "metric", "value", "unit", "sampled_at", "source"],
    ["capture", "label", report.testLabel, "", "", report.source],
    ["capture", "completion", report.completion, "", "", report.source],
    ["capture", "scope", report.scope, "", "", report.source],
    ["capture", "started_at", report.startedAt, "ISO 8601", report.startedAt, report.source],
    ["capture", "ended_at", report.endedAt, "ISO 8601", report.endedAt, report.source],
    ["capture", "sample_count", report.sampleCount, "samples", "", report.source],
  ];
  for (const [metric, value] of Object.entries(report.summary)) {
    rows.push(["summary", metric, value, metric.includes("PageFaults") ? "total faults/sec" : "% CPU time", report.endedAt, report.source]);
  }
  for (const sample of report.samples) {
    const at = new Date(sample.sampledAt).toISOString();
    rows.push(
      ["sample", "dpc", sample.dpcPct, "% CPU time", at, sample.source],
      ["sample", "interrupt", sample.interruptPct, "% CPU time", at, sample.source],
      ["sample", "page_faults", sample.pageFaultsPerSec, "total faults/sec", at, sample.source],
    );
  }
  for (const limitation of report.limitations) rows.push(["unavailable", limitation, "not measured", "", "", report.source]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function measurementReportToText(report: MeasurementReport): string {
  return [
    "SwitchControl — measured Windows counter capture",
    `Label: ${report.testLabel}`,
    `Source: ${report.source}`,
    `Scope: ${report.scope}`,
    `Completion: ${report.completion}`,
    `First sample: ${report.startedAt}`,
    `Last sample: ${report.endedAt}`,
    `Collection span: ${report.collectionSpanSec} seconds`,
    `Valid samples: ${report.sampleCount}`,
    "",
    `Mean DPC CPU time: ${report.summary.meanDpcPct}%`,
    `Peak DPC CPU time: ${report.summary.peakDpcPct}%`,
    `Mean interrupt CPU time: ${report.summary.meanInterruptPct}%`,
    `Peak interrupt CPU time: ${report.summary.peakInterruptPct}%`,
    `Mean total page faults: ${report.summary.meanPageFaultsPerSec} faults/sec`,
    `Peak total page faults: ${report.summary.peakPageFaultsPerSec} faults/sec`,
    "",
    "Native samples",
    ...report.samples.map((sample) => `${new Date(sample.sampledAt).toISOString()} | DPC ${sample.dpcPct}% CPU time | interrupt ${sample.interruptPct}% CPU time | total page faults ${sample.pageFaultsPerSec}/sec | ${sample.source}`),
    "",
    "Not measured",
    ...report.limitations,
    "",
    "Driver inventory (not a latency attribution)",
    ...report.inventory.drivers.map((driver) => `${driver.name} | ${driver.description} | ${driver.type} | ${driver.state}`),
    "",
    "Audio device inventory (no dropout assessment)",
    ...report.inventory.audioDevices.map((device) => `${device.name} | ${device.manufacturer} | ${device.status}`),
  ].join("\n");
}
