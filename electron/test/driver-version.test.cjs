const assert = require("node:assert/strict");
const test = require("node:test");

const { compareDriverVersions } = require("../../shared/driverVersion.ts");
const {
  resolveHealth,
  applyInstalledVersion,
  computeHealthScore,
  countActionable,
  detectGpuVendor,
  getHealthMeta,
  gpuAction,
  HEALTH_META,
  LOCAL_DB_FALLBACK,
  SCAN_STEPS,
} = require("../../client/src/lib/driver-intel-data.ts");
const fs = require("node:fs");
const path = require("node:path");

test("compares equal multi-part driver versions", () => {
  assert.equal(compareDriverVersions("32.0.101.6972", "32.0.101.6972"), "same");
  assert.equal(compareDriverVersions("v32.0.101.6972", "32.0.101.6972"), "same");
  assert.equal(compareDriverVersions("Driver 32.0.101.6972", "32.0.101.6972"), "same");
});

test("distinguishes older and newer versions without recommending a downgrade", () => {
  assert.equal(compareDriverVersions("31.0.101.5590", "32.0.101.6972"), "older");
  assert.equal(compareDriverVersions("32.0.101.6973", "32.0.101.6972"), "newer");
  assert.equal(compareDriverVersions("596.99", "555.85"), "newer");
});

test("pads missing trailing components", () => {
  assert.equal(compareDriverVersions("1.2", "1.2.0"), "same");
  assert.equal(compareDriverVersions("1.2.1", "1.2"), "newer");
});

test("leaves firmware identifiers and non-version labels unknown", () => {
  assert.equal(compareDriverVersions("P9CR40A", "P9CR40B"), "unknown");
  assert.equal(compareDriverVersions("7E12v1H", "7E12v1J"), "unknown");
  assert.equal(compareDriverVersions("1.4.2.0", "Bundled with NVIDIA display driver"), "unknown");
  assert.equal(compareDriverVersions("1.4.2.0", null), "unknown");
});

test("uncatalogued installed versions remain unknown", () => {
  assert.equal(resolveHealth("P9CR40A", null), "unknown");
  assert.equal(
    resolveHealth("P9CR40A", {
      latest: "P9CR40A",
      safety: "caution",
    }),
    "unknown",
  );
});

