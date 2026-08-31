const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const app = read("client/src/App.tsx");
const settings = read("client/src/pages/Settings.tsx");
const context = read("client/src/lib/appAuthContext.ts");
const simulation = require(path.join(
  process.cwd(),
  "client/src/lib/onboardingSimulation.ts",
));

const user = (overrides = {}) => ({
  id: "owner-id",
  email: "switchcontrol67@gmail.com",
  isAdmin: true,
  loggedIn: true,
  ...overrides,
});

test("simulation privilege gate is exact, normalized, server-verified, and desktop-only", () => {
  assert.equal(
    simulation.canSimulateFirstTimeUser(user({ email: " SwitchControl67@GMAIL.COM " }), true, true),
    true,
  );
  assert.equal(simulation.canSimulateFirstTimeUser(user({ email: "other@example.com" }), true, true), false);
  assert.equal(simulation.canSimulateFirstTimeUser(user({ isAdmin: false }), true, true), false);
  assert.equal(simulation.canSimulateFirstTimeUser(user(), false, true), false);
  assert.equal(simulation.canSimulateFirstTimeUser(user(), true, false), false);
  assert.equal(simulation.canSimulateFirstTimeUser(user({ loggedIn: false }), true, true), false);
  assert.match(app, /verifiedAdminSnapshotRef/);
  assert.match(app, /serverVerifiedUser\.id !== currentUser\?\.id/);
  assert.match(app, /serverVerifiedUser\.isAdmin !== true/);
  assert.match(context, /canSimulateFirstTimeUser: boolean/);
  assert.match(app, /verifiedAdminSnapshotRef\.current\?\.isAdmin === true/);
});

test("Settings exposes only the guarded simulation action and confirms both destructive boundaries", () => {
  assert.match(settings, /canSimulateFirstTimeUser: canReplayFirstRun/);
  assert.match(settings, /data-testid="button-simulate-first-time-user"/);
  assert.match(settings, /aria-describedby="simulate-first-time-user-description"/);
  assert.match(settings, /data-testid="button-factory-reset"/);
  assert.match(settings, /Factory Reset permanently removes local settings/);
  assert.match(settings, /This will sign you out and replay onboarding\./);
  assert.match(
    settings,
    /Factory Reset[\s\S]*?data-testid="button-factory-reset"[\s\S]*?canReplayFirstRun/,
    "the simulation must remain directly below Factory Reset",
  );
});

test("simulation clears only account-scoped first-run markers, retains pending, and uses normal logout", () => {
  assert.match(
    app,
    /function restartFirstRunSequence\(userId: string\)[\s\S]*?sc_language_prompt_seen_[\s\S]*?TERMS_CONSENT_KEY[\s\S]*?sc_disclaimer_seen_[\s\S]*?sc_welcomed_[\s\S]*?sc_tour_completed_[\s\S]*?markFirstRunPending\(userId\)/,
  );
  const action = app.slice(
    app.indexOf("const handleSimulateFirstTimeUser"),
    app.indexOf("const handleSafeRefreshEntitlements"),
  );
  assert.match(action, /restartFirstRunSequence\(simulationUserId\)/);
  assert.match(action, /clearTourState\(\)/);
  assert.match(action, /closePromo\(\)/);
  assert.match(action, /closeRevertModal\(\)/);
  assert.match(action, /setShowDisclaimer\(false\)/);
  assert.match(action, /performFullLogout\("admin_onboarding_simulation"\)/);
  assert.match(action, /setPhase\("unauthenticated"\)/);
  assert.match(action, /setLocation\("\/"\)/);
  assert.doesNotMatch(action, /resetAppData|clearSwitchControlStorage|postResetTourFlags/);
  assert.doesNotMatch(action, /hasInstalledApp|isPremium|trialEndsAt/);
});

test("simulation action is part of the typed auth context and does not reuse native reset", () => {
  assert.match(context, /simulateFirstTimeUser: \(\) => Promise<boolean>/);
  assert.match(app, /simulateFirstTimeUser: handleSimulateFirstTimeUser/);
  assert.match(
    app,
    /const handleFactoryReset = async \(\) => \{[\s\S]*?api\.resetAppData\(\)/,
    "Factory Reset must retain its native cleanup handoff",
  );
  assert.match(
    app,
    /postResetTourFlags\(\)/,
    "Factory Reset must retain its server tour-flag reset after native success",
  );
});

test("re-login with the pending marker follows the existing ordered first-run gates", () => {
  assert.match(
    app,
    /const interruptedFirstRun = hasIncompleteFirstRunSequence\(\s*exchangedUser\.id,\s*\)/,
  );
  assert.match(app, /setPhase\(getFirstRunGatePhase\(exchangedUser\.id\)\)/);
  assert.match(
    app,
    /function getFirstRunGatePhase\(userId: string\)[\s\S]*?language[\s\S]*?consent[\s\S]*?disclaiming[\s\S]*?welcome/,
  );
  assert.match(app, /setShowDisclaimer\(true\);[\s\S]*?setPhase\("disclaiming"\)/);
  assert.match(app, /<FirstRunDisclaimer/);
  assert.match(app, /<OnboardingTour/);
  assert.match(app, /onComplete=\{\(\) => \{[\s\S]*?sc_tour_completed_\$\{user\.id\}/);
  assert.match(app, /onSkip=\{\(\) => \{[\s\S]*?sc_tour_completed_\$\{user\.id\}/);
});