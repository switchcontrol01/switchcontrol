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

  assert.match(route, /const snap\s*=\s*await getSnapshot\(\)/);
  assert.match(route, /snap\.status === "ready"/);
  assert.match(route, /estimatedMs: null/);
  assert.match(route, /quality: "Not enough data"/);
  assert.match(route, /reason: "Waiting for a complete Windows telemetry sample\."/);
  assert.match(card, /const hasEstimate = !!data\?\.ready && data\.estimatedMs != null/);
  assert.match(analyzer, /const hasEstimate = !!latency\?\.ready && latency\.estimatedMs != null/);
});