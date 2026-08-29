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