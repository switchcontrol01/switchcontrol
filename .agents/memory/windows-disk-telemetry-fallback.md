---
name: Windows disk telemetry fallback
description: Windows systeminformation disk probes may return incomplete objects without throwing.
---

Disk telemetry must validate that disksIO() returned usable cumulative or per-second counters, not merely a truthy object. If counters are absent, use the PowerShell performance-counter fallback.

**Why:** On some Windows systems, especially AMD configurations, systeminformation can return an incomplete disk object while the UI otherwise receives healthy telemetry.

**How to apply:** Treat malformed disk samples like null samples, preserve the last valid cache, and only mark Storage Activity available when read/write counters are actually numeric.