const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const app = read("client/src/App.tsx");
const modal = read("client/src/components/FirstRunLanguageModal.tsx");
const i18n = read("client/src/lib/i18n.tsx");
const authRoutes = read("server/auth/google.ts");

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
  assert.match(
    app,
    /const isGenuinelyNewUser = exchangedUser\.hasInstalledApp === false/,
    "the OAuth path must use the server installation marker instead of local storage alone",
  );
  assert.match(
    app,
    /const isGenuinelyNewUserFast = user!\.hasInstalledApp === false/,
    "the cached-session path must not treat cleared AppData as a new account",
  );
  assert.match(
    authRoutes,
    /hasInstalledApp: dbUserForExchange\?\.hasInstalledApp \|\| false/,
    "the OAuth exchange must expose the server installation marker",
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
  assert.match(modal, /onClick=\{\(\) => finish\(language\)\}/);
  assert.match(modal, /onClick=\{\(\) => setStep\("picker"\)\}/);
  assert.match(modal, /onClick=\{\(\) => finish\(selectedLocale\)\}/);
  assert.match(
    modal,
    /const ENTER_DURATION_MS = 2000/,
    "the modal must have a full two-second entrance animation",
  );
  assert.match(
    modal,
    /const previewLocale = \(locale: Locale\) => \{\s*setSelectedLocale\(locale\);\s*\/\/ Previewing is intentionally live[\s\S]*?setLanguage\(locale\);/,
    "choosing a locale must immediately update the active language",
  );
  assert.match(
    modal,
    /data-animation-state=\{isExiting \? "exiting" : isEntered \? "entered" : "entering"\}/,
    "the modal must expose a deterministic entrance state for regression checks",
  );
  assert.match(
    modal,
    /max-w-\[460px\]/,
    "the first-run card should stay compact",
  );
  assert.match(
    modal,
    /EXIT_DURATION_MS = 2000/,
    "the handoff must use the requested two-second blur/fade exit",
  );
});

test("first-run copy is present for every supported locale", () => {
  const locales = [
    "en", "zh-CN", "es", "hi", "ar", "pt-BR", "bn", "ru", "ja", "pa",
    "de", "id", "ko", "fr", "te", "tr", "mr", "ta", "vi", "ur",
  ];

  assert.match(i18n, /const FIRST_RUN_COPY: Record<Locale, MessageCatalog>/);
  for (const locale of locales) {
    assert.match(
      i18n,
      new RegExp(`^\\s*(?:"${locale}"|${locale}): \\{`, "m"),
      `missing first-run copy for ${locale}`,
    );
  }
  assert.match(
    i18n,
    /Object\.assign\(CATALOGS\[locale\], labels\);\s*\n}\s*\n\s*const I18nContext/,
    "first-run copy must be merged into the live translation catalogs",
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
