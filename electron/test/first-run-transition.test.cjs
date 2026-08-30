const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const app = read("client/src/App.tsx");
const transition = read("client/src/lib/firstRunTransition.ts");
const files = {
  login: read("client/src/App.tsx"),
  language: read("client/src/components/FirstRunLanguageModal.tsx"),
  consent: read("client/src/components/FirstRunConsent.tsx"),
  disclaimer: read("client/src/components/FirstRunDisclaimer.tsx"),
  tour: read("client/src/components/TourShell.tsx"),
};
const translatedTourPreviews = {
  guidedTour: read("client/src/components/GuidedTour.tsx"),
  onboardingTour: read("client/src/components/OnboardingTour.tsx"),
};
const welcome = read("client/src/components/WelcomeAnimation.tsx");

test("first-run visual contract is shared by every handoff state", () => {
  assert.match(transition, /FIRST_RUN_TRANSITION_MS = 2000/);
  assert.match(transition, /FIRST_RUN_TRANSITION_SECONDS = FIRST_RUN_TRANSITION_MS \/ 1000/);
  assert.match(transition, /FIRST_RUN_BLUR_PX = 18/);
  assert.match(transition, /prefersReducedMotion \? 0 : FIRST_RUN_TRANSITION_SECONDS/);

  for (const [name, source] of Object.entries(files)) {
    assert.match(
      source,
      /firstRunTransition\(prefersReducedMotion\)/,
      `${name} must use the shared duration and reduced-motion contract`,
    );
    assert.match(
      source,
      /firstRunVisual(?:Initial|Visible|Exit)\(\)/,
      `${name} must participate in the shared blur/fade endpoints`,
    );
  }
});

