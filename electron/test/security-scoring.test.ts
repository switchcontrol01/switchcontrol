import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scoreIntegrity } from "../../shared/securityScore";
import { generateRecommendations as clientAnalyze, computeSummary } from "../../client/src/lib/securityAnalysis";
import { generateRecommendations as serverAnalyze } from "../../server/security/recommendations";

const status = {
  realtimeProtection: true, tamperProtection: true, firewallEnabled: true,
  defenderAvailable: true, antispywareEnabled: true, engineVersion: null,
  signatureVersion: null, lastQuickScan: null, lastFullScan: null, source: "electron" as const,
};
const process = (memMb = 64, impact: "low" | "medium" | "high" = "low") => ({
  name: "Example", pid: 10, cpuSec: 0, memMb, category: "unknown" as const, impact,
});
const startup = (count: number, impact: "low" | "medium" | "high" = "medium", recommendation: "keep" | "review" | "disable" = "review") =>
  Array.from({ length: count }, (_, i) => ({
    name: `App ${i}`, command: `app${i}.exe`, location: "Run", publisher: null,
    category: "utility" as const, impact, recommendation,
  }));
const fixture = (overrides = {}) => ({
  status, startupItems: startup(0), topProcesses: [process()],
  scanCoverage: { startup: true, background: true }, ...overrides,
});

test("no observations produces no numeric score and never claims secure", () => {
  const result = scoreIntegrity({ status: null, startupItems: [], topProcesses: [] });
  assert.equal(result.healthScore, null);
  assert.equal(result.coveragePercent, 0);
  assert.equal(result.systemState, "unknown");
  assert.deepEqual(result.scores, { protection: null, startup: null, background: null });
});

test("complete healthy evidence scores 100", () => {
  const result = scoreIntegrity(fixture());
  assert.equal(result.healthScore, 100);
  assert.equal(result.coveragePercent, 100);
  assert.equal(result.systemState, "secure");
});

test("different startup counts produce different scores, not a recommendation-count plateau", () => {
  const scores = [0, 1, 4, 8, 12].map(count =>
    scoreIntegrity(fixture({ startupItems: startup(count) })).healthScore!);
  assert.equal(new Set(scores).size, scores.length);
  assert.deepEqual(scores, [100, 98, 93, 86, 78]);
});

test("startup math incorporates severity and disable recommendation", () => {
  const category = (impact: "low" | "medium" | "high", recommendation: "review" | "disable" = "review") =>
    scoreIntegrity(fixture({ startupItems: startup(1, impact, recommendation) })).scores.startup;
  assert.equal(category("low"), 97);
  assert.equal(category("medium"), 94);
  assert.equal(category("high"), 90);
  assert.equal(category("high", "disable"), 85);
});

test("keep entries do not reduce the score", () => {
  assert.equal(scoreIntegrity(fixture({ startupItems: startup(50, "high", "keep") })).scores.startup, 100);
});

test("sampled process memory and high-impact observations change the score", () => {
  const small = scoreIntegrity(fixture({ topProcesses: [process(128)] }));
  const large = scoreIntegrity(fixture({ topProcesses: [process(8192)] }));
  const high = scoreIntegrity(fixture({ topProcesses: [process(8192, "high")] }));
  assert.ok(small.healthScore! > large.healthScore!);
  assert.ok(large.healthScore! > high.healthScore!);
  assert.equal(large.scores.background, 84);
  assert.equal(high.scores.background, 76);
  assert.equal(large.backgroundIssues, 1);
});

test("lifetime CPU seconds neither lower the score nor claim current CPU pressure", () => {
  const a = clientAnalyze(fixture({ topProcesses: [{ ...process(), cpuSec: 1 }] }));
  const b = clientAnalyze(fixture({ topProcesses: [{ ...process(), cpuSec: 999999 }] }));
  assert.deepEqual(a, b);
  assert.ok(!b.recommendations.some(r => r.id === "background-load"));
});

test("disabled real-time protection has an exact weighted deduction", () => {
  const result = scoreIntegrity(fixture({ status: { ...status, realtimeProtection: false } }));
  assert.equal(result.scores.protection, 60);
  assert.equal(result.healthScore, 80);
  assert.equal(result.threatCount, 1);
  assert.equal(result.systemState, "attention");
});

