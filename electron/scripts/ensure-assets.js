const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "..", "build");
const iconPath = path.join(buildDir, "icon.ico");

console.log("[ensure-assets] Checking build assets...");

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
  console.log("[ensure-assets] Created electron/build/");
}

if (!fs.existsSync(iconPath)) {
  console.error("[ensure-assets] ERROR: electron/build/icon.ico is missing.");
  console.error("[ensure-assets] Place your icon.ico file in electron/build/ before building.");
  process.exit(1);
}

const stats = fs.statSync(iconPath);
if (stats.size < 1000) {
  console.error("[ensure-assets] ERROR: icon.ico is too small - may be corrupted.");
  process.exit(1);
}

console.log("[ensure-assets] icon.ico present (" + Math.round(stats.size / 1024) + " KB)");
