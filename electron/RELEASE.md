# SwitchControl Release Checklist

## Architecture summary

```
Main process (updater.js)
  ↓ electron-updater autoUpdater events
  ↓ state stored in-memory
  ↓ broadcast via ipcMain → webContents.send('updater:event')
Preload (preload.js)
  ↓ contextBridge exposes window.electronAPI.updater.*
Renderer (use-updater.ts hook)
  ↓ polls getState() on mount, listens to onEvent()
  ↓ UpdateCard (Settings page) + UpdateBanner (layout top)
```

## Publish configuration

`electron/package.json` → `build.publish`:

```json
{
  "provider": "generic",
  "url": "https://pub-c4010f9528c14cbd9848f2c9c7c2306d.r2.dev",
  "channel": "stable"
}
```

- `electron-builder --publish always` generates:
  - `SwitchControl Setup {version}.exe` — NSIS installer
  - `SwitchControl Setup {version}.exe.blockmap` — delta update blockmap
  - `latest.yml` — update metadata consumed by electron-updater in installed apps
  - `stable.yml` — stable-channel alias (identical to latest.yml)
- Both installer and YML artifacts must be uploaded to `https://pub-c4010f9528c14cbd9848f2c9c7c2306d.r2.dev/`

## Release channels

| Channel | Tag pattern | Notes |
|---------|------------|-------|
| stable | `v1.3.1` | Default for all users |
| beta | `v1.3.1-beta.1` | Opt-in (structure ready, not yet exposed in UI) |

## How a new release reaches users

1. Developer bumps version:
   ```bash
     cd electron && npm version 1.3.1
   ```
2. Commit + push tag:
   ```bash
    git add package.json package-lock.json electron/package.json electron/package-lock.json
    git commit -m "chore: bump to v1.3.1"
    git tag v1.3.1
    git push origin main --tags
   ```
3. CI (`release.yml`) triggers:
   - Builds React frontend
   - Runs `electron-builder --win --publish always`
     - Generates `SwitchControl Setup 1.3.1.exe` + `latest.yml`
   - Uploads both to GitHub Release + release server
4. Installed apps check `https://pub-c4010f9528c14cbd9848f2c9c7c2306d.r2.dev/latest.yml` on startup (after 8s)
5. If `latest.yml` version > installed version → update-available event fires
6. User sees UpdateBanner (top of screen) + UpdateCard (Settings page)
7. User downloads → progress bar shown
8. Download complete → "Restart & Install" CTA appears
9. NSIS applies update silently and relaunches

## Update urgency tiers

Parsed from `releaseNotes` field in `latest.yml`.

| Keyword in notes | Urgency | UI |
|--|--|--|
| `[CRITICAL]` | critical | Red border + badge |
| `[RECOMMENDED]` | recommended | Amber border + badge |
| (default) | normal | Violet border + badge |

Example `latest.yml` release notes field:
```
version: 1.3.1
releaseDate: '2026-08-30'
releaseNotes: |
  [RECOMMENDED] Fixed GPU detection crash on AMD cards.
  Improved telemetry polling performance.
  Updated BIOS detection signatures.
```

## Local testing steps

### Test without a real release server

1. Set `autoUpdater.updateConfigPath` to a local `dev-app-update.yml`:
   ```yaml
   provider: generic
   url: http://localhost:8181
   ```
2. Start a local HTTP server serving a fake `latest.yml`:
   ```yaml
   version: 99.9.9
   releaseDate: '2026-04-03'
   path: SwitchControl Setup 99.9.9.exe
   sha512: FAKEHASH
   size: 1000
   releaseNotes: '[RECOMMENDED] Test release.'
   ```
3. Launch packaged app — the update-available event fires automatically.

### Test download + install

Build a real versioned installer, serve it locally, and verify the full flow end-to-end.

## Production testing steps

1. Tag and push `v{next}` (follows semver strictly).
2. Wait for CI to complete — verify GitHub Release has `.exe` + `latest.yml`.
3. Upload both to `https://pub-c4010f9528c14cbd9848f2c9c7c2306d.r2.dev/` via `npm run release` if not auto-deployed.
4. On a machine with the previous version installed, launch SwitchControl.
5. Observe: after ~8 seconds, UpdateBanner appears (if update detected).
6. Click Download → verify progress bar.
7. Click Restart & Install → app relaunches on new version.
8. Confirm Settings page shows updated `currentVersion`.

## Failure modes & recovery

| Failure | Behavior | Recovery |
|--|--|--|
| Server unreachable | `error` status, no crash | UpdateCard shows retry button |
| Bad `sha512` hash | electron-updater rejects file | ErrorState with exact message |
| Already latest | `not-available` status | "You're up to date" shown |
| Download interrupted | `error` event fires | Retry button restarts download |
