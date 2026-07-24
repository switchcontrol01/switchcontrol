import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

// Packages that MUST stay external — they cannot be bundled:
//
// 1. Packages that use dynamic require() with variable paths that esbuild
//    can't statically analyze (e.g. native bindings loaders).
// 2. Any package that ships pre-compiled native .node addons.
//
// Everything else is bundled directly into dist/index.cjs so the file is
// fully self-contained and works inside a packaged Electron app where
// node_modules is NOT available on disk.
//
// "vite" is excluded because it is only imported in the dev-server path
// (NODE_ENV !== 'production'). Since we define NODE_ENV="production" below,
// esbuild dead-code-eliminates that branch and vite is never pulled in.
// We keep it external as an extra safety net in case any import survives.
const FORCE_EXTERNAL = [
  // dev tooling — never needed at server runtime
  "vite",
  "drizzle-kit",
  // ws and systeminformation are pure-JS and can be bundled for the web/Railway
  // deployment. In Electron they live in extra-resources next to the .asar, but
  // for the web server we want a fully self-contained dist/index.cjs so the
  // container doesn't need node_modules at runtime.
  // NOTE: esbuild may emit warnings about unresolvable optional native deps
  // (bufferutil, utf-8-validate for ws; platform-specific si modules). These
  // warnings are safe to ignore — the packages handle missing optionals at runtime.
];

// Packages that must be present in node_modules for esbuild to bundle them.
// If any are missing the build fails immediately with a clear install command.
const REQUIRED_BUNDLED = [
  "helmet",
  "jsonwebtoken",
  "openai",
  "express",
  "drizzle-orm",
  "zod",
  "express-rate-limit",
  "stripe",
  "passport",
  "compression",
  "cookie-parser",
  "cors",
  "express-session",
  "connect-pg-simple",
  "passport-discord",
  "passport-google-oauth20",
  "path-to-regexp",
  "pg",
  "memorystore",
  "date-fns",
];

function checkRequiredPackages() {
  const missing: string[] = [];
  for (const pkg of REQUIRED_BUNDLED) {
    const resolved = join(process.cwd(), "node_modules", pkg);
    if (!existsSync(resolved)) missing.push(pkg);
  }
  if (missing.length > 0) {
    console.error("");
    console.error("BUILD FAILED — missing npm packages:");
    for (const p of missing) console.error(`  - ${p}`);
    console.error("");
    console.error("Fix: run this command from the project root, then retry npm run build:");
    console.error(`  npm install ${missing.join(" ")}`);
    console.error("");
    process.exit(1);
  }
}

async function buildAll() {
  checkRequiredPackages();

  await rm("dist", { recursive: true, force: true });
  await rm("dist-electron", { recursive: true, force: true });

  // Web deployment build: absolute asset paths so nested routes (e.g.
  // /admin/performance) resolve correctly when served from the domain root.
  console.log("building client (web — base=/, outDir=dist)...");
  await viteBuild({
    base: "/",
    build: { outDir: "../dist" },
  });

  // Electron desktop build: relative asset paths so the packaged app
  // (loaded via file://) finds assets next to index.html instead of at the
  // filesystem root. This is a separate output; the web build stays intact.
  console.log("building client (electron — base=./, outDir=dist-electron)...");
  await viteBuild({
    base: "./",
    build: { outDir: "../dist-electron" },
  });

  console.log("building server (fully bundled — no external npm deps)...");
  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    treeShaking: true,
    // Node.js built-ins (fs, path, crypto, http, etc.) are automatically
    // kept external by esbuild when platform === "node". We only need to
    // explicitly externalize the dev-only packages above.
    external: FORCE_EXTERNAL,
    logLevel: "info",
  });

  console.log("server bundle written to dist/index.cjs");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
