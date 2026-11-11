const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");

test("Smart RAM Analysis UI, timers, state, polling and backend are removed", () => {
  const lab = read("client/src/components/dashboard/PerformanceLab.tsx");
  const hook = read("client/src/hooks/useDashboardIntelligence.ts");
  const route = read("server/routes/dashboardIntelligence.ts");
  assert.doesNotMatch(lab, /Smart RAM|SmartRAMCard|SmartRamProfile|RamState|RAM_STATE_CONFIG|CLEAR_ANIM_PHASES|ClearPhase|onRamRefreshStateChange|onClearRAM|memory\.clean/);
  assert.doesNotMatch(hook, /SmartRamProfile|RamState|TopProcess|ram-analysis|refreshRam|ramRefreshing|setRam|telemetryManager/);
  assert.doesNotMatch(route, /ram-analysis|RAM_ANALYSIS_TTL|ramAnalysisCache|reclaimableGB|reclaimableSource|newUsedPct|cached_heavy|pressure_rising/);
  assert.match(route, /router\.get\("\/latency-estimate"/);
});

test("the top Clear RAM action, modal, refresh state and native IPC stay wired", () => {
  const home = read("client/src/pages/Home.tsx");
  const modal = read("client/src/components/dashboard/MemoryCleanerModal.tsx");
  const preload = read("electron/preload.js");
  const main = read("electron/main.js");
  assert.match(home, /actionLabel=\{t\("Clear RAM"\)\}/);
  assert.match(home, /onAction=\{\(\) => setMemCleanerOpen\(true\)\}/);
  assert.match(home, /const \[ramRefreshing, setRamRefreshing\] = useState\(false\)/);
  assert.match(home, /<MemoryCleanerModal[\s\S]*onRefreshStateChange=\{setRamRefreshing\}/);
  assert.match(home, /loading=\{ramRefreshing \|\|/);
  assert.match(home, /<PerformanceLab \/>/);
  assert.match(modal, /api\.memory\.clean\(selectedMode\)/);
  assert.match(modal, /telemetryManager\.refreshNow\(\)/);
  assert.match(preload, /ipcRenderer\.invoke\('memory:clean', m\)/);
  assert.match(main, /ipcMain\.handle\('memory:clean'/);
});