test("a missing control reduces coverage instead of being assumed enabled", () => {
  const result = scoreIntegrity(fixture({ status: { ...status, tamperProtection: null } }));
  assert.equal(result.coveragePercent, 93);
  assert.equal(result.systemState, "unknown");
});

test("quick scan excludes startup/process categories and is clearly partial", () => {
  const result = scoreIntegrity(fixture({
    startupItems: [], topProcesses: [], scanCoverage: { startup: false, background: false },
  }));
  assert.equal(result.healthScore, 100);
  assert.equal(result.coveragePercent, 50);
  assert.equal(result.scores.startup, null);
  assert.equal(result.scores.background, null);
  assert.equal(result.systemState, "unknown");
});

test("successfully scanned empty startup is distinct from failed startup probe", () => {
  assert.equal(scoreIntegrity(fixture()).scores.startup, 100);
  assert.equal(scoreIntegrity(fixture({ scanCoverage: { startup: false, background: true } })).scores.startup, null);
});

test("empty or invalid process observations cannot earn a healthy process score", () => {
  for (const topProcesses of [[], [{ ...process(), memMb: null }], [process(NaN)]]) {
    assert.equal(scoreIntegrity(fixture({ topProcesses })).scores.background, null);
  }
});

test("an unavailable protection probe ignores stale booleans", () => {
  const result = scoreIntegrity(fixture({ status: { ...status, realtimeProtection: false, source: "unavailable" } }));
  assert.equal(result.scores.protection, null);
  assert.equal(result.threatCount, 0);
  assert.equal(result.coveragePercent, 50);
});

test("unavailable Defender is not proof that all antivirus is disabled", () => {
  const input = fixture({ status: { ...status, defenderAvailable: false, realtimeProtection: false } });
  const result = clientAnalyze(input);
  assert.equal(result.summary.threatCount, 0);
  assert.equal(result.summary.coveragePercent, 68);
  assert.ok(!result.recommendations.some(r => r.id === "realtime-off"));
});

test("scores can reach zero; there is no arbitrary minimum of 20", () => {
  const result = scoreIntegrity(fixture({
    status: { ...status, realtimeProtection: false, tamperProtection: false, antispywareEnabled: false, firewallEnabled: false },
    startupItems: startup(50, "high"), topProcesses: [process(100000)],
  }));
  assert.equal(result.healthScore, 0);
});

test("changing recommendation copy or count cannot change the computed score", () => {
  const input = fixture({ startupItems: startup(4) });
  const a = computeSummary([], input.status, input.startupItems, input.topProcesses, input.scanCoverage);
  const b = computeSummary(Array(100).fill({ severity: "high" }) as any, input.status, input.startupItems, input.topProcesses, input.scanCoverage);
  assert.deepEqual(a, b);
});

test("client and server return identical scores for varied real observation shapes", () => {
  for (let count = 0; count <= 25; count++) {
    const input = fixture({
      startupItems: startup(count),
      topProcesses: [process(count * 256)],
      status: { ...status, firewallEnabled: count % 3 === 0 ? false : true },
    });
    assert.deepEqual(clientAnalyze(input).summary, serverAnalyze(input as any).summary);
    const score = clientAnalyze(input).summary.healthScore!;
    assert.ok(Number.isFinite(score) && score >= 0 && score <= 100);
  }
});

test("missing evidence never produces an all-clear recommendation", () => {
  const result = clientAnalyze({ status: null, startupItems: [], topProcesses: [] });
  assert.ok(result.recommendations.some(r => r.id === "scan-incomplete"));
  assert.ok(!result.recommendations.some(r => r.id === "all-clear"));
});

test("the scan and UI use the shared breakdown and explicit collection status", () => {
  const source = fs.readFileSync(new URL("../../client/src/pages/Security.tsx", import.meta.url), "utf8");
  assert.match(source, /let status: SecurityStatus \| null = null/);
  assert.match(source, /scanCoverage: \{ startup: startupCollected, background: processesCollected \}/);
  assert.match(source, /scanSummary\?\.scores\.protection/);
  assert.match(source, /scanSummary\?\.scores\.startup/);
  assert.match(source, /scanSummary\?\.scores\.background/);
  assert.doesNotMatch(source, /label="Configuration"/);
  assert.match(source, /prev\.scoringVersion === curr\.scoringVersion/);
});
