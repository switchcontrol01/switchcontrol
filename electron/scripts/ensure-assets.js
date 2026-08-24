const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "..", "build");
const iconPath = path.join(buildDir, "icon.ico");
const projectRoot = path.join(__dirname, "..", "..");
const fallbackPng = path.join(projectRoot, "assets", "icon.png");

console.log("[ensure-assets] Checking build assets...");

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
  console.log("[ensure-assets] Created electron/build/");
}

// Keep packaging self-healing for local checkouts and downloaded source
// archives. The committed ICO remains the preferred source because it contains
// all Windows sizes. If only the shared PNG is present, wrap it as a valid
// PNG-backed ICO so the build can still proceed with the branded SWC icon.
if (!fs.existsSync(iconPath) && fs.existsSync(fallbackPng)) {
  const png = fs.readFileSync(fallbackPng);
  if (png.readUInt32BE(0) === 0x89504e47 && png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0) {
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const directory = Buffer.alloc(22);
    directory.writeUInt16LE(0, 0); // reserved
    directory.writeUInt16LE(1, 2); // ICO
    directory.writeUInt16LE(1, 4); // one image
    directory.writeUInt8(width >= 256 ? 0 : width, 6);
    directory.writeUInt8(height >= 256 ? 0 : height, 7);
    directory.writeUInt8(0, 8); // palette
    directory.writeUInt8(0, 9); // reserved
    directory.writeUInt16LE(1, 10); // colour planes
    directory.writeUInt16LE(32, 12); // bits per pixel
    directory.writeUInt32LE(png.length, 14);
    directory.writeUInt32LE(22, 18);
    fs.writeFileSync(iconPath, Buffer.concat([directory, png]));
    console.log("[ensure-assets] Restored electron/build/icon.ico from assets/icon.png");
  }
}

if (!fs.existsSync(iconPath)) {
  console.error("[ensure-assets] ERROR: electron/build/icon.ico is missing.");
  console.error("[ensure-assets] The build folder was created, but no branded icon source was found.");
  console.error("[ensure-assets] Expected either electron/build/icon.ico or assets/icon.png.");
  process.exit(1);
}

const stats = fs.statSync(iconPath);
if (stats.size < 1000) {
  console.error("[ensure-assets] ERROR: icon.ico is too small - may be corrupted.");
  process.exit(1);
}

console.log("[ensure-assets] icon.ico present (" + Math.round(stats.size / 1024) + " KB)");
