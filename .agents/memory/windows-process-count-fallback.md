---
name: Windows process-count fallback
description: Keep responsiveness telemetry usable when systeminformation cannot parse Windows process metadata.
---

The Windows process count must have a native count-only fallback; a zero result from systeminformation is not proof that no processes exist.

**Why:** systeminformation's Windows CIM process parser can return an empty count when process metadata is malformed or unavailable, leaving otherwise valid CPU/RAM telemetry permanently ineligible for the responsiveness estimate.

**How to apply:** Prefer systeminformation when its total is positive. When it returns zero or rejects, use a bounded native Windows count probe and keep the estimate unavailable if both sources fail—never substitute a guessed process count.