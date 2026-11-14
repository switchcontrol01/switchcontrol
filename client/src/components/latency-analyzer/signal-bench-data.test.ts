import assert from "node:assert/strict";
import test from "node:test";
import { calculateResponsivenessModel } from "../../lib/responsivenessModel";
import { buildSignalLanePoints, findNearestProjectedPointIndex } from "./signal-bench-data";

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

test("finds the nearest graph point within an expanded 20px hover radius", () => {
  const points = [{ x: 50, y: 50 }, { x: 75, y: 50 }, { x: 100, y: 50 }];
  const nearest = findNearestProjectedPointIndex(points.length, 61, 50, 20, (index, result) => {
    result.x = points[index].x;
    result.y = points[index].y;
    return true;
  });
  assert.equal(nearest, 0);

  const edge = findNearestProjectedPointIndex(1, 95, 50, 20, (_index, result) => {
    result.x = 75;
    result.y = 50;
    return true;
  });
  assert.equal(edge, 0, "The edge of the 20px radius is included");

  const outside = findNearestProjectedPointIndex(points.length, 121, 50, 20, (index, result) => {
    result.x = points[index].x;
    result.y = points[index].y;
    return true;
  });
  assert.equal(outside, -1, "Points beyond the hover radius are not selected");
});

test("fractional native percentages produce distinct heights without fabricated motion", () => {
  const samples = [
    { ts: 1000, elapsed: 0, dpcPct: 0.125, intrPct: 0.025, pageFaultsSec: 512 },
    { ts: 3000, elapsed: 2, dpcPct: 0.5, intrPct: 0.1, pageFaultsSec: 512 },
  ];
  for (const metric of ["dpc", "interrupt"] as const) {
    const points = buildSignalLanePoints(samples, metric);
    assert.ok(points[1].normalizedY > points[0].normalizedY);
    assert.equal(points[0].rawValue, metric === "dpc" ? 0.125 : 0.025);
  }
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
