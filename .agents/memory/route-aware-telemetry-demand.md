---
name: Route-aware telemetry demand
description: Central route-driven telemetry profiles and pause/resume precedence
---

Telemetry demand is selected centrally by the authenticated route: Dashboard and Network Tweaks use full polling, Tweaks uses the lighter intelligence profile, and static routes are paused. Hidden/unfocused state remains a hard pause; visible monitors must not be stranded by a stale persisted metrics preference during boot.

**Why:** Per-page polling creates duplicate loops and keeps hardware probes active when no visible feature consumes them; a single demand policy reduces CPU, WMI, disk, and battery work without weakening tweak execution. A boot-time preference pause raced the Dashboard route and left the monitor loading until navigation remounted it. Network Tweaks also displays live traffic; treating it as a static page freezes those readings.

**How to apply:** Keep route changes flowing through telemetryManager.setDemandMode(). Active telemetry hooks may resume an already-started manager after route transitions; static routes must remain paused. Keep renderer transport state and Electron’s hardware-owner state separate for demand pauses versus window pauses, and expose demandMode in diagnostics when changing cadence.