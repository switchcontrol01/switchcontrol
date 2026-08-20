---
name: Background telemetry policy
description: Product and engineering rule for live telemetry lifecycle when SwitchControl is not visible
---

Live telemetry is a foreground-only service: it must pause automatically when the app is hidden, minimized, unfocused, or closing, and resume when the window is visible and focused. Do not reintroduce a user-facing pause toggle; any future background monitoring should be a separately named, explicit opt-in feature.

**Why:** The app's purpose is to improve responsiveness and low-end performance, so polling while the user cannot see the dashboard is unnecessary overhead and makes the setting promise ambiguous.

**How to apply:** Keep the Electron main loop and renderer transports under the same lifecycle policy. On pause, stop system polling, IPC scheduling, WebSocket reconnects, and frame processing; on restore/focus, resume idempotently without duplicate loops.