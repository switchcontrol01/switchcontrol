---
title: Feature State and Desktop Boundary
---
Vulnerabilities in secondary feature routers and in the cloud-to-Electron trust boundary for privileged desktop actions.

Vulnerabilities to fix:

1. [High] Focus Mode, Cleaner, and App Booster State Is Shared Globally Across the Cloud API
  Several secondary feature routers keep one shared cloud-side state for the entire deployment instead of per user. Any remote caller can start or stop another user's focus session, inject fake cleaner history, or overwrite App Booster detection and execution state that other users see.

The problem has two parts: these routers are mounted without authentication in `server/routes.ts`, and their persistence model has no user ownership.

In `server/routes.ts`:

```ts
app.use("/api/app-booster", appBoosterRouter);
app.use("/api/cleaner", cleanerRouter);
app.use("/api/focus", focusModeRouter);
```

In `server/routes/focusMode.ts`, only one focus session can exist for the whole server process:

```ts
let activeState: FocusState | null = null;
```

`POST /api/focus/enable` and `POST /api/focus/disable` mutate that singleton and also write rows to `focus_sessions` with no `user_id` column. One caller can therefore block another user's focus session or forcibly disable it.

In `server/routes/cleaner.ts`, `POST /api/cleaner/clean` inserts shared `cleaner_history` rows with no user ownership, and `GET /api/cleaner/history` returns those rows to every caller. The persisted totals come from caller-supplied `electronResults`, so the displayed history is attacker-controlled.

In `server/routes/appBooster.ts`, the in-memory caches and database tables are keyed only by game slug:

```ts
const memGames  = new Map<string, MemGameRow>();
const memStates = new Map<string, MemStateRow>();
```

`app_booster_games`, `app_booster_state`, and `app_booster_history` likewise have no user identifier. Unauthenticated writes such as `POST /api/app-booster/games/scan` and `POST /api/app-booster/games/:slug/report-result` overwrite the one global record for each slug, and reads such as `GET /api/app-booster/games`, `GET /api/app-booster/games/:slug/status`, and `GET /api/app-booster/history` expose that shared state to everyone.

This is a cloud-tier broken-access-control issue, not a harmless desktop-local simplification. In production it lets one internet caller tamper with other users' optimization state and operational history across multiple product surfaces.
  Files: server/routes.ts, server/routes/focusMode.ts, server/routes/cleaner.ts, server/routes/appBooster.ts

2. [High] Cloud-Poisoned App Booster State Reaches Unsanitized PowerShell Execution
  An attacker can poison App Booster state in the cloud API so that a victim's Electron app later builds and runs attacker-controlled PowerShell on Windows. The desktop app trusts server-supplied install paths and interpolates them into PowerShell commands without escaping.

The cloud side accepts and stores `installPath` from unauthenticated callers. For example, `POST /api/app-booster/games/scan` and `POST /api/app-booster/games/:slug/report-result` write `install_path` into the global App Booster tables without user scoping.

The renderer then reads that same value back from the API. In `client/src/pages/AppBooster.tsx`, `loadDetail()` fetches `/app-booster/games/${slug}/status`, and `handleApply()` passes the returned `installPath` into Electron IPC:

```ts
const data = await apiGet<GameDetail>(`/app-booster/games/${slug}/status`);
...
const { actions, installPath } = await apiPost(`/app-booster/games/${selectedSlug}/apply`, {
  installPath: gameDetail.installPath,
});
...
await eApi.appBooster.executeAction({ type: action.id, mode, executable, installPath, gameName });
```

In `electron/main.js`, the IPC handler turns that value into PowerShell source code via string interpolation:

```js
const exePath = installPath ? require('path').join(installPath, executable) : executable;
...
apply: `... -Name "${exePath}" -Value "GpuPreference=2;" ...`,
apply: `$pn = "${gameName} SC-Boost"; ... -AppPathNameMatchCondition "${exePath}" ...`,
...
execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', scriptSet[mode]], ...);
```

Because neither preload nor main-process code escapes embedded quotes, a malicious install path such as `C:\Games\"; Start-Process calc; #` breaks out of the PowerShell string and injects new commands. `path.join()` does not neutralize quotes or PowerShell metacharacters.

This is a real cloud-to-desktop trust-boundary failure: the attacker only needs to poison the shared App Booster state through the API, then wait for a victim to open the affected game in the Windows app and click Apply or Revert. The result is arbitrary code execution in the victim's user context.
  Files: server/routes/appBooster.ts, client/src/pages/AppBooster.tsx, electron/main.js, electron/preload.js

3. [Medium] Unauthenticated Network Tweak Reporting Accepts Arbitrary tweak_id Values
  The network-tweak reporting API lets any caller create or overwrite state entries for any tweak name they choose. This allows unauthenticated tampering with the network tweak dashboard and unbounded log pollution.

`server/routes.ts` mounts `networkTweaksRouter` with no authentication, and `server/routes/networkTweaks.ts` accepts an arbitrary `:tweakId` path segment:

```ts
router.post("/:tweakId/report", async (req, res) => {
  const { tweakId } = req.params;
  const { action, success, verified, message, disabled } = req.body;
  ...
  await db.execute(sql`
    INSERT INTO network_tweak_state (tweak_id, status, last_result, applied_at, updated_at)
    VALUES (${tweakId}, ${status}, ${resultJson}::jsonb, ${appliedAt}, NOW())
    ON CONFLICT (tweak_id) DO UPDATE ...
  `);

  await db.execute(sql`
    INSERT INTO network_tweak_log (tweak_id, action, success, verified, message)
    VALUES (${tweakId}, ${action}, ${success}, ${verified}, ${message ?? null})
  `);
});
```

There is no allowlist that restricts `tweakId` to the product's real network tweak IDs. As a result, an attacker can:

- overwrite the state of a legitimate tweak by posting to a known ID,
- create fake entries under arbitrary names, and
- spam `network_tweak_log` indefinitely because inserts are unbounded and unauthenticated.

This does not produce SQL injection because Drizzle parameterizes the query, but it is still an exploitable integrity flaw. The server is treating a public URL segment as authoritative product state.
  Files: server/routes.ts, server/routes/networkTweaks.ts