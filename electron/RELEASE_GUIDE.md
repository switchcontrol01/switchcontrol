# SwitchControl Release Guide

## Current Update Host

> **Temporary bridge in effect.**
> Auto-updates are currently served from the Cloudflare R2 public dev URL:
>
> `https://pub-c4010f9528c14cbd9848f2c9c7c2306d.r2.dev`
>
> This is a working production path. The custom domain (`releases.switchcontrol.org`) is on hold
> until DNS control for the domain is sorted out (see [DNS Bridge → Custom Domain](#switching-to-the-custom-domain) below).

The Electron updater checks the configured URL for `latest.yml` on every launch.

---

## Credentials Setup

**Do this once before running `npm run release` for the first time.**

### 1. Create `electron/.env`

```powershell
# PowerShell (from the electron/ directory)
Copy-Item .env.example .env

# cmd
copy .env.example .env
```

### 2. Fill in the values

Open `electron/.env` and paste the values from Cloudflare:

| Variable | Where to find it in Cloudflare |
|---|---|
| `R2_ACCOUNT_ID` | [dash.cloudflare.com](https://dash.cloudflare.com) → top-right account menu → **Account ID** |
| `R2_ACCESS_KEY_ID` | R2 → **Manage R2 API Tokens** → Create token → copy **Access Key ID** |
| `R2_SECRET_ACCESS_KEY` | Same token creation screen → copy **Secret Access Key** (shown once only) |
| `R2_BUCKET` | `switchcontrol-releases` — already set as the default, leave it unless you renamed the bucket |
| `R2_PUBLIC_URL` | Already set to the R2 dev URL in `.env.example` — leave it as-is for now |

The token needs **Object Read & Write** permission scoped to the `switchcontrol-releases` bucket.

### 3. Note on versioning

Current release is **v1.0.1**. `npm run release` uploads whatever
`electron/dist/` contains — it does **not** bump the version automatically. To
cut a new release, bump the version in both `package.json` (root) and
`electron/package.json`, then rebuild on Windows before uploading.

---

## One-time Cloudflare Setup

Do this once. After that, every release is just build → upload.

### 1. Create the R2 bucket

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Go to **R2 Object Storage** in the left sidebar
3. Click **Create bucket**
4. Name it exactly: `switchcontrol-releases`
5. Region: Automatic (closest)
6. Click **Create**

### 2. Enable public access

1. Open the bucket → **Settings** tab
2. Under **Public access** → click **Allow access**
3. Confirm

### 3. Connect the custom domain

1. Inside the bucket → **Settings** → **Custom Domains**
2. Click **Connect Domain**
3. Enter: `releases.switchcontrol.org`
4. Cloudflare will auto-add the DNS record (your domain must be on Cloudflare)
5. Wait for status to show **Active** (usually under a minute)

That's it. `https://releases.switchcontrol.org` now serves the bucket publicly.

### 4. Set Cache Rules for latest.yml

So users always get fresh metadata:

1. Go to your Cloudflare domain → **Rules** → **Cache Rules**
2. Click **Create rule**
3. Name: `No-cache latest.yml`
4. Condition: URI Path equals `/latest.yml`
5. Cache setting: **Bypass cache**
6. Deploy

Installers and blockmaps don't need a rule — they're immutable files.

### 5. Get R2 API credentials

1. In Cloudflare R2 → **Manage R2 API tokens**
2. Click **Create API token**
3. Permissions: **Object Read & Write**
4. Scope: your `switchcontrol-releases` bucket
5. Create and copy the **Access Key ID** and **Secret Access Key**
6. Also copy your **Account ID** from the R2 overview page

### 6. Create your local .env

In the `electron/` folder — pick the command for your shell:

**PowerShell (recommended):**
```powershell
Copy-Item .env.example .env
```

**Command Prompt:**
```cmd
copy .env.example .env
```

Fill in your values:

```
R2_ACCOUNT_ID=abc123...
R2_ACCESS_KEY_ID=your_key_id
R2_SECRET_ACCESS_KEY=your_secret
R2_BUCKET=switchcontrol-releases
```

`.env` is gitignored — never commit it.

---

## Publishing a Release

Every release is three steps: bump → build → upload.

### Step 1 — Bump the version

Edit `electron/package.json`, increment the version:

```json
"version": "1.0.1"
```

Use semver: `1.0.1` for patches, `1.1.0` for features, `2.0.0` for breaking.

### Step 2 — Build the installer (Windows)

```bash
cd electron
npm install          # first time only
npm run dist:win
```

This produces in `electron/dist/`:
- `SwitchControl Setup 1.0.1.exe`
- `SwitchControl Setup 1.0.1.exe.blockmap`
- `latest.yml`

### Step 3 — Upload to R2

```bash
npm run release
```

The script:
- Uploads installer + blockmap first, `latest.yml` last (metadata only goes live once binaries are ready)
- URL-encodes all filenames so spaces in the installer name are handled correctly
- Automatically HEAD-checks every public URL after upload and exits non-zero if anything is unreachable

Output looks like:

```
Found 3 artifact(s) to upload:
  SwitchControl Setup 1.0.1.exe  (94.3 MB)
  SwitchControl Setup 1.0.1.exe.blockmap  (0.1 MB)
  latest.yml  (0.0 MB)

  Uploading SwitchControl Setup 1.0.1.exe ... OK
  Uploading SwitchControl Setup 1.0.1.exe.blockmap ... OK
  Uploading latest.yml ... OK

Verifying public URLs ...
  https://releases.switchcontrol.org/latest.yml ... 200 OK
  https://releases.switchcontrol.org/SwitchControl%20Setup%201.0.1.exe ... 200 OK
  https://releases.switchcontrol.org/SwitchControl%20Setup%201.0.1.exe.blockmap ... 200 OK

All files live and reachable.
```

If any file returns non-200, the script prints `FAILED` and exits with code 1 — it won't silently
leave a broken release in place.

### Step 4 — Manual spot-check (optional)

The script already verifies everything, but if you want to check manually:

```powershell
# latest.yml — always use unencoded (plain text, no spaces)
curl -s https://releases.switchcontrol.org/latest.yml

# installer — quote the URL or use encoded form to handle spaces
curl -I "https://releases.switchcontrol.org/SwitchControl%20Setup%201.0.1.exe"
```

`latest.yml` should return something like:

```yaml
version: 1.0.1
files:
  - url: SwitchControl Setup 1.0.1.exe
    ...
path: SwitchControl Setup 1.0.1.exe
releaseDate: '2026-04-03T...'
```

---

## Verification Checklist

After every release confirm these URLs respond with 200:

`npm run release` checks all three automatically. For manual checks:

| URL | Expected |
|-----|----------|
| `https://releases.switchcontrol.org/latest.yml` | YAML metadata |
| `https://releases.switchcontrol.org/SwitchControl%20Setup%20x.y.z.exe` | Binary download |
| `https://releases.switchcontrol.org/SwitchControl%20Setup%20x.y.z.exe.blockmap` | Blockmap file |

Quick check (PowerShell / curl — note `%20` for spaces):

```powershell
curl -I https://releases.switchcontrol.org/latest.yml
curl -I "https://releases.switchcontrol.org/SwitchControl%20Setup%201.0.1.exe"
curl -I "https://releases.switchcontrol.org/SwitchControl%20Setup%201.0.1.exe.blockmap"
```

All three should return `HTTP/2 200`.

---

## Updater Config (already correct — do not change)

`electron/package.json`:

```json
"publish": [
  {
    "provider": "generic",
    "url": "https://pub-c4010f9528c14cbd9848f2c9c7c2306d.r2.dev",
    "channel": "stable"
  }
]
```

- `provider: generic` — works with any static file host (R2, S3, etc.)
- `url` — must match the public host the bucket is served from
- `channel: stable` — maps to `latest.yml` (beta would use `beta.yml`)

---

## Switching to the Custom Domain

Once `releases.switchcontrol.org` is available (after domain transfer or DNS delegation),
switching back requires **two changes** and a rebuild:

**1. `electron/package.json` — `build.publish.url`**

```json
"url": "https://releases.switchcontrol.org"
```

**2. `electron/.env` — `R2_PUBLIC_URL`** (controls release script verification output)

```
R2_PUBLIC_URL=https://releases.switchcontrol.org
```

That's it. No other files need to change. Then rebuild and release normally:

```powershell
npm run dist:win
npm run release
```

The release script will verify the new URL automatically after upload.

---

## Release History Reference

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | — | Initial release |
| 1.0.1 | 2026-04-20 | Auth hardening, 6× idle-CPU reduction, animation jank fix |

Add each release here as you ship it.
