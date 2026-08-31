const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

test("Vite keeps web and packaged Electron builds split safely", () => {
  const config = read("vite.config.ts");
  const build = read("script/build.ts");

  assert.match(config, /manualChunks/);
  assert.match(config, /vendor-react/);
  assert.match(config, /i18n-first-run/);
  assert.match(config, /chunkSizeWarningLimit:\s*550/);
  assert.match(build, /mode:\s*"web"/);
  assert.match(build, /mode:\s*"electron"/);
  assert.match(build, /base:\s*"\.\/"/);
});

test("preview HMR uses the application port instead of Vite's internal fallback", () => {
  const viteServer = read("server/vite.ts");
  const telemetryWs = read("server/lib/wsServer.ts");

  assert.match(viteServer, /path:\s*"\/vite-hmr"/);
  assert.match(viteServer, /clientPort:\s*Number\(process\.env\.PORT\s*\|\|\s*5000\)/);
  assert.match(
    viteServer,
    /allowedHosts:\s*true/,
    "preview proxy hosts must remain accepted by the middleware server",
  );
  assert.match(telemetryWs, /noServer:\s*true/);
  assert.match(telemetryWs, /pathname !== "\/ws\/telemetry"/);
});

test("database startup migrations share an explicit core-schema readiness gate", () => {
  const db = read("server/db.ts");
  const startup = read("server/index.ts");
  const migration = read("server/lib/startupSchema.ts");

  assert.match(migration, /to_regclass\('public\.users'\)/);
  assert.match(db, /queryCoreSchemaReady\(pool\)/);
  assert.match(startup, /const schemaReady = await isCoreSchemaReady\(\)/);
  assert.match(
    startup,
    /Core schema is not initialized; skipping database startup tasks/,
  );
});

test("Settings defines its Electron-only capability flag before rendering platform actions", () => {
  const settings = read("client/src/pages/Settings.tsx");

  assert.match(
    settings,
    /const isElectron\s*=\s*[\s\S]*electronAPI\?\.isElectron/,
  );
});