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
