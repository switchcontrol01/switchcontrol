const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const vite = read("vite.config.ts");
const routes = read("client/src/routes/desktopRoutes.eager.tsx");
const prefetch = read("client/src/lib/route-prefetch.eager.ts");
const app = read("client/src/App.tsx");
const main = read("electron/main.js");

const routeNames = [
  "Home",
  "Tweaks",
  "NetworkTweaks",
  "SystemCleaner",
  "Settings",
  "PowerPlan",
  "Debloater",
  "StartupApps",
  "NicTuningPage",
  "BiosAdvisor",
  "AiAdvisor",
  "DriverIntelligence",
  "LatencyAnalyzer",
  "Security",
  "History",
  "ProcessManager",
];

test("Electron selects eager desktop routes", () => {
  assert.match(vite, /mode === ["']electron["'] \? ["']desktopRoutes\.eager\.tsx["']/);
  assert.match(vite, /mode === ["']electron["'] \? ["']route-prefetch\.eager\.ts["']/);
  for (const routeName of routeNames) {
    assert.match(routes, new RegExp(`import ${routeName} from`));
  }
  assert.match(prefetch, /return Promise\.resolve\(\)/);
  assert.doesNotMatch(prefetch, /import\("@\/pages\//);
});

test("Electron routes never replace the page with a route-loading skeleton", () => {
  assert.doesNotMatch(app, /ElectronRouteFallback/);
  assert.doesNotMatch(app, /route-loading-fallback/);
  assert.doesNotMatch(app, /<Suspense fallback=\{<ElectronRouteFallback \/>}>/);
});

test("native modules are lazy and optional startup follows first-frame gates", () => {
  assert.match(main, /const si = lazyModule\(['"]systeminformation['"]\)/);
  for (const moduleName of [
    "tweak-executor",
    "slider-tweak-executor",
    "preset-tweak-executor",
    "nic-executor",
    "network-tweak-executor",
    "power-plan-manager",
    "process-control",
  ]) {
    assert.match(main, new RegExp(`lazyModule\\(['"]\\./${moduleName}['"]`));
  }
  assert.match(main, /function runDeferredStartupTask/);
  assert.match(main, /scheduleDeferredStartupWork\('window-shown'\)/);
  assert.match(main, /scheduleDeferredStartupWork\('show-fallback'\)/);
  assert.doesNotMatch(main, /void runStartupAuditSafe\(\);/);
  assert.doesNotMatch(main, /const sentinel = sliderTweakExecutor\.checkCrashSentinel\(\);[\s\S]{0,120}createWindow\(\)/);
});
