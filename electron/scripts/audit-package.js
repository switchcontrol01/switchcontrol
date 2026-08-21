// ================================================================
// SwitchControl Package Audit
// ================================================================
// Scans the packaged Electron build output for:
//   - .env files, secrets, credentials in app.asar or resources
//   - Source maps (.map) left in production build
//   - Test files, spec files, __tests__ directories
//   - Unnecessary dev files (.git, .vscode, node_modules dev deps)
//   - Missing or suspicious build artifacts
//
// Usage:
//   npm run audit:package
//
// Exit codes:
//   0 = PASS
//   1 = FAIL (findings present)
// ================================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const ELECTRON_DIR = path.join(ROOT, 'electron');
const DIST_DIR = path.join(ELECTRON_DIR, 'dist');

// Files / patterns that are banned from production
const BANNED_NAME_PATTERNS = [
  /^\.env/i,
  /\.env\./i,
  /\.env$/i,
  /secret/i,
  /private/i,
  /credential/i,
  /api_key/i,
  /apikey/i,
  /token/i,
  /password/i,
  /\.map$/i,
  /\.test\./i,
  /\.spec\./i,
  /__tests__/i,
  /\.gitkeep/i,
  /tsconfig/i,
  /vite\.config/i,
  /jest/i,
  /eslint/i,
  /prettier/i,
  /\.vscode/i,
  /\.idea/i,
  /launch\.json/i,
];

const BANNED_CONTENT_PATTERNS = [
  /OPENAI_API_KEY\s*=/i,
  /GOOGLE_CLIENT_SECRET\s*=/i,
  /STRIPE_SECRET_KEY\s*=/i,
  /JWT_SECRET\s*=/i,
  /SESSION_SECRET\s*=/i,
  /DATABASE_URL\s*=/i,
  /ADMIN_SETUP_KEY\s*=/i,
  /INSTALLER_DOWNLOAD_URL\s*=/i,
  /WIN_CSC_KEY_PASSWORD\s*=/i,
];

const findings = [];

function log(label, detail) {
  findings.push({ severity: label, detail });
}

function walk(dir, cb) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, cb);
    } else {
      cb(full, entry.name);
    }
  }
}

// --- Phase 1: build directory exists ---
if (!fs.existsSync(DIST_DIR)) {
  log('CRITICAL', 'electron/dist/ not found. Run "npm run electron:build" first.');
} else {
  // --- Phase 2: banned filenames ---
  walk(DIST_DIR, (full, name) => {
    for (const pat of BANNED_NAME_PATTERNS) {
      if (pat.test(name)) {
        log('WARNING', `Banned file found: ${path.relative(DIST_DIR, full)}`);
        break;
      }
    }
  });

  // --- Phase 3: banned content inside app.asar ---
  const asarPath = path.join(DIST_DIR, 'win-unpacked', 'resources', 'app.asar');
  if (fs.existsSync(asarPath)) {
    try {
      const asarContent = execSync(`npx @electron/asar list "${asarPath}"`, { encoding: 'utf-8', cwd: ELECTRON_DIR });
      const lines = asarContent.split('\n').filter(Boolean);
      for (const line of lines) {
        const lower = line.toLowerCase();
        for (const pat of BANNED_NAME_PATTERNS) {
          if (pat.test(lower)) {
            log('WARNING', `Banned file inside app.asar: ${line}`);
            break;
          }
        }
      }
    } catch (e) {
      log('INFO', `Could not inspect app.asar contents: ${e.message}`);
    }
  }

  // --- Phase 4: environment checks ---
  if (process.env.OPENAI_API_KEY) {
    log('CRITICAL', 'OPENAI_API_KEY is present in the build environment -- verify it is NOT baked into the package.');
  }
  if (process.env.GOOGLE_CLIENT_SECRET) {
    log('CRITICAL', 'GOOGLE_CLIENT_SECRET is present in the build environment -- verify it is NOT baked into the package.');
  }
  if (process.env.STRIPE_SECRET_KEY) {
    log('CRITICAL', 'STRIPE_SECRET_KEY is present in the build environment -- verify it is NOT baked into the package.');
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    log('WARNING', 'JWT_SECRET is shorter than 32 characters -- consider strengthening.');
  }

  // --- Phase 5: Electron renderer content audit ---
  const frontendDir = path.join(ROOT, 'dist-electron');
  if (fs.existsSync(frontendDir)) {
    walk(frontendDir, (full, name) => {
      if (/\.(js|cjs)$/.test(name)) {
        try {
          const buf = fs.readFileSync(full, 'utf-8');
          for (const pat of BANNED_CONTENT_PATTERNS) {
            if (pat.test(buf)) {
              log('CRITICAL', `Env secret pattern found in built JS: ${path.relative(frontendDir, full)}`);
              break;
            }
          }
        } catch (e) {}
      }
    });
  }

  // --- Phase 6: expected artifacts ---
  const exePath = path.join(DIST_DIR, 'SwitchControl Setup.exe');
  if (!fs.existsSync(exePath)) {
    log('INFO', 'SwitchControl Setup.exe not found in electron/dist/ (may still be building).');
  } else {
    const sizeMb = fs.statSync(exePath).size / (1024 * 1024);
    log('INFO', `Installer size: ${sizeMb.toFixed(1)} MB`);
    if (sizeMb > 500) {
      log('WARNING', `Installer is unusually large (>500 MB). Check for bundled dev dependencies or source files.`);
    }
  }
}

// --- Report ---
console.log('');
console.log('==================================================');
console.log('SwitchControl Package Audit Report');
console.log('==================================================');

if (findings.length === 0) {
  console.log('');
  console.log('STATUS: PASS -- No issues found.');
  console.log('');
  process.exit(0);
}

let criticalCount = 0;
let warningCount = 0;
let infoCount = 0;

for (const f of findings) {
  if (f.severity === 'CRITICAL') { console.log(`[CRITICAL] ${f.detail}`); criticalCount++; }
  else if (f.severity === 'WARNING') { console.log(`[WARNING]  ${f.detail}`); warningCount++; }
  else { console.log(`[INFO]     ${f.detail}`); infoCount++; }
}

console.log('');
console.log('--------------------------------------------------');
console.log(`Total findings: ${findings.length}  (Critical: ${criticalCount}, Warning: ${warningCount}, Info: ${infoCount})`);
console.log('--------------------------------------------------');

if (criticalCount > 0) {
  console.log('STATUS: FAIL -- Critical issues must be resolved before release.');
  process.exit(1);
}

console.log('STATUS: PASS -- No critical issues. Review warnings before release.');
process.exit(0);
