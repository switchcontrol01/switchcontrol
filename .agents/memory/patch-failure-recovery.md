---
name: Patch failure recovery
description: A failed multi-hunk patch may have applied earlier hunks.
---

A failed multi-hunk patch is not guaranteed to be atomic. Earlier hunks may already be present even when a later context match fails.

**Why:** A context mismatch left prior edits applied, so blindly retrying the full patch would have targeted stale file contents.

**How to apply:** After a failed patch, inspect the target file or its diff before retrying. Rebuild the patch against the current content, and prefer small, independently verifiable hunks.
