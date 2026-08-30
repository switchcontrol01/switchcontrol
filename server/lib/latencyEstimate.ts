import type { TelemetrySnapshot } from "./telemetry";

export interface LatencyBreakdown {
  label: string;
  ms: number;
  note: string;
}

export interface LatencyEstimateResponse {
  estimatedMs: number | null;
  quality: "Excellent" | "Good" | "Fair" | "Poor" | "Not enough data";
  trend: "rising" | "falling" | "stable";
  breakdown: LatencyBreakdown[];
  ready: boolean;
  reason: string;
  ts: number;
}

/**
 * Builds the dashboard's system-responsiveness model from one telemetry
 * snapshot. This is intentionally a load estimate, not a mouse-to-photon
 * measurement.
 */
export function buildLatencyEstimate(snap: TelemetrySnapshot): LatencyEstimateResponse {
  const hasCompleteSample =
    snap.status === "ready" &&
    Number.isFinite(snap.ts) &&
    snap.ts > 0 &&
    Number.isFinite(snap.cpu.load) &&
    snap.cpu.cores > 0 &&
    Number.isFinite(snap.ram.totalGB) &&
    snap.ram.totalGB > 0 &&
    Number.isFinite(snap.ram.usedPercent) &&
    snap.ram.usedPercent >= 0 &&
    Number.isFinite(snap.processes.total) &&
    snap.processes.total > 0;

  if (!hasCompleteSample) {
    return {
      estimatedMs: null,
      quality: "Not enough data",
      trend: "stable",
      breakdown: [],
      ready: false,
      reason: "Waiting for a complete Windows telemetry sample.",
      ts: snap.ts,
    };
  }

  const cpuLoad = Math.max(0, Math.min(100, snap.cpu.load));
  const ramPct = Math.max(0, Math.min(100, snap.ram.usedPercent));
  const procs = snap.processes.total;

  // The minimum is only used after a complete sample exists. Cosmetic
  // randomness would falsely imply a live input-latency measurement.
  const base = 1.5;

  // CPU: ~0.1ms at 0% load → ~5.5ms at 100% load.
  const cpuDelta = parseFloat((Math.pow(cpuLoad / 100, 0.7) * 5.5).toFixed(2));

  // RAM: ~0ms at 0% → ~4.5ms at 100%.
  const ramDelta = parseFloat((Math.pow(ramPct / 100, 1.1) * 4.5).toFixed(2));

  // Processes: linear from 60-process floor to 380-process ceiling (0 → 1.8ms).
  const procNorm = Math.min(1, Math.max(0, (procs - 60) / 320));
  const procDelta = parseFloat((procNorm * 1.8).toFixed(2));
  const total = Math.max(base, Math.round((base + cpuDelta + ramDelta + procDelta) * 10) / 10);

  const quality =
    total < 4 ? "Excellent" :
    total < 7 ? "Good" :
    total < 11 ? "Fair" : "Poor";

  const trend =
    snap.load_trend === "rising" ? "rising" :
    snap.load_trend === "falling" ? "falling" : "stable";

  return {
    estimatedMs: total,
    quality,
    trend,
    ready: true,
    reason: "Load-based estimate from current CPU, memory, and process telemetry; not directly measured.",
    breakdown: [
      { label: "Base OS overhead", ms: base, note: "Minimum kernel scheduler latency" },
      { label: "CPU scheduling", ms: cpuDelta, note: `CPU at ${cpuLoad.toFixed(0)}%` },
      { label: "Memory paging", ms: ramDelta, note: `RAM at ${ramPct.toFixed(0)}%` },
      { label: "Process overhead", ms: procDelta, note: `${procs} active processes` },
    ],
    ts: Date.now(),
  };
}