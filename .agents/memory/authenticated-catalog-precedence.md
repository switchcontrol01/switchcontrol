---
name: Authenticated catalog precedence
description: Authenticated feature labels must be merged after public copy without allowing generic collisions to replace specific meanings.
---

Authenticated feature catalogs are merged after public and long-form catalogs. Generic collisions keep an existing translated value, while dashboard metric labels are applied last when the same source key has a different metric meaning.

**Why:** Public chart copy and account labels reuse short keys such as “Free”; applying catalogs in the wrong order silently changes the meaning of dashboard metrics.

**How to apply:** Preserve this merge order when adding feature catalogs, and add an explicit semantic key or narrowly scoped override when a short source key is genuinely ambiguous.