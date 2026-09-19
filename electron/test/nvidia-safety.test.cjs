const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const executor = fs.readFileSync(
  path.join(process.cwd(), "electron/tweak-executor.js"),
  "utf8",
);
const debloat = fs.readFileSync(
  path.join(process.cwd(), "electron/debloat-helper.js"),
  "utf8",
);
const cleaner = fs.readFileSync(
  path.join(process.cwd(), "electron/cleaner-helper.js"),
  "utf8",
);

test("vendor updater apply cannot disable NVIDIA services or tasks", () => {
  const definition = executor.match(
    /'vendor-updaters': \{[\s\S]*?\n  \},/,
  )?.[0];
  assert.ok(definition, "vendor-updaters definition should exist");
  const apply = definition.match(/apply:\s+`([^`]*)`/)?.[1] || "";
  assert.doesNotMatch(apply, /NVIDIAWebHelper|NvContainerLocalSystem|NVIDIA\*/);
  assert.match(
    definition,
    /NVIDIA\*"/,
    "revert must retain the legacy NVIDIA task recovery path",
  );
});

test("legacy NVIDIA telemetry apply is blocked", () => {
  const handler = executor.match(
    /async function executeNvidiaTelemetry\(action\) \{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(handler, "NVIDIA telemetry handler should exist");
  assert.match(handler, /if \(action === 'apply'\)/);
  assert.match(handler, /NVIDIA telemetry changes are disabled/);
});

test("generic Installed Apps protects NVIDIA identities by name or publisher", () => {
  assert.match(debloat, /\/nvidia\/i/);
  assert.match(debloat, /\/geforce\/i/);
  assert.match(debloat, /isAppProtected\(name, publisher\)/);
  assert.match(debloat, /isAppProtected\(trusted\.name, trusted\.publisher\)/);
});

test("Cleaner blocks NVIDIA shader and driver-cache deletion", () => {
  assert.match(cleaner, /'shader_cache', 'nvidia_driver_cache'/);
  assert.match(cleaner, /for \(const id of UNSUPPORTED_SCAN_IDS\) delete SCAN_DEFS\[id\]/);
});

test("GPU MSI actions protect NVIDIA display adapters", () => {
  assert.match(executor, /GPU MSI Mode is disabled for NVIDIA adapters/);
  assert.match(executor, /PCI MSI Mode is disabled for NVIDIA display adapters/);
});