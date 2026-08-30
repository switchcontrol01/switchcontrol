const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

test("latency estimate refuses incomplete telemetry instead of returning the floor", () => {
  const route = read("server/routes/dashboardIntelligence.ts");
  const card = read("client/src/components/dashboard/PerformanceLab.tsx");
  const analyzer = read("client/src/pages/LatencyAnalyzer.tsx");
  const estimator = read("server/lib/latencyEstimate.ts");
  const dashboardHook = read("client/src/hooks/useDashboardIntelligence.ts");
  const electronMain = read("electron/main.js");

  assert.match(route, /await getSnapshot\(\)/);
  assert.match(route, /buildLatencyEstimate\(snap\)/);
  assert.match(estimator, /snap\.status === "ready"/);
  assert.match(estimator, /estimatedMs: null/);
  assert.match(estimator, /quality: "Not enough data"/);
  assert.match(estimator, /reason: "Waiting for a complete Windows telemetry sample\."/);
  assert.match(card, /const hasEstimate = !!data\?\.ready && data\.estimatedMs != null/);
  assert.match(card, /!data[\s\S]*animate-pulse/);
  assert.match(card, /data && !hasEstimate/);
  assert.match(card, /data\.reason \?\? "Waiting for a complete Windows telemetry sample\."/);
  assert.match(card, /data-testid="text-latency-quality"/);
  assert.match(card, /Load-based estimate — not directly measured/);
  assert.match(analyzer, /const hasEstimate = !!latency\?\.ready && latency\.estimatedMs != null/);
  assert.match(analyzer, /latency \?[\s\S]*Not enough data/);
  assert.match(analyzer, /Derived from live OS metrics — not a hardware measurement/);
  assert.match(dashboardHook, /getLatencyEstimateUrl/);
  assert.match(dashboardHook, /cpuCores/);
  assert.match(dashboardHook, /ramTotalGB/);
  assert.match(dashboardHook, /processCount/);
  assert.match(electronMain, /function getLiveProcessCount\(\)/);
  assert.match(electronMain, /processes: liveProcessCount/);
});

test("complete telemetry produces a load-based estimate with the full response contract", async () => {
  const { buildLatencyEstimate } = await import("../../server/lib/latencyEstimate.ts");
  const result = buildLatencyEstimate({
    ts: Date.now(),
    status: "ready",
    cpu: { load: 42, speed: 3.8, cores: 16 },
    ram: { totalGB: 32, usedGB: 12, usedPercent: 37.5 },
    network: { rx_sec: 0, tx_sec: 0, latency_ms: 0 },
    temps: { cpu: null, gpu: null },
    gpu: { load: null, vramUsedMb: null, vramTotalMb: null, vramPercent: null, tempC: null, clockMhz: null, name: null },
    disk: { activeTimePct: null, readKBps: null, writeKBps: null, available: false },
    processes: { running: 180, total: 180 },
    load_trend: "rising",
  });

  assert.equal(result.ready, true);
  assert.equal(result.quality, "Good");
  assert.equal(result.trend, "rising");
  assert.ok(result.estimatedMs !== null && result.estimatedMs > 1.5);
  assert.equal(result.breakdown.length, 4);
  assert.match(result.reason, /Load-based estimate/);
});

test("startup sentinel remains an honest no-data response", async () => {
  const { buildLatencyEstimate } = await import("../../server/lib/latencyEstimate.ts");
  const result = buildLatencyEstimate({
    ts: Date.now(),
    status: "loading",
    cpu: { load: 0, speed: 0, cores: 0 },
    ram: { totalGB: 0, usedGB: 0, usedPercent: 0 },
    network: { rx_sec: 0, tx_sec: 0, latency_ms: 0 },
    temps: { cpu: null, gpu: null },
    gpu: { load: null, vramUsedMb: null, vramTotalMb: null, vramPercent: null, tempC: null, clockMhz: null, name: null },
    disk: { activeTimePct: null, readKBps: null, writeKBps: null, available: false },
    processes: { running: 0, total: 0 },
    load_trend: "stable",
  });

  assert.equal(result.ready, false);
  assert.equal(result.estimatedMs, null);
  assert.equal(result.quality, "Not enough data");
  assert.deepEqual(result.breakdown, []);
  assert.match(result.reason, /complete Windows telemetry sample/);
});