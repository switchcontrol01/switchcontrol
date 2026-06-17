---
name: SysIntelligence WMI all-null guard
description: When all WMI sources timeout simultaneously, the profile is fully null — guard before disk cache write or good data is permanently destroyed.
---

## The Rule
After `collect()` finishes, check if the profile is empty before calling `_saveDiskCache()`. A profile is empty when `baseboard.model === null && bios.version === null && cpu.brand === null && gpu.controllers.length === 0 && memory.sticks.length === 0`.

If empty: skip the disk write (preserve the last good cache), and if in-memory cache is also empty, reload the disk cache as a fallback.

## Why
On machines where the PS limiter is saturated at startup (tweak:syncAll = 63 sequential PS queries), Windows WMI is contended and all 15 `systeminformation` calls in the backend child process hit their timeouts simultaneously. The previous code unconditionally called `_saveDiskCache(profile)` with the all-null result, destroying any good data from a prior session.

## How to Apply
- The guard lives at the end of `collect()` in `server/lib/systemIntelligence.ts`
- `_isProfileEmpty()` helper checks the 5 key fields
- If empty: log a warning, skip disk write, attempt disk fallback restore
- If non-empty: proceed with disk write as normal
- `_saveProbeHealth()` still runs regardless — probe cooldowns should persist

## Related Context
- The probe-health.json cooldown mechanism (12 min after 2 consecutive timeouts) makes subsequent launches faster but doesn't fix null data — hence this guard is still needed.
- PS limiter in main.js: tweak:syncAll holds the limiter for ~39s (63 sequential queries), creating WMI contention that causes the backend child process's systeminformation calls to all timeout.
