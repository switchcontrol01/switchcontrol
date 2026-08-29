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