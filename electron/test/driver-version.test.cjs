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
  for (const status of ["healthy", "working", "newer", "outdated", "critical", "unknown", "scanning"]) {
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
  assert.match(page, /resolveInstalledComponent\(c, installedVersions\)/);
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
// ── Installed-driver probe resolution ─────────────────────────────────────────

const { resolveInstalledComponent } = require("../../client/src/lib/driver-intel-data.ts");
const { parseDriverProbeOutput } = require("../driver-probe-output.js");

function component(overrides) {
  return {
    kind: "gpu",
    title: "Graphics",
    device: "AMD Radeon RX 7800 XT",
    vendorKey: "amd",
    current: null,
    latest: "26.10.2",
    health: "unknown",
    safety: "safe",
    action: null,
    candidateAction: { label: "Open AMD support", url: "https://www.amd.com/en/support" },
    rationale: "Not compared yet.",
    ...overrides,
  };
}

test("AMD Adrenalin package version is compared with the published release", () => {
  const same = resolveInstalledComponent(component({}), {
    amd_gpu: "32.0.21025.10016",
    amd_gpu_adrenalin: "26.10.2",
    status_gpu_amd: "ok",
  });
  assert.equal(same.health, "healthy");
  assert.equal(same.current, "26.10.2");
  assert.equal(same.action, null);

  const older = resolveInstalledComponent(component({}), {
    amd_gpu_adrenalin: "26.8.1",
    status_gpu_amd: "ok",
  });
  assert.equal(older.health, "outdated");
  assert.equal(older.action?.label, "Open AMD support");
});

test("a working GPU without a comparable package version is Working, not unknown", () => {
  const resolved = resolveInstalledComponent(component({}), {
    amd_gpu: "32.0.21025.10016",
    status_gpu_amd: "ok",
  });
  assert.equal(resolved.health, "working");
  assert.equal(resolved.current, "32.0.21025.10016");
  assert.equal(resolved.action, null);
  assert.equal(getHealthMeta(resolved.health).color, HEALTH_META.healthy.color);
});

test("legacy GPU driver branches are never told to update to the mainstream release", () => {
  const pascal = resolveInstalledComponent(
    component({ device: "NVIDIA GeForce GTX 1080 Ti", vendorKey: "nvidia", latest: "621.14" }),
    { nvidia_gpu: "581.57", status_gpu_nvidia: "ok" },
  );
  assert.equal(pascal.health, "working");
  assert.equal(pascal.action, null);

  const turing = resolveInstalledComponent(
    component({ device: "NVIDIA GeForce RTX 2070", vendorKey: "nvidia", latest: "621.14" }),
    { nvidia_gpu: "581.57", status_gpu_nvidia: "ok" },
  );
  assert.equal(turing.health, "outdated");

  const polaris = resolveInstalledComponent(component({ device: "AMD Radeon RX 580" }), {
    amd_gpu_adrenalin: "23.9.1",
    status_gpu_amd: "ok",
  });
  assert.equal(polaris.health, "working");

  const rdna1 = resolveInstalledComponent(component({ device: "AMD Radeon RX 5700 XT" }), {
    amd_gpu_adrenalin: "26.10.2",
    status_gpu_amd: "ok",
  });
  assert.equal(rdna1.health, "healthy");

  const intelLegacy = resolveInstalledComponent(
    component({ device: "Intel(R) UHD Graphics 630", vendorKey: "intel", latest: "32.0.101.9175" }),
    { intel_gpu: "31.0.101.2135", status_gpu_intel: "ok" },
  );
  assert.equal(intelLegacy.health, "working");
});

test("chipset compares only the installed package version", () => {
  const chipset = component({
    kind: "chipset",
    title: "Chipset",
    device: "AMD platform",
    latest: "8.09.28.1124",
  });
  assert.equal(
    resolveInstalledComponent(chipset, { amd_chipset_package: "8.09.28.1124", status_chipset: "ok" }).health,
    "healthy",
  );
  const deviceOnly = resolveInstalledComponent(chipset, {
    amd_chipset: "5.12.0.38",
    status_chipset: "ok",
  });
  assert.equal(deviceOnly.health, "working");
  assert.equal(deviceOnly.action, null);
});

test("network, audio, Bluetooth, and storage use Windows device state", () => {
  for (const [kind, slot] of [["network", "network"], ["audio", "audio"], ["bluetooth", "bluetooth"], ["ssd", "storage"]]) {
    const base = component({ kind, vendorKey: "intel", latest: "24.80.0", device: "Device" });
    assert.equal(resolveInstalledComponent(base, { [`status_${slot}`]: "ok" }).health, "working", kind);
    const broken = resolveInstalledComponent(base, {
      [`status_${slot}`]: "problem",
      [`detail_${slot}`]: "Intel Wireless Bluetooth (CM_PROB_FAILED_START)",
    });
    assert.equal(broken.health, "critical", kind);
    assert.match(broken.rationale, /Windows reports a problem/);
    assert.equal(resolveInstalledComponent(base, { [`status_${slot}`]: "absent" }).health, "unknown", kind);
    assert.equal(resolveInstalledComponent(base, {}).health, "unknown", kind);
  }
});

test("working components count fully toward the health score", () => {
  const score = computeHealthScore([
    component({ health: "working" }),
    component({ kind: "cpu", health: "working" }),
  ]);
  assert.equal(score.overall, 100);
});

test("probe output parser tolerates PowerShell noise before the payload", () => {
  const parsed = parseDriverProbeOutput(
    'WARNING: something noisy\r\nSCDRV:{"amd_gpu_adrenalin":"26.10.1","status_gpu_amd":"ok","n":1}\r\n',
  );
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data, { amd_gpu_adrenalin: "26.10.1", status_gpu_amd: "ok" });
  assert.deepEqual(parseDriverProbeOutput('{"wifi":"1.2"}').data, { wifi: "1.2" });
  assert.deepEqual(parseDriverProbeOutput("garbage").data, {});
});

