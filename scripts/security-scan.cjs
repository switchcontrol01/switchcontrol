/**
 * security-scan.cjs
 *
 * Scans build output for accidentally bundled secrets (API keys, JWTs,
 * connection strings, .env content).
 *
 * Exit codes:
 *   0 — no secrets detected
 *   1 — one or more possible secrets detected (safe to use as a pre-deploy gate)
 *
 * Run: node scripts/security-scan.cjs
 */

const fs = require("fs");
const path = require("path");

const scanTargets = [
  "dist",
  "electron/dist"
];

const patterns = [
  // OpenAI API keys — classic (sk-...) and project-scoped (sk-proj-...) formats.
  // The underscore and hyphen variants were added in newer key generations.
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
  // JWT / base64 tokens starting with the most common {"alg": header.
  // NOTE: may produce false positives on minified bundles containing public-key
  // material or example tokens embedded by libraries. Review manually.
  /eyJhbGciOi[A-Za-z0-9_-]{20,}/,
  // PostgreSQL and MySQL connection strings with embedded credentials.
  /postgres(?:ql)?:\/\/\w+:\w+@[\w.-]+:\d+\/\w+/,
  /mysql:\/\/\w+:\w+@[\w.-]+/,
  // MongoDB connection strings with embedded credentials.
  /mongodb(?:\+srv)?:\/\/\w+:\w+@[\w.-]+/,
  // .env-style KEY=VALUE assignments that look like real secrets (long values only,
  // avoids flagging short test values like FOO=bar).
  /^(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|DATABASE_URL)\s*=\s*.{20,}/m,
];

const patternLabels = [
  "OpenAI API key (sk-... or sk-proj-...)",
  "JWT/base64 token (eyJ...)",
  "PostgreSQL/MySQL connection string with credentials",
  "MongoDB connection string with credentials",
  ".env-style secret assignment",
];

// Binary or non-text extensions that should never contain text secrets.
// ASAR archives need `asar extract` before scanning — exclude them here.
const SKIP_EXTENSIONS = /\.(map|png|jpg|jpeg|ico|woff2?|ttf|eot|svg|asar|wasm|bin|dat|db|node|exe|dll|so|dylib|zip|gz|tar|br|brotli)$/i;

let found = false;

function scanDir(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Skipping ${dir} (not found)`);
    return;
  }

  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    console.warn(`Cannot read directory ${dir}: ${e.message}`);
    return;
  }

  for (const file of entries) {
    const full = path.join(dir, file);

    // Use lstatSync so broken symlinks (pointing to missing targets) don't throw.
    let stat;
    try {
      stat = fs.lstatSync(full);
    } catch (e) {
      console.warn(`Cannot stat ${full}: ${e.message}`);
      continue;
    }

    // Skip symlinks — following them risks infinite loops and out-of-tree reads.
    if (stat.isSymbolicLink()) continue;

    if (stat.isDirectory()) {
      scanDir(full);
      continue;
    }

    if (SKIP_EXTENSIONS.test(file)) continue;

    // Binary files (e.g. .wasm slipping through, native addons, corrupted files)
    // will throw on UTF-8 parse. Skip them rather than crashing the whole scan.
    let data;
    try {
      data = fs.readFileSync(full, "utf8");
    } catch {
      // Not a readable UTF-8 file — skip silently.
      continue;
    }

    // All patterns are checked even after the first match so every secret type
    // is reported. This can produce multiple warnings for the same file.
    for (let i = 0; i < patterns.length; i++) {
      if (patterns[i].test(data)) {
        console.warn(`Possible secret found: ${full} (${patternLabels[i]})`);
        found = true;
      }
    }
  }
}

scanTargets.forEach(scanDir);

if (found) {
  console.error("\nSecurity scan FAILED: possible secrets detected in build output.");
  process.exit(1);
} else {
  console.log("Security scan complete. No secrets found.");
  // Exits with 0 implicitly.
}
