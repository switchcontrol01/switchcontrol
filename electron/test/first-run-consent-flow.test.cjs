const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const app = read("client/src/App.tsx");
const consent = read("client/src/components/FirstRunConsent.tsx");
const terms = read("client/src/pages/Terms.tsx");
const privacy = read("client/src/pages/Privacy.tsx");
const legal = read("client/src/lib/legalContent.ts");

test("first-run phases place consent and disclaimer before welcome", () => {
  assert.match(app, /"consent"/);
  assert.match(app, /setPhase\(getFirstRunGatePhase\(user\.id\)\)/);
  assert.match(
    app,
    /FirstRunLanguage\] choice saved, transitioning to consent[\s\S]*?setPhase\("consent"\)/,
  );
  assert.match(
    app,
    /FirstRunConsent\] consent saved, transitioning to gaming disclaimer[\s\S]*?setPhase\("disclaiming"\)/,
  );
  assert.match(
    app,
    /FirstRunDisclaimer\] dismissed, transitioning to welcome[\s\S]*?setPhase\("welcome"\)/,
  );
  assert.match(
    app,
    /phase === "welcome"[\s\S]*?setPhase\("authenticated"\)/,
    "welcome must be the final gate before the dashboard mounts",
  );
});

test("consent requires the complete legal scroll before enabling agree", () => {
  assert.match(consent, /data-testid="first-run-consent-scroll"/);
  assert.match(consent, /scrollTop \+ element\.clientHeight/);
  assert.match(consent, /disabled=\{!isAtBottom \|\| isExiting \|\| isDeclining\}/);
  assert.match(consent, /isAtBottom \? "100%" : "28%"/);
  assert.match(consent, /data-testid="button-first-run-consent-decline"/);
  assert.match(consent, /Decline &amp; quit/);
});

test("consent persists before the two-second exit handoff", () => {
  assert.match(
    consent,
    /localStorage\.setItem\(`\$\{TERMS_CONSENT_KEY\}\$\{userId\}`, "true"\)[\s\S]*?setIsExiting\(true\)[\s\S]*?TRANSITION_MS/,
  );
  assert.match(consent, /const TRANSITION_MS = 2000/);
  assert.match(consent, /data-animation-state=/);
  assert.match(app, /setShowDisclaimer\(false\);[\s\S]*?setPhase\("welcome"\)/);
});

test("website legal pages and consent gate share the same source sections", () => {
  assert.match(terms, /TERMS_SECTIONS\.map/);
  assert.match(privacy, /PRIVACY_SECTIONS\.map/);
  assert.match(consent, /TERMS_SECTIONS\.map/);
  assert.match(consent, /PRIVACY_SECTIONS\.map/);
  assert.match(legal, /export const TERMS_SECTIONS/);
  assert.match(legal, /export const PRIVACY_SECTIONS/);
});

test("declining consent closes Electron and safely returns web users to login", () => {
  assert.match(app, /if \(api\?\.quitApp\) \{\s*api\.quitApp\(\);/);
  assert.match(app, /storeLogout\(\);[\s\S]*?setPhase\("unauthenticated"\)/);
  assert.match(app, /phase === "consent" && user\?\.loggedIn && user\.id/);
});