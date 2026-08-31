---
name: Shared HTTP WebSocket upgrades
description: The required upgrade-listener pattern when telemetry WebSockets and Vite HMR share one HTTP server.
---

Telemetry WebSockets must use `noServer: true` with an explicit HTTP `upgrade` listener that only calls `handleUpgrade` for `/ws/telemetry`.

**Why:** `ws` automatic server mode installs a catch-all upgrade listener. Even with a configured path, it can reject unrelated upgrades with HTTP 400 before Vite receives `/vite-hmr`, breaking preview HMR.

**How to apply:** When adding another WebSocket endpoint to the dev server, keep it path-gated and remove its listener during teardown; never attach a second automatic `ws` server to the shared HTTP server.