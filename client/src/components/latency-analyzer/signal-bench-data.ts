import type { ResponsivenessModelSample } from "@/lib/responsivenessModel";

export type SignalMetricKey = "dpc" | "interrupt" | "faults";

export const SIGNAL_LANES: {
  key: SignalMetricKey;
  label: string;
  unit: string;
  color: string;
  value: (sample: ResponsivenessModelSample) => number;
}[] = [
  { key: "dpc", label: "DPC CPU time", unit: "% CPU time", color: "#8ecde7", value: (sample) => sample.dpcPct },
  { key: "interrupt", label: "Interrupt CPU time", unit: "% CPU time", color: "#df9a8a", value: (sample) => sample.intrPct },
  { key: "faults", label: "Total page faults", unit: "faults/sec", color: "#dfbf85", value: (sample) => sample.pageFaultsSec },
];

export interface SignalLanePoint {
  sampleIndex: number;
  sampleTs: number;
  rawValue: number;
  x: number;
  normalizedY: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Returns the closest projected point inside a CSS-pixel hit radius.
 * The projector can skip points clipped out of the camera view.
 */
export function findNearestProjectedPointIndex(
  count: number,
  cursorX: number,
  cursorY: number,
  hitRadius: number,
  projectPoint: (index: number, result: ScreenPoint) => boolean,
): number {
  if (count <= 0 || hitRadius < 0) return -1;

  const result = { x: 0, y: 0 };
  const radiusSquared = hitRadius * hitRadius;
  let closestIndex = -1;
  let closestDistanceSquared = radiusSquared;

  for (let index = 0; index < count; index += 1) {
    if (!projectPoint(index, result)) continue;
    const dx = result.x - cursorX;
    const dy = result.y - cursorY;
    const distanceSquared = dx * dx + dy * dy;
    if (
      distanceSquared <= radiusSquared &&
      (closestIndex === -1 || distanceSquared < closestDistanceSquared)
    ) {
      closestIndex = index;
      closestDistanceSquared = distanceSquared;
    }
  }

  return closestIndex;
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
