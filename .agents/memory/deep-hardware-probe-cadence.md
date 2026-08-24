---
name: Deep hardware probe cadence
description: The launch-based policy for expensive system-intelligence and Electron hardware enrichment.
---

Automatic deep hardware probes run on every 15th application/backend launch rather than on every stale-cache refresh. Fast identity data remains available immediately, and the existing cached deep profile is served between eligible launches.

**Why:** Repeated WMI/systeminformation probes were expensive and could hang or compete with startup work on Windows, especially on AMD systems. A launch cadence reduces that repeated load while preserving periodic hardware revalidation.

**How to apply:** Keep explicit user refreshes and GPU reselection immediate. Treat a missing first-install cache and an expired cache as eligible fallbacks. Any new automatic deep hardware probe must use the same launch gate in both the Electron local backend and server system-intelligence path.