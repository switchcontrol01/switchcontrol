const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    return { app: { getPath: () => os.tmpdir() }, shell: {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { resolveIconPath } = require("../file-icon.js");
Module._load = originalLoad;

function touch(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "fixture");
  return filePath;
}

test("installed-app icons skip generic uninstall stubs and use the matching app executable", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "switchcontrol-app-icons-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const installLocation = path.join(root, "Bodycam");
  const uninstallExe = touch(path.join(installLocation, "unins000.exe"));
  const productExe = touch(path.join(installLocation, "Binaries", "Win64", "Bodycam.exe"));
  const result = resolveIconPath({
    name: "Bodycam",
    displayIcon: `"${uninstallExe}",0`,
    installLocation,
    uninstallString: `"${uninstallExe}" /uninstall`,
  });

  assert.equal(result, productExe);
});

test("installed-app icon resolution keeps a valid product DisplayIcon", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "switchcontrol-app-icons-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const epicExe = touch(path.join(root, "EpicGamesLauncher.exe"));
  assert.equal(resolveIconPath({
    name: "Epic Games Launcher",
    displayIcon: `"${epicExe}",0`,
    installLocation: "",
  }), epicExe);
});

test("installed-app icon cache is versioned by the app's icon and install paths", () => {
  const source = fs.readFileSync(path.join(__dirname, "../debloat-helper.js"), "utf8");
  assert.match(source, /installed-app-icon-v2/);
  assert.match(source, /String\(app\.displayIcon \|\| ''\)/);
  assert.match(source, /String\(app\.installLocation \|\| ''\)/);
});
