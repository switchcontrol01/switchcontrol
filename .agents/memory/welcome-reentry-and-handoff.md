---
name: Welcome re-entry and dashboard handoff
description: Durable rules for first-login Welcome replay prevention and the Welcome-to-dashboard visual transition.
---

## Rule

Treat the account-scoped local Welcome completion marker as authoritative for replay prevention when the server installation marker is stale or unavailable. A returning account must not replay Welcome solely because `hasInstalledApp` is false.

Mount the dashboard transition scrim only after the dashboard wrapper has mounted. Do not let an `AnimatePresence` wait period expose a full-screen scrim while the outgoing Welcome screen is exiting and the dashboard is not yet present.

**Why:** The server activity marker can remain false when its fire-and-forget update is delayed or unavailable, while the local completion marker survives the completed first-login flow. Mounting the scrim as soon as the phase changes covered the outgoing animation during `mode="wait"`, leaving a black compositor gap.

**How to apply:** Any first-run routing branch that considers `hasInstalledApp` must also require the account-scoped Welcome marker to be absent. Keep dashboard reveal layers downstream of the actual dashboard mount/readiness signal, and retain regression tests for cached-session re-entry and the scrim gate.