const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcileOwnedTargets } = require("../owned-tweak-recovery");

function owned(itemId, overrides = {}) {
  return {
    itemType: "network_tweak",
    itemId,
    appliedByApp: true,
    appliedValue: true,
    baselineCaptured: true,
    verificationState: "verified",
    ...overrides,
  };
}

test("recovers only verified app-owned targets and independently verifies the result", async () => {
  const records = [
    owned("already-on"),
    owned("drifted"),
    owned("old-unverified", { verificationState: "unverified" }),
  ];
  const system = new Map([["already-on", true], ["drifted", false], ["old-unverified", false]]);
  const applies = [];

  const result = await reconcileOwnedTargets({
    records,
    itemType: "network_tweak",
    premiumActive: true,
    readCurrent: async (id) => ({ applied: system.get(id), verified: true }),
    applyTarget: async (id) => {
      applies.push(id);
      system.set(id, true);
      return { success: true, verified: true };
    },
  });

  assert.deepEqual(applies, ["drifted", "old-unverified"]);
  assert.deepEqual(result.unchanged, [{ tweakId: "already-on" }]);
  assert.deepEqual(result.reapplied, [{ tweakId: "drifted" }, { tweakId: "old-unverified" }]);
  assert.deepEqual(result.failed, []);
});

test("does not restore missing-baseline, unverified, reverted, or non-premium records", async () => {
  const records = [
    owned("missing-baseline", { baselineCaptured: false }),
    owned("unknown-verification", { verificationState: "unknown" }),
    owned("user-reverted", { appliedByApp: false }),
    owned("premium-target"),
  ];
  const applied = [];
  const result = await reconcileOwnedTargets({
    records,
    itemType: "network_tweak",
    premiumActive: false,
    readCurrent: async () => ({ applied: false, verified: true }),
    applyTarget: async (id) => {
      applied.push(id);
      return { success: true, verified: true };
    },
  });

  assert.deepEqual(applied, []);
  assert.deepEqual(result.skipped, [
    { tweakId: "missing-baseline", reason: "no_verified_app_owned_target" },
    { tweakId: "unknown-verification", reason: "no_verified_app_owned_target" },
    { tweakId: "user-reverted", reason: "no_verified_app_owned_target" },
    { tweakId: "premium-target", reason: "premium_not_verified_active" },
  ]);
});

test("does not apply when the current state or post-write state cannot be verified", async () => {
  let applyCount = 0;
  const records = [owned("unknown"), owned("write-no-op")];
  const result = await reconcileOwnedTargets({
    records,
    itemType: "network_tweak",
    premiumActive: true,
    readCurrent: async (id) => {
      if (id === "unknown") return { applied: null, verified: false, error: "probe timed out" };
      if (applyCount > 0) return { applied: false, verified: true };
      return { applied: false, verified: true };
    },
    applyTarget: async () => {
      applyCount += 1;
      return { success: true, verified: true };
    },
  });

  assert.equal(applyCount, 1);
  assert.deepEqual(result.reapplied, []);
  assert.deepEqual(result.failed, [
    { tweakId: "unknown", error: "probe timed out" },
    { tweakId: "write-no-op", error: "Windows did not retain the target after recovery." },
  ]);
});

test("recovers the requested persistent Tweaks-page toggles", async () => {
  const ids = ["bg-apps", "ntfs-last-access", "tcp-no-delay", "timer-res", "tune-priority"];
  const system = new Map(ids.map(id => [id, false]));
  const result = await reconcileOwnedTargets({
    records: ids.map(id => ({
      itemType: "tweak",
      itemId: id,
      appliedByApp: true,
      appliedValue: true,
      baselineCaptured: true,
      verificationState: "verified",
    })),
    itemType: "tweak",
    premiumActive: true,
    allowedIds: ids,
    readCurrent: async id => ({ applied: system.get(id), verified: true }),
    applyTarget: async id => {
      system.set(id, true);
      return { success: true, verified: true };
    },
  });

  assert.deepEqual(result.reapplied.map(item => item.tweakId), ids);
  assert.equal(result.failed.length, 0);
  assert.ok(ids.every(id => system.get(id) === true));
});

test("free background-app recovery remains available without Premium", async () => {
  const records = ["bg-apps", "timer-res"].map(id => ({
    itemType: "tweak",
    itemId: id,
    appliedByApp: true,
    appliedValue: true,
    baselineCaptured: true,
    verificationState: "verified",
  }));
  const system = new Map([["bg-apps", false], ["timer-res", false]]);
  const result = await reconcileOwnedTargets({
    records,
    itemType: "tweak",
    premiumActive: false,
    allowedIds: ["bg-apps", "timer-res"],
    premiumRequiredIds: ["timer-res"],
    readCurrent: async id => ({ applied: system.get(id), verified: true }),
    applyTarget: async id => {
      system.set(id, true);
      return { success: true, verified: true };
    },
  });

  assert.deepEqual(result.reapplied, [{ tweakId: "bg-apps" }]);
  assert.deepEqual(result.skipped, [{ tweakId: "timer-res", reason: "premium_not_verified_active" }]);
});
