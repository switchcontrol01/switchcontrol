---
name: Network verification cache boundary
description: The boundary between fast cached network-tweak UI state and authoritative Windows verification.
---

Electron Network Tweaks must never treat its session cache as authoritative. Cached values may be shown immediately for responsiveness, but the registry/netsh verifier must still run on every page visit and overwrite the cache when it returns a result.

**Why:** A fresh cache previously short-circuited the entire hydration effect, leaving optimistic "Applied" labels visible without checking the actual Windows state.

**How to apply:** Only skip the backend/cache fetch in Electron when cached data is fresh; do not skip the native `checkAll` reconciliation.