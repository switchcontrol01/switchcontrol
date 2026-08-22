---
name: Driver fetch cache fallback
description: How driver intelligence should behave when its optional persistent cache is unavailable.
---

Successful vendor refreshes must be retained in a runtime cache when the persistent driver cache table is unavailable. Persisted rows remain preferred when the table exists, while vendor access failures preserve the last known-good version and expose the source limitation.

**Why:** Fresh deployments and Electron/offline environments may not have the cloud cache table, but discarding successful fetches makes the driver database appear stale and creates noisy repeated database errors.

**How to apply:** Keep the runtime cache behind the server fetcher, merge it with persisted rows, and mark persistent-cache availability after the first failed probe so one scheduled run does not repeat the same missing-table query for every vendor.