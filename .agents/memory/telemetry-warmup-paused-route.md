---
name: Telemetry warm-up paused-route state
description: Route-aware telemetry can leave the global warm-up indicator stuck if paused routes inherit the store default.
---

The telemetry store must default to not warming up, and pause() must clear both its warm-up timer and UI flag. Static routes intentionally pause telemetry before the first active start, so they cannot inherit a permanent startup state.

**Why:** A paused route was displaying the startup banner indefinitely because the store initialized warmingUp=true and no active telemetry start existed to clear it.

**How to apply:** Treat warmingUp as an active-start grace state only; clear it on pause and keep the display separate from telemetry suppression if future UX changes need a different message.