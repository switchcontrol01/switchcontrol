---
name: Retired process inspection boundary
description: Product scope behind removing Process Manager while retaining other process-related infrastructure.
---

Process Manager was deliberately removed, including Advisor's process-inspection tool. Do not reintroduce process enumeration through Advisor as a replacement.

**Why:** The user wanted less shipped feature code and no native Process Manager scanning or process-control paths, not merely a hidden page. No startup-speed or RAM savings were measured.

**How to apply:** Keep shared count-only dashboard telemetry, Startup Manager, Activity Monitor, shared file/publisher icons, and historical release/audit records. These are not part of the retired feature.
