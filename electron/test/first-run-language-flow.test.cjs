const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const app = read("client/src/App.tsx");
const modal = read("client/src/components/FirstRunLanguageModal.tsx");

test("first-run language gate is only mounted for an authenticated user", () => {
  assert.match(
    app,
    /phase === "language" && user\?\.loggedIn && user\.id/,
    "the language modal must not render before login is confirmed",
  );
  assert.match(
    app,
    /user\?\.loggedIn && user\.id && languageKey && !localStorage\.getItem\(languageKey\)/,
    "first-login routing must require an authenticated account and an unseen prompt",
  );
  assert.match(
    app,
    /\? "language" : "welcome"/,
    "the post-login flow must enter the language gate before welcome/onboarding",
  );
});

test("language choice is saved before the first-run transition", () => {
  assert.match(
    modal,
    /setLanguage\(locale\);\s*localStorage\.setItem\(`\$\{LANGUAGE_PROMPT_KEY\}\$\{userId\}`, locale\);\s*setIsExiting\(true\)/,
    "the language and completion marker must be written before the exit animation",
  );
  assert.match(
    modal,
    /const LANGUAGE_PROMPT_KEY = "sc_language_prompt_seen_"/,
  );
  assert.match(modal, /onClick=\{\(\) => finish\("en"\)\}/);
  assert.match(modal, /onClick=\{\(\) => setStep\("picker"\)\}/);
  assert.match(modal, /onClick=\{\(\) => finish\(selectedLocale\)\}/);
  assert.match(
    modal,
    /EXIT_DURATION_MS = 2000/,
    "the handoff must use the requested two-second blur/fade exit",
  );
});

test("new users remain excluded from patch notes and competing overlays", () => {
  assert.match(
    app,
    /if \(isFirstLogin\) return/,
    "patch notes must stay hidden for a genuinely new user",
  );
  assert.match(
    app,
    /revertModalOpen \|\|\s*phase === "language"/,
    "the language gate must participate in overlay arbitration",
  );
  assert.match(
    app,
    /blocked=\{competingOverlayActive \|\| activeFlow !== "none"\}/,
    "mode transitions must wait for the first-run flow",
  );
});
