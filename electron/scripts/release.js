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

// ── Update host (temporary R2 dev URL — switch back by updating R2_PUBLIC_URL) ──
// When releases.switchcontrol.org is ready, set in electron/.env:
//   R2_PUBLIC_URL=https://releases.switchcontrol.org
// and update build.publish.url in electron/package.json to match.
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

Then fill in the missing values. See RELEASE_GUIDE.md → "Credentials Setup" for where to find each value in Cloudflare.
`);
  process.exit(1);
}

// ── Find artifacts ────────────────────────────────────────────────────────────

const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('ERROR: dist/ not found. Run `npm run dist:win` first.');
  process.exit(1);
}

const allFiles = fs.readdirSync(distDir);

const artifacts = allFiles
  .filter(f => f === 'latest.yml' || f.endsWith('.exe') || f.endsWith('.exe.blockmap'))
  .map(f => ({ name: f, localPath: path.join(distDir, f) }));

if (artifacts.length === 0) {
  console.error('ERROR: No release artifacts found in dist/.');
  console.error('Expected: latest.yml, SwitchControl Setup x.y.z.exe, *.exe.blockmap');
  process.exit(1);
}

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

// Raw bytes — required for intermediate steps in AWS SigV4 key derivation.
// Each step's output Buffer is used as the key for the next step.
function hmacBuf(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}
// Hex string — used only for the final signature output.
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
 * R2 is fully S3-compatible so this works without any SDK.
 */
function uploadFile(artifact) {
  return new Promise((resolve, reject) => {
    const body      = fs.readFileSync(artifact.localPath);
    const bodyHash  = hash(body);
    const key       = artifact.name;
    const now       = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');   // YYYYMMDD
    const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');    // YYYYMMDDTHHmmssZ
    const service   = 's3';
    const region    = 'auto';
    const host      = `${BUCKET}.${ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const contentType = getContentType(key);

    // Cache-Control: latest.yml must always be fresh; binaries can be cached
    const cacheControl = key === 'latest.yml'
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable';

    const headers = {
      host,
      'content-type':     contentType,
      'content-length':   String(body.length),
      'cache-control':    cacheControl,
      'x-amz-date':       amzDate,
      'x-amz-content-sha256': bodyHash,
    };

    // Canonical request
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers).sort()
      .map(k => `${k}:${headers[k]}\n`).join('');

    // Canonical URI must use the same percent-encoded path as the actual request
    const canonicalUri = `/${encodeURIComponent(key)}`;

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      bodyHash,
    ].join('\n');

    // String to sign
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      hash(canonicalRequest),
    ].join('\n');

    // Signing key — each step must receive raw Buffer bytes, not a hex string.
    // Using hex strings as intermediate keys produces the wrong HMAC (SignatureDoesNotMatch).
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

    // URL-encode the key so filenames with spaces ("SwitchControl Setup x.y.z.exe")
    // are sent correctly over the wire.  encodeURIComponent covers spaces → %20
    // and leaves dots/digits untouched, which is exactly what R2/S3 expect.
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

/**
 * HEAD request to a public URL.  Returns { ok, status, url }.
 * Follows up to 3 redirects automatically.
 */
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

// ── Run uploads sequentially, then verify ────────────────────────────────────

(async () => {
  // Upload installer + blockmap first, latest.yml last
  // (metadata only goes live once binaries are available)
  const sorted = [
    ...artifacts.filter(a => a.name !== 'latest.yml'),
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
    // URL-encode the filename so spaces → %20 in the printed/verified URL
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

  console.log('\nAll files live and reachable.');
  console.log('\nPublic URLs:');
  for (const a of artifacts) {
    console.log(`  ${PUBLIC_URL}/${encodeURIComponent(a.name)}`);
  }
  console.log('\nDone.\n');
})();
