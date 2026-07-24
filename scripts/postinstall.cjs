#!/usr/bin/env node
/**
 * postinstall.js — runs after `npm install`.
 *
 * 1. Patches the tsx nested-esbuild directory so tsx can start on Replit
 *    (tsx ships an empty nested esbuild dir; this creates a CJS proxy to the
 *    root esbuild installation).
 * 2. Optionally runs `cd electron && npm install` — skipped if the Replit
 *    package firewall blocks the tar package (common in this environment).
 */
const fs   = require("fs");
const path = require("path");

// ── 1. tsx / esbuild proxy ────────────────────────────────────────────────────
const tsxEsbuildDir = path.join(__dirname, "..", "node_modules", "tsx", "node_modules", "esbuild");
try {
  fs.mkdirSync(tsxEsbuildDir, { recursive: true });
  fs.writeFileSync(
    path.join(tsxEsbuildDir, "package.json"),
    JSON.stringify({ name: "esbuild", version: "0.27.7", main: "index.js" }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(tsxEsbuildDir, "index.js"),
    "// Proxy to root esbuild — resolves tsx nested-esbuild lookup on Replit.\nmodule.exports = require(\"../../../esbuild/lib/main.js\");\n",
  );
  console.log("[postinstall] tsx/esbuild proxy applied ✓");
} catch (e) {
  console.warn("[postinstall] tsx/esbuild proxy skipped:", e.message);
}

// ── 2. Electron deps (best-effort) ────────────────────────────────────────────
const { execSync } = require("child_process");
const electronDir  = path.join(__dirname, "..", "electron");
if (fs.existsSync(path.join(electronDir, "package.json"))) {
  try {
    execSync("npm install --prefer-offline --no-audit --no-fund", {
      cwd: electronDir,
      stdio: "pipe",
      timeout: 120_000,
    });
    console.log("[postinstall] electron deps installed ✓");
  } catch (e) {
    console.warn("[postinstall] electron npm install skipped (firewall or network issue) —", e.message.split("\n")[0]);
  }
}
