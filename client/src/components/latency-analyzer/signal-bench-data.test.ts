import assert from "node:assert/strict";
import test from "node:test";
import { calculateResponsivenessModel } from "../../lib/responsivenessModel";
import { buildSignalLanePoints } from "./signal-bench-data";

const capturedSamples = [
  { ts: 1_000, elapsed: 0, dpcPct: 2, intrPct: 5, pageFaultsSec: 0 },
  { ts: 3_000, elapsed: 2, dpcPct: 4, intrPct: 5, pageFaultsSec: 20 },
];

test("keeps measured values and timestamps while normalizing each lane separately", () => {
  const dpc = buildSignalLanePoints(capturedSamples, "dpc");
  const interrupts = buildSignalLanePoints(capturedSamples, "interrupt");
  const faults = buildSignalLanePoints(capturedSamples, "faults");

  assert.deepEqual(dpc.map((point) => point.rawValue), [2, 4]);
  assert.deepEqual(dpc.map((point) => point.sampleTs), [1_000, 3_000]);
  assert.deepEqual([dpc[0].x, dpc[1].x], [-4.05, 4.05]);
  assert.ok(Math.abs(dpc[0].normalizedY - 0.705) < 1e-12);
  assert.ok(Math.abs(dpc[1].normalizedY - 1.33) < 1e-12);

  // Equal interrupt values are full height in their own lane even though the
  // DPC and page-fault measurements use unrelated numeric scales.
  assert.deepEqual(interrupts.map((point) => point.normalizedY), [1.33, 1.33]);
  assert.deepEqual(faults.map((point) => point.rawValue), [0, 20]);
  assert.deepEqual(faults.map((point) => point.normalizedY), [0.08, 1.33]);
});

test("returns no plotted point for an empty native capture", () => {
  assert.deepEqual(buildSignalLanePoints([], "dpc"), []);
});

test("keeps the responsiveness summary behind its 30-sample threshold", () => {
  const thirtyMeasuredSamples = Array.from({ length: 30 }, (_, index) => ({
    ts: 10_000 + index * 2_000,
    elapsed: index * 2,
    dpcPct: 2,
    intrPct: 1,
    pageFaultsSec: 10,
  }));

  assert.equal(calculateResponsivenessModel(thirtyMeasuredSamples.slice(0, 29)), null);
  const result = calculateResponsivenessModel(thirtyMeasuredSamples);
  assert.equal(result?.sampleCount, 30);
  assert.equal(result?.medianServicePct, 3);
  assert.equal(result?.p95ServicePct, 3);
  assert.equal(result?.p95HeadroomPct, 97);
  assert.equal(result?.p95PageFaultsSec, 10);
});
