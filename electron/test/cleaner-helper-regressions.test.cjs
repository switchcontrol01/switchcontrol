const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadCleaner({ gpuProbeFails = false } = {}) {
  const handlers = new Map();
  const commands = [];
  const progress = [];
  const gpuProbe = JSON.stringify({
    amd: true,
    nvidia: false,
    names: ["AMD Radeon Test Adapter"],
  });
  const fakeRequire = (id) => {
    if (id === "electron") {
      return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } };
    }
    if (id === "child_process") {
      return {
        execFile: (_exe, args, _options, callback) => {
          const command = args.at(-1);
          commands.push(command);
          const child = { kill() {} };
          queueMicrotask(() => {
            if (command.includes("Win32_VideoController")) {
              callback(gpuProbeFails ? new Error("GPU probe unavailable") : null, gpuProbe, "");
            } else {
              callback(null, "2048|2|0", "");
            }
          });
          return child;
        },
      };
    }
    if (id === "os") return { homedir: () => "C:\\Users\\Test" };
    if (id === "path") return path.win32;
    if (id === "./powershell-limiter") {
      return { tryAcquire: () => ({}), release() {} };
    }
    throw new Error(`Unexpected require: ${id}`);
  };

  const source = fs.readFileSync(
    path.join(process.cwd(), "electron/cleaner-helper.js"),
    "utf8",
  );
  vm.runInNewContext(source, {
    require: fakeRequire,
    process: {
      platform: "win32",
      env: {
        WINDIR: "C:\\Windows",
        SystemDrive: "C:",
        TEMP: "C:\\Users\\Test\\AppData\\Local\\Temp",
        LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local",
        APPDATA: "C:\\Users\\Test\\AppData\\Roaming",
      },
    },
    console: { log() {} },
  });

  const invoke = (name, ids) => handlers.get(name)(
    { sender: { send: (_event, result) => progress.push(result) } },
    ids,
  );
  return { invoke, commands, progress };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("Cleaner scan, clean, and verify use the shared availability check", async () => {
  const cleaner = loadCleaner();
  const ids = [
    "windows_temp",
    "amd_driver_cache",
    "nvidia_driver_cache",
    "shader_cache",
    "unknown_item",
  ];

  const scan = plain(await cleaner.invoke("cleaner:scan", ids));
  assert.equal(scan.ok, true);
  assert.equal(scan.results.windows_temp.sizeBytes, 2048);
  assert.equal(scan.results.amd_driver_cache.fileCount, 2);
  assert.equal(scan.results.nvidia_driver_cache.notApplicable, true);
  assert.equal(scan.results.shader_cache.unsupported, true);
  assert.equal(scan.results.unknown_item.unsupported, true);

  const clean = plain(await cleaner.invoke("cleaner:clean", ids));
  assert.equal(clean.ok, true);
  assert.equal(clean.results.windows_temp.filesRemoved, 2);
  assert.equal(clean.results.amd_driver_cache.bytesRemoved, 2048);
  assert.equal(clean.results.nvidia_driver_cache.notApplicable, true);
  assert.equal(clean.results.shader_cache.unsupported, true);
  assert.equal(clean.results.unknown_item.unsupported, true);

  const verify = plain(await cleaner.invoke("cleaner:verify", ids));
  assert.equal(verify.ok, true);
  assert.equal(verify.results.windows_temp.fileCount, 2);
  assert.equal(verify.results.amd_driver_cache.fileCount, 2);
  assert.equal(verify.results.nvidia_driver_cache.notApplicable, true);
  assert.equal(verify.results.shader_cache.unsupported, true);

  // One GPU probe plus two supported native operations per request. Protected,
  // not-applicable, and unknown IDs never run item-specific scripts.
  assert.equal(cleaner.commands.length, 7);
  assert.equal(cleaner.progress.length, ids.length);
});

test("Cleaner fails closed on vendor-specific paths when GPU detection fails", async () => {
  const cleaner = loadCleaner({ gpuProbeFails: true });
  const ids = ["amd_driver_cache", "nvidia_driver_cache", "shader_cache"];

  const scan = plain(await cleaner.invoke("cleaner:scan", ids));
  assert.equal(scan.ok, true);
  for (const id of ids) assert.equal(scan.results[id].unsupported, true);

  const clean = plain(await cleaner.invoke("cleaner:clean", ids));
  assert.equal(clean.ok, true);
  for (const id of ids) assert.equal(clean.results[id].unsupported, true);

  const verify = plain(await cleaner.invoke("cleaner:verify", ids));
  assert.equal(verify.ok, true);
  for (const id of ids) assert.equal(verify.results[id].unsupported, true);

  // Failed vendor detection is cached; no cleanup or scan command is executed.
  assert.equal(cleaner.commands.length, 1);
});
