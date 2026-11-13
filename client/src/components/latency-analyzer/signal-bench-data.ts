import type { ResponsivenessModelSample } from "@/lib/responsivenessModel";

export type SignalMetricKey = "dpc" | "interrupt" | "faults";

export const SIGNAL_LANES: {
  key: SignalMetricKey;
  label: string;
  unit: string;
  color: string;
  value: (sample: ResponsivenessModelSample) => number;
}[] = [
  { key: "dpc", label: "DPC CPU time", unit: "% CPU time", color: "#efb66a", value: (sample) => sample.dpcPct },
  { key: "interrupt", label: "Interrupt CPU time", unit: "% CPU time", color: "#e77e69", value: (sample) => sample.intrPct },
  { key: "faults", label: "Total page faults", unit: "faults/sec", color: "#e9d1a7", value: (sample) => sample.pageFaultsSec },
];

export interface SignalLanePoint {
  sampleIndex: number;
  sampleTs: number;
  rawValue: number;
  x: number;
  normalizedY: number;
}

/**
 * Converts measured values to a 3D display height independently per lane.
 * Raw values and timestamps are carried through unchanged for inspection.
 */
export function buildSignalLanePoints(
  samples: readonly ResponsivenessModelSample[],
  metric: SignalMetricKey,
): SignalLanePoint[] {
  const lane = SIGNAL_LANES.find((candidate) => candidate.key === metric)!;
  const values = samples.map(lane.value);
  const maximum = Math.max(...values, 0) || 1;
  const denominator = Math.max(1, samples.length - 1);

  return samples.map((sample, sampleIndex) => {
    const rawValue = values[sampleIndex];
    return {
      sampleIndex,
      sampleTs: sample.ts,
      rawValue,
      x: -4.05 + (sampleIndex / denominator) * 8.1,
      normalizedY: 0.08 + (rawValue / maximum) * 1.25,
    };
  });
}
