const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadCleaner({
  gpuNames = ["AMD Radeon Test Adapter"],
  gpuProbeFails = false,
  outputs = [],
  psError = () => false,
} = {}) {
  const handlers = new Map();
  const commands = [];
  const timeouts = [];
  const progress = [];
  let outputIndex = 0;
  const gpuProbe = JSON.stringify({
    amd: gpuNames.some(name => /AMD|Radeon/i.test(name)),
    nvidia: gpuNames.some(name => /NVIDIA|GeForce|Quadro|Tesla|RTX|GTX/i.test(name)),
    names: gpuNames,
  });
  const fakeRequire = (id) => {
    if (id === "electron") {
      return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } };
    }
    if (id === "child_process") {
      return {
        execFile: (_exe, args, options, callback) => {
          const command = args.at(-1);
          commands.push(command);
          timeouts.push(options.timeout);
          const child = { kill() {} };
          queueMicrotask(() => {
            if (command.includes("Win32_VideoController")) {
              callback(gpuProbeFails ? new Error("GPU probe unavailable") : null, gpuProbe, "");
            } else if (psError(command)) {
              callback(new Error("Access is denied."), "", "Access is denied.");
            } else {
              callback(null, outputs[outputIndex++] ?? "2048|2|0|", "");
            }
          });
          return child;
        },
      };
    }
    if (id === "fs") return { unlinkSync() {}, writeFileSync() {} };
    if (id === "os") return { homedir: () => "C:\\Users\\Test", tmpdir: () => "C:\\Temp" };
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
      pid: 4242,
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
  return { invoke, commands, progress, timeouts };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function itemCommands(cleaner) {
  return cleaner.commands.filter(command => !command.includes("Win32_VideoController"));
}

test("AMD shader cache scan, clean, and verify use only approved paths and truthful counts", async () => {
  const cleaner = loadCleaner({
    outputs: ["4096|3|0|", "2048|2|1|", "1024|1|0|"],
  });
  const scan = plain(await cleaner.invoke("cleaner:scan", ["shader_cache"]));
  assert.equal(scan.results.shader_cache.sizeBytes, 4096);
  assert.equal(scan.results.shader_cache.fileCount, 3);

  const clean = plain(await cleaner.invoke("cleaner:clean", ["shader_cache"]));
  assert.deepEqual(clean.results.shader_cache, {
    bytesRemoved: 2048, filesRemoved: 2, failed: 1,
  });

  const verify = plain(await cleaner.invoke("cleaner:verify", ["shader_cache"]));
  assert.equal(verify.results.shader_cache.found, true);
  assert.equal(verify.results.shader_cache.fileCount, 1);

  const shaderScripts = itemCommands(cleaner).join("\n");
  assert.match(shaderScripts, /D3DSCache/);
  assert.match(shaderScripts, /AMD\\DxCache/);
  assert.doesNotMatch(shaderScripts, /NVIDIA\\(?:DXCache|GLCache)/i);
  // Mock command output tests accounting and routing contracts only. They do
  // not simulate or claim that Windows actually deleted files.
});

test("shader-cache paths are scoped correctly for NVIDIA, hybrid, and integrated GPUs", async (t) => {
  const cases = [
    { label: "NVIDIA-only", names: ["NVIDIA GeForce Test"], amdPath: false },
    { label: "AMD and NVIDIA hybrid", names: ["AMD Radeon Test", "NVIDIA GeForce Test"], amdPath: true },
    { label: "integrated-only", names: ["Intel UHD Graphics"], amdPath: false },
    { label: "unclassified adapter", names: ["Microsoft Basic Display Adapter"], amdPath: false },
  ];
  for (const gpu of cases) {
    await t.test(gpu.label, async () => {
      const cleaner = loadCleaner({ gpuNames: gpu.names });
      const scan = plain(await cleaner.invoke("cleaner:scan", ["shader_cache"]));
      assert.equal(scan.results.shader_cache.unsupported, undefined);
      const script = itemCommands(cleaner).join("\n");
      assert.match(script, /D3DSCache/);
      assert.equal(/AMD\\DxCache/.test(script), gpu.amdPath);
      assert.doesNotMatch(script, /NVIDIA\\(?:DXCache|GLCache)/i);
    });
  }
});

test("failed GPU detection protects vendor paths without hiding genuine scan failures", async () => {
  const unknown = loadCleaner({ gpuProbeFails: true });
  const scan = plain(await unknown.invoke(
    "cleaner:scan",
    ["shader_cache", "amd_driver_cache", "nvidia_driver_cache"],
  ));
  for (const id of ["shader_cache", "amd_driver_cache", "nvidia_driver_cache"]) {
    assert.equal(scan.results[id].unsupported, true);
    assert.match(scan.results[id].unsupportedReason, /could not be confirmed|detection failed/i);
  }
  assert.equal(itemCommands(unknown).length, 0);

  const denied = loadCleaner({ psError: command => command.includes("SoftwareDistribution\\Download") });
  const failedScan = plain(await denied.invoke("cleaner:scan", ["update_downloads"]));
  assert.equal(failedScan.results.update_downloads.unsupported, undefined);
  assert.match(failedScan.results.update_downloads.error, /Access is denied/);
});

test("vendor installer cache items are not applicable when their GPU is absent", async () => {
  const intel = loadCleaner({ gpuNames: ["Intel UHD Graphics"] });
  const result = plain(await intel.invoke(
    "cleaner:scan",
    ["amd_driver_cache", "nvidia_driver_cache"],
  ));
  assert.equal(result.results.amd_driver_cache.notApplicable, true);
  assert.match(result.results.amd_driver_cache.notApplicableReason, /No AMD GPU/);
  assert.equal(result.results.nvidia_driver_cache.notApplicable, true);
  assert.match(result.results.nvidia_driver_cache.notApplicableReason, /No NVIDIA GPU/);
  assert.equal(itemCommands(intel).length, 0);
});

