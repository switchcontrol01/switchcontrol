---
name: Partial system profile cache
description: Cache semantics for focused identity scans followed by full system-intelligence collection.
---

Focused identity collection is a partial profile, even when it contains valid motherboard, BIOS, and security values. It must not be marked fresh or treated as a complete inventory.

**Why:** A fresh timestamp causes the later full-profile request to return the partial snapshot immediately, leaving displays, storage, memory layout, and other sections empty while logging a false “full profile upgrade.”

**How to apply:** Keep partial results stale, make the page-triggered deep request explicit, and track full-profile readiness separately so retries stop after the first successful complete collection.

Confirmed behavior: fast cached hardware data should remain visible immediately, while AI Advisor and BIOS Advisor request focused identity data on page entry and update in place without remounting or requiring navigation away and back.

**Why:** This preserves the responsive cached-first experience while still making advanced motherboard, BIOS, and security details arrive promptly.