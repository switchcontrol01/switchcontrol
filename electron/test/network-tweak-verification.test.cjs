const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TWEAK_REGISTRY,
  isNetworkActionVerified,
} = require("../network-tweak-executor");

test("every enabled network tweak has an apply, revert, and readback check", () => {
  const enabled = Object.entries(TWEAK_REGISTRY).filter(([, entry]) => !entry.disabled);
  assert.ok(enabled.length > 0);
  for (const [id, entry] of enabled) {
    assert.equal(typeof entry.apply, "string", `${id} needs a real apply command`);
    assert.equal(typeof entry.revert, "string", `${id} needs a real revert command`);
    assert.equal(typeof entry.check, "string", `${id} needs a native readback check`);
  }
});

test("network apply and revert only count as success when readback matches the target", () => {
  assert.equal(isNetworkActionVerified("apply", true), true);
  assert.equal(isNetworkActionVerified("apply", false), false);
  assert.equal(isNetworkActionVerified("apply", null), false);
  assert.equal(isNetworkActionVerified("revert", false), true);
  assert.equal(isNetworkActionVerified("revert", true), false);
  assert.equal(isNetworkActionVerified("revert", null), false);
  assert.equal(isNetworkActionVerified("other", true), false);
});
