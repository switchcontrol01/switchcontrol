const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
const page = read("client/src/pages/DriverIntelligence.tsx");
const layout = read("client/src/components/layout/AppLayout.tsx");
const app = read("client/src/App.tsx");
const transition = read("client/src/components/driver-intel/DriverIntelRouteTransition.tsx");

test("immersive driver content bypasses the standard constrained wrapper", () => {
  assert.match(layout, /immersiveContent = false/);
  assert.match(layout, /immersiveContent \? "w-full min-h-full" : "container max-w-7xl mx-auto p-8"/);
  assert.match(page, /<AppLayout noPageAnimation immersiveContent>/);
  assert.match(page, /if \(locked\) return \(\s*<AppLayout noPageAnimation>/);
});

test("driver exit navigation follows completed motion rather than a timer", () => {
  assert.match(app, /<AnimatePresence mode="wait" initial=\{false\}>[\s\S]*<DriverIntelRouteTransition/);
  assert.match(transition, /exit=\{\{[\s\S]*pointerEvents: "none"[\s\S]*transition: \{ duration/);
  assert.match(page, /navigateWithRouteTransition\("\/dashboard"\)/);
  assert.match(page, /navigateWithRouteTransition\("\/ai-advisor"\)/);
  assert.doesNotMatch(page, /setTimeout/);
});

test("driver transitions are deliberate while reduced motion remains immediate", () => {
  assert.match(transition, /const ROUTE_TRANSITION_SECONDS = 1\.5/);
  assert.match(transition, /const duration = reducedMotion \? 0 : ROUTE_TRANSITION_SECONDS/);
  assert.match(transition, /initial=\{reducedMotion \? false : hidden\}/);
  assert.match(app, /reducedMotion=\{appReducedMotion\}/);
});

test("the authentic board artwork retains its packaged-app relative base", () => {
  const inspector = read("client/src/components/driver-intel/DriverBoardInspector.tsx");
  assert.match(inspector, /import\.meta\.env\.BASE_URL\}images\/driver-intel\/aorus-ice-holographic-render\.png/);
});
