const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "..", "build");
const iconPath = path.join(buildDir, "icon.ico");
const projectRoot = path.join(__dirname, "..", "..");
const sourceIcons = [
  path.join(projectRoot, "assets", "icon.ico"),
  path.join(projectRoot, "electron", "icon.ico"),
];
const fallbackPng = path.join(projectRoot, "assets", "icon.png");

console.log("[ensure-assets] Checking build assets...");

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
  console.log("[ensure-assets] Created electron/build/");
}

function parseValidIconImages(buffer) {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (
    buffer.length < 6 ||
    buffer.readUInt16LE(0) !== 0 ||
    buffer.readUInt16LE(2) !== 1
  ) {
    return [];
  }

  const count = buffer.readUInt16LE(4);
  const directoryEnd = 6 + count * 16;
  if (count === 0 || directoryEnd > buffer.length) return [];

  const images = [];
  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16;
    const width = buffer.readUInt8(entryOffset) || 256;
    const height = buffer.readUInt8(entryOffset + 1) || 256;
    const size = buffer.readUInt32LE(entryOffset + 8);
    const imageOffset = buffer.readUInt32LE(entryOffset + 12);
    const imageEnd = imageOffset + size;

    if (
      width < 1 ||
      height < 1 ||
      width > 256 ||
      height > 256 ||
      size < 8 ||
      imageOffset < directoryEnd ||
      imageEnd > buffer.length
    ) {
      continue;
    }

    const image = buffer.subarray(imageOffset, imageEnd);
    let actualWidth;
    let actualHeight;

    if (image.subarray(0, 8).equals(pngSignature)) {
      if (image.length < 24 || image.toString("ascii", 12, 16) !== "IHDR") continue;
      actualWidth = image.readUInt32BE(16);
      actualHeight = image.readUInt32BE(20);
    } else {
      // ICO bitmap resources use a BITMAPINFOHEADER-or-larger structure, with
      // the stored height combining the color and mask planes.
      if (image.length < 40 || image.readUInt32LE(0) < 40) continue;
      actualWidth = Math.abs(image.readInt32LE(4));
      const combinedHeight = Math.abs(image.readInt32LE(8));
      if (combinedHeight % 2 !== 0) continue;
      actualHeight = combinedHeight / 2;
    }

    if (
      actualWidth !== width ||
      actualHeight !== height ||
      actualWidth < 1 ||
      actualHeight < 1 ||
      actualWidth > 256 ||
      actualHeight > 256
    ) {
      continue;
    }

    images.push({
      width,
      height,
      planes: buffer.readUInt16LE(entryOffset + 4),
      bitCount: buffer.readUInt16LE(entryOffset + 6),
      data: image,
    });
  }
  return images;
}

function createIcon(images) {
  const directoryEnd = 6 + images.length * 16;
  const directory = Buffer.alloc(directoryEnd);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  let dataOffset = directoryEnd;
  const imageData = [];
  images.forEach((image, index) => {
    const entryOffset = 6 + index * 16;
    directory.writeUInt8(image.width === 256 ? 0 : image.width, entryOffset);
    directory.writeUInt8(image.height === 256 ? 0 : image.height, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(image.planes || 1, entryOffset + 4);
    directory.writeUInt16LE(image.bitCount || 32, entryOffset + 6);
    directory.writeUInt32LE(image.data.length, entryOffset + 8);
    directory.writeUInt32LE(dataOffset, entryOffset + 12);
    dataOffset += image.data.length;
    imageData.push(image.data);
  });

  return Buffer.concat([directory, ...imageData]);
}

function parsePngIconImage(png) {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (
    png.length < 24 ||
    !png.subarray(0, 8).equals(pngSignature) ||
    png.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return null;
  }

  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 256 || height > 256) return null;
  return { width, height, planes: 1, bitCount: 32, data: png };
}

let currentImages = [];
if (fs.existsSync(iconPath)) {
  currentImages = parseValidIconImages(fs.readFileSync(iconPath));
}

let repairedFrom;
if (currentImages.length === 0) {
  for (const sourcePath of sourceIcons) {
    if (!fs.existsSync(sourcePath)) continue;
    const sourceImages = parseValidIconImages(fs.readFileSync(sourcePath));
    if (sourceImages.length > 0) {
      currentImages = sourceImages;
      repairedFrom = path.relative(projectRoot, sourcePath);
      break;
    }
  }
}

if (currentImages.length === 0 && fs.existsSync(fallbackPng)) {
  const pngImage = parsePngIconImage(fs.readFileSync(fallbackPng));
  if (pngImage) {
    currentImages = [pngImage];
    repairedFrom = path.relative(projectRoot, fallbackPng);
  }
}

if (currentImages.length === 0) {
  console.error("[ensure-assets] ERROR: no valid Windows icon image was found.");
  console.error("[ensure-assets] Expected a valid .ico or a PNG no larger than 256x256.");
  process.exit(1);
}

// Repack the validated images so bad dimensions, offsets, and unsupported
// oversized entries cannot make it through to electron-builder/NSIS.
const normalizedIcon = createIcon(currentImages);
const currentIcon = fs.existsSync(iconPath) ? fs.readFileSync(iconPath) : null;
if (!currentIcon || !normalizedIcon.equals(currentIcon)) {
  fs.writeFileSync(iconPath, normalizedIcon);
  if (repairedFrom) {
    console.log(`[ensure-assets] Repaired electron/build/icon.ico from ${repairedFrom}`);
  } else {
    console.log("[ensure-assets] Normalized electron/build/icon.ico");
  }
}

const finalImages = parseValidIconImages(fs.readFileSync(iconPath));
if (finalImages.length === 0) {
  console.error("[ensure-assets] ERROR: generated icon.ico failed validation.");
  process.exit(1);
}

console.log(
  `[ensure-assets] icon.ico valid (${finalImages.length} image(s), ` +
  `${Math.round(fs.statSync(iconPath).size / 1024)} KB)`
);
