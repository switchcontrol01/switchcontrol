import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_SOFTWARE_TIMING_SAMPLES,
  summarizeSoftwareLatency,
  type SoftwareTimingSample,
} from "./softwareLatencyEstimate";

const timingSamples: SoftwareTimingSample[] = Array.from(
  { length: MIN_SOFTWARE_TIMING_SAMPLES },
  (_, index) => ({
    schedulingLatenessMs: index,
    ipcRoundTripMs: index * 2,
  }),
);

test("waits for enough paired timing probes before showing an estimate", () => {
  assert.equal(summarizeSoftwareLatency(timingSamples.slice(0, MIN_SOFTWARE_TIMING_SAMPLES - 1)), null);
  assert.equal(summarizeSoftwareLatency(timingSamples)?.sampleCount, MIN_SOFTWARE_TIMING_SAMPLES);
});

test("computes component percentiles and totals from each paired software probe", () => {
  const result = summarizeSoftwareLatency(timingSamples);
  assert.ok(result);
  assert.equal(result.schedulingP95Ms, 28);
  assert.equal(result.ipcRoundTripP95Ms, 56);
  assert.equal(result.softwarePathP95Ms, 84);
  assert.equal(
    result.latestSoftwarePathMs,
    result.latestSchedulingLatenessMs + result.latestIpcRoundTripMs,
  );
});

test("excludes invalid timings instead of presenting them as zero", () => {
  const samples = [
    ...timingSamples.slice(0, MIN_SOFTWARE_TIMING_SAMPLES - 1),
    { schedulingLatenessMs: Number.NaN, ipcRoundTripMs: 2 },
  ];
  assert.equal(summarizeSoftwareLatency(samples), null);
});

test("keeps valid zero readings at zero instead of adding a made-up latency floor", () => {
  const result = summarizeSoftwareLatency(
    Array.from({ length: MIN_SOFTWARE_TIMING_SAMPLES }, () => ({
      schedulingLatenessMs: 0,
      ipcRoundTripMs: 0,
    })),
  );
  assert.equal(result?.softwarePathP95Ms, 0);
});
