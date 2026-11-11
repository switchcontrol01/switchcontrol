import test from "node:test";
import assert from "node:assert/strict";
import { calculateResponsivenessModel } from "./responsivenessModel";

function makeSamples(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ts: 1_700_000_000_000 + index * 2_000,
    elapsed: index * 2,
    dpcPct: index,
    intrPct: index / 2,
    pageFaultsSec: index * 10,
  }));
}

test("responsiveness model waits for enough valid native samples", () => {
  assert.equal(calculateResponsivenessModel(makeSamples(29)), null);
  assert.equal(calculateResponsivenessModel(makeSamples(30))?.sampleCount, 30);
});

test("responsiveness model derives CPU-service headroom without inventing milliseconds", () => {
  const model = calculateResponsivenessModel(makeSamples(30));
  assert.ok(model);
  assert.equal(model.medianServicePct, 21.75);
  assert.equal(model.p95ServicePct, 42);
  assert.equal(model.p95HeadroomPct, 58);
  assert.equal(model.p95DpcPct, 28);
  assert.equal(model.p95InterruptPct, 14);
  assert.equal(model.p95PageFaultsSec, 280);
});

test("headroom is unavailable when combined counter values exceed one processor's 100 percent", () => {
  const samples = makeSamples(30).map((sample) => ({ ...sample, dpcPct: 60, intrPct: 50 }));
  const model = calculateResponsivenessModel(samples);
  assert.ok(model);
  assert.equal(model.p95ServicePct, 110);
  assert.equal(model.p95HeadroomPct, null);
});

test("invalid samples are excluded instead of becoming zero-valued readings", () => {
  const samples = makeSamples(30);
  samples[0] = { ...samples[0], dpcPct: Number.NaN };
  assert.equal(calculateResponsivenessModel(samples), null);
});

test("valid zero-activity samples remain zero instead of receiving a fabricated floor", () => {
  const samples = makeSamples(30).map((sample) => ({
    ...sample,
    dpcPct: 0,
    intrPct: 0,
    pageFaultsSec: 0,
  }));
  const model = calculateResponsivenessModel(samples);
  assert.ok(model);
  assert.equal(model.p95ServicePct, 0);
  assert.equal(model.p95HeadroomPct, 100);
  assert.equal(model.p95PageFaultsSec, 0);
});
