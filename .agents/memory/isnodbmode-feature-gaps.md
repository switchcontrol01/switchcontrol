---
name: isNoDbMode feature gaps
description: Postgres-only write paths silently no-op in the packaged Electron app because there's no DATABASE_URL; needs a local-file fallback per feature.
---

## The pattern

`server/db.ts` sets `isNoDbMode = true` when there's no reachable Postgres
(this is always true in the packaged Electron desktop app — the embedded
backend has `DATABASE_URL` explicitly stripped in `electron/backend-launcher.js`).

Routes across the codebase guard persistence with:

```ts
if (!isNoDbMode && db) {
  await db.execute(sql`INSERT INTO ...`);
}
```

When `isNoDbMode` is true, this silently does nothing — no error, no log by
default, no data written. Any GET endpoint reading that table then always
returns empty. From the user's perspective in the desktop app, the feature
"just doesn't save history" with zero error signal.

**Why:** This exact pattern caused a reported bug where debloat history never
appeared even right after successfully applying items — traced to this single
`if (!isNoDbMode && db)` guard with no local-JSON fallback in
`server/routes/debloater.ts`. The same guard pattern exists (unaudited as of
this writing) in `cleaner.ts`, `startupApps.ts`, `networkTweaks.ts` — likely
same silent gap for their respective history.

**How to apply:** When investigating "X never saves/shows up" bugs in this
app, grep the relevant route file for `isNoDbMode` first. The fix pattern is a
small local JSON-file store mirroring the DB row shape exactly (see
`server/lib/localDebloatHistory.ts` + `server/lib/localDesktopDataDir.ts` for
the reference implementation — resolves `ELECTRON_USER_DATA` env var injected
by `backend-launcher.js`, falls back to platform-standard app-data dirs,
mirrors the `desktop-secrets.ts` resolve-dir pattern). Wire it into both the
write route (as the `else` branch of the DB guard) and the read route (as the
`isNoDbMode` early-return branch), keeping the response shape identical.
