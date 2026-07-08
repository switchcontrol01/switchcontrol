---
name: Telemetry startup warm-up grace period
description: Why raw CPU/RAM/GPU spikes during app launch must be suppressed for a grace period instead of shown as alerts.
---

Right after the app/backend (re)starts, PowerShell probes, WMI queries, and the
telemetry scheduler itself briefly consume real CPU — this is expected launch
overhead, not a genuine system problem. Without gating, dashboards showed red
"CPU at capacity" / "High CPU load" alerts instantly on every launch.

**Why:** the underlying CPU readings during this window are real (not a display
bug) — the fix is not to filter noise out of a signal, but to distrust the
signal itself for a fixed window after telemetry (re)starts, since the source
of the load is the monitoring/startup pipeline rather than the user's workload.

**How to apply:** the warm-up flag/timer lives centrally in the telemetry layer
(`telemetryManager`/`telemetryStore`) and is re-armed on every `start()` /
`hardReset()`, not just app boot — so a reconnect or manual telemetry reset also
gets a fresh grace period. All downstream consumers (system-state summaries,
predictive-warning banners, etc.) must read this single flag rather than each
inventing their own threshold/delay logic, or they will drift out of sync.
