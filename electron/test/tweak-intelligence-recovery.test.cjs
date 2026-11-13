const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { create, act } = require("react-test-renderer");
const { build } = require("esbuild");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let useTweakIntelligence;
const system = { signals: [{ id: "cpu", value: "32%", subsystem: "cpu" }], cpuLoad: 32, memPct: 28 };
const scores = { scores: [{ tweakId: "example", score: 72 }] };
const posture = { dimensions: [{ id: "performance", score: 93 }], overallCoverage: 93 };
const good = (url) => url.includes("system-state") ? system : url.includes("category-scores") ? scores : posture;
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

test.before(async () => {
  // Run the real React hook with only the store and HTTP boundary replaced.
  const bundle = await build({
    entryPoints: [path.resolve("client/src/hooks/useTweakIntelligence.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", external: ["react"],
    plugins: [{
      name: "hook-boundaries",
      setup(build) {
        build.onResolve({ filter: /^@\/lib\/(api|store)$/ }, args => ({ path: args.path, namespace: "fixture" }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
          contents: args.path.endsWith("api")
            ? "export const apiFetch=(...args)=>globalThis.__intelTest.fetch(...args);"
            : "export const useStore=selector=>selector(globalThis.__intelTest.store);",
          loader: "js",
        }));
      },
    }],
  });
  const file = path.resolve("electron/test/.intel-hook.cjs");
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = Module._nodeModulePaths(path.dirname(file));
  compiled._compile(bundle.outputFiles[0].text, file);
  useTweakIntelligence = compiled.exports.useTweakIntelligence;
});

async function mount(fetch, interval = 60_000, electronAPI) {
  const calls = [];
  globalThis.window = { electronAPI };
  globalThis.__intelTest = {
    store: { tweaks: {}, stats: { gpuName: "AMD" } },
    fetch: (url, options, request) => { calls.push({ url, signal: request.signal }); return fetch(url, request.signal); },
  };
  let current;
  function Probe() { current = useTweakIntelligence(interval); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Probe)); });
  return {
    get state() { return current; }, calls,
    async refresh(times = 1) { await act(async () => { for (let i = 0; i < times; i++) current.refresh(); }); },
    async updateStore(tweaks) {
      globalThis.__intelTest.store.tweaks = tweaks;
      await act(async () => { renderer.update(React.createElement(Probe)); });
    },
    async close() { await act(async () => renderer.unmount()); },
  };
}

test("successful loading produces real data and Live status", async () => {
  const h = await mount(async url => response(good(url)));
  try {
    assert.equal(h.state.availability, "ready");
    assert.equal(h.state.cpuLoad, 32);
    assert.equal(h.state.overallCoverage, 93);
    assert.equal(h.state.error, null);
  } finally { await h.close(); }
});

test("first-load HTTP failures settle quietly, never show the red error or spin forever", async () => {
  const h = await mount(async () => response({}, 503));
  try {
    assert.equal(h.state.loading, false);
    assert.equal(h.state.availability, "unavailable");
    assert.equal(h.state.lastUpdated, null);
    assert.equal(h.state.error, null);
    await h.refresh(6);
    assert.equal(h.state.error, null);
    assert.equal(h.state.availability, "unavailable");
    assert.equal(h.calls.length, 6); // One initial batch and one coalesced retry batch.
  } finally { await h.close(); }
});

test("failed refresh retains the last good values and becomes a quiet stale snapshot", async () => {
  let fail = false;
  const h = await mount(async url => response(fail ? {} : good(url), fail ? 503 : 200));
  try {
    const updated = h.state.lastUpdated;
    fail = true;
    await h.refresh();
    assert.equal(h.state.availability, "stale");
    assert.equal(h.state.cpuLoad, 32);
    assert.equal(h.state.overallCoverage, 93);
    assert.equal(h.state.lastUpdated, updated);
    assert.equal(h.state.error, null);
    assert.equal(h.state.loading, false);
    fail = false;
    await h.refresh();
    assert.equal(h.state.availability, "ready");
  } finally { await h.close(); }
});

test("partial endpoint success remains usable and clearly partial", async () => {
  const h = await mount(async url => response(good(url), url.includes("category-scores") ? 503 : 200));
  try {
    assert.equal(h.state.availability, "partial");
    assert.equal(h.state.cpuLoad, 32);
    assert.equal(h.state.overallCoverage, 93);
    assert.equal(h.state.error, null);
  } finally { await h.close(); }
});

test("malformed or invalid JSON cannot masquerade as successful intelligence", async () => {
  const h = await mount(async () => response({ error: "Not intelligence" }));
  try { assert.equal(h.state.availability, "unavailable"); }
  finally { await h.close(); }
  const invalid = await mount(async () => ({ ok: true, status: 200, json: async () => { throw Error("invalid JSON"); } }));
  try { assert.equal(invalid.state.availability, "unavailable"); }
  finally { await invalid.close(); }
});

