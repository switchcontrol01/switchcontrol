---
name: System Integrity evidence boundary
description: Why integrity scores must use device observations rather than recommendation counts, and retain scan coverage.
---

Calculate integrity scores from device observations, not the number or wording of
recommendations. Keep desktop and server scoring consistent. An uncollected or failed
probe is unknown, not healthy; a Quick Scan is partial rather than a clean full scan.
Do not treat lifetime CPU seconds as current CPU utilisation or disabled protection
controls as detected malware.

**Why:** Two common medium-severity recommendations caused the same 84 score on many
different PCs. The Configuration bar merely echoed that total, while empty process
and startup results were painted as healthy.

**How to apply:** Preserve explicit collection success and visible coverage when
changing probes or scoring. Explain the heuristic to users; do not claim it is a
benchmark or malware verdict. Compare historical scores only across matching scoring
policies and coverage, so a policy update or partial scan does not create a false alert.