// ── Official vendor source parsers ────────────────────────────────────────────

const {
  parseAmdAdrenalinPage,
  parseAmdChipsetPage,
  parseIntelDownloadPage,
  parseNvidiaLookup,
} = require("../../server/lib/driverSourceParsers.ts");

test("AMD parser reads labelled Adrenalin revisions and their own release dates", () => {
  const html = `<meta property="og:updated" content="2026-06-10">
    <div>AMD Software: Adrenalin Edition Revision Number <b>Adrenalin 26.10.2 WHQL (Optional)</b> File Size 979 MB Release Date 2026-10-30</div>
    <div>AMD Software: Adrenalin Edition Revision Number <b>Adrenalin 26.10.1 WHQL (Recommended)</b> File Size 887 MB Release Date 2026-10-20</div>`;
  const parsed = parseAmdAdrenalinPage(html);
  assert.equal(parsed.latest, "26.10.2");
  assert.equal(parsed.releaseDate, "2026-10-30");
  assert.match(parsed.releaseNotes, /Recommended release is 26\.10\.1/);
  assert.throws(() => parseAmdAdrenalinPage("<html>26.10.2 2026-06-10</html>"));
});

test("AMD chipset, Intel, and NVIDIA parsers read official structured fields", () => {
  assert.deepEqual(
    parseAmdChipsetPage("Chipset Drivers Revision Number 8.09.28.1124 File Size 79 MB Release Date 2026-10-21").latest,
    "8.09.28.1124",
  );
  const intel = parseIntelDownloadPage(
    '<meta name="DownloadVersion" content="32.0.101.9175 WHQL Certified"><meta name="LastUpdate" content="11/04/2026 00:00:00">',
    "Intel GPU",
  );
  assert.equal(intel.latest, "32.0.101.9175");
  assert.equal(intel.releaseDate, "2026-11-04");
  const nvidia = parseNvidiaLookup({
    IDS: [
      { downloadInfo: { Version: "621.01", ReleaseDateTime: "Wed Oct 21, 2026", IsBeta: "0", Name: "GeForce%20Game%20Ready%20Driver" } },
      { downloadInfo: { Version: "621.14", ReleaseDateTime: "Wed Nov 04, 2026", IsBeta: "0", Name: "GeForce%20Game%20Ready%20Driver" } },
      { downloadInfo: { Version: "625.00", ReleaseDateTime: "Thu Nov 05, 2026", IsBeta: "1", Name: "Beta" } },
    ],
  });
  assert.equal(nvidia.latest, "621.14");
  assert.equal(nvidia.releaseDate, "2026-11-04");
});
