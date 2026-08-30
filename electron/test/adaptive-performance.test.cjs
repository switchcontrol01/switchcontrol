const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

function signal(value, availability = "available", reason = null) {
  return { value, availability, reason };
}

function fixture(overrides = {}) {
  return {
    capturedAt: 1,
    gpu: {
      model: signal("NVIDIA GeForce RTX 4070"),
      vendor: signal("NVIDIA"),
      driverVersion: signal("555.1"),
      integrated: signal(false),
      hardwareAcceleration: signal(true),
      softwareRendering: signal(false),
      featureStatus: signal({
        gpu_compositing: "enabled",
        rasterization: "enabled",
        webgl: "enabled",
      }),
      ...overrides.gpu,
    },
    rendering: { software: signal(false), ...overrides.rendering },
    remoteSession: overrides.remoteSession || signal(false),
    display: {
      scaleFactor: signal(1.25),
      monitorCount: signal(1),
      highDpi: signal(false),
      ...overrides.display,
    },
    power: {
      onBattery: signal(false),
      batteryPercent: signal(null, "unavailable"),
      charging: signal(null, "unavailable"),
      ...overrides.power,
    },
    cpu: {
      logicalThreads: signal(16),
      totalRamGb: signal(32),
      availableRamGb: signal(20),
      ...overrides.cpu,
    },
  };
}

test("normalization preserves available false values and derives high-DPI", async () => {
  const { normalizeCapabilitySnapshot } = await import("../../shared/adaptivePerformance.ts");
  const normalized = normalizeCapabilitySnapshot({
    remoteSession: { value: false, availability: "available" },
    display: { scaleFactor: 2 },
  });
  assert.equal(normalized.remoteSession.value, false);
  assert.equal(normalized.remoteSession.availability, "available");
  assert.equal(normalized.display.highDpi.value, true);
  assert.equal(normalized.gpu.model.availability, "unknown");
});

test("software rendering and remote sessions select efficiency", async () => {
  const { deriveAdaptiveProfile } = await import("../../shared/adaptivePerformance.ts");
  const software = deriveAdaptiveProfile(fixture({
    rendering: { software: signal(true) },
    gpu: { hardwareAcceleration: signal(false), softwareRendering: signal(true) },
  }));
  assert.equal(software.profile, "efficiency");
  assert.ok(software.constrainedSignals.includes("software-rendered"));

  const remote = deriveAdaptiveProfile(fixture({
    remoteSession: signal(true),
    power: { onBattery: signal(true) },
  }));
  assert.equal(remote.profile, "efficiency");
  assert.match(remote.reasons.join(" "), /Remote Desktop/);
});

test("integrated graphics, battery, and high-DPI choose balanced safely", async () => {
  const { deriveAdaptiveProfile } = await import("../../shared/adaptivePerformance.ts");
  const decision = deriveAdaptiveProfile(fixture({
    gpu: { integrated: signal(true) },
    display: { scaleFactor: signal(2), highDpi: signal(true) },
    power: { onBattery: signal(true) },
  }));
  assert.equal(decision.profile, "balanced");
  assert.ok(decision.reasons.some((reason) => reason.includes("battery")));
  assert.ok(decision.reasons.some((reason) => reason.includes("High-DPI")));
});

test("low CPU or RAM capacity reliably selects the efficiency policy", async () => {
  const {
    deriveAdaptiveProfile,
    getAdaptiveTelemetryPolicy,
    getAdaptiveVisualPolicy,
  } = await import("../../shared/adaptivePerformance.ts");
  const cases = [
    fixture({ cpu: { logicalThreads: signal(4) } }),
    fixture({ cpu: { totalRamGb: signal(6), availableRamGb: signal(4) } }),
    fixture({
      cpu: {
        logicalThreads: signal(4),
        totalRamGb: signal(6),
        availableRamGb: signal(4),
      },
    }),
  ];

  for (const input of cases) {
    const decision = deriveAdaptiveProfile(input);
    assert.equal(decision.profile, "efficiency");
    assert.deepEqual(getAdaptiveVisualPolicy(decision.profile, false), {
      animateAmbient: false,
      cursorSpotlight: false,
      waveGrid: false,
      chartAnimation: false,
    });
    assert.deepEqual(getAdaptiveTelemetryPolicy(decision.profile), {
      intervalMultiplier: 4,
      heavyWorkMultiplier: 3,
    });
  }
});

