const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const app = read("client/src/App.tsx");
const consent = read("client/src/components/FirstRunConsent.tsx");
const transition = read("client/src/lib/firstRunTransition.ts");
const terms = read("client/src/pages/Terms.tsx");
const privacy = read("client/src/pages/Privacy.tsx");
const legal = read("client/src/lib/legalContent.ts");

test("first-run phases place consent and disclaimer before welcome", () => {
  assert.match(app, /"consent"/);
  assert.match(
    app,
    /const nextPhase = getFirstRunGatePhase\(user\.id\)[\s\S]*?setFirstRunHandoff\("login-to-language"\)/,
    "successful login must enter the first-run gates through the covered handoff",
  );
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
  assert.match(
    consent,
    /(?:Decline &amp; quit|t\("Decline & quit"\))/,
    "the consent screen must keep a localized decline action",
  );
});

test("consent persists before the two-second exit handoff", () => {
  assert.match(
    consent,
    /localStorage\.setItem\(`\$\{TERMS_CONSENT_KEY\}\$\{userId\}`, "true"\)[\s\S]*?setIsExiting\(true\)[\s\S]*?TRANSITION_MS/,
  );
  assert.match(consent, /FIRST_RUN_TRANSITION_MS/);
  assert.match(consent, /firstRunTransition\(prefersReducedMotion\)/);
  assert.match(transition, /FIRST_RUN_TRANSITION_MS = 2000/);
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

test("declining consent resets first-run, signs out, and only then quits Electron", () => {
  assert.match(
    app,
    /function restartFirstRunSequence\(userId: string\)[\s\S]*?sc_language_prompt_seen_[\s\S]*?TERMS_CONSENT_KEY[\s\S]*?sc_disclaimer_seen_[\s\S]*?sc_welcomed_[\s\S]*?sc_tour_completed_[\s\S]*?markFirstRunPending\(userId\)/,
    "decline must reset every first-run completion marker and retain a required pending gate",
  );
  assert.match(
    app,
    /onDecline=\{async \(\) => \{[\s\S]*?restartFirstRunSequence\(uid\)[\s\S]*?storeLogout\(\)[\s\S]*?setPhase\("unauthenticated"\)[\s\S]*?performFullLogout\([\s\S]*?first_run_terms_declined[\s\S]*?await clearElectronAuthCookies\(\)[\s\S]*?Promise\.race\([\s\S]*?fullLogout[\s\S]*?1_500[\s\S]*?api\.quitApp\(\)/,
    "Electron must clear persisted auth and cookies before quitting",
  );
  assert.match(app, /phase === "consent" && user\?\.loggedIn && user\.id/);
});

test("an interrupted first-run sequence resumes before dashboard startup surfaces", () => {
  assert.match(app, /const FIRST_RUN_PENDING_KEY = "sc_first_run_pending_"/);
  assert.match(
    app,
    /function hasIncompleteFirstRunSequence\(userId: string\)[\s\S]*?languageChosen[\s\S]*?return !consented \|\| !disclaimerSeen/,
    "legacy interrupted consent sessions must be recognized",
  );
  assert.match(
    app,
    /interruptedFirstRunFast \|\| isGenuinelyNewUserFast[\s\S]*?setPhase\(getFirstRunGatePhase\(user!\.id\)\)/,
    "cached-session startup must restore the unfinished required gate",
  );
  assert.match(
    app,
    /suspendAutomaticRevert: firstRunSequencePending/,
    "automatic premium revert must be suspended during required first-run gates",
  );
  assert.match(
    app,
    /showPatchNotes &&\s*!firstRunSequencePending/,
    "patch notes must remain hidden while first-run consent is incomplete",
  );
  assert.match(
    app,
    /open=\{revertModalOpen && !firstRunSequencePending\}/,
    "premium revert must remain hidden while the restarted first-run sequence is pending",
  );
  assert.match(
    app,
    /sc_disclaimer_seen_[^]*?clearFirstRunPending\(uid\)/,
    "the pending marker must only clear after the final required gate",
  );
});