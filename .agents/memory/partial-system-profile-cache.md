---
name: Partial system profile cache
description: Cache semantics for focused identity scans followed by full system-intelligence collection.
---

Focused identity collection is a partial profile, even when it contains valid motherboard, BIOS, and security values. It must not be marked fresh or treated as a complete inventory.

**Why:** A fresh timestamp causes the later full-profile request to return the partial snapshot immediately, leaving displays, storage, memory layout, and other sections empty while logging a false “full profile upgrade.”

**How to apply:** Keep partial results stale, make the page-triggered deep request explicit, and track full-profile readiness separately so retries stop after the first successful complete collection.