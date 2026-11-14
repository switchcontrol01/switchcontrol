import type { TelemetrySnapshot } from "./telemetry";

export interface LatencyEstimateBreakdownItem {
  label: string;
  value: number | string;
  unit: string;
  contributionMs: number;
}

export interface LatencyEstimate {
  ready: boolean;
  estimatedMs: number | null;
  quality: string;
  trend: TelemetrySnapshot["load_trend"];
  breakdown: LatencyEstimateBreakdownItem[];
  reason: string;
  sampledAt: number | null;
  stale?: boolean;
}

export interface RendererTelemetryFallback {
  cpuLoad?: number | null;
  cpuCores?: number | null;
  ramUsedGB?: number | null;
  ramTotalGB?: number | null;
  ramUsedPercent?: number | null;
  processCount?: number | null;
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Fill only missing/incomplete backend telemetry from the authenticated
 * Electron renderer's existing live snapshot. This does not start another
 * hardware sampler and never overwrites a valid backend reading.
 */
export function mergeRendererTelemetry(
  snap: TelemetrySnapshot,
  renderer: RendererTelemetryFallback,
): TelemetrySnapshot {
  const serverReady = snap.status === "ready";
  const cpuLoad =
    serverReady && inRange(snap.cpu.load, 0, 100)
      ? snap.cpu.load
      : inRange(renderer.cpuLoad, 0, 100)
        ? renderer.cpuLoad
        : snap.cpu.load;
  const cpuCores =
    serverReady && inRange(snap.cpu.cores, 1, 4096)
      ? snap.cpu.cores
      : inRange(renderer.cpuCores, 1, 4096)
        ? renderer.cpuCores
        : snap.cpu.cores;

  const serverRamReady =
    serverReady &&
    inRange(snap.ram.totalGB, 0.01, 1_000_000) &&
    inRange(snap.ram.usedGB, 0, 1_000_000) &&
    snap.ram.usedGB <= snap.ram.totalGB &&
    inRange(snap.ram.usedPercent, 0, 100);
  const rendererRamReady =
    inRange(renderer.ramTotalGB, 0.01, 1_000_000) &&
    inRange(renderer.ramUsedGB, 0, 1_000_000) &&
    renderer.ramUsedGB <= renderer.ramTotalGB &&
    inRange(renderer.ramUsedPercent, 0, 100);

  const ram = serverRamReady
    ? snap.ram
    : rendererRamReady
      ? {
          totalGB: renderer.ramTotalGB,
          usedGB: renderer.ramUsedGB,
          usedPercent: renderer.ramUsedPercent,
        }
      : snap.ram;

  const serverHasProcessCount =
    serverReady &&
    Number.isInteger(snap.processes.total) &&
    snap.processes.total > 0;
  const processCount = serverHasProcessCount
    ? snap.processes.total
    : inRange(renderer.processCount, 1, 100_000) && Number.isInteger(renderer.processCount)
      ? renderer.processCount
      : snap.processes.total;
  const hasCompleteSample =
    inRange(cpuLoad, 0, 100) &&
    inRange(cpuCores, 1, 4096) &&
    inRange(ram.totalGB, 0.01, 1_000_000) &&
    inRange(ram.usedGB, 0, 1_000_000) &&
    ram.usedGB <= ram.totalGB &&
    inRange(ram.usedPercent, 0, 100) &&
    Number.isInteger(processCount) &&
    processCount > 0;

  return {
    ...snap,
    status: serverReady || hasCompleteSample ? "ready" : "loading",
    cpu: { ...snap.cpu, load: cpuLoad, cores: cpuCores },
    ram,
    processes: {
      ...snap.processes,
      running: serverHasProcessCount ? snap.processes.running : processCount,
      total: processCount,
    },
  };
}

/**
 * A transparent system-load model, not a measurement of input-to-display
 * latency. Incomplete startup or missing telemetry returns no estimate.
 */
export function buildLatencyEstimate(snap: TelemetrySnapshot): LatencyEstimate {
  const cpuLoad = snap.cpu?.load;
  const cpuCores = snap.cpu?.cores;
  const ramTotalGB = snap.ram?.totalGB;
  const ramUsedGB = snap.ram?.usedGB;
  const ramUsedPercent = snap.ram?.usedPercent;
  const processCount = snap.processes?.total;
  const complete =
    snap.status === "ready" &&
    inRange(cpuLoad, 0, 100) &&
    inRange(cpuCores, 1, 4096) &&
    inRange(ramTotalGB, 0.01, 1_000_000) &&
    inRange(ramUsedGB, 0, 1_000_000) &&
    ramUsedGB <= ramTotalGB &&
    inRange(ramUsedPercent, 0, 100) &&
    Number.isInteger(processCount) &&
    processCount > 0;

  if (!complete) {
    return {
      ready: false,
      estimatedMs: null,
      quality: "Not enough data",
      trend: snap.load_trend,
      breakdown: [],
      reason: "Waiting for a complete Windows telemetry sample.",
      sampledAt: null,
    };
  }

  const cpuContribution = round1(cpuLoad * 0.08);
  const memoryContribution = round1(Math.max(0, ramUsedPercent - 50) * 0.06);
  const processContribution = round1(Math.max(0, processCount - 100) * 0.012);
  const trendContribution =
    snap.load_trend === "rising" ? 1.5 : snap.load_trend === "stable" ? 0.5 : 0;
  const estimatedMs = round1(
    3 + cpuContribution + memoryContribution + processContribution + trendContribution,
  );

  return {
    ready: true,
    estimatedMs,
    quality: estimatedMs <= 12 ? "Good" : estimatedMs <= 20 ? "Fair" : "High load",
    trend: snap.load_trend,
    breakdown: [
      { label: "CPU load", value: cpuLoad, unit: "%", contributionMs: cpuContribution },
      { label: "Memory pressure", value: ramUsedPercent, unit: "%", contributionMs: memoryContribution },
      { label: "Process count", value: processCount, unit: "processes", contributionMs: processContribution },
      { label: "Recent load trend", value: snap.load_trend, unit: "", contributionMs: trendContribution },
    ],
    reason: "Load-based estimate from current system readings; not directly measured.",
    sampledAt: Number.isFinite(snap.ts) ? snap.ts : null,
  };
}
