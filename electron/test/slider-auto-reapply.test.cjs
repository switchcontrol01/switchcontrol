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
  let timerMs10 = 156;
  let timerAgentRunning = false;

  function applyCommand(command) {
    const writes = [
      ...command.matchAll(/-Name '([^']+)' -Value \(\[(?:int|uint32)\](\d+)\)|-Name '([^']+)' -Value '(\d+)' -Type String/g),
    ];
    for (const match of writes) {
      registry.set(match[1] ?? match[3], Number(match[2] ?? match[4]));
    }

    if (command.includes("timer-resolution-state.json")) {
      const start = command.match(/\$state = @\{ pid = \$proc\.Id; ms10 = (\d+) \}/);
      if (start) {
        timerMs10 = Number(start[1]);
        timerAgentRunning = true;
      } else if (/if \(156 -eq 156\)/.test(command)) {
        timerMs10 = 156;
        timerAgentRunning = false;
      }
    }
  }

  async function runPS(command) {
    applyCommand(command);
    return "";
  }

  async function queryPS(command) {
    if (command.includes("timer-resolution-state.json")) {
      const expectedTimer = command.match(/\$s\.ms10 -eq (\d+)\)/);
      if (expectedTimer) {
        return String(timerAgentRunning && timerMs10 === Number(expectedTimer[1]));
      }
      return String(timerAgentRunning ? timerMs10 : 156);
    }
    const name = command.match(/-Name '([^']+)'/)?.[1];
    const expected = command.match(/-eq \(\[(?:int|uint32)\](\d+)\)|-eq '(\d+)'/);
    const current = name ? registry.get(name) : undefined;
    if (expected) return String(current === Number(expected[1] ?? expected[2]));
    return current === undefined ? "" : String(current);
  }

  async function runElevated(command) {
    elevatedCommands.push(command);
    applyCommand(command);
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
    setTimerState(value, running) {
      timerMs10 = value;
      timerAgentRunning = running;
    },
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

test("custom priority recovery can inspect and clear the shared slider target", async () => {
  const h = createHarness({ admin: true });
  try {
    h.registry.set("Win32PrioritySeparation", 38);
    const executor = h.loadExecutor();
    const applied = await executor.applySliderValue("win32-priority-sep", 26);
    assert.equal(applied.ok, true);

    const appliedState = executor.getSliderRecoveryState("win32-priority-sep");
    assert.equal(appliedState.appliedValue, 26);
    assert.equal(appliedState.originalValue, 38);
    assert.equal(appliedState.hasOriginalValue, true);
    assert.equal(executor.clearSliderRecoveryState("win32-priority-sep"), true);
    const clearedState = executor.getSliderRecoveryState("win32-priority-sep");
    assert.equal(clearedState.appliedValue, null);
    assert.equal(clearedState.originalValue, null);
    assert.equal(clearedState.hasOriginalValue, false);
  } finally {
    h.cleanup();
  }
});

test("restores a verified slider target when Windows removes its registry key", async () => {
  const h = createHarness({ admin: true });
  try {
    h.registry.set("Win32PrioritySeparation", 38);
    const firstRun = h.loadExecutor();
    const applied = await firstRun.applySliderValue("win32-priority-sep", 26);
    assert.equal(applied.ok, true);
    assert.equal(applied.persisted, true);

    // Reproduce the supplied before/after logs: the target was 26, but after
    // restart Windows no longer has the registry value and reads its default.
    h.registry.delete("Win32PrioritySeparation");
    const result = await h.loadExecutor().reapplyAppliedSliderValues(true);

    assert.equal(h.registry.get("Win32PrioritySeparation"), 26);
    assert.equal(result.reapplied.length, 1);
    assert.equal(result.reapplied[0].tweakId, "win32-priority-sep");
    assert.equal(result.reapplied[0].value, 26);
    assert.equal(result.failed.length, 0);
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

test("every enabled slider survives restart and missing Windows values", async () => {
  const h = createHarness({ admin: true });
  try {
    const firstRun = h.loadExecutor();
    const activeIds = firstRun.SLIDER_TWEAK_IDS.filter(id => !firstRun.SLIDER_TWEAKS[id].disabled);
    assert.equal(activeIds.length, 10, "the regression loop must cover every enabled slider definition");
    assert.equal(firstRun.SLIDER_TWEAK_IDS.length - activeIds.length, 2, "only the two documented unsafe sliders are disabled");

    const targets = new Map();
    for (const tweakId of activeIds) {
      const def = firstRun.SLIDER_TWEAKS[tweakId];
      const target = def.defaultValue === def.safeMin
        ? Math.min(def.safeMax, def.safeMin + 1)
        : def.safeMin;
      assert.notEqual(target, def.defaultValue, `${tweakId} test value must differ from its Windows default`);
      if (def.regName) h.registry.set(def.regName, def.defaultValue);
      if (tweakId === "timer-resolution-slider") h.setTimerState(156, false);

      const applied = await firstRun.applySliderValue(tweakId, target);
      assert.equal(applied.ok, true, `${tweakId} should apply`);
      assert.equal(applied.verified, true, `${tweakId} should be verified`);
      assert.equal(applied.persisted, true, `${tweakId} should save its recovery target`);
      targets.set(tweakId, target);
    }

    const saved = JSON.parse(fs.readFileSync(h.files.SLIDER_STATE_FILE, "utf8"));
    for (const [tweakId, target] of targets) {
      assert.equal(saved.appliedValues[tweakId], target, `${tweakId} should persist its exact target`);
    }

    // Simulate a new app process and Windows deleting every changed registry key.
    for (const tweakId of activeIds) {
      const def = firstRun.SLIDER_TWEAKS[tweakId];
      if (def.regName) h.registry.delete(def.regName);
    }
    h.setTimerState(156, false);

    const afterRestart = h.loadExecutor();
    const restored = await afterRestart.reapplyAppliedSliderValues(true);
    assert.equal(restored.reapplied.length, activeIds.length);
    assert.equal(restored.failed.length, 0);
    for (const tweakId of activeIds) {
      const result = await afterRestart.readSliderValue(tweakId);
      assert.equal(result.value, targets.get(tweakId), `${tweakId} should be restored to its saved value`);
      assert.equal(result.missing, false, `${tweakId} should no longer be missing after recovery`);
    }
  } finally {
    h.cleanup();
  }
});
