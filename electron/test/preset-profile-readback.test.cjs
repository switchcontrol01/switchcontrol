const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const shared = require("../ps-shared");
const originalQueryPS = shared.queryPS;
let registryRead = "";
shared.queryPS = async () => registryRead;

const { readPresetValue } = require("../preset-tweak-executor");
const hook = fs.readFileSync(
  path.join(process.cwd(), "client/src/hooks/use-preset-tweak.ts"),
  "utf8",
);
const card = fs.readFileSync(
  path.join(process.cwd(), "client/src/components/tweaks/TweakPresetCard.tsx"),
  "utf8",
);
const registry = fs.readFileSync(
  path.join(process.cwd(), "client/src/lib/tweak-registry.ts"),
  "utf8",
);

test("IRQ readback distinguishes an absent override from an unknown value", async () => {
  registryRead = "";
  assert.deepEqual(await readPresetValue("irq-optimization-profile"), {
    optionId: "balanced",
    raw: null,
    error: null,
  });

  registryRead = "1";
  assert.equal((await readPresetValue("irq-optimization-profile")).optionId, "gaming");
  registryRead = "2";
  assert.equal((await readPresetValue("irq-optimization-profile")).optionId, "streaming");

  registryRead = "0";
  const unknown = await readPresetValue("irq-optimization-profile");
  assert.equal(unknown.optionId, null);
  assert.equal(unknown.error, "Unrecognized registry value: 0");
  assert.equal(unknown.raw, "0");
});

test("busy preset reads retry without claiming the Windows default", () => {
  const busyBranch = hook.slice(
    hook.indexOf("if (result.error === 'busy'"),
    hook.indexOf("if (result.error || result.optionId === null)"),
  );
  assert.match(hook, /MAX_BUSY_READ_RETRIES = 6/);
  assert.match(busyBranch, /refresh\(true\)/);
  assert.match(busyBranch, /currentOptionId: s\.currentOptionId/);
  assert.doesNotMatch(busyBranch, /currentOptionId:\s*cached\s*\?\?\s*config\.defaultOptionId/);
});

test("an unread profile is shown as unverified, with a retry action", () => {
  assert.match(card, /state\.lastError \? t\("Not verified"\)/);
  assert.match(card, /The Windows profile could not be verified\. No default is assumed\./);
  assert.match(card, /onClick=\{\(\) => void refresh\(\)\}/);
});

test("IRQ profile copy describes its actual single registry value", () => {
  const irqProfile = registry.slice(
    registry.indexOf('id: "irq-optimization-profile"'),
    registry.indexOf('id: "io-optimization-profile"'),
  );
  assert.match(irqProfile, /legacy Windows IRQ8Priority registry value/);
  assert.match(irqProfile, /not per-device interrupt affinity/);
  assert.doesNotMatch(irqProfile, /coordinated set of PriorityControl registry values/);
});

test.after(() => {
  shared.queryPS = originalQueryPS;
});
