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
const PUBLIC_URL  = 'https://releases.switchcontrol.org';

if (!ACCOUNT_ID || !KEY_ID || !KEY_SECRET) {
  console.error(`
ERROR: Missing R2 credentials.
Set these in electron/.env or your shell environment:

  R2_ACCOUNT_ID=your_cloudflare_account_id
  R2_ACCESS_KEY_ID=your_r2_key_id
  R2_SECRET_ACCESS_KEY=your_r2_key_secret
  R2_BUCKET=switchcontrol-releases   (optional, this is the default)
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

function hmac(key, data, encoding) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest(encoding || 'hex');
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

    const canonicalRequest = [
      'PUT',
      `/${key}`,
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

    // Signing key
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${KEY_SECRET}`, dateStamp), region), service),
      'aws4_request',
      null
    );
    const signature = hmac(signingKey, stringToSign);

    const authorization = [
      `AWS4-HMAC-SHA256 Credential=${KEY_ID}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    const reqHeaders = { ...headers, authorization };
    delete reqHeaders.host;

    const options = {
      hostname: host,
      path:     `/${key}`,
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

// ── Run uploads sequentially ──────────────────────────────────────────────────

(async () => {
  // Upload installer + blockmap first, latest.yml last
  // (so the metadata only goes live once binaries are available)
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

  console.log('\nPublic URLs:');
  for (const a of artifacts) {
    console.log(`  ${PUBLIC_URL}/${a.name}`);
  }

  console.log('\nVerify latest.yml is live:');
  console.log(`  curl -I ${PUBLIC_URL}/latest.yml`);
  console.log('\nDone.\n');
})();
