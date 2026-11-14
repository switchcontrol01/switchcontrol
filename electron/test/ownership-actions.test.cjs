const test = require("node:test");
const assert = require("node:assert/strict");
const { recordOwnershipAfterAction, clearOwnedTweakTarget } = require("../ownership-actions");

function fakeStore() {
  const calls = [];
  return {
    calls,
    recordApply: (...args) => calls.push(["apply", ...args]),
    recordRevert: (...args) => calls.push(["revert", ...args]),
  };
}

test("verified apply records one app-owned applied target", () => {
  const store = fakeStore();
  assert.equal(recordOwnershipAfterAction(store, "tweak:test", "apply", {
    success: true,
    verified: true,
  }), true);
  assert.deepEqual(store.calls, [
    ["apply", "tweak:test", { appliedValue: true, verificationState: "verified" }],
  ]);
});

test("verified revert clears ownership instead of recording another apply", () => {
  const store = fakeStore();
  assert.equal(recordOwnershipAfterAction(store, "tweak:test", "revert", {
    success: true,
    verified: true,
  }), true);
  assert.deepEqual(store.calls, [["revert", "tweak:test"]]);
});

test("failed and unverified reverts retain ownership", () => {
  for (const result of [
    { success: false, verified: false },
    { success: true, verified: false },
  ]) {
    const store = fakeStore();
    assert.equal(recordOwnershipAfterAction(store, "tweak:test", "revert", result), false);
    assert.deepEqual(store.calls, []);
  }
});

test("slider takeover releases only an active legacy-toggle claim", () => {
  const calls = [];
  const record = { appliedByApp: true, baselineCaptured: true, previousValue: false };
  const store = {
    getOwnershipRecord: key => {
      calls.push(["read", key]);
      return record;
    },
    recordRevert: key => calls.push(["revert", key]),
  };

  assert.deepEqual(clearOwnedTweakTarget(store, "tweak:tune-priority"), { ok: true, cleared: true });
  assert.deepEqual(calls, [
    ["read", "tweak:tune-priority"],
    ["revert", "tweak:tune-priority"],
  ]);
  assert.equal(record.baselineCaptured, true);
  assert.equal(record.previousValue, false);

  calls.length = 0;
  store.getOwnershipRecord = key => {
    calls.push(["read", key]);
    return { appliedByApp: false };
  };
  assert.deepEqual(clearOwnedTweakTarget(store, "tweak:tune-priority"), { ok: true, cleared: false });
  assert.deepEqual(calls, [["read", "tweak:tune-priority"]]);
});
