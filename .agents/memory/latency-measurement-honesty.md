---
name: Latency measurement honesty
description: Terminology and measurement boundaries for dashboard and analyzer responsiveness metrics.
---

Load-based CPU/RAM/process heuristics and DPC/interrupt/page-fault counters must be described as system responsiveness or model estimates, not direct input latency. Never convert an all-zero startup telemetry sentinel into the estimator's minimum latency floor; keep the value unknown until a complete native sample exists.

**Why:** Neither signal captures the complete mouse-to-photon path, and presenting either as measured input latency overstates what the instrumentation can support. The dashboard estimator previously used a hard-coded 1.5 ms floor, so the first request during Electron startup could report exactly 1.5 ms on unrelated machines while telemetry was still unavailable.

**How to apply:** Keep direct input-latency wording only for a future feature that actually measures the input-to-display path; otherwise label the source signals and their limitations explicitly. Treat loading, missing CPU cores/RAM totals, or missing process counts as insufficient data in the backend response, and render an explicit unavailable state rather than `0.0` or the minimum estimate.