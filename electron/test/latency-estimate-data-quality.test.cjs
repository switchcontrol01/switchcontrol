const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { selectProcessCount } = require("../process-count");

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
  const systemLoadPanel = read("client/src/components/SystemLoadPanel.tsx");
  const responsiveness = read("client/src/lib/responsivenessMetrics.ts");

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
  assert.match(electronMain, /siWithTimeout\(\s*\(\) => si\.processes\(\),\s*6_000,\s*'telemetry\.processes',?\s*\)/);
  assert.match(
    electronMain,
    /runMainPsDetailed\(script,\s*\{\s*timeout: 8_000,\s*label: 'telemetry:getProcessCount'/,
    "Windows process count must have a bounded native fallback when systeminformation hangs or returns zero",
  );
  assert.match(electronMain, /processProbe\.reason !== 'busy'/);
  assert.match(responsiveness, /Missing or invalid local Windows \$\{missing\.join/);
  assert.match(systemLoadPanel, /hasAnyMeasurements/);
  assert.match(dashboardHook, /\.\.\.waiting,\s*reason: current\.reason \|\| waiting\.reason/);
  assert.match(
    electronMain,
    /label: 'telemetry:getProcessCount'/,
    "the process-count fallback must use the shared PowerShell limiter",
  );
  assert.match(
    route,
    /serverHasProcessCount/,
    "Electron renderer telemetry must complete a ready backend snapshot when its process count is missing",
  );
  assert.match(
    dashboardHook,
    /lastReadyLatencyRef/,
    "the dashboard must retain the last complete estimate during a transient incomplete sample",
  );
});

test("partial local telemetry keeps valid readings visible but does not complete the model sample", async () => {
  const { normalizeSystemLoad } = await import("../../client/src/lib/responsivenessMetrics.ts");
  const now = Date.now();
  const partial = normalizeSystemLoad({
    collectionState: "ready",
    demandMode: "full",
    cpuRamSampledAt: now,
    processesSampledAt: now,
    cpu: { usagePct: 24, coreCount: 8 },
    ram: { usedGb: 8, totalGb: 32, usagePct: 25 },
    processes: { total: 0 },
  }, now);

  assert.equal(partial.state, "unavailable");
  assert.equal(partial.cpuUsagePct, 24);
  assert.equal(partial.ramUsedGb, 8);
  assert.equal(partial.processCount, null);
  assert.match(partial.reason, /system process count/);
});

test("zero systeminformation process count recovers from native Windows count", () => {
  const selected = selectProcessCount({ running: 0, total: 0 }, " 184\r\n");

  assert.deepEqual(selected, {
    source: "Get-Process",
    count: { running: 184, total: 184 },
  });
});

test("rejected systeminformation probe also uses native Windows count", () => {
  assert.deepEqual(
    selectProcessCount(null, " 176\r\n"),
    { source: "Get-Process", count: { running: 176, total: 176 } },
  );
});

test("unavailable native process count stays unavailable", () => {
  assert.deepEqual(
    selectProcessCount({ running: 0, total: 0 }, "0"),
    { source: "unavailable", count: { running: 0, total: 0 } },
  );
  assert.deepEqual(
    selectProcessCount({ running: 0, total: 0 }, "not-a-count"),
    { source: "unavailable", count: { running: 0, total: 0 } },
  );
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

test("renderer telemetry completes missing backend fields without replacing valid server data", async () => {
  const { mergeRendererTelemetry } = await import("../../server/lib/latencyEstimate.ts");
  const incompleteBackend = {
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
  };
  const renderer = {
    cpuLoad: 24,
    cpuCores: 12,
    ramUsedGB: 8,
    ramTotalGB: 32,
    ramUsedPercent: 25,
    processCount: 144,
  };

  const completed = mergeRendererTelemetry(incompleteBackend, renderer);
  assert.equal(completed.status, "ready");
  assert.equal(completed.cpu.load, 24);
  assert.equal(completed.ram.totalGB, 32);
  assert.equal(completed.processes.total, 144);

  const validBackend = {
    ...completed,
    cpu: { ...completed.cpu, load: 9, cores: 8 },
    ram: { totalGB: 16, usedGB: 4, usedPercent: 25 },
    processes: { running: 91, total: 91 },
  };
  const preserved = mergeRendererTelemetry(validBackend, {
    ...renderer,
    cpuLoad: 90,
    cpuCores: 64,
    ramTotalGB: 256,
    processCount: 600,
  });
  assert.equal(preserved.cpu.load, 9);
  assert.equal(preserved.cpu.cores, 8);
  assert.equal(preserved.ram.totalGB, 16);
  assert.equal(preserved.processes.total, 91);
});