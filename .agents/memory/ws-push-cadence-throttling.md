---
name: WebSocket push-cadence throttling
description: How to make a client honor a client-side "low power" mode when the server pushes data on its own fixed schedule over a WebSocket.
---

When a server-side scheduler pushes data over a WebSocket at a fixed interval (e.g. "every 2s for all connected clients"), it typically has no concept of per-client preferences like a light/low-power mode — every client gets the same cadence.

**Why:** Changing the server's push rate per connection requires per-socket scheduling state on the server and a protocol for the client to declare its desired rate. That's a bigger change than the client-side alternative, and in most cases isn't necessary.

**How to apply:** Throttle on the client by dropping (N-1)/N incoming frames, where N = desiredIntervalMs / serverBaseIntervalMs. Keep connection-liveness bookkeeping (clearing "unavailable" timers, etc.) running on every frame — only skip the expensive state update / re-render work. Reset the frame counter on reconnect so cadence alignment doesn't drift. Don't assume "the server already handles this" just because a polling/mode profile exists elsewhere in the app (e.g. an IPC-polling code path) — WS push and IPC pull are different transports and need separate throttle logic.
