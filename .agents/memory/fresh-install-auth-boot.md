---
name: Fresh-install auth boot
description: Reliability rule for the Electron renderer when there is no persisted auth state.
---

The logged-out cold-boot path is a first-class startup path: local auth cleanup must be callable and failure-tolerant, then boot must continue to the login phase.

**Why:** A fresh `%AppData%` directory produces an expected logged-out cloud response. If cleanup throws or a Zustand selector binds the action under the wrong property name, the renderer can remain on its internal STARTING state forever.

**How to apply:** When changing auth store selectors or boot reconciliation in `client/src/App.tsx`, exercise a no-credentials launch and keep logout cleanup inside a guard with a direct-store fallback.