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

// Update host — R2 public URL. Must match build.publish.url in electron/package.json.
const PUBLIC_URL  = (process.env.R2_PUBLIC_URL || 'https://pub-c4010f9528c14cbd9848f2c9c7c2306d.r2.dev').replace(/\/$/, '');

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

// ── Upload engine (S3-compatible, multipart-capable) ──────────────────────────

const https  = require('https');
const crypto = require('crypto');

const R2_HOST = `${BUCKET}.${ACCOUNT_ID}.r2.cloudflarestorage.com`;

// Files larger than this threshold are uploaded via S3 multipart.
// Each part is PART_SIZE bytes — a short enough request to survive slow hotspot
// connections without R2 resetting the TCP socket.
const MULTIPART_THRESHOLD = 20 * 1024 * 1024;  //  20 MB
const PART_SIZE           = 10 * 1024 * 1024;  //  10 MB per part

function hmacBuf(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}
function hmacHex(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}
function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getContentType(filename) {
  if (filename.endsWith('.yml'))      return 'text/plain; charset=utf-8';
  if (filename.endsWith('.exe'))      return 'application/octet-stream';
  if (filename.endsWith('.blockmap')) return 'application/octet-stream';
  if (filename.endsWith('.json'))     return 'application/json';
  return 'application/octet-stream';
}

/**
 * Build an AWS Signature V4 Authorization header.
 * Works for any HTTP method, query string, and body.
 */
function sigV4Auth(method, key, queryString, extraHeaders, bodyHash) {
  const now       = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const region    = 'auto';
  const service   = 's3';

  const headers = {
    host:                  R2_HOST,
    'x-amz-date':          amzDate,
    'x-amz-content-sha256': bodyHash,
    ...extraHeaders,
  };

  const signedHeaders    = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort()
    .map(k => `${k}:${headers[k]}\n`).join('');
  const canonicalUri     = `/${encodeURIComponent(key)}`;
  const canonicalRequest = [
    method, canonicalUri, queryString,
    canonicalHeaders, signedHeaders, bodyHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest),
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

  // Return all headers the caller should send (minus 'host' which Node handles)
  const reqHeaders = {
    'x-amz-date':          headers['x-amz-date'],
    'x-amz-content-sha256': bodyHash,
    ...extraHeaders,
    authorization,
  };
  return reqHeaders;
}

/**
 * Generic HTTPS request against R2 bucket.
 * Returns { statusCode, headers, body }.
 */