test("capable accelerated desktops retain enhanced mode", async () => {
  const { deriveAdaptiveProfile } = await import("../../shared/adaptivePerformance.ts");
  const decision = deriveAdaptiveProfile(fixture());
  assert.equal(decision.profile, "enhanced");
  assert.ok(decision.confidence >= 70);
});

test("missing core evidence remains unknown rather than fabricated", async () => {
  const { deriveAdaptiveProfile } = await import("../../shared/adaptivePerformance.ts");
  const decision = deriveAdaptiveProfile({});
  assert.equal(decision.profile, "unknown");
  assert.equal(decision.availableSignals, 0);
  assert.match(decision.reasons[0], /Not enough capability data/);
});

test("reduced motion overrides every visual profile", async () => {
  const { getAdaptiveVisualPolicy } = await import("../../shared/adaptivePerformance.ts");
  assert.deepEqual(getAdaptiveVisualPolicy("enhanced", true), {
    animateAmbient: false,
    cursorSpotlight: false,
    waveGrid: false,
    chartAnimation: false,
  });
  assert.equal(getAdaptiveVisualPolicy("efficiency", false).cursorSpotlight, false);
  assert.equal(getAdaptiveVisualPolicy("enhanced", false).cursorSpotlight, true);
});

test("the persisted override resolves one active profile for every detected profile", async () => {
  const { resolveAdaptivePerformanceProfile } = await import("../../shared/adaptivePerformance.ts");
  const detectedProfiles = ["unknown", "efficiency", "balanced", "enhanced"];
  const overrides = ["efficiency", "balanced", "enhanced"];

  for (const detected of detectedProfiles) {
    assert.equal(resolveAdaptivePerformanceProfile(detected, "automatic"), detected);
    for (const override of overrides) {
      assert.equal(resolveAdaptivePerformanceProfile(detected, override), override);
    }
  }
});

test("telemetry policies retain values while reducing nonessential cadence", async () => {
  const {
    getAdaptiveTelemetryIntervalMs,
    getAdaptiveTelemetryPolicy,
    getAdaptiveVisualPolicy,
  } = await import("../../shared/adaptivePerformance.ts");
  const expected = {
    efficiency: { intervalMultiplier: 4, heavyWorkMultiplier: 3 },
    balanced: { intervalMultiplier: 1.5, heavyWorkMultiplier: 2 },
    enhanced: { intervalMultiplier: 1, heavyWorkMultiplier: 1 },
  };

  for (const [profile, policy] of Object.entries(expected)) {
    assert.deepEqual(getAdaptiveTelemetryPolicy(profile), policy);
  }
  assert.deepEqual(getAdaptiveVisualPolicy("efficiency", false), {
    animateAmbient: false,
    cursorSpotlight: false,
    waveGrid: false,
    chartAnimation: false,
  });
  assert.deepEqual(getAdaptiveVisualPolicy("balanced", false), {
    animateAmbient: true,
    cursorSpotlight: false,
    waveGrid: false,
    chartAnimation: false,
  });
  assert.deepEqual(getAdaptiveVisualPolicy("enhanced", false), {
    animateAmbient: true,
    cursorSpotlight: true,
    waveGrid: true,
    chartAnimation: true,
  });
  assert.deepEqual(getAdaptiveTelemetryPolicy("efficiency"), {
    intervalMultiplier: 4,
    heavyWorkMultiplier: 3,
  });
  assert.deepEqual(getAdaptiveTelemetryPolicy("enhanced"), {
    intervalMultiplier: 1,
    heavyWorkMultiplier: 1,
  });
  assert.equal(getAdaptiveTelemetryIntervalMs("enhanced", 2000, "full"), 2000);
  assert.equal(getAdaptiveTelemetryIntervalMs("balanced", 2000, "full"), 3000);
  assert.equal(getAdaptiveTelemetryIntervalMs("efficiency", 2000, "full"), 8000);
  assert.equal(getAdaptiveTelemetryIntervalMs("enhanced", 2000, "intelligence"), 5000);
  assert.equal(getAdaptiveTelemetryIntervalMs("enhanced", 8000, "full"), 8000);
  assert.equal(getAdaptiveTelemetryIntervalMs("balanced", 2000, "full", 2), 6000);
});

