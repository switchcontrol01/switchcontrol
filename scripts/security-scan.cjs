const fs = require("fs");
const path = require("path");

const scanTargets = [
  "dist",
  "electron/dist"
];

const patterns = [
  /sk-[A-Za-z0-9]{20,}/,
  /eyJhbGciOi[A-Za-z0-9_-]{20,}/,
  /postgres(ql)?:\/\/\w+:\w+@[\w.-]+:\d+\/\w+/,
  /mongodb(\+srv)?:\/\/\w+:\w+@[\w.-]+/,
];

const patternLabels = [
  "OpenAI API key (sk-...)",
  "JWT/base64 token (eyJ...)",
  "PostgreSQL connection string with credentials",
  "MongoDB connection string with credentials",
];

let found = false;

function scanDir(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Skipping ${dir} (not found)`);
    return;
  }

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const full = path.join(dir, file);

    if (fs.statSync(full).isDirectory()) {
      scanDir(full);
      continue;
    }

    if (/\.(map|png|jpg|ico|woff2?|ttf|eot|svg)$/.test(file)) continue;

    const data = fs.readFileSync(full, "utf8");

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
}