function r2Request(method, key, queryString, reqHeaders, body) {
  return new Promise((resolve, reject) => {
    const path = `/${encodeURIComponent(key)}${queryString ? '?' + queryString : ''}`;
    const options = {
      hostname: R2_HOST,
      path,
      method,
      headers:  reqHeaders,
      timeout:  5 * 60 * 1000, // 5-minute timeout per individual request
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers:    res.headers,
        body:       Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Single-PUT upload (used for small files < MULTIPART_THRESHOLD) ─────────

function uploadSinglePut(artifact, totalBytes, totalMB, startTime) {
  return new Promise((resolve, reject) => {
    const bodyBuf  = fs.readFileSync(artifact.localPath);
    const bodyHash = sha256hex(bodyBuf);
    const isManifest   = artifact.name.endsWith('.yml');
    const cacheControl = isManifest
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable';

    const extraHeaders = {
      'content-type':   getContentType(artifact.name),
      'content-length': String(totalBytes),
      'cache-control':  cacheControl,
    };
    const signed = sigV4Auth('PUT', artifact.name, '', extraHeaders, bodyHash);

    const options = {
      hostname: R2_HOST,
      path:     `/${encodeURIComponent(artifact.name)}`,
      method:   'PUT',
      headers:  signed,
      timeout:  5 * 60 * 1000,
    };
    const req = https.request(options, res => {
      let rb = '';
      res.on('data', d => { rb += d; });
      res.on('end', () => {
        process.stdout.write('\n');
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`PUT failed (${res.statusCode}): ${rb}`));
      });
    });
    req.on('timeout', () => req.destroy(new Error('PUT timed out')));
    req.on('error', err => { process.stdout.write('\n'); reject(err); });

    // Stream body in 512 KB writes with progress
    let sent = 0;
    let offset = 0;
    const WRITE_CHUNK = 512 * 1024;
    function write() {
      if (offset >= totalBytes) { req.end(); return; }
      const slice = bodyBuf.slice(offset, offset + WRITE_CHUNK);
      offset += slice.length;
      sent   += slice.length;
      const pct    = ((sent / totalBytes) * 100).toFixed(1);
      const mbSent = (sent / 1024 / 1024).toFixed(1);
      const secs   = (Date.now() - startTime) / 1000;
      const speed  = secs > 0 ? (sent / 1024 / 1024 / secs).toFixed(1) : '-';
      const bar    = '█'.repeat(Math.floor(sent/totalBytes*20)) + '░'.repeat(20-Math.floor(sent/totalBytes*20));
      process.stdout.write(`\r    [${bar}] ${pct}%  ${mbSent}/${totalMB} MB  ${speed} MB/s  `);
      const ok = req.write(slice);
      if (ok) setImmediate(write);
      else req.once('drain', write);
    }
    write();
  });
}

// ── S3 Multipart upload (used for large files >= MULTIPART_THRESHOLD) ──────
//
// R2 fully supports the S3 multipart upload API.
// Each part is an independent HTTPS request, so a slow hotspot can never cause
// a full-file ECONNRESET — the worst that happens is one 10 MB part retries.

async function initiateMultipartUpload(key, contentType, cacheControl) {
  const bodyHash = sha256hex('');
  const extraHeaders = {
    'content-type':  contentType,
    'cache-control': cacheControl,
    'content-length': '0',
  };
  const signed = sigV4Auth('POST', key, 'uploads', extraHeaders, bodyHash);
  const res = await r2Request('POST', key, 'uploads', signed, null);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`CreateMultipartUpload failed (${res.statusCode}): ${res.body}`);
  }
  const match = res.body.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!match) throw new Error(`No UploadId in response: ${res.body}`);
  return match[1];
}

async function uploadPart(key, uploadId, partNumber, chunk) {
  const bodyHash = sha256hex(chunk);
  const qs = `partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`;
  const extraHeaders = {
    'content-length': String(chunk.length),
    'content-type':   'application/octet-stream',
  };
  const signed = sigV4Auth('PUT', key, qs, extraHeaders, bodyHash);
  const res = await r2Request('PUT', key, qs, signed, chunk);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`UploadPart ${partNumber} failed (${res.statusCode}): ${res.body}`);
  }
  const etag = res.headers.etag || res.headers['etag'];
  if (!etag) throw new Error(`No ETag in UploadPart ${partNumber} response`);
  return etag.replace(/"/g, '');
}

async function completeMultipartUpload(key, uploadId, parts) {
  const xmlParts = parts.map(({ partNumber, etag }) =>
    `<Part><PartNumber>${partNumber}</PartNumber><ETag>${etag}</ETag></Part>`
  ).join('');
  const xmlBody = `<CompleteMultipartUpload>${xmlParts}</CompleteMultipartUpload>`;
  const bodyBuf  = Buffer.from(xmlBody, 'utf8');
  const bodyHash = sha256hex(bodyBuf);
  const qs = `uploadId=${encodeURIComponent(uploadId)}`;
  const extraHeaders = {
    'content-type':   'application/xml',
    'content-length': String(bodyBuf.length),
  };
  const signed = sigV4Auth('POST', key, qs, extraHeaders, bodyHash);
  const res = await r2Request('POST', key, qs, signed, bodyBuf);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`CompleteMultipartUpload failed (${res.statusCode}): ${res.body}`);
  }
}

