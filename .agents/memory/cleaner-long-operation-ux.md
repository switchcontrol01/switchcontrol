---
name: Cleaner long-operation UX
description: Reliability and user feedback rules for Windows filesystem cleanup operations.
---

Native cleaner operations may take tens of seconds for large cache selections even when they complete successfully. The active-clean state must show elapsed progress, explain that large caches can take longer, and provide cancellation that kills active child processes.

**Why:** A single indefinite spinner makes a healthy long-running cleanup look frozen. Separately, a failed result-persistence request can leave the UI in the cleaning phase forever if it only clears the boolean busy flag.

**How to apply:** Keep native cancellation wired to the active process set, update elapsed status while cleaning, and set a recoverable phase in every cloud persistence success/failure branch.

Confirmed behavior: Cleaner results must reflect the same measured totals used by the scan and must finish without unexplained item errors on a normal run.

**Why:** Users rely on the scan estimate matching the actual cleanup result; ambiguous or inflated error states undermine trust in an otherwise successful cleanup.