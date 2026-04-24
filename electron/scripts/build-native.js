const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const binDir = path.join(__dirname, '..', 'bin');
const exePath = path.join(binDir, 'sc_memory.exe');
const nativeDir = path.join(__dirname, '..', 'native', 'sc_memory');
const releaseExe = path.join(nativeDir, 'target', 'release', 'sc_memory.exe');

function hasCargo() {
  try {
    execSync('cargo --version', { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

if (hasCargo()) {
  console.log('[build-native] Rust toolchain found — compiling sc_memory...');
  try {
    execSync('cargo build --release', { cwd: nativeDir, stdio: 'inherit', windowsHide: true });
    fs.copyFileSync(releaseExe, exePath);
    console.log('[build-native] sc_memory.exe built and copied to bin/');
  } catch (err) {
    if (fs.existsSync(exePath)) {
      console.warn('[build-native] Cargo build failed but existing bin/sc_memory.exe found — using cached binary.');
    } else {
      console.warn('[build-native] WARNING: Cargo build failed and no cached binary exists.');
      console.warn('[build-native] Memory clean feature will be unavailable in this build.');
      console.warn('[build-native] To enable it: install Rust from https://rustup.rs and rebuild.');
    }
  }
} else if (fs.existsSync(exePath)) {
  const stats = fs.statSync(exePath);
  const sizeKB = Math.round(stats.size / 1024);
  console.log(`[build-native] Cargo not found — using existing bin/sc_memory.exe (${sizeKB} KB)`);
} else {
  console.warn('[build-native] WARNING: Cargo is not installed and no pre-built bin/sc_memory.exe found.');
  console.warn('[build-native] Memory clean feature will be unavailable in this build.');
  console.warn('[build-native] To enable it: install Rust from https://rustup.rs and rebuild.');
  console.warn('[build-native] Continuing build — all other features work normally.');
}
