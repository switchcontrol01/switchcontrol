import { MIN_RESPONSIVENESS_MODEL_SAMPLES } from "./latency-analyzer-config";

export interface ResponsivenessModelSample {
  ts: number;
  elapsed: number;
  dpcPct: number;
  intrPct: number;
  pageFaultsSec: number;
}

export interface ResponsivenessModelResult {
  sampleCount: number;
  medianServicePct: number;
  p95ServicePct: number;
  peakServicePct: number;
  /** Remaining share outside DPC + interrupt counters; unavailable if their sum exceeds 100%. */
  p95HeadroomPct: number | null;
  p95DpcPct: number;
  p95InterruptPct: number;
  p95PageFaultsSec: number;
  medianPageFaultsSec: number;
  p95MinusMedianPct: number;
}

function percentile(values: readonly number[], proportion: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(proportion * sorted.length));
  return sorted[rank - 1];
}

function isValidSample(sample: ResponsivenessModelSample): boolean {
  return Number.isFinite(sample.ts) &&
    Number.isFinite(sample.elapsed) &&
    Number.isFinite(sample.dpcPct) && sample.dpcPct >= 0 && sample.dpcPct <= 100 &&
    Number.isFinite(sample.intrPct) && sample.intrPct >= 0 && sample.intrPct <= 100 &&
    Number.isFinite(sample.pageFaultsSec) && sample.pageFaultsSec >= 0 && sample.pageFaultsSec <= 10_000_000;
}

/**
 * Summarizes the recent, real Windows PerfOS capture. It does not convert the
 * counters into mouse-to-screen or scheduler-delay milliseconds.
 */
export function calculateResponsivenessModel(
  input: readonly ResponsivenessModelSample[],
): ResponsivenessModelResult | null {
  const samples = input.filter(isValidSample);
  if (samples.length < MIN_RESPONSIVENESS_MODEL_SAMPLES) return null;

  const serviceShare = samples.map((sample) => sample.dpcPct + sample.intrPct);
  const sortedServiceShare = [...serviceShare].sort((a, b) => a - b);
  const midpoint = Math.floor(sortedServiceShare.length / 2);
  const medianServicePct = sortedServiceShare.length % 2
    ? sortedServiceShare[midpoint]
    : (sortedServiceShare[midpoint - 1] + sortedServiceShare[midpoint]) / 2;
  const p95ServicePct = percentile(serviceShare, 0.95);
  const p95DpcPct = percentile(samples.map((sample) => sample.dpcPct), 0.95);
  const p95InterruptPct = percentile(samples.map((sample) => sample.intrPct), 0.95);
  const pageFaultRates = samples.map((sample) => sample.pageFaultsSec);
  const medianPageFaultsSec = (() => {
    const sorted = [...pageFaultRates].sort((a, b) => a - b);
    const index = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[index] : (sorted[index - 1] + sorted[index]) / 2;
  })();

  return {
    sampleCount: samples.length,
    medianServicePct,
    p95ServicePct,
    peakServicePct: Math.max(...serviceShare),
    p95HeadroomPct: p95ServicePct <= 100 ? 100 - p95ServicePct : null,
    p95DpcPct,
    p95InterruptPct,
    p95PageFaultsSec: percentile(pageFaultRates, 0.95),
    medianPageFaultsSec,
    p95MinusMedianPct: p95ServicePct - medianServicePct,
  };
}
