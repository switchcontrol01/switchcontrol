const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

const vite = read("vite.config.ts");
const routes = read("client/src/routes/desktopRoutes.lazy.tsx");
const prefetch = read("client/src/lib/route-prefetch.ts");
const app = read("client/src/App.tsx");
const main = read("electron/main.js");
const packageContract = read("electron/scripts/verify-package-contract.js");

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

test("Electron selects demand-loaded desktop routes", () => {
  assert.match(vite, /"desktopRoutes\.lazy\.tsx"/);
  assert.doesNotMatch(vite, /mode === ["']electron["'][^;]*desktopRoutes\.eager/);
  assert.match(routes, /loadDesktopRoute\("home"\)/);
  for (const routeName of routeNames) {
    assert.match(routes, new RegExp(`${routeName}: lazy\\(\\(\\) => loadDesktopRoute\\(`));
  }
  assert.match(prefetch, /const loaded = new Map/);
  assert.match(prefetch, /loaded\.delete\(route\)/);
  assert.match(prefetch, /throw error/);
});

test("route fallback preserves the Electron shell during first navigation", () => {
  assert.match(app, /const ElectronRouteFallback/);
  assert.match(app, /<AppLayout noPageAnimation>/);
  assert.match(app, /data-testid="route-loading-fallback"/);
  assert.match(app, /<Suspense fallback=\{<ElectronRouteFallback \/>}>/);
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

test("package contract verifies all desktop route chunks", () => {
  for (const prefix of routeNames.map(name => name === "NicTuningPage" ? "NicTuning" : name)) {
    assert.match(packageContract, new RegExp(`['"]${prefix}['"]`));
  }
  assert.match(packageContract, /Missing demand-loaded desktop route chunk/);
});

test("built Electron renderer contains a separate chunk for every desktop route when present", () => {
  const assetsDir = path.join(process.cwd(), "dist-electron", "assets");
  if (!fs.existsSync(assetsDir)) {
    return;
  }
  const assets = fs.readdirSync(assetsDir);
  for (const prefix of routeNames.map(name => name === "NicTuningPage" ? "NicTuning" : name)) {
    assert.ok(
      assets.some(name => name.startsWith(`${prefix}-`) && name.endsWith(".js")),
      `expected generated chunk for ${prefix}`,
    );
  }
});