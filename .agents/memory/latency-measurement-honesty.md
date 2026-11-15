---
name: Latency measurement honesty
description: Terminology and measurement boundaries for dashboard and analyzer responsiveness metrics.
---

Load-based CPU/RAM/process heuristics and DPC/interrupt/page-fault counters must be described as system responsiveness or model estimates, not direct input latency. Never convert an all-zero startup telemetry sentinel into the estimator's minimum latency floor; keep the value unknown until a complete native sample exists.

**Why:** Neither signal captures the complete mouse-to-photon path, and presenting either as measured input latency overstates what the instrumentation can support. The dashboard estimator previously used a hard-coded 1.5 ms floor, so the first request during Electron startup could report exactly 1.5 ms on unrelated machines while telemetry was still unavailable.

**How to apply:** Keep direct input-latency wording only for a future feature that actually measures the input-to-display path; otherwise label the source signals and their limitations explicitly. Treat loading, missing CPU cores/RAM totals, or missing process counts as insufficient data in the backend response, and render an explicit unavailable state rather than `0.0` or the minimum estimate.

For the dashboard's load-based estimate, a complete paused or stale Windows sample may still produce a last-known estimate, but it must be labeled stale and show its age. Preserve the last complete estimate across route changes within the authenticated session; clear it on logout. Never present paused/stale data as live.

**Why:** Losing focus or navigating to a paused route stopped polling, and a live-only gate hid a complete available sample. Component-local state also vanished when leaving and returning to the Dashboard.

**How to apply:** Require all CPU, RAM, core-count, process-count, and sample-time fields before estimating. Keep the pause/staleness reason visible, show the sample age, and do not substitute the separate PerfOS DPC/interrupt capture for load telemetry.

Preserve fractional DPC/interrupt percentages using raw 100ns counter deltas, with
64-bit values transported as strings. Never add artificial fluctuation.

**Why:** Windows formatted CIM percentage properties are whole-number values;
casting them to double after collection cannot recover activity below 1%.

**How to apply:** Use consecutive native counter timestamps as the denominator.
First reads and provider resets establish a baseline, not a zero measurement.

For a separate app-event response test, use event timestamps and actual
`performance.now()` at handler/callback entry in one renderer clock domain.
Never treat the `requestAnimationFrame` argument as a paint/completion timestamp.

**Why:** A measured Chromium experiment found that the rAF argument can predate
the input event even when the callback executes after it. CDP-injected events also
report `isTrusted`, so that flag cannot prove physical hardware input.

**How to apply:** Keep this separate from PerfOS and mouse-to-photon claims.
See `docs/input-delay-investigation.md` for measured evidence, native timing
candidates, and the Windows validation boundary. A Linux headless probe proves
browser interval behavior, not physical Windows input or display latency.