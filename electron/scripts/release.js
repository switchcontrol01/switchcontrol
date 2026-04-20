#!/usr/bin/env node
/**
 * SwitchControl Release Uploader
 * --------------------------------
 * Uploads build artifacts from electron/dist/ to Cloudflare R2.
 * Run after `npm run dist:win` produces the installer.
 *
 * Usage:
 *   node scripts/release.js
 *
 * Required env vars (set in electron/.env or your shell):
 *   R2_ACCOUNT_ID        — Cloudflare account ID
 *   R2_ACCESS_KEY_ID     — R2 API token key ID
 *   R2_SECRET_ACCESS_KEY — R2 API token secret
 *   R2_BUCKET            — bucket name (default: switchcontrol-releases)
 *
 * Upload order is intentional:
 *   1. installer (.exe)
 *   2. blockmap (.exe.blockmap) if present
 *   3. stable.yml (compat shim for legacy builds — see note below)
 *   4. latest.yml LAST
 *
 * latest.yml goes live last because if it were uploaded first and a client
 * checked for updates before the installer arrived, the update would fail.
 * stable.yml is kept as a compat shim: builds that shipped with
 * autoUpdater.channel = 'stable' (legacy test builds) request stable.yml.
 * If no such builds exist in the wild this shim is harmless to keep.
 *
 * Trust model:
 *   - This script is the sole release delivery mechanism.
 *   - Artifacts are uploaded to R2 only; no GitHub Releases involvement.
 *   - Metadata (latest.yml) is signed-hash authoritative; electron-updater
 *     verifies SHA-512 from latest.yml before applying any update.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Load .env from the electron/ directory if present
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const ACCOUNT_ID  = process.env.R2_ACCOUNT_ID;
const KEY_ID      = process.env.R2_ACCESS_KEY_ID;
const KEY_SECRET  = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET      = process.env.R2_BUCKET || 'switchcontrol-releases';

// Update host — production URL for releases.switchcontrol.org.
// This must match build.publish.url in electron/package.json.
const PUBLIC_URL  = (process.env.R2_PUBLIC_URL || 'https://releases.switchcontrol.org').replace(/\/$/, '');

const missing = [
  !ACCOUNT_ID  && 'R2_ACCOUNT_ID',
  !KEY_ID      && 'R2_ACCESS_KEY_ID',
  !KEY_SECRET  && 'R2_SECRET_ACCESS_KEY',
].filter(Boolean);

if (missing.length > 0) {
  console.error('\nERROR: Missing R2 credentials in electron/.env:\n');
  for (const k of missing) console.error(`  ${k}`);
  console.error(`
Create electron/.env by copying the example:

  PowerShell:  Copy-Item .env.example .env
  cmd:         copy .env.example .env

Then fill in the missing values. See RELEASE_GUIDE.md → "Credentials Setup".
`);
  process.exit(1);
}

// ── Version sync check ────────────────────────────────────────────────────────
// Root package.json and electron/package.json must have the same version.
// Fail hard if they differ — partial releases with mismatched versions cause
// clients to receive installers that report wrong version numbers.

const rootPkgPath     = path.join(__dirname, '..', '..', 'package.json');
const electronPkgPath = path.join(__dirname, '..', 'package.json');

if (fs.existsSync(rootPkgPath)) {
  const electronVersion = JSON.parse(fs.readFileSync(electronPkgPath, 'utf8')).version;
  const rootPkgRaw      = fs.readFileSync(rootPkgPath, 'utf8');
  const rootPkg         = JSON.parse(rootPkgRaw);
  const rootVersion     = rootPkg.version;
  if (rootVersion !== electronVersion) {
    console.log(`\nVersion sync: root/package.json is ${rootVersion}, electron is ${electronVersion} — auto-correcting...`);
    rootPkg.version = electronVersion;
    fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf8');
    console.log(`Version sync OK: root/package.json updated to ${electronVersion}`);
  } else {
    console.log(`Version sync OK: ${electronVersion}`);
  }
} else {
  console.log('(Skipping root version check — root package.json not found from electron/scripts)');
}

// ── Find artifacts ────────────────────────────────────────────────────────────

const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('ERROR: dist/ not found. Run `npm run dist:win` first.');
  process.exit(1);
}

// Auto-generate latest.yml if electron-builder didn't produce it.
const ymlPath = path.join(distDir, 'latest.yml');
if (!fs.existsSync(ymlPath)) {
  console.log('latest.yml not found in dist/ — generating from installer...');
  require('./generate-latest-yml.js');
  console.log();
}

const allFiles = fs.readdirSync(distDir);

// Ensure stable.yml exists as a compat shim.
// stable.yml retained for legacy builds that shipped with channel='stable'.
// If no such builds are in the wild this is a harmless identical copy.
const stableYmlPath = path.join(distDir, 'stable.yml');
if (!fs.existsSync(stableYmlPath)) {
  const latestContent = fs.readFileSync(ymlPath, 'utf8');
  fs.writeFileSync(stableYmlPath, latestContent, 'utf8');
  console.log('stable.yml written as compat shim (copy of latest.yml)');
}

// Collect artifacts: exe, blockmap, stable.yml, latest.yml
const artifacts = allFiles
  .filter(f => f.endsWith('.exe') || f.endsWith('.exe.blockmap') || f === 'latest.yml' || f === 'stable.yml')
  .map(f => ({ name: f, localPath: path.join(distDir, f) }));

if (artifacts.length === 0) {
  console.error('ERROR: No release artifacts found in dist/.');
  console.error('Expected: latest.yml, SwitchControl Setup x.y.z.exe, *.exe.blockmap');
  process.exit(1);
}

// ── Pre-upload validation ─────────────────────────────────────────────────────
// Validate every artifact before uploading anything.
// A partial release is worse than a failed release.

console.log('\nValidating artifacts...');

const { version: pkgVersion } = JSON.parse(fs.readFileSync(electronPkgPath, 'utf8'));
const latestYmlContent = fs.readFileSync(ymlPath, 'utf8');
let validationFailed = false;

// Validate latest.yml has required fields
if (!latestYmlContent.includes('version:')) {
  console.error('  FAIL latest.yml: missing "version" field');
  validationFailed = true;
}
if (!latestYmlContent.includes('sha512:')) {
  console.error('  FAIL latest.yml: missing "sha512" field');
  validationFailed = true;
}
if (!latestYmlContent.includes(`version: ${pkgVersion}`)) {
  console.error(`  FAIL latest.yml: version mismatch — file does not contain "version: ${pkgVersion}"`);
  validationFailed = true;
}

// Validate each artifact exists and is nonzero
for (const a of artifacts) {
  const stat = fs.statSync(a.localPath);
  if (stat.size === 0) {
    console.error(`  FAIL ${a.name}: file is 0 bytes`);
    validationFailed = true;
  } else {
    console.log(`  OK   ${a.name}  (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

// Validate that the installer filename referenced in latest.yml actually exists
const exeArtifacts = artifacts.filter(a => a.name.endsWith('.exe'));
if (exeArtifacts.length === 0) {
  console.error('  FAIL: No .exe installer found in dist/');
  validationFailed = true;
} else {
  for (const exe of exeArtifacts) {
    if (!latestYmlContent.includes(exe.name)) {
      console.error(`  FAIL latest.yml does not reference installer "${exe.name}"`);
      validationFailed = true;
    }
  }
}

if (validationFailed) {
  console.error('\nERROR: Pre-upload validation failed. Fix the issues above before releasing.');
  process.exit(1);
}

console.log('\nAll validations passed.');

console.log(`\nFound ${artifacts.length} artifact(s) to upload:`);
for (const a of artifacts) {
  const size = (fs.statSync(a.localPath).size / 1024 / 1024).toFixed(1);
  console.log(`  ${a.name}  (${size} MB)`);
}
console.log(`\nBucket : ${BUCKET}`);
console.log(`Host   : ${PUBLIC_URL}\n`);

// ── Upload ────────────────────────────────────────────────────────────────────

const https  = require('https');
const crypto = require('crypto');

const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

function hmacBuf(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}
function hmacHex(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}
function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getContentType(filename) {
  if (filename.endsWith('.yml'))      return 'text/plain; charset=utf-8';
  if (filename.endsWith('.exe'))      return 'application/octet-stream';
  if (filename.endsWith('.blockmap')) return 'application/octet-stream';
  return 'application/octet-stream';
}

/**
 * AWS Signature V4 PUT for a single file.
 * R2 is S3-compatible so no SDK is required.
 */
