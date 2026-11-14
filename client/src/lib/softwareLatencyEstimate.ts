export const MIN_SOFTWARE_TIMING_SAMPLES = 30;
export const MAX_SOFTWARE_TIMING_SAMPLES = 300;

export interface SoftwareTimingSample {
  schedulingLatenessMs: number;
  ipcRoundTripMs: number;
}

export interface SoftwareLatencyEstimate {
  sampleCount: number;
  schedulingP95Ms: number;
  ipcRoundTripP95Ms: number;
  softwarePathP95Ms: number;
  latestSchedulingLatenessMs: number;
  latestIpcRoundTripMs: number;
  latestSoftwarePathMs: number;
}

function percentile(values: readonly number[], proportion: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(proportion * sorted.length) - 1)];
}

export function summarizeSoftwareLatency(
  input: readonly SoftwareTimingSample[],
): SoftwareLatencyEstimate | null {
  const samples = input.filter((sample) =>
    Number.isFinite(sample.schedulingLatenessMs) &&
    sample.schedulingLatenessMs >= 0 &&
    sample.schedulingLatenessMs <= 60_000 &&
    Number.isFinite(sample.ipcRoundTripMs) &&
    sample.ipcRoundTripMs >= 0 &&
    sample.ipcRoundTripMs <= 60_000,
  );
  if (samples.length < MIN_SOFTWARE_TIMING_SAMPLES) return null;

  const latest = samples[samples.length - 1];
  return {
    sampleCount: samples.length,
    schedulingP95Ms: percentile(samples.map((sample) => sample.schedulingLatenessMs), 0.95),
    ipcRoundTripP95Ms: percentile(samples.map((sample) => sample.ipcRoundTripMs), 0.95),
    softwarePathP95Ms: percentile(
      samples.map((sample) => sample.schedulingLatenessMs + sample.ipcRoundTripMs),
      0.95,
    ),
    latestSchedulingLatenessMs: latest.schedulingLatenessMs,
    latestIpcRoundTripMs: latest.ipcRoundTripMs,
    latestSoftwarePathMs: latest.schedulingLatenessMs + latest.ipcRoundTripMs,
  };
}
