const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
const page = read("client/src/pages/DriverIntelligence.tsx");
const layout = read("client/src/components/layout/AppLayout.tsx");

test("immersive driver content bypasses the standard constrained wrapper", () => {
  assert.match(layout, /immersiveContent = false/);
  assert.match(layout, /immersiveContent \? "w-full min-h-full" : "container max-w-7xl mx-auto p-8"/);
  assert.match(page, /<AppLayout noPageAnimation immersiveContent>/);
  assert.match(page, /if \(locked\) return \(\s*<AppLayout noPageAnimation>/);
});

test("driver exit navigation follows completed motion rather than a timer", () => {
  assert.match(page, /onAnimationComplete=\{definition => \{\s*if \(definition === "exit"\) handleExitComplete\(\)/);
  assert.match(page, /pendingNavigation\.current = destination;\s*setIsExiting\(true\)/);
  assert.match(page, /navigateAfterExit\("\/dashboard"\)/);
  assert.match(page, /navigateAfterExit\("\/ai-advisor"\)/);
  assert.doesNotMatch(page, /setTimeout/);
  assert.match(page, /inert=\{isExiting\}/);
});

test("driver transitions are deliberate while reduced motion remains immediate", () => {
  assert.match(page, /duration: prefersReducedMotion \? 0 : 0\.72/);
  assert.match(page, /duration: prefersReducedMotion \? 0 : 0\.62/);
  assert.match(page, /if \(prefersReducedMotion\) \{\s*navigate\(destination\);\s*return;/);
});

test("the authentic board artwork retains its packaged-app relative base", () => {
  const inspector = read("client/src/components/driver-intel/DriverBoardInspector.tsx");
  assert.match(inspector, /import\.meta\.env\.BASE_URL\}images\/driver-intel\/aorus-ice-holographic-render\.png/);
});
