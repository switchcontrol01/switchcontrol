---
name: Windows process-count fallback
description: Keep responsiveness telemetry usable when systeminformation cannot parse Windows process metadata.
---

The Windows process count must bound the systeminformation call and have a native count-only fallback; a zero or hung result is not proof that no processes exist. Retry the native probe briefly when the shared PowerShell limiter reports busy.

**Why:** systeminformation's Windows CIM process parser can return an empty count when process metadata is malformed or unavailable, and a hung scan can prevent fallback from running. Startup contention can also temporarily block the native probe.

**How to apply:** Prefer systeminformation when its total is positive, but enforce a timeout. When it returns zero, times out, or rejects, use a bounded native Windows count probe with brief busy retries. Keep the estimate unavailable if both sources fail—never substitute a guessed process count.