test("Windows Update cache maintenance preserves services and reports remaining files", async () => {
  const cleaner = loadCleaner({
    outputs: ["4096|3|0|", "2048|2|1|", "1024|1|0|"],
  });
  const scan = plain(await cleaner.invoke("cleaner:scan", ["update_downloads"]));
  assert.equal(scan.results.update_downloads.sizeBytes, 4096);

  const clean = plain(await cleaner.invoke("cleaner:clean", ["update_downloads"]));
  assert.deepEqual(clean.results.update_downloads, {
    bytesRemoved: 2048, filesRemoved: 2, failed: 1,
  });
  const verify = plain(await cleaner.invoke("cleaner:verify", ["update_downloads"]));
  assert.equal(verify.results.update_downloads.fileCount, 1);
  assert.equal(verify.results.update_downloads.found, true);

  const maintenance = itemCommands(cleaner).find(command => command.includes("Stop-Service"));
  assert.ok(maintenance);
  assert.match(maintenance, /wuauserv/);
  assert.match(maintenance, /bits/);
  assert.match(maintenance, /finally/);
  assert.match(maintenance, /Start-Service/);
  assert.match(maintenance, /switchcontrol-cleaner-cancel-4242\.flag/);
  assert.equal(cleaner.timeouts[2], 0, "service-managed cleanup must not be hard-killed before finally can restore services");
  const helperSource = fs.readFileSync(path.join(process.cwd(), "electron/cleaner-helper.js"), "utf8");
  assert.match(helperSource, /if \(child\.cleanerCancellationAware\) continue/);
  assert.match(maintenance, /Test-Path -LiteralPath 'C:\\Temp\\switchcontrol-cleaner-cancel-4242\.flag'/);
});

test("Windows Update service and permission failures remain failures, not unsupported", async () => {
  const cleaner = loadCleaner({
    psError: command => command.includes("Get-Service -Name"),
  });
  const result = plain(await cleaner.invoke("cleaner:clean", ["update_downloads"]));
  assert.equal(result.results.update_downloads.unsupported, undefined);
  assert.equal(result.results.update_downloads.failed, 1);
  assert.match(result.results.update_downloads.error, /Access is denied/);
  assert.match(itemCommands(cleaner).join("\n"), /finally/);
});

test("Delivery Optimization, font, and icon cache handlers are registered", async () => {
  const cleaner = loadCleaner();
  const ids = ["windows_delivery_optimization", "windows_font_cache", "windows_icon_cache"];
  const scan = plain(await cleaner.invoke("cleaner:scan", ids));
  for (const id of ids) {
    assert.equal(scan.results[id].unsupported, undefined);
    assert.equal(scan.results[id].error, undefined);
  }
  const clean = plain(await cleaner.invoke("cleaner:clean", ids));
  for (const id of ids) assert.equal(clean.results[id].unsupported, undefined);

  const scripts = itemCommands(cleaner).join("\n");
  assert.match(scripts, /Delete-DeliveryOptimizationCache/);
  assert.match(scripts, /FontCache/);
  assert.match(scripts, /iconcache/);
});

test("protected and unknown Cleaner items return specific reasons in scan, clean, and verify", async () => {
  const cleaner = loadCleaner({ gpuNames: ["NVIDIA GeForce Test"] });
  const ids = [
    "event_logs_old", "windows_installer_leftovers", "windows_defender_history",
    "old_windows_update", "nvidia_driver_cache", "unknown_item",
  ];
  for (const [channel, reasonField] of [
    ["cleaner:scan", "unsupportedReason"],
    ["cleaner:verify", "unsupportedReason"],
    ["cleaner:clean", "unsupportedReason"],
  ]) {
    const result = plain(await cleaner.invoke(channel, ids));
    for (const id of ids) {
      assert.equal(result.results[id].unsupported, true);
      assert.match(result.results[id][reasonField], /protected|unknown|handler/i);
    }
  }
  assert.equal(itemCommands(cleaner).length, 0);
});

test("missing cache paths report an empty scan rather than a fabricated cleanup", async () => {
  const cleaner = loadCleaner({ outputs: ["0|0|0|", "0|0|0|"] });
  const scan = plain(await cleaner.invoke("cleaner:scan", ["update_downloads"]));
  assert.equal(scan.results.update_downloads.found, false);
  const verify = plain(await cleaner.invoke("cleaner:verify", ["update_downloads"]));
  assert.equal(verify.results.update_downloads.found, false);
});

test("route and UI preserve specific unsupported reasons and do not count them as cleaned", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "server/routes/cleaner.ts"), "utf8");
  const ui = fs.readFileSync(path.join(process.cwd(), "client/src/pages/SystemCleaner.tsx"), "utf8");
  assert.match(route, /unsupportedReason: er\.unsupportedReason/);
  assert.match(route, /status: er\.notApplicable === true \? "not-applicable" : "unsupported"/);
  assert.match(route, /bytesRemoved: 0,\s*filesRemoved: 0,\s*error: er\.notApplicable/);
  assert.match(route, /id: "windows_font_cache"[\s\S]*?diskBased: true/);
  assert.match(route, /id: "windows_icon_cache"[\s\S]*?diskBased: true/);
  assert.match(route, /id: "windows_delivery_optimization"[\s\S]*?diskBased: true/);
  assert.match(ui, /finding\.unsupportedReason/);
  assert.match(ui, /result\.status === "unsupported" \|\| result\.status === "not-applicable"/);
});
