const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const RETIRED = "maximum-cpu-responsiveness";
const read = file => fs.readFileSync(path.resolve(file), "utf8");
// Install storage before any transitive store imports initialize persistence.
const storage = new Map();
global.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
global.window = { localStorage: global.localStorage };

function loadNative(file, overrides) {
  const filename = path.resolve("electron", file);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(read(filename), {
    module, exports: module.exports,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : nativeRequire(name),
    console: { log() {}, info() {}, warn() {}, error() {} },
    process, setTimeout, clearTimeout, setInterval, clearInterval, Buffer,
  }, { filename });
  return module.exports;
}

test("catalog, derived controls, tiers, and layout contain no retired slot", async () => {
  const registry = await import("../../client/src/lib/tweak-registry.ts");
  const tiers = await import("../../shared/tweak-tiers.ts");
  assert.equal(registry.getTweak(RETIRED), undefined);
  for (const ids of [registry.HKCU_TOGGLE_IDS, registry.ADMIN_TOGGLE_IDS, registry.SLIDER_IDS, registry.PRESET_IDS]) {
    assert.ok(!ids.includes(RETIRED));
  }
  assert.equal(tiers.TWEAK_TIER_MAP[RETIRED], undefined);
  assert.equal(tiers.PREMIUM_EXCEPTION_IDS.has(RETIRED), false);
  assert.equal(tiers.FREE_EXCEPTION_IDS.has(RETIRED), false);
  const ids = registry.TWEAKS_DATA.map(t => t.id);
  assert.equal(ids[ids.indexOf("power-throttling") + 1], "pcie-link-state");
  assert.equal(registry.TWEAKS_DATA.filter(t => /CPU C-STATES|Maximum CPU Responsiveness/i.test(`${t.title} ${t.description}`)).length, 0);
  const powerCategory = registry.TWEAKS_DATA.filter(t => t.category === "System and Power");
  const categoryIds = powerCategory.map(t => t.id);
  assert.equal(categoryIds[categoryIds.indexOf("power-throttling") + 1], "pcie-link-state");
  for (const level of ["All", "Advanced"]) {
    const cards = registry.TWEAKS_DATA.filter(t => level === "All" || t.level === level);
    assert.ok(cards.length > 30, "large sections must still exercise virtualization");
    assert.ok(!cards.some(t => t.id === RETIRED || /CPU C-STATES/i.test(t.title)));
    const rows = [];
    for (let i = 0; i < cards.length; i += 2) rows.push(cards.slice(i, i + 2));
    assert.deepEqual(rows.flat(), cards, "desktop rows and stacked mobile rows preserve compact ordering");
    assert.ok(rows.every(row => row.length > 0));
  }
  const list = read("client/src/components/tweaks/TweaksList.tsx");
  assert.match(list, /items\.slice\(i, i \+ 2\)/);
  assert.match(list, /count: rows\.length/);
  assert.match(list, /grid-cols-1 lg:grid-cols-2 gap-4/);
  assert.match(list, /toggleTweaks\.map\(/);
});

test("Advisor removes the rule, signal, polling request, and cached fixes", async () => {
  const ruleset = JSON.parse(read("client/src/advisor/ruleset/bundled.ruleset.json"));
  assert.ok(!ruleset.rules.some(rule => rule.fix?.tweakId === RETIRED || rule.signal === "system.cpuResponsiveness"));
  const previous = global.window;
  const calls = [];
  global.window = { localStorage: global.localStorage, electronAPI: {
    tweaks: { checkStatus: async id => { calls.push(id); return { enabled: true, isApplied: true }; } },
    system: { getSpecs: async () => ({ system: { osVersion: "Windows 11" } }) },
  } };
  try {
    const { collectSystemSignals } = await import("../../client/src/advisor/collectors/systemCollector.ts");
    const signals = await collectSystemSignals();
    assert.ok(!calls.includes(RETIRED));
    assert.equal(signals.cpuResponsiveness, undefined);
    assert.equal(calls.length, 5);
    assert.equal(signals.gameMode.value, "on");
    assert.equal(signals.gpuMsiMode.value, "on");
    const { evaluate } = await import("../../client/src/advisor/engine.ts");
    const report = evaluate({ system: { ...signals, cpuResponsiveness: { value: "off", source: "electron" } }, network: {}, app: {} }, ruleset);
    assert.ok(!report.findings.some(finding => finding.ruleId === "maximum_cpu_responsiveness" || finding.fix?.tweakId === RETIRED));
    const { useAdvisorStore } = await import("../../client/src/stores/advisorStore.ts");
    const options = useAdvisorStore.persist.getOptions();
    assert.equal(options.version, 2);
    const legacy = { runState: "ready", report: { findings: [{ ruleId: "maximum_cpu_responsiveness", fix: { tweakId: RETIRED } }] } };
    assert.deepEqual(options.migrate(legacy, 1), { report: null, lastRunAt: null, runState: "idle" });
  } finally {
    if (previous === undefined) delete global.window;
    else global.window = previous;
  }
});

test("legacy native requests reject without PowerShell, ownership writes, or backup changes", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpu-retirement-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const paths = {
    ...require("../user-data-paths"),
    TWEAK_STATE_FILE: path.join(dir, "tweak-state.json"),
    TWEAK_LOG_FILE: path.join(dir, "tweak-log.json"),
  };
  const backup = path.join(dir, "cpu-responsiveness-backup.json");
  fs.writeFileSync(backup, JSON.stringify({ schemeGuid: "original", origCpMinCores: "20", origPerfBoostMode: "1" }));
  fs.writeFileSync(paths.TWEAK_STATE_FILE, JSON.stringify({ tweaks: { [RETIRED]: true, "gaming-mode": true } }));
  const originalBackup = fs.readFileSync(backup, "utf8");
  let spawns = 0;
  let ownershipWrites = 0;
  const executor = loadNative("tweak-executor.js", {
    "./user-data-paths": paths,
    "./ps-shared": { _withPsSemaphore: fn => fn(), runElevated: () => { throw Error("unexpected elevation"); } },
    child_process: { execFile(_file, _args, _opts, callback) {
      spawns++;
      callback(null, JSON.stringify({ [RETIRED]: true, "gaming-mode": true }), "");
    } },
    "./ownership-store": {
      buildScopeKey: () => { ownershipWrites++; throw Error("must not touch ownership"); },
    },
  });
  assert.equal(executor.isKnownTweak(RETIRED), false);
  assert.equal(executor.ALL_TWEAKS[RETIRED], undefined);
  assert.ok(!executor.getTweakInfo().some(tweak => tweak.id === RETIRED));
  for (const action of ["apply", "revert"]) {
    for (const execute of [executor.executeTweak, executor.executeTweakWithOwnership]) {
      const result = await execute(RETIRED, action);
      assert.equal(result.success, false);
      assert.equal(result.failureType, "not_found");
      assert.equal(result.commandsRun.length, 0);
    }
  }
  assert.equal((await executor.verifyTweak(RETIRED)).verified, false);
  assert.equal((await executor.checkTweakStatus(RETIRED)).error, "not_found");
  assert.equal(spawns, 0);
  assert.equal(ownershipWrites, 0);
  assert.equal(executor.getLocalState().appliedTweaks[RETIRED], undefined);
  assert.equal(executor.getLocalState().appliedTweaks["gaming-mode"], true);
  executor.saveVerifiedState({ [RETIRED]: false, "gaming-mode": false });
  assert.equal(JSON.parse(fs.readFileSync(paths.TWEAK_STATE_FILE)).tweaks[RETIRED], true, "historical state stays on disk unchanged");
  const statuses = await executor.batchCheckAllTweaks();
  assert.equal(statuses[RETIRED], undefined);
  assert.equal(statuses["gaming-mode"].isApplied, true);
  assert.equal(fs.readFileSync(backup, "utf8"), originalBackup);
  assert.doesNotMatch(read("electron/tweak-executor.js"), /executeMaxCpuResponsiveness|CPUCStatesApplied|CPU_RESPONSIVENESS_BACKUP_FILE/);
  assert.equal(require("../user-data-paths").CPU_RESPONSIVENESS_BACKUP_FILE, undefined);
});

