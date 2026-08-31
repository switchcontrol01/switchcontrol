---
name: Authenticated tweak catalog ordering
description: Shared tweak labels must win over generic public and dashboard labels.
---

Specific tweak-card controls and badges must be merged after the public, feature, and dashboard catalogs.

**Why:** Generic keys such as Premium, Admin, and Default can have different meanings on dashboard or public surfaces; merging them earlier silently replaces card-specific translations.

**How to apply:** When adding authenticated tweak copy, append its catalog merge after the final dashboard merge and cover at least one collision in the catalog regression test.