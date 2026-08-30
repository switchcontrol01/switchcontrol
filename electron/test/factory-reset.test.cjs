const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  FACTORY_RESET_CONFIRMATION,
  createFactoryResetHandler,
} = require("../factory-reset.js");

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");

function makeApp() {
  const calls = [];
  return {
    calls,
    getPath(name) {
      assert.equal(name, "userData");
      return "C:\\Users\\test\\AppData\\Roaming\\SwitchControl";
    },
    relaunch() {
      calls.push("relaunch");
    },
    exit(code) {
      calls.push(["exit", code]);
    },
  };
}

test("preload forwards the required factory-reset confirmation token", () => {
  const preload = read("electron/preload.js");
  assert.match(
    preload,
    /resetAppData:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('app:resetData',\s*'RESET_SWITCHCONTROL_DATA'\)/,
  );
});

test("successful reset preserves device-id and schedules relaunch after returning", async () => {
  const app = makeApp();
  const deleted = [];
  let scheduled = null;
  const handler = createFactoryResetHandler({
    app,
    fs: {
      readdirSync: () => ["device-id.json", "config.json", "logs"],
      rmSync: (target) => deleted.push(target),
    },
    path: {
      join: (base, entry) => `${base}\\${entry}`,
    },
    schedule: (callback, delay) => {
      scheduled = { callback, delay };
    },
    handoffDelayMs: 250,
  });

  const result = await handler({}, FACTORY_RESET_CONFIRMATION);
  assert.deepEqual(result, {
    ok: true,
    startedAt: result.startedAt,
    preservedFiles: ["device-id.json"],
    failures: [],
    relaunchScheduled: true,
  });
  assert.deepEqual(deleted, [
    "C:\\Users\\test\\AppData\\Roaming\\SwitchControl\\config.json",
    "C:\\Users\\test\\AppData\\Roaming\\SwitchControl\\logs",
  ]);
  assert.equal(app.calls.length, 0, "exit must not race the IPC response");
  assert.equal(scheduled.delay, 250);

  scheduled.callback();
  assert.deepEqual(app.calls, ["relaunch", ["exit", 0]]);
});

test("native deletion failures propagate individually without scheduling exit", async () => {
  const app = makeApp();
  let scheduled = false;
  const handler = createFactoryResetHandler({
    app,
    fs: {
      readdirSync: () => ["config.json", "cache"],
      rmSync: (target) => {
        throw new Error(`locked: ${target}`);
      },
    },
    path: {
      join: (base, entry) => `${base}\\${entry}`,
    },
    schedule: () => {
      scheduled = true;
    },
  });

  const result = await handler({}, FACTORY_RESET_CONFIRMATION);
  assert.equal(result.ok, false);
  assert.equal(result.error, "delete_failed");
  assert.equal(result.failures.length, 2);
  assert.deepEqual(result.failures.map((failure) => failure.entry), ["config.json", "cache"]);
  assert.match(result.message, /2 item\(s\)/);
  assert.equal(scheduled, false);
  assert.deepEqual(app.calls, []);
});

test("incorrect confirmation token is rejected before any deletion", async () => {
  let readDirectory = false;
  const handler = createFactoryResetHandler({
    app: { getPath: () => "C:\\data" },
    fs: {
      readdirSync: () => {
        readDirectory = true;
        return [];
      },
    },
    path,
  });

  const result = await handler({}, "wrong-token");
  assert.deepEqual(
    { ok: result.ok, error: result.error },
    { ok: false, error: "confirmation_required" },
  );
  assert.equal(readDirectory, false);
});

test("renderer reset invocation has a bounded no-hang timeout", async () => {
  const { invokeFactoryResetWithTimeout } = await import("../../client/src/lib/factoryReset.ts");
  await assert.rejects(
    invokeFactoryResetWithTimeout(() => new Promise(() => {}), 15),
    /did not respond/,
  );
});

test("renderer rejects malformed native success results", async () => {
  const { isSuccessfulFactoryResetResult, describeFactoryResetFailure } =
    await import("../../client/src/lib/factoryReset.ts");
  assert.equal(isSuccessfulFactoryResetResult({ ok: true }), false);
  assert.match(
    describeFactoryResetFailure({ ok: false, error: "delete_failed", failures: [{ entry: "config.json", error: "locked" }] }),
    /config\.json: locked/,
  );
});