test("the desktop startup gate ignores retired ownership but preserves other pending work", () => {
  const handler = read("electron/main.js").match(/ipcMain\.handle\('premium:hasAppOwned', (\(\) => \{[\s\S]*?\n  \})\);/)?.[1];
  assert.ok(handler);
  let records = [{ itemType: "tweak", itemId: RETIRED }];
  const check = vm.runInNewContext(`(${handler})`, {
    ownershipStore: { getAllAppOwned: () => records },
    tweakExecutor: { isKnownTweak: id => id === "energy-logging" },
    console,
  });
  assert.equal(check().hasItems, false);
  assert.equal(check().count, 0);
  records.push({ itemType: "tweak", itemId: "energy-logging" }, { itemType: "power_plan", itemId: "active-scheme" });
  assert.equal(check().hasItems, true);
  assert.equal(check().count, 2);
  assert.equal(records[0].itemId, RETIRED, "history was not deleted");
});

test("old ownership is skipped without blocking unrelated bulk reverts or losing baselines", async () => {
  const retired = { scopeKey: `tweak:${RETIRED}`, itemType: "tweak", itemId: RETIRED, previousValue: false, baselineCaptured: true, appliedByApp: true };
  const current = { ...retired, scopeKey: "tweak:energy-logging", itemId: "energy-logging" };
  const records = [retired, current];
  const before = JSON.stringify(retired);
  const executed = [];
  const reverted = [];
  const pipeline = loadNative("premium-revert-pipeline.js", {
    "./ownership-store": {
      getAllAppOwned: () => records,
      beginBatch() {}, endBatch() {},
      recordRevert: key => reverted.push(key),
    },
    "./tweak-executor": {
      isKnownTweak: id => id === current.itemId,
      executeTweak: async (id, action) => { executed.push([id, action]); return { success: true, verified: true }; },
    },
    "./slider-tweak-executor": { revertAllPremiumSliders: async () => ({ reverted: [], failed: [] }) },
    "./preset-tweak-executor": { revertAllPremiumPresets: async () => ({ reverted: [], failed: [] }) },
  });
  assert.equal(pipeline.previewRevert().find(r => r.itemId === RETIRED).willSkip, true);
  const result = await pipeline.revertAllAppOwned();
  assert.equal(result.failed, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.reverted, 1);
  assert.equal(result.details[retired.scopeKey].safeToProceed, true);
  assert.deepEqual(executed, [[current.itemId, "revert"]]);
  assert.deepEqual(reverted, [current.scopeKey]);
  assert.equal(JSON.stringify(retired), before);
});

