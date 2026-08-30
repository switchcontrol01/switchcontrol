const test = require("node:test");
const assert = require("node:assert/strict");

test("slider selection enables Apply when the native read is temporarily unavailable", async () => {
  const { isSliderDirty } = await import("../../client/src/lib/slider-state.ts");

  assert.equal(
    isSliderDirty(null, 15, false),
    false,
    "initial cached/default state must not enable Apply before user input",
  );
  assert.equal(
    isSliderDirty(null, 15, true),
    true,
    "an explicit selection must enable Apply even without a current readback",
  );
  assert.equal(
    isSliderDirty(20, 20, true),
    false,
    "selecting the confirmed current value must remain clean",
  );
  assert.equal(
    isSliderDirty(20, 15, false),
    true,
    "a pending value different from the confirmed current value is dirty",
  );
  assert.equal(
    isSliderDirty(20, null, true),
    false,
    "a missing pending value can never be applied",
  );
});