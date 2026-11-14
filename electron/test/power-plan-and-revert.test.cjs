const test = require("node:test");
const assert = require("node:assert/strict");

const powerPlans = require("../power-plan-manager.js");
const {
  summarizeRevertDetails,
  isUnverifiableOwnershipRecord,
} = require("../premium-revert-pipeline.js");

test("powercfg parsers accept localized labels and retain GUID identity", () => {
  const active = powerPlans.parseActiveScheme(
    "Energieplaneschema-GUID: 381B4222-F694-41F0-9685-FF5BB260DF2E  (Ausbalanciert)"
  );
  assert.deepEqual(active, {
    guid: "381b4222-f694-41f0-9685-ff5bb260df2e",
    name: "Ausbalanciert",
  });

  const list = powerPlans.parseSchemeList(
    "GUID du mode de gestion de l’alimentation : 381B4222-F694-41F0-9685-FF5BB260DF2E (Équilibré) *\n" +
    "Plan GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c (Performances élevées)"
  );
  assert.equal(list.length, 2);
  assert.equal(list[0].isActive, true);
  assert.equal(list[1].isActive, false);
});

test("CPU Boost retries hidden powercfg settings before reporting no value", async () => {
  const calls = [];
  const result = await powerPlans.readPowerSettingValue(
    "381b4222-f694-41f0-9685-ff5bb260df2e",
    "perfBoostModeAC",
    { subgroup: "processor", setting: "boost-mode" },
    async (mode) => {
      calls.push(mode);
      if (mode === "/query") return "The setting is hidden and has no current index.";
      return "Current AC Power Setting Index: 0x00000004\n";
    },
  );

  assert.deepEqual(calls, ["/query", "/qh"]);
  assert.equal(result.value, 4);
  assert.equal(result.source, "/qh");
  assert.equal(result.error, null);
});

test("CPU Boost distinguishes unavailable reads from settings Windows did not report", async () => {
  const def = { subgroup: "processor", setting: "boost-mode" };
  const missing = await powerPlans.readPowerSettingValue("scheme", "perfBoostModeAC", def, async () => "");
  const failed = await powerPlans.readPowerSettingValue("scheme", "perfBoostModeAC", def, async () => {
    throw new Error("powercfg query failed");
  });

  assert.equal(
    powerPlans.generateBreakdown({ perfBoostModeAC: missing.value }, {}).cpuBoost,
    "Not reported by Windows",
  );
  assert.equal(
    powerPlans.generateBreakdown({ perfBoostModeAC: failed.value }, { perfBoostModeAC: failed.error }).cpuBoost,
    "Unavailable",
  );
  assert.match(failed.error, /powercfg query failed/);
});

test("CPU Boost preserves hidden-query failures after a visible query omits the value", async () => {
  const calls = [];
  const result = await powerPlans.readPowerSettingValue(
    "scheme",
    "perfBoostModeAC",
    { subgroup: "processor", setting: "boost-mode" },
    async (mode) => {
      calls.push(mode);
      if (mode === "/query") return "The setting is hidden and has no current index.";
      throw new Error("hidden query failed");
    },
  );

  assert.deepEqual(calls, ["/query", "/qh"]);
  assert.equal(result.value, null);
  assert.match(result.error, /hidden query failed/);
  assert.equal(
    powerPlans.generateBreakdown({ perfBoostModeAC: null }, { perfBoostModeAC: result.error }).cpuBoost,
    "Unavailable",
  );
});

test("custom Power Plan builds targets for each formerly disabled control", () => {
  const targets = powerPlans.buildCustomPowerSettingTargets({
    minProcessorState: 0,
    maxProcessorState: 90,
    enableTurboBoost: true,
    enableHardwarePStates: true,
    preferPerformanceProcesses: true,
    optimizePerformanceInterval: true,
    disableUsbPowerManagement: true,
  });

  assert.equal(targets.cpuMinPercentAC, 0, "zero is a valid processor minimum");
  assert.equal(targets.processorAutonomousModeAC, 1);
  assert.equal(targets.processorPerformanceTimeCheckIntervalAC, 10);
  assert.equal(targets.usbPowerManagementAC, 0);
  assert.equal("win32PrioritySeparation" in targets, false, "foreground priority uses the shared slider executor");
});

test("hidden Windows power settings retry through powercfg /qh", async () => {
  for (const key of [
    "processorAutonomousModeAC",
    "processorPerformanceTimeCheckIntervalAC",
    "usbPowerManagementAC",
  ]) {
    const calls = [];
    const result = await powerPlans.readPowerSettingValue(
      "scheme",
      key,
      { subgroup: "processor", setting: key },
      async mode => {
        calls.push(mode);
        return mode === "/query"
          ? "Setting is hidden."
          : "Current AC Power Setting Index: 0x00000001";
      },
    );
    assert.deepEqual(calls, ["/query", "/qh"], `${key} gets a hidden-setting retry`);
    assert.equal(result.value, 1);
    assert.equal(result.source, "/qh");
  }
});

test("revert summary counts each final detail exactly once", () => {
  const summary = summarizeRevertDetails({
    ownedTweak: { success: true },
    ownedNetwork: { success: false, error: "verification failed" },
    missingBaseline: { skipped: true, reason: "no baseline" },
    recoveryAudit: { success: true, verified: true },
  });
  assert.deepEqual(summary, {
    total: 4,
    reverted: 2,
    skipped: 1,
    failed: 1,
    success: false,
  });
  assert.equal(summary.total, summary.reverted + summary.skipped + summary.failed);
});

test("unbaselined ownership is treated as unverifiable instead of proof of an app change", () => {
  assert.equal(isUnverifiableOwnershipRecord({
    appliedByApp: true,
    baselineCaptured: false,
    previousValue: null,
  }), true);
  assert.equal(isUnverifiableOwnershipRecord({
    appliedByApp: true,
    baselineCaptured: true,
    previousValue: false,
  }), false);
  assert.equal(isUnverifiableOwnershipRecord({
    appliedByApp: false,
    baselineCaptured: false,
    previousValue: null,
  }), false);
});