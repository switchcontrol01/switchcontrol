---
name: Drive optimization truth
description: Source-of-truth and recommendation rules for TRIM and defragmentation status.
---

SwitchControl’s own optimization history only proves that SwitchControl launched an operation. It must never be presented as the last time Windows optimized a drive. Prefer a verified Windows maintenance timestamp, label the source, and use app history only as separately labeled fallback evidence.

**Why:** Windows can run Optimize Drives manually or through scheduled maintenance without creating a SwitchControl history row. Treating an old app row as the system’s last run produces false “overdue” recommendations.

**How to apply:** Recommendations must be time/evidence-based rather than launch-count-based. Ignore failed and wrong-drive history, do not claim a due date when native status is unavailable, and do not recommend ReTrim while Windows TRIM is disabled.