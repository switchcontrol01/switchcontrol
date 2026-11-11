import assert from "node:assert/strict";
import test from "node:test";
import { resolveLicenseSnapshot } from "./licensePresentation";

const now = Date.parse("2026-11-11T10:00:00Z");
const trialEndsAt = new Date(now + 3 * 86_400_000).toISOString();

test("an active trial is not presented as a purchased Premium license", () => {
  const license = resolveLicenseSnapshot({ plan: "trial", isPremium: true, trialEndsAt }, now, false, now);
  assert.equal(license.status, "trial_active");
  assert.equal(license.trialEndsAt, trialEndsAt);
  assert.equal(license.isOfflineCached, false);
});

test("trial expiry wins over a stale premium feature-access flag", () => {
  const license = resolveLicenseSnapshot(
    { plan: "trial", isPremium: true, trialEndsAt: new Date(now - 1).toISOString() },
    now, false, now,
  );
  assert.equal(license.status, "trial_expired");
});

test("missing and invalid trial dates cannot become lifetime Premium", () => {
  for (const value of [null, "not-a-date"]) {
    assert.equal(
      resolveLicenseSnapshot({ plan: "trial", isPremium: true, trialEndsAt: value }, now, false, now).status,
      "trial_expired",
    );
  }
});

test("an open trial snapshot transitions to expired as time passes", () => {
  const active = resolveLicenseSnapshot({ plan: "trial", isPremium: true, trialEndsAt }, now, false, now);
  const expired = resolveLicenseSnapshot(active, now, false, Date.parse(trialEndsAt));
  assert.equal(active.status, "trial_active");
  assert.equal(expired.status, "trial_expired");
});

test("offline trials retain their limited identity and are marked cached", () => {
  const license = resolveLicenseSnapshot({ plan: "trial", isPremium: true, trialEndsAt }, now, true, now);
  assert.equal(license.status, "trial_active");
  assert.equal(license.isOfflineCached, true);
});

test("purchased Premium and Free accounts retain their correct states", () => {
  assert.equal(resolveLicenseSnapshot({ plan: "premium", isPremium: true }, now, false, now).status, "active");
  assert.equal(resolveLicenseSnapshot({ plan: "free", isPremium: false }, now, false, now).status, "free");
});

test("offline purchased Premium remains a grace state, not a trial", () => {
  assert.equal(resolveLicenseSnapshot({ plan: "premium", isPremium: true }, now, true, now).status, "grace");
});
