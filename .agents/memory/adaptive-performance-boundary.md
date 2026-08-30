---
name: Adaptive performance boundary
description: Durable rules for capability-driven visual and telemetry profiles.
---

Adaptive performance is a machine-capability layer, not a replacement for the
user-selected Normal/Light application mode. Route/background telemetry demand
still takes precedence, and reduced motion remains the strongest visual rule.

**Why:** Conflating the systems would make a hardware event silently change a
user preference, while stale in-flight capability probes can otherwise restore
an obsolete GPU, power, display, or session decision after an invalidation.

**How to apply:** Keep profile derivation pure and field availability explicit.
When adding capability events, invalidate through the central snapshot boundary
and ensure a newer generation supersedes or queues behind any in-flight read.
Never infer a missing probe as healthy or constrained.