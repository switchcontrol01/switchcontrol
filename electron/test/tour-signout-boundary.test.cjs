const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

test("sign-out suspends flow evaluation before clearing the active tour", () => {
  const app = read("client/src/App.tsx");
  const tourStore = read("client/src/lib/tour-store.ts");
  const tourShell = read("client/src/components/TourShell.tsx");

  assert.match(
    app,
    /if \(isSigningOut\) return;\s*if \(!user\?\.loggedIn\)/,
    "flow evaluation must stop while sign-out is in progress",
  );
  assert.match(
    app,
    /setIsSigningOut\(true\);\s*clearTourState\(\);\s*setActiveFlow\("none"\)/,
    "sign-out must clear the global tour state before the auth transition",
  );
  assert.match(
    tourStore,
    /export function clearTourState\(\)/,
    "the shared tour lock needs a synchronous reset API",
  );
  assert.match(
    tourShell,
    /return \(\) => \{\s*clearTourState\(\);/,
    "direct TourShell unmounts must clear the lock as a second safety boundary",
  );
});

test("a late auth callback cannot bypass the pending language gate", () => {
  const app = read("client/src/App.tsx");
  assert.match(
    app,
    /if \(livePhase === "language"\) \{\s*\/\/ The cached-session fast path[\s\S]*?leaving gate mounted/,
    "language-gated sessions must not be redirected to the dashboard",
  );
});