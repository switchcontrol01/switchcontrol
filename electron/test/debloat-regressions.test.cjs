const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const debloat = fs.readFileSync(
  path.join(process.cwd(), "electron/debloat-helper.js"),
  "utf8",
);
const debloaterPage = fs.readFileSync(
  path.join(process.cwd(), "client/src/pages/Debloater.tsx"),
  "utf8",
);
const debloaterRoute = fs.readFileSync(
  path.join(process.cwd(), "server/routes/debloater.ts"),
  "utf8",
);
const contract = require(path.join(process.cwd(), "electron/debloat-contract.cjs"));

test("curated Debloat removal captures output before classifying the result", () => {
  const removeHandler = debloat.match(
    /ipcMain\.handle\('debloat:removeItem'[\s\S]*?ipcMain\.handle\('debloat:restoreItem'/,
  )?.[0];
  assert.ok(removeHandler, "removeItem IPC handler should exist");
  assert.match(
    removeHandler,
    /let out = '';/,
    "the result classifier must have an initialized output variable",
  );
  assert.match(
    removeHandler,
    /out = await runPS\(cmd, 15000\);/,
    "non-elevated removal output must be captured",
  );
  assert.match(
    removeHandler,
    /const elevated = await runElevated\(cmd, \{ tempFilePrefix: 'sc_debloat_' \}\)/,
    "service removal must continue using the elevated path",
  );
});

test("Debloat scan normalizes structured Electron states and preserves detailed errors", () => {
  assert.match(
    debloaterPage,
    /function normalizeDebloatScanState\(value: unknown\)/,
    "the UI must normalize the Electron scan response shape",
  );
  assert.match(
    debloaterPage,
    /Object\.entries\(result\.results \?\? \{\}\)\.map/,
    "scan results must be normalized before entering item state",
  );
  assert.match(
    debloaterPage,
    /const errorDetail = result\.errorDetail \?\? result\.error/,
    "detailed Electron errors must be retained in the client result",
  );
  assert.match(
    debloaterRoute,
    /error = eResult\.errorDetail \?\? eResult\.error/,
    "the server must prefer detailed Electron errors when persisting results",
  );
});

test("curated Debloat IPC accepts only canonical identities and values", () => {
  assert.equal(contract.getCanonicalItemIds().length, 53);
  const registryPayload = {
    id: "advertising_id",
    type: "registry",
    regPath: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo",
    regName: "Enabled",
    regValueDisabled: 0,
  };
  assert.equal(contract.validateItemPayload(registryPayload, "remove"), null);
  assert.match(
    contract.validateItemPayload({ ...registryPayload, regPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows" }, "remove"),
    /identity/,
  );
  assert.match(
    contract.validateItemPayload({
      id: "diagtrack",
      type: "service",
      serviceName: "DiagTrack",
      restoreSupported: true,
      defaultStartType: "powershell -Command evil",
    }, "restore"),
    /restore value/,
  );
  assert.equal(contract.validateItemPayload({
    id: "mixed_reality",
    type: "appx",
    packageName: "Microsoft.MixedReality.Portal",
    restoreSupported: true,
  }, "restore"), "Item does not support restore.");
});

test("server Debloat mutations require native results and bound result statuses", () => {
  assert.match(debloaterRoute, /Native execution results are required/);
  assert.match(debloaterRoute, /Duplicate Debloater items are not allowed/);
  assert.match(debloaterRoute, /VALID_RESULT_STATUSES/);
  assert.match(debloaterRoute, /verification-inconclusive/);
});

test("native restore captures original state before mutation and verifies it after restore", () => {
  assert.match(debloat, /captureDebloatBaseline/);
  assert.match(debloat, /saveDebloatBaseline\(item\.id, baseline\)/);
  assert.match(debloat, /deleteDebloatBaseline\(item\.id\)/);
  assert.match(debloat, /original Windows state could not be verified/);
  assert.match(debloat, /sc\.exe config/);
});