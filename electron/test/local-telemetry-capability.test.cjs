const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const launcher = read("electron/backend-launcher.js");
const main = read("electron/main.js");
const preload = read("electron/preload.js");
const server = read("server/lib/wsServer.ts");
const client = read("client/src/lib/telemetryManager.ts");

test("embedded telemetry uses a fresh per-launch capability", () => {
  assert.match(launcher, /crypto\.randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(launcher, /ELECTRON_LOCAL_CAPABILITY/);
  assert.match(launcher, /getBackendConnectionInfo/);
  assert.doesNotMatch(launcher, /ELECTRON_LOCAL_CAPABILITY.*console\./);
});

test("capability reaches the renderer only through the Electron bridge", () => {
  assert.match(main, /app:getBackendConnectionInfo/);
  assert.match(preload, /getBackendConnectionInfo/);
  assert.match(client, /getBackendConnectionInfo/);
});

test("packaged WebSocket URLs do not contain JWTs or capabilities", () => {
  assert.match(client, /url: `ws:\/\/127\.0\.0\.1:\$\{port\}\/ws\/telemetry`/);
  assert.match(client, /switchcontrol-capability\./);
  assert.match(client, /new WebSocket\(wsUrl, protocols\)/);
});

test("local server requires a timing-safe capability match", () => {
  assert.match(server, /timingSafeEqual/);
  assert.match(server, /invalid_local_capability/);
  assert.match(server, /process\.env\.ELECTRON_LOCAL_CAPABILITY/);
  assert.doesNotMatch(server, /skip signature check, just read the sub claim/);
});