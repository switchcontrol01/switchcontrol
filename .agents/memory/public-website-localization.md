---
name: Public website localization
description: The boundary and verification rule for localized marketing copy on the public website.
---

Keep reviewed public marketing copy in an explicit locale catalog, separate from raw hardware, platform, and vendor data. Add regression coverage for representative hero, section, pricing, comparison, release, and footer keys so a locale change cannot silently leave the page in English.

**Why:** The DOM compatibility bridge intentionally falls back to the source text when a key is absent. Without catalog assertions, the language selector can change successfully while large parts of the public page remain English.

**How to apply:** When adding a public section, use `t()` for its copy where practical, add its reviewed strings to the locale catalog, and extend the locale test with the section's user-facing keys. Leave technical identifiers and raw hardware values untranslated.