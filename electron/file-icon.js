'use strict';

const { app, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function getIconCacheDir() {
  try {
    return path.join(app.getPath('userData'), 'icon-cache');
  } catch {
    return path.join(os.tmpdir(), 'switchcontrol-icon-cache');
  }
}

function isSupportedIconPath(filePath) {
  return typeof filePath === 'string'
    && filePath.length > 3
    && filePath.length <= 2048
    && path.isAbsolute(filePath)
    && /\.(?:exe|dll|ico|scr|cpl)$/i.test(filePath)
    && fs.existsSync(filePath);
}

async function getIconDataUrlForPath(filePath, cacheKey = filePath) {
  if (process.platform !== 'win32' || !isSupportedIconPath(filePath)) return null;

  const cacheDir = getIconCacheDir();
  try {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  } catch {}

  const key = crypto.createHash('sha1').update(String(cacheKey)).digest('hex');
  const cacheFile = path.join(cacheDir, `${key}.png`);
  try {
    if (fs.existsSync(cacheFile)) {
      return `data:image/png;base64,${fs.readFileSync(cacheFile).toString('base64')}`;
    }
  } catch {}

  try {
    const image = await shell.getFileIcon(filePath, { size: 'large' });
    if (!image || image.isEmpty()) return null;
    const buffer = image.toPNG();
    try { fs.writeFileSync(cacheFile, buffer); } catch {}
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

module.exports = { getIconDataUrlForPath };