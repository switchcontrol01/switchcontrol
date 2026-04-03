# SwitchControl Release Guide

Auto-updates are served from **https://releases.switchcontrol.org** via Cloudflare R2.
The Electron updater checks this URL for `latest.yml` on every launch.

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

In the `electron/` folder:

```
cp .env.example .env
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

The script uploads all three files in the right order (installer first, `latest.yml` last so
the metadata only goes live once the binary is available).

Output looks like:

```
Found 3 artifact(s) to upload:
  latest.yml  (0.0 MB)
  SwitchControl Setup 1.0.1.exe  (94.3 MB)
  SwitchControl Setup 1.0.1.exe.blockmap  (0.1 MB)

  Uploading SwitchControl Setup 1.0.1.exe ... OK
  Uploading SwitchControl Setup 1.0.1.exe.blockmap ... OK
  Uploading latest.yml ... OK

Public URLs:
  https://releases.switchcontrol.org/latest.yml
  https://releases.switchcontrol.org/SwitchControl Setup 1.0.1.exe
  https://releases.switchcontrol.org/SwitchControl Setup 1.0.1.exe.blockmap
```

### Step 4 — Verify

```bash
curl -s https://releases.switchcontrol.org/latest.yml
```

Should return something like:

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

| URL | Expected |
|-----|----------|
| `https://releases.switchcontrol.org/latest.yml` | YAML metadata |
| `https://releases.switchcontrol.org/SwitchControl Setup x.y.z.exe` | Binary download |
| `https://releases.switchcontrol.org/SwitchControl Setup x.y.z.exe.blockmap` | Blockmap file |

Quick check:

```bash
curl -I https://releases.switchcontrol.org/latest.yml
curl -I "https://releases.switchcontrol.org/SwitchControl Setup 1.0.1.exe"
```

Both should return `HTTP/2 200`.

---

## Updater Config (already correct — do not change)

`electron/package.json`:

```json
"publish": [
  {
    "provider": "generic",
    "url": "https://releases.switchcontrol.org",
    "channel": "stable"
  }
]
```

- `provider: generic` — works with any static file host (R2, S3, etc.)
- `url` — must match the bucket's custom domain exactly
- `channel: stable` — maps to `latest.yml` (beta would use `beta.yml`)

---

## Release History Reference

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | — | Initial release |

Add each release here as you ship it.
