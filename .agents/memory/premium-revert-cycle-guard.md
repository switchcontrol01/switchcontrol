---
name: Premium revert cycle guard
description: Automatic premium expiry reverts must run once per inactive entitlement cycle, while explicit retry remains available.
---

Automatic startup detection may find failed ownership records that are intentionally retained for retry. Those records must not relaunch the full revert on every app boot.

**Why:** A failed or obsolete ownership record otherwise reopens the revert modal after the user closes it and can repeat expensive system operations indefinitely.

**How to apply:** Gate the automatic startup pass with a persisted renderer marker, clear it only after verified premium access becomes active again, and keep Retry as the explicit path that starts another pass. Keep an IPC single-flight promise in the Electron main process.