---
name: Account switch and premium revert boundary
description: Premium ownership is device-local and survives normal logout, but deleting SwitchControl AppData loses baselines and makes most expiry reverts fail-safe skips.
---

Premium ownership is intentionally device-scoped rather than account-scoped: normal logout clears auth state and browser storage only, so a later free login can still discover app-owned premium changes and run the expiry revert. Deleting `%APPDATA%\SwitchControl` removes the ownership and baseline files; after restart, ordinary tweak/slider/preset reverts cannot safely infer the user's original values and must skip rather than guess. The power-plan sanity path has separate detection and may still recover a SwitchControl-named active plan.

**Why:** Exact-value restoration must not overwrite a user’s unknown original registry state, but this means AppData deletion is a recoverability boundary rather than a guarantee that every premium tweak will be reverted.

**How to apply:** Describe normal account switching as preserved-system-state plus premium downgrade reversion; do not promise hard-fail-proof recovery after manual AppData deletion unless an independent protected audit/baseline store is added.