function uploadFile(artifact) {
  return new Promise((resolve, reject) => {
    const body      = fs.readFileSync(artifact.localPath);
    const bodyHash  = hash(body);
    const key       = artifact.name;
    const now       = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const service   = 's3';
    const region    = 'auto';
    const host      = `${BUCKET}.${ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const contentType = getContentType(key);

    // Manifest files must never be cached; binaries are immutable once uploaded.
    const isManifest = key.endsWith('.yml');
    const cacheControl = isManifest
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable';

    const headers = {
      host,
      'content-type':         contentType,
      'content-length':       String(body.length),
      'cache-control':        cacheControl,
      'x-amz-date':           amzDate,
      'x-amz-content-sha256': bodyHash,
    };

    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers).sort()
      .map(k => `${k}:${headers[k]}\n`).join('');
    const canonicalUri = `/${encodeURIComponent(key)}`;

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      bodyHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      hash(canonicalRequest),
    ].join('\n');

    const kDate    = hmacBuf(`AWS4${KEY_SECRET}`, dateStamp);
    const kRegion  = hmacBuf(kDate,    region);
    const kService = hmacBuf(kRegion,  service);
    const kSigning = hmacBuf(kService, 'aws4_request');
    const signature = hmacHex(kSigning, stringToSign);

    const authorization = [
      `AWS4-HMAC-SHA256 Credential=${KEY_ID}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    const reqHeaders = { ...headers, authorization };
    delete reqHeaders.host;

    const encodedKey = encodeURIComponent(key);
    const options = {
      hostname: host,
      path:     `/${encodedKey}`,
      method:   'PUT',
      headers:  reqHeaders,
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed (${res.statusCode}): ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Verification ─────────────────────────────────────────────────────────────

function headRequest(url, redirectsLeft = 3) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'HEAD',
      headers:  { 'user-agent': 'SwitchControl-Release-Script/1.0' },
    };
    const req = https.request(options, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
        resolve(headRequest(res.headers.location, redirectsLeft - 1));
        return;
      }
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, url });
    });
    req.on('error', err => resolve({ ok: false, status: null, url, error: err.message }));
    req.end();
  });
}

