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

test("successful reset defers profile cleanup until the Electron process exits", async () => {
  const app = makeApp();
  let scheduled = null;
  let spawned = null;
  const handler = createFactoryResetHandler({
    app,
    fs: {},
    path: {
      join: (base, entry) => `${base}\\${entry}`,
    },
    spawn: (execPath, args, options) => {
      spawned = { execPath, args, options };
      return { unref() {} };
    },
    processRef: {
      pid: 1234,
      execPath: "C:\\Program Files\\SwitchControl\\SwitchControl.exe",
      argv: ["SwitchControl.exe", "main.js", "--existing-flag"],
      env: { TEST_ENV: "1" },
      cwd: () => "C:\\Program Files\\SwitchControl",
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
  assert.equal(spawned.execPath, "C:\\Program Files\\SwitchControl\\SwitchControl.exe");
  assert.match(spawned.args[0], /[\\/]factory-reset-cleanup\.js$/);
  assert.deepEqual(JSON.parse(spawned.args[1]), {
    parentPid: 1234,
    userDataPath: "C:\\Users\\test\\AppData\\Roaming\\SwitchControl",
    preservedFiles: ["device-id.json"],
    execPath: "C:\\Program Files\\SwitchControl\\SwitchControl.exe",
    execArgs: ["main.js", "--existing-flag"],
    cwd: "C:\\Program Files\\SwitchControl",
  });
  assert.equal(spawned.options.detached, true);
  assert.equal(spawned.options.windowsHide, true);
  assert.equal(spawned.options.stdio, "ignore");
  assert.equal(spawned.options.env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(app.calls.length, 0, "exit must not race the IPC response");
  assert.equal(scheduled.delay, 250);

  scheduled.callback();
  assert.deepEqual(app.calls, [["exit", 0]]);
});

test("cleanup-process startup failure returns an actionable reset error", async () => {
  const app = makeApp();
  const handler = createFactoryResetHandler({
    app,
    fs: {},
    path: {
      join: (base, entry) => `${base}\\${entry}`,
    },
    spawn: () => {
      throw new Error("spawn denied");
    },
  });

  const result = await handler({}, FACTORY_RESET_CONFIRMATION);
  assert.equal(result.ok, false);
  assert.equal(result.error, "reset_failed");
  assert.match(result.message, /spawn denied/);
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

test("startup reconciliation does not claim active Windows settings as app-owned", () => {
  const main = read("electron/main.js");
  assert.doesNotMatch(main, /active unowned tweak adopted for expiry revert/);
  assert.doesNotMatch(main, /ownershipStore\.ensureRecord\(scopeKey[\s\S]{0,300}verificationState:\s*'unverified'/);
});

test("factory reset accepts safely released unverifiable ownership", () => {
  const app = read("client/src/App.tsx");
  const revertEngine = read("client/src/lib/premiumRevertEngine.ts");
  assert.match(revertEngine, /detail\?\.skipped && detail\?\.safeToProceed[\s\S]{0,100}'skipped_user_owned'/);
  assert.doesNotMatch(app, /item\.status === "skipped_user_owned"/);
  assert.match(app, /setIsSigningOut\(true\);[\s\S]{0,100}setFactoryResetFailed\(false\);[\s\S]{0,100}clearTourState\(\);/);
});

test("Debloater sparklines always receive a concrete static path", () => {
  const debloater = read("client/src/pages/Debloater.tsx");
  assert.match(debloater, /<motion\.path\s+d=\{s\.spark\}/);
  assert.doesNotMatch(debloater, /animate=\{\{\s*d:\s*s\.spark/);
});