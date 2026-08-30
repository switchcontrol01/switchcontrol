const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const app = read("client/src/App.tsx");
const premiumExpiry = read("client/src/hooks/usePremiumExpiry.ts");
const networkTweaks = read("client/src/pages/NetworkTweaks.tsx");
const modeOverlay = read("client/src/components/ModeTransitionOverlay.tsx");

test("cached or grace entitlements never become cloud verification", () => {
  assert.match(
    app,
    /cached session mounted; cloud entitlement verification pending/,
    "cached startup must explicitly remain unverified",
  );
  assert.doesNotMatch(
    app,
    /entitlementsVerified=true immediately \(cloud confirmation pending\)/,
    "grace fast-path must not authorize expiry mutations",
  );
  assert.doesNotMatch(
    app,
    /grace fallback active, entitlementsVerified set/,
    "offline grace must not authorize expiry mutations",
  );
  assert.match(
    app,
    /authState\.verified && authState\.user[\s\S]*?setEntitlementsVerified\(true\)/,
    "only the cloud-confirmed user branch should promote verification",
  );
});

test("expiry trigger rechecks cloud verification and current activity", () => {
  assert.match(
    premiumExpiry,
    /entitlementVerifiedRef\.current = entitlementsVerified && graceSessionVerified/,
  );
  assert.match(
    premiumExpiry,
    /automaticRevertSuspendedRef\.current \|\|\s*!entitlementVerifiedRef\.current \|\|\s*isCurrentlyActiveRef\.current/,
    "a delayed timer or ownership check must not mutate Windows from stale state",
  );
  assert.match(
    premiumExpiry,
    /if \(!isLoggedIn \|\| !cloudEntitlementVerified\)/,
    "the watcher and timer must require the verified session boundary",
  );
  assert.match(
    premiumExpiry,
    /automaticRevertSuspendedRef\.current \|\|[\s\S]*?!entitlementVerifiedRef\.current/,
    "a first-run consent gate must remain a final mutation boundary",
  );
});

test("Electron network pages always reconcile native state", () => {
  assert.match(
    networkTweaks,
    /if \(cacheFresh && !isElectron\)/,
    "warm-cache short-circuit is allowed only in browser mode",
  );
  assert.doesNotMatch(
    networkTweaks,
    /if \(cacheFresh\) \{\s*console\.log\('\[NetworkTweaks\] cache fresh, skipping verification/,
    "Electron must not skip Windows verification because session cache is fresh",
  );
  assert.match(
    networkTweaks,
    /setSliderValue\('net-throttle-index', result\.value\)[\s\S]*?sc:slider-state-changed/,
    "confirmed toggle hydration must publish the shared slider value",
  );
  assert.match(
    read("client/src/hooks/use-slider-tweak.ts"),
    /pendingValue:\s+pendingTouchedRef\.current \? s\.pendingValue : confirmedValue/,
    "confirmed slider hydration must override stale cache unless the user is actively editing",
  );
  assert.match(
    read("electron/main.js"),
    /applied: confirmed \? r\.value === 4294967295 : null/,
    "missing or failed native reads must remain inconclusive",
  );
});

test("startup overlays share an explicit blocking boundary", () => {
  assert.match(
    app,
    /const competingOverlayActive =[\s\S]*?revertModalOpen[\s\S]*?showPatchNotes/,
  );
  assert.match(
    app,
    /<ModeTransitionOverlay[\s\S]*?blocked=\{competingOverlayActive \|\| activeFlow !== "none"\}/,
  );
  assert.match(
    modeOverlay,
    /if \(!transitioning \|\| blocked\) return null/,
  );
});