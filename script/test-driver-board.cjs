const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { build } = require("esbuild");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let Inspector, Page;
const calls = { scan: 0, cancel: 0, rescan: 0, navigate: [], details: [] };
const fixtures = ["cpu", "monitor", "gpu", "ssd", "network", "chipset", "audio", "bluetooth", "bios"].map((kind, i) => ({
  kind, title: kind === "gpu" ? "Graphics" : kind, device: `Actual device ${i}`,
  vendorKey: null, current: i === 0 ? "1.2.3" : null, latest: i === 0 ? "1.2.3" : "2.0.0",
  health: i === 0 ? "healthy" : "unknown", rationale: `Device evidence ${i}`, action: null,
}));
function reset() {
  calls.scan = calls.cancel = calls.rescan = 0; calls.navigate.length = calls.details.length = 0;
  globalThis.__diPremium = true;
  globalThis.__diStore = {
    phase: "ready", stepIndex: 0, components: fixtures, score: { overall: 83 }, news: [],
    scannedAt: Date.now(), usedLocalDb: false, dbVersion: "test", dbUpdatedAt: null, error: null,
    scan: async () => { calls.scan++; }, rescan: async () => { calls.rescan++; }, cancelScan: () => { calls.cancel++; },
  };
  globalThis.__diNavigate = value => calls.navigate.push(value);
}
test.before(async () => {
  globalThis.window = { electronAPI: { isElectron: false }, open() {} };
  globalThis.document = { body: {} };
  globalThis.sessionStorage = { setItem() {} };
  const output = await build({
    entryPoints: [path.resolve("client/src/pages/DriverIntelligence.tsx")],
    bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
    external: ["react", "lucide-react"],
    plugins: [{
      name: "production-driver-boundaries",
      setup(build) {
        build.onResolve({ filter: /^react-dom$/ }, () => ({ path: "portal", namespace: "mock" }));
        build.onResolve({ filter: /^wouter$/ }, () => ({ path: "routing", namespace: "mock" }));
        build.onResolve({ filter: /^@\// }, args => {
          if (args.path === "@/lib/driver-intel-data" || args.path.includes("DriverBoardInspector")) {
            return { path: path.resolve("client/src", args.path.slice(2) + (args.path.includes("DriverBoardInspector") ? ".tsx" : ".ts")) };
          }
          return { path: args.path, namespace: "mock" };
        });
        build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
        build.onLoad({ filter: /.*/, namespace: "mock" }, args => {
          let contents;
          if (args.path === "portal") contents = "export const createPortal=(child)=>child;";
          else if (args.path === "routing") contents = "export const useLocation=()=>['/driver-intelligence',globalThis.__diNavigate];";
          else if (args.path.endsWith("/i18n")) contents = "const t=x=>x; export const useTranslation=()=>({t});";
          else if (args.path.endsWith("/motion")) contents = "export const motion={div:'div'}; export const useMotion=()=>({prefersReducedMotion:true});";
          else if (args.path.endsWith("/use-auth")) contents = "export const useAuth=()=>({isPremium:globalThis.__diPremium});";
          else if (args.path.includes("UpgradeModal")) contents = "export const useUpgradeModal=()=>({openUpgradeModal:()=>{}});";
          else if (args.path.includes("driverIntelStore")) contents = "export const useDriverIntelStore=()=>globalThis.__diStore; export const hasData=p=>p==='ready'||p==='partial';";
          else if (args.path.includes("ComponentPanel")) contents = "import React from 'react'; export const ComponentPanel=({component,onClose})=>component?React.createElement('aside',{'data-testid':'component-panel'},component.device,React.createElement('button',{onClick:onClose},'Close')):null;";
          else if (args.path.includes("HistoryTimeline")) contents = "import React from 'react'; export const HistoryTimeline=()=>React.createElement('section',{'data-testid':'driver-history'},'History');";
          else if (args.path.includes("cloud-api")) contents = "export const cloudApiPost=async()=>({});";
          else {
            const name = args.path.includes("AppLayout") ? "AppLayout" : "GlassCard";
            contents = `import React from 'react'; export const ${name}=({children})=>React.createElement('div',null,children);`;
          }
          return { contents, loader: "js" };
        });
      },
    }],
  });
  const compiled = new Module(path.resolve("script/.driver-board-test.cjs"), module);
  compiled.filename = path.resolve("script/.driver-board-test.cjs");
  compiled.paths = Module._nodeModulePaths(path.dirname(compiled.filename));
  compiled._compile(output.outputFiles[0].text, compiled.filename);
  Page = compiled.exports.default;
  // The real inspector is exercised through the page, not a reimplementation.
  reset();
});
test.beforeEach(reset);
async function mount() {
  let view;
  await act(async () => { view = create(React.createElement(Page)); });
  return {
    view,
    async click(id) { await act(async () => view.root.findByProps({ "data-testid": id }).props.onClick()); },
    json() { return JSON.stringify(view.toJSON()); },
    async close() { await act(async () => view.unmount()); },
  };
}
test("all eight real board hotspots select the corresponding evidence", async () => {
  const h = await mount();
  try {
    for (const component of fixtures.filter(c => c.kind !== "bios")) {
      await h.click(`driver-hotspot-${component.kind}`);
      const button = h.view.root.findByProps({ "data-testid": `driver-hotspot-${component.kind}` });
      assert.equal(button.props["aria-pressed"], true);
      assert.match(h.json(), new RegExp(component.rationale));
    }
    assert.ok(h.view.root.findByProps({ "data-testid": "component-card-bios" }));
  } finally { await h.close(); }
});
test("next-component navigation and the existing details panel work", async () => {
  const h = await mount();
  try {
    await h.click("driver-hotspot-gpu");
    await h.click("button-driver-next");
    assert.equal(h.view.root.findByProps({ "data-testid": "driver-hotspot-ssd" }).props["aria-pressed"], true);
    await h.click("button-driver-details");
    assert.match(h.view.root.findByProps({ "data-testid": "component-panel" }).children.filter(child => typeof child === "string").join(""), /Actual device 3/);
  } finally { await h.close(); }
});
test("Rescan invokes the production store, not a preview timer", async () => {
  const h = await mount();
  try { assert.equal(calls.scan, 1); await h.click("button-rescan"); assert.equal(calls.rescan, 1); }
  finally { await h.close(); }
  assert.equal(calls.cancel, 1);
});
test("the production health score changes with evidence rather than using fixture 83", async () => {
  const h = await mount();
  try {
    const before = h.view.root.findByProps({ "data-testid": "driver-health-score" }).props.children;
    globalThis.__diStore = { ...globalThis.__diStore, components: fixtures.map(c => ({ ...c, health: "healthy", current: "2.0.0", latest: "2.0.0" })) };
    await act(async () => h.view.update(React.createElement(Page)));
    const after = h.view.root.findByProps({ "data-testid": "driver-health-score" }).props.children;
    assert.notEqual(before, after);
    assert.equal(after, 100);
  } finally { await h.close(); }
});
test("partial cached results remain inspectable and unknown stays Not verified", async () => {
  globalThis.__diStore.phase = "partial";
  const h = await mount();
  try {
    await h.click("driver-hotspot-gpu");
    assert.match(h.json(), /Not verified/);
    assert.match(h.json(), /Actual device 2/);
    assert.ok(h.view.root.findByProps({ "data-testid": "driver-history" }));
  } finally { await h.close(); }
});
test("loading and errors stay usable without fabricated score or components", async () => {
  globalThis.__diStore = { ...globalThis.__diStore, phase: "error", components: [], score: null, error: "Native scan unavailable" };
  const h = await mount();
  try {
    assert.equal(h.view.root.findByProps({ "data-testid": "driver-health-score" }).props.children, "—");
    assert.match(h.json(), /Native scan unavailable/);
    assert.match(h.json(), /Run a scan to inspect/);
  } finally { await h.close(); }
});
test("Premium access remains enforced and no scan runs for locked users", async () => {
  globalThis.__diPremium = false;
  const h = await mount();
  try {
    assert.ok(h.view.root.findByProps({ "data-testid": "button-driver-intel-unlock" }));
    assert.equal(calls.scan, 0);
    assert.equal(h.view.root.findAllByProps({ "data-testid": "driver-hotspot-gpu" }).length, 0);
  } finally { await h.close(); }
});
test("dashboard navigation and the AI entry point stay connected", async () => {
  const h = await mount();
  try {
    await h.click("button-ai-plan");
    await h.click("button-back-dashboard");
    assert.deepEqual(calls.navigate, ["/ai-advisor", "/dashboard"]);
  } finally { await h.close(); }
});
test("the authentic asset ships and production code has no mockup URLs or fixture imports", () => {
  assert.ok(fs.statSync("client/public/images/driver-intel/aorus-ice-holographic-render.png").size > 1000);
  const source = fs.readFileSync("client/src/components/driver-intel/DriverBoardInspector.tsx", "utf8");
  assert.doesNotMatch(source, /previewComponents|previewScore|__mockup|startPreviewScan|DESIGN PREVIEW/);
  const css = fs.readFileSync("client/src/components/driver-intel/driver-board-inspector.css", "utf8");
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /data-reduced-motion/);
});
