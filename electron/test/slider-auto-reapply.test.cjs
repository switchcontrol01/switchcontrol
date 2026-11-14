const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const executorSource = fs.readFileSync(
  path.join(__dirname, "..", "slider-tweak-executor.js"),
  "utf8",
);

function createHarness({ admin = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "switchcontrol-slider-"));
  const files = {
    APPDATA_DIR: dir,
    SLIDER_STATE_FILE: path.join(dir, "slider-state.json"),
    SLIDER_LOG_FILE: path.join(dir, "slider-log.json"),
    SLIDER_CRASH_SENTINEL_FILE: path.join(dir, "slider-crash-sentinel.json"),
  };
  const registry = new Map();
  const elevatedCommands = [];
  const state = { admin };

  async function runPS(command) {
    const match = command.match(/-Name '([^']+)' -Value \(\[int\](-?\d+)\)/);
    if (match) registry.set(match[1], Number(match[2]));
    return "";
  }

  async function queryPS(command) {
    const name = command.match(/-Name '([^']+)'/)?.[1];
    const expected = command.match(/-eq \(\[int\](-?\d+)\)/);
    const current = name ? registry.get(name) : undefined;
    if (expected) return String(current === Number(expected[1]));
    return current === undefined ? "" : String(current);
  }

  async function runElevated(command) {
    elevatedCommands.push(command);
    const writes = [...command.matchAll(/-Name '([^']+)' -Value \(\[int\](-?\d+)\)/g)];
    for (const match of writes) registry.set(match[1], Number(match[2]));
    return { ok: true, error: null, output: "" };
  }

  function loadExecutor() {
    const module = { exports: {} };
    const localRequire = (id) => {
      if (id === "fs") return fs;
      if (id === "path") return path;
      if (id === "./ps-shared") {
        return {
          runPS,
          queryPS,
          checkIsAdmin: async () => state.admin,
          runElevated,
        };
      }
      if (id === "./user-data-paths") return files;
      throw new Error(`Unexpected module dependency in test: ${id}`);
    };
    vm.runInNewContext(executorSource, {
      require: localRequire,
      module,
      exports: module.exports,
      console: { log() {}, info() {}, warn() {}, error() {} },
      process: { kill() {} },
      setTimeout,
      clearTimeout,
    }, { filename: "slider-tweak-executor.js" });
    return module.exports;
  }

  return {
    dir,
    files,
    registry,
    elevatedCommands,
    state,
    loadExecutor,
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("restores verified slider values after restart with one UAC batch", async () => {
  const h = createHarness({ admin: true });
  try {
    h.registry.set("Win32PrioritySeparation", 38);
    h.registry.set("SystemResponsiveness", 20);
    const firstRun = h.loadExecutor();
    const priorityApplied = await firstRun.applySliderValue("win32-priority-sep", 26);
    const responsivenessApplied = await firstRun.applySliderValue("sys-responsiveness", 18);
    assert.equal(priorityApplied.ok, true);
    assert.equal(responsivenessApplied.ok, true);
    assert.equal(h.registry.get("Win32PrioritySeparation"), 26);
    assert.equal(h.registry.get("SystemResponsiveness"), 18);

    const persisted = JSON.parse(fs.readFileSync(h.files.SLIDER_STATE_FILE, "utf8"));
    assert.equal(persisted.appliedValues["win32-priority-sep"], 26);
    assert.equal(persisted.appliedValues["sys-responsiveness"], 18);

    // Simulate a new app process and Windows changing the registry on reboot.
    h.state.admin = false;
    h.registry.set("Win32PrioritySeparation", 38);
    h.registry.set("SystemResponsiveness", 20);
    const afterRestart = h.loadExecutor();
    const result = await afterRestart.reapplyAppliedSliderValues(true);

    assert.equal(h.registry.get("Win32PrioritySeparation"), 26);
    assert.equal(h.registry.get("SystemResponsiveness"), 18);
    assert.equal(result.reapplied.length, 2);
    assert.equal(result.reapplied.find((item) => item.tweakId === "win32-priority-sep").value, 26);
    assert.equal(result.reapplied.find((item) => item.tweakId === "sys-responsiveness").value, 18);
    assert.equal(h.elevatedCommands.length, 1, "system-wide restores should share one UAC prompt");
    assert.equal([...h.elevatedCommands[0].matchAll(/-Name '/g)].length, 2, "the single elevated script should contain both writes");
  } finally {
    h.cleanup();
  }
});

test("does not restore premium slider values without verified active entitlement", async () => {
  const h = createHarness({ admin: true });
  try {
    h.registry.set("Win32PrioritySeparation", 38);
    const executor = h.loadExecutor();
    assert.equal((await executor.applySliderValue("win32-priority-sep", 26)).ok, true);

    h.registry.set("Win32PrioritySeparation", 38);
    const result = await h.loadExecutor().reapplyAppliedSliderValues(false);

    assert.equal(h.registry.get("Win32PrioritySeparation"), 38);
    assert.equal(result.reapplied.length, 0);
    assert.equal(result.skipped[0].reason, "premium_not_verified_active");
  } finally {
    h.cleanup();
  }
});

test("resetting to the Windows default clears the saved automatic-restore target", async () => {
  const h = createHarness({ admin: true });
  try {
    h.registry.set("Win32PrioritySeparation", 38);
    const executor = h.loadExecutor();
    assert.equal((await executor.applySliderValue("win32-priority-sep", 26)).ok, true);
    const reset = await executor.forceRevertSliderToDefault("win32-priority-sep");

    assert.equal(reset.ok, true);
    assert.equal(h.registry.get("Win32PrioritySeparation"), 2);
    const persisted = JSON.parse(fs.readFileSync(h.files.SLIDER_STATE_FILE, "utf8"));
    assert.equal(persisted.appliedValues["win32-priority-sep"], undefined);
  } finally {
    h.cleanup();
  }
});
