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