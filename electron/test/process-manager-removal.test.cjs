const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("retired page, types, engine, route imports and native handlers are absent", () => {
  for (const file of [
    "client/src/pages/ProcessManager.tsx",
    "client/src/types/process-control.ts",
    "electron/process-control.js",
  ]) assert.equal(fs.existsSync(path.join(root, file)), false, file);
  for (const file of [
    "client/src/App.tsx",
    "client/src/routes/desktopRoutes.eager.tsx",
    "client/src/routes/desktopRoutes.lazy.tsx",
    "client/src/lib/route-prefetch.ts",
    "client/src/components/layout/Sidebar.tsx",
    "client/src/pages/Settings.tsx",
    "electron/main.js",
    "electron/preload.js",
    "electron/package.json",
  ]) assert.doesNotMatch(read(file), /ProcessManager|process-manager|processControl|process-control|ALLOWED_PC_PROFILES/, file);
  const app = read("client/src/App.tsx");
  assert.match(app, /<Route component=\{desktopRoutes.Home\} \/>/);
  assert.match(app, /<Route>\s*<Landing \/>/);
});

test("preload exposes Startup and shared icons but no process control or generic invoke", async () => {
  let api;
  const calls = [];
  vm.runInNewContext(read("electron/preload.js"), {
    require(name) {
      assert.equal(name, "electron");
      return {
        contextBridge: { exposeInMainWorld(_name, value) { api = value; } },
        ipcRenderer: {
          on() {}, once() {}, send() {}, removeListener() {},
          invoke(channel, ...args) { calls.push([channel, ...args]); return Promise.resolve(null); },
        },
      };
    },
    process: { argv: [] },
    window: { addEventListener() {} },
    console,
  });
  assert.ok(api);
  assert.equal(api.processControl, undefined);
  assert.equal(api.invoke, undefined);
  await api.appIcons.forPath("C:\\Apps\\Example.exe");
  assert.equal(calls.at(-1)[0], "appIcons:forPath");
  await api.startup.scan();
  assert.equal(calls.at(-1)[0], "startup:scan");
});

test("legacy sidebar preferences discard only the retired route", async () => {
  const entries = new Map();
  const localStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
  const previousWindow = global.window;
  global.window = { localStorage };
  const { useUserPreferencesStore, DEFAULT_SIDEBAR_ORDER } =
    await import("../../client/src/stores/userPreferencesStore.ts");
  if (previousWindow === undefined) delete global.window;
  else global.window = previousWindow;
  const options = useUserPreferencesStore.persist.getOptions();
  assert.equal(options.version, 5);
  const legacy = {
    language: "ja", theme: "oled", accent: "green", largerText: true,
    performanceProfileOverride: "efficiency",
    sidebarOrder: ["/startup", "/process-manager", "/cleaner", "/settings"],
    sidebarHidden: ["/process-manager", "/history"],
    dashboardOrder: ["memory", "cpu"], dashboardHidden: ["storage"],
  };
  const migrated = options.migrate(legacy, 3);
  entries.set("sc-user-preferences", JSON.stringify({ state: legacy, version: 3 }));
  await useUserPreferencesStore.persist.rehydrate();
  assert.deepEqual(useUserPreferencesStore.getState().sidebarOrder, ["/startup", "/cleaner", "/settings"]);
  assert.equal(useUserPreferencesStore.getState().theme, "oled");
  assert.equal(JSON.parse(entries.get("sc-user-preferences")).version, 5);
  assert.deepEqual(migrated.sidebarOrder, ["/startup", "/cleaner", "/settings"]);
  assert.deepEqual(migrated.sidebarHidden, ["/history"]);
  for (const key of Object.keys(legacy).filter(k => !k.startsWith("sidebar"))) {
    assert.deepEqual(migrated[key], legacy[key], key);
  }
  assert.ok(!DEFAULT_SIDEBAR_ORDER.includes("/process-manager"));
  assert.deepEqual(options.migrate(migrated, 3), migrated);
  assert.ok(options.migrate({}, 0).sidebarOrder.includes("/startup"));
});

test("web prefetch ignores an old URL without attempting an import", async () => {
  const { preloadDesktopRoute } = await import("../../client/src/lib/route-prefetch.ts");
  await preloadDesktopRoute("/process-manager");
  await preloadDesktopRoute("/process-manager?old=1");
});

