---
name: Electron embedded backend vs cloud host
description: In the desktop app, /api/* hits a LOCAL embedded backend (real hardware); on the web build it hits the cloud host (VM). This changes what server-side hardware probes mean.
---

# Electron runs a local backend; web hits the cloud — they are NOT the same host

The desktop app spawns its own embedded Express backend (`backendLauncher.startBackend`
in `electron/main.js`) and the client rewrites relative `/api/` URLs to
`http://127.0.0.1:PORT/api` (see `client/src/lib/api.ts`). So:

- **In Electron:** `/api/system-intelligence/profile` and other server-side
  `systeminformation` probes read the USER's REAL hardware (local backend on the
  real OS). The system-intelligence store is trustworthy here.
- **On the plain web build (replit.app / preview):** `/api/*` hits the cloud host,
  so the same probes describe the **server VM**, not the user.

**Why it matters:** Any "hardware-aware" UI that consumes server-derived hardware
must NOT render against the cloud VM. The robust universal rule is: prefer
client-supplied specs, and gate hardware-only features to Electron.

**How to apply:**
- Detect desktop with `!!(window as any).electronAPI?.isElectron`.
- The hardware-verdict feature (`client/src/hooks/useHardwareProfile.ts`) returns
  `null` when not Electron, so tweak verdicts never show on the web.
- The AI advisor prompts still prefer client `context.system.*` strings and avoid
  `serverCtx.display`/`serverCtx.systemIntel` for user hardware — safe for BOTH the
  cloud-served web case and the embedded-backend desktop case.