async function abortMultipartUpload(key, uploadId) {
  const bodyHash = sha256hex('');
  const qs = `uploadId=${encodeURIComponent(uploadId)}`;
  const signed = sigV4Auth('DELETE', key, qs, { 'content-length': '0' }, bodyHash);
  await r2Request('DELETE', key, qs, signed, null).catch(() => {});
}

async function uploadMultipart(artifact, totalBytes, totalMB, startTime) {
  const isManifest   = artifact.name.endsWith('.yml');
  const cacheControl = isManifest
    ? 'no-cache, no-store, must-revalidate'
    : 'public, max-age=31536000, immutable';
  const contentType  = getContentType(artifact.name);

  const numParts = Math.ceil(totalBytes / PART_SIZE);
  process.stdout.write(`    (multipart: ${numParts} parts × ${(PART_SIZE/1024/1024).toFixed(0)} MB each)\n`);

  const uploadId = await initiateMultipartUpload(artifact.name, contentType, cacheControl);
  const parts    = [];
  let   bytesDone = 0;

  const fd = fs.openSync(artifact.localPath, 'r');
  try {
    for (let i = 1; i <= numParts; i++) {
      const offset = (i - 1) * PART_SIZE;
      const len    = Math.min(PART_SIZE, totalBytes - offset);
      const chunk  = Buffer.alloc(len);
      fs.readSync(fd, chunk, 0, len, offset);

      // Per-part retry (up to 4 attempts) so a hotspot blip only retries 10 MB
      let etag;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          process.stdout.write(`\r    Part ${i}/${numParts}  [uploading...]  `);
          etag = await uploadPart(artifact.name, uploadId, i, chunk);
          break;
        } catch (err) {
          if (!isRetryable(err) || attempt === 4) throw err;
          const wait = attempt * 5;
          process.stdout.write(`\r    Part ${i}/${numParts}  [retry in ${wait}s: ${err.message}]  `);
          await sleep(wait * 1000);
        }
      }

      bytesDone += len;
      parts.push({ partNumber: i, etag });

      const pct    = ((bytesDone / totalBytes) * 100).toFixed(1);
      const mbDone = (bytesDone / 1024 / 1024).toFixed(1);
      const secs   = (Date.now() - startTime) / 1000;
      const speed  = secs > 0 ? (bytesDone / 1024 / 1024 / secs).toFixed(1) : '-';
      const bar    = '█'.repeat(Math.floor(bytesDone/totalBytes*20)) + '░'.repeat(20-Math.floor(bytesDone/totalBytes*20));
      process.stdout.write(`\r    [${bar}] ${pct}%  ${mbDone}/${totalMB} MB  ${speed} MB/s  `);
    }
    fs.closeSync(fd);
  } catch (err) {
    fs.closeSync(fd);
    await abortMultipartUpload(artifact.name, uploadId);
    throw err;
  }

  process.stdout.write('\n    Completing upload... ');
  await completeMultipartUpload(artifact.name, uploadId, parts);
  process.stdout.write('done\n');
}

/**
 * Upload a single artifact.
 * Routes to multipart (large files) or single PUT (small files) automatically.
 */
async function uploadFile(artifact) {
  const totalBytes = fs.statSync(artifact.localPath).size;
  const totalMB    = (totalBytes / 1024 / 1024).toFixed(1);
  const startTime  = Date.now();

  if (totalBytes >= MULTIPART_THRESHOLD) {
    await uploadMultipart(artifact, totalBytes, totalMB, startTime);
  } else {
    await uploadSinglePut(artifact, totalBytes, totalMB, startTime);
  }
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
      timeout:  15000,
    };
    const req = https.request(options, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
        resolve(headRequest(res.headers.location, redirectsLeft - 1));
        return;
      }
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      const contentLength = res.headers['content-length'] != null
        ? Number(res.headers['content-length'])
        : null;
      resolve({ ok, status: res.statusCode, url, contentLength });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', err => resolve({ ok: false, status: null, url, contentLength: null, error: err.message }));
    req.end();
  });
}