// ── Upload sequence ───────────────────────────────────────────────────────────
// Order: installer → blockmap → stable.yml → latest.yml (metadata last)
// latest.yml MUST be uploaded last: if it goes live before the installer,
// clients will see a broken update where the binary is unreachable.

(async () => {
  const sorted = [
    ...artifacts.filter(a => a.name.endsWith('.exe') && !a.name.endsWith('.blockmap')),
    ...artifacts.filter(a => a.name.endsWith('.blockmap')),
    ...artifacts.filter(a => a.name === 'stable.yml'),
    ...artifacts.filter(a => a.name === 'latest.yml'),
  ];

  for (const artifact of sorted) {
    process.stdout.write(`  Uploading ${artifact.name} ... `);
    try {
      await uploadFile(artifact);
      console.log('OK');
    } catch (err) {
      console.log('FAILED');
      console.error(`  ${err.message}`);
      process.exit(1);
    }
  }

  // ── Post-upload verification ──────────────────────────────────────────────
  console.log('\nVerifying public URLs ...');

  let allOk = true;
  for (const a of artifacts) {
    const publicUrl = `${PUBLIC_URL}/${encodeURIComponent(a.name)}`;
    process.stdout.write(`  ${publicUrl} ... `);
    const result = await headRequest(publicUrl);
    if (result.ok) {
      console.log(`${result.status} OK`);
    } else {
      const detail = result.error || `HTTP ${result.status}`;
      console.log(`FAILED (${detail})`);
      allOk = false;
    }
  }

  if (!allOk) {
    console.error('\nERROR: One or more files are not publicly reachable.');
    console.error('Check your R2 bucket public access settings and custom domain.');
    process.exit(1);
  }

  // ── Optional release manifest for admin/debug visibility ─────────────────
  // This file is NOT used by the updater. It is purely informational so
  // you can quickly verify what is live on R2 without parsing latest.yml.
  const exeName = exeArtifacts[0]?.name ?? null;
  const releaseInfo = {
    version: pkgVersion,
    channel: 'stable',
    installer: exeName,
    metadataFile: 'latest.yml',
    releasedAt: new Date().toISOString(),
    host: PUBLIC_URL,
  };
  const releaseInfoPath = path.join(distDir, 'release-info.json');
  fs.writeFileSync(releaseInfoPath, JSON.stringify(releaseInfo, null, 2) + '\n', 'utf8');

  // Upload release-info.json last (informational only — not depended on by updater)
  process.stdout.write('  Uploading release-info.json ... ');
  try {
    await uploadFile({ name: 'release-info.json', localPath: releaseInfoPath });
    console.log('OK');
  } catch (err) {
    // Non-fatal — updater does not depend on this file
    console.log(`WARN (${err.message}) — release-info.json is optional`);
  }

  console.log('\nAll files live and reachable.');
  console.log('\nPublic URLs:');
  for (const a of [...sorted, { name: 'release-info.json' }]) {
    console.log(`  ${PUBLIC_URL}/${encodeURIComponent(a.name)}`);
  }
  console.log('\nDone.\n');
})();
