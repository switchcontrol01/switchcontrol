---
name: Version release process ("push X.X.X everywhere")
description: Where every version string and patch-notes copy lives, and how the actual Windows installer gets built/uploaded.
---

When asked to bump the app version and "update patch notes everywhere", update all of these (root `package.json` is the canonical source):

- `package.json`, `electron/package.json`, and the mirrored `package.json.electron` — must match; validate root/Electron parity with `electron/scripts/sync-version.js`.
- Root `package-lock.json` and `electron/package-lock.json` root package entries must match the package versions.
- `shared/downloadConfig.ts` — `INSTALLER_CONFIG.version`, `fileName`, `publicPath` (R2 URL embeds the version in the filename), `releasedAt`.
- `client/public/patch-notes.json` AND `public/patch-notes.json` — two source copies, keep identical. `npm run build` copies the `public/` one into `dist/patch-notes.json`; rebuild after editing so dev/prod serve the new copy.
- Hardcoded version display strings: `client/src/components/website/ReleaseStory.tsx` ("Version X.X.X" badge), `client/src/components/LicenseManagementModal.tsx` (`useState` fallback), `client/src/advisor/collectors/appCollector.ts` (multiple static fallback values for Electron-unavailable case).

**Why:** there's no single source-of-truth constant for the version across web/electron display surfaces — it's duplicated as literal strings in several UI files, easy to miss one.

**How to apply:** grep the repo for the old version string (excluding dependencies, generated output, and historical notes) after editing, validate version parity and both patch-note copies, then run `npm run build` and restart the workflow.

**Cloudflare release boundary:** The user uploads the installer and updater files to Cloudflare themselves. For routine version bumps, update and verify the app and website release files only; do not request Cloudflare credentials, connect Cloudflare, or upload artifacts unless the user explicitly changes this instruction.

**Why:** the user explicitly said they handle Cloudflare uploads and asked that routine release work here stop at updating the application and website code.
