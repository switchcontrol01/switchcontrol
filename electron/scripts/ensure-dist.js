const fs = require("fs");
const path = require("path");

const electronDist = path.join(__dirname, "..", "..", "dist-electron");

console.log("[ensure-dist] Checking Electron frontend build...");

if (!fs.existsSync(electronDist)) {
  console.error("[ensure-dist] ERROR: dist-electron/ does not exist.");
  console.error("[ensure-dist] Run 'npm run build' in root directory first.");
  process.exit(1);
}

const indexHtml = path.join(electronDist, "index.html");
if (!fs.existsSync(indexHtml)) {
  console.error("[ensure-dist] ERROR: dist-electron/index.html not found - build may have failed.");
  process.exit(1);
}

// Hard stop if the backend bundle is missing.
// This prevents electron-builder from silently packaging an installer
// without index.cjs (which causes the app to boot with no local backend).
// The backend bundle is always written to dist/index.cjs (project root),
// regardless of whether the frontend was built for web or electron.
const backendBundle = path.join(__dirname, "..", "..", "dist", "index.cjs");
if (!fs.existsSync(backendBundle)) {
  console.error("");
  console.error("[ensure-dist] FATAL: dist/index.cjs is missing.");
  console.error("[ensure-dist] The esbuild step did not complete — the frontend was built but the server bundle was not.");
  console.error("");
  console.error("[ensure-dist] Fix: run  npm run build  from the project root and check for esbuild errors.");
  console.error("[ensure-dist] Do NOT run electron:build until dist/index.cjs exists.");
  console.error("");
  process.exit(1);
}
console.log("[ensure-dist] Verified: dist/index.cjs present — backend bundle will be packaged");

console.log("[ensure-dist] Using dist-electron directly — no duplicate staging copy");

// --- Strip website-only assets not needed in the packaged Electron app ---
const WEBSITE_ONLY_FILES = [
  "og-image.png",
  "opengraph.jpg",
  "android-chrome-512x512.png",
  "android-chrome-192x192.png",
  "apple-touch-icon.png",
  "googlef20cb2a861878cbe.html",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  "icon.ico",
];

let removedBytes = 0;
for (const file of WEBSITE_ONLY_FILES) {
  const filePath = path.join(electronDist, file);
  if (fs.existsSync(filePath)) {
    const size = fs.statSync(filePath).size;
    fs.rmSync(filePath);
    removedBytes += size;
    console.log(`[ensure-dist] Removed website-only: ${file} (${Math.round(size / 1024)}KB)`);
  }
}

if (removedBytes > 0) {
  console.log(`[ensure-dist] Stripped ${Math.round(removedBytes / 1024)}KB of website-only assets`);
}

// --- Remove source map files (never needed at runtime) ---
let mapCount = 0;
let mapBytes = 0;
function removeSourceMaps(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeSourceMaps(fullPath);
    } else if (entry.name.endsWith(".map")) {
      const size = fs.statSync(fullPath).size;
      fs.rmSync(fullPath);
      mapCount++;
      mapBytes += size;
    }
  }
}
removeSourceMaps(electronDist);
if (mapCount > 0) {
  console.log(`[ensure-dist] Removed ${mapCount} source map file(s) (${Math.round(mapBytes / 1024)}KB)`);
}

// --- Remove PNG files when WebP versions exist (blueprint assets) ---
// After rebuild with WebP source assets, both .png and .webp will be copied.
// Only keep the WebP version to avoid shipping both.
let dedupCount = 0;
let dedupBytes = 0;
function deduplicatePngWebp(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      deduplicatePngWebp(fullPath);
    } else if (entry.name.endsWith(".png")) {
      const webpPath = fullPath.replace(/\.png$/, ".webp");
      if (fs.existsSync(webpPath)) {
        const size = fs.statSync(fullPath).size;
        fs.rmSync(fullPath);
        dedupCount++;
        dedupBytes += size;
        console.log(`[ensure-dist] Removed duplicate PNG (WebP exists): ${entry.name} (${Math.round(size / 1024)}KB)`);
      }
    }
  }
}
deduplicatePngWebp(path.join(electronDist, "assets"));
if (dedupCount > 0) {
  console.log(`[ensure-dist] Deduplicated ${dedupCount} PNG file(s) vs WebP (${Math.round(dedupBytes / 1024)}KB freed)`);
}

// --- Build guard: fail the build if forbidden dev/source junk is present ---
// This catches regressions BEFORE they ship to users. Examples of things that
// must never end up in dist-electron: replit.md, attached_assets/, screenshots/,
// arbitrary .md / .txt notes, raw source files, etc.
const FORBIDDEN_FILE_PATTERNS = [
  /\.md$/i,
  /\.txt$/i,
  /^replit\./i,
  /^README/i,
  /^CHANGELOG/i,
  /^LICENSE/i,
  /\.log$/i,
  /\.ts$/i,
  /\.tsx$/i,
];
const FORBIDDEN_DIR_NAMES = new Set([
  "attached_assets",
  "screenshots",
  "docs",
  "test",
  "tests",
  "__tests__",
  ".git",
  ".local",
  "node_modules",
  "src",
  "server",
  "shared",
  "client",
]);

const violations = [];
function scanForJunk(dir, relPath = "") {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    const childAbs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (FORBIDDEN_DIR_NAMES.has(entry.name)) {
        violations.push(`directory: ${childRel}/`);
        continue;
      }
      scanForJunk(childAbs, childRel);
    } else {
      for (const pattern of FORBIDDEN_FILE_PATTERNS) {
        if (pattern.test(entry.name)) {
          violations.push(`file: ${childRel}`);
          break;
        }
      }
    }
  }
}
scanForJunk(electronDist);

if (violations.length > 0) {
  console.error("");
  console.error("[ensure-dist] BUILD GUARD FAILED");
  console.error("[ensure-dist] Forbidden files found in dist-electron that must not ship to users:");
  for (const v of violations) {
    console.error(`  - ${v}`);
  }
  console.error("");
  console.error("[ensure-dist] Fix by either:");
  console.error("  1. Removing the offending file from client/public/ or client/src/");
  console.error("  2. Adding it to WEBSITE_ONLY_FILES above if it's an intentional website-only asset");
  console.error("  3. Adjusting FORBIDDEN_FILE_PATTERNS / FORBIDDEN_DIR_NAMES if too strict");
  console.error("");
  process.exit(1);
}

console.log("[ensure-dist] Build guard passed — no forbidden files in dist-electron");
console.log("[ensure-dist] Done — dist-electron is clean and ready for packaging");