test("persisted selections cannot resurrect the card, change counts, or start expiry reverts", async () => {
    const { useStore } = await import("../../client/src/lib/store.ts");
    const options = useStore.persist.getOptions();
    const history = [{ id: "historical", action: "Enabled CPU C-STATES | Core parking" }];
    storage.set(options.name, JSON.stringify({ version: options.version, state: {
      tweaks: { [RETIRED]: true, "gaming-mode": true, "tcp-rss": true },
      sliderValues: { [RETIRED]: 100, "menu-show-delay": 20 },
      presetOptions: { [RETIRED]: "old", "io-optimization-profile": "default" },
      latestAIScan: { recommendations: [{ id: RETIRED }, { id: "gaming-mode" }] },
      account: { stats: { tweaksApplied: 999, cleanersRun: 4 } },
      history,
    } }));
    await useStore.persist.rehydrate();
    let state = useStore.getState();
    assert.equal(state.tweaks[RETIRED], undefined);
    assert.equal(state.sliderValues[RETIRED], undefined);
    assert.equal(state.presetOptions[RETIRED], undefined);
    assert.equal(state.tweaks["tcp-rss"], true, "other feature state is preserved");
    assert.equal(state.account.stats.tweaksApplied, 2);
    assert.equal(state.account.stats.cleanersRun, 4);
    assert.deepEqual(state.history, history);
    assert.deepEqual(state.latestAIScan.recommendations, [{ id: "gaming-mode" }]);
    state.setTweak(RETIRED, true);
    state.toggleTweak(RETIRED);
    state.setSliderValue(RETIRED, 100);
    state.setPresetOption(RETIRED, "old");
    state = useStore.getState();
    assert.equal(state.tweaks[RETIRED], undefined);
    assert.equal(state.history.length, 1);
    const { useTweakOwnershipStore } = await import("../../client/src/stores/tweakOwnershipStore.ts");
    const { hasPremiumItemsToRevert } = await import("../../client/src/lib/premiumRevertEngine.ts");
    useStore.setState({ tweaks: {}, sliderValues: {}, presetOptions: {} });
    useTweakOwnershipStore.setState({ appliedTweaks: {
      [RETIRED]: { provenance: "app", isPremium: true },
    }, networkTweaks: {}, powerPlan: null });
    assert.equal(hasPremiumItemsToRevert(), false);
    assert.ok(useTweakOwnershipStore.getState().appliedTweaks[RETIRED], "recovery metadata is retained");
    useTweakOwnershipStore.setState({ appliedTweaks: {
      "energy-logging": { provenance: "app", isPremium: true },
    } });
    assert.equal(hasPremiumItemsToRevert(), true);
});
