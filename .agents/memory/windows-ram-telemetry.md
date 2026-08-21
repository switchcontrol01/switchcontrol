---
name: Windows RAM telemetry source
description: The authoritative source and display precision for dashboard physical-memory usage.
---

On Windows, dashboard RAM usage must use Node's native `os.totalmem()` and `os.freemem()` values. These are based on the OS physical-memory counters used by Task Manager and avoid platform-specific differences in `systeminformation.mem()`.

**Why:** A visible mismatch occurred where the dashboard reported substantially higher RAM usage than Task Manager on the same machine.

**How to apply:** Calculate used memory as `total - free/available`, expose total and used in one-decimal GiB, and keep the percentage based on the same byte values. Do not reintroduce a separate `systeminformation.mem()` source for the dashboard.