const test = require("node:test");
const assert = require("node:assert/strict");
const { recordOwnershipAfterAction } = require("../ownership-actions");

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
