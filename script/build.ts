import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm } from "fs/promises";

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
  // native binary modules (if any are added in future)
  // "bcrypt",
  // "canvas",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild({
    base: "./",
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