test("slow requests are not aborted by the polling interval or repeated Refresh", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let complete;
  const pending = new Promise(resolve => { complete = resolve; });
  const h = await mount(async url => { await pending; return response(good(url)); }, 5);
  try {
    await act(async () => { t.mock.timers.tick(100); });
    await h.refresh(10);
    assert.equal(h.calls.length, 3);
    assert.ok(h.calls.every(call => !call.signal.aborted));
    await act(async () => complete());
    assert.equal(h.state.availability, "ready");
  } finally { await h.close(); t.mock.timers.reset(); }
});

test("request deadline ends stuck transport work and permits manual recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let stuck = true;
  const h = await mount(url => stuck ? new Promise(() => {}) : Promise.resolve(response(good(url))));
  try {
    await act(async () => { t.mock.timers.tick(12_000); });
    assert.equal(h.state.loading, false);
    assert.equal(h.state.availability, "unavailable");
    assert.equal(h.state.error, null);
    assert.ok(h.calls.every(call => call.signal.aborted));
    stuck = false;
    await h.refresh();
    assert.equal(h.state.availability, "ready");
  } finally { await h.close(); t.mock.timers.reset(); }
});

test("a stuck native telemetry IPC is bounded too", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = await mount(async url => response(good(url)), 60_000, {
    isElectron: true, telemetry: { getLive: () => new Promise(() => {}) },
  });
  try {
    await act(async () => { t.mock.timers.tick(12_000); });
    assert.equal(h.state.availability, "unavailable");
    assert.equal(h.state.loading, false);
  } finally { await h.close(); t.mock.timers.reset(); }
});

test("failed polling backs off and retries the initially missing posture slice", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fail = true;
  const h = await mount(async url => response(good(url), fail ? 503 : 200), 100);
  try {
    await act(async () => { t.mock.timers.tick(100); });
    assert.equal(h.calls.length, 3);
    await act(async () => { t.mock.timers.tick(100); });
    assert.equal(h.calls.length, 6);
    fail = false;
    await act(async () => { t.mock.timers.tick(400); });
    assert.equal(h.state.availability, "ready");
    assert.equal(h.state.overallCoverage, 93);
    assert.equal(h.calls.filter(c => c.url.includes("/posture")).length, 3);
  } finally { await h.close(); t.mock.timers.reset(); }
});

test("normal healthy polls safely skip unchanged posture without generating a recurring failure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = await mount(async url => response(good(url)), 100);
  try {
    for (let i = 0; i < 4; i++) {
      await act(async () => { t.mock.timers.tick(100); });
      assert.equal(h.state.availability, "ready");
      assert.equal(h.state.error, null);
      assert.equal(h.state.overallCoverage, 93);
    }
    assert.equal(h.calls.length, 11); // Three initially, two per following poll.
    assert.equal(h.calls.filter(c => c.url.includes("/posture")).length, 1);
  } finally { await h.close(); t.mock.timers.reset(); }
});

test("late responses from a replaced request cannot overwrite the current applied state", async () => {
  let complete;
  let old = true;
  const pending = new Promise(resolve => { complete = resolve; });
  const h = await mount(async url => {
    if (old) { await pending; return response(url.includes("system-state") ? { ...system, cpuLoad: 99 } : good(url)); }
    return response(good(url));
  });
  try {
    old = false;
    await h.updateStore({ example: true });
    assert.equal(h.state.cpuLoad, 32);
    await act(async () => complete());
    assert.equal(h.state.cpuLoad, 32);
    assert.ok(h.calls.slice(0, 3).every(call => call.signal.aborted));
  } finally { await h.close(); }
});

test("unmount aborts work and clears the next scheduled poll", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = await mount(async url => response(good(url)), 100);
  await h.close();
  await act(async () => { t.mock.timers.tick(1000); });
  assert.equal(h.calls.length, 3);
  t.mock.timers.reset();
});

test("the UI cannot render the old red error banner and does not call stale data Live", () => {
  const source = fs.readFileSync("client/src/components/tweaks/TweakIntelligenceLayer.tsx", "utf8");
  const hook = fs.readFileSync("client/src/hooks/useTweakIntelligence.ts", "utf8");
  assert.doesNotMatch(source, /key="intel-error"|\{intel\.error\}/);
  assert.doesNotMatch(hook, /Could not load system intelligence/);
  assert.match(source, /key="intel-status"/);
  assert.match(source, /Last snapshot/);
  assert.match(source, /Info,/); // Prevent a missing-icon runtime crash.
});
