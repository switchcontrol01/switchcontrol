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
    /items\.map\(item => \[[\s\S]*normalizeDebloatScanState\(result\.results\?\.\[item\.id\]\)/,
    "every requested item must receive a normalized scan state",
  );
  assert.match(
    debloaterPage,
    /const errorDetail = result\.errorDetail \?\? result\.error/,
    "detailed Electron errors must be retained in the client result",
  );
  assert.match(
    debloaterRoute,
    /const error = native\.error/,
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

test("Debloat treats probe errors as unknown instead of absent", () => {
  assert.match(
    debloaterRoute,
    /const result = electronResults\[item\.id\][\s\S]*?isPlainObject\(result\) && !result\.error[\s\S]*?"unknown"/,
    "a failed Windows probe must remain unknown on the server",
  );
  assert.match(
    debloaterPage,
    /result\.status === "verification-failed"/,
    "verification failures must count as failed progress",
  );
  assert.match(
    debloaterPage,
    /itemState\[item\.id\] !== "absent" && itemState\[item\.id\] !== "unknown"/,
    "unknown probes must not be counted as actionable items",
  );
  assert.match(
    debloaterPage,
    /scanStatus === "unknown"[\s\S]*Unable to verify/,
    "unknown probes must be visible to the user",
  );
});

test("Debloat removal preserves already-absent states only after a native re-query", () => {
  assert.match(
    debloat,
    /Get-AppxPackage -Name[\s\S]*?-ErrorAction Stop/,
    "AppX lookup errors must not be converted into a missing package",
  );
  assert.match(
    debloat,
    /Get-CimInstance Win32_Service[\s\S]*?-ErrorAction Stop[\s\S]*?Write-Output 'already-absent'/,
    "service lookup errors must not be converted into a missing service",
  );
  assert.match(
    debloat,
    /Get-ScheduledTask[\s\S]*?-ErrorAction Stop[\s\S]*?TaskNotFound\|NoMatching\|ObjectNotFound/,
    "scheduled-task query errors must remain distinct from known missing tasks",
  );
  assert.match(
    debloat,
    /const result = out\.includes\('already-absent'\)/,
    "the native action output must still participate in result classification",
  );
  assert.match(
    debloat,
    /verificationProbe\.state === 'absent'/,
    "already-absent requires an absent post-action probe",
  );
  assert.match(
    debloaterRoute,
    /nativeState === "absent"[\s\S]*raw\.ok[\s\S]*nativelyVerified/,
    "a verification failure must not be persisted as verified",
  );
});

test("native probe normalizer preserves scalar, array, missing, and inconclusive states", () => {
  const types = ["appx", "registry", "service", "task"];
  for (const type of types) {
    assert.equal(contract.normalizeNativeProbeResult(type, "present", "target").state, "present");
    assert.equal(contract.normalizeNativeProbeResult(type, JSON.stringify(["absent"]), "target").state, "absent");
    assert.equal(contract.normalizeNativeProbeResult(type, JSON.stringify({ state: "unknown", reason: "query-error" }), "target").state, "unknown");
    assert.equal(contract.normalizeNativeProbeResult(type, "", "target").state, "unknown");
    assert.equal(contract.normalizeNativeProbeResult(type, JSON.stringify({ error: "timeout" }), "target").state, "unknown");
    assert.equal(contract.normalizeNativeProbeResult(type, JSON.stringify({ state: "absent", error: "timeout" }), "target").state, "unknown");
    assert.equal(contract.normalizeNativeProbeResult(type, JSON.stringify({ state: "absent", timedOut: true }), "target").state, "unknown");
  }
  assert.equal(
    contract.normalizeNativeProbeResult(
      "task",
      JSON.stringify([{ state: "absent" }, { state: "present" }]),
      ["\\Task\\Missing", "\\Task\\Enabled"],
    ).state,
    "present",
  );
  assert.equal(
    contract.normalizeNativeProbeResult(
      "task",
      JSON.stringify([{ state: "absent" }, { state: "unknown", reason: "inaccessible" }]),
      ["\\Task\\Missing", "\\Task\\Private"],
    ).state,
    "unknown",
  );
});

test("canonical probe identities are exact and never derived from local baselines", () => {
  const app = contract.getCanonicalContract("feedback_hub");
  const registry = contract.getCanonicalContract("advertising_id");
  const service = contract.getCanonicalContract("diagtrack");
  const task = contract.getCanonicalContract("telemetry_tasks");
  assert.equal(contract.getCanonicalProbeTarget(app), "Microsoft.WindowsFeedbackHub");
  assert.equal(
    contract.getCanonicalProbeTarget(registry),
    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo\\Enabled",
  );
  assert.equal(contract.getCanonicalProbeTarget(service), "DiagTrack");
  assert.deepEqual(contract.getCanonicalProbeTarget(task), task.taskPaths);
  assert.equal(
    contract.normalizeNativeProbeResult("registry", JSON.stringify({ state: "absent" }), contract.getCanonicalProbeTarget(registry)).target,
    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo\\Enabled",
  );
  const verifyStart = debloat.indexOf("async function verifyItem(item)");
  const restoreVerifyStart = debloat.indexOf("async function verifyRestoredItem(item)");
  assert.ok(verifyStart >= 0 && restoreVerifyStart > verifyStart);
  const verifyBody = debloat.slice(verifyStart, restoreVerifyStart);
  assert.match(verifyBody, /return probeCanonical\(item, 'verify'\)/);
  assert.doesNotMatch(verifyBody, /getDebloatBaseline/);
});

test("UAC cancellation and elevation startup failures remain actionable failures", () => {
  const psShared = fs.readFileSync(
    path.join(process.cwd(), "electron/ps-shared.js"),
    "utf8",
  );
  assert.match(
    psShared,
    /cancelled: true,[\s\S]*Administrator permission was canceled or the elevated PowerShell script did not start/,
    "elevation startup/cancellation details must tell the user how to recover",
  );
});