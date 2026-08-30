---
name: Public website localization
description: The boundary and verification rule for localized marketing copy on the public website.
---

Keep reviewed public marketing copy in an explicit locale catalog, separate from raw hardware, platform, and vendor data. Maintain one canonical public-key inventory and require complete, non-English-fallback coverage for every supported locale.

**Why:** The DOM compatibility bridge intentionally falls back to the source text when a key is absent. Without catalog assertions, the language selector can change successfully while large parts of the public page remain English.

**How to apply:** When adding a public section, route every user-facing label through `t()`, add each key to the canonical inventory and every locale catalog, then run the all-locale coverage test. Semantic keys may use the English source fallback as a catalog lookup, so charts do not depend on the DOM bridge. Leave technical identifiers and raw hardware values untranslated.