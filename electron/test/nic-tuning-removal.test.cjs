const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const read = file => fs.readFileSync(path.resolve(file), "utf8");
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const storage = new Map();
global.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
global.window = { localStorage: global.localStorage };

function pipelineFor(records) {
  const writes = [];
  const modules = {
    "./ownership-store": {
      getAllAppOwned: () => records,
      beginBatch() {}, endBatch() {},
      recordRevert: key => writes.push(key),
    },
    "./tweak-executor": {
      isKnownTweak: id => id === "energy-logging",
      executeTweak: async (id, action) => {
        writes.push([id, action]);
        return { success: true, verified: true };
      },
    },
    "./network-tweak-executor": {
      executeNetworkTweak: async (id, action) => {
        writes.push([id, action]);
        return { success: true, verified: true };
      },
      checkNetworkTweakStatus: async () => ({ applied: false, enabled: false, isApplied: false, verified: true }),
    },
    "./slider-tweak-executor": { revertAllPremiumSliders: async () => ({ reverted: [], failed: [] }) },
    "./preset-tweak-executor": { revertAllPremiumPresets: async () => ({ reverted: [], failed: [] }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(read("electron/premium-revert-pipeline.js"), {
    module, exports: module.exports, console: quiet,
    require: name => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected native dependency: ${name}`);
      return modules[name];
    },
  });
  return { pipeline: module.exports, writes };
}

test("removed pages, native module, routes, preload and package entries stay absent", () => {
  for (const file of ["client/src/pages/NicTuning.tsx", "client/src/components/tweaks/NicTuning.tsx", "electron/nic-executor.js"]) {
    assert.equal(fs.existsSync(file), false, file);
  }
  for (const file of [
    "client/src/routes/desktopRoutes.eager.tsx", "client/src/routes/desktopRoutes.lazy.tsx",
    "client/src/lib/route-prefetch.ts", "client/src/components/layout/Sidebar.tsx",
    "client/src/components/ModuleShowcase.tsx", "client/src/pages/Settings.tsx",
  ]) assert.doesNotMatch(read(file), /NicTuning|nic-tuning|NIC Tuning/);
  for (const file of ["electron/main.js", "electron/preload.js", "electron/package.json", "client/src/types/electron.d.ts"]) {
    assert.doesNotMatch(read(file), /nic-executor|nicExecutor|['"]nic:|(?:^|\n)\s*nic\s*:/);
  }
  const main = read("electron/main.js");
  assert.doesNotMatch(main, /mapped\.type === 'nic'|rss-enable|eee-disable|'flow-control'|'interrupt-moderation'/);
  // These independent APIs must remain, not be swept up with the retired feature.
  for (const channel of ["networkTweaks:execute", "networkTweaks:checkAll", "system:getNetworkAdapters", "system:getBluetoothDevice", "powerPlans:getState"]) {
    assert.ok(main.includes(`ipcMain.handle('${channel}'`), channel);
  }
  assert.match(main, /Extreme Labs was retired[\s\S]*?if \(false\)/);
});

test("normal desktop navigation and stale NIC URL resolve without a scan or blank route", () => {
  const source = read("client/src/App.tsx");
  const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "ElectronAppRoutes");
  const js = ts.transpileModule(node.getText(ast), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  for (const location of ["/dashboard", "/network", "/nic-tuning", "/nic-tuning/?old=1"]) {
    const navigations = [];
    const mode = [];
    const routes = new Proxy({}, { get: (_, key) => String(key) });
    const render = vm.runInNewContext(`${js}; ElectronAppRoutes`, {
      React: { createElement: (type, props, ...children) => ({ type, props, children }) },
      useLocation: () => [location, (...args) => navigations.push(args)],
      useStore: () => true,
      useUserPreferencesStore: selector => selector({ reducedMotion: false }),
      useEffect: fn => fn(),
      telemetryManager: { setDemandMode: v => mode.push(v), pause() {} },
      AnimatePresence: "AnimatePresence",
      DriverIntelRouteTransition: "DriverIntelRouteTransition",
      desktopRoutes: routes, ErrorBoundary: "ErrorBoundary", Route: "Route", Switch: "Switch", console: quiet,
    });
    const tree = render();
    const findNode = (node, type) => {
      if (!node || typeof node !== "object") return null;
      if (node.type === type) return node;
      for (const child of node.children ?? []) {
        const found = findNode(child, type);
        if (found) return found;
      }
      return null;
    };
    const routeElements = findNode(tree, "Switch").children;
    assert.ok(!routeElements.some(route => route.props?.path === "/nic-tuning"));
    assert.equal(routeElements.at(-1).props.component, "Home");
    assert.ok(routeElements.some(route => route.props?.path === "/network" && route.props.component === "NetworkTweaks"));
    if (location.startsWith("/nic-tuning")) {
      assert.equal(navigations[0][0], "/dashboard");
      assert.equal(navigations[0][1].replace, true);
      assert.deepEqual(mode, ["paused"]);
    } else assert.equal(navigations.length, 0);
  }
});

test("preload rejects stale tuning calls by exposing no tuning or generic invoke surface", async () => {
  let api;
  const calls = [];
  const ipcRenderer = {
    on() {}, removeListener() {}, send() {},
    invoke: async (...args) => { calls.push(args); return {}; },
  };
  vm.runInNewContext(read("electron/preload.js"), {
    require: name => {
      assert.equal(name, "electron");
      return { ipcRenderer, contextBridge: { exposeInMainWorld: (_, exposed) => { api = exposed; } } };
    },
    process: { argv: [], platform: "win32" },
    window: { addEventListener() {} }, console: quiet, setTimeout, clearTimeout,
  });
  assert.equal(api.nic, undefined);
  assert.equal(api.invoke, undefined);
  assert.equal(api.extremeLabs, undefined);
  await api.networkTweaks.checkAll();
  await api.system.getNetworkAdapters();
  assert.deepEqual(calls.map(args => args[0]), ["networkTweaks:checkAll", "system:getNetworkAdapters"]);
});

test("read-only adapter inventory handles one/many devices and explicit probe failures", async () => {
  const source = read("electron/main.js");
  const match = source.match(/ipcMain\.handle\('system:getNetworkAdapters', (async \(\) => \{[\s\S]*?\n  \})\);/);
  assert.ok(match);
  assert.doesNotMatch(match[1], /Set-NetAdapter|Reset-NetAdapter|AdvancedProperty|nicExecutor/);
  const adapter = { name: "Ethernet", description: "Intel Ethernet", status: "Up" };
  for (const data of [adapter, [adapter], [], null]) {
    const handler = vm.runInNewContext(`(${match[1]})`, {
      process: { platform: "win32" },
      runMainPsDetailed: async script => {
        assert.match(script, /Get-NetAdapter -Physical/);
        return { ok: true, stdout: JSON.stringify(data) };
      },
    });
    const result = await handler();
    assert.deepEqual(JSON.parse(JSON.stringify(result.adapters)), data === adapter ? [adapter] : data ?? []);
  }
  const failed = vm.runInNewContext(`(${match[1]})`, {
    process: { platform: "win32" },
    runMainPsDetailed: async () => ({ ok: false, error: "busy" }),
  });
  assert.equal((await failed()).error, "busy");
  const store = read("client/src/stores/driverIntelStore.ts");
  assert.match(store, /eApi\.system\.getNetworkAdapters\(\)/);
  assert.doesNotMatch(store, /eApi\.nic/);
});

test("legacy preferences drop only retired routes, preserving supported order and hidden pages", async () => {
  const { useUserPreferencesStore, DEFAULT_SIDEBAR_ORDER } = await import("../../client/src/stores/userPreferencesStore.ts");
  const options = useUserPreferencesStore.persist.getOptions();
  const old = {
    sidebarOrder: ["/network", "/nic-tuning", "/dashboard", "/settings"],
    sidebarHidden: ["/nic-tuning", "/network"], accent: "orange", largerText: true,
  };
  storage.set(options.name, JSON.stringify({ version: 4, state: old }));
  await useUserPreferencesStore.persist.rehydrate();
  const state = useUserPreferencesStore.getState();
  assert.deepEqual(state.sidebarOrder, ["/network", "/dashboard", "/settings"]);
  assert.deepEqual(state.sidebarHidden, ["/network"]);
  assert.equal(state.accent, "orange");
  assert.equal(state.largerText, true);
  assert.ok(!DEFAULT_SIDEBAR_ORDER.includes("/nic-tuning"));
});

test("stale active adapter selections disappear but supported network state and history survive", async () => {
  const { useStore } = await import("../../client/src/lib/store.ts");
  const options = useStore.persist.getOptions();
  const history = [{ id: "old", action: "NIC Tuning: RSS", page: "NIC Tuning", notes: "RSS=1 on Ethernet" }];
  const ids = ["nic-rss", "nic-interrupt-mod", "nic-eee", "nic-green-ethernet", "nic-flow-control"];
  storage.set(options.name, JSON.stringify({ version: options.version, state: {
    tweaks: Object.fromEntries([...ids.map(id => [id, true]), ["tcp-rss", true]]),
    latestAIScan: { recommendations: [{ id: "nic-rss" }, { id: "tcp-rss" }] },
    history,
  } }));
  await useStore.persist.rehydrate();
  for (const id of ids) {
    assert.equal(useStore.getState().tweaks[id], undefined);
    useStore.getState().setTweak(id, true);
    assert.equal(useStore.getState().tweaks[id], undefined);
  }
  assert.equal(useStore.getState().tweaks["tcp-rss"], true);
  assert.deepEqual(useStore.getState().history, history);
  assert.deepEqual(useStore.getState().latestAIScan.recommendations, [{ id: "tcp-rss" }]);
  assert.doesNotMatch(read("client/src/pages/NetworkTweaks.tsx"), /nic-rss|NIC_TO_NETWORK|nicTweaks/);
  assert.match(read("client/src/pages/NetworkTweaks.tsx"), /t\.id === "tcp-rss" \? undefined/);
});

test("retired ownership is skipped without native writes, lost backups, false success or retries", async () => {
  const records = [true, false].map((baselineCaptured, i) => ({
    scopeKey: `nic:Ethernet:RSS-${i}`, itemType: "nic", itemId: "RSS",
    adapterName: "Ethernet", previousValue: baselineCaptured ? { registryValue: "1" } : null,
    baselineCaptured, appliedByApp: true,
  }));
  const before = JSON.stringify(records);
  const { pipeline, writes } = pipelineFor(records);
  const preview = pipeline.previewRevert();
  assert.ok(preview.every(item => item.willSkip && /read-only/.test(item.revertNote)));
  const result = await pipeline.revertAllAppOwned({ fallbackNetworkTweakIds: ["nic-rss", "tcp-rss"] });
  assert.equal(result.failed, 0);
  assert.equal(result.reverted, 0);
  assert.equal(result.skipped, 2);
  assert.deepEqual(writes, []);
  for (const detail of Object.values(result.details)) {
    assert.equal(detail.action, "skipped_retired_control");
    assert.equal(detail.safeToProceed, true);
    assert.notEqual(detail.success, true);
  }
  assert.equal(JSON.stringify(records), before);
  const source = read("electron/main.js");
  const match = source.match(/ipcMain\.handle\('premium:hasAppOwned', (\(\) => \{[\s\S]*?\n  \})\);/);
  const gate = vm.runInNewContext(`(${match[1]})`, {
    ownershipStore: { getAllAppOwned: () => records },
    tweakExecutor: { isKnownTweak: () => true }, console: quiet,
  });
  assert.equal(gate().hasItems, false);
  records.push({ scopeKey: "tweak:energy-logging", itemType: "tweak", itemId: "energy-logging", previousValue: false, baselineCaptured: true });
  assert.equal(gate().count, 1);
  const next = await pipeline.revertAllAppOwned();
  assert.equal(next.reverted, 1);
  assert.deepEqual(writes, [["energy-logging", "revert"], "tweak:energy-logging"]);
});

test("legacy history is readable and read-only, while supported records stay actionable", async () => {
  const { encodeHistoryNotes, readHistoryMetadata, displayHistoryNotes, isRetiredHistoryEntry } = await import("../../client/src/lib/historyContract.ts");
  const metadata = { category: "nic", targetId: "Ethernet.RSS", restoreTarget: { adapterName: "Ethernet", propertyKey: "RSS" }, reversible: true };
  const notes = encodeHistoryNotes("RSS=1 on Ethernet", metadata);
  const entry = { page: "NIC Tuning", notes };
  const original = JSON.stringify(entry);
  assert.equal(isRetiredHistoryEntry(entry), true);
  assert.equal(isRetiredHistoryEntry({ ...entry, page: "Network" }), true);
  assert.equal(isRetiredHistoryEntry({ page: "NIC Tuning" }), true);
  assert.equal(isRetiredHistoryEntry({ page: "Network", notes: encodeHistoryNotes("", { category: "network", targetId: "tcp-rss", reversible: true }) }), false);
  assert.deepEqual(readHistoryMetadata(entry), metadata);
  assert.equal(displayHistoryNotes(notes), "RSS=1 on Ethernet");
  assert.equal(JSON.stringify(entry), original);
  const source = read("client/src/pages/History.tsx");
  assert.match(source, /canRevert = !retiredControl/);
  assert.match(source, /if \(retiredControl\)/);
  assert.doesNotMatch(source, /resetProperty|NIC Tuning/);
});

test("genuine Network Tweaks ownership still reverts and verifies independently of retired adapters", async () => {
  const network = { scopeKey: "network_tweak:tcp-rss", itemType: "network_tweak", itemId: "tcp-rss", previousValue: false, baselineCaptured: true };
  const { pipeline, writes } = pipelineFor([network]);
  const result = await pipeline.revertAllAppOwned();
  assert.equal(result.failed, 0);
  assert.equal(result.reverted, 1);
  assert.equal(result.details[network.scopeKey].verified, true);
  assert.deepEqual(writes.filter(Array.isArray), [["tcp-rss", "revert"]]);
  assert.ok(writes.includes(network.scopeKey));
});

test("Advisor drops stale contexts, action markers and links without removing Network Tweaks", async () => {
  const { supportedAdvisorContext, stripRetiredAdvisorLinks, isRetiredAdvisorRoute } = await import("../../shared/advisorNavigation.ts");
  const old = {
    nicTuning: { adapterName: "Ethernet", properties: [{ key: "RSS" }] },
    networkTweaksApplied: [{ id: "nic-rss" }, { id: "tcp-rss" }],
    enabledTweaks: [{ id: "nic-eee" }, { id: "gaming-mode" }],
    lastRecommendedTweaks: ["nic-flow-control", "tcp-rss"],
  };
  const before = JSON.stringify(old);
  const context = supportedAdvisorContext(old);
  assert.equal(context.nicTuning, undefined);
  assert.deepEqual(context.networkTweaksApplied, [{ id: "tcp-rss" }]);
  assert.deepEqual(context.enabledTweaks, [{ id: "gaming-mode" }]);
  assert.deepEqual(context.lastRecommendedTweaks, ["tcp-rss"]);
  assert.equal(JSON.stringify(old), before);
  assert.equal(isRetiredAdvisorRoute("/nic-tuning/?old=1"), true);
  assert.equal(isRetiredAdvisorRoute("/network"), false);
  assert.equal(stripRetiredAdvisorLinks("<<NAV:/nic-tuning:NIC Tuning>><<APPLY:nic-rss>><<NAV:/network:Network Tweaks>>"), "<<NAV:/network:Network Tweaks>>");
  for (const file of ["server/routes/ai.ts", "client/src/pages/AiAdvisor.tsx"]) {
    assert.doesNotMatch(read(file), /nicTuning|nicCapabilities|NIC Tuning|nic-tuning|api\.nic/);
  }
});

test("all active locale catalogs omit adapter tuning while adjacent labels remain aligned", async () => {
  const { translationCatalogs, PUBLIC_CATALOG_KEYS } = await import("../../client/src/lib/i18n.tsx");
  const { PUBLIC_PAGE_TRANSLATIONS } = await import("../../client/src/lib/publicWebsiteTranslations/pages.ts");
  assert.ok(!PUBLIC_CATALOG_KEYS.includes("NIC Tuning"));
  const retired = /NIC Tuning|NIC[ -]?(?:Tuning|チューニング|튜닝|调|টিউনিং|ट्यूनिंग)|एनआईसी ट्यूनिंग|ਐਨਆਈਸੀ ਟਿਊਨਿੰਗ|என்ஐசி டியூனிங்|ఎన్‌ఐసి ట్యూనింగ్/i;
  for (const [locale, catalog] of Object.entries(translationCatalogs)) {
    assert.equal(catalog["NIC Tuning"], undefined, locale);
    assert.ok(catalog["Network Tweaks"], locale);
    assert.ok(catalog["Power Plan"], locale);
    assert.ok(catalog["Full Settings customization"], locale);
    for (const [key, value] of Object.entries(PUBLIC_PAGE_TRANSLATIONS[locale])) {
      assert.doesNotMatch(key, retired, locale);
      assert.doesNotMatch(value, retired, `${locale}: ${key}`);
    }
  }
  assert.equal(translationCatalogs.ja["Power Plan"], "電源プラン");
  assert.equal(translationCatalogs.hi["Power Plan"], "पावर प्लान");
  for (const file of ["Pricing", "Landing", "FAQ"]) assert.doesNotMatch(read(`client/src/pages/${file}.tsx`), /NIC Tuning/);
});
