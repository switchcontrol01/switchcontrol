---
name: Route-aware telemetry demand
description: Central route-driven telemetry profiles and pause/resume precedence
---

Telemetry demand is selected centrally by the authenticated route: Dashboard uses full polling, Tweaks uses the lighter intelligence profile, and all other routes are paused. Hidden/unfocused state and the user’s metrics setting remain higher-priority pauses.

**Why:** Per-page polling creates duplicate loops and keeps hardware probes active when no visible feature consumes them; a single demand policy reduces CPU, WMI, disk, and battery work without weakening tweak execution.

**How to apply:** Keep route changes flowing through telemetryManager.setDemandMode(). Keep renderer transport state and Electron’s hardware-owner state separate for demand pauses versus window pauses, and expose demandMode in diagnostics when changing cadence.