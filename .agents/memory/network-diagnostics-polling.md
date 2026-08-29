---
name: Network diagnostics polling
description: Live ping graphs must pace probes from completed responses and treat server cooldowns as backoff, not monitor failure.
---

Live network diagnostics should use response-aware scheduling rather than a fixed interval at the rate-limit boundary. A cooldown response is expected pacing feedback: retain the existing monitor state, wait beyond the advertised retry window, and try again.

**Why:** A fixed timer can fire slightly early or overlap a slow probe, producing a 429 that made a healthy graph look broken and left the UI stuck on an empty “Collecting data” state.

**How to apply:** Keep the first successful sample visible immediately, schedule the next probe after the current request settles, and reserve the visible error state for actual probe failures.