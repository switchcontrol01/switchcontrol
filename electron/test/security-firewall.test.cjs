const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeFirewallProbe } = require("../firewall-status.js");

test("active Public profile is not reported as disabled because Private is off", () => {
  const result = normalizeFirewallProbe({
    profiles: [
      { Name: "Private", Enabled: false },
      { Name: "Public", Enabled: true },
    ],
    activeCategories: ["Public"],
  });
  assert.equal(result.enabled, true);
});

test("single active profile emitted as a scalar still selects the active profile", () => {
  const result = normalizeFirewallProbe({
    profiles: [
      { Name: "Private", Enabled: false },
      { Name: "Public", Enabled: true },
    ],
    activeCategories: "Public",
  });
  assert.equal(result.enabled, true);
});

test("active Private profile reports its enabled state", () => {
  const result = normalizeFirewallProbe({
    profiles: [
      { Name: "Private", Enabled: true },
      { Name: "Public", Enabled: false },
    ],
    activeCategories: ["Private"],
  });
  assert.equal(result.enabled, true);
});

test("DomainAuthenticated maps to the Domain firewall profile", () => {
  const result = normalizeFirewallProbe({
    profiles: [{ Name: "Domain", Enabled: "True" }],
    activeCategories: ["DomainAuthenticated"],
  });
  assert.equal(result.enabled, true);
});

test("missing firewall profiles remains unknown instead of becoming false", () => {
  assert.equal(normalizeFirewallProbe({ profiles: [], activeCategories: [] }).enabled, null);
});

test("missing Enabled data remains unknown instead of becoming disabled", () => {
  const result = normalizeFirewallProbe({
    profiles: [{ Name: "Public" }],
    activeCategories: ["Public"],
  });
  assert.equal(result.enabled, null);
});

test("missing active profile remains unknown instead of inferring from a partial result", () => {
  const result = normalizeFirewallProbe({
    profiles: [{ Name: "Private", Enabled: true }],
    activeCategories: ["Public", "Private"],
  });
  assert.equal(result.enabled, null);
});