// ── Upload sequence ───────────────────────────────────────────────────────────
// Order: installer → blockmap → stable.yml → latest.yml (metadata last)
// latest.yml MUST be uploaded last: if it goes live before the installer,
// clients will see a broken update where the binary is unreachable.

// Errors that are safe to retry (transient network issues)
const RETRYABLE = new Set([
  'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND',
  'ECONNREFUSED', 'socket hang up',
]);

function isRetryable(err) {
  if (!err) return false;
  const msg  = String(err.message || '');
  const code = String(err.code    || '');
  return RETRYABLE.has(code) || [...RETRYABLE].some(k => msg.includes(k));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Upload a single artifact with automatic retry.
 * - Retries up to MAX_ATTEMPTS times on transient network errors.
 * - Non-retryable errors (auth, bad request) fail immediately.
 * - latest.yml is always re-uploaded; other files are skipped if R2 already
 *   has the exact same size (allows re-running the script after a partial failure
 *   without re-uploading the 110 MB installer from scratch).
 */
async function uploadWithRetry(artifact, alwaysUpload = false) {
  const MAX_ATTEMPTS = 4;
  const localSize    = fs.statSync(artifact.localPath).size;
  const sizeMB       = (localSize / 1024 / 1024).toFixed(1);

  // Pre-flight: check R2 for an existing object of the same size.
  // latest.yml is always re-uploaded (must reflect the current build).
  if (!alwaysUpload && !artifact.name.endsWith('.yml')) {
    const publicUrl = `${PUBLIC_URL}/${encodeURIComponent(artifact.name)}`;
    const check = await headRequest(publicUrl);
    if (check.ok) {
      // R2 returns Content-Length for objects in the bucket
      // We compare by size — same version build produces identical bytes
      const remoteSize = check.contentLength;
      if (remoteSize !== null && Number(remoteSize) === localSize) {
        console.log(`  ↷ ${artifact.name}  (${sizeMB} MB) — already on R2 at same size, skipping`);
        return;
      }
    }
  }

  console.log(`  Uploading ${artifact.name}  (${sizeMB} MB)`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await uploadFile(artifact);
      console.log(`  ✓ ${artifact.name} uploaded`);
      return;
    } catch (err) {
      const retriable = isRetryable(err);
      if (!retriable || attempt === MAX_ATTEMPTS) {
        process.stdout.write('\n');
        console.error(`  ✗ FAILED: ${err.message}`);
        if (!retriable) console.error('  (non-retryable error — check credentials and bucket access)');
        process.exit(1);
      }
      const wait = attempt * 8; // 8s, 16s, 24s between attempts
      process.stdout.write('\n');
      console.log(`  ↺ Connection dropped (${err.message}) — retrying in ${wait}s (attempt ${attempt + 1}/${MAX_ATTEMPTS}) ...`);
      await sleep(wait * 1000);
      console.log(`  Uploading ${artifact.name}  (${sizeMB} MB) — attempt ${attempt + 1}`);
    }
  }
}

(async () => {
  const sorted = [
    ...artifacts.filter(a => a.name.endsWith('.exe') && !a.name.endsWith('.blockmap')),
    ...artifacts.filter(a => a.name.endsWith('.blockmap')),
    ...artifacts.filter(a => a.name === 'stable.yml'),
    ...artifacts.filter(a => a.name === 'latest.yml'),
  ];

  for (const artifact of sorted) {
    // latest.yml is always re-uploaded to ensure it reflects this build
    await uploadWithRetry(artifact, artifact.name === 'latest.yml');
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
  try {
    await uploadWithRetry({ name: 'release-info.json', localPath: releaseInfoPath }, true);
  } catch {
    // Non-fatal — updater does not depend on this file; uploadWithRetry already logged
  }

  console.log('\nAll files live and reachable.');
  console.log('\nPublic URLs:');
  for (const a of [...sorted, { name: 'release-info.json' }]) {
    console.log(`  ${PUBLIC_URL}/${encodeURIComponent(a.name)}`);
  }
  console.log('\nDone.\n');
})();