test("Advisor ignores legacy process data and route instead of requesting scans", async () => {
  const source = read("server/routes/ai.ts");
  const ast = ts.createSourceFile("ai.ts", source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "buildChatContext");
  assert.ok(fn);
  // Isolate the pure context serializer; do not start cloud DB/auth services in a unit test.
  const js = ts.transpileModule(fn.getText(ast).replace(/^export /, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const buildChatContext = vm.runInNewContext(js + "\nbuildChatContext");
  const legacy = buildChatContext({
    currentRoute: "/process-manager",
    processManager: { totalProcesses: 80, topConsumers: [{ name: "legacy-exclusive-name", memoryMb: 5000 }] },
    startupSummary: { total: 3, enabled: 2, disabled: 1 },
  });
  assert.doesNotMatch(legacy, /Process Manager|process-manager|legacy-exclusive-name/);
  assert.match(legacy, /Startup Manager: 3 startup entries/);
  assert.match(buildChatContext({ currentRoute: "/startup" }), /User's current page: Startup Manager/);
  assert.doesNotMatch(read("client/src/pages/AiAdvisor.tsx"), /processControl|processManager|topConsumers/);
  assert.doesNotMatch(source, /processManager|Process Manager/);
  const { isRetiredAdvisorRoute, stripRetiredAdvisorLinks } =
    await import("../../shared/advisorNavigation.ts");
  for (const route of ["/process-manager", "/process-manager/", "/PROCESS-MANAGER?legacy=1", "/process-manager#old"]) {
    assert.equal(isRetiredAdvisorRoute(route), true);
    assert.equal(stripRetiredAdvisorLinks(`<<NAV:${route}:Legacy>>`), "");
  }
  const valid = "<<NAV:/startup:Startup Manager>> <<NAV:/cleaner:System Cleaner>>";
  assert.equal(stripRetiredAdvisorLinks(valid), valid);
  assert.match(read("client/src/pages/AiAdvisor.tsx"), /items\.filter\(\(item\) => !isRetiredAdvisorRoute\(item\.route\)\)/);
  assert.match(source, /content: stripRetiredAdvisorLinks\(finalContent\)/);
  const clientSource = read("client/src/pages/AiAdvisor.tsx");
  const clientAst = ts.createSourceFile("AiAdvisor.tsx", clientSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const historyFn = clientAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "structuredToText");
  const historyJs = ts.transpileModule(historyFn.getText(clientAst), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const serialize = vm.runInNewContext(historyJs + "\nstructuredToText", { isRetiredAdvisorRoute });
  assert.equal(serialize({ type: "navigation", items: [
    { route: "/process-manager", label: "Process Manager" },
    { route: "/startup", label: "Startup Manager" },
  ] }), "Startup Manager");
});

test("all supported catalogs remove feature claims without shifting adjacent translations", async () => {
  const { translationCatalogs, PUBLIC_CATALOG_KEYS } = await import("../../client/src/lib/i18n.tsx");
  const { PUBLIC_PAGE_TRANSLATIONS } = await import("../../client/src/lib/publicWebsiteTranslations/pages.ts");
  const faqKey = read("client/src/pages/FAQ.tsx").match(/answer: "(Free includes the core[^"]+)"/)[1];
  const obsolete = /Process Manager|Inspect and manage running processes|进程管理器|プロセス[ ]?マネージャー|프로세스 관리자|Administrador de procesos|प्रोसेस मैनेजर|প্রসেস ম্যানেজার|ਪ੍ਰੋਸੈਸ ਮੈਨੇਜਰ|ప్రాసెస్ మేనేజర్|प्रोसेस मॅनेजर|பிராசஸ் மேனேஜர்/i;
  assert.ok(!PUBLIC_CATALOG_KEYS.includes("Process Manager"));
  for (const [locale, catalog] of Object.entries(translationCatalogs)) {
    assert.equal(catalog["Process Manager"], undefined, locale);
    assert.equal(catalog["Inspect and manage running processes"], undefined, locale);
    assert.doesNotMatch(Object.keys(catalog).join("\n"), /Process Manager/, locale);
    assert.ok(catalog["Startup"], locale);
    assert.ok(catalog["AI Advisor"], locale);
    assert.ok(catalog["Network Tweaks"], locale);
    assert.ok(catalog["Settings"], locale);
    assert.ok(PUBLIC_PAGE_TRANSLATIONS[locale][faqKey], `${locale} FAQ translation`);
    assert.doesNotMatch(PUBLIC_PAGE_TRANSLATIONS[locale][faqKey], obsolete, locale);
  }
  assert.equal(translationCatalogs.hi["AI Advisor"], "एआई सलाहकार");
  assert.equal(translationCatalogs.ja["NIC Tuning"], undefined);
  for (const file of ["Pricing", "Landing", "FAQ"]) {
    assert.doesNotMatch(read(`client/src/pages/${file}.tsx`), /Process Manager/);
  }
});

test("process count telemetry, Startup APIs and shared icon infrastructure remain shipped", () => {
  const pkg = JSON.parse(read("electron/package.json"));
  for (const module of ["process-count.js", "file-icon.js", "powershell-limiter.js"]) {
    assert.ok(pkg.build.files.includes(module), module);
    assert.ok(fs.existsSync(path.join(root, "electron", module)), module);
  }
  assert.match(read("electron/main.js"), /Get-Process -ErrorAction Stop \| Measure-Object/);
  assert.match(read("electron/main.js"), /processes: liveProcessCount/);
  assert.match(read("electron/main.js"), /startup:scan/);
  assert.match(read("client/src/components/startup/StartupAppRow.tsx"), /publisherToDomain|appIcons/);
  assert.match(read("client/src/lib/publisherIcons.ts"), /export function processNameToDomain/);
});
