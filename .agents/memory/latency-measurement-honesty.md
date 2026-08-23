---
name: Latency measurement honesty
description: Terminology and measurement boundaries for dashboard and analyzer responsiveness metrics.
---

Load-based CPU/RAM/process heuristics and DPC/interrupt/page-fault counters must be described as system responsiveness or model estimates, not direct input latency.

**Why:** Neither signal captures the complete mouse-to-photon path, and presenting either as measured input latency overstates what the instrumentation can support.

**How to apply:** Keep direct input-latency wording only for a future feature that actually measures the input-to-display path; otherwise label the source signals and their limitations explicitly.