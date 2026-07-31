---
name: Kill-switch coverage map
description: Which server features are gated by killSwitchMiddleware and how — prevents gaps reappearing during future work.
---

All kill switches live in `server/lib/killSwitch.ts` and are mounted in `server/routes.ts`.

| Feature | Env var | Route(s) gated | Notes |
|---|---|---|---|
| `ai` | `KILL_AI` | `/api/ai` router mount | via `requireCloudPremium` + aiRouter |
| `bios` | `KILL_BIOS` | `/api/bios` router mount | |
| `cleaner` | `KILL_CLEANER` | `/api/cleaner` router mount | |
| `network_diag` | `KILL_NETWORK_DIAG` | `/api/network` router mount | |
| `security` | `KILL_SECURITY` | `/api/security` router mount | Was unwired before — fixed |
| `extreme_labs` | `KILL_EXTREME_LABS` | All 6 extreme-labs routes: `/status`, `/restore-point`, `/baseline`, `/analyze`, `/apply`, `/revert` | Was only `/status` before — fixed |
| `updater` | `KILL_UPDATER` | `GET /api/updates/enabled` (auth-free) | Electron's `checkUpdateGate()` in updater.js hits this before contacting R2 CDN; fails OPEN so connectivity issues never block updates |
| `telemetry` | `KILL_TELEMETRY` | WS broadcast path in wsServer.ts | Uses `isKilled()` inline, not middleware — functional but non-standard; flagged, not changed |

**Why:** security touches Defender/service state; updater controls what code runs on users' machines. Both are highest-consequence surfaces for an emergency kill.

**How to apply:** Before adding any new server feature area, decide up front which kill-switch feature name covers it (or create a new one), and mount the middleware at the router level — never per-route except for extreme_labs which was pre-existing individual handlers.