test("phase handoffs hold the swap under a two-second blur/fade cover", () => {
  assert.match(app, /const FIRST_RUN_HANDOFF_MS = 2000/);
  assert.match(app, /const FIRST_RUN_HANDOFF_COVER_MS = FIRST_RUN_HANDOFF_MS \/ 2/);
  assert.match(app, /onCoverRef\.current\(\)/);
  assert.match(
    app,
    /opacity: \[0, 1, 0\][\s\S]*filter: \["blur\(0px\)", "blur\(18px\)", "blur\(0px\)"\]/,
    "the handoff must visibly fade and blur in, cover the phase swap, then reveal",
  );
  assert.match(app, /data-animation-state="cover-swap-reveal"/);
  assert.match(
    app,
    /firstRunHandoff === "login-to-language"/,
    "login-to-language must use the same handoff layer as later first-run phases",
  );
  assert.match(
    app,
    /if \(nextPhase === "language"\) \{\s*setFirstRunHandoff\("login-to-language"\)/,
    "the login screen must remain mounted until the cover midpoint",
  );
  assert.match(
    app,
    /if \(firstRunHandoff === "login-to-language"\) \{[\s\S]{0,500}setPhase\("language"\)/,
    "the language phase must swap under the login handoff cover",
  );
  assert.doesNotMatch(
    files.disclaimer,
    /prefersReduced\s*[?&|)]/,
    "the disclaimer must not reference the removed undefined reduced-motion variable",
  );
  assert.doesNotMatch(
    translatedTourPreviews.guidedTour,
    /NET_TWEAKS\.map\(\(t,\s*i\)[\s\S]{0,500}t\(t\.label\)/,
    "the guided tour must not call a translated list item as a function",
  );
  assert.doesNotMatch(
    translatedTourPreviews.onboardingTour,
    /TWEAKS_LIST\.map\(\(t,\s*i\)[\s\S]{0,500}t\(t\.label\)/,
    "the onboarding tour must not call a translated list item as a function",
  );
});

test("dashboard blur is a sibling scrim and fixed-position safety remains explicit", () => {
  assert.match(app, /function DashboardTransitionLayer/);
  assert.match(app, /data-first-run-transition="dashboard-scrim"/);
  assert.match(
    app,
    /<DashboardTransitionLayer[\s\S]*?active=\{phase === "authenticated"\}/,
    "the dashboard scrim must remain mounted independently so its exit can animate",
  );
  assert.match(
    app,
    /Do NOT use filter or scale\/transform here/,
    "the dashboard app wrapper must continue to protect fixed descendants",
  );
  assert.match(
    app,
    /data-first-run-transition="dashboard"/,
    "the dashboard fade must remain observable for regression checks",
  );
});

test("tour step changes and completion honor the same transition contract", () => {
  const tour = files.tour;
  assert.match(tour, /key=\{stepIndex\}/);
  assert.match(tour, /filter: 'blur\(18px\)'/);
  assert.match(tour, /CompletionMoment[\s\S]*prefersReducedMotion/);
  assert.match(
    tour,
    /prefersReducedMotion \? 0 : TOUR_COMPLETION_TIMING\.doneMs/,
    "reduced-motion users must not wait through the completion cinematic",
  );
});

test("first-run flow follows login → language → notice → welcome → tour → done", () => {
  assert.match(
    app,
    /if \(phase !== "login_success"\) return;[\s\S]*?const nextPhase = getFirstRunGatePhase\(user\.id\)[\s\S]*?setFirstRunHandoff\("login-to-language"\)/,
    "successful login must enter the account-scoped gate through the covered handoff",
  );
  assert.match(
    app,
    /FirstRunLanguage\] choice saved, transitioning to consent[\s\S]*?setPhase\("consent"\)/,
    "language selection must transition to consent",
  );
  assert.match(
    app,
    /FirstRunConsent\] consent saved, transitioning to gaming disclaimer[\s\S]*?setPhase\("disclaiming"\)/,
    "consent must transition to the gaming notice",
  );
  assert.match(
    app,
    /FirstRunDisclaimer\] dismissed, transitioning to welcome[\s\S]*?setPhase\("welcome"\)/,
    "the notice must transition to the welcome animation",
  );
  assert.match(
    app,
    /intro exit complete, mounting dashboard[\s\S]*?setPhase\("authenticated"\)[\s\S]*?setLocation\("\/dashboard"\)/,
    "welcome must finish before the app can mount and start the tour",
  );
  assert.match(
    app,
    /activeFlow === "firstTime"[\s\S]*?<OnboardingTour/,
    "the first-time flow must mount the onboarding tour after welcome",
  );
  assert.match(
    read("client/src/components/TourShell.tsx"),
    /CompletionMoment[\s\S]*?onDoneRef\.current\(\)/,
    "tour completion must reach the done callback",
  );

  for (const [name, source] of Object.entries(files)) {
    assert.match(
      source,
      /firstRunVisualInitial\(\)[\s\S]*?firstRunVisualVisible\(\)[\s\S]*?firstRunVisualExit\(\)/,
      `${name} must define blurred/transparent entry, visible, and exit states`,
    );
    assert.match(
      source,
      /firstRunTransition\(prefersReducedMotion\)/,
      `${name} must use the shared two-second transition`,
    );
  }

  // WelcomeAnimation is nested inside App.tsx. Its child blur is two seconds,
  // while the App wrapper owns the state-level opacity/blur entry and exit.
  assert.match(welcome, /initial=\{\{ filter: "blur\(18px\)" \}\}/);
  assert.match(
    welcome,
    /animate=\{\{ filter: "blur\(0px\)" \}\}[\s\S]*?duration: 2\.0/,
    "welcome content must use the two-second inner blur-in",
  );
  assert.match(
    app,
    /key="welcome"[\s\S]*?firstRunVisualInitial\(\)[\s\S]*?firstRunVisualVisible\(\)[\s\S]*?firstRunVisualExit\(\)/,
    "the App wrapper must own Welcome state-level fade/blur entry and exit",
  );
});