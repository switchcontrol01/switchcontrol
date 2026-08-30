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
  disclaimer: read("client/src/components/FirstRunDisclaimer.tsx"),
  tour: read("client/src/components/TourShell.tsx"),
};

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