test("all Driver Intelligence health states have safe display metadata", () => {
  for (const status of ["healthy", "newer", "outdated", "critical", "unknown", "scanning"]) {
    const meta = getHealthMeta(status);
    assert.ok(meta.label, `${status} has a label`);
    assert.match(meta.color, /^#[0-9a-f]{6}$/i, `${status} has a color`);
    assert.ok(meta.glow, `${status} has a glow`);
  }

  assert.equal(getHealthMeta("unexpected-runtime-state"), HEALTH_META.unknown);
  assert.equal(getHealthMeta(undefined), HEALTH_META.unknown);
  assert.equal(getHealthMeta(null), HEALTH_META.unknown);
  assert.equal(getHealthMeta("toString"), HEALTH_META.unknown);
  assert.ok(SCAN_STEPS.length > 0, "the scan progress UI has steps");
  for (const category of ["gpu", "chipset", "bios", "ssd", "network", "audio", "bluetooth"]) {
    assert.ok(LOCAL_DB_FALLBACK[category], `offline database includes ${category}`);
  }
});

test("offline Intel Arc scan produces an actionable result without Windows or cloud access", () => {
  const vendor = detectGpuVendor("Intel(R) Arc(TM) A770 Graphics");
  assert.equal(vendor, "intel");

  const initial = {
    kind: "gpu",
    title: "Graphics",
    device: "Intel(R) Arc(TM) A770 Graphics",
    vendorKey: vendor,
    current: null,
    latest: LOCAL_DB_FALLBACK.gpu.intel.latest,
    health: "unknown",
    safety: "safe",
    action: null,
    candidateAction: gpuAction(vendor),
    rationale: "Checking installed Intel graphics driver.",
  };
  const scanned = applyInstalledVersion(initial, "32.0.101.6078");

  assert.equal(scanned.health, "outdated");
  assert.equal(scanned.action.url, "https://www.intel.com/content/www/us/en/support/detect.html");
  assert.equal(countActionable([scanned]), 1);
  assert.deepEqual(computeHealthScore([scanned]), {
    overall: 55,
    subscores: [{ kind: "gpu", label: "Graphics", score: 55 }],
  });
});

test("a pre-populated newer component exposes no update action", () => {
  const resolved = applyInstalledVersion(
    {
      kind: "gpu",
      title: "Graphics",
      device: "NVIDIA GeForce",
      vendorKey: "nvidia",
      current: "600.10",
      latest: "596.99",
      health: "outdated",
      safety: "caution",
      action: null,
      candidateAction: {
        label: "Open support",
        url: "https://example.com",
        note: "Official support page",
      },
      rationale: "A newer BIOS may be available.",
    },
    "600.10",
  );

  assert.equal(resolved.health, "newer");
  assert.equal(resolved.action, null);
  assert.match(resolved.rationale, /No downgrade is recommended/);
});

test("a verified older GPU activates its dormant official update action", () => {
  const resolved = applyInstalledVersion(
    {
      kind: "gpu",
      title: "Graphics",
      device: "NVIDIA GeForce",
      vendorKey: "nvidia",
      current: null,
      latest: "596.99",
      health: "unknown",
      safety: "safe",
      action: null,
      candidateAction: {
        label: "Open NVIDIA app",
        url: "https://www.nvidia.com/Download/index.aspx",
        note: "Official support page",
      },
      rationale: "No comparison yet.",
    },
    "555.85",
  );

  assert.equal(resolved.health, "outdated");
  assert.equal(resolved.action?.label, "Open NVIDIA app");
});

test("AMD Windows driver builds are not compared with Adrenalin package versions", () => {
  const resolved = applyInstalledVersion(
    {
      kind: "gpu",
      title: "Graphics",
      device: "AMD Radeon",
      vendorKey: "amd",
      current: null,
      latest: "26.8.1",
      health: "outdated",
      safety: "safe",
      action: null,
      candidateAction: {
        label: "Open AMD support",
        url: "https://www.amd.com/en/support",
        note: "Official support page",
      },
      rationale: "A newer package may be available.",
    },
    "32.0.13031.3015",
  );

  assert.equal(resolved.health, "unknown");
  assert.equal(resolved.action, null);
  assert.match(resolved.rationale, /different vendor version schemes/);
});

test("generic peripheral version slots never drive ordered recommendations", () => {
  for (const kind of ["network", "audio", "bluetooth"]) {
    const resolved = applyInstalledVersion(
      {
        kind,
        title: kind,
        device: "Selected device",
        vendorKey: "intel",
        current: null,
        latest: "23.160.0.4",
        health: "outdated",
        safety: "safe",
        action: null,
        candidateAction: {
          label: "Open official support",
          url: "https://www.intel.com/content/www/us/en/download-center/home.html",
          note: "Official support page",
        },
        rationale: "A newer package may be available.",
      },
      "24.170.0.5",
    );

    assert.equal(resolved.health, "unknown", kind);
    assert.equal(resolved.action, null, kind);
    assert.match(resolved.rationale, /different vendor version schemes/, kind);
  }
});

test("all rendered Driver Intelligence surfaces consume resolved versions", () => {
  const page = fs.readFileSync(
    path.join(__dirname, "../../client/src/pages/DriverIntelligence.tsx"),
    "utf8",
  );
  const panel = fs.readFileSync(
    path.join(__dirname, "../../client/src/components/driver-intel/ComponentPanel.tsx"),
    "utf8",
  );

  assert.match(page, /components=\{displayComponents\}/);
  assert.match(page, /computeHealthScore\(displayComponents\)/);
  assert.match(page, /applyInstalledVersion\(c, detected\)/);
  const store = fs.readFileSync(
    path.join(__dirname, "../../client/src/stores/driverIntelStore.ts"),
    "utf8",
  );
  assert.match(store, /applyInstalledVersion\(biosComponent, hw\.biosVersion\)/);
  assert.doesNotMatch(store, /health:\s*\w+Vendor\s*\?\s*"outdated"/);
  assert.match(
    panel,
    /c\.health === "outdated" \|\| c\.health === "critical"/,
  );
});