test("Electron, settings, visuals, and telemetry use the shared capability boundary", () => {
  const main = fs.readFileSync("electron/main.js", "utf8");
  const preload = fs.readFileSync("electron/preload.js", "utf8");
  const background = fs.readFileSync("client/src/components/AppBackground.tsx", "utf8");
  const settings = fs.readFileSync("client/src/pages/Settings.tsx", "utf8");
  const manager = fs.readFileSync("client/src/lib/telemetryManager.ts", "utf8");
  const preferences = fs.readFileSync("client/src/stores/userPreferencesStore.ts", "utf8");

  assert.match(main, /system:getCapabilities/);
  assert.match(main, /app\.getGPUFeatureStatus\(\)/);
  assert.match(main, /powerMonitor\.on\('on-battery'/);
  assert.match(main, /adaptive-capabilities\.session/);
  assert.match(main, /system:capabilities-changed/);
  assert.match(main, /_profileHeavyWorkMultiplier\(\)/);
  assert.match(main, /_adaptiveCapabilityGeneration/);
  assert.match(main, /in-flight-reconciled/);
  assert.match(main, /powerMonitor\.on\('lock-screen'/);
  assert.match(main, /_rescheduleTelemetryLoop\(\)/);
  assert.match(main, /performanceProfile: _adaptivePerformanceProfile/);
  assert.match(main, /requestedIntervalMs: _rendererRequestedIntervalMs/);
  assert.match(main, /heavyWorkMultiplier: _profileHeavyWorkMultiplier\(\)/);
  assert.match(preload, /onCapabilitiesChanged/);
  assert.match(background, /getAdaptiveVisualPolicy/);
  assert.match(background, /useUserPreferencesStore\(\(state\) => state\.reducedMotion\)/);
  assert.match(background, /prefersReducedMotion \|\| appReducedMotion/);
  assert.match(background, /getAdaptiveVisualPolicy\(profile, effectiveReducedMotion\)/);
  assert.doesNotMatch(background, /hardwareConcurrency/);
  assert.match(settings, /button-performance-profile-\$\{option\.value\}/);
  assert.match(manager, /getAdaptivePerformanceProfile/);
  assert.match(manager, /getAdaptiveTelemetryIntervalMs/);
  assert.match(manager, /getTelemetryPollingIntervalMs/);
  assert.match(manager, /setDemandMode\?\.\(\s*mode,\s*getTelemetryPollingIntervalMs\(\)/);
  assert.match(manager, /sc:adaptive-profile-changed/);
  const store = fs.readFileSync("client/src/lib/adaptivePerformanceStore.ts", "utf8");
  assert.match(store, /getCapabilities\(\{ force \}\)/);
  assert.match(store, /pendingForcedRefresh/);
  assert.match(store, /resolveAdaptivePerformanceProfile/);
  assert.match(preferences, /name: "sc-user-preferences"/);
  assert.match(preferences, /PERFORMANCE_PROFILE_OVERRIDES\.includes\(next\.performanceProfileOverride\)/);
  assert.match(settings, /do not change Windows power plans or tweak settings/i);
  for (const profile of ["automatic", "efficiency", "balanced", "enhanced"]) {
    assert.match(settings, new RegExp(`value: "${profile}"`));
  }
});