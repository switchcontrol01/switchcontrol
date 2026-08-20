---
name: Electron offline auth boundary
description: How authenticated local Electron requests work when the embedded backend has no cloud database.
---

In packaged Electron offline mode, the embedded backend cannot look up the cloud user in PostgreSQL. Authentication remains restricted to loopback traffic and a validated `x-electron-uid`; when no database is configured, the middleware creates a request-scoped local user context from that identity and the renderer's entitlement headers. Cloud/web authentication still requires the normal database-backed path.

**Why:** Rejecting a valid renderer identity because MockStorage has no users made every local intelligence route return 401, while removing the loopback and identity checks would broaden the trust boundary.

**How to apply:** Keep local-only hardware/intelligence routes behind the loopback guard and Electron identity validation. Preserve entitlement headers when local routes need premium/admin decisions. Electron telemetry should also subscribe to the native window-focus event because browser `document.hasFocus()` is unreliable during the first-frame/window-show handoff.