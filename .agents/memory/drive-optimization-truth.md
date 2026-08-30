---
name: Drive optimization truth
description: Source-of-truth and recommendation rules for TRIM and defragmentation status.
---

SwitchControl’s own optimization history only proves that SwitchControl launched an operation. It must never be presented as the last time Windows optimized a drive. Prefer a verified per-volume Microsoft-Windows-Defrag success event timestamp, label the source, and use app history only as separately labeled fallback evidence.

**Why:** Windows can run Optimize Drives manually or through scheduled maintenance without creating a SwitchControl history row. Treating an old app row as the system’s last run produces false “overdue” recommendations.

**How to apply:** Use Defrag event 258 for per-volume last-run evidence; ScheduledDefrag only proves the global schedule is enabled. Recommendations must be time/evidence-based, ignore failed/wrong-drive history, and never recommend ReTrim while TRIM is disabled.