---
name: Version release process ("push X.X.X everywhere")
description: Where every version string and patch-notes copy lives, and how the actual Windows installer gets built/uploaded.
---

When asked to bump the app version and "update patch notes everywhere", update all of these (root `package.json` is the canonical source):

- `package.json` and `electron/package.json` — must match exactly; validated by `electron/scripts/sync-version.js`.
- `shared/downloadConfig.ts` — `INSTALLER_CONFIG.version`, `fileName`, `publicPath` (R2 URL embeds the version in the filename), `releasedAt`.
- `client/public/patch-notes.json` AND `public/patch-notes.json` — two source copies, keep identical. `npm run build` copies the `public/` one into `dist/patch-notes.json`; rebuild after editing so dev/prod serve the new copy.
- Hardcoded version display strings: `client/src/components/website/ReleaseStory.tsx` ("Version X.X.X" badge), `client/src/components/LicenseManagementModal.tsx` (`useState` fallback), `client/src/advisor/collectors/appCollector.ts` (multiple static fallback values for Electron-unavailable case).

**Why:** there's no single source-of-truth constant for the version across web/electron display surfaces — it's duplicated as literal strings in several UI files, easy to miss one.

**How to apply:** grep the repo for the old version string (excluding `node_modules`, `.cache`, `attached_assets`, `package-lock.json`) after editing to confirm no stragglers remain, then run `npm run build` and restart the workflow.

**Actual installer build/upload is NOT done in the Replit sandbox.** `.github/workflows/release.yml` builds the Windows NSIS installer via `electron-builder` on `windows-latest` and uploads to Cloudflare R2, triggered by pushing a git tag matching `v[0-9]+.[0-9]+.[0-9]+` to GitHub. That workflow re-syncs the version from the tag itself. This Replit environment has no GitHub remote configured (only Replit's own gitsafe-backup/subrepl remotes) — pushing the release tag must happen from the user's own GitHub-connected clone/CI, not from here.
