const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  resolveNetworkStatsSample,
  summarizeNetworkStats,
} = require("../network-telemetry");

test("keeps fractional receive and upload rates and identifies the active interface", () => {
  const sample = resolveNetworkStatsSample(
    [
      { iface: "Loopback Pseudo-Interface", rx_sec: 100_000, tx_sec: 100_000 },
      { iface: "Wi-Fi", rx_sec: 512, tx_sec: 256 },
    ],
    null,
    0,
    10_000,
  );

  assert.equal(sample.available, true);
  assert.deepEqual(summarizeNetworkStats(sample.stats), {
    available: true,
    rxKBps: 0.5,
    txKBps: 0.25,
    interfaceName: "Wi-Fi",
  });
});

test("preserves the last good network sample through a brief empty response", () => {
  const previous = [{ iface: "Ethernet", rx_sec: 2048, tx_sec: 1024 }];
  const sample = resolveNetworkStatsSample([], previous, 20_000, 30_000);

  assert.equal(sample.available, true);
  assert.equal(sample.refreshed, false);
  assert.equal(sample.sampledAt, 20_000);
  assert.deepEqual(sample.stats, previous);
});

test("expires a stale network sample and reports unavailable instead of false zero", () => {
  const sample = resolveNetworkStatsSample(
    [],
    [{ iface: "Ethernet", rx_sec: 2048, tx_sec: 1024 }],
    20_000,
    35_001,
  );

  assert.equal(sample.available, false);
  assert.equal(sample.sampledAt, null);
  assert.deepEqual(sample.stats, []);
  assert.deepEqual(summarizeNetworkStats(sample.stats), {
    available: false,
    rxKBps: 0,
    txKBps: 0,
    interfaceName: null,
  });
});

test("idle counters remain valid and invalid counters do not become measurements", () => {
  assert.equal(resolveNetworkStatsSample([{ iface: "Ethernet", rx_sec: 0, tx_sec: 0 }], null, 0, 100).available, true);
  assert.equal(resolveNetworkStatsSample([{ iface: "Ethernet", rx_sec: NaN, tx_sec: -1 }], null, 0, 100).available, false);
});

test("desktop samples all interfaces and packages its network sampler", () => {
  const root = path.resolve(__dirname, "../..");
  const main = fs.readFileSync(path.join(root, "electron/main.js"), "utf8");
  assert.match(main, /si\.networkStats\('\*'\)/);
  assert.equal((main.match(/si\.networkStats\('\*'\)/g) || []).length, 2);
  const config = JSON.parse(fs.readFileSync(path.join(root, "electron/package.json"), "utf8"));
  assert.ok(config.build.files.includes("network-telemetry.js"));
});

test("Network Tweaks requests live telemetry and formats bytes as KB per second", () => {
  const root = path.resolve(__dirname, "../..");
  const app = fs.readFileSync(path.join(root, "client/src/App.tsx"), "utf8");
  assert.match(app, /path === "\/" \|\| path === "\/dashboard" \|\| path === "\/network"\s*\? "full"/);
  const networkPage = fs.readFileSync(path.join(root, "client/src/pages/NetworkTweaks.tsx"), "utf8");
  assert.match(networkPage, /formatKbps\(liveTel\.network\.rx_sec \/ 1024\)/);
  assert.match(networkPage, /formatKbps\(liveTel\.network\.tx_sec \/ 1024\)/);
});
