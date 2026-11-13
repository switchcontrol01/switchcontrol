const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parseRawCounterOutput } = require("../latency-analyzer");

const now = 1800000000000;
const stamp = 133000000000000000n;
const raw = (offset = 0n, dpc = 100000000000n, interrupt = 200000000000n) => JSON.stringify({
  source: "Windows PerfOS", sampledAt: now + Number(offset / 10000n),
  timestamp100ns: String(stamp + offset), dpc100ns: String(dpc),
  interrupt100ns: String(interrupt), pageFaultsPerSec: 512,
});
const baseline = () => parseRawCounterOutput(raw(), null, now).current;

test("first raw read establishes a baseline, not a fabricated zero", () => {
  assert.equal(parseRawCounterOutput(raw(), null, now).sample, null);
});

test("64-bit raw deltas retain fractional DPC and interrupt activity below 1%", () => {
  const { sample } = parseRawCounterOutput(raw(20000000n, 100000025000n, 200000005000n), baseline(), now + 2000);
  assert.equal(sample.dpcPct, 0.125);
  assert.equal(sample.interruptPct, 0.025);
  assert.equal(sample.pageFaultsPerSec, 512);
  assert.equal(sample.sampledAt, now + 2000);
});

test("genuine zero deltas remain zero", () => {
  const { sample } = parseRawCounterOutput(raw(20000000n), baseline(), now + 2000);
  assert.equal(sample.dpcPct, 0);
  assert.equal(sample.interruptPct, 0);
});

test("resets, duplicate timestamps and long gaps rebaseline instead of spiking", () => {
  assert.equal(parseRawCounterOutput(raw(20000000n, 1n), baseline(), now + 2000).sample, null);
  assert.equal(parseRawCounterOutput(raw(), baseline(), now).sample, null);
  assert.equal(parseRawCounterOutput(raw(400000000n), baseline(), now + 40000).sample, null);
});

test("missing, lossy numeric and stale native counters are rejected", () => {
  for (const changes of [{ dpc100ns: null }, { timestamp100ns: Number(stamp) }, { interrupt100ns: "-1" }]) {
    assert.throws(() => parseRawCounterOutput(JSON.stringify({ ...JSON.parse(raw()), ...changes }), null, now));
  }
  assert.throws(() => parseRawCounterOutput(raw(), null, now + 11000));
  assert.throws(() => parseRawCounterOutput(raw(20000000n, 100040000000n), baseline(), now + 2000));
});

test("production polling emits changing fractional samples and resets its baseline per session", async () => {
  const timers = [];
  const outputs = [raw(), raw(20000000n, 100000025000n, 200000005000n), raw(40000000n, 100000125000n, 200000025000n)];
  const scripts = [];
  const source = fs.readFileSync(path.resolve(__dirname, "../latency-analyzer.js"), "utf8");
  class FakeDate extends Date { static now() { return now + 4000; } }
  const sandbox = {
    module: { exports: {} }, Date: FakeDate,
    console: { info() {} },
    setTimeout(fn) { timers.push(fn); return fn; },
    clearTimeout(fn) { const i = timers.indexOf(fn); if (i >= 0) timers.splice(i, 1); },
    require(name) {
      if (name !== "child_process") return require(name);
      return { execFile(_exe, args, _opts, callback) {
        scripts.push(args.at(-1));
        queueMicrotask(() => callback(null, outputs.shift(), ""));
        return { kill() {} };
      } };
    },
  };
  vm.runInNewContext(source, sandbox);
  const collector = sandbox.module.exports;
  const samples = [], errors = [];
  await collector.startAnalysis(s => samples.push(s), e => errors.push(e));
  for (let i = 0; i < 3; i++) await timers.shift()();
  assert.deepEqual(samples.map(s => s.dpcPct), [0.125, 0.5]);
  assert.deepEqual(samples.map(s => s.interruptPct), [0.025, 0.1]);
  assert.equal(errors.length, 0);
  assert.ok(scripts.every(script => script.includes("Win32_PerfRawData_PerfOS_Processor")));
  collector.stopAnalysis();
  outputs.push(raw());
  await collector.startAnalysis(s => samples.push(s), e => errors.push(e));
  await timers.shift()();
  assert.equal(collector.getStatus().sampleCount, 0);
  collector.stopAnalysis();
});

test("accessible analyzer fills content while its locked gate keeps the standard layout", () => {
  const page = fs.readFileSync("client/src/pages/LatencyAnalyzer.tsx", "utf8");
  const css = fs.readFileSync("client/src/components/latency-analyzer/latency-analyzer-signal-bench.css", "utf8");
  assert.match(page, /<AppLayout noPageAnimation immersiveContent>/);
  assert.match(page, /function LockedState[\s\S]*?<AppLayout noPageAnimation>/);
  assert.match(css, /\.la-signal-bench \{[^}]*width: 100%;[^}]*min-height: 100%;/);
  assert.doesNotMatch(css, /width: min\(100%, 1240px\)/);
});
