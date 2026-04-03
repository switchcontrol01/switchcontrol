const fs = require("fs");
const path = require("path");

const rootDist = path.join(__dirname, "..", "..", "dist");
const electronDist = path.join(__dirname, "..", "dist-frontend");

console.log("[ensure-dist] Checking frontend build...");

if (!fs.existsSync(rootDist)) {
  console.error("[ensure-dist] ERROR: root dist/ does not exist.");
  console.error("[ensure-dist] Run 'npm run build' in root directory first.");
  process.exit(1);
}

const indexHtml = path.join(rootDist, "index.html");
if (!fs.existsSync(indexHtml)) {
  console.error("[ensure-dist] ERROR: dist/index.html not found - build may have failed.");
  process.exit(1);
}

fs.rmSync(electronDist, { recursive: true, force: true });
fs.mkdirSync(electronDist, { recursive: true });
fs.cpSync(rootDist, electronDist, { recursive: true });

console.log("[ensure-dist] Frontend dist copied to electron/dist-frontend");

const copiedIndex = path.join(electronDist, "index.html");
if (!fs.existsSync(copiedIndex)) {
  console.error("[ensure-dist] ERROR: Copy failed - index.html not in destination.");
  process.exit(1);
}

console.log("[ensure-dist] Verified: index.html present in electron/dist-frontend");

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

console.log("[ensure-dist] Done — dist-frontend is clean and ready for packaging");
