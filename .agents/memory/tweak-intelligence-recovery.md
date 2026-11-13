---
name: Tweak Intelligence recovery
description: Optional intelligence failures must stay quiet, preserve evidence, and recover without request-cancellation loops.
---

The user said the “Could not load system intel” banner “must never pop up.”
Performance Intelligence must not raise a repeated red error banner for optional
telemetry failures. Retain useful values and show an honest, quiet partial/stale/waiting
status instead; never label stale data Live or leave an endless loading spinner.

**Why:** A deliberately skipped posture request resolves to null during normal polling.
Treating every fulfilled result as a Response made healthy polls fail immediately
after Refresh. Fixed-interval polling could also cancel slow requests before completion.

**How to apply:** Treat skipped endpoint results as absent, not failures. Schedule polls
after completion, bound the entire request lifecycle, coalesce manual retries, back off
on failures, and ignore late responses after a parameter change or unmount. Preserve
request-generation ownership when releasing an old cancellation controller.
