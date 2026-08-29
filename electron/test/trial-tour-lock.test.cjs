const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const tourShell = fs.readFileSync(
  path.join(process.cwd(), "client/src/components/TourShell.tsx"),
  "utf8",
);
const app = fs.readFileSync(
  path.join(process.cwd(), "client/src/App.tsx"),
  "utf8",
);

test("tour step updates do not reinitialize and relock the sidebar", () => {
  assert.match(
    tourShell,
    /const stepsRef = useRef\(steps\);\s*stepsRef\.current = steps;/,
    "TourShell should keep changing step data in a ref",
  );
  assert.match(
    tourShell,
    /const s = stepsRef\.current\[index\];/,
    "step application should read the current ref",
  );
  assert.match(
    tourShell,
    /\}, \[setTourHighlight, navigate, setTourNavigating\]\);/,
    "applyStep should remain stable when wrapper props update",
  );
});

test("trial tour dismisses before waiting for server persistence", () => {
  const trialCompletion = app.match(
    /activeFlow === "trialTour"[\s\S]*?postTrialTourSeen\(\);[\s\S]*?setActiveFlow\("none"\);/,
  );
  assert.ok(trialCompletion, "trial tour completion flow should exist");
  assert.ok(
    trialCompletion[0].indexOf('setActiveFlow("none")') <
      trialCompletion[0].indexOf("await postTrialTourSeen()"),
    "flow dismissal must happen before the persistence request",
  );
});