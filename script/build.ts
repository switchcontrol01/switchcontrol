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
  // Cannot be bundled — use dynamic require() paths esbuild can't trace,
  // or ship platform-specific native bindings. These are placed next to the
  // server bundle via electron extraResources so require() finds them at runtime.
  "ws",
  "systeminformation",
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

  console.log("building client...");
  await viteBuild({
    base: "/",
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
